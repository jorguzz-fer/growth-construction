/**
 * Ordenação da relação de despesas lançadas (tela Despesas / Lançamentos).
 *
 * Requisito: a relação serve de CONFERÊNCIA IMEDIATA para quem está lançando —
 * a última despesa criada é a primeira linha, a penúltima é a segunda, e assim
 * por diante. Por isso a ordenação é sempre pelo MOMENTO ORIGINAL DE CRIAÇÃO:
 *
 *     created_at DESC, id DESC
 *
 * Nunca por competência, vencimento, pagamento, conciliação ou data da última
 * edição — editar uma despesa antiga não pode trazê-la para o topo (o
 * `created_at` não muda numa edição).
 *
 * A ordenação é aplicada na EXIBIÇÃO, e não em `getDespesas()`: aquela query
 * também alimenta Fluxo de Caixa, Contabilidade, conciliação e exportação, que
 * não devem ter seu comportamento alterado.
 */
export interface LancamentoOrdenavel {
  id: string;
  createdAt: Date | null;
  [k: string]: unknown;
}

export function ordenarLancamentos<T extends LancamentoOrdenavel>(rows: T[]): T[] {
  // Cópia: não altera o array recebido.
  return [...rows].sort((a, b) => {
    const ta = a.createdAt ? a.createdAt.getTime() : 0;
    const tb = b.createdAt ? b.createdAt.getTime() : 0;
    if (tb !== ta) return tb - ta; // created_at DESC
    return b.id.localeCompare(a.id); // desempate: id DESC
  });
}
