import { describe, it, expect } from "vitest";
import {
  ehStatusEditavel,
  ehTipoDeReceita,
  lerValor,
  motivoDeRecusa,
  valorDeContaValido,
  valorRecebidoValido,
} from "./conta-receber-regras";

describe("contas a receber — domínio e validação (Prompt K, CR-04 e CR-05)", () => {
  it("CR-04 · zero e negativo recusam; positivo passa", () => {
    expect(valorDeContaValido(0)).toBe(false);
    expect(valorDeContaValido(-100)).toBe(false);
    expect(valorDeContaValido(NaN)).toBe(false);
    expect(valorDeContaValido(0.01)).toBe(true);
    expect(motivoDeRecusa({ tipo: "Sinal", descricao: null, valor: -5 })).toMatch(/maior que zero/);
    expect(motivoDeRecusa({ tipo: "Sinal", descricao: null, valor: 0 })).toMatch(/maior que zero/);
    expect(motivoDeRecusa({ tipo: "Sinal", descricao: null, valor: 324 })).toBeNull();
  });

  it("CR-05 · tipo fora da lista recusa; 'Outras Receitas' exige descrição", () => {
    expect(ehTipoDeReceita("Sinal")).toBe(true);
    expect(ehTipoDeReceita("Aluguel")).toBe(false);
    expect(motivoDeRecusa({ tipo: "Aluguel", descricao: "x", valor: 10 })).toMatch(/Tipo inválido/);
    expect(motivoDeRecusa({ tipo: "Outras Receitas", descricao: "  ", valor: 10 })).toMatch(/descrição/);
    expect(motivoDeRecusa({ tipo: "Outras Receitas", descricao: "Venda de sucata", valor: 10 })).toBeNull();
  });

  it("CR-05 · status editável é lista fechada; 'Cancelada' não se digita", () => {
    expect(ehStatusEditavel("A receber")).toBe(true);
    expect(ehStatusEditavel("Recebido")).toBe(true);
    expect(ehStatusEditavel("Cancelada")).toBe(false);
    expect(ehStatusEditavel("Quitado")).toBe(false);
  });

  it("valor em texto BR ou US; vazio ou lixo vira NaN (e é recusado)", () => {
    expect(lerValor("1.000,50")).toBe(1000.5);
    expect(lerValor("R$ 324,00")).toBe(324);
    expect(lerValor("1000.5")).toBe(1000.5);
    expect(lerValor("")).toBeNaN();
    expect(lerValor("abc")).toBeNaN();
  });

  it("valor recebido: zero ou positivo, nunca acima da conta (R$ 5.000 numa conta de R$ 324 recusa)", () => {
    expect(valorRecebidoValido(0, 324)).toBe(true);
    expect(valorRecebidoValido(324, 324)).toBe(true);
    expect(valorRecebidoValido(5000, 324)).toBe(false);
    expect(valorRecebidoValido(-1, 324)).toBe(false);
  });
});
