import { describe, it, expect } from "vitest";
import { simulate, type SimulatorInput } from "./calc";
import { dadosDoSimuladorParaCris, formularioDoSimulador, parametrosDaProposta, resumoDaProposta } from "./simulador-proposta";
import { sanitizarDados } from "./cris";

/** Prompt N2 — o simulador de parcelamento da planilha do cliente e a proposta ao cliente final. */
const base: SimulatorInput = {
  tipo: "SBPE",
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
  financiamento: 200000,
  renda: 16000,
  dataInicio: "2026-06-20",
  taxaMensal: 0.01,
};
const INCC = [{ m: "10/2026", mo: 0.5, ac: 1.2 }];

describe("Prompt N2 · proposta de pagamento", () => {
  it("o plano soma o que o fluxo cobra mais o financiamento nas chaves", () => {
    const r = simulate(base, INCC);
    const { linhas, total } = resumoDaProposta(base, r);
    expect(linhas.map((l) => l.rotulo)).toEqual(["Ato (assinatura)", "Sinal 1", "Sinal 2", "Sinal 3", "Anual 1", "Anual 2", "90 mensais", "Financiamento bancário"]);
    expect(linhas.find((l) => l.rotulo === "Anual 2")?.quando).toBe("mês 24");
    expect(total).toBeCloseTo(r.totalPago + base.financiamento, 2);
  });

  it("sem correção nem juros, o plano fecha no valor do imóvel", () => {
    const r = simulate(base, []);
    expect(resumoDaProposta(base, r).total).toBeCloseTo(base.valorImovel, 2);
  });

  it("a Cris não recebe renda nem cliente", () => {
    const d = dadosDoSimuladorParaCris(base, simulate(base, INCC), { obra: "OBRA A", unidade: "A-101" });
    const texto = JSON.stringify(d);
    expect(texto).not.toMatch(/16000|renda|comprometimento|limite/i);
    expect(sanitizarDados(d)).toMatchObject({ obra: "OBRA A", unidade: "A-101", tipo: "SBPE", valorDoImovel: 537027 });
  });

  it("o formulário da Cris não tem renda; tem a unidade quando há", () => {
    const nomes = formularioDoSimulador([{ id: "u1", rotulo: "A-101", valor: 500000 }]).campos.map((c) => c.nome);
    expect(nomes).toContain("unidade");
    expect(nomes.some((n) => /renda|cliente/i.test(n))).toBe(false);
  });

  it("o que a Cris propõe vira os campos; a unidade traz o valor; inválido fica de fora com aviso", () => {
    const u = [{ id: "u1", rotulo: "A-101", valor: 500000 }];
    const r = parametrosDaProposta({ unidade: "A-101", ato: "30000", s1: "3000", s1Mes: "2", mensais: "90", tipo: "PRICE" }, u);
    expect(r.parametros).toEqual({ unidadeId: "u1", valorImovel: "500000", ato: "30000", mensais: "90", tipo: "PRICE", reforcos: { s1: { valor: "3000", mes: "2" } } });
    const ruim = parametrosDaProposta({ mensais: "0", dataInicio: "20/06/2026", anual1Mes: "-1" }, u);
    expect(ruim.parametros).toEqual({});
    expect(ruim.avisos).toHaveLength(3);
  });
});
