import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { linhasDoFluxo, totalDoDesvio, type Mapas } from "./fluxo-tela";
import {
  analisarCenario,
  analisarFluxo,
  comparar,
  fraseDeAbertura,
  movimentoSemPrevisao,
  vencidoAindaPrevisto,
  type LadoDoCenario,
} from "./fluxo-analise";

/** Prompt AD, Parte 4 — o assistente do Fluxo, somente leitura. */
const plano: Mapas = { entradas: { "01/2026": 100, "02/2026": 100, "03/2026": 100 }, saidas: { "01/2026": 20 } };
const caixa: Mapas = { entradas: { "01/2026": 90, "02/2026": 40, "04/2026": 30 }, saidas: { "01/2026": 20 } };
const meses = ["01/2026", "02/2026", "03/2026", "04/2026"];
const fmt = { pct: (n: number) => `${n.toFixed(1)}%`, brl: (n: number) => `R$ ${n}` };
const lado = (o: Partial<LadoDoCenario> = {}): LadoDoCenario => ({
  cenario: "budget",
  nome: "Orçamento",
  versao: "“Orç 2026”",
  cobertura: null,
  ausente: null,
  plano,
  realizado: caixa,
  previstoAtual: plano,
  ...o,
});

describe("4.2 — o assistente não calcula: lê as mesmas funções da tabela", () => {
  it("desvio por mês e total iguais aos de linhasDoFluxo/totalDoDesvio", () => {
    const tabela = linhasDoFluxo(meses, meses, plano, caixa, 0);
    const c = comparar("caixa_x_plano", plano, caixa, meses);
    expect(c.linhas.map((l) => l.desvio)).toEqual(tabela.map((l) => l.desvio));
    expect(c.total).toEqual(totalDoDesvio(tabela));
    // 01: (90−20)−(100−20) = −10; 02: 40−100 = −60. 03 só plano, 04 só caixa: fora.
    expect(c.total).toMatchObject({ valor: -70, mesesComparados: 2, soPrevisto: 1, soRealizado: 1 });
    expect(c.ordenadas.map((m) => m.mm)).toEqual(["02/2026", "01/2026"]);
  });

  it("4.3 — a frase traz o achado, a versão e os meses que concentram", () => {
    const a = analisarCenario(lado(), meses);
    const f = fraseDeAbertura(a, "2026", fmt);
    expect(f).toContain("abaixo do Orçamento (“Orç 2026”)");
    expect(f).toContain("02/2026 e 01/2026");
    expect(f).toContain("2 mês(es) com os dois lados");
    expect(f).not.toMatch(/porque|causa/);
  });

  it("4.3 — sem o que dizer, diz isso", () => {
    const a = analisarCenario(lado({ realizado: { entradas: {}, saidas: {} } }), meses);
    expect(fraseDeAbertura(a, "2026", fmt)).toContain("não há desvio a apontar");
    const vazio = analisarCenario(lado({ plano: { entradas: {}, saidas: {} } }), meses);
    expect(fraseDeAbertura(vazio, "2026", fmt)).toBe("Orçamento (“Orç 2026”) não tem nenhum valor planejado em 2026 — não há o que comparar.");
  });
});

describe("4.6 — nunca compara com versão ausente", () => {
  it("cenário ausente: nenhuma comparação, e a frase diz por quê (não zero)", () => {
    const a = analisarCenario(lado({ ausente: "OBRA não tem Previsão Atualizada.", plano: null, realizado: null, previstoAtual: null }), meses);
    expect(a.caixa).toBeNull();
    expect(a.previsao).toBeNull();
    const f = fraseDeAbertura(a, "2026", fmt);
    expect(f).toContain("OBRA não tem Previsão Atualizada.");
    expect(f).toContain("Comparar com zero seria afirmar que o planejado é zero");
  });

  it("BAD-3 — as duas leituras saem com rótulos diferentes", () => {
    const a = analisarCenario(lado(), meses);
    expect(a.caixa?.leitura).toBe("caixa_x_plano");
    expect(a.previsao?.leitura).toBe("previsao_x_plano");
  });
});

describe("4.4 — as leituras invisíveis na tabela", () => {
  const linhas = linhasDoFluxo(meses, meses, plano, caixa, 0);
  it("o que já venceu e continua previsto: só meses antes do corrente, com previsto", () => {
    expect(vencidoAindaPrevisto(linhas, "03/2026")).toEqual([
      { mm: "01/2026", previsto: 80, realizado: 70 },
      { mm: "02/2026", previsto: 100, realizado: 40 },
    ]);
    expect(vencidoAindaPrevisto(linhas, "01/2026")).toEqual([]);
  });
  it("movimento sem previsão: os meses só com realizado", () => {
    expect(movimentoSemPrevisao(linhas)).toEqual([{ mm: "04/2026", entradas: 30, saidas: 0 }]);
  });
  it("a análise inteira é serializável (vai do servidor ao painel sem função)", () => {
    const a = analisarFluxo({ periodo: "2026", origemDoPeriodo: "ano escolhido", meses, lados: [lado()], referencia: "o previsto de Atual", linhasDaTabela: linhas, mesAtual: "03/2026", avisoDoRealizado: null });
    expect(JSON.parse(JSON.stringify(a))).toEqual(a);
  });
});

describe("4.6/4.8 — o painel nunca grava", () => {
  const painel = readFileSync("src/components/app/assistente-fluxo.tsx", "utf8");
  const modulo = readFileSync("src/lib/fluxo-analise.ts", "utf8");
  it("não importa action nem banco, e não faz fetch", () => {
    for (const src of [painel, modulo]) {
      expect(src).not.toMatch(/@\/lib\/actions|@\/lib\/db|use server|fetch\(/);
    }
  });
  it("selo Somente leitura e rodapé dizendo que nada é alterado", () => {
    expect(painel).toContain("Somente leitura");
    expect(painel).toContain("Nada é alterado por este painel");
  });
});
