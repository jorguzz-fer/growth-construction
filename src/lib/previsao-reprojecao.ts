/**
 * Reprojeção sugerida pelo assistente (Prompt F, 8.1–8.4). Módulo PURO.
 *
 * Duas propostas, sempre sobre a distribuição mensal (%) — o total por conta
 * é herdado e não muda aqui:
 *  1. partir do Orçamento: copiar a distribuição do Orçamento de origem;
 *  2. partir do realizado: nas competências já decorridas, usar as despesas
 *     da versão Atual (referência analítica, Prompt I §4); redistribuir o
 *     que sobra do total pelos meses futuros, por igual.
 *
 * A proposta é apresentada como COMPARAÇÃO (o que muda por conta), não como
 * grade preenchida (8.2). Se o realizado já supera o total herdado, a conta
 * fica sinalizada com o excedente (8.4): o salvamento recusaria mais de 100%.
 * Nada aqui grava; a revisão nova é criada pela action, pelos caminhos que já
 * existem (8.3).
 */
import type { PlanningAccountRow } from "@/lib/planning";
import { monthKeyIndex } from "@/lib/planning";

export type OrigemDaReprojecao = "orcamento" | "realizado";

export interface ContaReprojetada {
  rowKey: string;
  label: string;
  bloco: "receita" | "despesa";
  total: number;
  antes: Record<string, number>;
  depois: Record<string, number>;
  /** competências cujo % mudou. */
  mesesAlterados: string[];
  /** soma de |valor depois − valor antes| em R$. */
  variacao: number;
  /** 8.4: quanto o realizado passa do total herdado (null = não passa). */
  estouro: number | null;
  mudou: boolean;
}

export interface PropostaDeReprojecao {
  origem: OrigemDaReprojecao;
  /** competências consideradas decorridas (só na origem "realizado"). */
  decorridas: string[];
  contas: ContaReprojetada[];
  alteradas: number;
  estouros: number;
  variacaoTotal: number;
}

const r2 = (n: number) => Math.round(n * 100) / 100;
const pct2 = (n: number) => Math.round(n * 100) / 100;

/** Competências do período anteriores ao mês de hoje ("MM/YYYY"). */
export function competenciasDecorridas(months: string[], hojeMes: string): string[] {
  const h = monthKeyIndex(hojeMes);
  if (h == null) return [];
  return months.filter((m) => {
    const i = monthKeyIndex(m);
    return i != null && i < h;
  });
}

function valorMes(total: number, pct: number): number {
  return Math.round(total * pct) / 100;
}

function montarConta(row: PlanningAccountRow, bloco: "receita" | "despesa", months: string[], depois: Record<string, number>, estouro: number | null): ContaReprojetada {
  const antes: Record<string, number> = {};
  for (const m of months) antes[m] = Number(row.pct[m]) || 0;
  const mesesAlterados = months.filter((m) => Math.abs((depois[m] ?? 0) - antes[m]) > 0.0049);
  const variacao = r2(months.reduce((a, m) => a + Math.abs(valorMes(row.total, depois[m] ?? 0) - valorMes(row.total, antes[m])), 0));
  return { rowKey: row.rowKey, label: row.label, bloco, total: row.total, antes, depois, mesesAlterados, variacao, estouro, mudou: mesesAlterados.length > 0 };
}

function fechar(p: Omit<PropostaDeReprojecao, "alteradas" | "estouros" | "variacaoTotal">): PropostaDeReprojecao {
  return { ...p, alteradas: p.contas.filter((c) => c.mudou).length, estouros: p.contas.filter((c) => c.estouro != null).length, variacaoTotal: r2(p.contas.reduce((a, c) => a + c.variacao, 0)) };
}

/** 8.1-1: a distribuição do Orçamento de origem, conta a conta (as duas grades). */
export function proporDoOrcamento(args: { months: string[]; previsao: { receitas: PlanningAccountRow[]; despesas: PlanningAccountRow[] }; orcamento: { receitas: PlanningAccountRow[]; despesas: PlanningAccountRow[] } }): PropostaDeReprojecao {
  const { months, previsao, orcamento } = args;
  const contas: ContaReprojetada[] = [];
  for (const bloco of ["receita", "despesa"] as const) {
    const rowsP = bloco === "receita" ? previsao.receitas : previsao.despesas;
    const rowsO = bloco === "receita" ? orcamento.receitas : orcamento.despesas;
    const doOrcamento = new Map(rowsO.map((r) => [r.rowKey, r]));
    for (const row of rowsP) {
      const o = doOrcamento.get(row.rowKey);
      if (!o) continue; // conta só na previsão: fica como está
      const depois: Record<string, number> = {};
      for (const m of months) depois[m] = Number(o.pct[m]) || 0;
      contas.push(montarConta(row, bloco, months, depois, null));
    }
  }
  return fechar({ origem: "orcamento", decorridas: [], contas });
}

/**
 * 8.1-2: despesas da versão Atual nas competências decorridas; o restante do
 * total, por igual, nos meses futuros. Receitas não mudam (o realizado de
 * receita não vem de despesa). `realizado` = rowKey → mês → valor (R$).
 */
export function proporDoRealizado(args: { months: string[]; hojeMes: string; previsao: { receitas: PlanningAccountRow[]; despesas: PlanningAccountRow[] }; realizado: Record<string, Record<string, number>> }): PropostaDeReprojecao {
  const { months, hojeMes, previsao, realizado } = args;
  const decorridas = competenciasDecorridas(months, hojeMes);
  const futuras = months.filter((m) => !decorridas.includes(m));
  const contas: ContaReprojetada[] = [];
  for (const row of previsao.despesas) {
    if (row.total <= 0) continue;
    const real = realizado[row.rowKey] ?? {};
    const depois: Record<string, number> = {};
    let usado = 0;
    for (const m of decorridas) {
      const v = real[m] ?? 0;
      usado += v;
      depois[m] = pct2((v / row.total) * 100);
    }
    const sobra = row.total - usado;
    const estouro = sobra < -0.005 ? r2(-sobra) : null;
    const porMes = futuras.length > 0 && sobra > 0 ? pct2((sobra / row.total) * 100 / futuras.length) : 0;
    for (const m of futuras) depois[m] = porMes;
    contas.push(montarConta(row, "despesa", months, depois, estouro));
  }
  return fechar({ origem: "realizado", decorridas, contas });
}

/** Contas da proposta no formato que `saveBudgetPlanning` recebe (só as que mudam). */
export function contasParaGravar(p: PropostaDeReprojecao, bloco: "receita" | "despesa", rows: PlanningAccountRow[], months: string[]) {
  const mudadas = new Map(p.contas.filter((c) => c.bloco === bloco && c.mudou).map((c) => [c.rowKey, c]));
  return rows
    .filter((r) => mudadas.has(r.rowKey))
    .map((r) => ({ rowKey: r.rowKey, dreCategory: r.dreCategory, total: r.total, months: months.map((mes) => ({ mes, pct: mudadas.get(r.rowKey)!.depois[mes] ?? 0 })) }));
}

export function recusaDaProposta(p: PropostaDeReprojecao): string | null {
  if (p.alteradas === 0) return "A proposta não muda nenhuma competência: a revisão nova seria igual à atual.";
  if (p.estouros > 0) return `${p.estouros} conta(s) com o realizado acima do total herdado: a distribuição passaria de 100% e o salvamento recusaria. Ajuste o total no Orçamento (e crie a Previsão a partir dele) antes de reprojetar.`;
  return null;
}

export function resumoDaProposta(p: PropostaDeReprojecao, brl: (n: number) => string): string {
  const base = p.origem === "orcamento" ? "distribuição do Orçamento de origem" : `realizado da versão Atual em ${p.decorridas.length} competência(s) decorrida(s), restante por igual nos meses futuros`;
  return `${p.alteradas} conta(s) mudam (${base}); variação mensal somada de ${brl(p.variacaoTotal)}${p.estouros ? `; ${p.estouros} com estouro` : ""}.`;
}
