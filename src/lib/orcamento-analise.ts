/**
 * Assistente de Orçamentos / Previsão Atualizada (Prompt D, seção 6). PURO e
 * SOMENTE LEITURA (BD-3): recebe o que a página já carregou do servidor
 * (grade da versão e, quando há, a comparação Orçamento × Previsão) e devolve
 * frases. Nada grava, nada chama. Cobre as verificações da 6.4: soma de
 * percentuais abaixo de 100%, meses sem distribuição, divergência entre o
 * total de receitas e o cadastro, despesas vazias com receita lançada, e dado
 * em meses fora do período.
 */
import type { BudgetPlanningData, PlanningAccountRow } from "@/lib/planning";
import type { ForecastComparisonData } from "@/lib/queries";
import { brl0 } from "@/lib/utils";

export interface Apontamento {
  nivel: "atencao" | "info";
  texto: string;
}

export interface AnaliseDeOrcamento {
  revisar: Apontamento[];
  distribuicao: Apontamento[];
  comparar: Apontamento[];
  desvios: Apontamento[];
  /** há comparação disponível (Orçamento × Previsão)? */
  temComparacao: boolean;
}

const somaPct = (r: PlanningAccountRow, months: string[]) => months.reduce((a, m) => a + (Number(r.pct[m]) || 0), 0);
const pct1 = (v: number) => `${v.toLocaleString("pt-BR", { maximumFractionDigits: 1 })}%`;

/** 6.3 "Revisar orçamento" + 6.4. */
export function revisarOrcamento(data: BudgetPlanningData): Apontamento[] {
  const out: Apontamento[] = [];
  const months = data.months;
  const todas = [...data.receitas, ...data.despesas];
  const fixa = data.receitas.find((r) => r.fixa);
  if (fixa?.semTotalNoCadastro) out.push({ nivel: "atencao", texto: "O cadastro do projeto não tem valor de receita: a linha “Receitas do Projeto” fica sem total até o cadastro ser preenchido." });

  // soma de % abaixo de 100 (o salvamento só bloqueia acima) e dado em
  // meses fora do período (não aparece na grade)
  const dentro = new Set(months);
  for (const r of todas) {
    const s = somaPct(r, months);
    const fora = Object.entries(r.pct).filter(([m, p]) => !dentro.has(m) && (Number(p) || 0) !== 0).map(([m]) => m);
    if (r.total > 0 && s > 0.005 && s < 99.995) out.push({ nivel: "atencao", texto: `“${r.label}”: a distribuição fecha em ${pct1(s)} — faltam ${pct1(100 - s)} do total de ${brl0(r.total)}.` });
    if (r.total > 0 && s <= 0.005 && fora.length === 0) out.push({ nivel: "atencao", texto: `“${r.label}” tem total de ${brl0(r.total)} e nenhuma distribuição mensal.` });
    if (fora.length > 0) out.push({ nivel: "atencao", texto: `“${r.label}” tem distribuição em ${fora.length} mês(es) fora do período do projeto (${fora.slice(0, 3).join(", ")}${fora.length > 3 ? "…" : ""}) — não aparece na grade e não entra no total.` });
  }
  // receita total × cadastro
  const totalReceitas = data.receitas.reduce((a, r) => a + r.total, 0);
  const doCadastro = data.project.receitaDoCadastro;
  if (doCadastro != null && Math.abs(totalReceitas - doCadastro) > 0.005) {
    const legadas = data.receitas.filter((r) => !r.fromChart && !r.fixa);
    out.push({ nivel: "info", texto: `O total de receitas (${brl0(totalReceitas)}) difere do valor do cadastro (${brl0(doCadastro)})${legadas.length ? ` — ${legadas.length} linha(s) legada(s) somam ${brl0(legadas.reduce((a, r) => a + r.total, 0))}` : ""}. Nenhum valor é alterado por isso.` });
  }
  // despesas vazias com receita lançada
  const totalDespesas = data.despesas.reduce((a, r) => a + r.total, 0);
  if (totalReceitas > 0 && totalDespesas <= 0.005) out.push({ nivel: "atencao", texto: "Há receita lançada e nenhuma despesa: o card “Resultado” mostra receita sem custo, que não é margem." });
  if (out.length === 0) out.push({ nivel: "info", texto: "Nenhum ponto de atenção na estrutura: percentuais fecham, totais batem com o cadastro e os dois blocos têm lançamento." });
  return out;
}

/** 6.3 "Analisar distribuição" + 6.4 (meses sem nenhuma distribuição). */
export function analisarDistribuicao(data: BudgetPlanningData): Apontamento[] {
  const out: Apontamento[] = [];
  const months = data.months;
  if (months.length === 0) return [{ nivel: "info", texto: "Sem período no cadastro do projeto não há meses para distribuir." }];
  const valorMes = (rows: PlanningAccountRow[], m: string) => rows.reduce((a, r) => a + Math.round(r.total * (Number(r.pct[m]) || 0)) / 100, 0);
  for (const [nome, rows] of [["receitas", data.receitas], ["despesas", data.despesas]] as const) {
    const total = rows.reduce((a, r) => a + r.total, 0);
    if (total <= 0.005) continue;
    const vazios = months.filter((m) => rows.every((r) => (Number(r.pct[m]) || 0) === 0));
    if (vazios.length > 0) out.push({ nivel: "atencao", texto: `${nome}: ${vazios.length} de ${months.length} competência(s) sem nenhuma distribuição (${vazios.slice(0, 4).join(", ")}${vazios.length > 4 ? "…" : ""}).` });
    const porMes = months.map((m) => ({ m, v: valorMes(rows, m) }));
    const distribuido = porMes.reduce((a, x) => a + x.v, 0);
    const maior = porMes.reduce((a, x) => (x.v > a.v ? x : a), porMes[0]);
    if (distribuido > 0 && maior.v / distribuido > 0.5) out.push({ nivel: "info", texto: `${nome}: ${pct1((maior.v / distribuido) * 100)} do distribuído cai em ${maior.m} (${brl0(maior.v)}).` });
  }
  if (out.length === 0) out.push({ nivel: "info", texto: "Distribuição cobre todas as competências, sem concentração acima de metade em um mês." });
  return out;
}

/** 6.3 "Comparar Orçamento × Previsão": principais variações. */
export function compararVersoes(cmp: ForecastComparisonData | null): Apontamento[] {
  if (!cmp) return [{ nivel: "info", texto: "Sem Previsão Atualizada para comparar: crie uma a partir deste Orçamento." }];
  if (!cmp.ok) return [{ nivel: "info", texto: cmp.message ?? "Comparação indisponível." }];
  // Ausente (null) conta como zero só para somar; na frase vira "conta nova".
  const linhas = [...cmp.receitas.map((r) => ({ ...r, budget: r.budget ?? 0, forecast: r.forecast ?? 0, bloco: "receita" as const })), ...cmp.despesas.map((r) => ({ ...r, budget: r.budget ?? 0, forecast: r.forecast ?? 0, bloco: "despesa" as const }))];
  const variacoes = linhas.map((l) => ({ ...l, dif: l.forecast - l.budget })).filter((l) => Math.abs(l.dif) > 0.005).sort((a, b) => Math.abs(b.dif) - Math.abs(a.dif));
  const out: Apontamento[] = [];
  const totB = (rows: { budget: number | null }[]) => rows.reduce((a, r) => a + (r.budget ?? 0), 0);
  const totF = (rows: { forecast: number | null }[]) => rows.reduce((a, r) => a + (r.forecast ?? 0), 0);
  const resB = totB(cmp.receitas) - totB(cmp.despesas);
  const resF = totF(cmp.receitas) - totF(cmp.despesas);
  out.push({ nivel: Math.abs(resF - resB) > 0.005 ? "info" : "info", texto: `Resultado: Orçamento ${brl0(resB)} × Previsão ${brl0(resF)} (${resF - resB >= 0 ? "+" : "−"}${brl0(Math.abs(resF - resB))}).` });
  for (const v of variacoes.slice(0, 5)) {
    const pct = v.budget !== 0 ? ` (${pct1((v.dif / v.budget) * 100)})` : " (conta nova na Previsão)";
    out.push({ nivel: "info", texto: `${v.bloco === "receita" ? "Receita" : "Despesa"} “${v.label}”: ${v.dif >= 0 ? "+" : "−"}${brl0(Math.abs(v.dif))}${pct}.` });
  }
  if (variacoes.length === 0) out.push({ nivel: "info", texto: `Nenhuma variação por conta entre “${cmp.budgetLabel}” e “${cmp.forecastLabel}”.` });
  return out;
}

/** 6.3 "Explicar desvios": possíveis causas, a partir do que os dados mostram. */
export function explicarDesvios(cmp: ForecastComparisonData | null): Apontamento[] {
  if (!cmp || !cmp.ok) return [{ nivel: "info", texto: "Sem comparação disponível, não há desvio a explicar." }];
  const out: Apontamento[] = [];
  const linhas = [...cmp.receitas, ...cmp.despesas].map((l) => ({ ...l, budget: l.budget ?? 0, forecast: l.forecast ?? 0, ausenteB: l.budget == null, ausenteF: l.forecast == null }));
  const soForecast = linhas.filter((l) => (l.ausenteB || l.budget === 0) && l.forecast !== 0);
  const soBudget = linhas.filter((l) => (l.ausenteF || l.forecast === 0) && l.budget !== 0);
  if (soForecast.length) out.push({ nivel: "info", texto: `Conta(s) só na Previsão: ${soForecast.map((l) => l.label).join(", ")} — custo que não estava orçado, ou linha incluída depois.` });
  if (soBudget.length) out.push({ nivel: "info", texto: `Conta(s) só no Orçamento: ${soBudget.map((l) => l.label).join(", ")} — zeradas ou removidas na revisão.` });
  // totais iguais, meses diferentes
  const mesesDif = cmp.months.filter((m) => Math.abs((cmp.budgetByMonth[m] || 0) - (cmp.forecastByMonth[m] || 0)) > 0.005);
  const totaisIguais = linhas.every((l) => Math.abs(l.budget - l.forecast) < 0.005);
  if (totaisIguais && mesesDif.length > 0) out.push({ nivel: "info", texto: `Totais iguais, mas a distribuição mensal mudou em ${mesesDif.length} competência(s) (${mesesDif.slice(0, 3).join(", ")}${mesesDif.length > 3 ? "…" : ""}): é reprogramação de cronograma, não de valor.` });
  const maiores = linhas.map((l) => ({ ...l, dif: l.forecast - l.budget })).filter((l) => l.budget !== 0 && Math.abs(l.dif / l.budget) >= 0.2).sort((a, b) => Math.abs(b.dif) - Math.abs(a.dif)).slice(0, 3);
  for (const l of maiores) out.push({ nivel: "atencao", texto: `“${l.label}” variou ${pct1((l.dif / l.budget) * 100)}: desvio acima de 20% costuma vir de escopo novo, reajuste de insumo ou erro de lançamento — confira a origem antes de aprovar.` });
  if (out.length === 0) out.push({ nivel: "info", texto: "Sem desvios relevantes entre o Orçamento e a Previsão." });
  return out;
}

export function analisarOrcamento(data: BudgetPlanningData, cmp: ForecastComparisonData | null): AnaliseDeOrcamento {
  return {
    revisar: revisarOrcamento(data),
    distribuicao: analisarDistribuicao(data),
    comparar: compararVersoes(cmp),
    desvios: explicarDesvios(cmp),
    temComparacao: !!cmp?.ok,
  };
}
