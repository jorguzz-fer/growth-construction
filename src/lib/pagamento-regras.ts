/**
 * Regras de pagamento (Prompt I, §13 e §14) — puras e testáveis. O status
 * sai do ACUMULADO, nunca do último pagamento isolado: despesa 100, pagos
 * 60 e depois 40, é "Pago" — não "parcial porque o último foi 40".
 */

/** Tolerância de centavos para considerar quitado. */
export const TOLERANCIA_QUITACAO = 0.01;

/**
 * Principal pago num pagamento: o que efetivamente abate a dívida. Encargos
 * (multa, juros, outros) não abatem; desconto abate sem sair do caixa.
 */
export function principalDoPagamento(p: {
  valorTotalPago: number;
  desconto?: number;
  multa?: number;
  juros?: number;
  outrosAcrescimos?: number;
}): number {
  return p.valorTotalPago + (p.desconto || 0) - (p.multa || 0) - (p.juros || 0) - (p.outrosAcrescimos || 0);
}

/** Status da PARCELA pelo acumulado pago contra o valor original. */
export function statusDaParcela(valorOriginal: number, pagoAcumulado: number): "Pendente" | "Pago parcialmente" | "Pago" {
  if (pagoAcumulado + TOLERANCIA_QUITACAO >= valorOriginal) return "Pago";
  if (pagoAcumulado > 0) return "Pago parcialmente";
  return "Pendente";
}

/** Status da DESPESA sem parcelas, pelo principal acumulado contra o valor. */
export function statusDaDespesaPorAcumulado(valor: number, principalAcumulado: number): "A pagar" | "Parcialmente paga" | "Pago" {
  if (principalAcumulado + TOLERANCIA_QUITACAO >= valor) return "Pago";
  if (principalAcumulado > 0) return "Parcialmente paga";
  return "A pagar";
}

/**
 * Status da DESPESA-MÃE pelas parcelas (§14): todas quitadas = Pago; parte
 * (alguma quitada ou com algo pago) = Parcialmente paga; nada = A pagar.
 */
export function statusDaDespesaPelasParcelas(
  parcelas: readonly { status: string; valorPago: number }[],
): "A pagar" | "Parcialmente paga" | "Pago" {
  if (parcelas.length === 0) return "A pagar";
  const quitadas = parcelas.filter((p) => p.status === "Pago").length;
  if (quitadas === parcelas.length) return "Pago";
  if (quitadas > 0 || parcelas.some((p) => p.valorPago > 0)) return "Parcialmente paga";
  return "A pagar";
}

/** O valor pago precisa ser positivo e finito; a data, informada. */
export function recusaDePagamento(p: { valorTotalPago: number; dataPagamento: string | null | undefined }): string | null {
  if (!Number.isFinite(p.valorTotalPago) || p.valorTotalPago <= 0) return "Informe um valor pago maior que zero.";
  if (!p.dataPagamento) return "Informe a data do pagamento.";
  return null;
}
