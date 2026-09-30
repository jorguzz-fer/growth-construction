import { describe, it, expect } from "vitest";
import {
  principalDoPagamento,
  recusaDePagamento,
  statusDaDespesaPelasParcelas,
  statusDaDespesaPorAcumulado,
  statusDaParcela,
} from "./pagamento-regras";

describe("pagamento — status pelo acumulado (Prompt I, §13 e §14)", () => {
  it("principal: encargos não abatem, desconto abate", () => {
    expect(principalDoPagamento({ valorTotalPago: 100 })).toBe(100);
    expect(principalDoPagamento({ valorTotalPago: 110, multa: 5, juros: 5 })).toBe(100);
    expect(principalDoPagamento({ valorTotalPago: 90, desconto: 10 })).toBe(100);
  });

  it("§47.7 despesa 100, pagos 60 e 40: Pago pelo acumulado, não parcial pelo último", () => {
    expect(statusDaDespesaPorAcumulado(100, 60)).toBe("Parcialmente paga");
    expect(statusDaDespesaPorAcumulado(100, 100)).toBe("Pago");
    expect(statusDaDespesaPorAcumulado(100, 99.995)).toBe("Pago");
    expect(statusDaDespesaPorAcumulado(100, 0)).toBe("A pagar");
  });

  it("parcela: Pendente → Pago parcialmente → Pago", () => {
    expect(statusDaParcela(50, 0)).toBe("Pendente");
    expect(statusDaParcela(50, 20)).toBe("Pago parcialmente");
    expect(statusDaParcela(50, 50)).toBe("Pago");
  });

  it("§47.10 despesa-mãe: todas as parcelas pagas = Pago; parte = Parcialmente paga; nada = A pagar", () => {
    const pend = { status: "Pendente", valorPago: 0 };
    const pago = { status: "Pago", valorPago: 50 };
    expect(statusDaDespesaPelasParcelas([pago, pago])).toBe("Pago");
    expect(statusDaDespesaPelasParcelas([pago, pend])).toBe("Parcialmente paga");
    expect(statusDaDespesaPelasParcelas([{ status: "Pago parcialmente", valorPago: 10 }, pend])).toBe("Parcialmente paga");
    expect(statusDaDespesaPelasParcelas([pend, pend])).toBe("A pagar");
    expect(statusDaDespesaPelasParcelas([])).toBe("A pagar");
  });

  it("recusa valor não positivo e data ausente", () => {
    expect(recusaDePagamento({ valorTotalPago: 10, dataPagamento: "09/29/2026" })).toBeNull();
    expect(recusaDePagamento({ valorTotalPago: 0, dataPagamento: "09/29/2026" })).toMatch(/maior que zero/);
    expect(recusaDePagamento({ valorTotalPago: -1, dataPagamento: "09/29/2026" })).toMatch(/maior que zero/);
    expect(recusaDePagamento({ valorTotalPago: 10, dataPagamento: "" })).toMatch(/data/);
  });
});
