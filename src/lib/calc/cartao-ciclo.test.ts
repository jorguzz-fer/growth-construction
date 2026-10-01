import { describe, expect, it } from "vitest";
import { cicloAberto, disponivelDoLimite, faturaDaCompra, faturaSeguinte, faturasDasParcelas, recusaDoCartao, somenteUltimos4 } from "./cartao-ciclo";

describe("ciclo do cartão (Prompt U, 2.1–2.3)", () => {
  const c = { diaFechamento: 10, diaVencimento: 20 };
  it("3 — compra até o fechamento cai na fatura que fecha; depois, na seguinte", () => {
    expect(faturaDaCompra("03/10/2026", c)).toEqual({ fechamento: "03/10/2026", vencimento: "03/20/2026" });
    expect(faturaDaCompra("03/11/2026", c)).toEqual({ fechamento: "04/10/2026", vencimento: "04/20/2026" });
    expect(faturaDaCompra("12/15/2026", c)).toEqual({ fechamento: "01/10/2027", vencimento: "01/20/2027" });
  });
  it("4 — vencimento menor que fechamento: vence no mês seguinte (fecha 28, vence 5)", () => {
    const b = { diaFechamento: 28, diaVencimento: 5 };
    expect(faturaDaCompra("01/20/2026", b)).toEqual({ fechamento: "01/28/2026", vencimento: "02/05/2026" });
    expect(faturaDaCompra("01/29/2026", b)).toEqual({ fechamento: "02/28/2026", vencimento: "03/05/2026" });
    expect(faturaDaCompra("12/30/2026", b)).toEqual({ fechamento: "01/28/2027", vencimento: "02/05/2027" });
    // igual também vai para o mês seguinte
    expect(faturaDaCompra("01/01/2026", { diaFechamento: 10, diaVencimento: 10 })?.vencimento).toBe("02/10/2026");
  });
  it("dia maior que o mês cai no último dia (31 em fevereiro)", () => {
    const b = { diaFechamento: 31, diaVencimento: 10 };
    expect(faturaDaCompra("02/28/2026", b)).toEqual({ fechamento: "02/28/2026", vencimento: "03/10/2026" });
    expect(faturaDaCompra("02/29/2028", b)?.fechamento).toBe("02/29/2028");
    expect(faturaDaCompra("04/30/2026", b)?.fechamento).toBe("04/30/2026");
  });
  it("5 — compra em 6x: seis faturas consecutivas, uma por ciclo", () => {
    const f = faturasDasParcelas("03/11/2026", 6, c);
    expect(f.map((x) => x.fechamento)).toEqual(["04/10/2026", "05/10/2026", "06/10/2026", "07/10/2026", "08/10/2026", "09/10/2026"]);
    expect(f[5].vencimento).toBe("09/20/2026");
    expect(faturasDasParcelas("03/11/2026", 1, c)).toEqual([faturaDaCompra("03/11/2026", c)]);
    expect(faturasDasParcelas("xx", 3, c)).toEqual([]);
  });
  it("ciclo aberto hoje e fatura seguinte", () => {
    expect(cicloAberto("2026-09-30", c)).toEqual({ fechamento: "10/10/2026", vencimento: "10/20/2026" });
    expect(faturaSeguinte({ fechamento: "10/10/2026", vencimento: "10/20/2026" }, c)).toEqual({ fechamento: "11/10/2026", vencimento: "11/20/2026" });
  });
  it("limite disponível", () => {
    expect(disponivelDoLimite(10000, 2500.5)).toBe(7499.5);
    expect(disponivelDoLimite(null, 100)).toBeNull();
  });
  it("17 — só quatro dígitos; número completo é recusado, não truncado", () => {
    expect(somenteUltimos4("1234")).toEqual({ ok: true, ultimos4: "1234" });
    expect(somenteUltimos4(" 12-34 ")).toEqual({ ok: true, ultimos4: "1234" });
    expect(somenteUltimos4("")).toEqual({ ok: true, ultimos4: null });
    expect(somenteUltimos4("4111 1111 1111 1234").ok).toBe(false);
    expect(somenteUltimos4("123").ok).toBe(false);
  });
  it("recusas do cadastro", () => {
    const ok = { apelido: "Itaú", diaFechamento: 10, diaVencimento: 20, limite: 5000, taxaRotativo: null };
    expect(recusaDoCartao(ok)).toBeNull();
    expect(recusaDoCartao({ ...ok, apelido: " " })).toMatch(/apelido/);
    expect(recusaDoCartao({ ...ok, diaFechamento: 0 })).toMatch(/fechamento/);
    expect(recusaDoCartao({ ...ok, diaVencimento: 32 })).toMatch(/vencimento/);
    expect(recusaDoCartao({ ...ok, limite: -1 })).toMatch(/Limite/);
    expect(recusaDoCartao({ ...ok, taxaRotativo: 120 })).toMatch(/Taxa/);
  });
});
