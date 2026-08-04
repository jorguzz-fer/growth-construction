import { describe, it, expect } from "vitest";
import { grupoAtivo, naturezaDoGrupo } from "./natureza-grupo";

/**
 * Regressão do "lançamento de projeção de receitas travado".
 *
 * As linhas do Budget/Forecast vêm dos grupos do Plano de Contas. A natureza do
 * grupo era fixada pelo PRIMEIRO subitem encontrado e nunca reavaliada; como a
 * coluna `natureza` tem default "despesa", um grupo cujo primeiro subitem
 * estivesse no default sumia do bloco de receitas e a tela ficava sem nenhuma
 * linha para lançar.
 */
describe("naturezaDoGrupo", () => {
  it("é receita quando ALGUM subitem é receita, mesmo que não seja o primeiro", () => {
    // Este é exatamente o caso que travava a tela.
    expect(
      naturezaDoGrupo([{ natureza: "despesa" }, { natureza: "receita" }]),
    ).toBe("receita");
  });

  it("é receita quando o primeiro subitem já é receita", () => {
    expect(
      naturezaDoGrupo([{ natureza: "receita" }, { natureza: "despesa" }]),
    ).toBe("receita");
  });

  it("não vira receita por causa do default quando nenhum subitem é receita", () => {
    expect(naturezaDoGrupo([{ natureza: "despesa" }, { natureza: "despesa" }])).toBe(
      "despesa",
    );
  });

  it("trata natureza ausente/nula como despesa (default da coluna)", () => {
    expect(naturezaDoGrupo([{ natureza: null }, {}])).toBe("despesa");
    expect(naturezaDoGrupo([{ natureza: null }, { natureza: "receita" }])).toBe(
      "receita",
    );
  });

  it("grupo vazio é despesa (não inventa receita)", () => {
    expect(naturezaDoGrupo([])).toBe("despesa");
  });

  it("independe da ordem dos subitens", () => {
    const itens = [{ natureza: "despesa" }, { natureza: "receita" }, { natureza: null }];
    expect(naturezaDoGrupo(itens)).toBe("receita");
    expect(naturezaDoGrupo([...itens].reverse())).toBe("receita");
  });
});

describe("grupoAtivo", () => {
  it("é ativo se algum subitem estiver ativo", () => {
    expect(grupoAtivo([{ ativo: false }, { ativo: true }])).toBe(true);
  });

  it("é inativo quando todos os subitens estão inativos", () => {
    expect(grupoAtivo([{ ativo: false }, { ativo: false }])).toBe(false);
  });

  it("ativo ausente conta como ativo (default do sistema)", () => {
    expect(grupoAtivo([{}])).toBe(true);
  });

  it("grupo sem subitens não é ativo", () => {
    expect(grupoAtivo([])).toBe(false);
  });
});
