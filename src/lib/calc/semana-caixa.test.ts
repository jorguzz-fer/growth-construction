import { describe, it, expect } from "vitest";
import { ehChaveDeSemana, janelaDeSemanas, linhasSemanais, rotuloDaSemana, semanaDe, semanaDeHoje, somarSemanas } from "./semana-caixa";

describe("Prompt AD2 — semana do Fluxo de Caixa", () => {
  it("a semana começa na segunda", () => {
    // 15/10/2026 é quinta-feira; a segunda é 12/10.
    expect(semanaDe("10/15/2026")).toBe("2026-10-12");
    expect(semanaDe("10/12/2026")).toBe("2026-10-12"); // a própria segunda
    expect(semanaDe("10/18/2026")).toBe("2026-10-12"); // domingo fecha a semana
    expect(semanaDe("10/19/2026")).toBe("2026-10-19");
  });

  it("competência sem dia cai na semana do dia 1º", () => {
    // 01/11/2026 é domingo: a semana é a de 26/10.
    expect(semanaDe("11/2026")).toBe("2026-10-26");
    expect(semanaDe("11/2026")).toBe(semanaDe("11/01/2026"));
  });

  it("vira o ano sem perder a segunda", () => {
    // 01/01/2027 é sexta: semana de 28/12/2026.
    expect(semanaDe("01/01/2027")).toBe("2026-12-28");
  });

  it("data inválida não cai em semana nenhuma", () => {
    for (const d of [null, "", "13/01/2026", "02/31/2026", "x/y/z", "2026-10-12"]) expect(semanaDe(d)).toBeNull();
  });

  it("janela, soma, rótulo e validação da chave", () => {
    expect(janelaDeSemanas("2026-10-12", 3)).toEqual(["2026-10-12", "2026-10-19", "2026-10-26"]);
    expect(somarSemanas("2026-10-12", -2)).toBe("2026-09-28");
    expect(rotuloDaSemana("2026-12-28")).toBe("28/12 – 03/01/2027");
    expect(ehChaveDeSemana("2026-10-12")).toBe(true);
    expect(ehChaveDeSemana("2026-10-13")).toBe(false); // terça
    expect(ehChaveDeSemana("12/10/2026")).toBe(false);
    expect(semanaDeHoje(new Date(Date.UTC(2026, 9, 18)))).toBe("2026-10-12");
  });

  it("o acumulado parte do saldo e soma o previsto anterior à janela", () => {
    const previsto = { entradas: { "2026-10-05": 100, "2026-10-12": 50 }, saidas: { "2026-10-05": 30, "2026-10-19": 80 } };
    const realizado = { entradas: { "2026-10-12": 40 }, saidas: {} };
    const ls = linhasSemanais(["2026-10-12", "2026-10-19"], previsto, realizado, 1000, "2026-10-12");
    expect(ls.map((l) => l.acumulado)).toEqual([1000 + 70 + 50, 1000 + 70 + 50 - 80]);
    expect(ls[0]).toMatchObject({ entradas: 50, saidas: 0, saldoSemana: 50, realE: 40, atual: true });
    expect(ls[1]).toMatchObject({ entradas: 0, saidas: 80, saldoSemana: -80, atual: false });
  });
});
