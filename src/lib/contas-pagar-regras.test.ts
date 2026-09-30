import { describe, it, expect } from "vitest";
import { ehVersaoAtual, pendenteDaConta, totalPendente } from "./contas-pagar-regras";

describe("pendente de Contas a Pagar (Prompt I, §15)", () => {
  it("despesa de 100 com 80 pagos deve 20", () => {
    expect(pendenteDaConta({ status: "Parcialmente paga", valor: 100, saldo: 20 })).toBe(20);
  });
  it("paga: zero, mesmo com saldo residual de centavos", () => {
    expect(pendenteDaConta({ status: "Pago", valor: 100, saldo: 0.004 })).toBe(0);
  });
  it("sem saldo informado: valor cheio (linha antiga); saldo negativo não existe", () => {
    expect(pendenteDaConta({ status: "A pagar", valor: 100 })).toBe(100);
    expect(pendenteDaConta({ status: "A pagar", valor: 100, saldo: -5 })).toBe(0);
  });
  it("total em centavos exatos", () => {
    expect(
      totalPendente([
        { status: "A pagar", valor: 0.1, saldo: 0.1 },
        { status: "A pagar", valor: 0.2, saldo: 0.2 },
        { status: "Pago", valor: 50, saldo: 0 },
      ]),
    ).toBe(0.3);
  });
  it("§10 — só a Atual é obrigação", () => {
    expect(ehVersaoAtual("atual")).toBe(true);
    expect(ehVersaoAtual("forecast")).toBe(false);
    expect(ehVersaoAtual(null)).toBe(false);
  });
});
