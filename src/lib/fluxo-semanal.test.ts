import { describe, it, expect, vi, beforeAll, afterAll } from "vitest";
import { eq } from "drizzle-orm";

/**
 * Prompt AD2 — a visão semanal usa as MESMAS funções do Fluxo mensal, só com
 * outro balde: somadas, as semanas de um mês dão o mês. Integração: só com
 * DATABASE_URL.
 */
const HAS_DB = !!process.env.DATABASE_URL;
vi.mock("@/lib/context", async (orig) => ({ ...(await orig<typeof import("@/lib/context")>()), getTenantContext: async () => null }));
vi.mock("next/cache", () => ({ revalidatePath: () => {} }));
vi.mock("next/navigation", () => ({ redirect: () => {} }));
vi.mock("next/headers", () => ({ cookies: async () => ({ get: () => undefined }) }));
vi.mock("@/lib/auth", () => ({ auth: async () => null, unstable_update: async () => null }));
vi.mock("server-only", () => ({}));

describe.skipIf(!HAS_DB)("Prompt AD2 — Fluxo semanal (banco)", async () => {
  const { db, schema } = await import("@/lib/db");
  const { flowMaps, flowMapsRealizado } = await import("./fluxo-caixa");
  const { semanaDe } = await import("./calc/semana-caixa");
  let tenantId = "";
  let projectId = "";
  let budget: typeof schema.versions.$inferSelect;
  let atual: typeof schema.versions.$inferSelect;

  beforeAll(async () => {
    const [t] = await db.insert(schema.tenants).values({ name: "fluxo-semanal" }).returning();
    tenantId = t.id;
    const [p] = await db.insert(schema.projects).values({ tenantId, name: "OBRA" }).returning();
    projectId = p.id;
    [budget] = await db.insert(schema.versions).values({ projectId, tenantId, key: "budget", kind: "budget", label: "Orç", color: "#000" }).returning();
    [atual] = await db.insert(schema.versions).values({ projectId, tenantId, key: "atual", kind: "atual", label: "Atual", color: "#000" }).returning();
    // Despesas da Atual em dias diferentes de outubro e uma em novembro.
    for (const [venc, valor] of [["10/05/2026", "100"], ["10/15/2026", "200"], ["10/29/2026", "50"], ["11/03/2026", "70"]] as const) {
      await db.insert(schema.despesas).values({ tenantId, versionId: atual.id, vencimento: venc, competencia: venc.slice(0, 2) + "/2026", valor, status: "A pagar" } as never);
    }
    // Conta a receber lançada, com vencimento no meio do mês.
    await db.insert(schema.contasReceber).values({ tenantId, projectId, versionId: atual.id, valor: "500", vencimento: "10/20/2026", descricao: "parcela" } as never);
    // Caixa realizado.
    await db.insert(schema.cashEntries).values({ tenantId, versionId: atual.id, data: "10/14/2026", valor: "-180", descricao: "pago" } as never);
    // Linha de planejamento: só competência.
    await db.insert(schema.budgetLines).values({ tenantId, versionId: budget.id, kind: "receita", rowKey: "obra", mes: "11/2026", valor: "900" } as never);
  });
  afterAll(async () => {
    await db.delete(schema.tenants).where(eq(schema.tenants.id, tenantId));
  });

  it("semana a semana: cada valor cai na semana da sua data", async () => {
    const s = await flowMaps(atual, projectId, { bucket: semanaDe });
    expect(s.saidas).toMatchObject({ "2026-10-05": 100, "2026-10-12": 200, "2026-10-26": 50, "2026-11-02": 70 });
    expect(s.entradas["2026-10-19"]).toBe(500);
  });

  it("o total do horizonte é o mesmo no mensal e no semanal", async () => {
    const m = await flowMaps(atual, projectId);
    const s = await flowMaps(atual, projectId, { bucket: semanaDe });
    const t = (x: Record<string, number>) => Object.values(x).reduce((a, v) => a + v, 0);
    expect(t(s.saidas)).toBe(t(m.saidas));
    expect(t(s.entradas)).toBe(t(m.entradas));
    expect(m.saidas["10/2026"]).toBe(350);
    // As três semanas de outubro somam o mês.
    expect(s.saidas["2026-10-05"] + s.saidas["2026-10-12"] + s.saidas["2026-10-26"]).toBe(m.saidas["10/2026"]);
  });

  it("realizado pela data de liquidação, na semana dela", async () => {
    const r = await flowMapsRealizado(atual.id, semanaDe);
    expect(r.saidas).toEqual({ "2026-10-12": 180 });
  });

  it("competência sem dia (planejamento) cai na semana do dia 1º", async () => {
    const s = await flowMaps(budget, projectId, { bucket: semanaDe });
    expect(s.entradas).toEqual({ [semanaDe("11/01/2026")!]: 900 });
  });
});
