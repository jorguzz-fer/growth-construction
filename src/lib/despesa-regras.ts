/**
 * Regras de integridade da despesa (Prompt I, §11) — puras e testáveis.
 * Nada aqui altera dado gravado: valem para o que entra daqui em diante.
 */
import { STATUS_PARCELA } from "@/lib/calc/parcelas";

/** Tolerância de centavos entre o total do PED e a soma das parcelas (11.3). */
export const TOLERANCIA_CENTAVOS = 0.01;

/** 11.1 — despesa normal tem valor maior que zero, finito. */
export function recusaDeValor(valor: number): string | null {
  if (!Number.isFinite(valor)) return "Informe um valor válido.";
  if (valor <= 0) return "O valor da despesa precisa ser maior que zero.";
  return null;
}

/** 11.3 — com total e parcelas informados, a soma precisa fechar com o total. */
export function recusaDeParcelas(valorTotal: number, parcelas: readonly { valor: number }[]): string | null {
  if (parcelas.length === 0) return null;
  const soma = parcelas.reduce((a, p) => a + p.valor, 0);
  if (Math.abs(soma - valorTotal) > TOLERANCIA_CENTAVOS) {
    return `A soma das parcelas (${soma.toFixed(2)}) não fecha com o valor da despesa (${valorTotal.toFixed(2)}).`;
  }
  if (parcelas.some((p) => !(p.valor > 0))) return "Toda parcela precisa ter valor maior que zero.";
  return null;
}

/** 11.4 — status de parcela só da lista; o navegador não decide. */
export function statusParcelaValido(s: string | null | undefined): boolean {
  return (STATUS_PARCELA as readonly string[]).includes(s ?? "");
}

export function recusaDeStatusParcela(parcelas: readonly { status: string }[]): string | null {
  const ruim = parcelas.find((p) => !statusParcelaValido(p.status));
  return ruim ? `Status de parcela inválido: "${ruim.status}".` : null;
}

/**
 * 11.5 — o que a réplica recorrente NÃO herda: estado de pagamento e dados
 * do instrumento (boleto e cheque são de um pagamento específico), e a
 * condição de parcelamento (as parcelas ficam só no lançamento original).
 * Recorrência é obrigação futura, não cópia de pagamento passado.
 */
export function coreDaReplica<T extends Record<string, unknown>>(core: T): T {
  const r: Record<string, unknown> = { ...core };
  r.status = "A pagar";
  r.pagoPorTerceiro = false;
  r.dataCaixa = null;
  r.condicaoPagamento = null;
  r.qtdParcelas = null;
  for (const k of Object.keys(r)) if (/^(boleto|cheque)/.test(k)) r[k] = null;
  return r as T;
}

/** Vínculos financeiros de uma despesa — o que trava edição (11.6) e exclusão (§12). */
export interface VinculosDaDespesa {
  parcelasPagas: number;
  pagamentos: number;
  acertos: number;
  restituicoes: number;
  caixaConciliado: number;
  terceiros: number;
  parcelas: number;
  documentosFiscais: number;
  anexos: number;
}

export function temFatoFinanceiro(v: VinculosDaDespesa): boolean {
  return (
    v.parcelasPagas > 0 || v.pagamentos > 0 || v.acertos > 0 || v.restituicoes > 0 || v.caixaConciliado > 0 || v.terceiros > 0
  );
}

/** Campos que a edição não pode mudar quando há fato financeiro (11.6). */
export const CAMPOS_TRAVADOS_COM_FATO = ["valor", "status", "competencia", "vencimento", "formaPagamento"] as const;

/**
 * 11.6 — o que a edição recusa. Com pagamento, acerto, restituição, terceiro
 * ou caixa conciliado: valor, status, datas e forma não mudam. Só com parcelas
 * em aberto: o valor não muda (as parcelas deixariam de fechar). Retorna a
 * mensagem de recusa, ou null. `campos` são os campos que o patch altera.
 */
export function recusaDeEdicao(v: VinculosDaDespesa, campos: readonly string[]): string | null {
  const motivos: string[] = [];
  if (v.pagamentos) motivos.push(`${v.pagamentos} pagamento(s)`);
  if (v.parcelasPagas) motivos.push(`${v.parcelasPagas} parcela(s) paga(s)`);
  if (v.acertos) motivos.push(`${v.acertos} acerto(s) contábil(is)`);
  if (v.restituicoes) motivos.push(`${v.restituicoes} restituição(ões)`);
  if (v.terceiros) motivos.push("pagamento por terceiro");
  if (v.caixaConciliado) motivos.push(`${v.caixaConciliado} movimento(s) de caixa conciliado(s)`);
  if (motivos.length) {
    const travados = campos.filter((c) => (CAMPOS_TRAVADOS_COM_FATO as readonly string[]).includes(c));
    if (travados.length) {
      return `Esta despesa tem ${motivos.join(", ")}: ${travados.join(", ")} não podem ser alterados. Use cancelamento ou estorno.`;
    }
    return null;
  }
  if (v.parcelas > 0 && campos.includes("valor")) {
    return `Esta despesa tem ${v.parcelas} parcela(s): altere as parcelas, não o valor total.`;
  }
  return null;
}

/**
 * §12 — exclusão física só para registro sem dependência. Com fato
 * financeiro, nota fiscal ou anexo, a exclusão é recusada: o caminho é o
 * cancelamento, que preserva o histórico. Lista vazia = pode excluir.
 */
export function bloqueiosDeExclusaoDespesa(v: VinculosDaDespesa): string[] {
  const m: string[] = [];
  if (v.pagamentos) m.push(`${v.pagamentos} pagamento(s)`);
  if (v.parcelasPagas) m.push(`${v.parcelasPagas} parcela(s) paga(s)`);
  if (v.acertos) m.push(`${v.acertos} acerto(s) contábil(is)`);
  if (v.restituicoes) m.push(`${v.restituicoes} restituição(ões)`);
  if (v.terceiros) m.push("pagamento por terceiro");
  if (v.caixaConciliado) m.push(`${v.caixaConciliado} movimento(s) de caixa conciliado(s)`);
  if (v.documentosFiscais) m.push(`${v.documentosFiscais} documento(s) fiscal(is)`);
  if (v.anexos) m.push(`${v.anexos} anexo(s)`);
  return m;
}
