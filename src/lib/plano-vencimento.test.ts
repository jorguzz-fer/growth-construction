import { describe, it, expect } from "vitest";
import { avisoDeDiaInexistente, diasInexistentes } from "./plano-vencimento";
import { serieVencimentos } from "./calc/carencia";

describe("Prompt AN · Parte 6 — data impossível no cadastro do plano", () => {
  it("16d — dia 31 em mensais avisa e diz qual mês quebra", () => {
    expect(avisoDeDiaInexistente("01/31/2027", 12, 1, "mensal")).toBe(
      "Dia 31 não existe em fevereiro/2027 — a 2ª mensal cai em 28/02/2027 (último dia do mês). Outras 4 parcela(s) desta série também caem no último dia do mês.",
    );
  });
  it("16e — a série inteira: 31/03 em mensais é apontado por causa de junho", () => {
    const l = diasInexistentes("03/31/2027", 4, 1);
    // abril (2ª) e junho (4ª): testar só o 1º vencimento não pegaria nenhum
    expect(l.map((x) => [x.parcela, x.mes])).toEqual([[2, 4], [4, 6]]);
    expect(l[1].dataUsada).toBe("06/30/2027");
    expect(diasInexistentes("03/31/2027", 1, 1)).toEqual([]);
    expect(avisoDeDiaInexistente("03/31/2027", 4, 1, "mensal")).toMatch(/abril\/2027 — a 2ª mensal cai em 30\/04\/2027/);
  });
  it("16f — dia até 28 não gera aviso", () => {
    for (let d = 1; d <= 28; d++) expect(diasInexistentes(`01/${String(d).padStart(2, "0")}/2027`, 24, 1)).toEqual([]);
  });
  it("semestral e anual usam o passo da série; 29/02 em ano bissexto quebra no ano seguinte", () => {
    expect(diasInexistentes("08/31/2026", 3, 6).map((x) => x.parcela)).toEqual([2]);
    expect(diasInexistentes("02/29/2028", 2, 12)).toEqual([{ parcela: 2, mes: 2, ano: 2029, dataUsada: "02/28/2029" }]);
  });
  it("o dia avisado é o mesmo que o expansor de recebíveis usa", () => {
    const serie = serieVencimentos("01/31/2027", 6, 1);
    for (const x of diasInexistentes("01/31/2027", 6, 1)) expect(serie[x.parcela - 1]).toBe(x.dataUsada);
  });
  it("vencimento vazio ou malformado não gera aviso", () => {
    expect(avisoDeDiaInexistente("", 12, 1, "mensal")).toBeNull();
    expect(avisoDeDiaInexistente("31/01/2027", 12, 1, "mensal")).toBeNull();
  });
});
