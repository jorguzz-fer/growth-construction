import { describe, expect, it } from "vitest";
import { avisosDaOrdem, exportacaoValida, nomeDoArquivo, tabelaDashboard, tabelaDre, tabelaRascunho, tabelaResumo, temPreviaExportavel } from "./chaves-previa";

const agora = new Date("2026-10-02T12:00:00Z");
const diasAtras = (n: number) => new Date(agora.getTime() - n * 24 * 60 * 60 * 1000);
const titulos = { dashboard_definicao_nova: "Dashboard", fluxo_definicao_nova: "Fluxo", resumo_definicao_nova: "Resumo", dre_definicao_nova: "DRE" };

describe("chaves — prévia exportada e ordem combinada (01/10)", () => {
  it("só as chaves com prévia em /chaves exportam", () => {
    expect(temPreviaExportavel("dre_definicao_nova")).toBe(true);
    expect(temPreviaExportavel("rascunho_fora_dos_relatorios")).toBe(true);
    expect(temPreviaExportavel("membro_padrao_restrito")).toBe(false);
    expect(temPreviaExportavel(null)).toBe(false);
  });

  it("exportação vale por 7 dias", () => {
    expect(exportacaoValida(diasAtras(6), agora)).toBe(true);
    expect(exportacaoValida(diasAtras(8), agora)).toBe(false);
    expect(exportacaoValida(null, agora)).toBe(false);
  });

  it("ordem: dashboard, fluxo, resumo, dre — avisa a anterior desligada", () => {
    const vazio = new Map();
    expect(avisosDaOrdem("dashboard_definicao_nova", vazio, titulos, agora)).toEqual([]);
    expect(avisosDaOrdem("dre_definicao_nova", vazio, titulos, agora)[0]).toBe("Pela ordem combinada, antes desta vem: Dashboard, Fluxo, Resumo.");
    expect(avisosDaOrdem("rascunho_fora_dos_relatorios", vazio, titulos, agora)).toEqual([]);
  });

  it("avisa outra das quatro ligada há poucos dias; não avisa depois disso", () => {
    const recente = new Map([["dashboard_definicao_nova", { ligada: true, alteradaEm: diasAtras(1) }]]);
    expect(avisosDaOrdem("fluxo_definicao_nova", recente, titulos, agora)).toEqual(["Dashboard foi ligada há 1 dia(s); o combinado é esperar alguns dias entre uma e outra."]);
    const antiga = new Map([["dashboard_definicao_nova", { ligada: true, alteradaEm: diasAtras(5) }]]);
    expect(avisosDaOrdem("fluxo_definicao_nova", antiga, titulos, agora)).toEqual([]);
  });

  it("tabelas: diferença só com os dois lados; ausência fica vazia, não zero", () => {
    const d = tabelaDashboard([{ projeto: "Obra", linhas: [{ cartao: "% executado", hoje: null, nova: 40, tipo: "pct" }, { cartao: "VGV", hoje: 10, nova: 15, tipo: "brl" }] }]);
    expect(d.linhas).toEqual([["Obra", "% executado", "%", null, 40, null], ["Obra", "VGV", "R$", 10, 15, 5]]);
    const r = tabelaResumo([{ projeto: "Sem", temAtual: false, linhas: [] }]);
    expect(r.linhas).toEqual([["Sem", "sem versão Atual: nada a comparar", null, null, null]]);
  });

  it("checklist do rascunho: projeto, nome, total de receitas e despesas", () => {
    const t = tabelaRascunho([{ projeto: "P", nome: "v1", kind: "budget", status: "Rascunho", receitas: 100, despesas: 80 }]);
    expect(t.cabecalho).toEqual(["Projeto", "Versão", "Tipo", "Situação", "Total receitas", "Total despesas"]);
    expect(t.linhas).toEqual([["P", "v1", "Orçamento", "Rascunho", 100, 80]]);
  });

  it("DRE: uma linha por projeto e uma por competência que muda", () => {
    const t = tabelaDre([{ projeto: "P", hoje: 10, nova: 7, meses: [{ mes: "2026-01", hoje: 5, nova: 2 }], comoReceita: [], semCenario: ["budget"] }]);
    expect(t.linhas).toEqual([
      ["P", "Resultado Final", 10, 7, -3],
      ["P", "Competência 2026-01", 5, 2, -3],
      ["P", "Sem Orçamento: na Empresa toda, fica fora dessa coluna", null, null, null],
    ]);
  });

  it("nome do arquivo leva a chave e a data", () => {
    expect(nomeDoArquivo("dre_definicao_nova", agora)).toBe("previa-dre_definicao_nova-2026-10-02.xlsx");
  });
});
