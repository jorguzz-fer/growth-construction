import { describe, it, expect } from "vitest";
import {
  gerarParcelas,
  distribuirValor,
  addDaysBR,
  composePagamento,
  isAtrasado,
} from "./parcelas";

describe("distribuirValor (arredondamento)", () => {
  it("soma exatamente o total, jogando a diferença na última", () => {
    const v = distribuirValor(100, 3); // 33,33 + 33,33 + 33,34
    expect(v).toEqual([33.33, 33.33, 33.34]);
    expect(v.reduce((a, b) => a + b, 0)).toBeCloseTo(100, 2);
  });
  it("parcela única = total", () => {
    expect(distribuirValor(1500, 1)).toEqual([1500]);
  });
});

describe("addDaysBR", () => {
  it("soma dias atravessando o mês", () => {
    expect(addDaysBR("01/20/2026", 30)).toBe("02/19/2026");
  });
});

describe("gerarParcelas", () => {
  it("boleto à vista → 1 parcela na data-base", () => {
    const p = gerarParcelas({ valorTotal: 900, condicao: "avista", dataBase: "03/10/2026" });
    expect(p).toHaveLength(1);
    expect(p[0]).toMatchObject({ numero: 1, vencimento: "03/10/2026", valor: 900 });
  });

  it("boleto 30/60/90 → 3 parcelas com offsets em dias", () => {
    const p = gerarParcelas({ valorTotal: 900, condicao: "30/60/90", dataBase: "01/01/2026" });
    expect(p.map((x) => x.vencimento)).toEqual([
      addDaysBR("01/01/2026", 30),
      addDaysBR("01/01/2026", 60),
      addDaysBR("01/01/2026", 90),
    ]);
    expect(p.reduce((a, x) => a + x.valor, 0)).toBeCloseTo(900, 2);
    expect(p).toHaveLength(3);
  });

  it("cheque parcelado personalizado (qtd + intervalo)", () => {
    const p = gerarParcelas({
      valorTotal: 1000,
      condicao: "personalizado",
      dataBase: "01/15/2026",
      qtd: 4,
      intervaloDias: 30,
    });
    expect(p).toHaveLength(4);
    expect(p[0].vencimento).toBe("01/15/2026");
    expect(p[3].vencimento).toBe(addDaysBR("01/15/2026", 90));
    expect(p.reduce((a, x) => a + x.valor, 0)).toBeCloseTo(1000, 2);
  });

  it("personalizado com vencimentos explícitos", () => {
    const p = gerarParcelas({
      valorTotal: 300,
      condicao: "personalizado",
      dataBase: "01/01/2026",
      vencimentos: ["01/10/2026", "02/10/2026", "03/10/2026"],
    });
    expect(p.map((x) => x.vencimento)).toEqual(["01/10/2026", "02/10/2026", "03/10/2026"]);
    expect(p.reduce((a, x) => a + x.valor, 0)).toBeCloseTo(300, 2);
  });
});

describe("composePagamento (Fase 3)", () => {
  it("pagamento no vencimento (sem encargos)", () => {
    expect(composePagamento({ valorOriginal: 1000 })).toEqual({
      valorTotalPago: 1000,
      encargos: 0,
    });
  });
  it("atrasado com multa + juros", () => {
    const r = composePagamento({ valorOriginal: 1000, multa: 20, juros: 33.33 });
    expect(r.valorTotalPago).toBeCloseTo(1053.33, 2);
    expect(r.encargos).toBeCloseTo(53.33, 2);
  });
  it("com desconto (encargos negativos = ganho financeiro)", () => {
    const r = composePagamento({ valorOriginal: 1000, desconto: 50 });
    expect(r.valorTotalPago).toBe(950);
    expect(r.encargos).toBe(-50);
  });
  it("pagamento parcial (valor original informado menor)", () => {
    const r = composePagamento({ valorOriginal: 400, juros: 10 });
    expect(r.valorTotalPago).toBe(410);
  });
});

describe("isAtrasado", () => {
  it("detecta atraso", () => {
    expect(isAtrasado("01/10/2026", "01/15/2026")).toBe(true);
  });
  it("em dia não é atraso", () => {
    expect(isAtrasado("01/10/2026", "01/10/2026")).toBe(false);
    expect(isAtrasado("01/10/2026", "01/05/2026")).toBe(false);
  });
});
