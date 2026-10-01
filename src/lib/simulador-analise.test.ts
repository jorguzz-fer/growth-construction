import { describe, expect, it } from "vitest";
import type { SimulatorInput } from "@/lib/calc";
import { simulate } from "@/lib/calc";
import { compararCenarios, conferirSimulacao, explicarProposta, testarVariacoes } from "./simulador-analise";

const z = { valor: 0, mes: 1 };
const base: SimulatorInput = {
  tipo: "SAC",
  valorImovel: 500000,
  entrada: 50000,
  s1: { valor: 10000, mes: 2 },
  s2: z,
  s3: z,
  anual1: { valor: 20000, mes: 12 },
  anual2: z,
  fgts: z,
  subsidio: z,
  mensais: 36,
  financiamento: 250000,
  renda: 16000,
  dataInicio: "2026-10-01",
  taxaMensal: 0.01,
  janelaObra: null,
};
const incc = [
  { m: "10/2026", mo: 0.5, ac: 0.5 },
  { m: "11/2026", mo: 0.5, ac: 1.0025 },
  { m: "12/2026", mo: 0.5, ac: 1.5075, projected: true },
];

describe("explicarProposta (5.1)", () => {
  it("descreve entrada, recursos futuros, parcelas e correção sem citar renda nem aprovar", () => {
    const texto = explicarProposta(base, simulate(base, incc)).join(" ");
    expect(texto).toMatch(/Entrada de R\$\s?60\.000/);
    expect(texto).toMatch(/Anual 1 de R\$\s?20\.000 no mês 12/);
    expect(texto).toMatch(/36 parcelas/);
    expect(texto).toMatch(/Simulação, não proposta/);
    expect(texto).not.toMatch(/renda|aprovad|limite/i);
  });
});

describe("compararCenarios (5.2)", () => {
  it("traz os três tipos com os mesmos dados; SAC começa maior e paga menos juros que PRICE", () => {
    const c = compararCenarios(base, incc);
    expect(c.map((x) => x.tipo)).toEqual(["SAC", "PRICE", "SBPE"]);
    const sac = c[0], price = c[1];
    expect(sac.primeiraParcela).toBeGreaterThan(price.primeiraParcela);
    expect(sac.totalJuros).toBeLessThan(price.totalJuros);
  });
});

describe("testarVariacoes (5.3)", () => {
  it("prazo maior reduz a maior parcela e aumenta o total; variação inválida é omitida", () => {
    const v = testarVariacoes(base, incc);
    const mais = v.find((x) => x.rotulo === "Prazo +12 parcelas")!;
    expect(mais.dMaior).toBeLessThan(0);
    expect(mais.dTotal).toBeGreaterThan(0);
    const curto = testarVariacoes({ ...base, mensais: 6 }, incc);
    expect(curto.some((x) => x.rotulo === "Prazo −12 parcelas")).toBe(false);
  });
});

describe("conferirSimulacao (5.4)", () => {
  it("aponta a maior parcela acima do limite sem afirmar aprovação", () => {
    const r = simulate(base, incc);
    const c = conferirSimulacao(base, r, incc);
    expect(c.some((x) => x.nivel === "aviso" && /passa do limite/.test(x.texto))).toBe(true);
    expect(c.some((x) => /premissa linear/.test(x.texto))).toBe(true);
    expect(c.some((x) => /usam INCC projetado/.test(x.texto))).toBe(false); // 12/2026 é a 3ª parcela: antes da 5ª
  });
  it("devolve os erros de validação quando não há resultado", () => {
    const ruim = { ...base, s1: { valor: 1000, mes: 99 } };
    const c = conferirSimulacao(ruim, null, incc);
    expect(c).toEqual([{ nivel: "erro", texto: "Sinal 1: mês 99 está além do plano de 36 parcelas." }]);
  });
  it("avisa quando a soma passa do imóvel e quando o financiamento passa de 80%", () => {
    const r = simulate({ ...base, financiamento: 450000 }, incc);
    const c = conferirSimulacao({ ...base, financiamento: 450000 }, r, incc);
    expect(c.some((x) => /mais que o imóvel/.test(x.texto))).toBe(true);
    expect(c.some((x) => /acima dos 80%/.test(x.texto))).toBe(true);
  });
});
