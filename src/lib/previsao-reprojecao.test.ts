import { describe, it, expect } from "vitest";
import { competenciasDecorridas, contasParaGravar, proporDoOrcamento, proporDoRealizado, recusaDaProposta, resumoDaProposta } from "./previsao-reprojecao";
import type { PlanningAccountRow } from "./planning";

const row = (rowKey: string, total: number, pct: Record<string, number>): PlanningAccountRow => ({ rowKey, label: `Conta ${rowKey}`, dreCategory: null, total, pct, ativo: true, fromChart: true });
const months = ["01/2026", "02/2026", "03/2026", "04/2026"];

describe("Prompt F · reprojeção (8.1–8.4)", () => {
  it("competências decorridas = anteriores ao mês de hoje", () => {
    expect(competenciasDecorridas(months, "03/2026")).toEqual(["01/2026", "02/2026"]);
    expect(competenciasDecorridas(months, "01/2026")).toEqual([]);
    expect(competenciasDecorridas(months, "x")).toEqual([]);
  });

  it("partir do orçamento: copia a distribuição conta a conta; conta só na previsão fica", () => {
    const p = proporDoOrcamento({
      months,
      previsao: { receitas: [row("RP", 1000, { "01/2026": 100 })], despesas: [row("1", 400, { "01/2026": 100 }), row("9", 50, { "01/2026": 100 })] },
      orcamento: { receitas: [row("RP", 1000, { "01/2026": 50, "02/2026": 50 })], despesas: [row("1", 400, { "01/2026": 25, "02/2026": 25, "03/2026": 25, "04/2026": 25 })] },
    });
    expect(p.contas.map((c) => `${c.rowKey}:${c.mudou}:${c.mesesAlterados.length}:${c.variacao}`)).toEqual(["RP:true:2:1000", "1:true:4:600"]);
    expect(p.alteradas).toBe(2);
    expect(p.estouros).toBe(0);
    expect(recusaDaProposta(p)).toBeNull();
    expect(resumoDaProposta(p, (n) => `R$ ${n}`)).toBe("2 conta(s) mudam (distribuição do Orçamento de origem); variação mensal somada de R$ 1600.");
    const gravar = contasParaGravar(p, "despesa", [row("1", 400, { "01/2026": 100 }), row("9", 50, { "01/2026": 100 })], months);
    expect(gravar.map((g) => g.rowKey)).toEqual(["1"]);
    expect(gravar[0].months.map((m) => m.pct)).toEqual([25, 25, 25, 25]);
  });

  it("partir do realizado: decorridas pelo Atual, restante por igual no futuro; estouro sinalizado", () => {
    const p = proporDoRealizado({
      months,
      hojeMes: "03/2026",
      previsao: { receitas: [row("RP", 1000, { "01/2026": 100 })], despesas: [row("1", 400, { "01/2026": 25, "02/2026": 25, "03/2026": 25, "04/2026": 25 }), row("2", 100, { "04/2026": 100 })] },
      realizado: { "1": { "01/2026": 120, "02/2026": 80 }, "2": { "01/2026": 90, "02/2026": 30 } },
    });
    expect(p.decorridas).toEqual(["01/2026", "02/2026"]);
    const c1 = p.contas.find((c) => c.rowKey === "1")!;
    expect(c1.depois).toEqual({ "01/2026": 30, "02/2026": 20, "03/2026": 25, "04/2026": 25 });
    expect(c1.estouro).toBeNull();
    const c2 = p.contas.find((c) => c.rowKey === "2")!;
    expect(c2.depois).toEqual({ "01/2026": 90, "02/2026": 30, "03/2026": 0, "04/2026": 0 });
    expect(c2.estouro).toBe(20);
    expect(p.estouros).toBe(1);
    expect(recusaDaProposta(p)).toMatch(/1 conta\(s\) com o realizado acima/);
    // receitas não mudam
    expect(p.contas.some((c) => c.bloco === "receita")).toBe(false);
  });

  it("proposta sem mudança é recusada", () => {
    const p = proporDoOrcamento({ months, previsao: { receitas: [], despesas: [row("1", 400, { "01/2026": 100 })] }, orcamento: { receitas: [], despesas: [row("1", 400, { "01/2026": 100 })] } });
    expect(p.alteradas).toBe(0);
    expect(recusaDaProposta(p)).toMatch(/não muda/);
  });
});
