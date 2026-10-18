/**
 * Prompt AA2 (Fase 3 · revisão V5): os dois gráficos do Dashboard. Módulo PURO.
 *
 *  - Fluxo de caixa em linhas: entradas e saídas previstas por mês (pelo
 *    vencimento, como o Fluxo de Caixa), da versão Atual.
 *  - DRE em barras empilhadas: em cada mês, uma barra com Custo Variável,
 *    Despesa Variável, Custo Fixo, Despesa Fixa, os demais itens (retiradas,
 *    investimentos, empréstimos e despesas financeiras) e o Resultado. Com
 *    resultado positivo, a barra inteira é a receita; com prejuízo, o
 *    resultado aparece abaixo do zero.
 *
 * Os números são os da DRE (`waterfall`) e do Fluxo (`flowMaps`): aqui só se
 * escolhem os meses e se arrumam as séries.
 */
import { waterfall, type Inputs } from "@/lib/calc/dre-cascata";
import { enumMonths, monthIndex } from "@/lib/dre";

/** Teto de meses num gráfico: além disso, os mais recentes. */
export const MAX_MESES_GRAFICO = 36;

const mesDe = (i: number) => `${String((i % 12) + 1).padStart(2, "0")}/${Math.floor(i / 12)}`;

/** "MM/DD/YYYY" ou "MM/YYYY" → "MM/YYYY"; null se inválida. */
export function mesDoFiltro(d: string | null | undefined): string | null {
  const s = (d ?? "").trim();
  let m = /^(\d{1,2})\/(\d{1,2})\/(\d{4})$/.exec(s);
  if (m) return `${m[1].padStart(2, "0")}/${m[3]}`;
  m = /^(\d{1,2})\/(\d{4})$/.exec(s);
  return m ? `${m[1].padStart(2, "0")}/${m[2]}` : null;
}

/**
 * Os meses dos gráficos. Com período, os do período (até o teto, os mais
 * recentes). Sem período, 12 meses: os 5 anteriores, o atual e os 6
 * seguintes — o realizado recente e o que vem.
 */
export function mesesDoGrafico(hoje: Date, de: string, ate: string): string[] {
  const a = mesDoFiltro(de);
  const b = mesDoFiltro(ate);
  const atual = hoje.getFullYear() * 12 + hoje.getMonth();
  if (a || b) {
    const ini = a ? monthIndex(a)! : (b ? monthIndex(b)! : atual) - 11;
    const fim = b ? monthIndex(b)! : ini + 11;
    const meses = enumMonths(mesDe(Math.min(ini, fim)), mesDe(Math.max(ini, fim)));
    return meses.slice(-MAX_MESES_GRAFICO);
  }
  return enumMonths(mesDe(atual - 5), mesDe(atual + 6));
}

export interface SeriesDoFluxo {
  meses: string[];
  entradas: number[];
  saidas: number[];
}

/** Entradas e saídas por mês, somadas as obras. */
export function seriesDoFluxo(mapas: readonly { entradas: Record<string, number>; saidas: Record<string, number> }[], meses: readonly string[]): SeriesDoFluxo {
  const soma = (k: "entradas" | "saidas", mm: string) => Math.round(mapas.reduce((a, m) => a + (m[k][mm] || 0), 0) * 100) / 100;
  return { meses: [...meses], entradas: meses.map((mm) => soma("entradas", mm)), saidas: meses.map((mm) => soma("saidas", mm)) };
}

export const PARTES_DA_DRE = ["Custo Variável", "Despesa Variável", "Custo Fixo", "Despesa Fixa", "Demais itens", "Resultado"] as const;
export type ParteDaDre = (typeof PARTES_DA_DRE)[number];

export interface SeriesDaDre {
  meses: string[];
  receita: number[];
  partes: Record<ParteDaDre, number[]>;
}

/**
 * A barra empilhada de cada mês, das obras somadas. Em cada mês as partes
 * somam a receita: CV + DV + CF + DF + demais + resultado = receita.
 */
export function seriesDaDre(porMes: readonly Record<string, Inputs>[], meses: readonly string[]): SeriesDaDre {
  const partes = Object.fromEntries(PARTES_DA_DRE.map((p) => [p, [] as number[]])) as unknown as Record<ParteDaDre, number[]>;
  const receita: number[] = [];
  for (const mm of meses) {
    const c = waterfall(porMes.map((bm) => bm[mm]).filter((x): x is Inputs => !!x));
    const v = (label: string) => c.rows.find((r) => r.label === label)!.value;
    const cv = v("(−) Custo Variável");
    const dv = v("(−) Despesa Variável");
    const cf = v("(−) Custo Fixo");
    const df = v("(−) Despesa Fixa");
    const demais = v("(−) Retiradas") + v("(−) Investimentos") + v("(−) Empréstimos") + v("(−) Despesas Financeiras (juros/multas)");
    const r2 = (x: number) => Math.round(x * 100) / 100;
    receita.push(r2(c.R));
    partes["Custo Variável"].push(r2(cv));
    partes["Despesa Variável"].push(r2(dv));
    partes["Custo Fixo"].push(r2(cf));
    partes["Despesa Fixa"].push(r2(df));
    partes["Demais itens"].push(r2(demais));
    partes["Resultado"].push(r2(v("= Resultado Final")));
  }
  return { meses: [...meses], receita, partes };
}

/** Há algo para desenhar? (Sem nenhum valor, a tela diz em vez de um gráfico vazio.) */
export const temValor = (...series: readonly number[][]) => series.some((s) => s.some((x) => Math.abs(x) >= 0.005));
