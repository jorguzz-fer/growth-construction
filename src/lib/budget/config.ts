/**
 * Chave única da linha de RECEITA do lançamento simplificado. A receita do
 * Budget/Forecast passou a ser lançada por projeto (uma linha consolidada),
 * e não mais quebrada por tipo de pagamento (Sinal, parcelas, etc.).
 */
export const RECEITA_ROW_KEY = "Receita";

/**
 * Linha FIXA "Receitas do Projeto" (Prompt D, 3 e BD-5): chave própria do
 * sistema, diferente da legada "Receita". O total vem do cadastro do projeto
 * (BD-1) e a distribuição mensal é do usuário. Não é grupo do Plano de Contas.
 */
export const RECEITAS_PROJETO_KEY = "Receitas do Projeto";
export const RECEITAS_PROJETO_LABEL = "Receitas do Projeto";

/** Linha extra de receita não atribuída a um projeto específico. */
export const OUTRAS_RECEITAS_KEY = "Outras Receitas";

/** Sentinela usada na matriz consolidada para a linha "Outras Receitas". */
export const OUTRAS_RECEITAS_PID = "__outras__";

/** Linhas de RECEITA do lançamento simplificado (uma linha por projeto). */
export const RECEITA_ROWS: string[] = [RECEITA_ROW_KEY];

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
