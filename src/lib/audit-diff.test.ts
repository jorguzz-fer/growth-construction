import { describe, it, expect } from "vitest";
import { diffAudit, houveMudanca, mesmoValor } from "./audit-diff";

describe("mesmoValor", () => {
  it("nulo, indefinido e string vazia são o mesmo valor gravado", () => {
    expect(mesmoValor(null, undefined)).toBe(true);
    expect(mesmoValor(null, "")).toBe(true);
    expect(mesmoValor("", "   ")).toBe(true);
  });

  it('"100.00" e 100 são o mesmo valor — numeric do Postgres chega como string', () => {
    expect(mesmoValor("100.00", 100)).toBe(true);
    expect(mesmoValor("1234.56", 1234.56)).toBe(true);
    expect(mesmoValor("100.00", 100.01)).toBe(false);
  });

  it("ignora espaços em volta de texto", () => {
    expect(mesmoValor(" Custo Fixo ", "Custo Fixo")).toBe(true);
  });

  it("distingue valores realmente diferentes", () => {
    expect(mesmoValor("A pagar", "Pago")).toBe(false);
    expect(mesmoValor(null, "Pago")).toBe(false);
  });
});

describe("diffAudit", () => {
  const antes = {
    valor: "1000.00",
    status: "A pagar",
    competencia: "08/2026",
    obs: null,
    numDoc: "PED-000119",
  };

  it("registra só os campos que mudaram, com de/para", () => {
    const d = diffAudit(antes, { status: "Pago", valor: "1000.00" });
    expect(d).toEqual({ status: { de: "A pagar", para: "Pago" } });
  });

  it("não reporta campos que o patch nem toca", () => {
    const d = diffAudit(antes, { obs: "conferido" });
    expect(Object.keys(d)).toEqual(["obs"]);
    expect(d.obs).toEqual({ de: null, para: "conferido" });
  });

  it("mudança de valor monetário aparece como número nos dois lados", () => {
    const d = diffAudit(antes, { valor: "1500.00" });
    expect(d.valor).toEqual({ de: 1000, para: 1500 });
  });

  it("patch idêntico ao estado atual não gera nenhum registro", () => {
    const d = diffAudit(antes, { status: "A pagar", competencia: "08/2026" });
    expect(d).toEqual({});
    expect(houveMudanca(d)).toBe(false);
  });

  it("limpar um campo (para nulo) é registrado", () => {
    const d = diffAudit({ ...antes, obs: "algo" }, { obs: null });
    expect(d.obs).toEqual({ de: "algo", para: null });
  });

  it("preencher um campo antes vazio é registrado", () => {
    const d = diffAudit(antes, { obs: "nota chegou" });
    expect(d.obs).toEqual({ de: null, para: "nota chegou" });
  });

  it("registro anterior ausente trata tudo como preenchimento novo", () => {
    const d = diffAudit(null, { valor: "50.00" });
    expect(d.valor).toEqual({ de: null, para: 50 });
  });

  it("houveMudanca reflete o diff", () => {
    expect(houveMudanca(diffAudit(antes, { status: "Pago" }))).toBe(true);
    expect(houveMudanca({})).toBe(false);
  });
});
