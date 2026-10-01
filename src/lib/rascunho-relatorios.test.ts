import { describe, it, expect, vi, beforeAll, afterAll } from "vitest";
import { eq } from "drizzle-orm";

/**
 * Prompt H, seção 8 — filtro por situação nas leituras de `budget_line`.
 * Chave desligada: números idênticos aos de antes. Chave ligada: Orçamento e
 * Previsão fora de Aprovado somem das leituras de relatório; Aprovado volta;
 * a versão Atual nunca é filtrada; `getBudgetLines` só filtra quando pedido.
 * Integração: só com DATABASE_URL.
 */
const HAS_DB = !!process.env.DATABASE_URL;
vi.mock("next/cache", () => ({ revalidatePath: () => {} }));
vi.mock("next/headers", () => ({ cookies: async () => ({ set: () => {}, delete: () => {} }) }));
vi.mock("@/lib/auth", () => ({ auth: async () => null, unstable_update: async () => null }));

describe.skipIf(!HAS_DB)("Prompt H · rascunho fora dos relatórios", async () => {
  const { db, schema } = await import("@/lib/db");
  const { getMonthlyRevenue, getExpenseRows, getRevenueBySource, getBudgetLines, getPlanejamentoNaoAprovado, planejamentoForaDosRelatorios } = await import("@/lib/queries");
  let tenantId = "";
  let projectId = "";
  let budgetId = "";
  let forecastId = "";
  let atualId = "";
  const CHAVE = "rascunho_fora_dos_relatorios";

  const ligar = async (ligada: boolean) => {
    await db.delete(schema.tenantFlags).where(eq(schema.tenantFlags.tenantId, tenantId));
    if (ligada) await db.insert(schema.tenantFlags).values({ tenantId, chave: CHAVE, ligada: true });
  };
  const situacao = async (id: string, status: string) => db.update(schema.versions).set({ status }).where(eq(schema.versions.id, id));
  const leituras = async (id: string) => ({
    receita: await getMonthlyRevenue(id, projectId),
    despesas: (await getExpenseRows(id)).length,
    fontes: Object.values((await getRevenueBySource(id, projectId)).sources).reduce((a, m) => a + Object.keys(m).length, 0),
    linhasRelatorio: (await getBudgetLines(id, { respeitarSituacao: true })).length,
    linhasEdicao: (await getBudgetLines(id)).length,
  });

  beforeAll(async () => {
    const [t] = await db.insert(schema.tenants).values({ name: "tenant-prompt-h" }).returning();
    tenantId = t.id;
    const [p] = await db.insert(schema.projects).values({ tenantId, name: "Obra H", status: "Planejamento", startDate: "01/01/2026", endDate: "03/31/2026" }).returning();
    projectId = p.id;
    const [a] = await db.insert(schema.versions).values({ tenantId, projectId, key: "atual", kind: "atual", label: "Atual", color: "#000", isDefault: true }).returning();
    atualId = a.id;
    const [b] = await db.insert(schema.versions).values({ tenantId, projectId, key: "budget", kind: "budget", label: "Budget", color: "#000", status: "Rascunho" }).returning();
    budgetId = b.id;
    const [f] = await db.insert(schema.versions).values({ tenantId, projectId, key: "forecast", kind: "forecast", label: "Forecast", color: "#000", status: "Concluído", sourceVersionId: budgetId }).returning();
    forecastId = f.id;
    for (const vid of [budgetId, forecastId]) {
      await db.insert(schema.budgetAccounts).values([
        { tenantId, versionId: vid, kind: "receita", rowKey: "Receita", dreCategory: "Receita", total: "1000" },
        { tenantId, versionId: vid, kind: "despesa", rowKey: "1", dreCategory: "Custo", total: "400" },
      ]);
      await db.insert(schema.budgetLines).values([
        { tenantId, versionId: vid, kind: "receita", rowKey: "Receita", dreCategory: "Receita", mes: "01/2026", valor: "1000", pct: "100" },
        { tenantId, versionId: vid, kind: "despesa", rowKey: "1", dreCategory: "Custo", mes: "02/2026", valor: "400", pct: "100" },
      ]);
    }
    // Movimento real na Atual: uma despesa, que nunca é filtrada.
    await db.insert(schema.despesas).values({ tenantId, versionId: atualId, valor: "250", categoriaDre: "Custo Variável", competencia: "02/2026", vencimento: "02/10/2026", status: "Pago", obs: "cimento", numDoc: "PED-H1" });
  });
  afterAll(async () => {
    if (tenantId) await db.delete(schema.tenants).where(eq(schema.tenants.id, tenantId));
  });

  it("chave desligada: Rascunho e Concluído entram como antes (seção 7)", async () => {
    await ligar(false);
    for (const id of [budgetId, forecastId]) {
      const r = await leituras(id);
      expect(r.receita).toEqual({ "01/2026": 1000 });
      expect(r.despesas).toBe(1);
      expect(r.linhasRelatorio).toBe(2);
      expect(r.linhasEdicao).toBe(2);
    }
    expect(await planejamentoForaDosRelatorios({ kind: "budget", status: "Rascunho", tenantId })).toBe(false);
  });

  it("chave ligada: Rascunho e Concluído somem dos relatórios; a edição continua lendo tudo (1.1, 4.3)", async () => {
    await ligar(true);
    for (const id of [budgetId, forecastId]) {
      const r = await leituras(id);
      expect(r.receita).toEqual({});
      expect(r.despesas).toBe(0);
      expect(r.fontes).toBe(0);
      expect(r.linhasRelatorio).toBe(0);
      expect(r.linhasEdicao).toBe(2); // nada apagado
    }
    expect(await db.select().from(schema.budgetLines).where(eq(schema.budgetLines.tenantId, tenantId))).toHaveLength(4);
  });

  it("Aprovado volta a entrar; voltar a Rascunho tira de novo (BH-4)", async () => {
    await ligar(true);
    await situacao(budgetId, "Aprovado");
    expect((await leituras(budgetId)).receita).toEqual({ "01/2026": 1000 });
    expect((await leituras(forecastId)).receita).toEqual({});
    await situacao(budgetId, "Rascunho");
    expect((await leituras(budgetId)).receita).toEqual({});
  });

  it("a versão Atual nunca é filtrada, qualquer que seja a situação (1.2, BH-2)", async () => {
    await ligar(true);
    await situacao(atualId, "Rascunho");
    const rows = await getExpenseRows(atualId);
    expect(rows).toHaveLength(1);
    expect(Number(rows[0].valor)).toBe(250);
    expect(await planejamentoForaDosRelatorios({ kind: "atual", status: "Rascunho", tenantId })).toBe(false);
  });

  it("lista de conferência (5.3): só planejamento fora de Aprovado, com totais do cadastro", async () => {
    await situacao(budgetId, "Rascunho");
    await situacao(forecastId, "Aprovado");
    const lista = await getPlanejamentoNaoAprovado(tenantId);
    expect(lista.map((l) => [l.nome, l.kind, l.status, l.receitas, l.despesas])).toEqual([["Budget", "budget", "Rascunho", 1000, 400]]);
    await situacao(forecastId, "Concluído");
    expect((await getPlanejamentoNaoAprovado(tenantId)).map((l) => l.nome)).toEqual(["Budget", "Forecast"]);
  });
});
