/**
 * Regras puras das Liberações de Obra (Prompt O). Sem banco.
 *
 * A liberação é a parcela do financiamento da obra que a instituição
 * financeira libera após a medição: ENTRADA DE CAIXA, não receita — a receita
 * da obra é reconhecida pela venda da unidade (§54/§57 do Prompt I).
 */

/**
 * Normaliza o status legado ("received", gravado pela importação de planilha)
 * para o rótulo em português. Fica aqui, sem migrar nada, para quando o status
 * voltar a ser exibido ou filtrado — hoje a coluna saiu da listagem (5.2).
 */
export function statusDaLiberacao(status: string | null | undefined): string {
  if (!status) return "Recebido";
  return status.toLowerCase() === "received" ? "Recebido" : status;
}

import { lerValor } from "@/lib/conta-receber-regras";
import { dataGravadaValida } from "@/lib/permuta-regras";

export interface LiberacaoParaValidar {
  /** Formato gravado MM/DD/YYYY (o DateField já entrega assim). */
  data: string | null;
  origem: string | null;
  valor: string | null;
}

/** Lê o valor digitado (BR ou US); vazio é NaN, nunca zero (3.1). */
export function lerValorDaLiberacao(v: string | null | undefined): number {
  return lerValor(v);
}

/**
 * Motivo para recusar o lançamento (3.1), ou null. Valor maior que zero, data
 * preenchida e no formato válido, origem obrigatória. Um motivo por vez, na
 * ordem do formulário.
 */
export function motivoDeRecusaDaLiberacao(l: LiberacaoParaValidar): string | null {
  if (!dataGravadaValida(l.data)) return "Informe a data em que o recurso entrou (DD/MM/AAAA).";
  if (!l.origem?.trim()) return "Informe a origem da liberação (banco e referência da medição).";
  const valor = lerValorDaLiberacao(l.valor);
  if (!Number.isFinite(valor) || valor <= 0) return "O valor deve ser maior que zero.";
  return null;
}
