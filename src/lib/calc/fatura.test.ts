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
    // com rotativo que ela traz: o total é compras + rotativo
    expect(estadoDaFatura(f({ valorCompras: 100, rotativoAnterior: 250, valorPago: 300 }), "2026-10-11")).toBe("paga parcialmente");
    expect(saldoDaFatura(f({ valorCompras: 100, rotativoAnterior: 250, valorPago: 300 }))).toBe(50);
    expect(estadoDaFatura(f({ valorCompras: 0, rotativoAnterior: 250, valorPago: 250 }), "2026-10-11")).toBe("paga");
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

import { comRotativo, distribuirPagamento, projecaoDoCiclo, rotativoParaOCiclo, totalDaFatura } from "./fatura";

describe("pagamento, rotativo e projeção (Prompt U, 3 e 4)", () => {
  const base = { cartaoId: "C1", cartaoNome: "Itaú", qtdCompras: 1 };
  const fat = (id: string, fechamento: string, vencimento: string, valorCompras: number, valorPago: number) => ({ ...base, id, fechamento, vencimento, valorCompras, valorPago });
  it("distribuirPagamento — FIFO, centavos exatos, sobra quando excede", () => {
    const r = distribuirPagamento(150, [{ id: "a", saldo: 100 }, { id: "b", saldo: 100 }, { id: "c", saldo: 0 }]);
    expect(r.abatimentos.map((x) => [x.id, x.abatido])).toEqual([["a", 100], ["b", 50]]);
    expect(r.sobra).toBe(0);
    expect(distribuirPagamento(250, [{ id: "a", saldo: 100 }]).sobra).toBe(150);
    expect(distribuirPagamento(0.1, [{ id: "a", saldo: 0.3 }]).abatimentos[0].abatido).toBe(0.1);
  });
  it("9 — paga parcialmente deixa rotativo, que a fatura seguinte traz; a parcial fica com saldo zero na lista", () => {
    const hoje = "2026-10-15";
    const lista = [fat("F2", "10/10/2026", "10/20/2026", 400, 0), fat("F1", "09/10/2026", "09/20/2026", 300, 100), fat("F3", "11/10/2026", "11/20/2026", 50, 0)];
    const r = comRotativo(lista, hoje);
    const porId = Object.fromEntries(r.map((x) => [x.id, x]));
    expect(porId.F1.rotativoAnterior).toBe(0);
    expect(porId.F2.rotativoAnterior).toBe(200); // o que faltou na F1
    expect(porId.F3.rotativoAnterior).toBe(0); // F2 fechada sem pagamento parcial não rola
    expect(totalDaFatura(porId.F2)).toBe(600);
    expect(rotativoParaOCiclo(lista, "10/10/2026", hoje)).toBe(200);
    expect(rotativoParaOCiclo(lista, "11/10/2026", hoje)).toBe(0);
    // F2 também parcial: o rotativo acumula (F1 → F2 → F3)
    const r2 = comRotativo([lista[0] && { ...lista[0], valorPago: 100 }, lista[1], lista[2]], hoje);
    expect(r2.find((x) => x.id === "F3")?.rotativoAnterior).toBe(500); // 600 − 100
    // na lista de Contas a Pagar: a parcial fica com saldo zero (foi para a seguinte) e a seguinte traz o total
    const { faturas } = linhasComFaturas([], [], lista, hoje);
    const l = Object.fromEntries(faturas.map((x) => [x.faturaId, x]));
    expect(l.F1.status).toBe("Parcialmente paga");
    expect(l.F1.saldo).toBe(0);
    expect(l.F1.descricao).toContain("levado à fatura seguinte");
    expect(l.F2.valor).toBe(600);
    expect(l.F2.saldo).toBe(600);
  });
  it("10 / 16a / 4.3 — projeção: juro só com taxa, sempre fora do total previsto (Contas a Pagar)", () => {
    const semTaxa = projecaoDoCiclo({ comprasDoCiclo: 100, parcelasAnteriores: 50, rotativoAnterior: 200, taxaRotativo: null });
    expect(semTaxa).toEqual({ comprasDoCiclo: 100, parcelasAnteriores: 50, rotativoAnterior: 200, totalPrevisto: 350, juroEstimado: null, totalProjetado: 350 });
    const comTaxa = projecaoDoCiclo({ comprasDoCiclo: 100, parcelasAnteriores: 50, rotativoAnterior: 200, taxaRotativo: 12 });
    expect(comTaxa.juroEstimado).toBe(24);
    expect(comTaxa.totalPrevisto).toBe(350); // sem a estimativa
    expect(comTaxa.totalProjetado).toBe(374);
    expect(projecaoDoCiclo({ comprasDoCiclo: 100, parcelasAnteriores: 0, rotativoAnterior: 0, taxaRotativo: 12 }).juroEstimado).toBe(0);
  });
});
