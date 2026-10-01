import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { analisarEstoque, casarItensComCadastro, unidadeDaLista, type ItemLido, type MaterialParaAnalise, type MovimentoParaAnalise } from "./estoque-analise";

const mat = (p: Partial<MaterialParaAnalise> & { id: string; nome: string }): MaterialParaAnalise => ({ sku: null, unidade: "un", custoUnit: 10, minimo: 0, saldo: 0, ativo: true, ...p });
const mov = (p: Partial<MovimentoParaAnalise> & { id: string; tipo: string; itemId: string }): MovimentoParaAnalise => ({ valor: 100, quantidade: 10, projectId: null, despesaId: null, permutaId: null, despesaProjectId: null, estornoDeId: null, itemNome: p.itemId, unidade: "un", data: "09/20/2026", docs: 0, ...p });

describe("assistente do Estoque (Prompt Y, 7)", () => {
  it("7.1 / 7.2 — casa itens da nota com o cadastro (nome dado pela IA, SKU, palavras) e propõe cadastro para o que não casou", () => {
    const materiais = [mat({ id: "cim", nome: "Cimento CP-II 50kg", unidade: "sc", custoUnit: 32, sku: "CIM50" }), mat({ id: "areia", nome: "Areia média", unidade: "m³", custoUnit: 90 }), mat({ id: "inativo", nome: "Tijolo", ativo: false })];
    const itens: ItemLido[] = [
      { descricao: "CIMENTO CP II 50KG", quantidade: 20, unidade: "SC", valorUnitario: 34, valorTotal: 680, materialCadastrado: "Cimento CP-II 50kg", confianca: "alta", nota: "" },
      { descricao: "AREIA MEDIA LAVADA", quantidade: 3, unidade: "M3", valorUnitario: 0, valorTotal: 300, materialCadastrado: "", confianca: "media", nota: "unidade deduzida" },
      { descricao: "TIJOLO 9 FUROS", quantidade: 1000, unidade: "UN", valorUnitario: 0.9, valorTotal: 900, materialCadastrado: "", confianca: "alta", nota: "" }, // só inativo: propõe cadastro
    ];
    const r = casarItensComCadastro(itens, materiais);
    expect(r[0]).toMatchObject({ materialId: "cim", custoCadastro: 32, custoNaNota: 34, desvioDeCusto: 0.06, cadastroProposto: null });
    expect(r[1]).toMatchObject({ materialId: "areia", custoNaNota: 100, desvioDeCusto: 0.11 });
    expect(r[2]).toMatchObject({ materialId: null, cadastroProposto: { nome: "TIJOLO 9 FUROS", unidade: "un", custoUnit: 0.9 } });
    expect(unidadeDaLista("M2")).toBe("m²");
    expect(unidadeDaLista("PC")).toBe("pç");
    expect(unidadeDaLista("xyz")).toBe("un");
  });

  it("7.3 — abaixo do mínimo com consumo médio, sem movimento, entrada sem origem, divergência de valor, entrada sem comprovação", () => {
    const materiais = [mat({ id: "a", nome: "A", minimo: 10, saldo: 4 }), mat({ id: "b", nome: "B", saldo: 50 }), mat({ id: "c", nome: "C", minimo: 1, saldo: 0 })];
    const movimentos = [
      mov({ id: "e1", tipo: "entrada", itemId: "a", despesaId: "d1", data: "09/01/2026", docs: 0 }),
      mov({ id: "s1", tipo: "saida", itemId: "a", projectId: "obra", quantidade: 30, valor: 300, data: "09/10/2026" }),
      mov({ id: "e2", tipo: "entrada", itemId: "b", data: "01/05/2026", docs: 1 }), // sem origem (antiga)
      mov({ id: "e3", tipo: "entrada", itemId: "a", despesaId: "d1", data: "08/15/2026", docs: 0 }),
    ];
    const a = analisarEstoque({ materiais, movimentos, despesas: [{ id: "d1", numDoc: "PED-1", valor: 100, entradasSoma: 200 }, { id: "d2", numDoc: "PED-2", valor: 100, entradasSoma: 101 }], hojeISO: "2026-09-30" });
    expect(a.abaixoDoMinimo.map((x) => [x.id, x.falta, x.consumoMedioMensal])).toEqual([["a", 6, 10], ["c", 1, 0]]); // 30 em 90 dias → 10/mês
    expect(a.semMovimento.map((x) => x.id)).toEqual(["c", "b"]); // c nunca; b há 248 dias
    expect(a.entradaSemOrigem.map((x) => x.id)).toEqual(["e2"]);
    expect(a.divergenciaDeValor).toEqual([{ despesaId: "d1", numDoc: "PED-1", valor: 100, entradasSoma: 200, diferenca: 100 }]); // d2 dentro da tolerância
    expect(a.entradaSemComprovacao).toEqual([{ mes: "2026-08", quantidade: 1, valor: 100 }, { mes: "2026-09", quantidade: 1, valor: 100 }]);
    expect(a.consumoPorObra).toEqual([{ projectId: "obra", valor: 300, itens: [{ itemId: "a", itemNome: "a", unidade: "un", quantidade: 30, valor: 300 }] }]);
  });

  it("17 / 7.4 — nenhum caminho de escrita sem confirmação: o módulo não importa ação nem banco; o painel não exclui, não estorna e não inativa", () => {
    expect(readFileSync("src/lib/estoque-analise.ts", "utf8")).not.toMatch(/@\/lib\/actions|@\/lib\/db|"use server"/);
    const painel = readFileSync("src/components/app/assistente-estoque.tsx", "utf8");
    expect(painel).not.toMatch(/deleteStockItem|estornarMovimento|setStockItemAtivo|updateStockItem|deleteStockMovementDoc/);
    // as únicas ações são a leitura (que não grava) e as duas confirmações por clique
    expect(painel).toMatch(/proporEntradasDaNota/);
    expect(painel).toMatch(/addStockMovement/);
    expect(painel).toMatch(/addStockItem/);
  });
});
