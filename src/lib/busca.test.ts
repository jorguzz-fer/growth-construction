import { describe, it, expect } from "vitest";
import { norm, parseValorBusca, registroCasa, valorCasa } from "./busca";

describe("norm", () => {
  it("ignora acentos e caixa", () => {
    expect(norm("JOSÉ Antônio")).toBe("jose antonio");
    expect(norm("CASARÃO")).toBe("casarao");
  });
  it("colapsa espaços", () => {
    expect(norm("  a   b  ")).toBe("a b");
  });
});

describe("parseValorBusca", () => {
  it("entende o formato brasileiro", () => {
    expect(parseValorBusca("1.234,56")).toBeCloseTo(1234.56, 2);
    expect(parseValorBusca("R$ 880")).toBe(880);
  });
  it("entende ponto decimal", () => {
    expect(parseValorBusca("1234.56")).toBeCloseTo(1234.56, 2);
  });
  it("devolve null sem número", () => {
    expect(parseValorBusca("abc")).toBeNull();
  });
});

describe("valorCasa", () => {
  it("casa o valor exato digitado de várias formas", () => {
    expect(valorCasa(880, "880")).toBe(true);
    expect(valorCasa(1234.56, "1.234,56")).toBe(true);
  });
  it("casa por dígitos parciais", () => {
    expect(valorCasa(1880, "880")).toBe(true);
    expect(valorCasa(880, "88")).toBe(true);
  });
  it("não casa valor diferente", () => {
    expect(valorCasa(880, "999")).toBe(false);
  });
});

describe("registroCasa — busca por similaridade em vários campos", () => {
  const campos = ["PED-026180", "CASARÃO", "Cimento para a laje", "OBRA 28"];
  const valores = [880];

  it("acha por fornecedor, ignorando acento", () => {
    expect(registroCasa("casarao", campos, valores)).toBe(true);
  });
  it("acha por número do pedido, inclusive parcial", () => {
    expect(registroCasa("026180", campos, valores)).toBe(true);
    expect(registroCasa("PED-026", campos, valores)).toBe(true);
  });
  it("acha por palavra da descrição", () => {
    expect(registroCasa("cimento", campos, valores)).toBe(true);
  });
  it("acha por projeto", () => {
    expect(registroCasa("obra 28", campos, valores)).toBe(true);
  });
  it("acha por valor", () => {
    expect(registroCasa("880", campos, valores)).toBe(true);
  });

  it("combina termos de CAMPOS DIFERENTES (todos precisam casar)", () => {
    // fornecedor + valor
    expect(registroCasa("casarao 880", campos, valores)).toBe(true);
    // fornecedor + projeto
    expect(registroCasa("casarao obra", campos, valores)).toBe(true);
  });

  it("a ordem dos termos não importa", () => {
    expect(registroCasa("880 casarao", campos, valores)).toBe(true);
  });

  it("não casa se UM dos termos não existir no registro", () => {
    expect(registroCasa("casarao vergalhao", campos, valores)).toBe(false);
  });

  it("consulta vazia não casa nada", () => {
    expect(registroCasa("", campos, valores)).toBe(false);
    expect(registroCasa("   ", campos, valores)).toBe(false);
  });

  it("tolera campos nulos", () => {
    expect(registroCasa("casarao", [null, "CASARÃO", undefined])).toBe(true);
  });

  it("é incremental: cada caractere a mais só restringe", () => {
    const c = ["CASARÃO", "CASA GRANDE"];
    expect(registroCasa("c", c)).toBe(true);
    expect(registroCasa("cas", c)).toBe(true);
    expect(registroCasa("casar", c)).toBe(true);
    expect(registroCasa("casarx", c)).toBe(false);
  });
});
