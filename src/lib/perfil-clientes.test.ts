import { describe, it, expect } from "vitest";
import { contar, faixaEtaria, idade, perfilDaBase, type ClienteParaPerfil } from "./perfil-clientes";

const hoje = new Date(2026, 9, 18);
const cli = (o: Partial<ClienteParaPerfil>): ClienteParaPerfil => ({ statusContrato: null, cidadeEstado: null, morarOuInvestir: null, comoConheceu: null, nascimento: null, unitCode: null, ...o });

describe("Prompt M2 — perfil da base de clientes", () => {
  it("idade e faixa etária pelos dois formatos de data", () => {
    expect(idade("1990-10-19", hoje)).toBe(35);
    expect(idade("10/18/1990", hoje)).toBe(36);
    expect(idade("lixo", hoje)).toBeNull();
    expect(faixaEtaria(36)).toBe("35 a 44");
    expect(faixaEtaria(null)).toBe("Não informada");
  });

  it("categoria com menos de 3 vai para Outros; o teto junta o resto", () => {
    const c = contar(["SP", "SP", "SP", "RJ", "MG", null]);
    expect(c).toEqual([{ rotulo: "SP", qtd: 3 }, { rotulo: "Não informado", qtd: 1 }, { rotulo: "Outros (menos de 3 cada)", qtd: 2 }]);
    expect(contar(["a", "a", "a", "b", "b", "b"], { maximo: 1 })).toEqual([{ rotulo: "a", qtd: 3 }, { rotulo: "Outros (menos de 3 cada)", qtd: 3 }]);
  });

  it("o perfil só conta; não leva nome, documento, renda nem contato", () => {
    const p = perfilDaBase([cli({ statusContrato: "Assinado", unitCode: "A101", morarOuInvestir: "Morar" }), cli({ statusContrato: "Assinado", morarOuInvestir: "Morar" }), cli({ statusContrato: "Assinado", morarOuInvestir: "Morar" })], hoje);
    expect(p.total).toBe(3);
    expect(p.comUnidade).toBe(1);
    expect(p.porSituacao).toEqual([{ rotulo: "Assinado", qtd: 3 }]);
    expect(JSON.stringify(p)).not.toMatch(/cpf|renda|fgts|score|email|celular/i);
  });
});
