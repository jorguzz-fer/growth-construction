import { describe, it, expect } from "vitest";
import { avisoNaEdicao, avisoNoSeletor, efeitoDaTrocaDeSituacao, entraNosRelatorios } from "./situacao-versao";

describe("Prompt H · situação × relatórios (1.1, 1.2, BH-2, BH-3, 5.2)", () => {
  it("chave desligada: tudo entra, como antes", () => {
    for (const kind of ["budget", "forecast", "atual"]) for (const status of ["Rascunho", "Concluído", "Aprovado"]) expect(entraNosRelatorios({ kind, status }, false)).toBe(true);
  });
  it("chave ligada: planejamento só Aprovado; Concluído não entra", () => {
    expect(entraNosRelatorios({ kind: "budget", status: "Rascunho" }, true)).toBe(false);
    expect(entraNosRelatorios({ kind: "forecast", status: "Concluído" }, true)).toBe(false);
    expect(entraNosRelatorios({ kind: "budget", status: "Aprovado" }, true)).toBe(true);
  });
  it("a versão atual NUNCA é filtrada, qualquer que seja a situação", () => {
    for (const status of ["Rascunho", "Concluído", "Aprovado"]) expect(entraNosRelatorios({ kind: "atual", status }, true)).toBe(true);
  });
  it("selo do seletor e avisos de edição", () => {
    expect(avisoNoSeletor({ kind: "budget", status: "Rascunho" }, true)).toBe("Rascunho — não entra nos totais");
    expect(avisoNoSeletor({ kind: "budget", status: "Rascunho" }, false)).toBeNull();
    expect(avisoNoSeletor({ kind: "atual", status: "Rascunho" }, true)).toBeNull();
    expect(avisoNaEdicao({ kind: "forecast", status: "Rascunho" }, false)).toMatch(/Quando a regra/);
    expect(avisoNaEdicao({ kind: "forecast", status: "Rascunho" }, true)).toMatch(/não entra nos relatórios/);
    expect(avisoNaEdicao({ kind: "forecast", status: "Aprovado" }, true)).toBeNull();
    expect(avisoNaEdicao({ kind: "atual", status: "Rascunho" }, true)).toBeNull();
    expect(efeitoDaTrocaDeSituacao(false)).toBeNull();
    expect(efeitoDaTrocaDeSituacao(true)).toMatch(/Aprovar faz/);
  });
});
