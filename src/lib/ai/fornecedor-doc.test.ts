import { describe, it, expect } from "vitest";
import {
  montarPreenchimentoFornecedor,
  type DadosFornecedorLidos,
} from "./fornecedor-doc";

function lido(over: Partial<DadosFornecedorLidos> = {}): DadosFornecedorLidos {
  return {
    nome: "",
    nomeFantasia: "",
    tipo: "",
    doc: "",
    contato: "",
    email: "",
    tel: "",
    whatsapp: "",
    site: "",
    endereco: "",
    numero: "",
    complemento: "",
    bairro: "",
    cidade: "",
    estado: "",
    cep: "",
    papeis: [],
    baixaConfianca: [],
    ...over,
  };
}

describe("preenchimento do cadastro de fornecedor", () => {
  it("preenche o que está vazio e preserva o que o usuário digitou", () => {
    const res = montarPreenchimentoFornecedor(
      lido({ nome: "A F ANDRADE COM MAT CONSTR EIRELI", doc: "10.365.725/0002-18", cidade: "Itanhaém" }),
      { nome: "Nome digitado à mão" },
      [],
    );
    expect(res.valores.nome).toBeUndefined();
    expect(res.valores.doc).toBe("10.365.725/0002-18");
    expect(res.valores.cidade).toBe("Itanhaém");
    expect(res.alertas.nome).toBeUndefined();
  });

  it("marca como 'conferir' o que a IA leu com baixa confiança", () => {
    const res = montarPreenchimentoFornecedor(
      lido({ nome: "Casarão Itanhaém", tel: "(13)3426-8176", baixaConfianca: ["tel"] }),
      {},
      ["Fornecedor"],
    );
    expect(res.alertas.tel?.nivel).toBe("conferir");
    expect(res.alertas.nome).toBeUndefined();
  });

  it("cobra nome e documento quando o arquivo não os traz", () => {
    const res = montarPreenchimentoFornecedor(lido({ cidade: "Itanhaém" }), {}, ["Fornecedor"]);
    expect(res.alertas.nome?.nivel).toBe("faltando");
    expect(res.alertas.doc?.nivel).toBe("faltando");
    // Campo opcional vazio não vira alerta — a tela ficaria ilegível.
    expect(res.alertas.site).toBeUndefined();
  });

  it("CPF mascarado entra no campo, mas pede conferência dos dígitos", () => {
    const res = montarPreenchimentoFornecedor(
      lido({ nome: "Israel Pereira Salvador", doc: "***.844.476-**", tipo: "PF" }),
      {},
      ["Fornecedor"],
    );
    expect(res.valores.doc).toBe("***.844.476-**");
    expect(res.alertas.doc?.nivel).toBe("conferir");
    expect(res.valores.tipo).toBe("PF");
  });

  it("aplica os papéis lidos e cobra escolha quando ninguém definiu nenhum", () => {
    const comPapeis = montarPreenchimentoFornecedor(
      lido({ nome: "X", doc: "42.844.364/0001-06", papeis: ["Fornecedor"] }),
      {},
      [],
    );
    expect(comPapeis.papeis).toEqual(["Fornecedor"]);
    expect(comPapeis.alertas.papeis).toBeUndefined();

    const semPapeis = montarPreenchimentoFornecedor(lido({ nome: "X" }), {}, []);
    expect(semPapeis.papeis).toBeNull();
    expect(semPapeis.alertas.papeis?.nivel).toBe("faltando");
  });
});
