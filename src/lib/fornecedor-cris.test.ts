import { describe, it, expect } from "vitest";
import { formularioDoFornecedor, lidosDaProposta, manterSoNaoPropostos } from "./fornecedor-cris";
import { montarPreenchimentoFornecedor } from "./ai/fornecedor-doc";

/** Prompt W2 — a Cris lê o documento anexado e preenche o cadastro; quem cadastra é a tela. */
const PAPEIS = ["Fornecedor de Material", "Prestador de Serviço", "Sócio/Quotista"];

describe("Prompt W2 · Fornecedores com a Cris", () => {
  it("o formulário não leva banco, conta nem PIX", () => {
    const nomes = formularioDoFornecedor(PAPEIS).campos.map((c) => c.nome);
    expect(nomes).toContain("doc");
    expect(nomes).toContain("papeis");
    expect(nomes.some((n) => /banco|^conta$|pix|agencia|titular/i.test(n))).toBe(false);
  });

  it("a proposta vira a leitura de documento; papel fora da lista cai", () => {
    const l = lidosDaProposta({ nome: " Concreteira X Ltda ", tipo: "PJ", doc: "12.345.678/0001-90", papeis: "fornecedor de material, Astronauta" }, PAPEIS);
    expect(l).toMatchObject({ nome: "Concreteira X Ltda", tipo: "PJ", doc: "12.345.678/0001-90", papeis: ["Fornecedor de Material"], email: "" });
    expect(lidosDaProposta({ tipo: "XX" }, PAPEIS).tipo).toBe("");
  });

  it("o que a Cris propôs substitui; o resto da tela fica e não vira alerta", () => {
    const atuais = { nome: "Nome digitado", email: "velho@x.com", doc: "" };
    const propostos = new Set(["email"]);
    const res = montarPreenchimentoFornecedor(lidosDaProposta({ email: "novo@x.com" }, PAPEIS), manterSoNaoPropostos(atuais, propostos), []);
    expect(res.valores.email).toBe("novo@x.com");
    expect(res.valores.nome).toBeUndefined();
    expect(res.alertas.nome).toBeUndefined();
  });
});
