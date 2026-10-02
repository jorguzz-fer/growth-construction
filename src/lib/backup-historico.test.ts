import { describe, it, expect } from "vitest";
import { semestrePendente, semestreSalvo } from "./backup-historico";

const fimH1 = new Date(2026, 5, 30, 23, 59, 59);
const fimH2 = new Date(2025, 11, 31, 23, 59, 59);

describe("Prompt AO, Parte 6 — histórico de backup e o aviso", () => {
  it("só conta como salvo o backup baixado DEPOIS do fim do semestre", () => {
    expect(semestreSalvo(fimH1, null)).toBe(false);
    expect(semestreSalvo(fimH1, { em: new Date(2026, 4, 1), por: "x" })).toBe(false);
    expect(semestreSalvo(fimH1, { em: new Date(2026, 6, 2), por: "x" })).toBe(true);
  });

  it("o aviso vai para o encerrado mais recente com dados e ainda não salvo", () => {
    const sems = [
      { key: "2026-H2", closed: false, total: 5, fim: new Date(2026, 11, 31) },
      { key: "2026-H1", closed: true, total: 3, fim: fimH1 },
      { key: "2025-H2", closed: true, total: 2, fim: fimH2 },
    ];
    expect(semestrePendente(sems, new Map())).toBe("2026-H1");
    expect(semestrePendente(sems, new Map([["2026-H1", { em: new Date(2026, 6, 10), por: "x" }]]))).toBe("2025-H2");
    expect(
      semestrePendente(
        sems,
        new Map([
          ["2026-H1", { em: new Date(2026, 6, 10), por: "x" }],
          ["2025-H2", { em: new Date(2026, 0, 5), por: "x" }],
        ]),
      ),
    ).toBeNull();
  });

  it("semestre em andamento nunca é pendente, mesmo sem backup", () => {
    expect(semestrePendente([{ key: "2026-H2", closed: false, total: 9, fim: new Date(2026, 11, 31) }], new Map())).toBeNull();
  });
});
