/**
 * Recebimento por terceiro e repasse — RG-02 e RG-04.
 *
 * O caso real: a pessoa física do sócio/parceiro recebe do cliente final e
 * depois repassa o valor para a empresa.
 *
 * A receita foi reconhecida **na venda** (CPC 47 — transferência de controle).
 * O que acontece depois é trânsito de dinheiro:
 *
 *   1. terceiro recebe do cliente → a empresa baixa o título e passa a ter um
 *      ATIVO com ele (`1.1.3 — Valores a Receber de Terceiros`). DRE: nada.
 *   2. terceiro repassa à empresa → entra caixa, baixa o ativo. DRE: nada.
 *
 * Reconhecer receita em (1) ou (2) **dobraria a receita da venda**. É o erro
 * que este módulo existe para tornar impossível: nenhuma função aqui produz
 * linha de receita, e o teste `repasse não duplica receita na DRE` prova isso.
 *
 * Espelho exato de `restituicao.ts`, do outro lado do balanço.
 */

/** Status derivado do quanto já foi repassado. */
export function statusRepasse(
  valorTotal: number,
  repassado: number,
): "Aguardando repasse" | "Parcialmente repassado" | "Repassado" {
  if (repassado <= 0) return "Aguardando repasse";
  if (repassado + 0.01 >= valorTotal) return "Repassado";
  return "Parcialmente repassado";
}

/** Rótulo do status na tela — "Aguardando repasse" é exibido como "Pendente". */
export function rotuloStatusRepasse(status: string): string {
  if (status === "Aguardando repasse") return "Pendente";
  return status;
}

/**
 * Saldo que o terceiro ainda deve repassar à empresa.
 *
 * Sem clamp em zero: repassar mais do que recebeu é um erro que precisa ficar
 * visível, não ser mascarado.
 */
export function saldoARepassar(valorTotal: number, repassado: number): number {
  return Math.round((valorTotal - repassado) * 100) / 100;
}

/** O repasse cabe no saldo? Tolerância de 1 centavo para arredondamento. */
export function repasseCabe(
  valorTotal: number,
  jaRepassado: number,
  novoValor: number,
): boolean {
  if (!(novoValor > 0)) return false;
  return novoValor <= valorTotal - jaRepassado + 0.01;
}

/**
 * Impacto de um recebimento por terceiro na DRE — RG-02.
 *
 * Existe para ser chamada nos testes e ficar explícito no código: é **sempre
 * zero**, em qualquer competência, em qualquer etapa. Se algum dia alguém
 * mudar isso, o teste quebra.
 */
export function impactoDreRecebimentoTerceiro(): number {
  return 0;
}

/** Impacto de um repasse na DRE — RG-04. Também sempre zero. */
export function impactoDreRepasse(): number {
  return 0;
}

// ────────────────────────── Encontro de contas (RG-05) ──────────────────────

export interface SaldosTerceiro {
  /** quanto a empresa DEVE a ele (despesas que ele pagou e não foram restituídas). */
  saldoARestituir: number;
  /** quanto ELE deve à empresa (recebimentos ainda não repassados). */
  saldoARepassar: number;
}

/**
 * Valor compensável no encontro de contas: o menor dos dois saldos.
 *
 * A compensação não transita pela DRE — é baixa simultânea de um passivo e de
 * um ativo. Os dois saldos BRUTOS continuam sendo exibidos antes dela
 * (princípio da não compensação indevida: divulgação bruta, liquidação
 * líquida).
 */
export function valorCompensavel(s: SaldosTerceiro): number {
  const a = Math.max(0, s.saldoARestituir);
  const b = Math.max(0, s.saldoARepassar);
  return Math.round(Math.min(a, b) * 100) / 100;
}

/** Há o que compensar? Só quando existem os DOIS lados. */
export function podeCompensar(s: SaldosTerceiro): boolean {
  return valorCompensavel(s) > 0;
}

/** Saldos que restam depois de compensar. */
export function saldosAposCompensacao(s: SaldosTerceiro): SaldosTerceiro {
  const v = valorCompensavel(s);
  return {
    saldoARestituir: Math.round((s.saldoARestituir - v) * 100) / 100,
    saldoARepassar: Math.round((s.saldoARepassar - v) * 100) / 100,
  };
}
