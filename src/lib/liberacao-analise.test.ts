import { describe, it, expect } from "vitest";
import { avisosDoFormulario, compararComMedicao, competenciaDaData, conferirLancamentos, duplicidadesAparentes, liberacoesPorCompetencia, type LiberacaoParaAnalise } from "./liberacao-analise";

const lib = (p: Partial<LiberacaoParaAnalise> & { id: string }): LiberacaoParaAnalise => ({ data: "09/10/2026", origem: "CEF · medição 03/2026", valor: 1000, pct: null, cancelado: false, ...p });

describe("Assistente das Liberações de Obra — análises puras (Prompt O, 6.2)", () => {
  it("competência da data: MM/DD/YYYY → MM/YYYY; inválida é null", () => {
    expect(competenciaDaData("09/10/2026")).toBe("09/2026");
    expect(competenciaDaData("2026-09-10")).toBeNull();
    expect(competenciaDaData("")).toBeNull();
  });

  it("conferir lançamentos: valor ≤ 0, data inválida, origem em branco, % fora de faixa; cancelada não entra", () => {
    const r = conferirLancamentos([
      lib({ id: "ok" }),
      lib({ id: "a", valor: 0, data: "", origem: " " }),
      lib({ id: "b", pct: "130" }),
      lib({ id: "c", pct: "30%" }),
      lib({ id: "canc", valor: -1, cancelado: true }),
    ]);
    expect(r.map((x) => [x.id, x.problemas])).toEqual([
      ["a", ["valor_invalido", "data_invalida", "origem_em_branco"]],
      ["b", ["pct_fora_de_faixa"]],
    ]);
  });

  it("comparar com a medição: competência com medição e sem liberação, e o contrário; canceladas não contam", () => {
    const r = compararComMedicao(
      [lib({ id: "a", data: "09/10/2026" }), lib({ id: "b", data: "11/05/2026" }), lib({ id: "c", data: "10/05/2026", cancelado: true }), lib({ id: "zero", data: "08/05/2026", valor: 0 })],
      [
        { competencia: "09/2026", valor: 5000 },
        { competencia: "10/2026", valor: 7000 },
        { competencia: "12/2026", valor: 0 },
      ],
    );
    expect(r.medicaoSemLiberacao).toEqual([{ competencia: "10/2026", medicao: 7000, liberado: 0 }]);
    expect(r.liberacaoSemMedicao).toEqual([{ competencia: "11/2026", medicao: 0, liberado: 1000 }]);
  });

  it("por competência: mês a mês, acumulado e o previsto de financiamento das vendidas (caixa, não receita)", () => {
    const r = liberacoesPorCompetencia(
      [lib({ id: "a", data: "10/10/2026", valor: 300 }), lib({ id: "b", data: "09/10/2026", valor: 1000 }), lib({ id: "c", data: "09/20/2026", valor: 250.5 }), lib({ id: "canc", cancelado: true, valor: 999 })],
      [
        { status: "Vendido", valorFinanciado: 4000 },
        { status: "Vendido", valorFinanciado: 1000 },
        { status: "Disponivel", valorFinanciado: 9000 },
      ],
    );
    expect(r.meses).toEqual([
      { competencia: "09/2026", liberado: 1250.5, acumulado: 1250.5 },
      { competencia: "10/2026", liberado: 300, acumulado: 1550.5 },
    ]);
    expect(r).toMatchObject({ total: 1550.5, previstoFinanciamento: 5000, percentualLiberado: 31 });
    expect(liberacoesPorCompetencia([], []).percentualLiberado).toBeNull();
  });

  it("duplicidade aparente: mesmo valor, data e origem (sem caixa) mais de uma vez; canceladas não contam", () => {
    const r = duplicidadesAparentes([lib({ id: "a" }), lib({ id: "b", origem: "cef · MEDIÇÃO 03/2026" }), lib({ id: "c", valor: 1000.01 }), lib({ id: "d", cancelado: true })]);
    expect(r).toEqual([{ data: "09/10/2026", origem: "CEF · medição 03/2026", valor: 1000, ids: ["a", "b"] }]);
  });

  it("avisos do formulário: competência com medição e sem liberação; lançamento igual a um existente", () => {
    const existentes = [lib({ id: "a", data: "09/10/2026", valor: 1000 })];
    const medicoes = [
      { competencia: "10/2026", valor: 7000 },
      { competencia: "09/2026", valor: 5000 },
    ];
    expect(avisosDoFormulario({ data: "10/15/2026", origem: "CEF", valor: 1 }, existentes, medicoes).map((a) => a.tipo)).toEqual(["competencia_com_medicao_sem_liberacao"]);
    expect(avisosDoFormulario({ data: "09/10/2026", origem: " cef · medição 03/2026 ", valor: 1000 }, existentes, medicoes).map((a) => a.tipo)).toEqual(["lancamento_igual_existente"]);
    expect(avisosDoFormulario({ data: "09/11/2026", origem: "CEF", valor: 1 }, existentes, medicoes)).toEqual([]);
    expect(avisosDoFormulario({ data: "", origem: "", valor: null }, existentes, medicoes)).toEqual([]);
  });
});
