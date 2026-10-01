import { describe, expect, it } from "vitest";
import { acumuladoPorMembro, linkParaLancarDiarias, origemDoStakeholder, recusaDaAlocacao, recusaDoRegistro, valorDaDiaria } from "./equipe-regras";

describe("Equipes — regras (Prompt Z, Parte 3)", () => {
  it("3.3 — origem pelo papel do fornecedor: autônomo, sócio ou não alocável", () => {
    expect(origemDoStakeholder(["Prestador de Serviço"])).toBe("autonomo");
    expect(origemDoStakeholder(["Sócio/Quotista"])).toBe("socio");
    expect(origemDoStakeholder(["Sócio/Quotista", "Mão de Obra RPA"])).toBe("autonomo");
    expect(origemDoStakeholder(["Fornecedor de Material"])).toBeNull();
  });
  it("6 / 8 / 10b — origem única; CLT desligado e inativo não entram; diária só para autônomo", () => {
    expect(recusaDaAlocacao({ stakeholderId: "s", funcionarioId: "f", origem: "autonomo", valorDiaria: null })).toMatch(/não os dois/);
    expect(recusaDaAlocacao({ stakeholderId: null, funcionarioId: null, origem: null, valorDiaria: null })).toMatch(/Escolha/);
    expect(recusaDaAlocacao({ stakeholderId: "s", funcionarioId: null, origem: null, valorDiaria: null })).toMatch(/não é alocável/);
    expect(recusaDaAlocacao({ stakeholderId: null, funcionarioId: "f", origem: "clt", valorDiaria: null, funcionarioDesligado: true })).toMatch(/desligado/);
    expect(recusaDaAlocacao({ stakeholderId: "s", funcionarioId: null, origem: "autonomo", valorDiaria: 250, stakeholderAtivo: false })).toMatch(/inativo/);
    expect(recusaDaAlocacao({ stakeholderId: null, funcionarioId: "f", origem: "clt", valorDiaria: 200 })).toMatch(/não têm diária/);
    expect(recusaDaAlocacao({ stakeholderId: "s", funcionarioId: null, origem: "socio", valorDiaria: 200 })).toMatch(/não têm diária/);
    expect(recusaDaAlocacao({ stakeholderId: "s", funcionarioId: null, origem: "autonomo", valorDiaria: 250 })).toBeNull();
    expect(valorDaDiaria("clt", 250)).toBeNull();
    expect(valorDaDiaria("autonomo", 250)).toBe(250);
  });
  it("3.5.1 / 10 — registro: quantidade inteira ou meia; autônomo sem valor vigente é recusado; alocação encerrada não registra", () => {
    expect(recusaDoRegistro({ origem: "autonomo", valorAlocacao: null, quantidade: 1, situacao: "ativa" })).toMatch(/Defina o valor/);
    expect(recusaDoRegistro({ origem: "autonomo", valorAlocacao: 250, quantidade: 0.3, situacao: "ativa" })).toMatch(/Quantidade/);
    expect(recusaDoRegistro({ origem: "clt", valorAlocacao: null, quantidade: 0.5, situacao: "ativa" })).toBeNull();
    expect(recusaDoRegistro({ origem: "autonomo", valorAlocacao: 250, quantidade: 1, situacao: "encerrada" })).toMatch(/encerrada/);
  });
  it("3.5.5 / BZ-1 — acumulado por membro e total; o que não tem despesa vira proposta de lançamento", () => {
    const a = acumuladoPorMembro([
      { id: "a", equipeProjetoId: "m1", quantidade: 1, valor: 250, despesaId: null },
      { id: "b", equipeProjetoId: "m1", quantidade: 0.5, valor: 250, despesaId: null },
      { id: "c", equipeProjetoId: "m1", quantidade: 1, valor: 200, despesaId: "d1" }, // valor antigo, já lançada
      { id: "d", equipeProjetoId: "m2", quantidade: 1, valor: null, despesaId: null }, // CLT: presença, sem valor
    ]);
    expect(a.membros.find((m) => m.equipeProjetoId === "m1")).toEqual({ equipeProjetoId: "m1", quantidade: 2.5, valor: 575, semDespesa: { quantidade: 1.5, valor: 375, ids: ["a", "b"] } });
    expect(a.membros.find((m) => m.equipeProjetoId === "m2")?.semDespesa.ids).toEqual([]);
    expect(a.total).toEqual({ quantidade: 3.5, valor: 575 });
    const href = linkParaLancarDiarias({ projectId: "p", fornecedorId: "s", nome: "João", valor: 375, competencia: "09/2026", quantidade: 1.5, diariasIds: ["a", "b"] });
    expect(href).toContain("/despesas?proj=p&tab=lancamentos&novo=1&pf_valor=375.00&pf_comp=09%2F2026&pf_fornecedor=s");
    expect(href).toContain("pf_diarias=a%2Cb");
  });
});
