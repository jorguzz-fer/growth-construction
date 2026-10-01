/**
 * Regras puras do ativo de permuta (Prompt P, 3.1): o que o cadastro exige
 * antes de gravar. Vale para criar e, na P-2, para editar. Sem banco.
 *
 * O bem recebido em permuta é um ATIVO: entra no inventário pelo valor
 * estimado. Por isso o estimado é obrigatório e maior que zero, e a unidade e
 * o cliente de origem também — sem eles o ativo não diz de qual venda veio.
 */
import { lerValor } from "@/lib/conta-receber-regras";

export const STATUS_DE_PERMUTA = ["Disponivel", "Vendido"] as const;
export const FORMAS_DE_REVENDA = ["avista", "parcelada", "escambo"] as const;
export const PERIODICIDADES = ["mensal", "semestral", "anual"] as const;

export type StatusDePermuta = (typeof STATUS_DE_PERMUTA)[number];
export type FormaDeRevenda = (typeof FORMAS_DE_REVENDA)[number];

export interface AtivoParaValidar {
  tipo: string | null;
  estimado: string | null;
  unitCode: string | null;
  /** Nome (coluna de hoje) ou id (P-2): basta um dos dois. */
  cliente: string | null;
  dataRecebimento: string | null;
  status: string | null;
  dataVenda: string | null;
  valorVenda: string | null;
  formaVenda: string | null;
  parcelas: string | null;
  periodicidade: string | null;
}

const DATA_GRAVADA = /^\d{1,2}\/\d{1,2}\/\d{4}$/;

/** Data no formato gravado (MM/DD/YYYY) com mês e dia plausíveis. */
export function dataGravadaValida(s: string | null | undefined): boolean {
  const t = (s ?? "").trim();
  if (!DATA_GRAVADA.test(t)) return false;
  const [m, d] = t.split("/").map(Number);
  return m >= 1 && m <= 12 && d >= 1 && d <= 31;
}

/** Lê o valor digitado (BR ou US); vazio é NaN, nunca zero (3.1). */
export function lerValorDoAtivo(v: string | null | undefined): number {
  return lerValor(v);
}

/**
 * Motivo para recusar o cadastro, ou null quando está em ordem. Um motivo por
 * vez, na ordem em que o formulário mostra os campos.
 */
export function motivoDeRecusaDoAtivo(a: AtivoParaValidar): string | null {
  if (!a.unitCode?.trim()) return "Informe a unidade de origem do bem.";
  if (!a.cliente?.trim()) return "Informe o cliente que entregou o bem.";
  if (!dataGravadaValida(a.dataRecebimento)) return "Informe a data de recebimento do bem.";
  if (!a.tipo?.trim()) return "Informe o tipo do bem.";
  const estimado = lerValorDoAtivo(a.estimado);
  if (!Number.isFinite(estimado) || estimado <= 0) return "O valor estimado deve ser maior que zero.";
  const status = (a.status ?? "").trim() || "Disponivel";
  if (!(STATUS_DE_PERMUTA as readonly string[]).includes(status)) return "Status inválido.";
  const forma = (a.formaVenda ?? "").trim();
  if (forma && !(FORMAS_DE_REVENDA as readonly string[]).includes(forma)) return "Forma de revenda inválida.";
  const periodicidade = (a.periodicidade ?? "").trim();
  if (periodicidade && !(PERIODICIDADES as readonly string[]).includes(periodicidade)) return "Periodicidade inválida.";
  const valorVendaBruto = (a.valorVenda ?? "").trim();
  const valorVenda = valorVendaBruto ? lerValorDoAtivo(valorVendaBruto) : 0;
  if (valorVendaBruto && (!Number.isFinite(valorVenda) || valorVenda < 0)) return "Valor de venda inválido.";
  if (status === "Vendido") {
    if (!dataGravadaValida(a.dataVenda)) return "Ativo vendido exige a data da venda.";
    if (!(valorVenda > 0)) return "Ativo vendido exige o valor da venda, maior que zero.";
    if (forma === "parcelada") {
      const n = Number((a.parcelas ?? "").trim());
      if (!Number.isInteger(n) || n < 1) return "Venda parcelada exige o número de parcelas (1 ou mais).";
    }
  } else if (a.dataVenda?.trim() && !dataGravadaValida(a.dataVenda)) {
    return "Data de venda inválida.";
  }
  return null;
}
