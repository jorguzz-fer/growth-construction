import { describe, it, expect } from "vitest";
import { waterfall } from "@/lib/calc/dre-cascata";
import { linhasDaDreAnalitica, paraInputs, somarPeriodo, type EntradaAnalitica } from "./dre-analitica";

const contas = [
  { code: "1.1", name: "Serviços técnicos", groupCode: "1", groupName: "Preliminares" },
  { code: "1.2", name: "Canteiro", groupCode: "1", groupName: "Preliminares" },
  { code: "3.1", name: "Concreto", groupCode: "3", groupName: "Supraestrutura" },
  { code: "A.1", name: "Aluguel", groupCode: "A", groupName: "Administrativo" },
];
const entrada: EntradaAnalitica = {
  receitaVendas: 10000,
  receitaPermuta: 500,
  encargos: 40,
  lancamentos: [
    { categoria: "Custo Variável", conta: "1.1", valor: 1000 },
    { categoria: "Custo Variável", conta: "1.2", valor: 300 },
    { categoria: "Custo Variável", conta: "3.1", valor: 2000 },
    { categoria: "Custo Variável", conta: null, valor: 50 },
    { categoria: "Despesa Fixa", conta: "A.1", valor: 800 },
    { categoria: "Despesas Financeiras", conta: "F.2", valor: 10 },
    { categoria: "Receita", conta: null, valor: 25 },
  ],
};

describe("Prompt AC3 — DRE Analítica", () => {
  const linhas = linhasDaDreAnalitica(entrada, contas);
  const val = (id: string) => linhas.find((l) => l.id === id)?.valor;

  it("os totais são os da cascata da DRE, linha a linha", () => {
    const c = waterfall([paraInputs(entrada)]);
    for (const r of c.rows) {
      const l = linhas.find((x) => x.label === r.label && x.nivel === 0);
      expect(l, r.label).toBeDefined();
      expect(l!.valor).toBeCloseTo(r.value, 2);
    }
    expect(val("final")).toBeCloseTo(10525 - 3350 - 800 - 50, 2);
  });

  it("cada categoria abre em grupo e conta, e os filhos somam o pai", () => {
    expect(val("cat:Custo Variável")).toBe(3350);
    expect(val("cat:Custo Variável:g:1")).toBe(1300);
    expect(val("cat:Custo Variável:g:1:c:1.1")).toBe(1000);
    expect(val("cat:Custo Variável:g:3")).toBe(2000);
    for (const pai of linhas.filter((l) => linhas.some((f) => f.pai === l.id))) {
      const soma = linhas.filter((f) => f.pai === pai.id).reduce((a, f) => a + f.valor, 0);
      expect(soma, pai.label).toBeCloseTo(pai.valor, 2);
    }
  });

  it("despesa sem conta e conta fora do plano têm linha própria; encargos ficam nas Despesas Financeiras", () => {
    expect(linhas.find((l) => l.id === "cat:Custo Variável:g:—")?.label).toBe("Sem conta do plano");
    expect(linhas.find((l) => l.id === "cat:Despesas Financeiras:g:—:c:F.2")?.label).toBe("F.2 (fora do plano)");
    expect(val("cat:Despesas Financeiras:encargos")).toBe(40);
    expect(val("receita:despesa")).toBe(25);
  });

  it("a análise vertical é sobre a receita; sem receita, não há %", () => {
    expect(linhas.find((l) => l.id === "cat:Despesa Fixa")!.pct).toBeCloseTo((800 / 10525) * 100, 4);
    const sem = linhasDaDreAnalitica({ receitaVendas: 0, receitaPermuta: 0, encargos: 0, lancamentos: [{ categoria: "Despesa Fixa", conta: "A.1", valor: 5 }] }, contas);
    expect(sem.every((l) => l.pct === null)).toBe(true);
  });

  it("o período soma só os meses pedidos", () => {
    const porMes = { "01/2026": { ...entrada, lancamentos: [entrada.lancamentos[0]] }, "02/2026": { receitaVendas: 1, receitaPermuta: 0, encargos: 0, lancamentos: [] } };
    expect(somarPeriodo(porMes, new Set(["02/2026"])).receitaVendas).toBe(1);
    expect(somarPeriodo(porMes, null).lancamentos).toHaveLength(1);
  });
});

describe("Prompt AC3 — planejamento por grupo", () => {
  it("linha do Orçamento com o código do grupo cai no grupo, não em 'sem conta'", () => {
    const linhas = linhasDaDreAnalitica({ receitaVendas: 100, receitaPermuta: 0, encargos: 0, lancamentos: [{ categoria: "Custo Variável", conta: "1", valor: 40 }] }, contas);
    expect(linhas.find((l) => l.id === "cat:Custo Variável:g:1")?.label).toBe("1 · Preliminares");
    expect(linhas.find((l) => l.id === "cat:Custo Variável:g:1:c:1:grupo")?.label).toBe("Planejado no grupo");
    expect(linhas.some((l) => l.id === "cat:Custo Variável:g:—")).toBe(false);
  });
});
