import { describe, it, expect } from "vitest";
import {
  isContaDaEmpresa,
  saldoDevidoTerceiros,
  saldoDisponivel,
} from "./contas-saldo";

/**
 * Regra de negócio: uma conta do tipo "Terceiros" registra quanto a empresa DEVE
 * a um sócio/terceiro que pagou despesas do próprio bolso. É obrigação, não
 * dinheiro em caixa — e por isso nunca pode ser somada ao saldo disponível.
 */
const CONTAS = [
  { tipo: "Construtora", saldo: "10000" },
  { tipo: "Imobiliária", saldo: "5000" },
  { tipo: "Terceiros", saldo: "3000" },
];

describe("saldoDisponivel", () => {
  it("soma apenas as contas da empresa", () => {
    expect(saldoDisponivel(CONTAS)).toBe(15000);
  });

  it("não conta a obrigação com terceiros como dinheiro disponível", () => {
    const semTerceiros = CONTAS.filter((c) => c.tipo !== "Terceiros");
    expect(saldoDisponivel(CONTAS)).toBe(saldoDisponivel(semTerceiros));
  });

  it("aceita saldo como número ou string e ignora valores inválidos", () => {
    expect(saldoDisponivel([{ tipo: "Construtora", saldo: 1500.5 }])).toBe(1500.5);
    expect(saldoDisponivel([{ tipo: "Construtora", saldo: "abc" }])).toBe(0);
  });

  it("retorna zero sem contas", () => {
    expect(saldoDisponivel([])).toBe(0);
  });
});

describe("saldoDevidoTerceiros", () => {
  it("soma somente as contas de terceiros", () => {
    expect(saldoDevidoTerceiros(CONTAS)).toBe(3000);
  });

  it("disponível e devido são conjuntos disjuntos que cobrem o total", () => {
    const total = CONTAS.reduce((a, c) => a + Number(c.saldo), 0);
    expect(saldoDisponivel(CONTAS) + saldoDevidoTerceiros(CONTAS)).toBe(total);
  });
});

describe("isContaDaEmpresa", () => {
  it("classifica os tipos corretamente", () => {
    expect(isContaDaEmpresa({ tipo: "Construtora" })).toBe(true);
    expect(isContaDaEmpresa({ tipo: "Imobiliária" })).toBe(true);
    expect(isContaDaEmpresa({ tipo: "Terceiros" })).toBe(false);
  });
});
