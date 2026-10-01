import { describe, it, expect } from "vitest";
import { apenasVendidos, permutaGanhoByMonth, previaDaRevenda, resultadoDaRevenda, type CalcPermutaRevenda } from "./permuta-ganho";
import { permutaCashByMonth, permutaRevenueByMonth } from "./projection";

const ativo = (p: Partial<CalcPermutaRevenda>): CalcPermutaRevenda => ({
  estimado: 80000,
  status: "Vendido",
  valorVenda: 82000,
  dataVenda: "10/05/2026",
  formaVenda: "avista",
  dataPrimParcela: "",
  ...p,
});

describe("Permuta — resultado da revenda (Prompt P 4.1, §57.4.3, BP-3)", () => {
  it("entrou por 80.000 e saiu por 82.000: o resultado é 2.000, não 82.000", () => {
    expect(resultadoDaRevenda(ativo({}))).toBe(2000);
    expect(permutaGanhoByMonth([ativo({})])).toEqual({ "10/2026": 2000 });
    // Hoje a DRE lê o valor cheio — a diferença que a chave da §57 vai corrigir.
    expect(permutaRevenueByMonth([{ ...ativo({}), parcelas: 0, periodicidade: "mensal" }])).toEqual({ "10/2026": 82000 });
  });

  it("perda aparece negativa; escambo realiza o resultado na data da troca, sem caixa", () => {
    const perda = ativo({ valorVenda: 70000, formaVenda: "escambo", dataVenda: "11/20/2026" });
    expect(resultadoDaRevenda(perda)).toBe(-10000);
    expect(permutaGanhoByMonth([perda])).toEqual({ "11/2026": -10000 });
    expect(permutaCashByMonth([{ ...perda, parcelas: 0, periodicidade: "mensal" }])).toEqual({});
  });

  it("BP-2 · o status governa: 'Disponivel' com valor e data de venda não é revenda; sem data, sem competência", () => {
    const disponivel = ativo({ status: "Disponivel" });
    expect(apenasVendidos([disponivel, ativo({})])).toHaveLength(1);
    expect(resultadoDaRevenda(disponivel)).toBe(0);
    expect(permutaGanhoByMonth([disponivel])).toEqual({});
    // Hoje o caixa ainda conta esse ativo — é o que muda atrás da chave.
    expect(permutaCashByMonth([{ ...disponivel, parcelas: 0, periodicidade: "mensal" }])).toEqual({ "10/2026": 82000 });
    expect(permutaGanhoByMonth([ativo({ dataVenda: "", dataPrimParcela: "" })])).toEqual({});
    expect(permutaGanhoByMonth([ativo({ dataVenda: "", dataPrimParcela: "12/01/2026" })])).toEqual({ "12/2026": 2000 });
  });

  it("soma por mês com centavos e ignora venda sem valor; a prévia compara valor cheio × resultado", () => {
    const rows = [ativo({}), ativo({ estimado: 10000.5, valorVenda: 10000.75 }), ativo({ valorVenda: 0 }), ativo({ status: "Disponivel", valorVenda: 0 })];
    expect(permutaGanhoByMonth(rows)).toEqual({ "10/2026": 2000.25 });
    expect(previaDaRevenda(rows)).toEqual({ valorCheio: 92000.75, resultado: 2000.25, revendidos: 2 });
  });
});
