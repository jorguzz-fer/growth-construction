import { describe, expect, it } from "vitest";
import { estadoDaFatura, linhaDaFatura, linhasComFaturas, saldoDaFatura, statusDaFatura } from "./fatura";

const f = (over: Partial<Parameters<typeof linhaDaFatura>[0]> = {}) => ({
  id: "F1", cartaoId: "C1", cartaoNome: "Itaú •••• 1234", fechamento: "10/10/2026", vencimento: "10/20/2026", valorCompras: 300, valorPago: 0, qtdCompras: 2, ...over,
});

describe("fatura de cartão (Prompt U, 2.5–2.9; R 1.6)", () => {
  it("estado derivado das datas e dos pagamentos", () => {
    expect(estadoDaFatura(f(), "2026-09-30")).toBe("aberta");
    expect(estadoDaFatura(f(), "2026-10-10")).toBe("aberta"); // fecha no dia: ainda recebe
    expect(estadoDaFatura(f(), "2026-10-11")).toBe("fechada");
    expect(estadoDaFatura(f({ valorPago: 100 }), "2026-10-11")).toBe("paga parcialmente");
    expect(estadoDaFatura(f({ valorPago: 300 }), "2026-10-11")).toBe("paga");
    expect(saldoDaFatura(f({ valorPago: 100 }))).toBe(200);
  });
  it("16 / 16c — aberta é Prevista; ao fechar vira A pagar; vencida sem pagar é Vencida; paga é Pago", () => {
    expect(statusDaFatura(f(), "2026-09-30")).toBe("Prevista");
    expect(statusDaFatura(f(), "2026-10-15")).toBe("A pagar");
    expect(statusDaFatura(f(), "2026-10-21")).toBe("Vencida");
    expect(statusDaFatura(f({ valorPago: 300 }), "2026-10-21")).toBe("Pago");
    // mesma fatura, mesma linha (id igual) antes e depois do fechamento — não nasce uma segunda
    expect(linhaDaFatura(f(), "2026-09-30").id).toBe(linhaDaFatura(f(), "2026-10-15").id);
    expect(linhaDaFatura(f(), "2026-09-30").prevista).toBe(true);
    expect(linhaDaFatura(f(), "2026-10-15").prevista).toBe(false);
  });
  it("7 — em Contas a Pagar aparece a fatura, e não as compras (nem as parcelas delas)", () => {
    const despesas = [
      { id: "D1", cartaoId: "C1", valor: 200, saldo: 200, status: "A pagar", vencimento: "10/20/2026", dataPagamento: null, descricao: "cimento" },
      { id: "D2", cartaoId: null, valor: 50, saldo: 50, status: "A pagar", vencimento: "10/05/2026", dataPagamento: null, descricao: "areia" },
    ];
    const parcelas = [
      { despesaId: "D1", numero: 1, vencimento: "10/20/2026", valorOriginal: 100, valorPago: 0, status: "Pendente", dataPagamento: null, chequeNumero: null, bomPara: null },
      { despesaId: "D1", numero: 2, vencimento: "11/20/2026", valorOriginal: 100, valorPago: 0, status: "Pendente", dataPagamento: null, chequeNumero: null, bomPara: null },
    ];
    const r = linhasComFaturas(despesas, parcelas, [f({ valorCompras: 100, qtdCompras: 1 }), f({ id: "F2", fechamento: "11/10/2026", vencimento: "11/20/2026", valorCompras: 0, qtdCompras: 0 })], "2026-09-30");
    expect(r.compras.map((c) => c.id)).toEqual(["D2"]);
    expect(r.faturas.map((x) => [x.id, x.valor, x.status, x.formaPagamento])).toEqual([["fatura:F1", 100, "Prevista", "Cartão de crédito"]]); // fatura vazia fica de fora
    expect(r.faturas[0].fornecedorNome).toBe("Fatura · Itaú •••• 1234");
    expect(r.faturas[0].projectId).toBe("cartao:C1");
  });
  it("16a / 16b — o valor da aberta é o acumulado das compras (sem juro) e cresce com compra nova", () => {
    const antes = linhaDaFatura(f({ valorCompras: 100, qtdCompras: 1 }), "2026-09-30");
    const depois = linhaDaFatura(f({ valorCompras: 350, qtdCompras: 2 }), "2026-09-30");
    expect(antes.valor).toBe(100);
    expect(depois.valor).toBe(350);
    expect(depois.saldo).toBe(350);
    expect(Object.keys(depois)).not.toContain("juroEstimado");
  });
});
