import { describe, it, expect } from "vitest";
import { valoresParaOFormulario } from "./cris-no-formulario";
import { intervaloDoMes, lerFiltrosDaAuditoria, temFiltro } from "./auditoria-filtros";

/** Prompts AH2/AK2/AF2 — a proposta da Cris nos formulários de página e os filtros da Auditoria. */
describe("Prompt AH2 · proposta nos campos de um formulário de página", () => {
  const opcoes = { regimeTributario: [{ rotulo: "Simples Nacional", valor: "simples" }] };
  it("texto vai como está; opção vai pelo rótulo e vira o value", () => {
    expect(valoresParaOFormulario({ cnpj: "12.345.678/0001-90", regimeTributario: "simples nacional" }, opcoes)).toEqual({ cnpj: "12.345.678/0001-90", regimeTributario: "simples" });
  });
  it("rótulo desconhecido cai", () => {
    expect(valoresParaOFormulario({ regimeTributario: "Lucro Imaginário" }, opcoes)).toEqual({});
  });
});

describe("Prompt AK2 · filtros da Auditoria", () => {
  const validos = new Set(["u1"]);
  it("lê usuário, entidade, ação e período; usuário de fora e data inválida caem", () => {
    expect(lerFiltrosDaAuditoria({ usuario: "u1", entidade: "despesa", acao: " despesa.update ", de: "2026-10-01", ate: "10/18/2026" }, validos)).toEqual({ usuario: "u1", entidade: "despesa", acao: "despesa.update", de: "2026-10-01", ate: null });
    expect(lerFiltrosDaAuditoria({ usuario: "intruso" }, validos).usuario).toBeNull();
    expect(lerFiltrosDaAuditoria({ usuario: "sistema" }, validos).usuario).toBe("sistema");
  });
  it("sem nada, sem filtro; o mês vai do dia 1 a hoje", () => {
    expect(temFiltro(lerFiltrosDaAuditoria({}, validos))).toBe(false);
    expect(intervaloDoMes("2026-10-18")).toEqual({ de: "2026-10-01", ate: "2026-10-18" });
  });
});
