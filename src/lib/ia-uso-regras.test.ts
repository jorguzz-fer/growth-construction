import { describe, it, expect } from "vitest";
import { avisoDeFallback, recusaPorLimite, resumoPorOperacao, type LinhaDeUso } from "./ia-uso-regras";

const l = (o: Partial<LinhaDeUso>): LinhaDeUso => ({ operacao: "chat", modelo: "m", fallback: false, entrada: 10, saida: 2, cacheCriacao: 0, cacheLida: 0, erro: false, ...o });

describe("consumo da IA (Prompt AM, Parte 5)", () => {
  it("limite por pessoa e por empresa, com mensagem clara", () => {
    expect(recusaPorLimite({ pessoa: 29, empresa: 299 })).toBeNull();
    expect(recusaPorLimite({ pessoa: 30, empresa: 0 })).toContain("30 perguntas por hora por pessoa");
    expect(recusaPorLimite({ pessoa: 0, empresa: 300 })).toContain("300 perguntas por hora da empresa");
  });

  it("totais por operação: entrada inclui a criação do cache; leitura do cache à parte", () => {
    const r = resumoPorOperacao([l({ entrada: 5, cacheCriacao: 1000 }), l({ entrada: 5, cacheLida: 1000 }), l({ operacao: "despesa", erro: true, entrada: 0, saida: 0 })]);
    expect(r[0]).toEqual({ operacao: "chat", chamadas: 2, erros: 0, entrada: 1010, saida: 4, cacheLida: 1000 });
    expect(r[1]).toMatchObject({ operacao: "despesa", chamadas: 1, erros: 1 });
  });

  it("avisa quando o primário falha sistematicamente (cadeia de fallback)", () => {
    expect(avisoDeFallback([...Array(4)].map(() => l({ fallback: true })))).toBeNull();
    expect(avisoDeFallback([...Array(6)].map(() => l({ fallback: true })).concat([l({})]))).toContain("6 de 7");
    expect(avisoDeFallback([...Array(5)].map(() => l({ fallback: true })).concat([...Array(5)].map(() => l({}))))).toBeNull();
  });
});
