import { describe, it, expect, vi, beforeAll, afterAll } from "vitest";
import { and, eq } from "drizzle-orm";

/**
 * Prompt I, PR I-7b — §21 (saída segue a despesa, atrás de chave) e §26
 * (uma lógica só para a conta corrente). Integração: só com DATABASE_URL.
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

describe.skipIf(!HAS_DB)("Terceiros — saída segue a despesa e conta corrente única (Prompt I, PR I-7b)", async () => {
  const { db, schema } = await import("@/lib/db");
  const { defaultPermissions } = await import("@/lib/permissions");
  const { addDespesa } = await import("./despesas");
  const { criarDespesaTerceiro, registrarRestituicao, cancelarRestituicao, getContaCorrenteTerceiros, getPreviaSaidaPorObra } = await import("./restituicoes");
  const { compensarSaldos } = await import("./restituicao-lote");
  const { registrarRepasse, getSaldosConsolidadosTerceiros } = await import("./recebimento-terceiro");
  const { definirChave } = await import("./chaves");
  let tenantId = "";
  let obraA = "";
  let obraB = "";
  let versaoA = "";
  let versaoB = "";
  let socioId = "";
  let n = 0;
  const fd = (campos: Record<string, string>) => {
    const f = new FormData();
    for (const [k, v] of Object.entries(campos)) f.set(k, v);
    return f;
  };
  const novaDespesaEm = async (projectId: string, valor: string) => {
    const r = await addDespesa(fd({ projectId, categoriaDre: "Custo Variável", valor, competencia: "09/2026", vencimento: "09/30/2026" }));
    if (!r.ok) throw new Error((r as { error: string }).error);
    return (r as { id: string }).id;
  };
  const vincular = async (projectId: string, despesaId: string) => {
    const r = await criarDespesaTerceiro(fd({ projectId, despesaId, pagadorTerceiroId: socioId, dataPagamentoOriginal: "09/01/2026", idempotencyKey: `ob-${++n}` }));
    if (!r.ok) throw new Error(r.error);
    return r.obrigacaoId!;
  };
  const caixa = (descricao: string) =>
    db.select().from(schema.cashEntries).where(and(eq(schema.cashEntries.tenantId, tenantId), eq(schema.cashEntries.descricao, descricao)));
  const ligar = (ligar: boolean) => definirChave(fd({ chave: "restituicao_segue_despesa", ligar: ligar ? "1" : "0", viPrevia: "on" }));

  beforeAll(async () => {
    const [t] = await db.insert(schema.tenants).values({ name: "terc-I7b" }).returning();
    tenantId = t.id;
    const [a] = await db.insert(schema.projects).values({ tenantId, name: "OBRA A" }).returning();
    const [b] = await db.insert(schema.projects).values({ tenantId, name: "OBRA B" }).returning();
    obraA = a.id;
    obraB = b.id;
    for (const [pid, set] of [[obraA, (v: string) => (versaoA = v)], [obraB, (v: string) => (versaoB = v)]] as const) {
      const [v] = await db.insert(schema.versions).values({ projectId: pid, tenantId, key: "atual", kind: "atual", label: "Atual", color: "#000" }).returning();
      set(v.id);
    }
    const [s] = await db.insert(schema.stakeholders).values({ tenantId, nome: "Sócio B11", papeis: ["Sócio/Quotista"] }).returning();
    socioId = s.id;
    ctxRef.current = { tenant: t, projects: [a, b], userId: null, userEmail: "quem@teste", role: "owner", perms: defaultPermissions("owner") };
  });
  afterAll(async () => {
    if (tenantId) await db.delete(schema.tenants).where(eq(schema.tenants.id, tenantId));
  });

  it("§21 — chave desligada: a saída cai na obra da tela (como hoje); ligada: na obra da despesa, e o estorno também", async () => {
    // Despesa da obra A; a tela está na obra B.
    const obA = await vincular(obraA, await novaDespesaEm(obraA, "100"));
    const r1 = await registrarRestituicao({ despesaTerceiroId: obA, projectId: obraB, valor: 40, dataRestituicao: "09/10/2026", idempotencyKey: `rs-${++n}` });
    expect(r1.ok).toBe(true);
    let saidas = await caixa("Restituição a terceiro");
    expect(saidas.map((c) => c.versionId)).toEqual([versaoB]);

    expect(await ligar(true)).toEqual({ ok: true });
    const previa = await getPreviaSaidaPorObra(tenantId);
    expect(previa).toEqual([{ projectId: obraA, projectName: "OBRA A", obrigacoes: 1, saldo: 60 }]);
    const r2 = await registrarRestituicao({ despesaTerceiroId: obA, projectId: obraB, valor: 60, dataRestituicao: "09/11/2026", idempotencyKey: `rs-${++n}` });
    expect(r2.ok).toBe(true);
    saidas = await caixa("Restituição a terceiro");
    expect(saidas.map((c) => c.versionId).sort()).toEqual([versaoA, versaoB].sort());
    // Estorno da segunda: cai na obra da despesa (A), mesmo com a tela em B.
    expect(await cancelarRestituicao(r2.restituicaoId!, obraB, "teste")).toEqual({ ok: true });
    const estornos = await caixa("Estorno de restituição");
    expect(estornos.map((c) => c.versionId)).toEqual([versaoA]);
    // Versão da despesa congelada bloqueia com a chave ligada.
    await db.update(schema.versions).set({ locked: true }).where(eq(schema.versions.id, versaoA));
    const r3 = await registrarRestituicao({ despesaTerceiroId: obA, projectId: obraB, valor: 10, dataRestituicao: "09/12/2026", idempotencyKey: `rs-${++n}` });
    expect(r3.error).toMatch(/congelada/);
    await db.update(schema.versions).set({ locked: false }).where(eq(schema.versions.id, versaoA));
    expect(await ligar(false)).toEqual({ ok: true });
  });

  it("§21 — repasse: desligada, obra da tela; ligada, Atual da obra do recebimento", async () => {
    const [rec] = await db.insert(schema.recebimentosTerceiros).values({ tenantId, recebedorTerceiroId: socioId, projectId: obraA, valorTotal: "50" }).returning();
    expect((await registrarRepasse({ recebimentoTerceiroId: rec.id, projectId: obraB, valor: 20, dataRepasse: "09/15/2026", idempotencyKey: `rp-${++n}` })).ok).toBe(true);
    expect((await caixa("Repasse de terceiro")).map((c) => c.versionId)).toEqual([versaoB]);
    await ligar(true);
    expect((await registrarRepasse({ recebimentoTerceiroId: rec.id, projectId: obraB, valor: 10, dataRepasse: "09/16/2026", idempotencyKey: `rp-${++n}` })).ok).toBe(true);
    expect((await caixa("Repasse de terceiro")).map((c) => c.versionId).sort()).toEqual([versaoA, versaoB].sort());
    await ligar(false);
  });

  it("§26 — a conta corrente inclui compensação, recebimento, repasse e estorno, e bate com os saldos por obrigação", async () => {
    // Estado até aqui para o sócio: desembolso 100, restituição 40 (a 60 foi
    // cancelada → par saída/estorno); recebimento 50, repasses 20 + 10.
    const k = await compensarSaldos({ terceiroId: socioId, data: "09/20/2026", idempotencyKey: `k-${++n}` });
    expect(k.ok).toBe(true);
    expect(k.valor).toBe(20); // min(a restituir 60, a repassar 20)
    const [conta] = await getContaCorrenteTerceiros(tenantId);
    expect(conta.pagadorId).toBe(socioId);
    expect(conta.movimentos.map((m) => m.tipo)).toEqual(
      expect.arrayContaining(["desembolso", "restituicao", "estorno", "recebimento", "repasse", "compensacao"]),
    );
    expect(conta.totalRestituido).toBe(40);
    expect(conta.totalCompensado).toBe(20);
    expect(conta.saldoDevido).toBe(40);
    expect(conta.saldoARepassar).toBe(0);
    // Reconcilia com a visão por obrigação (valorTotal − valorRestituido), que inclui a compensação.
    const [consolidado] = await getSaldosConsolidadosTerceiros(tenantId);
    expect(consolidado.saldoARestituir).toBe(conta.saldoDevido);
    expect(consolidado.saldoARepassar).toBe(conta.saldoARepassar);
    const ultimo = conta.movimentos[conta.movimentos.length - 1];
    expect(ultimo.saldoAcumulado).toBe(40);
    expect(ultimo.saldoRepassarAcumulado).toBe(0);
  });
});
