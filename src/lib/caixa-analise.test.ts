import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { agrupamentosPropostos, analisarCaixa, encaminhamentos, explicacaoDoDia, motivoDoPar, paresPropostos, recorrencias, type ContaAbertaParaAnalise, type PendenteParaAnalise } from "./caixa-analise";
import { cadeiaDeSaldo, type MovimentoDeCaixa } from "./calc/cadeia-caixa";

const sug = (p: Partial<PendenteParaAnalise["sugestoes"][number]> & { despesaId: string; valor: number }): PendenteParaAnalise["sugestoes"][number] => ({ numDoc: null, fornecedor: null, vencimento: null, grau: "baixa", ...p });
const pend = (p: Partial<PendenteParaAnalise> & { cashEntryId: string; valor: number }): PendenteParaAnalise => ({ data: "09/10/2026", descricao: "TED", vinculado: 0, sugestoes: [], ...p });
const aberta = (p: Partial<ContaAbertaParaAnalise> & { despesaId: string; saldo: number }): ContaAbertaParaAnalise => ({ numDoc: null, fornecedor: "ACME Materiais", vencimento: "09/10/2026", ...p });

describe("assistente do Caixa (Prompt L, 8-A)", () => {
  it("20a / 8-A.2 — propõe pares com grau e motivo; inequívoco só quando há uma candidata alta e exclusiva", () => {
    const m1 = pend({ cashEntryId: "m1", valor: -500, data: "09/10/2026", descricao: "PIX ACME MATERIAIS", sugestoes: [sug({ despesaId: "d1", valor: 500, vencimento: "09/10/2026", grau: "alta", fornecedor: "ACME Materiais" })] });
    const m2 = pend({ cashEntryId: "m2", valor: -200, data: "09/12/2026", sugestoes: [sug({ despesaId: "d2", valor: 200, vencimento: "09/15/2026", grau: "media" }), sug({ despesaId: "d3", valor: 198, grau: "baixa" })] });
    const m3 = pend({ cashEntryId: "m3", valor: -500, data: "09/11/2026", sugestoes: [sug({ despesaId: "d1", valor: 500, vencimento: "09/10/2026", grau: "alta" })] });
    const pares = paresPropostos([m1, m2, m3]);
    expect(pares.map((p) => [p.cashEntryId, p.despesaId, p.grau, p.motivo, p.inequivoco])).toEqual([
      ["m1", "d1", "alta", "valor e data exatos", false], // d1 também é candidata alta de m3 → não é inequívoco
      ["m2", "d2", "media", "valor exato e data próxima (3 dias)", false],
      ["m3", "d1", "alta", "valor exato e data próxima (1 dia)", false],
    ]);
    expect(paresPropostos([m1])[0].inequivoco).toBe(true);
    expect(motivoDoPar(pend({ cashEntryId: "x", valor: -100, descricao: "BOLETO ACME" }), sug({ despesaId: "d", valor: 101, fornecedor: "ACME Ltda" }))).toBe("valor aproximado com histórico compatível");
    expect(motivoDoPar(pend({ cashEntryId: "x", valor: -100, vinculado: 40 }), sug({ despesaId: "d", valor: 60, vencimento: "09/10/2026" }))).toBe("valor e data exatos"); // o que falta (60) é o que casa
  });

  it("20b / 8-A.3 — um movimento de 12.000 que corresponde a seis despesas do mesmo fornecedor", () => {
    const abertas = [1000, 1500, 2000, 2500, 2500, 2500, 700, 300].map((v, i) => aberta({ despesaId: `d${i}`, saldo: v, numDoc: `PED-${i}` }));
    abertas.push(aberta({ despesaId: "outro", saldo: 12000, fornecedor: "Outro Fornecedor" })); // sem pista no histórico: ignorado
    const m = pend({ cashEntryId: "m", valor: -12000, descricao: "TED ACME MATERIAIS LTDA", sugestoes: [sug({ despesaId: "d3", valor: 2500, grau: "baixa", fornecedor: "ACME Materiais" })] });
    const [g] = agrupamentosPropostos([m], abertas);
    expect(g.fornecedor).toBe("ACME Materiais");
    expect(g.soma).toBe(12000);
    expect(g.diferenca).toBe(0);
    expect(g.despesas.length).toBe(6);
    // com candidata que fecha sozinha, não propõe agrupamento
    expect(agrupamentosPropostos([pend({ cashEntryId: "m2", valor: -2500, descricao: "ACME", sugestoes: [sug({ despesaId: "d3", valor: 2500, grau: "alta" })] })], abertas)).toEqual([]);
    // sem subconjunto que feche (tolerância 0,5%), aponta a diferença se existir uma aproximação
    const [g2] = agrupamentosPropostos([pend({ cashEntryId: "m3", valor: -2995, descricao: "ACME MATERIAIS" })], abertas);
    expect(g2.soma).toBe(3000);
    expect(g2.diferenca).toBe(5);
  });

  it("20c / 8-A.4 — explica a diferença do dia apontando as linhas, não o total", () => {
    const mov = (p: Partial<MovimentoDeCaixa> & { id: string; data: string; valor: number }): MovimentoDeCaixa => ({ rec: false, cat: "extrato", importado: true, bankAccountId: "B", ...p });
    const c = cadeiaDeSaldo({ movimentos: [mov({ id: "e1", data: "09/29/2026", valor: -1150 }), mov({ id: "l1", data: "09/29/2026", valor: -90, rec: true, cat: "despesa", importado: false })], saldoEmContaAtual: 0, hojeISO: "2026-09-30", diasPassados: 1, diasFuturos: 0 });
    const ex = explicacaoDoDia(c.dias[0])!;
    // em conta ao fim do dia 0; conciliado 1150 − 90 = 1060 → faltam 1.060 no banco em relação ao conciliado
    expect(ex.diferenca).toBe(-1060);
    expect(ex.frase).toBe("Faltam R$ 1.060,00 em 29/09/2026: 1 débito de R$ 1.150,00 no extrato sem lançamento, e 1 lançamento de R$ 90,00 sem movimento no extrato.");
    expect(ex.linhas.map((l) => l.id)).toEqual(["e1", "l1"]);
    // hoje herda a diferença (8-A.6: o primeiro dia quebrado explica os seguintes) — e diz que nenhuma linha DESTE dia a explica
    expect(explicacaoDoDia(c.dias[1])).toMatchObject({ diferenca: -1060, linhas: [], frase: expect.stringMatching(/nenhuma linha explica/) });
  });

  it("8-A.5 — movimento sem contraparte: identifica fornecedor pelo histórico ou conta vencida de valor compatível", () => {
    const abertas = [aberta({ despesaId: "d1", saldo: 320, fornecedor: "Serralheria Silva", vencimento: "09/01/2026", numDoc: "PED-9" })];
    const r = encaminhamentos([pend({ cashEntryId: "a", valor: -80, descricao: "PIX SERRALHERIA SILVA" }), pend({ cashEntryId: "b", valor: -320, descricao: "DOC 123" }), pend({ cashEntryId: "c", valor: -1, descricao: "TARIFA" })], abertas, "2026-09-30");
    expect(r.map((x) => x.parece)).toEqual(["fornecedor conhecido pelo histórico: Serralheria Silva", "valor compatível com a conta vencida PED-9 de Serralheria Silva", null]);
  });

  it("8-A.6 — recorrência: mesmo histórico e valor (±2%) em três meses; análises ordenadas do mais antigo", () => {
    const movs: MovimentoDeCaixa[] = ["07/05/2026", "08/05/2026", "09/05/2026"].map((data, i) => ({ id: `r${i}`, data, valor: -(1000 + i * 5), rec: true, cat: "despesa", importado: true, bankAccountId: "B" }));
    movs.push({ id: "u", data: "09/06/2026", valor: -50, rec: false, cat: "extrato", importado: true, bankAccountId: "B" });
    const desc = new Map(movs.map((m) => [m.id, m.id === "u" ? "TARIFA" : `ALUGUEL GALPAO ${m.id}`]));
    const rec = recorrencias(movs, desc);
    expect(rec.length).toBe(1);
    expect(rec[0].meses).toEqual(["2026-07", "2026-08", "2026-09"]);
    expect(rec[0].valorMedio).toBe(1005);
    const cadeia = cadeiaDeSaldo({ movimentos: movs, saldoEmContaAtual: 0, hojeISO: "2026-09-07", diasPassados: 2, diasFuturos: 0, fechamentos: [{ dia: "09/06/2026", saldoFinal: -50 }] });
    const a = analisarCaixa({ pendentes: [], abertas: [], cadeia, conciliadosSemVinculo: [{ data: "09/01/2026", valor: -10 }, { data: "09/02/2026", valor: -20 }, { data: "08/01/2026", valor: -5 }], baixado: { total: 0, despesas: 0, dias: null }, contas: [{ id: "c1", nome: "Banco", diasDesde: 30 }, { id: "c2", nome: "Outro", diasDesde: 1 }], movimentos: movs, descricoes: desc, hojeISO: "2026-09-07" });
    // 05 fecha (extrato conciliado); 06 e 07 não: a tarifa do extrato sem lançamento ainda explica −50
    expect(a.diasQueNaoFecham.map((d) => d.dia)).toEqual(["2026-09-06", "2026-09-07"]);
    expect(a.conciliadoSemVinculo).toEqual([{ mes: "2026-08", quantidade: 1, valor: -5 }, { mes: "2026-09", quantidade: 2, valor: -30 }]);
    expect(a.extratoNaoImportado).toEqual([{ id: "c1", nome: "Banco", dias: 30 }]);
    expect(a.diasNaoFechados).toEqual([{ dia: "2026-09-05", motivo: "aberto antes de um fechado" }]);
  });

  it("20d / 8-A.7 — nenhum caminho de escrita: o módulo e o painel não importam ação de conciliar sozinho, baixa ou ajuste", () => {
    const modulo = readFileSync("src/lib/caixa-analise.ts", "utf8");
    expect(modulo).not.toMatch(/@\/lib\/actions|@\/lib\/db|"use server"/);
    const painel = readFileSync("src/components/app/assistente-caixa.tsx", "utf8");
    expect(painel).not.toMatch(/addAjuste|toggleConciliado|importCash|pagarParcela|registrarPagamento|updateDespesa|fecharDia|desfazerConciliacao/);
    // a única ação é conciliarMovimento, disparada por clique da pessoa (confirmação humana)
    expect(painel).toMatch(/conciliarMovimento/);
  });
});
