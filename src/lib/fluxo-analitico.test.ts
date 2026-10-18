import { describe, it, expect } from "vitest";
import { linhasDoFluxoAnalitico } from "./fluxo-analitico";

const contas = [
  { code: "1.1", name: "Serviços técnicos", groupCode: "1", groupName: "Preliminares", kind: "cef" },
  { code: "3.1", name: "Concreto", groupCode: "3", groupName: "Supraestrutura", kind: "cef" },
  { code: "A.1", name: "Aluguel", groupCode: "A", groupName: "Administrativo", kind: "complementar" },
];

describe("Prompt AD3 — Fluxo de Caixa Analítico", () => {
  const linhas = linhasDoFluxoAnalitico(
    {
      vendas: 9000,
      permuta: 1000,
      saidas: [
        { conta: "1.1", origem: "parcela", valor: 1000 },
        { conta: "1.1", origem: "despesa", valor: 500 },
        { conta: "3.1", origem: "despesa", valor: 2000 },
        { conta: "A.1", origem: "despesa", valor: 300 },
        { conta: "3", origem: "planejamento", valor: 50 },
        { conta: null, origem: "ressarcimento", valor: 120 },
        { conta: null, origem: "despesa", valor: 30 },
        { conta: "Z.9", origem: "despesa", valor: 7 },
      ],
    },
    contas,
  );
  const val = (id: string) => linhas.find((l) => l.id === id)?.valor;

  it("entradas, saídas e o saldo do período", () => {
    expect(val("entradas")).toBe(10000);
    expect(val("saidas")).toBe(4007);
    expect(val("saldo")).toBe(5993);
  });

  it("obra e complementar em blocos próprios; ressarcimento e sem conta à parte", () => {
    expect(val("saidas:cef")).toBe(3550);
    expect(val("saidas:cef:g:1:c:1.1")).toBe(1500);
    expect(val("saidas:cef:g:3")).toBe(2050);
    expect(linhas.find((l) => l.id === "saidas:cef:g:3:c:3:grupo")?.label).toBe("Planejado no grupo");
    expect(val("saidas:complementar")).toBe(300);
    expect(val("saidas:ressarcimento")).toBe(120);
    expect(val("saidas:sem")).toBe(37);
    expect(linhas.find((l) => l.id === "saidas:sem:g:—:c:Z.9")?.label).toBe("Z.9 (fora do plano)");
  });

  it("os filhos somam o pai em todos os níveis", () => {
    for (const pai of linhas.filter((l) => linhas.some((f) => f.pai === l.id))) {
      const soma = linhas.filter((f) => f.pai === pai.id).reduce((a, f) => a + f.valor, 0);
      expect(soma, pai.label).toBeCloseTo(pai.valor, 2);
    }
  });

  it("a análise vertical é sobre as entradas", () => {
    expect(linhas.find((l) => l.id === "saidas:complementar")!.pct).toBeCloseTo(3, 6);
    const sem = linhasDoFluxoAnalitico({ vendas: 0, permuta: 0, saidas: [{ conta: "1.1", origem: "despesa", valor: 1 }] }, contas);
    expect(sem.every((l) => l.pct === null)).toBe(true);
  });
});
