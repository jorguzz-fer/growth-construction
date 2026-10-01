import { describe, it, expect } from "vitest";
import { calcTotals } from "@/lib/calc";
import { emptyUnit } from "@/lib/calc/__fixtures__";
import { indicadoresDoResumo } from "./resumo-tela";

/** Prompt AE-1 — os indicadores do Resumo: mesmos valores, critério dito, ausência ≠ zero. */
const unidade = (status: string, valor: number) => ({ ...emptyUnit("U"), status, valor } as never);

describe("AE-1 — mesmos números, rótulos honestos", () => {
  const unidades = [unidade("Vendido", 500000), unidade("Disponivel", 400000)];
  const permutas = [
    { tipoPermuta: "Material de construção", estimado: "1000", status: "Recebido", valorVenda: 0 },
    { tipoPermuta: "Serviço", estimado: "300", status: "Recebido", valorVenda: 0 },
  ];
  const totals = calcTotals(unidades, permutas.map((p) => ({ ...p, estimado: Number(p.estimado) })) as never, [{ valor: 70 }] as never);
  const ind = indicadoresDoResumo({ totals, unidades, permutas, liberacoes: 1 });

  it("os valores são os de calcTotals e da busca por tipo de antes", () => {
    const v = Object.fromEntries(ind.map((i) => [i.label, i.value]));
    expect(v["VGV total (tabela de preços, todas as unidades)"]).toBe(900000);
    expect(v["Mensais (nominal, sem INCC)"]).toBe(totals.mens);
    expect(v["Permuta por Materiais"]).toBe(1000);
    expect(v["Permuta por Serviços de Terceiros"]).toBe(300);
    expect(v["Liberações de Obra"]).toBe(70);
  });
  it("2.2 — nenhum rótulo fala em INCC aplicado", () => {
    expect(ind.some((i) => /c\/INCC/.test(i.label))).toBe(false);
  });
  it("2.1 — o VGV conta todas; os outros, só as vendidas", () => {
    expect(ind[0].base).toBe("todas_unidades");
    expect(ind.slice(1, 7).every((i) => i.base === "vendidas")).toBe(true);
  });
});

describe("4.4 — sem base é ausência, não zero", () => {
  it("sem unidade vendida, sem permuta, sem liberação: tudo marcado como vazio", () => {
    const totals = calcTotals([unidade("Disponivel", 1)], [], []);
    const ind = indicadoresDoResumo({ totals, unidades: [unidade("Disponivel", 1)], permutas: [], liberacoes: 0 });
    expect(ind[0].vazio).toBe(false); // há unidade: o VGV é número
    expect(ind.slice(1).every((i) => i.vazio)).toBe(true);
  });
});
