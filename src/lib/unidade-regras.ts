/**
 * Regras da exclusão de unidade (Prompt I, §12) — puras e testáveis.
 * Apagar uma unidade leva o plano de pagamento junto; por isso só sem
 * vínculo, com confirmação pelo código, e nunca em versão congelada.
 */

export interface VinculosDaUnidade {
  /** Nome do cliente com contrato ativo nesta unidade, se houver. */
  clienteComContrato: string | null;
  vendida: boolean;
  contasReceber: number;
  documentos: number;
  permutas: number;
}

export function bloqueiosDeExclusaoUnidade(v: VinculosDaUnidade): string[] {
  const m: string[] = [];
  if (v.clienteComContrato) m.push(`cliente "${v.clienteComContrato}" com contrato ativo`);
  if (v.vendida) m.push("unidade vendida ou permutada (o plano de pagamento é fato financeiro)");
  if (v.contasReceber > 0) m.push(`${v.contasReceber} conta(s) a receber`);
  if (v.documentos > 0) m.push(`${v.documentos} documento(s)`);
  if (v.permutas > 0) m.push(`${v.permutas} permuta(s)`);
  return m;
}

const normalizar = (v: string | null | undefined) => (v ?? "").trim().toLowerCase();

/** A confirmação digitada corresponde ao código da unidade? */
export function confirmacaoDeUnidadeConfere(digitado: string | null | undefined, code: string): boolean {
  return normalizar(digitado) !== "" && normalizar(digitado) === normalizar(code);
}

/** Unidade vendida ou permutada — o plano de pagamento já é fato. */
export function unidadeVendida(u: { status: string; mesVenda: string | null }): boolean {
  return u.status === "Vendido" || u.status === "Permutado" || !!(u.mesVenda && u.mesVenda.trim());
}
