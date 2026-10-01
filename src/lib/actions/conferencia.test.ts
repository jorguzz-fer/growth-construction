import { describe, it, expect, vi, beforeAll, afterAll } from "vitest";
import { and, eq } from "drizzle-orm";

/**
 * Prompt AN, Partes 1, 2 e 4 — quarta condição, triagem no SQL, transação no
 * lote, filtros e paginação. Integração: só com DATABASE_URL.
 */
const HAS_DB = !!process.env.DATABASE_URL;
const ctxRef: { current: unknown } = { current: null };
const falha: { naChamada: number; chamadas: number } = { naChamada: 0, chamadas: 0 };
vi.mock("@/lib/context", async (orig) => ({
  ...(await orig<typeof import("@/lib/context")>()),
  getTenantContext: async () => ctxRef.current,
}));
vi.mock("@/lib/audit", async (orig) => {
  const real = await orig<typeof import("@/lib/audit")>();
  return {
    ...real,
    logAudit: async (...a: Parameters<typeof real.logAudit>) => {
      falha.chamadas++;
      if (falha.naChamada && falha.chamadas === falha.naChamada) throw new Error("falha simulada no meio do lote");
      return real.logAudit(...a);
    },
  };
});
vi.mock("next/cache", () => ({ revalidatePath: () => {} }));
vi.mock("next/navigation", () => ({ redirect: () => {} }));
vi.mock("next/headers", () => ({ cookies: async () => ({ get: () => undefined }) }));
vi.mock("@/lib/auth", () => ({ auth: async () => null, unstable_update: async () => null }));
vi.mock("server-only", () => ({}));

describe.skipIf(!HAS_DB)("Prompt AN — Conferência de lançamentos", async () => {
  const { db, schema } = await import("@/lib/db");
  const { defaultPermissions } = await import("@/lib/permissions");
  const { getAnaliseConferencia, getDespesasSuspeitas, reclassificarDespesas, reclassificarItens } = await import("./diagnostico");
  let tenantId = "";
  let projA = "";
  let projB = "";
  let forn1 = "";
  let forn2 = "";
  const ids: Record<string, string> = {};

  beforeAll(async () => {
    const [t] = await db.insert(schema.tenants).values({ name: "conf-AN" }).returning();
    tenantId = t.id;
    const [a] = await db.insert(schema.projects).values({ tenantId, name: "OBRA A" }).returning();
    const [b] = await db.insert(schema.projects).values({ tenantId, name: "OBRA B" }).returning();
    projA = a.id;
    projB = b.id;
    const [va] = await db.insert(schema.versions).values({ projectId: a.id, tenantId, key: "atual", kind: "atual", label: "Atual", color: "#000" }).returning();
    const [vb] = await db.insert(schema.versions).values({ projectId: b.id, tenantId, key: "atual", kind: "atual", label: "Atual", color: "#000" }).returning();
    const [f1] = await db.insert(schema.stakeholders).values({ tenantId, nome: "ABC Materiais" }).returning();
    const [f2] = await db.insert(schema.stakeholders).values({ tenantId, nome: "Caixa Econômica" }).returning();
    forn1 = f1.id;
    forn2 = f2.id;
    const nova = async (nome: string, v: Record<string, unknown>) => {
      const [d] = await db
        .insert(schema.despesas)
        .values({ tenantId, versionId: va.id, valor: "100", categoriaDre: "Custo Variável", competencia: "09/2026", vencimento: "09/10/2026", status: "A pagar", obs: nome, numDoc: `PED-${nome}`, ...v } as never)
        .returning();
      ids[nome] = d.id;
    };
    await nova("ok", {});
    await nova("credora", { categoriaDre: "Receita", valor: "500", fornecedorId: forn1 });
    await nova("semcat", { categoriaDre: null, valor: "400", fornecedorId: forn2 });
    await nova("zero", { valor: "0", fornecedorId: forn1 });
    await nova("semcomp", { competencia: null, valor: "300", fornecedorId: forn1 });
    await nova("brancos", { competencia: "   ", valor: "200", versionId: vb.id, fornecedorId: forn2 });
    await nova("cancelada-semcomp", { competencia: null, cancelado: true });
    await nova("cancelada-zero", { valor: "0", cancelado: true, competencia: "08/2026" });
    await nova("varios", { categoriaDre: null, valor: "0", competencia: "" });
    ctxRef.current = { tenant: t, projects: [a, b], userId: null, userEmail: "quem@teste", role: "owner", perms: defaultPermissions("owner") };
  });
  afterAll(async () => {
    await db.delete(schema.tenants).where(eq(schema.tenants.id, tenantId));
  });

  it("1/2/3/13 — a triagem no SQL traz só quem tem motivo, sem duplicar, com a quarta condição", async () => {
    const p = await getDespesasSuspeitas();
    const nomes = p.rows.map((r) => r.obs).sort();
    expect(nomes).toEqual(["brancos", "cancelada-zero", "credora", "semcat", "semcomp", "varios", "zero"].sort());
    expect(p.rows.find((r) => r.obs === "semcomp")!.motivos.map((m) => m.texto)).toEqual(["sem competência — fica fora da DRE por mês e por ano"]);
    expect(p.rows.find((r) => r.obs === "varios")!.motivos.map((m) => m.codigo)).toEqual(["sem_categoria", "valor_zero", "sem_competencia"]);
    expect(new Set(p.rows.map((r) => r.id)).size).toBe(p.rows.length);
    // ordem: maior valor primeiro
    expect(p.rows[0].obs).toBe("credora");
  });

  it("15 — total e soma são do conjunto inteiro, não da página", async () => {
    const p = await getDespesasSuspeitas({ limite: 2 });
    expect(p.rows).toHaveLength(2);
    expect(p.totalGeral).toBe(7);
    expect(p.somaGeral).toBe(500 + 400 + 0 + 300 + 200 + 0 + 0);
    expect(p.total).toBe(7);
    expect(p.proximoCursor).toBeTruthy();
  });

  it("4.3 — a paginação por cursor percorre tudo sem repetir nem pular", async () => {
    const vistos: string[] = [];
    let cursor: string | null = null;
    for (let i = 0; i < 10; i++) {
      const p = await getDespesasSuspeitas({ limite: 3, cursor });
      vistos.push(...p.rows.map((r) => r.id));
      cursor = p.proximoCursor;
      if (!cursor) break;
    }
    expect(vistos).toHaveLength(7);
    expect(new Set(vistos).size).toBe(7);
  });

  it("14 — filtros por projeto, competência e fornecedor", async () => {
    expect((await getDespesasSuspeitas({ projectId: projB })).rows.map((r) => r.obs)).toEqual(["brancos"]);
    expect((await getDespesasSuspeitas({ projectId: projA })).total).toBe(6);
    expect((await getDespesasSuspeitas({ competencia: "8/2026" })).rows.map((r) => r.obs)).toEqual(["cancelada-zero"]);
    const f = await getDespesasSuspeitas({ fornecedorId: forn1 });
    expect(f.rows.map((r) => r.obs).sort()).toEqual(["credora", "semcomp", "zero"]);
    expect(f.total).toBe(3);
    expect(f.totalGeral).toBe(7);
    expect(f.fornecedores.map((x) => x.nome)).toEqual(["ABC Materiais", "Caixa Econômica"]);
  });

  it("6 — falha no meio do lote não deixa nada reclassificado nem registrado", async () => {
    falha.chamadas = 0;
    falha.naChamada = 2;
    const alvo = [ids.credora, ids.semcat, ids.zero];
    const r = await reclassificarDespesas(alvo, "Custo Fixo");
    falha.naChamada = 0;
    expect(r.ok).toBe(false);
    expect(r.error).toMatch(/desfeita por inteiro/);
    const depois = await db.select().from(schema.despesas).where(eq(schema.despesas.tenantId, tenantId));
    expect(depois.find((d) => d.id === ids.credora)!.categoriaDre).toBe("Receita");
    expect(depois.find((d) => d.id === ids.semcat)!.categoriaDre).toBeNull();
    const logs = await db.select().from(schema.auditLog).where(and(eq(schema.auditLog.tenantId, tenantId), eq(schema.auditLog.action, "despesa.reclassificar")));
    expect(logs).toHaveLength(0);
  });

  it("7/8/9/24 — três números; cancelada e já-na-categoria pulam, sem log; cada alteração tem log com de→para, numDoc e origem", async () => {
    const r = await reclassificarDespesas([ids.credora, ids.semcat, ids["cancelada-zero"], ids.ok], "Custo Variável");
    expect(r.ok).toBe(true);
    expect(r.selecionadas).toBe(4);
    expect(r.alteradas).toBe(2);
    expect(r.puladas!.map((p) => p.motivo).sort()).toEqual(["cancelada", "ja_na_categoria"]);
    const logs = await db.select().from(schema.auditLog).where(and(eq(schema.auditLog.tenantId, tenantId), eq(schema.auditLog.action, "despesa.reclassificar")));
    expect(logs).toHaveLength(2);
    const m = logs.find((l) => l.entityId === ids.credora)!.meta as { changes: Record<string, { de: unknown; para: unknown }>; origem: string; numDoc: string };
    expect(m.changes.categoriaDre).toEqual({ de: "Receita", para: "Custo Variável" });
    expect(m.origem).toBe("diagnostico/categorias-invertidas");
    expect(m.numDoc).toBe("PED-credora");
  });

  it("10/23 — categoria credora recusada no servidor; só categoria_dre mudou", async () => {
    const r = await reclassificarDespesas([ids.zero], "Receita");
    expect(r.ok).toBe(false);
    const [d] = await db.select().from(schema.despesas).where(eq(schema.despesas.id, ids.credora));
    expect({ valor: d.valor, competencia: d.competencia, vencimento: d.vencimento, status: d.status, numDoc: d.numDoc }).toEqual({ valor: "500.00", competencia: "09/2026", vencimento: "09/10/2026", status: "A pagar", numDoc: "PED-credora" });
  });

  it("3.1 — cada linha com o seu destino, numa chamada só", async () => {
    const r = await reclassificarItens([
      { id: ids.zero, categoriaDre: "Despesa Fixa" },
      { id: ids.semcomp, categoriaDre: "Custo Fixo" },
    ]);
    expect(r).toMatchObject({ ok: true, selecionadas: 2, alteradas: 2 });
    const ds = await db.select().from(schema.despesas).where(eq(schema.despesas.tenantId, tenantId));
    expect(ds.find((d) => d.id === ids.zero)!.categoriaDre).toBe("Despesa Fixa");
    expect(ds.find((d) => d.id === ids.semcomp)!.categoriaDre).toBe("Custo Fixo");
    expect(ds.find((d) => d.id === ids.semcomp)!.competencia).toBeNull();
  });

  it("10 — uma categoria credora em qualquer item recusa o pedido inteiro, antes de gravar", async () => {
    const r = await reclassificarItens([
      { id: ids.brancos, categoriaDre: "Custo Fixo" },
      { id: ids.varios, categoriaDre: "Receita" },
    ]);
    expect(r.ok).toBe(false);
    const [d] = await db.select().from(schema.despesas).where(eq(schema.despesas.id, ids.brancos));
    expect(d.categoriaDre).toBe("Custo Variável");
  });

  it("o mesmo lançamento com dois destinos é recusado", async () => {
    const r = await reclassificarItens([
      { id: ids.brancos, categoriaDre: "Custo Fixo" },
      { id: ids.brancos, categoriaDre: "Despesa Fixa" },
    ]);
    expect(r).toMatchObject({ ok: false, error: expect.stringMatching(/duas categorias/) });
  });

  it("7.3 — o assistente lê o conjunto inteiro do tenant e não grava nada", async () => {
    const antes = await db.select().from(schema.despesas).where(eq(schema.despesas.tenantId, tenantId));
    const a = (await getAnaliseConferencia())!;
    const p = await getDespesasSuspeitas();
    const ativas = p.rows.filter((r) => !r.motivos.some((m) => m.codigo === "cancelado")).length;
    expect(a.total).toBe(ativas);
    const depois = await db.select().from(schema.despesas).where(eq(schema.despesas.tenantId, tenantId));
    expect(depois).toEqual(antes);
  });

  it("sem permissão de ver Despesas, nada sai", async () => {
    const antes = ctxRef.current;
    ctxRef.current = { ...(antes as object), role: "engenheiro", perms: defaultPermissions("engenheiro") };
    const p = await getDespesasSuspeitas();
    expect(await getAnaliseConferencia()).toBeNull();
    ctxRef.current = antes;
    expect(p.rows).toEqual([]);
    expect(p.totalGeral).toBe(0);
  });
});
