import { describe, it, expect } from "vitest";
import { MAX_CAMPOS, propostaValida } from "./cris";
import { MAX_CONTAS_PROPOSTAS, categoriaDaContaProposta, contasDaProposta, formularioDoPlano, recusaDaContaProposta } from "./planocontas-cris";

const grupos = [
  { code: "1", name: "Preliminares", kind: "cef" as const },
  { code: "A", name: "Administrativo", kind: "complementar" as const },
];

describe("Prompt G2 — a Cris propõe contas no Plano de Contas", () => {
  it("o formulário cabe no teto da Cris e só oferece grupos que existem", () => {
    const f = formularioDoPlano(grupos);
    expect(f.campos.length).toBe(MAX_CONTAS_PROPOSTAS * 5);
    expect(f.campos.length).toBeLessThanOrEqual(MAX_CAMPOS);
    expect(f.campos[0].opcoes).toEqual(["1 · Preliminares", "A · Administrativo"]);
  });

  it("a proposta vira a lista; grupo inventado e conta incompleta caem", () => {
    const f = formularioDoPlano(grupos);
    const p = propostaValida(
      { valores: { conta1_grupo: "1 · Preliminares", conta1_codigo: "1.11", conta1_nome: "Topografia", conta1_natureza: "despesa", conta2_grupo: "Z · Inventado", conta2_codigo: "Z.1", conta2_nome: "x", conta3_grupo: "A · Administrativo", conta3_codigo: "A.6", conta3_nome: "Seguro predial", conta3_categoria: "Despesa Fixa", conta4_grupo: "A · Administrativo", conta4_nome: "Sem código" } },
      f,
    )!;
    const lista = contasDaProposta(p.valores, grupos);
    expect(lista).toEqual([
      { groupCode: "1", code: "1.11", name: "Topografia", natureza: "despesa", dreCategory: null },
      { groupCode: "A", code: "A.6", name: "Seguro predial", natureza: "despesa", dreCategory: "Despesa Fixa" },
    ]);
    expect(categoriaDaContaProposta(lista[0], grupos)).toBe("Custo Variável");
  });

  it("recusas: código existente, fora do grupo, grupo que não existe, categoria que não serve", () => {
    const c = { groupCode: "1", code: "1.11", name: "x", natureza: "despesa" as const, dreCategory: null };
    expect(recusaDaContaProposta(c, grupos, new Set(["1.11"]))).toMatch(/já existe/);
    expect(recusaDaContaProposta({ ...c, code: "2.1" }, grupos, new Set())).toMatch(/começar por "1\./);
    expect(recusaDaContaProposta({ ...c, groupCode: "9" }, grupos, new Set())).toMatch(/crie o grupo/);
    expect(recusaDaContaProposta({ ...c, dreCategory: "Receita" }, grupos, new Set())).toMatch(/Receita/);
    expect(recusaDaContaProposta(c, grupos, new Set())).toBeNull();
  });
});
