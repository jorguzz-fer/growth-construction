/** Status de uma obrigação "paga por terceiro" conforme o valor restituído. */
export function statusRestituicao(
  valorTotal: number,
  restituido: number,
): "Aguardando restituição" | "Parcialmente restituído" | "Restituído" {
  if (restituido <= 0) return "Aguardando restituição";
  if (restituido + 0.01 >= valorTotal) return "Restituído";
  return "Parcialmente restituído";
}

/** Saldo pendente de restituição (nunca negativo). */
export function saldoPendente(valorTotal: number, restituido: number): number {
  return Math.max(0, Math.round((valorTotal - restituido) * 100) / 100);
}
