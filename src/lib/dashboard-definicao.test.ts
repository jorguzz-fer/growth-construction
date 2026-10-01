import { describe, it, expect } from "vitest";
import { janelaDaMargem, naJanela, orcamentoDaObra } from "./dashboard-definicao";

/** Prompt AA — a definição nova do Dashboard (regras puras). */
const v = (id: string, kind: string, dia: number, sourceVersionId: string | null = null) => ({ id, kind, label: id, sourceVersionId, createdAt: new Date(2026, 0, dia) });

describe("4-B.2 — um Orçamento por obra", () => {
  it("o mais recente que não é cópia", () => {
    expect(orcamentoDaObra([v("o1", "budget", 1), v("o2", "budget", 5), v("copia", "budget", 9, "o2"), v("a", "atual", 10)])?.id).toBe("o2");
  });
  it("sem Orçamento próprio: nenhum (nunca a soma, nunca a cópia)", () => {
    expect(orcamentoDaObra([v("copia", "budget", 9, "x"), v("a", "atual", 1)])).toBeNull();
  });
});

describe("4-B.3 — a mesma janela nos dois lados", () => {
  it("com período: as competências do período", () => {
    const j = janelaDaMargem({ de: "02/10/2026", ate: "04/05/2026", projetos: [] });
    expect(j.origem).toBe("periodo");
    expect([...j.meses!]).toEqual(["02/2026", "03/2026", "04/2026"]);
    expect(naJanela("01/2026", j)).toBe(false);
    expect(naJanela(null, j)).toBe(false);
  });
  it("ISO também é aceito", () => {
    expect([...janelaDaMargem({ de: "2026-02-10", ate: "2026-03-05", projetos: [] }).meses!]).toEqual(["02/2026", "03/2026"]);
  });
  it("período aberto de um lado: por comparação", () => {
    const j = janelaDaMargem({ de: "03/01/2026", ate: "", projetos: [] });
    expect(naJanela("02/2026", j, "03/01/2026", "")).toBe(false);
    expect(naJanela("12/2030", j, "03/01/2026", "")).toBe(true);
  });
  it("sem período: a janela do projeto (início e fim do cadastro)", () => {
    const j = janelaDaMargem({ de: "", ate: "", projetos: [{ startDate: "01/15/2026", endDate: "03/10/2026" }] });
    expect(j.origem).toBe("projeto");
    expect(naJanela("03/2026", j)).toBe(true);
    expect(naJanela("04/2026", j)).toBe(false);
  });
  it("obra sem datas: todas as competências, e isso é declarado", () => {
    const j = janelaDaMargem({ de: "", ate: "", projetos: [{ startDate: null, endDate: null }] });
    expect(j).toEqual({ meses: null, origem: "sem_janela" });
    expect(naJanela("07/2031", j)).toBe(true);
    expect(naJanela(null, j)).toBe(true);
  });
});
