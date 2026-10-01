import { describe, it, expect } from "vitest";
import { patchDeAtualizacao, prepararImportacao, resumoDaImportacao } from "./unidade-importacao";

describe("importação de unidades (Prompt J, seção 4) — regras puras", () => {
  it("4.4 · separa válidas de ignoradas, com motivo", () => {
    const { validas, ignoradas } = prepararImportacao([
      { code: " 101 ", valor: 10 },
      { code: "" },
      { code: "101", valor: 20 },
      { code: "102", status: "Quitada" as never },
      { code: "103", valor: -1 },
      { code: "104", m2: NaN },
      { code: "105", status: "Permutado" },
    ]);
    expect(validas.map((v) => v.code)).toEqual(["101", "105"]);
    expect(validas[0].valor).toBe(10); // a primeira linha vale
    expect(ignoradas).toEqual([
      { code: "linha 2", motivo: "sem código" },
      { code: "101", motivo: expect.stringMatching(/repetido/) },
      { code: "102", motivo: expect.stringMatching(/status inválido/) },
      { code: "103", motivo: expect.stringMatching(/valor/) },
      { code: "104", motivo: expect.stringMatching(/m²/) },
    ]);
  });

  it("4.1 · o código é exato depois do trim: 'A' e 'a' são unidades diferentes (como a trava do banco)", () => {
    const { validas } = prepararImportacao([{ code: "A" }, { code: "a" }]);
    expect(validas).toHaveLength(2);
  });

  it("4.2 · a atualização só leva o que veio preenchido; nunca plano, data da venda ou tipo de cadastro", () => {
    expect(patchDeAtualizacao({ code: "101" })).toEqual({});
    expect(patchDeAtualizacao({ code: "101", bloco: "", tipo: " ", valor: 0 })).toEqual({ valor: "0" });
    const p = patchDeAtualizacao({ code: "101", bloco: " B ", tipo: "Apto", m2: 65.5, andar: 3, valor: 350000, status: "Vendido" });
    expect(p).toEqual({ bloco: "B", tipo: "Apto", m2: "65.5", andar: 3, valor: "350000", status: "Vendido" });
    expect(Object.keys(p)).not.toContain("paymentPlan");
    expect(Object.keys(p)).not.toContain("mesVenda");
  });

  it("4.4 · resumo", () => {
    expect(resumoDaImportacao({ inseridas: 2, atualizadas: 3, ignoradas: [] })).toBe("2 inserida(s), 3 atualizada(s).");
    expect(resumoDaImportacao({ inseridas: 0, atualizadas: 0, ignoradas: [{ code: "x", motivo: "y" }] })).toBe("0 inserida(s), 0 atualizada(s), 1 ignorada(s).");
  });
});
