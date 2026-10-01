import { describe, expect, it } from "vitest";
import { confrontoCompraConsumo, consumoPorObra, type MovimentoParaObra } from "./estoque-obra";

const m = (p: Partial<MovimentoParaObra> & { id: string; tipo: string; valor: number }): MovimentoParaObra => ({ quantidade: p.valor / 10, projectId: null, despesaId: null, permutaId: null, despesaProjectId: null, estornoDeId: null, itemId: "cimento", itemNome: "Cimento", unidade: "sc", ...p });

describe("Estoque — consumo por obra e confronto (Prompt Y, 4.4 / 4.6)", () => {
  const movs = [
    m({ id: "e1", tipo: "entrada", valor: 1000, despesaId: "d1", despesaProjectId: "obra28" }), // comprou na 28
    m({ id: "e2", tipo: "entrada", valor: 200, despesaId: "d2", despesaProjectId: "obra31" }),
    m({ id: "e3", tipo: "entrada", valor: 300, permutaId: "p1" }), // permuta: não é compra nem consumo
    m({ id: "s1", tipo: "saida", valor: 700, projectId: "obra31" }), // consumiu na 31
    m({ id: "s2", tipo: "saida", valor: 100, projectId: "obra28" }),
    m({ id: "s3", tipo: "saida", valor: 50, projectId: "obra31", itemId: "areia", itemNome: "Areia", unidade: "m³" }),
    m({ id: "x1", tipo: "entrada", valor: 50, projectId: "obra31", estornoDeId: "s3", itemId: "areia", itemNome: "Areia", unidade: "m³" }), // estorno da saída s3
    m({ id: "x2", tipo: "saida", valor: 200, despesaId: "d2", despesaProjectId: "obra31", estornoDeId: "e2" }), // estorno da entrada e2
  ];
  it("4.4 — consumo por obra soma as saídas de consumo e desconta o estorno; permuta e entradas não entram", () => {
    const c = consumoPorObra(movs);
    expect(c.map((x) => [x.projectId, x.valor])).toEqual([["obra31", 700], ["obra28", 100]]);
    expect(c[0].itens).toEqual([{ itemId: "cimento", itemNome: "Cimento", unidade: "sc", quantidade: 70, valor: 700 }]); // areia zerou pelo estorno
  });
  it("10b / 4.6 — confronto: comprou pela despesa × consumiu pela saída; a diferença é leitura", () => {
    const c = confrontoCompraConsumo(movs);
    expect(c).toEqual([
      { projectId: "obra28", comprou: 1000, consumiu: 100, diferenca: 900 }, // comprou na 28, usou na 31
      { projectId: "obra31", comprou: 0, consumiu: 700, diferenca: -700 }, // e2 foi estornada
    ]);
  });
});
