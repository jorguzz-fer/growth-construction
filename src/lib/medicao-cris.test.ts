import { describe, it, expect } from "vitest";
import { formularioDaMedicao, valoresDaMedicao } from "./medicao-cris";
import { competenciaValida } from "./medicao-regras";

/** Prompt V2b — o engenheiro dita a medição; a Cris só preenche a tela. */
const G = [
  { code: "3", name: "Fundações" },
  { code: "4", name: "Estrutura" },
];

describe("Prompt V2b · Medição com a Cris", () => {
  it("o formulário oferece os grupos da obra", () => {
    const f = formularioDaMedicao(G);
    expect(f.id).toBe("medicao-nova");
    expect(f.campos.find((c) => c.nome === "grupo")?.opcoes).toEqual(["3 — Fundações", "4 — Estrutura"]);
  });

  it("a proposta vira os campos da tela no formato da action", () => {
    const r = valoresDaMedicao({ competencia: "3/2026", grupo: "4 — Estrutura", valor: "30000.456", obs: "laje do 2º" }, G);
    expect(r).toEqual({ valores: { competencia: "03/2026", grupo: "4|Estrutura", valor: "30000.46", obs: "laje do 2º" }, avisos: [] });
    expect(competenciaValida(r.valores.competencia)).toBe(true);
  });

  it("o que não dá para usar fica de fora, com aviso", () => {
    const r = valoresDaMedicao({ competencia: "13/2026", grupo: "9 — Telhado", valor: "-5" }, G);
    expect(r.valores).toEqual({});
    expect(r.avisos).toHaveLength(3);
  });
});
