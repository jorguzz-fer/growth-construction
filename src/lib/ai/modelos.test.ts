import { describe, it, expect } from "vitest";
import {
  MODELOS_CLAUDE,
  MODELO_PADRAO,
  cadeiaDeModelos,
  pareceIdDeModelo,
  resolverModelo,
  rotuloModelo,
} from "./modelos";

describe("resolverModelo", () => {
  it("sem a variável definida, usa o padrão sem reclamar", () => {
    for (const v of [undefined, null, "", "   "]) {
      const r = resolverModelo(v);
      expect(r.id).toBe(MODELO_PADRAO);
      expect(r.origem).toBe("padrao");
      expect(r.aviso).toBe("");
    }
  });

  it("aceita o identificador correto sem aviso", () => {
    for (const m of MODELOS_CLAUDE) {
      const r = resolverModelo(m.id);
      expect(r.id).toBe(m.id);
      expect(r.origem).toBe("id");
      expect(r.aviso).toBe("");
    }
  });

  it("traduz o nome comercial — é o que quem configura o servidor digita", () => {
    const r = resolverModelo("Sonnet 5");
    expect(r.id).toBe("claude-sonnet-5");
    expect(r.origem).toBe("nome");
    expect(r.aviso).toContain("Sonnet 5");
    expect(r.aviso).toContain("claude-sonnet-5");

    expect(resolverModelo("Claude Opus 5").id).toBe("claude-opus-5");
    expect(resolverModelo("opus 4.8").id).toBe("claude-opus-4-8");
    expect(resolverModelo("HAIKU 4.5").id).toBe("claude-haiku-4-5");
    // Família sem número: cai no mais capaz daquela família.
    expect(resolverModelo("sonnet").id).toBe("claude-sonnet-5");
    expect(resolverModelo("opus").id).toBe("claude-opus-5");
  });

  it("deixa passar um modelo novo, fora do catálogo desta versão", () => {
    const r = resolverModelo("claude-opus-9-9");
    expect(r.id).toBe("claude-opus-9-9");
    expect(r.origem).toBe("desconhecido");
    expect(r.aviso).toContain("não está na lista conhecida");
  });

  it("valor sem sentido cai no padrão e explica o que fazer", () => {
    const r = resolverModelo("gpt-4o");
    expect(r.id).toBe(MODELO_PADRAO);
    expect(r.origem).toBe("invalido");
    expect(r.aviso).toContain("gpt-4o");
    expect(r.aviso).toContain(MODELO_PADRAO);
  });

  it("nunca lança, seja qual for o lixo no ambiente", () => {
    for (const v of ["   ", "!!!", "claude", "123", "modelo bom"]) {
      expect(() => resolverModelo(v)).not.toThrow();
      expect(resolverModelo(v).id).toBeTruthy();
    }
  });
});

describe("pareceIdDeModelo", () => {
  it("reconhece o formato de identificador e recusa nome comercial", () => {
    expect(pareceIdDeModelo("claude-sonnet-5")).toBe(true);
    expect(pareceIdDeModelo("claude-opus-4-8")).toBe(true);
    expect(pareceIdDeModelo("Sonnet 5")).toBe(false);
    expect(pareceIdDeModelo("claude")).toBe(false);
    expect(pareceIdDeModelo("gpt-4o")).toBe(false);
  });
});

describe("cadeia de fallback", () => {
  it("começa pelo escolhido e não repete", () => {
    const c = cadeiaDeModelos("claude-sonnet-5");
    expect(c[0]).toBe("claude-sonnet-5");
    expect(new Set(c).size).toBe(c.length);
  });

  it("sempre oferece alternativa quando o escolhido não está liberado", () => {
    expect(cadeiaDeModelos(MODELO_PADRAO).length).toBeGreaterThan(1);
  });
});

describe("rotuloModelo", () => {
  it("mostra o nome comercial do id conhecido e devolve o próprio id quando não conhece", () => {
    expect(rotuloModelo("claude-sonnet-5")).toBe("Claude Sonnet 5");
    expect(rotuloModelo("claude-opus-9-9")).toBe("claude-opus-9-9");
  });
});
