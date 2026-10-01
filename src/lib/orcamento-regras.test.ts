import { describe, it, expect } from "vitest";
import {
  gruposDisponiveis,
  linhasDoBloco,
  recusaDaInclusao,
  recusaDaRemocao,
  resumoDaRemocao,
  textoDaRemocao,
  totalReceitasDoProjeto,
  type GrupoDoPlano,
} from "./orcamento-regras";
import { RECEITAS_PROJETO_KEY } from "./budget/config";

const g = (groupCode: string, natureza: "receita" | "despesa", ativo = true, kind: "cef" | "complementar" = "complementar"): GrupoDoPlano => ({ groupCode, groupName: `Grupo ${groupCode}`, kind, natureza, ativo });
const grupos = [g("1", "despesa", true, "cef"), g("F", "despesa"), g("OR", "receita"), g("X", "receita", false)];
const pctDe = (kind: string, rowKey: string): Record<string, number> => (rowKey === "Receita" ? { "01/2026": 20 } : rowKey === "1" ? { "01/2026": 50, "02/2026": 50 } : {});

describe("Prompt D · total de Receitas do Projeto (BD-1)", () => {
  it("entrada financeira: construção; mais terreno só quando passa pelo caixa", () => {
    expect(totalReceitasDoProjeto({ valorConstrucao: "270000", valorTerreno: "105000", terrenoForaCaixa: true })).toBe(270000);
    expect(totalReceitasDoProjeto({ valorConstrucao: "270000", valorTerreno: "105000", terrenoForaCaixa: false })).toBe(375000);
  });
  it("cadastro sem valor de receita = null (falta preencher, não zero)", () => {
    expect(totalReceitasDoProjeto({ valorConstrucao: null, valorTerreno: null, terrenoForaCaixa: true })).toBeNull();
    expect(totalReceitasDoProjeto({ valorConstrucao: "", valorTerreno: "100", terrenoForaCaixa: true })).toBeNull();
    expect(totalReceitasDoProjeto({ valorConstrucao: "", valorTerreno: "100", terrenoForaCaixa: false })).toBe(100);
  });
});

describe("Prompt D · linhas do bloco (3, 4, 4-A, BD-6)", () => {
  it("receitas: linha fixa primeiro, grupos de receita ativos, legada 'Receita' visível; sem fallback", () => {
    const rows = linhasDoBloco({ nat: "receita", grupos, selecao: null, contas: [{ kind: "receita", rowKey: "Receita", dreCategory: "Receita", total: 204140.4 }], pctDe, totalDoCadastro: 270000 });
    expect(rows.map((r) => `${r.rowKey}${r.fixa ? "*" : ""}${r.fromChart ? "" : "~"}`)).toEqual([`${RECEITAS_PROJETO_KEY}*~`, "OR", "Receita~"]);
    expect(rows[0].total).toBe(270000);
    expect(rows[0].semTotalNoCadastro).toBe(false);
    expect(rows[2].total).toBe(204140.4);
    expect(rows[2].pct).toEqual({ "01/2026": 20 });
    // nenhum grupo de despesa entrou no bloco de receitas (fim do fallback)
    expect(rows.some((r) => r.rowKey === "1" || r.rowKey === "F")).toBe(false);
  });
  it("sem valor no cadastro a fixa marca semTotalNoCadastro e total 0 (a tela mostra 'falta preencher')", () => {
    const rows = linhasDoBloco({ nat: "receita", grupos, selecao: null, contas: [], pctDe, totalDoCadastro: null });
    expect(rows[0]).toMatchObject({ rowKey: RECEITAS_PROJETO_KEY, total: 0, semTotalNoCadastro: true });
  });
  it("despesas: padrão = todos os grupos ativos da natureza, na ordem do plano", () => {
    const rows = linhasDoBloco({ nat: "despesa", grupos, selecao: null, contas: [], pctDe, totalDoCadastro: null });
    expect(rows.map((r) => r.rowKey)).toEqual(["1", "F"]);
    expect(rows[0].dreCategory).toBe("Custo Variável");
    expect(rows[1].dreCategory).toBe("Despesa Fixa");
  });
  it("com seleção gravada: só os selecionados, na ordem da seleção; grupo com dado fora da seleção continua aparecendo", () => {
    const rows = linhasDoBloco({ nat: "despesa", grupos, selecao: ["F"], contas: [{ kind: "despesa", rowKey: "1", dreCategory: "Custo Fixo", total: 10 }], pctDe, totalDoCadastro: null });
    expect(rows.map((r) => `${r.rowKey}${r.fromChart ? "" : "~"}`)).toEqual(["F", "1~"]);
    expect(rows[1].label).toBe("Grupo 1");
    expect(rows[1].dreCategory).toBe("Custo Fixo");
  });
  it("grupo inativado com dado continua exibido como legado (4-A.5)", () => {
    const rows = linhasDoBloco({ nat: "receita", grupos, selecao: null, contas: [{ kind: "receita", rowKey: "X", dreCategory: "Receita", total: 5 }], pctDe, totalDoCadastro: 1 });
    expect(rows.map((r) => r.rowKey)).toEqual([RECEITAS_PROJETO_KEY, "OR", "X"]);
    expect(rows[2].fromChart).toBe(false);
  });
});

describe("Prompt D · incluir e excluir (4-A.2 a 4-A.4)", () => {
  it("lista de inclusão: ativos, da natureza, ausentes da grade", () => {
    expect(gruposDisponiveis(grupos, "despesa", ["1"]).map((x) => x.groupCode)).toEqual(["F"]);
    expect(gruposDisponiveis(grupos, "receita", []).map((x) => x.groupCode)).toEqual(["OR"]);
  });
  it("recusas de inclusão", () => {
    expect(recusaDaInclusao(undefined, "despesa", [])).toMatch(/Cadastre-o lá/);
    expect(recusaDaInclusao(g("X", "receita", false), "receita", [])).toMatch(/inativo/);
    expect(recusaDaInclusao(g("OR", "receita"), "despesa", [])).toMatch(/é de receita/);
    expect(recusaDaInclusao(g("F", "despesa"), "despesa", ["F"])).toMatch(/já está/);
    expect(recusaDaInclusao(g("F", "despesa"), "despesa", [])).toBeNull();
  });
  it("fixa e legada não saem; grupo do plano sai", () => {
    expect(recusaDaRemocao({ fixa: true, fromChart: false })).toMatch(/fixa/);
    expect(recusaDaRemocao({ fixa: false, fromChart: false })).toMatch(/legada/);
    expect(recusaDaRemocao({ fixa: false, fromChart: true })).toBeNull();
  });
  it("resumo e texto da remoção dizem o que se perde", () => {
    const brl = (n: number) => `R$ ${n}`;
    expect(resumoDaRemocao(0, { "01/2026": 0 })).toEqual({ total: 0, competencias: 0, temValor: false });
    expect(textoDaRemocao("Grupo F", resumoDaRemocao(0, {}), brl)).toMatch(/Retirar/);
    const r = resumoDaRemocao(1500, { "01/2026": 50, "02/2026": 50 });
    expect(r).toEqual({ total: 1500, competencias: 2, temValor: true });
    expect(textoDaRemocao("Grupo F", r, brl)).toMatch(/Remover o lançamento.*2 competência.*R\$ 1500/);
  });
});
