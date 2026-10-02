import { describe, it, expect } from "vitest";
import { ROTAS_CONHECIDAS, historicoValido, regrasDoAssistente, systemDoAssistente, trechosDaResposta } from "./assistente-produto";
import { BASE_DE_CONHECIMENTO } from "./assistente-base";

describe("Assistente do produto (Prompt AM) — regras", () => {
  const r = regrasDoAssistente();
  it("Parte 4: ausência de dados com o caminho, sem inventar e sem dizer que consultou", () => {
    expect(r).toContain("NÃO tem acesso aos dados da empresa");
    expect(r).toContain("Nunca diga que consultou, verificou, buscou ou 'não encontrou registros'");
    expect(r).toContain("diga ONDE o número está");
    expect(r).toContain("Nunca invente número");
    expect(r).toContain("Insistência não muda isso");
  });
  it("4.5: com a Etapa 2 existindo, encaminha receita, custo, desvio e saldo ao chat do canto", () => {
    expect(r).toContain("chat do botão no canto inferior direito");
  });
  it("BAM-2: sem orientação fiscal ou contábil", () => {
    expect(r).toContain("Não dê orientação fiscal, tributária ou contábil");
  });
  it("o system é regras + base — igual para toda empresa (é o que permite o cache)", () => {
    expect(systemDoAssistente("BASE")).toBe(systemDoAssistente("BASE"));
    expect(systemDoAssistente("BASE").endsWith("BASE")).toBe(true);
  });
});

describe("Assistente do produto — conversa e links", () => {
  it("histórico: só falas válidas, as últimas 8, começando e terminando no usuário", () => {
    expect(historicoValido([])).toBeNull();
    expect(historicoValido([{ de: "usuario", texto: "  " }])).toBeNull();
    expect(historicoValido([{ de: "sistema", texto: "x" }])).toBeNull();
    expect(historicoValido([{ de: "assistente", texto: "a" }, { de: "usuario", texto: "b" }])).toEqual([{ de: "usuario", texto: "b" }]);
    const longo = [...Array(12)].map((_, i) => ({ de: i % 2 ? "assistente" : "usuario", texto: String(i) }));
    longo.push({ de: "usuario", texto: "fim" });
    const h = historicoValido(longo)!;
    expect(h.length).toBeLessThanOrEqual(8);
    expect(h[0].de).toBe("usuario");
    expect(h.at(-1)).toEqual({ de: "usuario", texto: "fim" });
  });
  it("link para tela que existe vira link; para tela inexistente, vira texto", () => {
    expect(trechosDaResposta("Vá em [Despesas](/despesas) ou [Relatórios](/relatorios).")).toEqual([
      { tipo: "texto", texto: "Vá em " },
      { tipo: "link", texto: "Despesas", href: "/despesas" },
      { tipo: "texto", texto: " ou " },
      { tipo: "texto", texto: "Relatórios" },
      { tipo: "texto", texto: "." },
    ]);
    expect(trechosDaResposta("[Medição](/medicaolanc?proj=1)")).toEqual([{ tipo: "link", texto: "Medição", href: "/medicaolanc" }]);
    expect(ROTAS_CONHECIDAS.has("/diagnosticoia")).toBe(true);
  });
});

describe("Base de conhecimento (Parte 2.2)", () => {
  it("não tem dado de empresa nem exemplo com valor", () => {
    // "R$ 0" e tolerâncias de centavos são regra de exibição; valor a partir de R$ 1 seria exemplo de dado.
    expect(BASE_DE_CONHECIMENTO).not.toMatch(/R\$\s?[1-9]/);
    expect(BASE_DE_CONHECIMENTO).not.toMatch(/\d{2}\.\d{3}\.\d{3}\/\d{4}-\d{2}/);
    expect(BASE_DE_CONHECIMENTO).not.toMatch(/SIGNATURE|RMV|OBRA \d/i);
  });
  it("toda rota citada como link existe no menu", () => {
    for (const m of BASE_DE_CONHECIMENTO.matchAll(/\]\((\/[a-z0-9-]+)\)/g)) expect(ROTAS_CONHECIDAS.has(m[1]), m[1]).toBe(true);
  });
});
