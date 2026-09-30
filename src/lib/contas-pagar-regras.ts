/**
 * Regras de Contas a Pagar (Prompt I, §10 e §15) — puras e testáveis.
 *
 * §15: o pendente de uma conta é o SALDO a pagar (valor − principal pago −
 * abatimentos de acertos ativos), nunca o valor original. Despesa de 100 com
 * 80 pagos deve 20. O saldo vem de `saldosReaisDasDespesas` (uma lógica só,
 * a mesma do acerto contábil).
 */

export interface ContaComSaldo {
  status: string | null;
  valor: number;
  /** saldo real a pagar; ausente em linhas antigas = valor cheio. */
  saldo?: number;
}

/** O que ainda vai sair do caixa por esta conta. Paga = zero. */
export function pendenteDaConta(c: ContaComSaldo): number {
  if (c.status === "Pago") return 0;
  return Math.max(0, c.saldo ?? c.valor);
}

/** Soma do pendente de várias contas, em centavos exatos. */
export function totalPendente(contas: readonly ContaComSaldo[]): number {
  return Math.round(contas.reduce((a, c) => a + pendenteDaConta(c), 0) * 100) / 100;
}

/** §10 — Contas a Pagar é exclusivamente a versão Atual. */
export function ehVersaoAtual(kind: string | null | undefined): boolean {
  return kind === "atual";
}
