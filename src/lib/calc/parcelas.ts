import { parseDate, monthKey } from "./projection";
import { serieVencimentos } from "./carencia";

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

/** Número comparável YYYYMMDD de "MM/DD/YYYY" (ou null). */
function ymdNum(mdY: string): number | null {
  const d = parseDate(mdY);
  return d ? d.yr * 10000 + d.mo * 100 + d.d : null;
}

/**
 * Composição de um pagamento (Fase 3):
 * total pago = valor original − desconto + multa + juros + outros acréscimos.
 * Os encargos (multa + juros + outros − desconto) vão para a categoria
 * financeira, separados do valor original.
 */
export function composePagamento(p: {
  valorOriginal: number;
  desconto?: number;
  multa?: number;
  juros?: number;
  outrosAcrescimos?: number;
}): { valorTotalPago: number; encargos: number } {
  const desconto = p.desconto || 0;
  const multa = p.multa || 0;
  const juros = p.juros || 0;
  const outros = p.outrosAcrescimos || 0;
  const valorTotalPago = round2(p.valorOriginal - desconto + multa + juros + outros);
  const encargos = round2(multa + juros + outros - desconto);
  return { valorTotalPago, encargos };
}

/** Pagamento em atraso? (data do pagamento após o vencimento). */
export function isAtrasado(vencimento: string, dataPagamento: string): boolean {
  const v = ymdNum(vencimento);
  const p = ymdNum(dataPagamento);
  return v != null && p != null && p > v;
}

// ─────────────────── Módulo 2 — grade de parcelas e cheques ─────────────────

/**
 * Uma linha da grade editável de parcelas (item 2.1).
 *
 * `bancoContaId` nasce herdado do cabeçalho do lançamento (item 2.2) e só é
 * editado na exceção — parcela paga por outra conta. Os campos de cheque ficam
 * na própria parcela porque a numeração é por cheque, não por compra (item 2.5).
 */
export interface LinhaParcela {
  numero: number;
  vencimento: string;
  valor: number;
  forma: string;
  bancoContaId: string | null;
  numeroCheque: string | null;
  emitenteCheque: string | null;
  status: string;
}

/** Status de parcela por forma de pagamento (item 2.1). */
export function statusDisponiveis(forma: string): string[] {
  // Cheque tem ciclo próprio: ele é compensado ou devolvido, não simplesmente
  // "pago". Confundir os dois esconde a devolução, que é o evento que importa.
  if (forma === "Cheque") return ["Pendente", "Compensado", "Devolvido", "Cancelado"];
  return ["Pendente", "Pago", "Cancelado"];
}

/**
 * MODO A (top-down) — total informado, dividido em `qtd` parcelas.
 *
 * A diferença de arredondamento vai para a última parcela, então a soma fecha
 * exatamente com o total (RG-08). Os vencimentos usam o ajuste de fim de mês:
 * "todo dia 31" cai em 30/04 e em 28/02, sem contaminar os meses seguintes.
 */
export function gerarParcelasMensais(
  valorTotal: number,
  qtd: number,
  dataBase: string,
  diaVencimento?: number,
): { vencimento: string; valor: number }[] {
  const n = Math.max(1, Math.trunc(qtd));
  const valores = distribuirValor(valorTotal, n);
  const datas = serieVencimentos(dataBase, n, 1, diaVencimento);
  return valores.map((valor, i) => ({ vencimento: datas[i] ?? dataBase, valor }));
}

/**
 * MODO B (bottom-up) — total do PED é a SOMA das parcelas de valores livres.
 *
 * O PED carrega sempre o custo total da compra; o fracionamento vive nas
 * parcelas (item 2.3).
 */
export function totalDasParcelas(parcelas: { valor: number }[]): number {
  return round2(parcelas.reduce((a, p) => a + (Number(p.valor) || 0), 0));
}

/** Diferença entre a soma das parcelas e o total declarado (item 2.6). */
export function diferencaFechamento(
  valorTotal: number,
  parcelas: { valor: number }[],
): number {
  return round2(totalDasParcelas(parcelas) - valorTotal);
}

/**
 * O parcelamento fecha com o total? Tolerância de R$ 0,01 por parcela — é o
 * limite de arredondamento aceitável, e não uma folga de digitação.
 */
export function parcelamentoFecha(
  valorTotal: number,
  parcelas: { valor: number }[],
): boolean {
  const tolerancia = Math.max(0.01, parcelas.length * 0.01);
  return Math.abs(diferencaFechamento(valorTotal, parcelas)) <= tolerancia + 1e-9;
}

/**
 * Joga a diferença na ÚLTIMA parcela — atalho "Ajustar na última parcela" da
 * barra de divergência (item 2.6). Devolve uma cópia; não muta a entrada.
 */
export function ajustarNaUltimaParcela<T extends { valor: number }>(
  valorTotal: number,
  parcelas: T[],
): T[] {
  if (parcelas.length === 0) return [];
  const out = parcelas.map((p) => ({ ...p }));
  const dif = diferencaFechamento(valorTotal, out);
  const ultima = out[out.length - 1];
  ultima.valor = round2(ultima.valor - dif);
  return out;
}

/**
 * Preenche números de cheque a partir de um inicial (item 2.5).
 *
 * É só uma conveniência: qualquer linha continua editável depois, porque
 * talões reais têm numeração irregular e cheques de terceiro entram fora de
 * sequência. Preserva a largura do número informado ("000450" → "000451").
 */
export function preencherSequenciaCheques(
  inicial: string,
  qtd: number,
): string[] {
  const m = inicial.trim().match(/^(\D*)(\d+)$/);
  if (!m) return Array.from({ length: qtd }, () => inicial.trim());
  const [, prefixo, digitos] = m;
  const largura = digitos.length;
  const base = Number(digitos);
  return Array.from({ length: qtd }, (_, i) =>
    `${prefixo}${String(base + i).padStart(largura, "0")}`,
  );
}

/**
 * Cheques duplicados dentro do lançamento: mesmo banco/conta + mesmo número.
 *
 * Gera ALERTA, nunca bloqueio (item 2.5): talões de contas distintas podem
 * repetir numeração. Devolve os números repetidos.
 */
export function chequesDuplicados(
  parcelas: { bancoContaId: string | null; numeroCheque: string | null; forma: string }[],
): string[] {
  const vistos = new Map<string, number>();
  for (const p of parcelas) {
    if (p.forma !== "Cheque" || !p.numeroCheque?.trim()) continue;
    const chave = `${p.bancoContaId ?? "sem-conta"}|${p.numeroCheque.trim()}`;
    vistos.set(chave, (vistos.get(chave) ?? 0) + 1);
  }
  return [...vistos]
    .filter(([, n]) => n > 1)
    .map(([chave]) => chave.split("|")[1]);
}

/**
 * Item 2.7 — recorrente e parcelado são coisas diferentes e não se combinam.
 *
 *   recorrente  → replica o MESMO custo em competências futuras (aluguel,
 *                 salário, seguro). Gera N despesas, uma por competência.
 *   parcelado   → fraciona o pagamento de um custo ÚNICO já incorrido. Gera UMA
 *                 despesa na competência da compra e N saídas de caixa.
 *
 * Marcar os dois replicaria a despesa na DRE por competência de parcela, que é
 * erro de competência (RG-01).
 */
export function conflitoRecorrenteParcelado(
  recorrente: boolean,
  temParcelamento: boolean,
): boolean {
  return recorrente && temParcelamento;
}

/** Quantas linhas a DRE recebe de uma despesa parcelada: sempre UMA (CA-13). */
export function linhasDreDeParcelamento(): number {
  return 1;
}
