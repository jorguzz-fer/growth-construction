import { describe, it, expect } from "vitest";
import {
  instrucaoLeituraDespesa,
  promptSistemaDespesa,
  type ContextoLeituraDespesa,
} from "./despesa-prompt";

const CTX: ContextoLeituraDespesa = {
  fornecedores: [
    { nome: "Zeladoria Sul", doc: null },
    { nome: "A F ANDRADE COM MAT CONSTR EIRELI", doc: "10.365.725/0002-18" },
    { nome: "Casarão Itanhaém", doc: null },
  ],
  contas: [
    { code: "2.10", name: "Serviços" },
    { code: "1.1", name: "Materiais" },
    { code: "1.2", name: "Mão de obra" },
  ],
  projetos: [{ nome: "OBRA 28" }, { nome: "OBRA 25" }],
  categorias: ["Custo de Obra"],
  tiposDocumento: [
    { id: "SEM_DOC", label: "Sem documento" },
    { id: "NFE", label: "NF-e" },
  ],
  empresa: { nome: "BMV Construções Ltda", cnpj: "42.844.364/0001-06" },
};

describe("parte estável do prompt (a que é cacheada)", () => {
  const p = promptSistemaDespesa(CTX);

  it("leva o contexto do tenant: empresa, obras, fornecedores, plano e tipos", () => {
    expect(p).toContain("BMV Construções Ltda");
    expect(p).toContain("42.844.364/0001-06");
    expect(p).toContain("OBRA 25");
    expect(p).toContain("A F ANDRADE COM MAT CONSTR EIRELI");
    expect(p).toContain("1.1 — Materiais");
    expect(p).toContain("NFE = NF-e");
  });

  it("deixa explícito que a empresa é a pagadora, nunca a fornecedora", () => {
    expect(p).toContain("PAGADORA");
    expect(p).toContain("RECEBEDOR");
  });

  /**
   * O cache é casamento de PREFIXO byte a byte: se a ordem das listas variar
   * entre uma leitura e outra (a consulta ao banco não garante ordem), o
   * prefixo muda, o cache não é aproveitado e ninguém percebe — só a fatura.
   */
  it("ordena as listas, para o prefixo ser idêntico entre chamadas", () => {
    const embaralhado = promptSistemaDespesa({
      ...CTX,
      fornecedores: [...CTX.fornecedores].reverse(),
      contas: [...CTX.contas].reverse(),
      projetos: [...CTX.projetos].reverse(),
    });
    expect(embaralhado).toBe(p);
  });

  it("ordena o plano de contas por código, numericamente", () => {
    expect(p.indexOf("- 1.1 ")).toBeLessThan(p.indexOf("- 1.2 "));
    expect(p.indexOf("- 1.2 ")).toBeLessThan(p.indexOf("- 2.10 "));
  });

  it("não depende dos arquivos desta leitura — se dependesse, nunca cachearia", () => {
    expect(p).not.toContain("arquivo");
    expect(p).not.toContain("Arquivo");
  });

  it("cadastro vazio não quebra o prompt", () => {
    const vazio = promptSistemaDespesa({
      ...CTX,
      fornecedores: [],
      contas: [],
      projetos: [],
    });
    expect(vazio).toContain("(nenhum cadastrado)");
  });
});

describe("parte volátil (cobrada inteira em toda leitura)", () => {
  it("um arquivo: instrução curta, sem o texto de combinação", () => {
    const i = instrucaoLeituraDespesa(1);
    expect(i).toContain("preencher_despesa");
    expect(i).not.toContain("MESMA compra");
    expect(i.length).toBeLessThan(200);
  });

  it("vários arquivos: manda combinar as informações da mesma compra", () => {
    const i = instrucaoLeituraDespesa(3);
    expect(i).toContain("3 arquivos");
    expect(i).toContain("MESMA compra");
    expect(i).toContain("observacoes");
  });

  it("não repete o contexto do tenant — isso já está na parte cacheada", () => {
    const i = instrucaoLeituraDespesa(2);
    expect(i).not.toContain("PLANO DE CONTAS");
    expect(i).not.toContain("FORNECEDORES");
  });
});
