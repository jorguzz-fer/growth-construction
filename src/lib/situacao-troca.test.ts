import { describe, it, expect } from "vitest";
import { trocaDeSituacao } from "./situacao-versao";
import { defaultPermissions, SCREEN_IDS } from "./permissions";

/** Decisões de 01/10/2026 — ordem das situações e permissão própria de aprovar. */
describe("Rascunho → Concluído → Aprovado", () => {
  it("aprovar só a partir de Concluído", () => {
    expect(trocaDeSituacao("Rascunho", "Aprovado", false).recusa).toContain("Conclua a versão antes de aprovar");
    expect(trocaDeSituacao("Concluído", "Aprovado", false)).toEqual({ recusa: null, exigeAprovador: true, confirmacao: null });
  });
  it("sair de Aprovado é permitido, mas pede confirmação — e diz o efeito conforme a chave", () => {
    const off = trocaDeSituacao("Aprovado", "Concluído", false, "“Orç”");
    expect(off.exigeAprovador).toBe(true);
    expect(off.confirmacao).toContain("Hoje os relatórios não mudam");
    expect(trocaDeSituacao("Aprovado", "Rascunho", true).confirmacao).toContain("SAI dos relatórios agora");
  });
  it("Rascunho ↔ Concluído é edição comum, sem aprovador nem confirmação", () => {
    expect(trocaDeSituacao("Rascunho", "Concluído", true)).toEqual({ recusa: null, exigeAprovador: false, confirmacao: null });
    expect(trocaDeSituacao("Concluído", "Rascunho", true)).toEqual({ recusa: null, exigeAprovador: false, confirmacao: null });
  });
  it("situação desconhecida é recusada", () => {
    expect(trocaDeSituacao("Rascunho", "Publicado", false).recusa).toBe("Situação inválida.");
  });
});

describe("permissão versaoaprova", () => {
  it("existe, nasce só com owner e admin", () => {
    expect(SCREEN_IDS).toContain("versaoaprova");
    for (const r of ["owner", "admin"] as const) expect(defaultPermissions(r).versaoaprova.editar).toBe(true);
    for (const r of ["membro", "contador"] as const) {
      expect(defaultPermissions(r).versaoaprova.editar, r).toBe(false);
      expect(defaultPermissions(r).versaoaprova.ver, r).toBe(false);
    }
  });
});
