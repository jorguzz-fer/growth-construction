import { describe, it, expect, vi, beforeAll, afterAll } from "vitest";
import { eq } from "drizzle-orm";

/** Prompt AC, Parte 10 — a chave "dre_definicao_nova". Integração: só com DATABASE_URL. */
const HAS_DB = !!process.env.DATABASE_URL;
vi.mock("@/lib/context", async (orig) => ({ ...(await orig<typeof import("@/lib/context")>()), getTenantContext: async () => null }));
vi.mock("next/cache", () => ({ revalidatePath: () => {} }));
vi.mock("next/navigation", () => ({ redirect: () => {} }));
vi.mock("next/headers", () => ({ cookies: async () => ({ get: () => undefined }) }));
vi.mock("@/lib/auth", () => ({ auth: async () => null, unstable_update: async () => null }));
vi.mock("server-only", () => ({}));

describe.skipIf(!HAS_DB)("Prompt AC — DRE pela definição nova (chave)", async () => {
  const { db, schema } = await import("@/lib/db");
  const { versionInputsByMonth, foraDaCascataDaVersao, previaDreDefinicaoNova } = await import("./dre-inputs");
  const { aggregateInputs, waterfall } = await import("./calc/dre-cascata");
  let tenantId = "";
  let projectId = "";
  let vid = "";

  beforeAll(async () => {
    const [t] = await db.insert(schema.tenants).values({ name: "dre-chave" }).returning();
    tenantId = t.id;
    const [p] = await db.insert(schema.projects).values({ tenantId, name: "OBRA" }).returning();
    projectId = p.id;
    const [v] = await db.insert(schema.versions).values({ projectId, tenantId, key: "atual", kind: "atual", label: "Atual", color: "#000" }).returning();
    vid = v.id;
    const nova = async (categoriaDre: string, valor: string, competencia: string) =>
      (await db.insert(schema.despesas).values({ tenantId, versionId: vid, categoriaDre, valor, competencia, vencimento: "01/10/2026", status: "Pago", numDoc: `PED-${categoriaDre}` } as never).returning())[0];
    const d = await nova("Custo Fixo", "1000", "01/2026");
    await nova("Receita", "300", "01/2026");
    // pago em março, competência janeiro: o encargo muda de mês com a chave
    await db.insert(schema.pagamentos).values({ tenantId, despesaId: d.id, dataPagamento: "03/15/2026", valorOriginal: "1000", multa: "20", juros: "5", valorTotalPago: "1025" } as never);
  });
  afterAll(async () => {
    await db.delete(schema.tenants).where(eq(schema.tenants.id, tenantId));
  });

  it("21 — chave desligada: o mesmo cálculo de antes (encargo no mês do pagamento; Receita de despesa na receita)", async () => {
    const bm = await versionInputsByMonth(tenantId, vid, projectId);
    expect(bm["01/2026"].receita).toBe(300);
    expect(bm["03/2026"].byCat["Despesas Financeiras"]).toBe(25);
    expect(bm["01/2026"].byCat["Despesas Financeiras"]).toBeUndefined();
  });

  it("2 e 3.1 — chave ligada: Receita de despesa sai e é listada; encargo vai para a competência da despesa", async () => {
    const bm = await versionInputsByMonth(tenantId, vid, projectId, { definicaoNova: true });
    expect(bm["01/2026"].receita).toBe(0);
    expect(bm["01/2026"].byCat["Despesas Financeiras"]).toBe(25);
    expect(bm["03/2026"]).toBeUndefined();
    const fora = await foraDaCascataDaVersao(vid, { definicaoNova: true });
    expect(fora.comoReceita).toEqual({ qtd: 1, valor: 300 });
    // o acumulado só muda pela receita retirada (o encargo só troca de mês)
    const rf = (x: typeof bm) => waterfall([aggregateInputs(x, null)]).rows.find((r) => r.kind === "final")!.value;
    expect(rf(await versionInputsByMonth(tenantId, vid, projectId)) - rf(bm)).toBe(300);
  });

  it("10.3 — a prévia mostra hoje, novo, os meses que mudam e o lançamento que sai da receita", async () => {
    const [p] = await previaDreDefinicaoNova(tenantId, [{ id: projectId, name: "OBRA" }]);
    expect(p.hoje - p.nova).toBe(300);
    expect(p.meses.map((m) => m.mes).sort()).toEqual(["01/2026", "03/2026"]);
    expect(p.comoReceita).toEqual([{ numDoc: "PED-Receita", competencia: "01/2026", valor: 300 }]);
    expect(p.semCenario).toEqual(["budget", "forecast"]);
  });

  it("23 — nada foi gravado: as despesas continuam como estavam", async () => {
    const ds = await db.select().from(schema.despesas).where(eq(schema.despesas.tenantId, tenantId));
    expect(ds.map((d) => d.categoriaDre).sort()).toEqual(["Custo Fixo", "Receita"]);
  });
});
