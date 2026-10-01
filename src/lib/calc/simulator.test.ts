import { describe, it, expect } from "vitest";
import { simulate, validarSimulacao, MAX_PARCELAS, type SimulatorInput } from "./simulator";
import { DEFAULT_INCC } from "./constants";

/**
 * Prompt N, PR N-1. Os quatro testes originais mudaram de resultado por
 * decisão (relatório, item 6): (a) `totalEntrada` virou entrada efetiva +
 * recursos futuros + financiamento; (b) o fluxo tem n linhas, não 36; (c) o
 * veredito de renda usa a maior parcela; (d) SAC e PRICE recebem a correção
 * INCC a partir da 5ª parcela (opção 1 da 2.2).
 */
const base: SimulatorInput = {
  tipo: "SAC",
  valorImovel: 537027,
  entrada: 30000,
  s1: { valor: 3000, mes: 2 },
  s2: { valor: 3000, mes: 3 },
  s3: { valor: 3000, mes: 4 },
  anual1: { valor: 13000, mes: 12 },
  anual2: { valor: 91000, mes: 24 },
  mensais: 90,
  fgts: { valor: 0, mes: 1 },
  subsidio: { valor: 0, mes: 1 },
  financiamento: 0,
  renda: 16000,
  dataInicio: "2026-06-20",
  taxaMensal: 0.01,
};

describe("simulate — entrada, saldo e renda (2.1, 2.4)", () => {
  it("separa entrada efetiva (entrada + sinais), recursos futuros (com o mês) e financiamento; o % usa a efetiva", () => {
    const r = simulate(base, DEFAULT_INCC);
    expect(r.entradaEfetiva).toBe(39000);
    expect(r.recursosFuturos).toEqual([
      { nome: "Anual 1", valor: 13000, mes: 12 },
      { nome: "Anual 2", valor: 91000, mes: 24 },
    ]);
    expect(r.totalRecursosFuturos).toBe(104000);
    expect(r.financiamento).toBe(0);
    expect(r.saldoMensal).toBe(394027);
    expect(r.parcMensal).toBeCloseTo(4378.08, 2);
    expect(r.pctEntrada).toBeCloseTo((39000 / 537027) * 100, 4);
    // Antes: "% entrada 26,63%" somando anuais; com financiamento de 400 mil diria 95%.
    const comFin = simulate({ ...base, financiamento: 400000 }, DEFAULT_INCC);
    expect(comFin.pctEntrada).toBeCloseTo(r.pctEntrada, 6);
  });

  it("2.1 · o veredito compara a MAIOR parcela do fluxo com o limite — 8.318 > 4.800 é 'acima', não 'dentro'", () => {
    const r = simulate(base, DEFAULT_INCC);
    expect(r.maxParcela).toBe(4800);
    // A 1ª parcela SAC é 8.318; com a correção INCC a partir da 5ª (2.2), a
    // maior do fluxo é uma parcela corrigida mais adiante — ainda maior.
    expect(r.maiorParcela).toBeGreaterThanOrEqual(8318.34);
    expect(r.mesDaMaiorParcela).toBeGreaterThanOrEqual(1);
    expect(r.dentroLimite).toBe(false);
    const semIncc = simulate(base, []);
    expect(semIncc.maiorParcela).toBeCloseTo(8318.348, 2);
    expect(semIncc.mesDaMaiorParcela).toBe(1);
    const folgado = simulate({ ...base, renda: 40000 }, DEFAULT_INCC);
    expect(folgado.dentroLimite).toBe(true);
  });
});

describe("simulate — fluxo (2.5, 2.6, 2.7, 2.8)", () => {
  it("2.5 · o fluxo tem tantas linhas quanto parcelas, com total ao final; o teto é declarado", () => {
    expect(simulate(base, DEFAULT_INCC).meses).toHaveLength(90);
    expect(simulate({ ...base, mensais: 12 }, DEFAULT_INCC).meses).toHaveLength(12);
    expect(simulate({ ...base, mensais: 1000 }, DEFAULT_INCC).meses).toHaveLength(MAX_PARCELAS);
    const r = simulate({ ...base, mensais: 12 }, DEFAULT_INCC);
    expect(r.totalPago).toBeCloseTo(r.meses.reduce((a, m) => a + m.total, 0), 2);
  });

  it("2.6 · com menos de 36 parcelas nenhuma parcela é negativa; SAC para de amortizar quando o saldo zera", () => {
    const r = simulate({ ...base, mensais: 10, anual1: { valor: 13000, mes: 10 }, anual2: { valor: 0, mes: 1 } }, []);
    expect(r.meses.every((m) => m.parcTotal >= 0 && m.total >= 0)).toBe(true);
    const amortizado = r.meses.reduce((a, m) => a + (m.parcBase - m.juros), 0);
    expect(amortizado).toBeCloseTo(r.saldoMensal, 2);
    expect(r.meses[9].parcBase - r.meses[9].juros).toBeCloseTo(r.saldoMensal / 10, 2);
  });

  it("2.7 · cada reforço entra no mês informado; além do plano é recusado com mensagem", () => {
    const r = simulate({ ...base, mensais: 30, anual2: { valor: 91000, mes: 18 } }, []);
    expect(r.meses[17].especial).toBe(91000);
    expect(r.meses[23].especial).toBe(0);
    const erros = validarSimulacao({ ...base, mensais: 20, anual2: { valor: 91000, mes: 24 } });
    expect(erros).toEqual(["Anual 2: mês 24 está além do plano de 20 parcelas."]);
    expect(validarSimulacao(base)).toEqual([]);
  });

  it("2.8 · evolução pela janela da obra quando há; sem janela, premissa linear nas parcelas (rotulada)", () => {
    const premissa = simulate({ ...base, mensais: 10 }, []);
    expect(premissa.origemDaEvolucao).toBe("premissa");
    expect(premissa.meses[0].evolucao).toBeCloseTo(10, 6);
    expect(premissa.meses[9].evolucao).toBe(100);
    const obra = simulate({ ...base, mensais: 10, janelaObra: { inicio: "06/2026", fim: "05/2028" } }, []);
    expect(obra.origemDaEvolucao).toBe("obra");
    expect(obra.meses[0].evolucao).toBeCloseTo((1 / 24) * 100, 6);
    expect(obra.meses[9].evolucao).toBeCloseTo((10 / 24) * 100, 6);
  });
});

describe("simulate — correção e juros (2.2, 2.3, 4.3)", () => {
  it("2.2 · a correção INCC vale nos três tipos, a partir da 5ª parcela, pelo acumulado do mês", () => {
    for (const tipo of ["SAC", "PRICE", "SBPE"] as const) {
      const r = simulate({ ...base, tipo }, DEFAULT_INCC);
      expect(r.meses[3].correcao).toBe(0);
      expect(r.meses[4].inccAc).toBeGreaterThan(0);
      expect(r.meses[4].correcao).toBeCloseTo(r.meses[4].parcBase * (r.meses[4].inccAc / 100), 6);
      expect(r.meses[4].parcTotal).toBeCloseTo(r.meses[4].parcBase + r.meses[4].correcao, 6);
    }
  });

  it("SAC: primeira parcela = juros sobre o saldo + amortização (+ entrada no total); a taxa é entrada (2.3)", () => {
    const r = simulate(base, DEFAULT_INCC);
    expect(r.meses[0].parcTotal).toBeCloseTo(8318.348, 2);
    expect(r.meses[0].total).toBeCloseTo(38318.348, 2);
    const meio = simulate({ ...base, taxaMensal: 0.005 }, DEFAULT_INCC);
    expect(meio.meses[0].juros).toBeCloseTo(394027 * 0.005, 2);
    const zero = simulate({ ...base, taxaMensal: 0 }, DEFAULT_INCC);
    expect(zero.totalJuros).toBe(0);
  });

  it("PRICE: parcela fixa pela fórmula de anuidade (antes da correção), fixa entre os meses", () => {
    const r = simulate({ ...base, tipo: "PRICE" }, DEFAULT_INCC);
    const taxa = 0.01;
    const esperado = (394027 * (taxa * Math.pow(1 + taxa, 90))) / (Math.pow(1 + taxa, 90) - 1);
    expect(r.meses[0].parcBase).toBeCloseTo(esperado, 2);
    expect(r.meses[5].parcBase).toBeCloseTo(r.meses[10].parcBase, 2);
    expect(r.totalJuros).toBeGreaterThan(0);
  });

  it("4.3 · resumo: total pago, total de juros e total de correção fecham com o fluxo", () => {
    const r = simulate({ ...base, mensais: 24 }, DEFAULT_INCC);
    expect(r.totalJuros).toBeCloseTo(r.meses.reduce((a, m) => a + m.juros, 0), 2);
    expect(r.totalCorrecao).toBeCloseTo(r.meses.reduce((a, m) => a + m.correcao, 0), 2);
    expect(r.totalPago).toBeCloseTo(r.meses.reduce((a, m) => a + m.total, 0), 2);
  });

  it("3.3 · validação: negativo, NaN, parcelas não inteiras ou zero, data em branco", () => {
    const erros = validarSimulacao({ ...base, valorImovel: -1, renda: NaN, mensais: 1.5, dataInicio: "", s1: { valor: 10, mes: 0 } });
    expect(erros).toEqual(expect.arrayContaining([expect.stringMatching(/Valor do imóvel: não pode ser negativo/), expect.stringMatching(/Renda mensal: informe um número/), expect.stringMatching(/Nº de mensais/), expect.stringMatching(/Sinal 1: informe o mês/), expect.stringMatching(/Data de início/)]));
  });
});
