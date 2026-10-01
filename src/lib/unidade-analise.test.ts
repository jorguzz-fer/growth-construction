import { describe, it, expect } from "vitest";
import { analisarUnidades, conferirPlanos, revisarCadastro, type UnidadeParaAnalise } from "./unidade-analise";

const u = (p: Partial<UnidadeParaAnalise> & { id: string; code: string }): UnidadeParaAnalise => ({
  status: "Disponivel",
  valor: 100000,
  mesVenda: null,
  total: 0,
  ...p,
});

describe("análises do painel de Unidades (Prompt J, 6.4) — sem IA", () => {
  it("conferir planos: só vendidas, só fora da tolerância de R$ 0,01, maior diferença primeiro", () => {
    const r = conferirPlanos([
      u({ id: "1", code: "101", status: "Vendido", valor: 100000, total: 100000 }),
      u({ id: "2", code: "102", status: "Vendido", valor: 100000, total: 100000.01 }),
      u({ id: "3", code: "103", status: "Vendido", valor: 100000, total: 99000 }),
      u({ id: "4", code: "104", status: "Vendido", valor: 100000, total: 100500 }),
      u({ id: "5", code: "105", status: "Disponivel", valor: 100000, total: 0 }),
    ]);
    expect(r.map((d) => [d.code, d.saldo])).toEqual([
      ["103", -1000],
      ["104", 500],
    ]);
  });

  it("revisar cadastro: venda sem data, valor zerado, código repetido (sem diferenciar caixa), vendida sem plano", () => {
    const r = revisarCadastro([
      u({ id: "1", code: "201", status: "Vendido", valor: 100000, mesVenda: null, total: 100000 }),
      u({ id: "2", code: "202", status: "Disponivel", valor: 0 }),
      u({ id: "3", code: "203", status: "Vendido", valor: 100000, mesVenda: "09/25/2026", total: 0 }),
      u({ id: "4", code: "A-1", status: "Disponivel" }),
      u({ id: "5", code: "a-1", status: "Disponivel" }),
      u({ id: "6", code: "204", status: "Vendido", valor: 100000, mesVenda: "09/25/2026", total: 100000 }),
    ]);
    expect(r.slice(0, 3).map((a) => [a.code, a.tipo])).toEqual([
      ["201", "venda_sem_data"],
      ["202", "valor_zerado"],
      ["203", "vendida_sem_plano"],
    ]);
    // A ordem entre "A-1" e "a-1" depende da collation; o par é o que importa.
    expect(r.slice(3).map((a) => [a.code, a.tipo]).sort()).toEqual([
      ["A-1", "codigo_repetido"],
      ["a-1", "codigo_repetido"],
    ]);
    expect(r.find((a) => a.code === "A-1")?.descricao).toMatch(/"a-1"/);
  });

  it("uma unidade pode ter mais de um achado; sem achado, listas vazias", () => {
    const ruim = revisarCadastro([u({ id: "1", code: "301", status: "Vendido", valor: 0, mesVenda: null, total: 0 })]);
    expect(ruim.map((a) => a.tipo).sort()).toEqual(["valor_zerado", "venda_sem_data", "vendida_sem_plano"]);
    const a = analisarUnidades([u({ id: "1", code: "302", status: "Vendido", valor: 10, mesVenda: "01/01/2026", total: 10 })]);
    expect(a).toEqual({ planosDivergentes: [], achados: [], vendidas: 1, total: 1 });
  });
});
