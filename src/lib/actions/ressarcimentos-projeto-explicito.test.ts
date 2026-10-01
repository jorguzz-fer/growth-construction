import { describe, it, expect, vi, beforeAll, afterAll } from "vitest";
import { and, eq } from "drizzle-orm";

/**
 * Prompt A, PR 6 — Ressarcimentos sem "projeto ativo". Despesa nova e
 * movimentos de caixa vão para a versão de trabalho da obra da tela; obras
 * informadas são validadas na empresa. Integração: só com DATABASE_URL.
 */
const HAS_DB = !!process.env.DATABASE_URL;
const ctxRef: { current: unknown } = { current: null };
vi.mock("@/lib/context", async (orig) => ({
  ...(await orig<typeof import("@/lib/context")>()),
  getTenantContext: async () => ctxRef.current,
}));
vi.mock("next/cache", () => ({ revalidatePath: () => {} }));
vi.mock("next/navigation", () => ({ redirect: () => {} }));
vi.mock("next/headers", () => ({ cookies: async () => ({ get: () => undefined }) }));
vi.mock("@/lib/auth", () => ({ auth: async () => null, unstable_update: async () => null }));
vi.mock("server-only", () => ({}));

describe.skipIf(!HAS_DB)("Ressarcimentos com obra explícita", async () => {
  const { db, schema } = await import("@/lib/db");
  const { defaultPermissions } = await import("@/lib/permissions");
  const { criarDespesaTerceiro, registrarRestituicao } = await import("./restituicoes");
  const { confirmarRestituicaoLote } = await import("./restituicao-lote");
  const { registrarRecebimentoTerceiro, registrarRepasse } = await import("./recebimento-terceiro");
  const tenants: string[] = [];
  let tA: typeof schema.tenants.$inferSelect;
  let socio = "";
  const p: Record<string, typeof schema.projects.$inferSelect> = {};
  const v: Record<string, typeof schema.versions.$inferSelect> = {};

  const fd = (campos: Record<string, string>) => {
    const f = new FormData();
    for (const [k, val] of Object.entries(campos)) f.set(k, val);
    return f;
  };
  const caixaDe = (versionId: string) =>
    db.select().from(schema.cashEntries).where(eq(schema.cashEntries.versionId, versionId));
  // Prompt T, 2.2 — a action só vincula lançamento existente (o modo "despesa
  // nova" saiu): a base aponta para uma despesa já lançada na obra 2.
  let despesaA2 = "";
  const base = () => ({
    pagadorTerceiroId: socio,
    despesaId: despesaA2,
    dataPagamentoOriginal: "09/01/2026",
    idempotencyKey: Math.random().toString(36),
  });

  beforeAll(async () => {
    [tA] = await db.insert(schema.tenants).values({ name: "ress-A" }).returning();
    const [tB] = await db.insert(schema.tenants).values({ name: "ress-B" }).returning();
    tenants.push(tA.id, tB.id);
    for (const [k, t, nome] of [
      ["a1", tA.id, "OBRA 1"],
      ["a2", tA.id, "OBRA 2"],
      ["b1", tB.id, "OBRA B"],
    ] as const) {
      [p[k]] = await db.insert(schema.projects).values({ tenantId: t, name: nome }).returning();
      [v[k]] = await db
        .insert(schema.versions)
        .values({ projectId: p[k].id, tenantId: t, key: "atual", kind: "atual", label: "Atual", color: "#000" })
        .returning();
    }
    const [s] = await db.insert(schema.stakeholders).values({ tenantId: tA.id, nome: "Sócio X" }).returning();
    socio = s.id;
    const [d] = await db.insert(schema.despesas).values({ tenantId: tA.id, versionId: v.a2.id, valor: "500", categoriaDre: "Custo Variável", competencia: "09/2026", status: "A pagar", numDoc: "PED-T2" }).returning();
    despesaA2 = d.id;
    ctxRef.current = {
      tenant: tA,
      projects: [p.a1, p.a2],
      userId: null,
      userEmail: null,
      role: "owner",
      perms: defaultPermissions("owner"),
    };
  });
  afterAll(async () => {
    for (const id of tenants) await db.delete(schema.tenants).where(eq(schema.tenants.id, id));
  });

  it("criarDespesaTerceiro sem obra ou com obra alheia: recusa, nada gravado", async () => {
    expect(await criarDespesaTerceiro(fd(base()))).toEqual({ ok: false, error: "Escolha o projeto." });
    expect(await criarDespesaTerceiro(fd({ ...base(), projectId: p.b1.id }))).toEqual({
      ok: false,
      error: "Escolha o projeto.",
    });
    const obs = await db.select().from(schema.despesaTerceiros).where(eq(schema.despesaTerceiros.tenantId, tA.id));
    expect(obs).toHaveLength(0);
  });

  it("criarDespesaTerceiro sem PED: recusa e aponta para Despesas (Prompt T, 2.2)", async () => {
    const r = await criarDespesaTerceiro(fd({ ...base(), despesaId: "", projectId: p.a2.id }));
    expect(r.ok).toBe(false);
    expect(r.error).toMatch(/lançada em Despesas/);
  });

  it("criarDespesaTerceiro: empresa responsável de outra empresa é recusada", async () => {
    const r = await criarDespesaTerceiro(
      fd({ ...base(), projectId: p.a1.id, empresaResponsavelId: p.b1.id }),
    );
    expect(r).toEqual({ ok: false, error: "Empresa responsável inválida." });
  });

  let obrigacaoId = "";
  it("criarDespesaTerceiro vincula o PED; sem empresa escolhida, a responsável é a obra da tela", async () => {
    const r = await criarDespesaTerceiro(fd({ ...base(), projectId: p.a2.id }));
    expect(r.ok).toBe(true);
    obrigacaoId = r.obrigacaoId!;
    const [dt] = await db.select().from(schema.despesaTerceiros).where(eq(schema.despesaTerceiros.id, obrigacaoId));
    expect(dt.empresaResponsavelId).toBe(p.a2.id);
    const [d] = await db.select().from(schema.despesas).where(eq(schema.despesas.id, dt.despesaId));
    expect(d.versionId).toBe(v.a2.id);
  });

  it("registrarRestituicao: saída de caixa na obra da tela; sem obra, recusa", async () => {
    const semObra = await registrarRestituicao({
      despesaTerceiroId: obrigacaoId,
      projectId: "",
      valor: 100,
      dataRestituicao: "09/20/2026",
    });
    expect(semObra).toEqual({ ok: false, error: "Escolha o projeto." });
    const r = await registrarRestituicao({
      despesaTerceiroId: obrigacaoId,
      projectId: p.a1.id,
      valor: 100,
      dataRestituicao: "09/20/2026",
      idempotencyKey: "rest-1",
    });
    expect(r.ok).toBe(true);
    const saidas = (await caixaDe(v.a1.id)).filter((c) => c.cat === "restituicao");
    expect(saidas).toHaveLength(1);
    expect(saidas[0].valor).toBe("-100.00");
  });

  it("confirmarRestituicaoLote: obra de outra empresa é recusada antes de gravar", async () => {
    const r = await confirmarRestituicaoLote({
      terceiroId: socio,
      projectId: p.b1.id,
      valor: 50,
      dataRestituicao: "09/21/2026",
    });
    expect(r).toEqual({ ok: false, error: "Escolha o projeto." });
    expect(await caixaDe(v.b1.id)).toHaveLength(0);
  });

  it("registrarRecebimentoTerceiro: sem obra ou obra alheia, recusa", async () => {
    const campos = { recebedorTerceiroId: socio, valor: "300", dataRecebimento: "09/10/2026" };
    expect(await registrarRecebimentoTerceiro(fd(campos))).toEqual({ ok: false, error: "Escolha o projeto." });
    expect(await registrarRecebimentoTerceiro(fd({ ...campos, projectId: p.b1.id }))).toEqual({
      ok: false,
      error: "Escolha o projeto.",
    });
    const rs = await db
      .select()
      .from(schema.recebimentosTerceiros)
      .where(eq(schema.recebimentosTerceiros.tenantId, tA.id));
    expect(rs).toHaveLength(0);
  });

  it("registrarRepasse: entrada de caixa exige a obra da tela", async () => {
    const r = await registrarRepasse({
      recebimentoTerceiroId: "00000000-0000-0000-0000-000000000000",
      projectId: "",
      valor: 10,
      dataRepasse: "09/22/2026",
    });
    expect(r).toEqual({ ok: false, error: "Escolha o projeto." });
    const entradas = await db
      .select()
      .from(schema.cashEntries)
      .where(and(eq(schema.cashEntries.tenantId, tA.id), eq(schema.cashEntries.cat, "repasse")));
    expect(entradas).toHaveLength(0);
  });
});
