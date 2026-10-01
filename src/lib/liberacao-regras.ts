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
