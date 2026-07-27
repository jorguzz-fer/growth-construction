import { describe, it, expect } from "vitest";
import { projectPeriodMonths, monthValue, sumPct } from "./planning";

describe("projectPeriodMonths", () => {
  it("projeto de um único mês", () => {
    expect(projectPeriodMonths("05/2025", "05/2025")).toEqual(["05/2025"]);
  });

  it("vários meses no mesmo ano", () => {
    expect(projectPeriodMonths("01/2025", "04/2025")).toEqual([
      "01/2025",
      "02/2025",
      "03/2025",
      "04/2025",
    ]);
  });

  it("atravessa dois anos (18 meses, inclusive)", () => {
    const m = projectPeriodMonths("05/2025", "10/2026");
    expect(m.length).toBe(18);
    expect(m[0]).toBe("05/2025");
    expect(m[m.length - 1]).toBe("10/2026");
    expect(m).toContain("12/2025");
    expect(m).toContain("01/2026");
  });

  it("período não definido → vazio", () => {
    expect(projectPeriodMonths(null, null)).toEqual([]);
    expect(projectPeriodMonths("05/2025", null)).toEqual([]);
    expect(projectPeriodMonths("", "10/2026")).toEqual([]);
  });

  it("fim antes do início → vazio", () => {
    expect(projectPeriodMonths("10/2026", "05/2025")).toEqual([]);
  });

  it("normaliza mês sem zero à esquerda", () => {
    expect(projectPeriodMonths("5/2025", "6/2025")).toEqual(["05/2025", "06/2025"]);
  });
});

describe("monthValue (total × % / 100, com centavos)", () => {
  it("percentual inteiro", () => {
    expect(monthValue(180000, 15)).toBe(27000);
    expect(monthValue(30000, 10)).toBe(3000);
  });

  it("arredonda a centavos", () => {
    // 100,00 × 33,33% = 33,33
    expect(monthValue(100, 33.33)).toBeCloseTo(33.33, 2);
    // 1000 × 12,345% = 123,45
    expect(monthValue(1000, 12.345)).toBeCloseTo(123.45, 2);
  });

  it("zero", () => {
    expect(monthValue(1000, 0)).toBe(0);
    expect(monthValue(0, 50)).toBe(0);
  });
});

describe("sumPct", () => {
  const months = ["05/2025", "06/2025", "07/2025"];
  it("soma os percentuais do período", () => {
    expect(sumPct({ "05/2025": 15, "06/2025": 20, "07/2025": 25 }, months)).toBe(60);
  });
  it("ignora meses fora do período e vazios", () => {
    expect(sumPct({ "05/2025": 50, "01/2030": 99 }, months)).toBe(50);
  });
  it("distribuição de 100%", () => {
    expect(sumPct({ "05/2025": 30, "06/2025": 30, "07/2025": 40 }, months)).toBe(100);
  });
});
