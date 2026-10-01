import { describe, expect, it } from "vitest";
import { avisoDeCpfDuplicado, changesSemValorPessoal, cpfMascarado, recusaDaExclusao, recusaDoFuncionario, semSensiveis, situacaoDoFuncionario, soCamposPermitidos } from "./funcionario-regras";

describe("Funcionários — regras (Prompt Z, Parte 2 e 7)", () => {
  it("2.5 — nome obrigatório; CPF validado pelo validador do Prompt W; desligamento após admissão", () => {
    expect(recusaDoFuncionario({ nome: " ", cpf: null })).toMatch(/nome/);
    expect(recusaDoFuncionario({ nome: "Ana", cpf: "123.456.789-00" })).toMatch(/CPF inválido/);
    expect(recusaDoFuncionario({ nome: "Ana", cpf: "529.982.247-25" })).toBeNull();
    expect(recusaDoFuncionario({ nome: "Ana", cpf: null, salario: -1 })).toMatch(/Salário/);
    expect(recusaDoFuncionario({ nome: "Ana", cpf: null, admissao: "2026-09-01", desligamento: "2026-08-01" })).toMatch(/desligamento/);
  });
  it("2.5 / 6.1 — CPF duplicado avisa (funcionário e fornecedor), não bloqueia", () => {
    const outros = [{ origem: "fornecedor" as const, nome: "João Pedreiro", cpf: "529.982.247-25" }, { origem: "funcionario" as const, nome: "João", cpf: "52998224725" }];
    expect(avisoDeCpfDuplicado("529.982.247-25", outros)).toMatch(/João Pedreiro \(fornecedor\), João \(funcionário\)/);
    expect(avisoDeCpfDuplicado("529.982.247-25", outros, { origem: "funcionario", nome: "João" })).toMatch(/^Este CPF já consta em: João Pedreiro \(fornecedor\)\./);
    expect(avisoDeCpfDuplicado("111", [])).toBeNull();
  });
  it("7.2 / 14 — sem a permissão, os campos sensíveis saem como null e não são gravados; com ela, passam", () => {
    const f = { nome: "Ana", cpf: "529", endereco: "Rua X", salario: 3000, jornada: "44h", bancoConta: "1-2", cargo: "Pedreira" };
    expect(semSensiveis(f, false)).toEqual({ nome: "Ana", cpf: "529", endereco: null, salario: null, jornada: null, bancoConta: null, cargo: "Pedreira" });
    expect(semSensiveis(f, true)).toBe(f);
    expect(soCamposPermitidos(f, false)).toEqual({ nome: "Ana", cpf: "529", cargo: "Pedreira" });
  });
  it("7.3 / 15 — o log registra que CPF, salário, endereço e banco mudaram, não o valor", () => {
    const c = changesSemValorPessoal({ cpf: { de: "1", para: "2" }, salario: { de: 1, para: 2 }, cargo: { de: "a", para: "b" }, endereco: { de: "x", para: "y" } });
    expect(c.cpf).toMatchObject({ protegido: true });
    expect(c.salario).toMatchObject({ protegido: true });
    expect(c.endereco).toMatchObject({ protegido: true });
    expect(c.cargo).toEqual({ de: "a", para: "b" });
    expect(JSON.stringify(c)).not.toMatch(/"1"|"x"/);
  });
  it("13 / 2.4 — CPF mascarado na lista; desligado é situação, não exclusão; excluir só sem alocação e com o nome digitado", () => {
    expect(cpfMascarado("529.982.247-25")).toBe("•••.982.247-••");
    expect(situacaoDoFuncionario({ desligamento: null })).toBe("Ativo");
    expect(situacaoDoFuncionario({ desligamento: "2026-09-30" })).toBe("Desligado");
    expect(recusaDaExclusao({ nome: "Ana Souza" }, 2, "Ana Souza")).toMatch(/alocação/);
    expect(recusaDaExclusao({ nome: "Ana Souza" }, 0, "Ana")).toMatch(/digite o nome/);
    expect(recusaDaExclusao({ nome: "Ana Souza" }, 0, "ana souza")).toBeNull();
  });
});
