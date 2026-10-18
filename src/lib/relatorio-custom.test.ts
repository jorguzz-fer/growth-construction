import { describe, it, expect } from "vitest";
import { waterfall } from "@/lib/calc/dre-cascata";
import { paraInputs, type EntradaAnalitica } from "@/lib/dre-analitica";
import { RECEITA_PADRAO, csvDaTabela, descricaoDaReceita, montarTabela, receitaValida, urlDaReceita } from "./relatorio-custom";

const OBRAS = ["obra-1", "obra-2"];
const contas = [{ code: "1.1", name: "Técnicos", groupCode: "1", groupName: "Preliminares" }, { code: "A.1", name: "Aluguel", groupCode: "A", groupName: "Administrativo" }];
const e = (receita: number, lancs: EntradaAnalitica["lancamentos"]): EntradaAnalitica => ({ receitaVendas: receita, receitaPermuta: 0, encargos: 0, lancamentos: lancs });

describe("Prompt RC — a receita do relatório", () => {
  it("valida o que vem da URL ou do modelo; fora do domínio cai no padrão", () => {
    expect(receitaValida({}, OBRAS)).toEqual(RECEITA_PADRAO);
    const r = receitaValida({ fonte: "fluxo", colunas: "mes", cenarios: ["budget", "budget", "x"], proj: "obra-2", de: "1/2026", ate: "13/2026", av: "1", titulo: "  Meu  " }, OBRAS);
    expect(r).toEqual({ titulo: "Meu", fonte: "fluxo", colunas: "mes", cenarios: ["budget"], proj: "obra-2", de: "01/2026", ate: "", av: true });
  });

  it("obra que a pessoa não vê não entra (cai na empresa toda)", () => {
    expect(receitaValida({ proj: "obra-de-outro" }, OBRAS).proj).toBe("all");
    expect(receitaValida({ proj: "ativos" }, OBRAS).proj).toBe("ativos");
  });

  it("vai e volta pela URL; cenários repetidos na query viram lista", () => {
    const r = receitaValida({ fonte: "dre", colunas: "cenario", cenarios: "atual,budget", proj: "obra-1", de: "01/2026", ate: "06/2026", av: true, titulo: "T" }, OBRAS);
    const url = urlDaReceita(r);
    expect(url.startsWith("/relatorios?")).toBe(true);
    const volta = receitaValida(Object.fromEntries(new URLSearchParams(url.split("?")[1])), OBRAS);
    expect(volta).toEqual(r);
    expect(receitaValida({ cenarios: ["atual", "forecast"] }, OBRAS).cenarios).toEqual(["atual", "forecast"]);
    expect(descricaoDaReceita(r, "Obra 1")).toMatch(/DRE por cenário · Atual × Orçamento · Obra 1 · 01\/2026 a 06\/2026 · com análise vertical/);
  });
});

describe("Prompt RC — a tabela", () => {
  const colunas = [
    { chave: "a", titulo: "Atual", dre: e(1000, [{ categoria: "Custo Variável", conta: "1.1", valor: 300 }]) },
    { chave: "b", titulo: "Orçamento", dre: e(2000, [{ categoria: "Despesa Fixa", conta: "A.1", valor: 100 }]) },
  ];

  it("DRE: a cascata por coluna, com a análise vertical", () => {
    const t = montarTabela("dre", colunas, contas, true);
    expect(t.colunas).toEqual(["Atual", "Orçamento"]);
    expect(t.linhas.map((l) => l.label)).toEqual(waterfall([paraInputs(colunas[0].dre)]).rows.map((r) => r.label));
    const rf = t.linhas.find((l) => l.id === "final")!;
    expect(rf.valores).toEqual([700, 1900]);
    expect(rf.pcts![0]).toBeCloseTo(70, 6);
  });

  it("DRE por categoria e grupo: grupos de todas as colunas aparecem, logo abaixo da categoria", () => {
    const t = montarTabela("dreanalitica", colunas, contas, false);
    const ids = t.linhas.map((l) => l.id);
    expect(ids).toContain("cat:Custo Variável:g:1");
    expect(ids).toContain("cat:Despesa Fixa:g:A");
    expect(ids.indexOf("cat:Despesa Fixa:g:A")).toBe(ids.indexOf("cat:Despesa Fixa") + 1);
    expect(t.linhas.find((l) => l.id === "cat:Despesa Fixa:g:A")!.valores).toEqual([0, 100]);
    expect(t.linhas.every((l) => l.pcts === null)).toBe(true);
  });

  it("Fluxo: entradas, saídas e saldo; % das entradas", () => {
    const t = montarTabela("fluxo", [{ chave: "x", titulo: "10/2026", fluxo: { entradas: 500, saidas: 200 } }], [], true);
    expect(t.linhas.map((l) => [l.label, l.valores[0]])).toEqual([["Entradas", 500], ["(−) Saídas", 200], ["= Saldo do período", 300]]);
    expect(t.linhas[1].pcts![0]).toBeCloseTo(40, 6);
    expect(t.rotuloPct).toBe("% Entradas");
  });

  it("CSV com ponto e vírgula e vírgula decimal", () => {
    const csv = csvDaTabela(montarTabela("fluxo", [{ chave: "x", titulo: "Total", fluxo: { entradas: 1234.5, saidas: 0 } }], [], false));
    expect(csv.split("\n")[0]).toBe("Item;Total");
    expect(csv.split("\n")[1]).toBe("Entradas;1234,50");
  });
});
