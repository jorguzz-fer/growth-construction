import { describe, it, expect, vi, beforeAll, afterAll } from "vitest";
import { eq } from "drizzle-orm";

/**
 * Prompt RC — as colunas do relatório saem das mesmas funções da DRE e do
 * Fluxo: o Resultado por cenário bate com a cascata da DRE, as colunas por mês
 * e por obra somam o total, e o Fluxo bate com `flowMaps`. Integração: só com
 * DATABASE_URL.
 */
const HAS_DB = !!process.env.DATABASE_URL;
vi.mock("next/cache", () => ({ revalidatePath: () => {} }));
vi.mock("next/headers", () => ({ cookies: async () => ({ get: () => undefined }) }));
vi.mock("@/lib/auth", () => ({ auth: async () => null, unstable_update: async () => null }));
vi.mock("server-only", () => ({}));

describe.skipIf(!HAS_DB)("Prompt RC — colunas do relatório (banco)", async () => {
  const { db, schema } = await import("@/lib/db");
  const { colunasDoRelatorio } = await import("./relatorio-custom-dados");
  const { montarTabela, receitaValida } = await import("./relatorio-custom");
  const { versionInputsByMonth } = await import("./dre-inputs");
  const { aggregateInputs, waterfall } = await import("./calc/dre-cascata");
  let tenantId = "";
  let projetos: (typeof schema.projects.$inferSelect)[] = [];
  const atuais: string[] = [];

  beforeAll(async () => {
    const [t] = await db.insert(schema.tenants).values({ name: "tenant-prompt-rc" }).returning();
    tenantId = t.id;
    projetos = await db.insert(schema.projects).values([{ tenantId, name: "Obra A" }, { tenantId, name: "Obra B" }]).returning();
    for (const [i, p] of projetos.entries()) {
      const [v] = await db.insert(schema.versions).values({ tenantId, projectId: p.id, key: "atual", kind: "atual", label: "Atual", color: "#000", isDefault: true }).returning();
      atuais.push(v.id);
      await db.insert(schema.despesas).values([
        { tenantId, versionId: v.id, categoriaDre: "Custo Variável", valor: String(100 * (i + 1)), competencia: "09/2026", vencimento: "09/10/2026", status: "A pagar" },
        { tenantId, versionId: v.id, categoriaDre: "Despesa Fixa", valor: "50", competencia: "10/2026", vencimento: "10/10/2026", status: "A pagar" },
      ]);
    }
  });
  afterAll(async () => {
    if (tenantId) await db.delete(schema.tenants).where(eq(schema.tenants.id, tenantId));
  });

  it("por cenário: o Resultado é o da cascata da DRE das duas obras", async () => {
    const r = receitaValida({ fonte: "dre", colunas: "cenario", cenarios: "atual" }, projetos.map((p) => p.id));
    const d = await colunasDoRelatorio(tenantId, projetos, r);
    const t = montarTabela("dre", d.colunas, d.contas, false);
    const dre = waterfall(await Promise.all(projetos.map(async (p, i) => aggregateInputs(await versionInputsByMonth(tenantId, atuais[i], p.id), null))));
    expect(t.linhas.find((l) => l.id === "final")!.valores[0]).toBeCloseTo(dre.rows.at(-1)!.value, 2);
    expect(d.avisos).toEqual([]);
  });

  it("por obra e por mês: as colunas somam o total", async () => {
    for (const colunas of ["obra", "mes"] as const) {
      const r = receitaValida({ fonte: "dre", colunas, cenarios: "atual", de: "09/2026", ate: "10/2026" }, projetos.map((p) => p.id));
      const d = await colunasDoRelatorio(tenantId, projetos, r);
      const t = montarTabela("dre", d.colunas, d.contas, false);
      const final = t.linhas.find((l) => l.id === "final")!.valores;
      expect(t.colunas.at(-1)).toBe("Total");
      expect(final.slice(0, -1).reduce((a, x) => a + x, 0)).toBeCloseTo(final.at(-1)!, 2);
      expect(final.at(-1)).toBeCloseTo(-400, 2);
    }
  });

  it("Fluxo por obra: as saídas são as do vencimento; obra sem o cenário fica fora com aviso", async () => {
    const r = receitaValida({ fonte: "fluxo", colunas: "obra", cenarios: "atual" }, projetos.map((p) => p.id));
    const d = await colunasDoRelatorio(tenantId, projetos, r);
    expect(d.colunas.map((c) => c.fluxo!.saidas)).toEqual([150, 250, 400]);
    const orc = await colunasDoRelatorio(tenantId, projetos, receitaValida({ fonte: "dre", colunas: "cenario", cenarios: "budget" }, []));
    expect(orc.avisos.join(" ")).toMatch(/Orçamento/);
  });
});
