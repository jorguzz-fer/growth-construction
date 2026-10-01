import { describe, it, expect } from "vitest";
import { avisoDeFaixa, diffDeIncc, mesesEncerradosSemOficial, mesesFuturosOficiais, mesesNaMedia, ordDoMes } from "./incc-regras";
import { projectIncc } from "@/lib/calc/incc";

describe("Parâmetros / INCC — regras puras (Prompt Q)", () => {
  it("4.3 · faixa: dentro não avisa; fora avisa sem recusar; negativo é aceito; não finito é inválido", () => {
    expect(avisoDeFaixa(0.45)).toBeNull();
    expect(avisoDeFaixa(-1.2)).toBeNull();
    expect(avisoDeFaixa(-90)).toMatch(/fora da faixa/);
    expect(avisoDeFaixa(400)).toMatch(/fora da faixa/);
    expect(avisoDeFaixa(NaN)).toBe("Valor inválido.");
  });

  it("4.6 · meses na média: os anteriores, até 12", () => {
    expect(mesesNaMedia(0)).toBe(0);
    expect(mesesNaMedia(3)).toBe(3);
    expect(mesesNaMedia(12)).toBe(12);
    expect(mesesNaMedia(40)).toBe(12);
  });

  it("2.2 · a reprojeção (projectIncc) só toca meses projetados — oficial futuro fica igual", () => {
    const rows = [
      { m: "01/2026", mo: 0.5, ac: 0.5 },
      { m: "02/2026", mo: 0.3, ac: 0.8015 },
      { m: "03/2026", mo: 0.9, ac: 1.7087, projected: false }, // oficial futuro informado
      { m: "04/2026", mo: 0, ac: 0, projected: true },
    ];
    const out = projectIncc(rows);
    expect(out[2].mo).toBe(0.9);
    expect(out[3].mo).toBe(Math.round(((0.5 + 0.3 + 0.9) / 3) * 1000) / 1000);
  });

  it("1.2/2.3/6.3 · meses futuros oficiais e encerrados sem oficial, pelo ordinal do mês", () => {
    const hoje = ordDoMes("10/2026");
    const rows = [
      { m: "08/2026", mo: 0.1, ac: 0.1, projected: true },
      { m: "09/2026", mo: 0.1, ac: 0.2 },
      { m: "10/2026", mo: 0.1, ac: 0.3 },
      { m: "11/2026", mo: 0, ac: 0 },
      { m: "12/2026", mo: 0, ac: 0, projected: true },
    ];
    expect(mesesFuturosOficiais(rows, hoje)).toEqual(["11/2026"]);
    expect(mesesEncerradosSemOficial(rows, hoje)).toEqual(["08/2026"]);
  });

  it("3.2 · diff de/para: só meses cujo mensal ou acumulado mudou, na escala de 4 casas", () => {
    const antes = [
      { m: "01/2026", mo: 0.5, ac: 0.5 },
      { m: "02/2026", mo: 0.3, ac: 0.8015 },
    ];
    const depois = [
      { m: "01/2026", mo: 0.5, ac: 0.5 },
      { m: "02/2026", mo: 0.4, ac: 0.902 },
    ];
    expect(diffDeIncc(antes, depois)).toEqual([{ mes: "02/2026", mensal: { de: 0.3, para: 0.4 }, acumulado: { de: 0.8015, para: 0.902 } }]);
    expect(diffDeIncc(antes, antes.map((r) => ({ ...r, ac: r.ac + 0.00001 })))).toEqual([]);
  });
});
