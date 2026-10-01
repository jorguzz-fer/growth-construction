import { describe, expect, it } from "vitest";
import { assinaturaDoItem, conferirExtrato, type CompraParaConferir } from "./conferencia-cartao";

const ciclo = { diaFechamento: 10, diaVencimento: 20 };
const compra = (p: Partial<CompraParaConferir> & { parcelaId: string }): CompraParaConferir => ({ despesaId: "D" + p.parcelaId, numDoc: "PED-" + p.parcelaId, descricao: null, valor: 100, numero: 1, total: 1, faturaFechamento: "04/10/2026", ...p });

describe("conferência do extrato do cartão (Prompt U, 5.2 e 6.3) — pura", () => {
  it("casa por fatura e valor; aponta sem lançamento, sem extrato e divergências", () => {
    const itens = [
      { id: "i1", data: "03/15/2026", descricao: "cimento", valor: 100 }, // fatura 04/10 — casa com p1
      { id: "i2", data: "03/20/2026", descricao: "areia", valor: 250 }, // sem lançamento
      { id: "i3", data: "04/11/2026", descricao: "tinta", valor: 80 }, // fatura 05/10, lançado na 04/10 → data divergente
      { id: "i4", data: "03/25/2026", descricao: "brita", valor: 61 }, // fatura 04/10, lançado 60 → valor divergente
    ];
    const compras = [compra({ parcelaId: "p1" }), compra({ parcelaId: "p2", valor: 80 }), compra({ parcelaId: "p3", valor: 60 }), compra({ parcelaId: "p4", valor: 999 }), compra({ parcelaId: "p5", valor: 10, faturaFechamento: "01/10/2026" })];
    const r = conferirExtrato(itens, compras, [], ciclo);
    expect(r.casados.map((c) => [c.item.id, c.compra.parcelaId])).toEqual([["i1", "p1"]]);
    expect(r.semLancamento.map((i) => i.id)).toEqual(["i2"]);
    // itens processados em ordem de data: i4 (25/03) antes de i3 (11/04)
    expect(r.divergentes.map((d) => [d.item.id, d.compra.parcelaId, d.motivo])).toEqual([["i4", "p3", "valor"], ["i3", "p2", "data"]]);
    // sem extrato: só das faturas cobertas (p4 na 04/10 sim; p5 na 01/10 não)
    expect(r.semExtrato.map((c) => c.parcelaId)).toEqual(["p4"]);
    expect(r.faturasCobertas).toEqual(["04/10/2026", "05/10/2026"]);
  });
  it("14 / 6.3 — crédito do extrato reconhece o estorno antecipado (par), e não vira segundo estorno", () => {
    const itens = [{ id: "c1", data: "04/02/2026", descricao: "estorno cimento", valor: -100 }, { id: "c2", data: "04/03/2026", descricao: "crédito x", valor: -30 }];
    const estornos = [{ id: "e1", despesaId: "Dp1", numDoc: "PED-p1", valor: 100, data: "03/30/2026", origem: "antecipado", extratoItemId: null }];
    const r = conferirExtrato(itens, [], estornos, ciclo);
    expect(r.creditos.map((c) => [c.item.id, c.estorno?.id ?? null, c.vinculado])).toEqual([["c1", "e1", false], ["c2", null, false]]);
    const r2 = conferirExtrato(itens, [], [{ ...estornos[0], extratoItemId: "c1" }], ciclo);
    expect(r2.creditos[0]).toMatchObject({ estorno: { id: "e1" }, vinculado: true });
  });
  it("13 — assinatura de dedup: mesmo cartão, data, centavos e descrição", () => {
    expect(assinaturaDoItem("C", "03/15/2026", 100, " Cimento ")).toBe(assinaturaDoItem("C", "03/15/2026", 100.001, "cimento"));
    expect(assinaturaDoItem("C", "03/15/2026", 100, "cimento")).not.toBe(assinaturaDoItem("C", "03/16/2026", 100, "cimento"));
  });
});
