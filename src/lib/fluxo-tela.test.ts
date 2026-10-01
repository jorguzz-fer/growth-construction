import { describe, it, expect } from "vitest";
import { desvioDoMes, eixoDoFluxo, linhasDoFluxo, totalDoDesvio } from "./fluxo-tela";

const prev = { entradas: { "01/2026": 1000, "02/2026": 500 }, saidas: { "01/2026": 400, "03/2026": 100 } };
const real = { entradas: { "01/2026": 900, "04/2026": 50 }, saidas: { "01/2026": 450 } };

/** ORÁCULO — o acumulado de antes: corre sobre o eixo, pelo previsto. */
function acumuladoAntigo(axis: string[], saldoInicial: number) {
  let a = saldoInicial;
  const out: Record<string, number> = {};
  for (const mm of axis) {
    a += (prev.entradas[mm as keyof typeof prev.entradas] || 0) - (prev.saidas[mm as keyof typeof prev.saidas] || 0);
    out[mm] = a;
  }
  return out;
}

describe("Prompt AD · tabela do Fluxo de Caixa", () => {
  it("6 — o eixo inclui o mês que só tem realizado", () => {
    expect(eixoDoFluxo(["12/2025"], [prev], real)).toEqual(["12/2025", "01/2026", "02/2026", "03/2026", "04/2026"]);
  });

  it("23 — acumulado e totais do previsto iguais aos de antes, mesmo com os meses novos no eixo", () => {
    const eixoAntigo = ["12/2025", "01/2026", "02/2026", "03/2026"];
    const eixoNovo = eixoDoFluxo(["12/2025"], [prev], real);
    const linhas = linhasDoFluxo(eixoNovo, eixoNovo, prev, real, 10_000);
    const antigo = acumuladoAntigo(eixoAntigo, 10_000);
    for (const mm of eixoAntigo) expect(linhas.find((l) => l.mm === mm)!.saldo).toBe(antigo[mm]);
    expect(linhas.find((l) => l.mm === "04/2026")!.saldo).toBe(antigo["03/2026"]);
    expect(linhas.reduce((a, l) => a + l.e, 0)).toBe(1500);
    expect(linhas.reduce((a, l) => a + l.s, 0)).toBe(500);
  });

  it("8 — mês vazio não é R$ 0: o líquido é ausente", () => {
    const [l] = linhasDoFluxo(["04/2026"], ["04/2026"], prev, real, 0);
    expect(l.liquido).toBeNull();
    expect(l.realE).toBe(50);
  });

  it("11/12 — desvio com sinal; com um lado só, estado próprio e nenhum valor", () => {
    expect(desvioDoMes(1000, 400, 900, 450)).toEqual({ estado: "ambos", valor: -150, pct: -25 });
    expect(desvioDoMes(0, 100, 0, 0)).toMatchObject({ estado: "so_previsto", valor: null });
    expect(desvioDoMes(0, 0, 50, 0)).toMatchObject({ estado: "so_realizado", valor: null });
    expect(desvioDoMes(0, 0, 0, 0).estado).toBe("nenhum");
    expect(desvioDoMes(100, 100, 50, 0)).toEqual({ estado: "ambos", valor: 50, pct: null });
  });

  it("5.2 — total do desvio só dos meses com os dois lados, e conta os que ficaram fora", () => {
    const eixo = eixoDoFluxo([], [prev], real);
    const t = totalDoDesvio(linhasDoFluxo(eixo, eixo, prev, real, 0));
    expect(t).toEqual({ valor: -150, pct: -25, mesesComparados: 1, soPrevisto: 2, soRealizado: 1 });
  });
});
