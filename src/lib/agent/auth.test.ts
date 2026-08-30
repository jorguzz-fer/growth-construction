import { describe, expect, it } from "vitest";
import { onlyDigits, parseAllowlist, phoneVariants, secretsMatch } from "./auth";

describe("onlyDigits", () => {
  it("descarta +, espaço, parênteses e hífen", () => {
    expect(onlyDigits("+55 (11) 98994-0404")).toBe("5511989940404");
  });

  it("aceita nulo e vazio", () => {
    expect(onlyDigits(null)).toBe("");
    expect(onlyDigits(undefined)).toBe("");
  });
});

describe("phoneVariants", () => {
  it("gera a variante SEM o nono dígito", () => {
    // O WhatsApp entrega com o 9; JIDs antigos vêm sem. Se só a forma crua
    // fosse comparada, o dono legítimo do número levaria 403.
    expect(phoneVariants("+5511989940404")).toEqual(["5511989940404", "551189940404"]);
  });

  it("gera a variante COM o nono dígito", () => {
    expect(phoneVariants("551189940404")).toEqual(["551189940404", "5511989940404"]);
  });

  it("não inventa variante para número não-brasileiro", () => {
    expect(phoneVariants("+1 415 555 2671")).toEqual(["14155552671"]);
  });

  it("devolve lista vazia para entrada sem dígito", () => {
    expect(phoneVariants("")).toEqual([]);
    expect(phoneVariants("{{contact_phone}}")).toEqual([]);
  });
});

describe("parseAllowlist", () => {
  it("lê pares telefone=email separados por vírgula", () => {
    const m = parseAllowlist("+5511989940404=fer.jorge@gmail.com, +5511979546007=thiago@x.com");
    expect(m.get("5511989940404")).toBe("fer.jorge@gmail.com");
    expect(m.get("5511979546007")).toBe("thiago@x.com");
  });

  it("indexa TODAS as variantes do número", () => {
    const m = parseAllowlist("+5511989940404=fer.jorge@gmail.com");
    expect(m.get("551189940404")).toBe("fer.jorge@gmail.com");
  });

  it("aceita ponto-e-vírgula, quebra de linha e ':' como separador", () => {
    const m = parseAllowlist("+5511989940404:a@x.com;\n+5511979546007=b@x.com");
    expect(m.get("5511989940404")).toBe("a@x.com");
    expect(m.get("5511979546007")).toBe("b@x.com");
  });

  it("normaliza o e-mail para minúsculas", () => {
    expect(parseAllowlist("5511989940404=Fer.Jorge@Gmail.com").get("5511989940404")).toBe(
      "fer.jorge@gmail.com",
    );
  });

  it("ignora entrada malformada em vez de explodir", () => {
    const m = parseAllowlist("lixo, =semtelefone@x.com, 5511989940404=, ok=");
    expect(m.size).toBe(0);
  });

  it("env vazia ou ausente = ninguém autorizado", () => {
    expect(parseAllowlist(undefined).size).toBe(0);
    expect(parseAllowlist("").size).toBe(0);
  });
});

describe("secretsMatch", () => {
  it("aceita apenas o segredo idêntico", () => {
    expect(secretsMatch("abc123", "abc123")).toBe(true);
    expect(secretsMatch("abc123", "abc124")).toBe(false);
  });

  it("não estoura com comprimentos diferentes (compara hashes)", () => {
    expect(secretsMatch("curto", "muito-muito-mais-longo")).toBe(false);
  });

  it("string vazia nunca casa — nem contra vazio", () => {
    // Sem isto, AGENT_API_TOKEN ausente autenticaria requisição sem header.
    expect(secretsMatch("", "")).toBe(false);
    expect(secretsMatch("", "abc")).toBe(false);
  });
});
