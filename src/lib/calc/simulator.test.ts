import { describe, it, expect } from "vitest";
import { simulate, type SimulatorInput } from "./simulator";
import { DEFAULT_INCC } from "./constants";

const base: SimulatorInput = {
  tipo: "SAC",
  valorImovel: 537027,
  entrada: 30000,
  s1: 3000,
  s2: 3000,
  s3: 3000,
  anual1: 13000,
  anual2: 91000,
  mensais: 90,
  fgts: 0,
  subsidio: 0,
  financiamento: 0,
  renda: 16000,
  dataInicio: "2026-06-20",
};

describe("simulate", () => {
  it("calcula entrada, saldo e comprometimento de renda", () => {
    const r = simulate(base, DEFAULT_INCC);
    expect(r.totalEntrada).toBe(143000);
    expect(r.saldoMensal).toBe(394027);
    expect(r.parcMensal).toBeCloseTo(4378.08, 2);
    expect(r.maxParcela).toBe(4800);
    expect(r.dentroLimite).toBe(true);
    expect(r.pctEntrada).toBeCloseTo(26.63, 2);
  });

  it("gera fluxo de 36 meses", () => {
    const r = simulate(base, DEFAULT_INCC);
    expect(r.meses).toHaveLength(36);
    expect(r.meses[0].n).toBe(1);
    expect(r.meses[35].evolucao).toBe(100);
  });

  it("SAC: primeira parcela = juros sobre o saldo + amortização, + entrada", () => {
    const r = simulate(base, DEFAULT_INCC);
    // amort = 394027/90 = 4378,0478 ; juros = 394027×1% = 3940,27
    expect(r.meses[0].parcTotal).toBeCloseTo(8318.348, 2);
    expect(r.meses[0].total).toBeCloseTo(38318.348, 2); // + entrada 30000
  });

  it("PRICE: parcela fixa pela fórmula de anuidade", () => {
    const r = simulate({ ...base, tipo: "PRICE" }, DEFAULT_INCC);
    const taxa = 0.01;
    const esperado =
      (394027 * (taxa * Math.pow(1 + taxa, 90))) / (Math.pow(1 + taxa, 90) - 1);
    expect(r.meses[0].parcTotal).toBeCloseTo(esperado, 2);
    // PRICE é fixa entre os meses (ignorando especiais)
    expect(r.meses[5].parcTotal).toBeCloseTo(r.meses[10].parcTotal, 2);
  });
});
