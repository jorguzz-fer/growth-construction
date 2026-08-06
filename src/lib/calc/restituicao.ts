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

/**
 * Rótulo do status da obrigação na interface (§12).
 *
 * O banco continua gravando "Aguardando restituição" — o valor histórico. A
 * troca é só de vocabulário na tela: nenhum registro antigo é reclassificado,
 * nenhum UPDATE é emitido. Qualquer status desconhecido é devolvido como veio,
 * para nunca esconder um estado que não previmos.
 */
export function rotuloStatusObrigacao(status: string): string {
  if (status === "Aguardando restituição") return "Pendente";
  return status;
}

/**
 * Saldo devido a um terceiro: total desembolsado por ele − total já restituído
 * (§13). Diferente de `saldoPendente`, NÃO faz clamp em zero: um saldo negativo
 * significa que se restituiu mais do que se devia e precisa ficar visível, não
 * ser mascarado.
 */
export function saldoDevidoTerceiro(
  totalDesembolsado: number,
  totalRestituido: number,
): number {
  return Math.round((totalDesembolsado - totalRestituido) * 100) / 100;
}

/**
 * A restituição cabe no saldo devido? Tolerância de 1 centavo para
 * arredondamento. Restituir acima do saldo geraria saída de caixa indevida.
 */
export function restituicaoCabe(
  valorTotal: number,
  jaRestituido: number,
  novoValor: number,
): boolean {
  if (!(novoValor > 0)) return false;
  return novoValor <= valorTotal - jaRestituido + 0.01;
}
