import { describe, it, expect } from "vitest";
import { calcTotals } from "@/lib/calc";
import { emptyUnit } from "@/lib/calc/__fixtures__";
import { blocoAtencao, blocoExposicao, blocoVendas, temPlanoDePagamento, vso } from "./resumo-blocos";
import { indicadoresDoResumo } from "./resumo-tela";

/** Prompt AE-2 — a chave do Resumo: calcTotals corrigido e os blocos por pergunta. */
const un = (status: string, valor: number, mesVenda: string | null = null, temPlano = true) => ({ status, valor, mesVenda, temPlano });

describe("calcTotals — desligada como antes; ligada com 2.4 e 2.7", () => {
  const u = { ...emptyUnit("A"), status: "Vendido" as const };
  u.S1 = { ...u.S1, val: 1000, n: 3 };
  u.S2 = { ...u.S2, val: 0, n: 1 };
  u.S3 = { ...u.S3, val: 0, n: 1 };
  u.AS = { ...u.AS, val: 0, n: 1 };
  const permutas = [{ estimado: 100, status: "Disponivel", valorVenda: 0 }, { estimado: 50, status: "Cancelada", valorVenda: 0 }];
  const libs = [{ data: "", valor: 10, status: "Recebido" }, { data: "", valor: 5, status: "Cancelado" }];
  it("desligada: S1 pelo valor unitário; canceladas somam", () => {
    const t = calcTotals([u], permutas, libs);
    expect(t.sinais).toBe(1000);
    expect([t.permRec, t.reemb]).toEqual([150, 15]);
  });
  it("2.4 e 2.7 — ligada: S1 × n; canceladas fora", () => {
    const t = calcTotals([u], permutas, libs, { definicaoNova: true });
    expect(t.sinais).toBe(3000);
    expect([t.permRec, t.reemb]).toEqual([100, 10]);
  });
});

describe("2.6 — permuta por tipo fecha a soma", () => {
  it("ligada: tipo do cadastro e 'outros tipos'; desligada: busca por trecho, sem resíduo", () => {
    const perms = [
      { tipoPermuta: "Materiais", estimado: 100, status: "Disponivel" },
      { tipoPermuta: "Serviços", estimado: 30, status: "Disponivel" },
      { tipoPermuta: "material elétrico (digitado)", estimado: 7, status: "Disponivel" },
      { tipoPermuta: "Veículo", estimado: 5, status: "Disponivel" },
    ];
    const totals = calcTotals([], perms.map((p) => ({ ...p, valorVenda: 0 })), [], { definicaoNova: true });
    const nova = Object.fromEntries(indicadoresDoResumo({ totals, unidades: [], permutas: perms, liberacoes: 0, definicaoNova: true }).map((i) => [i.label, i.value]));
    expect(nova["Permuta por Materiais"]).toBe(100);
    expect(nova["Permuta de outros tipos"]).toBe(12);
    expect(nova["Permuta por Materiais"] + nova["Permuta por Serviços de Terceiros"] + nova["Permuta de outros tipos"]).toBe(nova["Permuta Recebido (estimado)"]);
    const hoje = Object.fromEntries(indicadoresDoResumo({ totals, unidades: [], permutas: perms, liberacoes: 0 }).map((i) => [i.label, i.value]));
    // A busca antiga por "material" NÃO encontra "Materiais" (o valor do
    // cadastro): só o tipo digitado à mão entra. É o defeito que a chave corrige.
    expect(hoje["Permuta por Materiais"]).toBe(7);
    expect(hoje["Permuta por Serviços de Terceiros"]).toBe(30);
    expect("Permuta de outros tipos" in hoje).toBe(false);
  });
});

describe("1.4 · Vendas e BAE-3 · VSO", () => {
  const us = [un("Vendido", 100, "01/10/2026"), un("Vendido", 50, "03/15/2026"), un("Disponivel", 80), un("Permutado", 40), un("Reservado", 30)];
  it("2.3 — as quatro situações e o total é a contagem", () => {
    const b = blocoVendas(us, "", "");
    expect(b.porStatus).toEqual({ Disponivel: 1, Reservado: 1, Vendido: 2, Permutado: 1 });
    expect(b.total).toBe(5);
    expect([b.vgvTotal, b.vgvVendido]).toEqual([300, 150]);
  });
  it("VSO: vendidas no período ÷ oferta no início", () => {
    // fev–mar: a vendida em jan já saiu da oferta; oferta = vendida em mar + disponível + reservada = 3
    expect(vso(us, "02/01/2026", "03/31/2026")).toEqual({ estado: "ok", vendidasNoPeriodo: 1, ofertaNoInicio: 3, pct: (1 / 3) * 100 });
  });
  it("sem período ou com vendida sem data: não calcula", () => {
    expect(vso(us, "", "").estado).toBe("sem_periodo");
    expect(vso([...us, un("Vendido", 1, null)], "02/01/2026", "").estado).toBe("sem_data");
  });
});

describe("1.6 · Exposição e 1.7 · Atenção", () => {
  it("saldo em aberto separado em por vencer e vencido; sem permissão é null", () => {
    const e = blocoExposicao({ receber: [{ saldo: 100, vencida: false }, { saldo: 40, vencida: true }, { saldo: 0, vencida: true }], pagar: null, totals: calcTotals([], [], []), permutas: [{ status: "Disponivel", estimado: 9 }, { status: "Vendido", estimado: 5 }] });
    expect(e.aReceber).toEqual({ porVencer: 100, vencido: 40, contas: 2 });
    expect(e.aPagar).toBeNull();
    expect(e.permutaEmEstoque).toBe(9);
  });
  it("só exceções categóricas, cada uma com link", () => {
    const a = blocoAtencao({ obra: "OBRA", projectId: "p1", temAtual: false, unidades: [un("Vendido", 1, null, false)], despesasSemClassificacao: 2 });
    expect(a.map((x) => x.href)).toEqual(["/projeto?proj=p1", "/unidades?proj=p1", "/unidades?proj=p1", "/conferencia?proj=p1"]);
    expect(a.some((x) => /%|porque/.test(x.texto))).toBe(false);
  });
  it("plano de pagamento: alguma fonte com valor", () => {
    expect(temPlanoDePagamento(null)).toBe(false);
    expect(temPlanoDePagamento({ AS: { val: 0 }, Banco: { valFinanc: 0 } })).toBe(false);
    expect(temPlanoDePagamento({ Mensais: { val: 500, n: 10 } })).toBe(true);
  });
});
