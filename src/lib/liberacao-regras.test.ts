import { describe, it, expect } from "vitest";
import { lerValorDaLiberacao, motivoDeRecusaDaLiberacao, statusDaLiberacao } from "./liberacao-regras";

describe("Liberações de Obra — regras do lançamento (Prompt O, 3.1 e 5)", () => {
  it("lançamento em ordem passa; vírgula decimal lida certo; vazio nunca vira zero", () => {
    expect(motivoDeRecusaDaLiberacao({ data: "09/10/2026", origem: "CEF · medição 03/2026", valor: "1.500,50" })).toBeNull();
    expect(lerValorDaLiberacao("1.500,50")).toBe(1500.5);
    expect(lerValorDaLiberacao("")).toBeNaN();
  });

  it("valor zero, negativo ou ilegível; data ausente ou inválida; origem em branco — recusados com o campo nomeado", () => {
    for (const v of ["", "0", "-1", "abc"]) expect(motivoDeRecusaDaLiberacao({ data: "09/10/2026", origem: "CEF", valor: v })).toMatch(/maior que zero/);
    expect(motivoDeRecusaDaLiberacao({ data: "", origem: "CEF", valor: "1" })).toMatch(/data/);
    expect(motivoDeRecusaDaLiberacao({ data: "2026-09-10", origem: "CEF", valor: "1" })).toMatch(/data/);
    expect(motivoDeRecusaDaLiberacao({ data: "13/40/2026", origem: "CEF", valor: "1" })).toMatch(/data/);
    expect(motivoDeRecusaDaLiberacao({ data: "09/10/2026", origem: "  ", valor: "1" })).toMatch(/origem/);
  });

  it("status legado 'received' continua exibido como 'Recebido'; nulo idem; outro valor passa como está", () => {
    expect(statusDaLiberacao("received")).toBe("Recebido");
    expect(statusDaLiberacao(null)).toBe("Recebido");
    expect(statusDaLiberacao("Previsto")).toBe("Previsto");
  });
});
