import { PROJECTION_SOURCES } from "@/lib/calc";

/** Linhas de RECEITA do lançamento simplificado (fontes consolidadas). */
export const RECEITA_ROWS: string[] = [...PROJECTION_SOURCES, "Reembolso"];

/** Uma linha do lançamento simplificado (chave + categoria DRE). */
export interface BudgetRow {
  rowKey: string;
  label: string;
  dreCategory: string; // "Receita" para receitas; categoria DRE para despesas
}

/** Categoria DRE padrão de um grupo do plano de contas (CEF vs complementar). */
export function defaultDreCategory(kind: "cef" | "complementar"): string {
  return kind === "cef" ? "Custo Variável" : "Despesa Fixa";
}

/** Só Budget e Forecast usam o lançamento simplificado. */
export function isBudgetVersion(kind: string): boolean {
  return kind === "budget" || kind === "forecast";
}
