import { describe, it, expect } from "vitest";
import { MAX_MESES_GRAFICO, mesesDoGrafico, mesDoFiltro, seriesDaDre, seriesDoFluxo, temValor } from "./dashboard-graficos";

const hoje = new Date(2026, 9, 18); // 18/10/2026

describe("Prompt AA2 — gráficos do Dashboard", () => {
  it("sem período: 5 meses antes, o atual e 6 depois", () => {
    const m = mesesDoGrafico(hoje, "", "");
    expect(m).toHaveLength(12);
    expect(m[0]).toBe("05/2026");
    expect(m[5]).toBe("10/2026");
    expect(m[11]).toBe("04/2027");
  });

  it("com período: os meses do período, datas ou competências; só um lado vale 12 meses", () => {
    expect(mesesDoGrafico(hoje, "01/15/2026", "03/02/2026")).toEqual(["01/2026", "02/2026", "03/2026"]);
    expect(mesesDoGrafico(hoje, "11/2026", "")).toHaveLength(12);
    expect(mesesDoGrafico(hoje, "", "03/2026").at(-1)).toBe("03/2026");
    expect(mesesDoGrafico(hoje, "01/2020", "12/2026")).toHaveLength(MAX_MESES_GRAFICO);
    expect(mesDoFiltro("lixo")).toBeNull();
  });

  it("fluxo: soma as obras mês a mês; mês sem valor é zero", () => {
    const s = seriesDoFluxo([{ entradas: { "10/2026": 100 }, saidas: { "10/2026": 40 } }, { entradas: { "10/2026": 1, "11/2026": 5 }, saidas: {} }], ["10/2026", "11/2026", "12/2026"]);
    expect(s.entradas).toEqual([101, 5, 0]);
    expect(s.saidas).toEqual([40, 0, 0]);
  });

  it("DRE: as partes da barra somam a receita, com lucro e com prejuízo", () => {
    const s = seriesDaDre(
      [
        {
          "10/2026": { receita: 1000, custoVar: 300, byCat: { "Custo Variável": 300, "Despesa Variável": 100, "Custo Fixo": 50, "Despesa Fixa": 80, Retiradas: 20, "Despesas Financeiras": 10 } },
          "11/2026": { receita: 100, custoVar: 400, byCat: { "Custo Variável": 400 } },
        },
      ],
      ["10/2026", "11/2026", "12/2026"],
    );
    for (let i = 0; i < 3; i++) {
      const soma = Object.values(s.partes).reduce((a, p) => a + p[i], 0);
      expect(soma).toBeCloseTo(s.receita[i], 2);
    }
    expect(s.partes["Resultado"]).toEqual([440, -300, 0]);
    expect(s.partes["Demais itens"][0]).toBe(30);
    expect(temValor(s.receita)).toBe(true);
    expect(temValor([0, 0])).toBe(false);
  });
});
