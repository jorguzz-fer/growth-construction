/**
 * Saldo disponível da EMPRESA a partir das contas correntes.
 *
 * Contas do tipo "Terceiros" representam o quanto a empresa DEVE a um sócio,
 * mestre de obra ou funcionário que pagou despesas do próprio bolso. Isso é
 * obrigação, não dinheiro em caixa — por isso essas contas nunca entram no
 * saldo disponível consolidado.
 */
export const TIPO_CONTA_TERCEIROS = "Terceiros";

export interface ContaComSaldo {
  tipo: string;
  saldo: string | number;
}

/** Uma conta representa dinheiro disponível da empresa? */
export function isContaDaEmpresa(conta: { tipo: string }): boolean {
  return conta.tipo !== TIPO_CONTA_TERCEIROS;
}

/** Saldo disponível da empresa (exclui contas de terceiros). */
export function saldoDisponivel(contas: ContaComSaldo[]): number {
  return contas
    .filter(isContaDaEmpresa)
    .reduce((a, c) => a + (Number(c.saldo) || 0), 0);
}

/** Total devido a terceiros (soma das contas do tipo "Terceiros"). */
export function saldoDevidoTerceiros(contas: ContaComSaldo[]): number {
  return contas
    .filter((c) => !isContaDaEmpresa(c))
    .reduce((a, c) => a + (Number(c.saldo) || 0), 0);
}
