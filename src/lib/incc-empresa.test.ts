import { describe, it, expect } from "vitest";
import { diferencaDaSerie, mudaAlgo } from "./incc-empresa";

/** Prompt Q2 — o que muda numa obra quando ela passa a ler a série da empresa. */
const r = (m: string, ac: number) => ({ m, mo: 0, ac, projected: false });

describe("Prompt Q2 · diferença entre a série da obra e a da empresa", () => {
  it("séries iguais não mudam nada", () => {
    const d = diferencaDaSerie([r("01/2026", 1), r("02/2026", 2)], [r("01/2026", 1), r("02/2026", 2)]);
    expect(d).toEqual({ mesesDiferentes: 0, mesesSemEmpresa: 0, maiorDiferenca: 0, mesDaMaior: null });
    expect(mudaAlgo(d)).toBe(false);
  });

  it("conta os meses diferentes e a maior diferença, com sinal (empresa − obra)", () => {
    const d = diferencaDaSerie([r("01/2026", 1), r("02/2026", 2), r("03/2026", 3)], [r("01/2026", 1.5), r("02/2026", 1), r("03/2026", 3)]);
    expect(d).toEqual({ mesesDiferentes: 2, mesesSemEmpresa: 0, maiorDiferenca: -1, mesDaMaior: "02/2026" });
  });

  it("mês da obra que a empresa não tem conta à parte", () => {
    const d = diferencaDaSerie([r("01/2026", 1), r("02/2026", 2)], [r("01/2026", 1)]);
    expect(d.mesesSemEmpresa).toBe(1);
    expect(mudaAlgo(d)).toBe(true);
  });
});
