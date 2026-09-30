import { describe, it, expect } from "vitest";
import { CHAVES, chavesLigadasDe, ehChave } from "./chaves";

describe("catálogo de chaves (B4)", () => {
  it("ids únicos e toda chave tem prévia", () => {
    const ids = CHAVES.map((c) => c.id);
    expect(new Set(ids).size).toBe(ids.length);
    for (const c of CHAVES) expect(c.previa.href.startsWith("/"), c.id).toBe(true);
  });
  it("só chave do catálogo e ligada conta; o resto vale desligada", () => {
    const r = chavesLigadasDe([
      { chave: "membro_padrao_restrito", ligada: true },
      { chave: "chave_que_nao_existe", ligada: true },
    ]);
    expect([...r]).toEqual(["membro_padrao_restrito"]);
    expect(chavesLigadasDe([{ chave: "membro_padrao_restrito", ligada: false }]).size).toBe(0);
    expect(chavesLigadasDe([]).size).toBe(0);
  });
  it("ehChave", () => {
    expect(ehChave("membro_padrao_restrito")).toBe(true);
    expect(ehChave("x")).toBe(false);
    expect(ehChave(null)).toBe(false);
  });
});
