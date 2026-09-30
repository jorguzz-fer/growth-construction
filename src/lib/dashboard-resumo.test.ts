import { describe, it, expect } from "vitest";
import { somarResumos, type Summary } from "./dashboard-resumo";

/** KPIs do Dashboard em "Todos": a soma das obras (decisão de 30/09). */
const versao = (id: string, label: string) =>
  ({ id, label, color: "#123", kind: "atual" }) as unknown as Summary["version"];

const resumo = (id: string, n: number, meses: Record<string, number>): Summary => ({
  version: versao(id, `Atual ${id}`),
  vgv: 1000 * n,
  realizado: 100 * n,
  receitaProj: 300 * n,
  aReceber: 200 * n,
  aPagar: 999,
  monthly: meses,
  realizadoMonthly: meses,
});

describe("somarResumos", () => {
  it("nenhuma obra com o tipo: null (a coluna não aparece)", () => {
    expect(somarResumos("budget", [])).toBeNull();
  });

  it("soma cada KPI e junta os meses", () => {
    const r = somarResumos("atual", [
      resumo("a", 1, { "01/2026": 10, "02/2026": 5 }),
      resumo("b", 2, { "02/2026": 7 }),
    ])!;
    expect(r.vgv).toBe(3000);
    expect(r.realizado).toBe(300);
    expect(r.receitaProj).toBe(900);
    expect(r.aReceber).toBe(600);
    expect(r.monthly).toEqual({ "01/2026": 10, "02/2026": 12 });
    expect(r.realizadoMonthly).toEqual({ "01/2026": 10, "02/2026": 12 });
  });

  it("uma obra só: os mesmos números dela", () => {
    const a = resumo("a", 3, { "03/2026": 4 });
    const r = somarResumos("atual", [a])!;
    expect({ ...r, version: null, aPagar: 0 }).toEqual({ ...a, version: null, aPagar: 0 });
  });

  it("mantém nome e cor da versão; id marca a soma; A pagar é recalculado fora", () => {
    const r = somarResumos("atual", [resumo("a", 1, {}), resumo("b", 1, {})])!;
    expect(r.version.label).toBe("Atual a");
    expect(r.version.id).toBe("consolidado-atual");
    expect(r.aPagar).toBe(0);
  });
});
