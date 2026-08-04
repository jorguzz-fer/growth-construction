import { describe, it, expect } from "vitest";
import {
  calcBdi,
  calcEvolucao,
  calcIncidencias,
  calcProvisionamento,
  custoReferencial,
  custoTotalServicos,
  type ServicoOrcado,
} from "./medicao-bdi";

/**
 * Os números abaixo vêm da planilha de referência do cliente
 * (Provisionamento_de_receita — aba "Calculo de medição"). Servem de validação
 * das fórmulas; NENHUM deles é fixado no código de produção.
 */
const FINANC_CONSTRUCAO = 198_583;
const FINANC_TERRENO = 112_000;
const CUB = 2_605.71;
const METRAGEM = 72.25;
const PARCELA_REF = 3_185.09;

/** Subconjunto dos 20 serviços da planilha (custo total real = 286.500). */
const SERVICOS: ServicoOrcado[] = [
  { id: "s1", nome: "Barracão+lig. provisórias", custoProposto: 7_000, limiteMin: 1.13, limiteMax: 3.97 },
  { id: "s2", nome: "Infraestrutura", custoProposto: 17_000, limiteMin: 3.07, limiteMax: 7.43 },
  { id: "s3", nome: "Supraestrutura", custoProposto: 33_000, limiteMin: 12.17, limiteMax: 17.67 },
  { id: "s4", nome: "Paredes e Painéis", custoProposto: 26_000, limiteMin: 4.8, limiteMax: 10.67 },
  { id: "s16", nome: "Instalações Hidráulicas", custoProposto: 10_000, limiteMin: 3.63, limiteMax: 4.27 },
];
/** Completa o orçamento para o total real de 286.500 da planilha. */
const RESTANTE: ServicoOrcado = {
  id: "resto",
  nome: "Demais serviços",
  custoProposto: 286_500 - 7_000 - 17_000 - 33_000 - 26_000 - 10_000,
};
const ORCAMENTO = [...SERVICOS, RESTANTE];

describe("custoTotalServicos", () => {
  it("soma os custos propostos (286.500 na planilha)", () => {
    expect(custoTotalServicos(ORCAMENTO)).toBe(286_500);
  });
});

describe("calcIncidencias", () => {
  it("incidência = custo do serviço ÷ custo total", () => {
    const r = calcIncidencias(ORCAMENTO);
    // Paredes e Painéis: 26.000 / 286.500 = 9,0750 %
    expect(r.find((s) => s.id === "s4")!.incidencia).toBeCloseTo(9.075, 3);
    // Barracão: 7.000 / 286.500 = 2,4433 %
    expect(r.find((s) => s.id === "s1")!.incidencia).toBeCloseTo(2.4433, 3);
  });

  it('marca "Abaixo do mínimo" quando a incidência fica sob o limite', () => {
    const r = calcIncidencias(ORCAMENTO);
    // Supraestrutura: incidência 11,52 % < mínimo 12,17 % → abaixo (como na planilha)
    expect(r.find((s) => s.id === "s3")!.status).toBe("Abaixo do mínimo");
    // Instalações Hidráulicas: 3,49 % < 3,63 % → abaixo (como na planilha)
    expect(r.find((s) => s.id === "s16")!.status).toBe("Abaixo do mínimo");
  });

  it('marca "OK" dentro da faixa e "Acima do máximo" acima dela', () => {
    const r = calcIncidencias(ORCAMENTO);
    expect(r.find((s) => s.id === "s1")!.status).toBe("OK"); // 2,44 entre 1,13 e 3,97
    const acima = calcIncidencias([
      { id: "a", nome: "A", custoProposto: 90, limiteMin: 0, limiteMax: 10 },
      { id: "b", nome: "B", custoProposto: 10 },
    ]);
    expect(acima.find((s) => s.id === "a")!.status).toBe("Acima do máximo");
  });

  it("sem limites cadastrados não emite julgamento", () => {
    expect(calcIncidencias([{ id: "x", nome: "X", custoProposto: 100 }])[0].status).toBe("—");
  });

  it("não divide por zero quando não há custos", () => {
    const r = calcIncidencias([{ id: "x", nome: "X", custoProposto: 0 }]);
    expect(r[0].incidencia).toBe(0);
  });
});

describe("calcBdi", () => {
  it("reproduz o exemplo da planilha: 286.500 × 6% = 17.190 → 303.690", () => {
    const r = calcBdi(ORCAMENTO, 6);
    expect(r.custoTotalServicos).toBe(286_500);
    expect(r.valorBdi).toBeCloseTo(17_190, 2);
    expect(r.custoTotalComBdi).toBeCloseTo(303_690, 2);
  });

  it("a alíquota é sempre parâmetro (nada fixado no código)", () => {
    expect(calcBdi(ORCAMENTO, 0).valorBdi).toBe(0);
    expect(calcBdi(ORCAMENTO, 12).valorBdi).toBeCloseTo(34_380, 2);
  });
});

describe("calcEvolucao", () => {
  const servicos: ServicoOrcado[] = [
    { id: "a", nome: "A", custoProposto: 50 },
    { id: "b", nome: "B", custoProposto: 50 },
  ];

  it("variação mensal = acumulado atual − acumulado anterior", () => {
    const ev = calcEvolucao(servicos, [
      { servicoId: "a", competencia: "01/2026", pctExecutadoAcum: 50 },
      { servicoId: "a", competencia: "02/2026", pctExecutadoAcum: 100 },
      { servicoId: "b", competencia: "02/2026", pctExecutadoAcum: 50 },
    ]);
    // jan: A 50% de 50% de incidência = 25%
    expect(ev[0].acumulado).toBeCloseTo(25, 4);
    expect(ev[0].variacao).toBeCloseTo(25, 4);
    // fev: A 100% (50) + B 50% (25) = 75% → variação 50
    expect(ev[1].acumulado).toBeCloseTo(75, 4);
    expect(ev[1].variacao).toBeCloseTo(50, 4);
  });

  it("carrega o último % conhecido — o acumulado não regride sem lançamento", () => {
    const ev = calcEvolucao(servicos, [
      { servicoId: "a", competencia: "01/2026", pctExecutadoAcum: 100 },
      { servicoId: "b", competencia: "03/2026", pctExecutadoAcum: 100 },
    ]);
    expect(ev[0].acumulado).toBeCloseTo(50, 4);
    expect(ev[1].acumulado).toBeCloseTo(100, 4); // A continua 100%
    expect(ev[1].variacao).toBeCloseTo(50, 4);
  });

  it("ordena competências cronologicamente, não alfabeticamente", () => {
    const ev = calcEvolucao(servicos, [
      { servicoId: "a", competencia: "02/2027", pctExecutadoAcum: 100 },
      { servicoId: "a", competencia: "12/2026", pctExecutadoAcum: 50 },
    ]);
    expect(ev.map((e) => e.competencia)).toEqual(["12/2026", "02/2027"]);
  });

  it("a soma das variações fecha com o acumulado final", () => {
    const ev = calcEvolucao(servicos, [
      { servicoId: "a", competencia: "01/2026", pctExecutadoAcum: 40 },
      { servicoId: "b", competencia: "02/2026", pctExecutadoAcum: 60 },
      { servicoId: "a", competencia: "03/2026", pctExecutadoAcum: 100 },
    ]);
    const soma = ev.reduce((s, e) => s + e.variacao, 0);
    expect(soma).toBeCloseTo(ev[ev.length - 1].acumulado, 6);
  });
});

describe("calcProvisionamento — validação contra a planilha", () => {
  const params = {
    financiamentoConstrucao: FINANC_CONSTRUCAO,
    financiamentoTerreno: FINANC_TERRENO,
    custoReferencial: custoReferencial(CUB, METRAGEM),
    parcelaReferencia: PARCELA_REF,
    pctTaxa: 1.5,
  };

  it("custo referencial = CUB × metragem ≈ 188.262,55", () => {
    expect(params.custoReferencial).toBeCloseTo(188_262.55, 1);
  });

  it("reproduz a linha de julho/2026 da planilha (variação 19,93%)", () => {
    const [jul] = calcProvisionamento(
      [{ competencia: "07/2026", acumulado: 19.93, variacao: 19.93 }],
      params,
    );
    expect(jul.liberacao).toBeCloseTo(39_577.97, 0); // 19,93% × 198.583
    expect(jul.custoEstimado).toBeCloseTo(37_521.09, 0); // 19,93% × 188.262,55
    expect(jul.caixa).toBeCloseTo(2_056.89, 0);
    expect(jul.liberacaoAcumulada).toBeCloseTo(151_577.97, 0); // 112.000 + liberação
    expect(jul.pctRecebido).toBeCloseTo(0.488, 3); // 48,80 %
    expect(jul.evo).toBeCloseTo(1_554.46, 0); // 3.185,09 × 48,80 %
    expect(jul.taxa).toBeCloseTo(593.67, 0); // 1,5 % × liberação
    expect(jul.soma).toBeCloseTo(2_148.13, 0);
  });

  it("acumula a liberação e reduz o saldo de financiamento", () => {
    // A planilha EXIBE os percentuais com 2 casas (22,44 %), mas calcula com a
    // precisão cheia (22,4432 %). Alimentando o valor exibido, a diferença
    // esperada na liberação é de alguns reais — por isso a tolerância aqui é em
    // R$, e não em casas decimais.
    const linhas = calcProvisionamento(
      [
        { competencia: "07/2026", acumulado: 19.93, variacao: 19.93 },
        { competencia: "08/2026", acumulado: 42.37, variacao: 22.44 },
      ],
      params,
    );
    expect(Math.abs(linhas[1].liberacao - 44_568.54)).toBeLessThan(15);
    expect(Math.abs(linhas[1].liberacaoAcumulada - 196_146.51)).toBeLessThan(15);
    expect(linhas[1].pctRecebido).toBeCloseTo(0.6315, 3);
    // saldo = total financiado − acumulado
    expect(
      Math.abs(
        linhas[1].saldoFinanciamento -
          (FINANC_CONSTRUCAO + FINANC_TERRENO - 196_146.51),
      ),
    ).toBeLessThan(15);
  });

  it("ao completar 100% da obra, o acumulado atinge o total financiado", () => {
    const linhas = calcProvisionamento(
      [{ competencia: "12/2026", acumulado: 100, variacao: 100 }],
      params,
    );
    expect(linhas[0].liberacaoAcumulada).toBeCloseTo(
      FINANC_CONSTRUCAO + FINANC_TERRENO,
      2,
    );
    expect(linhas[0].pctRecebido).toBeCloseTo(1, 6);
    expect(linhas[0].saldoFinanciamento).toBeCloseTo(0, 2);
  });

  it("não divide por zero sem financiamento cadastrado", () => {
    const linhas = calcProvisionamento(
      [{ competencia: "01/2026", acumulado: 10, variacao: 10 }],
      { ...params, financiamentoConstrucao: 0, financiamentoTerreno: 0 },
    );
    expect(linhas[0].pctRecebido).toBe(0);
    expect(Number.isFinite(linhas[0].evo)).toBe(true);
  });
});
