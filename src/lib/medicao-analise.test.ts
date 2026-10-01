import { describe, it, expect } from "vitest";
import { analisarMedicoes, avancoForaDoPrevisto, competenciasSemMedicao, proximidadeDaRetencao } from "./medicao-analise";
import { compararLaudoComLancado } from "./ai/medicao-doc";
import { proximaVersao, tipoDeDocValido } from "./medicao-docs-regras";

const months = ["01/2026", "02/2026", "03/2026", "04/2026"];

describe("Prompt V · assistente da medição (seção 6, somente leitura)", () => {
  it("6.2 — competências sem medição: só as decorridas da janela do projeto", () => {
    const med = [{ competencia: "01/2026", grupoCode: "1", valor: 10 }, { competencia: "03/2026", grupoCode: "1", valor: 0 }];
    expect(competenciasSemMedicao(months, med, "03/2026")).toEqual(["02/2026", "03/2026"]);
    expect(competenciasSemMedicao(months, med, "12/2026")).toEqual(["02/2026", "03/2026", "04/2026"]);
  });
  it("6.2 — avanço fora do previsto: ±50% do cronograma do Orçamento, só competências decorridas", () => {
    const contas = [{ rowKey: "1", label: "Preliminares", total: 1000, pct: { "01/2026": 10, "02/2026": 40, "03/2026": 50 } }];
    const med = [
      { competencia: "01/2026", grupoCode: "1", valor: 100 }, // = previsto
      { competencia: "02/2026", grupoCode: "1", valor: 700 }, // 175% → acima
      { competencia: "02/2026", grupoCode: "2", valor: 5 }, // sem previsto → acima
      // 03/2026 previsto 500, medido 0 → abaixo
    ];
    const r = avancoForaDoPrevisto(contas, med, months, "03/2026");
    expect(r.map((x) => [x.competencia, x.grupoCode, x.sentido, x.razaoPct])).toEqual([
      ["02/2026", "1", "acima", 175],
      ["03/2026", "1", "abaixo", 0],
    ]);
    // 04/2026 (futura) não entra; grupo 2 sem conta orçada não é avaliado
    expect(avancoForaDoPrevisto(contas, med, months, "01/2026")).toHaveLength(0);
  });
  it("6.2 — proximidade da retenção: 85% avisa, 95% atingida, sem orçado não opina", () => {
    expect(proximidadeDaRetencao(null).estado).toBe("sem_orcado");
    expect(proximidadeDaRetencao(50)).toMatchObject({ estado: "longe", faltam: 45 });
    expect(proximidadeDaRetencao(90.5)).toMatchObject({ estado: "perto", faltam: 4.5 });
    expect(proximidadeDaRetencao(95)).toMatchObject({ estado: "atingida", faltam: 0 });
  });
  it("análise completa reúne as leituras e compara com as liberações", () => {
    const a = analisarMedicoes({
      months,
      hojeMes: "02/2026",
      medicoes: [{ competencia: "01/2026", grupoCode: "1", valor: 100 }],
      contas: null,
      liberacoes: [{ id: "l1", data: "02/15/2026", origem: "CEF", valor: 50, pct: null, cancelado: false }],
      totalPct: 10,
    });
    expect(a.semMedicao).toEqual(["02/2026"]);
    expect(a.temOrcamento).toBe(false);
    expect(a.foraDoPrevisto).toEqual([]);
    expect(a.medicaoSemLiberacao).toEqual([{ competencia: "01/2026", medicao: 100 }]);
    expect(a.liberacaoSemMedicao).toEqual([{ competencia: "02/2026", liberado: 50 }]);
    expect(a.retencao.estado).toBe("longe");
  });
  it("6.2 — ler o laudo: aponta divergência, não preenche", () => {
    const laudo = { competencia: "01/2026", itens: [{ grupo: "1", descricao: "Preliminares", percentual: 10, valor: null }, { grupo: "2", descricao: "Fundações", percentual: null, valor: 300 }, { grupo: "3", descricao: "Estrutura", percentual: 5, valor: null }], observacoes: ["percentual acumulado"] };
    const lancadas = [{ grupoCode: "1", competencia: "01/2026", valor: 100 }, { grupoCode: "2", competencia: "01/2026", valor: 250 }, { grupoCode: "4", competencia: "01/2026", valor: 9 }];
    const c = compararLaudoComLancado(laudo, lancadas, { "1": 1000, "3": 500 });
    expect(c.competencia.igual).toBe(true);
    expect(c.conferem).toBe(1); // grupo 1: 10% de 1000 = 100 ✔
    expect(c.divergencias.map((d) => [d.tipo, d.grupo])).toEqual([
      ["valor_diferente", "2"],
      ["grupo_sem_lancamento", "3"],
      ["lancamento_sem_laudo", "4"],
    ]);
    expect(c.observacoes).toEqual(["percentual acumulado"]);
    const c2 = compararLaudoComLancado({ ...laudo, competencia: "02/2026" }, lancadas, {});
    expect(c2.competencia.igual).toBe(false);
    expect(c2.divergencias[0].tipo).toBe("competencia_diferente");
  });
  it("5.3/5.4 — tipos e versão por tipo dentro da medição", () => {
    expect(tipoDeDocValido("Laudo de medição")).toBe(true);
    expect(tipoDeDocValido("Contrato")).toBe(false);
    const ex = [{ tipo: "Laudo de medição", versao: 1 }, { tipo: "Laudo de medição", versao: 2 }, { tipo: "PLS", versao: 1 }];
    expect(proximaVersao(ex, "Laudo de medição")).toBe(3);
    expect(proximaVersao(ex, "PLS")).toBe(2);
    expect(proximaVersao(ex, "ART/RRT")).toBe(1); // tipo diferente não herda
  });
});
