/**
 * Natureza (receita/despesa) de um GRUPO do Plano de Contas, derivada dos seus
 * subitens.
 *
 * Regra: basta UM subitem de receita para o grupo ser de receita — a mesma
 * lógica já usada para o "ativo" (grupo ativo se algum subitem estiver ativo).
 *
 * Por que isso importa: a coluna `natureza` tem default "despesa". Se a natureza
 * do grupo fosse decidida pelo primeiro subitem encontrado, um grupo cujo
 * primeiro subitem ainda estivesse no default seria classificado como despesa
 * inteiro e sumiria do bloco de receitas do Budget/Forecast — deixando a tela
 * sem nenhuma linha para lançar.
 */
export interface SubItemConta {
  natureza?: string | null;
}

export function naturezaDoGrupo(
  subitens: SubItemConta[],
): "receita" | "despesa" {
  return subitens.some((a) => a.natureza === "receita") ? "receita" : "despesa";
}

/** Grupo ativo se ALGUM subitem estiver ativo. */
export function grupoAtivo(subitens: { ativo?: boolean | null }[]): boolean {
  if (subitens.length === 0) return false;
  return subitens.some((a) => a.ativo ?? true);
}
