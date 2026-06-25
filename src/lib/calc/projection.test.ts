import { describe, it, expect } from "vitest";
import {
  calcProjection,
  calcUnitTotal,
  calcTotals,
  reembursementsByMonth,
  addMonths,
  monthKey,
  parseDate,
} from "./projection";
import { DEFAULT_INCC } from "./constants";
import { bla401, emptyUnit } from "./__fixtures__";

describe("helpers de data", () => {
  it("parseDate entende MM/DD/YYYY e rejeita vazio", () => {
    expect(parseDate("02/27/2026")).toEqual({ mo: 2, d: 27, yr: 2026 });
    expect(parseDate("")).toBeNull();
    expect(parseDate("xx")).toBeNull();
  });

  it("addMonths normaliza o ano", () => {
    expect(addMonths(2, 2026, 0)).toMatchObject({ mo: 2, yr: 2026 });
    expect(addMonths(2, 2026, 12)).toMatchObject({ mo: 2, yr: 2027 });
    expect(addMonths(8, 2026, 6)).toMatchObject({ mo: 2, yr: 2027 });
    expect(monthKey(2, 2026)).toBe("02/2026");
  });
});

describe("calcProjection (paridade com calcProj do protótipo)", () => {
  const proj = calcProjection(bla401(), DEFAULT_INCC);

  it("não projeta unidades não vendidas", () => {
    expect(calcProjection(emptyUnit(), DEFAULT_INCC)).toEqual({});
  });

  it("permuta cai no mês previsto (01/2026)", () => {
    expect(proj["01/2026"]).toBe(90000);
  });

  it("soma todas as fontes do mês de assinatura (02/2026)", () => {
    // 4 sinais (5000×4) + mensal#1 5000 + semestral#1 20000 + anual#1 30000
    // + FGTS 20000 + subsídio 10000 = 105000
    expect(proj["02/2026"]).toBe(105000);
  });

  it("aplica INCC nas mensais a partir da 5ª parcela", () => {
    // i=4 → junho/2026, INCC acumulado 7,386% → 5000 × 1,07386
    expect(proj["06/2026"]).toBeCloseTo(5369.3, 2);
  });
});

describe("calcUnitTotal", () => {
  it("soma o total contratado da BLA 401", () => {
    // sinais 20000 + mensais 180000 + semestrais 120000 + anuais 90000
    // + FGTS 20000 + subsídio 10000 + permuta 90000 + banco 25000 = 555000
    expect(calcUnitTotal(bla401())).toBe(555000);
  });

  it("retorna 0 para unidade não vendida", () => {
    expect(calcUnitTotal(emptyUnit())).toBe(0);
  });
});

describe("calcTotals", () => {
  const totals = calcTotals([bla401(), emptyUnit()], [], []);

  it("agrega por fonte e conta por status", () => {
    expect(totals.sinais).toBe(20000);
    expect(totals.mens).toBe(180000);
    expect(totals.sem).toBe(120000);
    expect(totals.anu).toBe(90000);
    expect(totals.fgts).toBe(20000);
    expect(totals.sub).toBe(10000);
    expect(totals.banco).toBe(25000);
    expect(totals.vgv).toBe(957027);
    expect(totals).toMatchObject({ disp: 1, res: 0, vend: 1 });
  });
});

describe("reembursementsByMonth", () => {
  it("agrega por MM/YYYY", () => {
    const m = reembursementsByMonth([
      { data: "01/27/2026", valor: 50000 },
      { data: "01/05/2026", valor: 10000 },
      { data: "", valor: 999 },
    ]);
    expect(m["01/2026"]).toBe(60000);
  });
});
