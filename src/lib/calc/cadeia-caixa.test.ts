import { describe, expect, it } from "vitest";
import { cadeiaDeSaldo, diasDesdeAtualizacao, pareamentoPorData, quebrasDaCadeia, type MovimentoDeCaixa } from "./cadeia-caixa";

const HOJE = "2026-09-30";
const mov = (p: Partial<MovimentoDeCaixa> & { id: string; data: string; valor: number }): MovimentoDeCaixa => ({ rec: false, cat: "extrato", importado: true, bankAccountId: "B", ...p });
const base = [
  mov({ id: "e1", data: "09/28/2026", valor: -100, rec: true }), // extrato conciliado
  mov({ id: "e2", data: "09/29/2026", valor: 50 }), // extrato sem lançamento
  mov({ id: "l1", data: "09/29/2026", valor: -30, rec: true, cat: "despesa", importado: false }), // lançamento sem extrato
  mov({ id: "a1", data: "09/30/2026", valor: 5, rec: true, cat: "ajuste", importado: false }), // ajuste
  mov({ id: "f1", data: "10/01/2026", valor: -20, rec: false, cat: "despesa", importado: false }), // futuro
];

describe("cadeia de saldo (Prompt L, Parte 1)", () => {
  it("4 / 4c — o saldo em conta é calculado para trás: nunca soma movimento já refletido no saldo", () => {
    const c = cadeiaDeSaldo({ movimentos: base, saldoEmContaAtual: 1000, hojeISO: HOJE, diasPassados: 2, diasFuturos: 1 });
    // importados depois de 27/09: −100 e +50 → em conta ao fim de 27/09 = 1000 − (−50) = 1050
    expect(c.inicio).toEqual({ dia: "2026-09-27", emConta: 1050, conciliado: 1050, fonte: "calculado" });
    expect(c.dias[0].emConta).toEqual({ inicial: 1050, final: 950 });
    expect(c.dias[2].emConta).toEqual({ inicial: 1000, final: 1000 }); // hoje = saldo atual
  });
  it("4a / 4b / 2 — cada dia tem inicial e final, o inicial é o final do anterior, e dia inteiramente conciliado fecha", () => {
    const c = cadeiaDeSaldo({ movimentos: base, saldoEmContaAtual: 1000, hojeISO: HOJE, diasPassados: 2, diasFuturos: 1 });
    expect(quebrasDaCadeia(c)).toEqual([]);
    const d28 = c.dias[0];
    expect(d28.conciliado).toEqual({ inicial: 1050, final: 950 });
    expect(d28.diferenca).toBe(0);
    expect(d28.rotulo).toBe("Realizado · conciliado");
  });
  it("3 / 6 — a diferença é classificada nas naturezas e o dia passado pendente é distinguido", () => {
    const c = cadeiaDeSaldo({ movimentos: base, saldoEmContaAtual: 1000, hojeISO: HOJE, diasPassados: 2, diasFuturos: 1 });
    const d29 = c.dias[1];
    expect(d29.conciliado).toEqual({ inicial: 950, final: 920 });
    expect(d29.diferenca).toBe(80); // +50 no extrato sem lançamento, −30 lançado sem extrato
    expect(d29.naturezas.extratoSemLancamento).toEqual({ valor: 50, itens: [{ id: "e2", data: "09/29/2026", valor: 50 }] });
    expect(d29.naturezas.lancamentoSemExtrato.valor).toBe(-30);
    expect(d29.rotulo).toBe("Realizado · pendente");
    expect(d29.pendentes).toBe(2);
  });
  it("1 / 15 — o ajuste compõe o saldo conciliado e não o em conta", () => {
    const c = cadeiaDeSaldo({ movimentos: base, saldoEmContaAtual: 1000, hojeISO: HOJE, diasPassados: 2, diasFuturos: 1 });
    const hoje = c.dias[2];
    expect(hoje.rotulo).toBe("Hoje");
    expect(hoje.ajustes).toBe(5);
    expect(hoje.conciliado).toEqual({ inicial: 920, final: 925 });
    expect(hoje.emConta?.final).toBe(1000);
    expect(hoje.diferenca).toBe(75);
  });
  it("4e — dia futuro mostra só projeção, partindo do último saldo conhecido", () => {
    const c = cadeiaDeSaldo({ movimentos: base, saldoEmContaAtual: 1000, hojeISO: HOJE, diasPassados: 2, diasFuturos: 1 });
    const amanha = c.dias[3];
    expect(amanha.rotulo).toBe("Projeção");
    expect(amanha.emConta).toBeNull();
    expect(amanha.diferenca).toBeNull();
    expect(amanha.conciliado).toEqual({ inicial: 925, final: 905 });
  });
  it("5i — com fechamento gravado no dia anterior à janela, o conciliado parte do saldo_final dele", () => {
    const c = cadeiaDeSaldo({ movimentos: base, saldoEmContaAtual: 1000, hojeISO: HOJE, diasPassados: 2, diasFuturos: 0, fechamentos: [{ dia: "09/27/2026", saldoFinal: 1040 }, { dia: "09/28/2026", saldoFinal: 940 }] });
    expect(c.inicio).toMatchObject({ conciliado: 1040, fonte: "fechamento" });
    expect(c.dias[0].conciliado.inicial).toBe(1040);
    expect(c.dias[0].fechado).toBe(true);
    expect(c.dias[1].fechado).toBe(false);
  });
  it("1.3 (4) — data trocada: mesma linha num dia como extrato e noutro como lançamento vira um par", () => {
    const ms = [mov({ id: "x", data: "09/28/2026", valor: 200 }), mov({ id: "y", data: "09/29/2026", valor: 200, rec: true, cat: "receita", importado: false })];
    expect(pareamentoPorData(ms).get("x")).toBe("y");
    const c = cadeiaDeSaldo({ movimentos: ms, saldoEmContaAtual: 500, hojeISO: HOJE, diasPassados: 2, diasFuturos: 0 });
    expect(c.dias[0].naturezas.dataTrocada.itens.map((i) => i.id)).toEqual(["x"]);
    expect(c.dias[1].naturezas.dataTrocada.itens.map((i) => i.id)).toEqual(["y"]);
    expect(c.dias[0].naturezas.extratoSemLancamento.itens).toEqual([]);
  });
  it("5a / 5b — dias desde a última atualização do saldo", () => {
    expect(diasDesdeAtualizacao("2026-09-20T10:00:00.000Z", HOJE)).toBe(10);
    expect(diasDesdeAtualizacao(null, HOJE)).toBeNull();
  });
});
