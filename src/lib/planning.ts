/**
 * Utilidades do módulo de planejamento (Budget/Forecast) — modelo total + %.
 *
 * O período (colunas mensais) vem SEMPRE do cadastro do projeto (mês inicial /
 * mês final). O valor mensal de cada conta é derivado do total pela distribuição
 * percentual: valor = total × pct / 100.
 */

/** "MM/YYYY" → índice absoluto de mês (ou null se inválido). */
export function monthKeyIndex(mk: string): number | null {
  const p = (mk || "").split("/");
  if (p.length !== 2) return null;
  const m = Number(p[0]);
  const y = Number(p[1]);
  if (!m || !y || m < 1 || m > 12) return null;
  return y * 12 + (m - 1);
}

function idxToKey(idx: number): string {
  const y = Math.floor(idx / 12);
  const m = (idx % 12) + 1;
  return `${String(m).padStart(2, "0")}/${y}`;
}

/**
 * Competências "MM/YYYY" do período do projeto (inclusive). Vazio se o período
 * não estiver definido ou for inválido (fim antes do início).
 */
export function projectPeriodMonths(
  mesInicial: string | null | undefined,
  mesFinal: string | null | undefined,
): string[] {
  const a = monthKeyIndex((mesInicial || "").trim());
  const b = monthKeyIndex((mesFinal || "").trim());
  if (a == null || b == null || b < a) return [];
  const out: string[] = [];
  for (let i = a; i <= b; i++) out.push(idxToKey(i));
  return out;
}

/** Data interna "MM/DD/YYYY" → competência "MM/YYYY" (ou null). */
export function monthKeyOfInternalDate(d: string | null | undefined): string | null {
  const p = (d || "").trim().split("/");
  if (p.length !== 3) return null;
  const m = Number(p[0]);
  const y = Number(p[2]);
  if (!m || !y || m < 1 || m > 12) return null;
  return `${String(m).padStart(2, "0")}/${y}`;
}

/**
 * Meses do período a partir das DATAS de início e fim do projeto (fonte oficial
 * das colunas do Budget/Forecast). "MM/DD/YYYY" → competências "MM/YYYY".
 */
export function projectPeriodMonthsFromDates(
  startDate: string | null | undefined,
  endDate: string | null | undefined,
): string[] {
  return projectPeriodMonths(
    monthKeyOfInternalDate(startDate),
    monthKeyOfInternalDate(endDate),
  );
}

/** Uma conta (linha) do Budget/Forecast: total + percentual/valor por mês. */
export interface PlanningAccountRow {
  /** identidade da linha = código do grupo do Plano de Contas (ou chave legada). */
  rowKey: string;
  label: string;
  dreCategory: string | null;
  /** total planejado da conta no projeto. */
  total: number;
  /** percentual por mês ("MM/YYYY" → %). */
  pct: Record<string, number>;
  /** conta ativa no Plano de Contas (legadas = true). */
  ativo: boolean;
  /** existe como grupo no Plano de Contas atual (false = linha legada). */
  fromChart: boolean;
}

export interface PlanningVersion {
  id: string;
  label: string;
  kind: string;
  status: string;
  isDefault: boolean;
  locked: boolean;
  sourceVersionId: string | null;
}

export interface BudgetPlanningData {
  project: {
    id: string;
    name: string;
    mesInicial: string | null;
    mesFinal: string | null;
    /** indicador "Recursos próprios" (valor do cadastro; 0 se não informado). */
    recursosProprios: number;
  };
  /** true quando o período está definido no cadastro do projeto. */
  hasPeriod: boolean;
  months: string[];
  versions: PlanningVersion[];
  versionId: string | null;
  receitas: PlanningAccountRow[];
  despesas: PlanningAccountRow[];
}

/** Valor mensal a partir do total e do percentual (arredondado a centavos). */
export function monthValue(total: number, pct: number): number {
  return Math.round(total * pct) / 100;
}

/** Soma dos percentuais de uma conta no período. */
export function sumPct(pct: Record<string, number>, months: string[]): number {
  return months.reduce((a, m) => a + (Number(pct[m]) || 0), 0);
}
