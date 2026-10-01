import { describe, it, expect } from "vitest";
import { dataGravadaValida, lerValorDoAtivo, motivoDeRecusaDoAtivo, type AtivoParaValidar } from "./permuta-regras";

const ok: AtivoParaValidar = {
  tipo: "Imóvel",
  estimado: "80.000,00",
  unitCode: "A-1",
  cliente: "Maria",
  dataRecebimento: "09/15/2026",
  status: "Disponivel",
  dataVenda: null,
  valorVenda: null,
  formaVenda: "avista",
  parcelas: null,
  periodicidade: "mensal",
};

describe("Permuta — regras do cadastro (Prompt P, 3.1)", () => {
  it("cadastro em ordem passa; estimado aceita vírgula decimal", () => {
    expect(motivoDeRecusaDoAtivo(ok)).toBeNull();
    expect(lerValorDoAtivo("1.234,56")).toBe(1234.56);
    expect(lerValorDoAtivo("1234.56")).toBe(1234.56);
    expect(lerValorDoAtivo("")).toBeNaN(); // vazio nunca vira zero
  });

  it("sem unidade, sem cliente, sem data de recebimento ou sem tipo: recusa com o campo nomeado", () => {
    expect(motivoDeRecusaDoAtivo({ ...ok, unitCode: "" })).toMatch(/unidade/);
    expect(motivoDeRecusaDoAtivo({ ...ok, cliente: " " })).toMatch(/cliente/);
    expect(motivoDeRecusaDoAtivo({ ...ok, dataRecebimento: "" })).toMatch(/data de recebimento/);
    expect(motivoDeRecusaDoAtivo({ ...ok, dataRecebimento: "2026-09-15" })).toMatch(/data de recebimento/);
    expect(motivoDeRecusaDoAtivo({ ...ok, tipo: null })).toMatch(/tipo/);
  });

  it("estimado vazio, zero, negativo ou ilegível é recusado — nunca vira '0'", () => {
    for (const v of ["", "0", "-5", "abc", "0,00"]) expect(motivoDeRecusaDoAtivo({ ...ok, estimado: v })).toMatch(/maior que zero/);
  });

  it("vendido exige data e valor de venda; parcelada exige parcelas", () => {
    expect(motivoDeRecusaDoAtivo({ ...ok, status: "Vendido" })).toMatch(/data da venda/);
    expect(motivoDeRecusaDoAtivo({ ...ok, status: "Vendido", dataVenda: "10/01/2026" })).toMatch(/valor da venda/);
    expect(motivoDeRecusaDoAtivo({ ...ok, status: "Vendido", dataVenda: "10/01/2026", valorVenda: "0" })).toMatch(/valor da venda/);
    expect(motivoDeRecusaDoAtivo({ ...ok, status: "Vendido", dataVenda: "10/01/2026", valorVenda: "82.000,00" })).toBeNull();
    expect(motivoDeRecusaDoAtivo({ ...ok, status: "Vendido", dataVenda: "10/01/2026", valorVenda: "82000", formaVenda: "parcelada" })).toMatch(/parcelas/);
    expect(motivoDeRecusaDoAtivo({ ...ok, status: "Vendido", dataVenda: "10/01/2026", valorVenda: "82000", formaVenda: "parcelada", parcelas: "0" })).toMatch(/parcelas/);
    expect(motivoDeRecusaDoAtivo({ ...ok, status: "Vendido", dataVenda: "10/01/2026", valorVenda: "82000", formaVenda: "parcelada", parcelas: "12" })).toBeNull();
  });

  it("domínios: status, forma de revenda e periodicidade só da lista; data de venda inválida é recusada mesmo sem venda", () => {
    expect(motivoDeRecusaDoAtivo({ ...ok, status: "Quitado" })).toMatch(/Status inválido/);
    expect(motivoDeRecusaDoAtivo({ ...ok, formaVenda: "troca" })).toMatch(/Forma de revenda/);
    expect(motivoDeRecusaDoAtivo({ ...ok, periodicidade: "diaria" })).toMatch(/Periodicidade/);
    expect(motivoDeRecusaDoAtivo({ ...ok, dataVenda: "31/12/2026" })).toMatch(/Data de venda inválida/);
    expect(motivoDeRecusaDoAtivo({ ...ok, valorVenda: "-1" })).toMatch(/Valor de venda inválido/);
    expect(dataGravadaValida("13/01/2026")).toBe(false);
    expect(dataGravadaValida("12/31/2026")).toBe(true);
  });
});
