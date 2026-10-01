import { describe, it, expect, vi, beforeAll, afterAll } from "vitest";
import { eq } from "drizzle-orm";

/**
 * Prompt AC, 12.1/12.2 — a página nova (séries por cenário, com a regra de
 * antes) devolve os MESMOS totais da página antiga (projectInputs por tipo).
 * Integração: só com DATABASE_URL.
 */
const HAS_DB = !!process.env.DATABASE_URL;
vi.mock("@/lib/context", async (orig) => ({ ...(await orig<typeof import("@/lib/context")>()), getTenantContext: async () => null }));
vi.mock("next/cache", () => ({ revalidatePath: () => {} }));
vi.mock("next/navigation", () => ({ redirect: () => {} }));
vi.mock("next/headers", () => ({ cookies: async () => ({ get: () => undefined }) }));
vi.mock("@/lib/auth", () => ({ auth: async () => null, unstable_update: async () => null }));
vi.mock("server-only", () => ({}));

describe.skipIf(!HAS_DB)("Prompt AC — DRE com os mesmos números", async () => {
  const { db, schema } = await import("@/lib/db");
  const { projectInputs, versionInputsByMonth } = await import("./dre-inputs");
  const { aggregateInputs, waterfall } = await import("./calc/dre-cascata");
  const { resolverCenario } = await import("./dre");
  const { getVersionsDoProjeto } = await import("./queries");
  let tenantId = "";
  const projetos: (typeof schema.projects.$inferSelect)[] = [];

  beforeAll(async () => {
    const [t] = await db.insert(schema.tenants).values({ name: "dre-AC" }).returning();
    tenantId = t.id;
    for (const [nome, kinds] of [["COM ORC", ["atual", "budget"]], ["SO ATUAL", ["atual"]]] as const) {
      const [p] = await db.insert(schema.projects).values({ tenantId, name: nome }).returning();
      projetos.push(p);
      for (const kind of kinds) {
        const [ver] = await db.insert(schema.versions).values({ projectId: p.id, tenantId, key: kind, kind, label: kind, color: "#000" }).returning();
        if (kind === "atual") {
          for (const [cat, valor, comp] of [["Custo Variável", "100", "01/2026"], ["Despesa Fixa", "40", "02/2026"], ["Receita", "500", "01/2026"], ["Custo Fixo", "7", null]] as const) {
            await db.insert(schema.despesas).values({ tenantId, versionId: ver.id, categoriaDre: cat, valor, competencia: comp, vencimento: "01/10/2026", status: "A pagar" } as never);
          }
        }
      }
    }
  });
  afterAll(async () => {
    await db.delete(schema.tenants).where(eq(schema.tenants.id, tenantId));
  });

  for (const cenario of ["atual", "budget", "forecast"] as const) {
    for (const periodo of [null, new Set(["01/2026"])]) {
      it(`Empresa toda · ${cenario} · ${periodo ? "01/2026" : "acumulado"}: mesmo resultado de antes`, async () => {
        const antes = waterfall(await Promise.all(projetos.map((p) => projectInputs(p, periodo, cenario))));
        const ps = await Promise.all(projetos.map(async (p) => ({ id: p.id, name: p.name, versoes: await getVersionsDoProjeto(tenantId, p.id) })));
        const res = resolverCenario(cenario, ps, true);
        const porProjeto = await Promise.all(res.filter((r) => r.versao).map((r) => versionInputsByMonth(tenantId, r.versao!.id, r.projetoId)));
        const depois = waterfall(porProjeto.map((bm) => aggregateInputs(bm, periodo)));
        expect(depois.rows.map((r) => r.value)).toEqual(antes.rows.map((r) => r.value));
      });
    }
  }
});
