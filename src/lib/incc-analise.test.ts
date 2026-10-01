import { describe, it, expect } from "vitest";
import { cobertura, curvaProjetadaVsHistorico, efeitoDaAlteracao, mesDaData } from "./incc-analise";
import { ordDoMes } from "./incc-regras";

const rows = [
  { m: "01/2026", mo: 0.5, ac: 0.5 },
  { m: "02/2026", mo: 0.3, ac: 0.801 },
  { m: "03/2026", mo: 0.4, ac: 1.204 },
  { m: "04/2026", mo: 0.4, ac: 1.609, projected: true },
  { m: "05/2026", mo: 0.4, ac: 2.015, projected: true },
];

describe("Assistente de Parâmetros / INCC — análises puras (Prompt Q, 6.3)", () => {
  it("curva projetada × histórico: média recente dos oficiais, média dos projetados, distância, cauda de projeção e histórico curto", () => {
    const c = curvaProjetadaVsHistorico(rows);
    expect(c).toEqual({ mediaRecente: 0.4, mediaProjetada: 0.4, distancia: 0, mesesSoProjecao: 2, desde: "04/2026", mesesNaPrimeiraMedia: 3 });
    expect(curvaProjetadaVsHistorico([])).toMatchObject({ mediaRecente: null, mediaProjetada: null, distancia: null, mesesSoProjecao: 0, desde: null });
  });

  it("efeito de uma alteração: mesma regra da gravação, sem gravar — mês de/para, projetados reescritos e acumulado final", () => {
    const e = efeitoDaAlteracao(rows, "02/2026", 1.3)!;
    expect(e.mensal).toEqual({ de: 0.3, para: 1.3 });
    expect(e.acumulado.para).toBeGreaterThan(e.acumulado.de);
    expect(e.reescritos.map((r) => r.mes)).toEqual(["04/2026", "05/2026"]);
    expect(e.acumuladoFinal.para).toBeGreaterThan(e.acumuladoFinal.de);
    expect(efeitoDaAlteracao(rows, "12/2099", 1)).toBeNull();
    expect(efeitoDaAlteracao(rows, "02/2026", NaN)).toBeNull();
    // Puro: a entrada não muda.
    expect(rows[1].mo).toBe(0.3);
  });

  it("cobertura: vencimentos fora da tabela (corrigidos por zero) e janela da obra além dos limites", () => {
    const c = cobertura(rows, ["03/2026", "06/2026", "12/2025", "06/2026"], { inicio: "11/2025", fim: "08/2026" });
    expect(c).toEqual({ primeiro: "01/2026", ultimo: "05/2026", vencimentosForaDaTabela: ["12/2025", "06/2026"], janelaForaDaTabela: { inicio: "11/2025", fim: "08/2026" } });
    expect(cobertura(rows, ["02/2026"], { inicio: "01/2026", fim: "05/2026" }).janelaForaDaTabela).toBeNull();
    expect(cobertura(rows, [], null).janelaForaDaTabela).toBeNull();
    expect(mesDaData("09/15/2026")).toBe("09/2026");
    expect(mesDaData("")).toBeNull();
    expect(ordDoMes("01/2027") - ordDoMes("12/2026")).toBe(1);
  });
});
