import { describe, it, expect, vi, beforeAll, afterAll } from "vitest";
import { eq } from "drizzle-orm";

/**
 * Prompt B, B-3 — o card Orçado x Realizado usa a MESMA conta da DRE:
 * Orçado = budget_line da versão budget; Realizado = despesas (não
 * canceladas, por competência) e receita da versão atual; Resultado = o
 * "Resultado Final" da cascata. Integração: só com DATABASE_URL.
 */
const HAS_DB = !!process.env.DATABASE_URL;
vi.mock("next/cache", () => ({ revalidatePath: () => {} }));
vi.mock("next/headers", () => ({ cookies: async () => ({ set: () => {}, delete: () => {} }) }));
vi.mock("@/lib/auth", () => ({ auth: async () => null, unstable_update: async () => null }));

describe.skipIf(!HAS_DB)("Prompt B · Orçado x Realizado = DRE", async () => {
  const { db, schema } = await import("@/lib/db");
  const { getOrcadoRealizado, versionInputs } = await import("./dre-inputs");
  const { waterfall } = await import("./calc/dre-cascata");
  const { ladoDe, montarCard } = await import("./calc/orcado-realizado");
  let tenantId = "";
  let projectId = "";
  let budgetId = "";
  let atualId = "";
  let vazioId = "";

  beforeAll(async () => {
    const [t] = await db.insert(schema.tenants).values({ name: "tenant-oxr" }).returning();
    tenantId = t.id;
    const [p] = await db.insert(schema.projects).values({ tenantId, name: "Obra OXR", status: "Em andamento" }).returning();
    projectId = p.id;
    const [b] = await db.insert(schema.versions).values({ tenantId, projectId, key: "budget", kind: "budget", label: "Budget", color: "#000" }).returning();
    budgetId = b.id;
    const [a] = await db.insert(schema.versions).values({ tenantId, projectId, key: "atual", kind: "atual", label: "Atual", color: "#000" }).returning();
    atualId = a.id;
    await db.insert(schema.budgetLines).values([
      { tenantId, versionId: budgetId, kind: "receita", rowKey: "Receita", dreCategory: "Receita", mes: "01/2026", valor: "1000" },
      { tenantId, versionId: budgetId, kind: "despesa", rowKey: "1", dreCategory: "Custo Fixo", mes: "01/2026", valor: "400" },
      { tenantId, versionId: budgetId, kind: "despesa", rowKey: "2", dreCategory: "Investimento", mes: "02/2026", valor: "100" },
    ]);
    await db.insert(schema.despesas).values([
      { tenantId, versionId: atualId, valor: "120", categoriaDre: "Custo Variável", competencia: "01/2026" },
      { tenantId, versionId: atualId, valor: "50", categoriaDre: "Despesa Fixa", competencia: "02/2026" },
      { tenantId, versionId: atualId, valor: "30", categoriaDre: "Receita", competencia: "02/2026" },
      { tenantId, versionId: atualId, valor: "999", categoriaDre: "Custo Fixo", competencia: "02/2026", cancelado: true },
    ]);
    const [v] = await db.insert(schema.projects).values({ tenantId, name: "Obra Vazia", status: "Planejamento" }).returning();
    vazioId = v.id;
    await db.insert(schema.versions).values([
      { tenantId, projectId: vazioId, key: "budget", kind: "budget", label: "Budget", color: "#000" },
      { tenantId, projectId: vazioId, key: "atual", kind: "atual", label: "Atual", color: "#000" },
    ]);
  });
  afterAll(async () => {
    if (tenantId) await db.delete(schema.tenants).where(eq(schema.tenants.id, tenantId));
  });

  it("orçado vem do budget_line; realizado da versão atual, sem a despesa cancelada", async () => {
    const e = await getOrcadoRealizado(tenantId, projectId);
    expect(e.versaoBudgetId).toBe(budgetId);
    expect(e.versaoAtualId).toBe(atualId);
    expect(e.orcado && ladoDe(e.orcado)).toEqual({ receita: 1000, custo: 500, resultado: 500 });
    expect(e.realizado && ladoDe(e.realizado)).toEqual({ receita: 30, custo: 170, resultado: -140 });
    const card = montarCard(e.orcado, e.realizado);
    expect(card.linhas.map((l) => [l.rotulo, l.execucao, l.tom])).toEqual([
      ["Receita", 3, "neutro"],
      ["Custos e despesas", 34, "bom"],
      ["Resultado", -28, "alerta"],
    ]);
  });

  it("os números são os da DRE para as mesmas versões", async () => {
    const e = await getOrcadoRealizado(tenantId, projectId);
    for (const [inputs, vid] of [[e.orcado, budgetId], [e.realizado, atualId]] as const) {
      const wf = waterfall([await versionInputs(tenantId, vid, projectId, null)]);
      const lado = ladoDe(inputs!);
      expect(lado.receita).toBe(Math.round(wf.R * 100) / 100);
      expect(lado.resultado).toBe(Math.round(wf.rows.find((r) => r.kind === "final")!.value * 100) / 100);
    }
  });

  it("sem orçamento lançado e sem lançamentos: null, não zero; outro tenant: null", async () => {
    const e = await getOrcadoRealizado(tenantId, vazioId);
    expect(e.orcado).toBeNull();
    expect(e.realizado).toBeNull();
    expect(e.versaoBudgetId).not.toBeNull();
    const fora = await getOrcadoRealizado("00000000-0000-0000-0000-000000000000", projectId);
    expect(fora).toEqual({ orcado: null, realizado: null, versaoBudgetId: null, versaoAtualId: null });
  });
});
