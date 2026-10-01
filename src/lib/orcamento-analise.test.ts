import { describe, it, expect } from "vitest";
import { analisarDistribuicao, analisarOrcamento, compararVersoes, explicarDesvios, revisarOrcamento } from "./orcamento-analise";
import type { BudgetPlanningData, PlanningAccountRow } from "./planning";
import type { ForecastComparisonData } from "./queries";

const sem = (s: string) => s.replace(/ /g, " ");
const row = (rowKey: string, total: number, pct: Record<string, number>, extra: Partial<PlanningAccountRow> = {}): PlanningAccountRow => ({ rowKey, label: rowKey, dreCategory: null, total, pct, ativo: true, fromChart: true, ...extra });
const base = (over: Partial<BudgetPlanningData> = {}): BudgetPlanningData => ({
  project: { id: "p", name: "Obra", mesInicial: "01/2026", mesFinal: "03/2026", recursosProprios: 0, receitaDoCadastro: 1000 },
  selecao: { receita: false, despesa: false },
  disponiveis: { receita: [], despesa: [] },
  ultimaReplicacao: null,
  totaisDaOrigem: null,
  hasPeriod: true,
  months: ["01/2026", "02/2026", "03/2026"],
  versions: [],
  versionId: "v",
  receitas: [row("Receitas do Projeto", 1000, { "01/2026": 50, "02/2026": 50 }, { fixa: true, fromChart: false })],
  despesas: [row("1", 400, { "01/2026": 100 })],
  ...over,
});

describe("Prompt D · assistente somente leitura (6.3–6.4)", () => {
  it("estrutura ok: uma frase de tranquilidade", () => {
    expect(revisarOrcamento(base()).map((a) => a.texto)[0]).toMatch(/Nenhum ponto de atenção/);
  });
  it("aponta % abaixo de 100, total sem distribuição, mês fora do período, divergência com o cadastro e despesas vazias", () => {
    const d = base({
      receitas: [row("Receitas do Projeto", 1000, { "01/2026": 50 }, { fixa: true, fromChart: false }), row("Receita", 204140.4, { "12/2025": 100 }, { fromChart: false, ativo: false })],
      despesas: [row("1", 400, {})],
    });
    const t = revisarOrcamento(d).map((a) => sem(a.texto));
    expect(t.some((x) => x.includes("“Receitas do Projeto”: a distribuição fecha em 50%"))).toBe(true);
    expect(t.some((x) => x.includes("“1” tem total de R$ 400 e nenhuma distribuição"))).toBe(true);
    expect(t.some((x) => x.includes("“Receita” tem total"))).toBe(false); // fora do período já é apontado
    expect(t.some((x) => x.includes("“Receita” tem distribuição em 1 mês(es) fora do período do projeto (12/2025)"))).toBe(true);
    expect(t.some((x) => x.includes("difere do valor do cadastro") && x.includes("1 linha(s) legada(s)"))).toBe(true);
    const d2 = base({ despesas: [] });
    expect(revisarOrcamento(d2).some((a) => a.texto.includes("receita sem custo"))).toBe(true);
    const d3 = base({ project: { ...base().project, receitaDoCadastro: null }, receitas: [row("Receitas do Projeto", 0, {}, { fixa: true, fromChart: false, semTotalNoCadastro: true })] });
    expect(revisarOrcamento(d3)[0].texto).toMatch(/não tem valor de receita/);
  });
  it("distribuição: competências vazias e concentração", () => {
    const t = analisarDistribuicao(base()).map((a) => sem(a.texto));
    expect(t.some((x) => x.startsWith("receitas: 1 de 3 competência(s) sem nenhuma distribuição (03/2026)"))).toBe(true);
    expect(t.some((x) => x.startsWith("despesas: 2 de 3") )).toBe(true);
    expect(t.some((x) => x.includes("despesas: 100% do distribuído cai em 01/2026"))).toBe(true);
    expect(analisarDistribuicao(base({ months: [] }))[0].texto).toMatch(/Sem período/);
  });
  it("comparação e desvios a partir dos dados da comparação", () => {
    expect(compararVersoes(null)[0].texto).toMatch(/crie uma/);
    const cmp: ForecastComparisonData = {
      ok: true, forecastLabel: "Revisão 01", budgetLabel: "Budget", months: ["01/2026", "02/2026"],
      receitas: [{ rowKey: "RP", label: "Receitas do Projeto", budget: 1000, forecast: 1000 }],
      despesas: [{ rowKey: "1", label: "Fundações", budget: 400, forecast: 520 }, { rowKey: "2", label: "Nova", budget: 0, forecast: 50 }, { rowKey: "3", label: "Sumiu", budget: 30, forecast: 0 }],
      budgetByMonth: { "01/2026": 700, "02/2026": 730 }, forecastByMonth: { "01/2026": 700, "02/2026": 870 },
    };
    const c = compararVersoes(cmp).map((a) => sem(a.texto));
    expect(c[0]).toBe("Resultado: Orçamento R$ 570 × Previsão R$ 430 (−R$ 140).");
    expect(c[1]).toBe("Despesa “Fundações”: +R$ 120 (30%).");
    expect(c.some((x) => x.includes("“Nova”: +R$ 50 (conta nova na Previsão)"))).toBe(true);
    const e = explicarDesvios(cmp).map((a) => a.texto);
    expect(e.some((x) => x.includes("só na Previsão: Nova"))).toBe(true);
    expect(e.some((x) => x.includes("só no Orçamento: Sumiu"))).toBe(true);
    expect(e.some((x) => x.includes("“Fundações” variou 30%"))).toBe(true);
    const a = analisarOrcamento(base(), cmp);
    expect(a.temComparacao).toBe(true);
    expect(analisarOrcamento(base(), null).temComparacao).toBe(false);
  });
  it("totais iguais com meses diferentes = reprogramação de cronograma", () => {
    const cmp: ForecastComparisonData = { ok: true, forecastLabel: "R", budgetLabel: "B", months: ["01/2026", "02/2026"], receitas: [], despesas: [{ rowKey: "1", label: "A", budget: 100, forecast: 100 }], budgetByMonth: { "01/2026": 100, "02/2026": 0 }, forecastByMonth: { "01/2026": 0, "02/2026": 100 } };
    expect(explicarDesvios(cmp)[0].texto).toMatch(/reprogramação de cronograma/);
  });
});
