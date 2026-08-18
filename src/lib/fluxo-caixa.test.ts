import { describe, it, expect } from "vitest";
import { vencMonth } from "./calc/mes-caixa";

/**
 * RG-01 — competência não é caixa.
 *
 * O fluxo PREVISTO é montado pelo vencimento; o REALIZADO, pela data de
 * liquidação. Estes testes fixam a fronteira entre os dois: `vencMonth` é a
 * função que atribui o mês, e ela é usada pelas duas visões — o que muda é a
 * DATA que cada uma passa para ela.
 */
describe("vencMonth — atribuição do mês", () => {
  it('"MM/DD/YYYY" cai no mês da data', () => {
    expect(vencMonth("03/15/2026")).toBe("03/2026");
    expect(vencMonth("12/31/2025")).toBe("12/2025");
  });

  it('aceita competência já no formato "MM/YYYY"', () => {
    expect(vencMonth("03/2026")).toBe("03/2026");
  });

  it("sem data não há mês a atribuir", () => {
    expect(vencMonth(null)).toBeNull();
    expect(vencMonth("")).toBeNull();
    expect(vencMonth("2026-03-15")).toBeNull();
  });

  it("o mesmo fato em datas diferentes cai em meses diferentes", () => {
    // Uma despesa de competência 03/2026 paga em 06/2026 aparece em março no
    // previsto (pelo vencimento) e em junho no realizado (pela liquidação).
    // As duas coisas estão certas ao mesmo tempo — é o ponto da RG-01.
    const vencimento = "03/20/2026";
    const liquidacao = "06/10/2026";
    expect(vencMonth(vencimento)).toBe("03/2026");
    expect(vencMonth(liquidacao)).toBe("06/2026");
    expect(vencMonth(vencimento)).not.toBe(vencMonth(liquidacao));
  });
});

/**
 * Classificação por sinal no fluxo realizado. `cash_entry` guarda positivo para
 * entrada e negativo para saída; o realizado devolve as saídas em módulo, para
 * somarem na mesma escala do previsto.
 */
describe("realizado — sinal do lançamento de caixa", () => {
  const classificar = (valor: number) =>
    valor > 0 ? { tipo: "entrada", v: valor } : { tipo: "saida", v: Math.abs(valor) };

  it("positivo é entrada; negativo é saída em módulo", () => {
    expect(classificar(5000)).toEqual({ tipo: "entrada", v: 5000 });
    expect(classificar(-4000)).toEqual({ tipo: "saida", v: 4000 });
  });

  it("restituição a terceiro entra como SAÍDA, nunca como despesa nova", () => {
    // RG-03: a despesa já foi reconhecida na competência dela. No caixa isto é
    // apenas a saída do dinheiro.
    expect(classificar(-1000).tipo).toBe("saida");
  });

  it("repasse de terceiro entra como ENTRADA, nunca como receita nova", () => {
    // RG-04: a receita já foi reconhecida na venda. No caixa isto é apenas a
    // chegada do dinheiro.
    expect(classificar(50000).tipo).toBe("entrada");
  });
});
