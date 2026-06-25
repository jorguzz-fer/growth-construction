import { describe, it, expect } from "vitest";
import { recalcIncc, getIncc } from "./incc";
import { DEFAULT_INCC } from "./constants";

describe("recalcIncc", () => {
  it("recompõe o acumulado encadeado a partir das variações mensais", () => {
    const out = recalcIncc(DEFAULT_INCC);
    expect(out[0].ac).toBe(0.26);
    // (1+0,26%)·(1+0,96%) − 1 = 1,2225% → 1,222
    expect(out[1].ac).toBe(1.222);
    // a recomposição deve reproduzir a tabela original (tolerância de arredondamento)
    out.forEach((row, i) => {
      expect(row.ac).toBeCloseTo(DEFAULT_INCC[i].ac, 2);
    });
  });

  it("é pura — não muta a entrada", () => {
    const copy = DEFAULT_INCC.map((r) => ({ ...r }));
    recalcIncc(DEFAULT_INCC);
    expect(DEFAULT_INCC).toEqual(copy);
  });
});

describe("getIncc", () => {
  it("retorna o acumulado do mês ou 0", () => {
    expect(getIncc(DEFAULT_INCC, "06/2026")).toBe(7.386);
    expect(getIncc(DEFAULT_INCC, "99/9999")).toBe(0);
  });
});
