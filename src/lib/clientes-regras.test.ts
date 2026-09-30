import { describe, it, expect } from "vitest";
import { bloqueiosDeExclusao, confirmacaoConfere, statusLiberaUnidade } from "./clientes-regras";

describe("statusLiberaUnidade (Prompt M, 6.2)", () => {
  it("libera os status de distrato/cancelamento, sem diferenciar caixa, acento e espaço", () => {
    for (const s of ["Distratado", "distratado", " DISTRATO ", "Cancelado", "cancelada"]) {
      expect(statusLiberaUnidade(s)).toBe(true);
    }
  });
  it("em branco ou qualquer outro status: NÃO libera (a unidade segue reservada)", () => {
    for (const s of [null, undefined, "", "  ", "Ativo", "Assinado", "Em análise"]) {
      expect(statusLiberaUnidade(s)).toBe(false);
    }
  });
});

describe("confirmacaoConfere (6.1)", () => {
  it("exige o nome, sem diferenciar caixa, acento e espaços das pontas", () => {
    expect(confirmacaoConfere("joão da silva", "João da Silva")).toBe(true);
    expect(confirmacaoConfere(" JOAO DA SILVA ", "João da Silva")).toBe(true);
    expect(confirmacaoConfere("João", "João da Silva")).toBe(false);
    expect(confirmacaoConfere("", "")).toBe(false);
    expect(confirmacaoConfere(null, "X")).toBe(false);
  });
});

describe("bloqueiosDeExclusao (6.1)", () => {
  const livre = { unidadeComContratoAtivo: null, contasReceber: 0, documentos: 0, obrasComoCliente: 0, recebimentosTerceiros: 0 };
  it("sem vínculos, nada bloqueia", () => {
    expect(bloqueiosDeExclusao(livre)).toEqual([]);
  });
  it("cada vínculo vira um motivo legível", () => {
    const m = bloqueiosDeExclusao({ unidadeComContratoAtivo: "A-101", contasReceber: 2, documentos: 1, obrasComoCliente: 1, recebimentosTerceiros: 3 });
    expect(m).toHaveLength(5);
    expect(m[0]).toContain("A-101");
    expect(m[1]).toContain("2 conta(s) a receber");
  });
});
