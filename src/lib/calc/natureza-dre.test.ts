import { describe, it, expect } from "vitest";
import { CATEGORIAS_DRE } from "./constants";
import {
  ERRO_CATEGORIA_CREDORA,
  categoriaValidaParaDespesa,
  categoriasDeDespesa,
  ehCategoriaDre,
  naturezaCategoriaDre,
  validarCategoriaDespesa,
} from "./natureza-dre";

describe("natureza das categorias da DRE", () => {
  it("Receita é credora; todas as demais são devedoras", () => {
    expect(naturezaCategoriaDre("Receita")).toBe("credora");
    for (const c of CATEGORIAS_DRE.filter((x) => x !== "Receita")) {
      expect(naturezaCategoriaDre(c)).toBe("devedora");
    }
  });

  it("categoria desconhecida cai no lado seguro (devedora)", () => {
    // Classificar errado como receita é justamente o erro que este módulo
    // impede; o default nunca pode ser credora.
    expect(naturezaCategoriaDre("Categoria que ainda não existe")).toBe("devedora");
    expect(naturezaCategoriaDre(null)).toBe("devedora");
    expect(naturezaCategoriaDre(undefined)).toBe("devedora");
  });

  it("ignora espaços em volta", () => {
    expect(naturezaCategoriaDre("  Receita  ")).toBe("credora");
  });
});

describe("categoria válida para despesa (item 1.3)", () => {
  it("Receita é recusada", () => {
    expect(categoriaValidaParaDespesa("Receita")).toBe(false);
    expect(validarCategoriaDespesa("Receita")).toBe(ERRO_CATEGORIA_CREDORA);
  });

  it("Custo Variável e Custo Fixo são aceitos", () => {
    for (const c of ["Custo Variável", "Custo Fixo", "Despesa Fixa", "Investimento"]) {
      expect(categoriaValidaParaDespesa(c)).toBe(true);
      expect(validarCategoriaDespesa(c)).toBeNull();
    }
  });

  it("campo em branco é recusado com mensagem própria", () => {
    // O formulário passou a abrir em "Selecione…"; sem esta trava, deixar em
    // branco gravaria despesa sem classificação na DRE.
    expect(validarCategoriaDespesa("")).toBe("Selecione a categoria DRE da despesa.");
    expect(validarCategoriaDespesa(null)).toBe("Selecione a categoria DRE da despesa.");
    expect(validarCategoriaDespesa("   ")).toBe("Selecione a categoria DRE da despesa.");
  });
});

describe("dropdown de despesa", () => {
  it("não oferece Receita", () => {
    expect(categoriasDeDespesa()).not.toContain("Receita");
  });

  it("mantém todas as demais categorias, na ordem original", () => {
    const esperado = CATEGORIAS_DRE.filter((c) => c !== "Receita");
    expect(categoriasDeDespesa()).toEqual([...esperado]);
  });

  it("aceita uma lista customizada de categorias", () => {
    expect(categoriasDeDespesa(["Receita", "Custo Fixo"])).toEqual(["Custo Fixo"]);
  });

  it("a lista filtrada nunca fica vazia — a tela sempre tem o que oferecer", () => {
    expect(categoriasDeDespesa().length).toBeGreaterThan(0);
  });
});

describe("ehCategoriaDre", () => {
  it("reconhece as categorias conhecidas", () => {
    expect(ehCategoriaDre("Custo Fixo")).toBe(true);
    expect(ehCategoriaDre("Inventada")).toBe(false);
    expect(ehCategoriaDre(null)).toBe(false);
  });
});
