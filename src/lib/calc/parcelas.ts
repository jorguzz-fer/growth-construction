import { parseDate, monthKey } from "./projection";

/** Uma parcela gerada (para conta a pagar / fluxo de caixa projetado). */
export interface ParcelaGerada {
  numero: number;
  vencimento: string; // "MM/DD/YYYY"
  valor: number;
}

/** Formas de pagamento aceitas. */
export const FORMAS_PAGAMENTO = [
  "Boleto",
  "Cheque",
  "PIX",
  "Transferência bancária",
  "Cartão de crédito",
  "Cartão de débito",
  "Dinheiro",
  "Débito automático",
  "Outro",
] as const;

/** Condições de pagamento pré-definidas (offsets em dias) + personalizado. */
export const CONDICOES_PAGAMENTO: { value: string; label: string }[] = [
  { value: "avista", label: "À vista" },
  { value: "30", label: "30 dias" },
  { value: "30/60", label: "30/60 dias" },
  { value: "30/60/90", label: "30/60/90 dias" },
  { value: "personalizado", label: "Personalizado" },
];

/** Status possíveis de uma parcela. */
export const STATUS_PARCELA = [
  "Pendente",
  "Pago",
  "Pago parcialmente",
  "Vencido",
  "Renegociado",
  "Cancelado",
] as const;

const round2 = (v: number) => Math.round(v * 100) / 100;

/** Soma `days` dias a uma data "MM/DD/YYYY" (UTC, determinístico). */
export function addDaysBR(mdY: string, days: number): string {
  const d = parseDate(mdY);
  if (!d) return mdY;
  const dt = new Date(Date.UTC(d.yr, d.mo - 1, d.d));
  dt.setUTCDate(dt.getUTCDate() + days);
  const mm = String(dt.getUTCMonth() + 1).padStart(2, "0");
  const dd = String(dt.getUTCDate()).padStart(2, "0");
  return `${mm}/${dd}/${dt.getUTCFullYear()}`;
}

/**
 * Distribui `valorTotal` em `qtd` parcelas iguais (arredondadas a centavos),
 * jogando a diferença de arredondamento na ÚLTIMA parcela — garante que a soma
 * seja exatamente igual ao total.
 */
export function distribuirValor(valorTotal: number, qtd: number): number[] {
  const n = Math.max(1, Math.trunc(qtd));
  const base = round2(valorTotal / n);
  const valores = Array.from({ length: n }, () => base);
  const soma = round2(base * n);
  valores[n - 1] = round2(valores[n - 1] + (valorTotal - soma));
  return valores;
}

/**
 * Gera as parcelas de uma conta a pagar a partir da condição de pagamento.
 * - "avista": 1 parcela na data-base.
 * - "30" / "30/60" / "30/60/90": offsets em dias a partir da data-base.
 * - "personalizado": usa `vencimentos` informados (ou data-base + intervalo).
 * A soma das parcelas é sempre igual a `valorTotal`.
 */
export function gerarParcelas(opts: {
  valorTotal: number;
  condicao: string;
  dataBase: string; // "MM/DD/YYYY" (emissão ou 1º vencimento)
  qtd?: number;
  intervaloDias?: number;
  vencimentos?: string[];
}): ParcelaGerada[] {
  const { valorTotal, condicao, dataBase } = opts;
  let vencs: string[];

  if (condicao === "avista") {
    vencs = [dataBase];
  } else if (condicao === "personalizado") {
    if (opts.vencimentos && opts.vencimentos.length > 0) {
      vencs = opts.vencimentos;
    } else {
      const n = Math.max(1, Math.trunc(opts.qtd || 1));
      const step = Math.max(1, Math.trunc(opts.intervaloDias || 30));
      vencs = Array.from({ length: n }, (_, i) => addDaysBR(dataBase, i * step));
    }
  } else {
    // offsets em dias, ex.: "30/60/90"
    const offsets = condicao
      .split("/")
      .map((x) => parseInt(x, 10))
      .filter((x) => Number.isFinite(x));
    vencs = offsets.length
      ? offsets.map((off) => addDaysBR(dataBase, off))
      : [dataBase];
  }

  const valores = distribuirValor(valorTotal, vencs.length);
  return vencs.map((venc, i) => ({
    numero: i + 1,
    vencimento: venc,
    valor: valores[i],
  }));
}

/** Mês "MM/YYYY" de uma data "MM/DD/YYYY" (para o fluxo de caixa). */
export function mesDaData(mdY: string): string | null {
  const d = parseDate(mdY);
  return d ? monthKey(d.mo, d.yr) : null;
}
