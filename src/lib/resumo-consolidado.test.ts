import { describe, it, expect } from "vitest";
import { percentual, somarIndicadores, somarUnidades, textoDaCobertura, totalDoComparativo, versaoDoTipo, type LinhaComparativa } from "./resumo-consolidado";
import type { IndicadorDoResumo } from "./resumo-tela";

const ind = (label: string, value: number, vazio = false): IndicadorDoResumo => ({ label, value, base: "vendidas", vazio });

describe("Resumo com várias obras (01/10)", () => {
  it("a versão do tipo é a mais antiga, e obra sem o tipo fica fora", () => {
    const vs = [{ id: "a", kind: "atual" }, { id: "b1", kind: "budget" }, { id: "b2", kind: "budget" }];
    expect(versaoDoTipo(vs, "budget")?.id).toBe("b1");
    expect(versaoDoTipo(vs, "forecast")).toBeNull();
  });

  it("valores somam pelo rótulo; vazio só se todas as obras estão vazias", () => {
    const r = somarIndicadores([
      [ind("VGV", 100), ind("FGTS", 0, true)],
      [ind("VGV", 50), ind("FGTS", 10)],
    ]);
    expect(r).toEqual([ind("VGV", 150), ind("FGTS", 10)]);
    expect(somarIndicadores([[ind("FGTS", 0, true)], [ind("FGTS", 0, true)]])[0].vazio).toBe(true);
  });

  it("unidades somam", () => {
    expect(somarUnidades([{ disp: 1, res: 0, vend: 2, total: 3 }, { disp: 0, res: 1, vend: 1, total: 3 }])).toEqual({ disp: 1, res: 1, vend: 3, total: 6 });
  });

  it("cobertura declarada", () => {
    expect(textoDaCobertura("forecast", 2, 3)).toBe("Previsão Atualizada: 2 de 3 projetos");
    expect(textoDaCobertura("atual", 1, 1)).toBe("Atual: 1 de 1 projeto");
  });

  it("percentual se recalcula das somas — nunca é média", () => {
    const linhas: LinhaComparativa[] = [
      { obra: "A", projectId: "a", vgv: 100, vgvVendido: 10, vendidas: 1, unidades: 10, custoRealizado: 110, custoOrcado: 100 },
      { obra: "B", projectId: "b", vgv: 100, vgvVendido: 90, vendidas: 9, unidades: 10, custoRealizado: 1000, custoOrcado: 1000 },
    ];
    const t = totalDoComparativo(linhas);
    // média dos % vendidos seria 50%; das somas, 10 de 20 = 50% (coincide) — o desvio mostra a diferença:
    // média dos desvios = (10% + 0%) / 2 = 5%; das somas = 110 / 1100 = 10%.
    expect(t.pctVendidas).toBe(50);
    expect(t.desvio).toBe(10);
    expect(t.pctDesvio).toBeCloseTo((10 / 1100) * 100, 10);
  });

  it("obra sem Orçamento sai do desvio dos dois lados; obra sem Atual sai de tudo", () => {
    const t = totalDoComparativo([
      { obra: "A", projectId: "a", vgv: 100, vgvVendido: 0, vendidas: 0, unidades: 4, custoRealizado: 500, custoOrcado: null },
      { obra: "B", projectId: "b", vgv: null, vgvVendido: null, vendidas: null, unidades: null, custoRealizado: null, custoOrcado: null },
    ]);
    expect(t).toMatchObject({ vgv: 100, unidades: 4, pctVendidas: 0, desvio: null, pctDesvio: null, obrasComAtual: 1, obrasComOrcamento: 0 });
  });

  it("sem base, percentual é null (não zero)", () => {
    expect(percentual(5, 0)).toBeNull();
  });
});
