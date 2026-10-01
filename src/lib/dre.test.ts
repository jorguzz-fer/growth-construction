import { describe, it, expect } from "vitest";
import {
  cenariosDaUrl,
  enumMonths,
  monthIndex,
  pctDaReceita,
  resolverCenario,
  resolverPeriodo,
  rotuloDaColuna,
  selecaoDaUrl,
  selecaoPadrao,
  textoDaCobertura,
  type VersaoLeve,
} from "./dre";
import { calendarYearWindows } from "./planning";

let n = 0;
const v = (kind: string, dia: number, p: Partial<VersaoLeve> = {}): VersaoLeve => ({
  id: `v${++n}`,
  kind,
  label: `${kind}-${dia}`,
  color: "#000",
  isDefault: false,
  sourceVersionId: null,
  createdAt: new Date(2026, 0, dia),
  ...p,
});

describe("Prompt AC · Parte 8 — regra fora da página", () => {
  it("período: os quatro modos, iguais aos de antes", () => {
    const axis = enumMonths("11/2025", "02/2026");
    const years = calendarYearWindows(axis, 2026);
    expect(resolverPeriodo("acum", "", "", axis, years).periodMonths).toBeNull();
    expect([...resolverPeriodo("2026", "", "", axis, years).periodMonths!]).toHaveLength(12);
    expect([...resolverPeriodo("custom", "12/2025", "01/2026", axis, years).periodMonths!]).toEqual(["12/2025", "01/2026"]);
    expect([...resolverPeriodo("custom", "01/2026", "", axis, years).periodMonths!]).toEqual(["01/2026", "02/2026"]);
    expect(resolverPeriodo("custom", "", "", axis, years).periodMonths).toBeNull();
    expect(monthIndex("13")).toBeNull();
    expect(enumMonths("02/2026", "12/2025")).toEqual(["12/2025", "01/2026", "02/2026"]);
  });
});

describe("Prompt AC · Parte 1 — comparação", () => {
  const atual = v("atual", 1);
  const orc1 = v("budget", 2);
  const orc2 = v("budget", 5);
  const copia = v("budget", 9, { sourceVersionId: "x" });
  const prev = v("forecast", 3);
  const todas = [copia, prev, atual, orc2, orc1];

  it("8 — padrão: Atual + Orçamento e Previsão mais recentes, sem cópia; ordem Orç, Prev, Real", () => {
    expect(selecaoPadrao(todas).map((x) => x.id)).toEqual([orc2.id, prev.id, atual.id]);
  });

  it("3 — id de ?vs= de outro projeto/tenant é descartado; o resto vem em ordem de cenário", () => {
    expect(selecaoDaUrl(todas, ["estranho", atual.id, copia.id]).map((x) => x.id)).toEqual([copia.id, atual.id]);
  });

  it("1.8 — o rótulo vem do kind; o nome digitado é complemento; cópia marcada", () => {
    expect(rotuloDaColuna({ ...atual, label: "Atual — caixa real" })).toEqual({ titulo: "Realizado", complemento: "Atual — caixa real" });
    expect(rotuloDaColuna(copia).titulo).toBe("Orçamento (cópia)");
  });

  it("4/5/6 — Empresa toda: a versão daquele kind NAQUELE projeto; sem fallback, projeto sem o cenário fica fora e é contado", () => {
    const pA = { id: "A", name: "A", versoes: [atual, orc1, orc2] };
    const pB = { id: "B", name: "B", versoes: [v("atual", 4)] };
    const sem = resolverCenario("budget", [pA, pB], false);
    expect(sem.map((r) => r.versao?.id ?? null)).toEqual([orc1.id, null]);
    expect(textoDaCobertura("budget", sem)).toBe("Orçamento: 1 de 2 projeto(s) têm; 1 sem Orçamento ficam fora desta coluna.");
    // com a regra de antes: o projeto B entra com a Atual — e a tela DIZ
    const com = resolverCenario("budget", [pA, pB], true);
    expect(com[1]).toMatchObject({ versao: pB.versoes[0], substituta: true });
    expect(textoDaCobertura("budget", com)).toMatch(/1 sem Orçamento entram com outra versão/);
    expect(textoDaCobertura("atual", resolverCenario("atual", [pA, pB], false))).toBeNull();
  });

  it("fallback idêntico a versionIdOfKind: pedido → atual → padrão → primeira criada", () => {
    const soPrev = { id: "C", name: "C", versoes: [v("forecast", 8), v("forecast", 7, { isDefault: true })] };
    expect(resolverCenario("budget", [soPrev], true)[0].versao?.label).toBe("forecast-7");
    const semPadrao = { id: "D", name: "D", versoes: [v("forecast", 8), v("forecast", 6)] };
    expect(resolverCenario("budget", [semPadrao], true)[0].versao?.label).toBe("forecast-6");
  });

  it("cenários da URL, compatível com o antigo vkind", () => {
    expect(cenariosDaUrl("atual,budget,xx", undefined)).toEqual(["budget", "atual"]);
    expect(cenariosDaUrl(undefined, "forecast")).toEqual(["forecast"]);
    expect(cenariosDaUrl(undefined, undefined)).toEqual(["atual"]);
  });

  it("11 — % Receita sobre a PRÓPRIA receita; sem receita positiva, ausente", () => {
    expect(pctDaReceita(50, 200)).toBe(25);
    expect(pctDaReceita(50, 0)).toBeNull();
    expect(pctDaReceita(50, -10)).toBeNull();
  });
});

import { CHAVE_DA_LINHA, eixoDeMeses, frasesDoRodape, janelaDoProjeto, linhaTemLancamento, resumirForaDaCascata, somarForaDaCascata } from "./dre";
import { emptyInputs, waterfall } from "./calc/dre-cascata";
import { brl0 } from "./utils";

describe("Prompt AC · Partes 4, 5, 7 e 9", () => {
  const rows = [
    { categoriaDre: null, competencia: "01/2026", valor: 100 },
    { categoriaDre: null, competencia: null, valor: 50 },
    { categoriaDre: "Custo Fixo", competencia: null, valor: 30 },
    { categoriaDre: "Custo Fixo", competencia: " ", valor: 20 },
    { categoriaDre: "Custo variavel", competencia: "01/2026", valor: 7 },
    { categoriaDre: "Despesa Fixa", competencia: "01/2026", valor: 999 },
  ];

  it("13/14/15 — sem categoria, sem competência e fora da lista: contados, com a grafia", () => {
    const f = resumirForaDaCascata(rows);
    expect(f.semCategoria).toEqual({ qtd: 2, valor: 150 });
    expect(f.semCompetencia).toEqual({ qtd: 2, valor: 50 });
    expect(f.foraDaLista).toEqual([{ categoria: "Custo variavel", qtd: 1, valor: 7 }]);
    const ac = frasesDoRodape(f, true, brl0);
    expect(ac[0]).toMatch(/em 2 lançamento\(s\) sem categoria não entram/);
    expect(ac[1]).toMatch(/estão somados neste Acumulado/);
    expect(ac[2]).toMatch(/“Custo variavel”, fora da lista/);
    expect(frasesDoRodape(f, false, brl0)[1]).toMatch(/não estão nesta visão: só entram no Acumulado/);
    expect(somarForaDaCascata([f, f]).semCategoria).toEqual({ qtd: 4, valor: 300 });
    expect(frasesDoRodape(resumirForaDaCascata([rows[5]]), true, brl0)).toEqual([]);
  });

  it("18/19 — eixo pela janela do projeto unida às competências com lançamento; sem datas, nunca inventado", () => {
    expect(janelaDoProjeto({ startDate: "11/15/2025", endDate: "02/01/2026" })).toEqual(["11/2025", "12/2025", "01/2026", "02/2026"]);
    expect(janelaDoProjeto({ startDate: null, endDate: "02/01/2026" })).toBeNull();
    expect(eixoDeMeses([["12/2025", "01/2026"], null], ["05/2026", " ", "01/2026"])).toEqual(["12/2025", "01/2026", "05/2026"]);
    expect(eixoDeMeses([null], [])).toEqual([]);
  });

  it("5.2/20 — toda linha de item da cascata tem chave; sem lançamento ≠ zero calculado", () => {
    const labels = waterfall([emptyInputs()]).rows.filter((r) => r.kind === "item").map((r) => r.label);
    for (const l of labels) expect(CHAVE_DA_LINHA, l).toHaveProperty([l]);
    expect(CHAVE_DA_LINHA["(−) Investimentos"]).toBe("Investimento");
    const vazio = emptyInputs();
    expect(linhaTemLancamento("(−) Custo Fixo", [vazio])).toBe(false);
    expect(linhaTemLancamento("(−) Custo Fixo", [{ ...vazio, byCat: { "Custo Fixo": 0 } }])).toBe(true);
    expect(linhaTemLancamento("Receita", [{ ...vazio, receita: 10 }])).toBe(true);
    expect(linhaTemLancamento("= EBITDA", [vazio])).toBe(true);
  });
});
