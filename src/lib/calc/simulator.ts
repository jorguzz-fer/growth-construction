import { getIncc } from "./incc";
import type { InccRow } from "./types";

export type FinancingType = "SAC" | "PRICE" | "SBPE";

/**
 * Simulador de unidade (Prompt N) — função PURA, sem I/O. Não grava nada,
 * não lê cliente nem plano: só recebe a tabela INCC e os números digitados.
 *
 * Regras (seção 2):
 *  - 2.1 o veredito de renda compara a MAIOR parcela do fluxo com o limite;
 *  - 2.2 a correção INCC vale para os três tipos (opção 1), a partir da 5ª
 *    parcela, pelo acumulado do mês do vencimento — como o plano de pagamento;
 *  - 2.3 a taxa de juros é entrada (premissa mensal), não constante;
 *  - 2.4 entrada efetiva, recursos futuros e financiamento são indicadores
 *    separados; o % de entrada usa a efetiva;
 *  - 2.5/2.6 o fluxo tem tantas linhas quanto parcelas (teto declarado), e a
 *    amortização para quando o saldo zera — nunca parcela negativa;
 *  - 2.7 cada reforço tem o mês informado; fora do plano é recusado;
 *  - 2.8 a evolução de obra vem da janela da obra quando há; senão é premissa
 *    linear, rotulada.
 */

export const INCC_FROM_INSTALLMENT = 4; // correção a partir da 5ª parcela (i >= 4)
/** Teto de linhas do fluxo, declarado na tela (2.5). */
export const MAX_PARCELAS = 480;
/** Limite de comprometimento de renda (30 %). */
export const LIMITE_RENDA = 0.3;
/** Taxa padrão até haver outro padrão (BN-2): 1 % ao mês, premissa. */
export const TAXA_MENSAL_PADRAO = 0.01;

export interface Reforco {
  valor: number;
  /** Mês do plano em que entra (1 = primeiro mês). */
  mes: number;
}

export interface SimulatorInput {
  tipo: FinancingType;
  valorImovel: number;
  /** Entrada no mês 1. */
  entrada: number;
  /** Sinais (reforços até o início do plano). */
  s1: Reforco;
  s2: Reforco;
  s3: Reforco;
  /** Reforços futuros. */
  anual1: Reforco;
  anual2: Reforco;
  /** nº de parcelas mensais (inteiro > 0). */
  mensais: number;
  fgts: Reforco;
  subsidio: Reforco;
  financiamento: number;
  renda: number;
  /** data ISO "YYYY-MM-DD" da primeira parcela. */
  dataInicio: string;
  /** Juros ao mês (fração: 0.01 = 1 %). Premissa, não taxa de contrato (BN-2). */
  taxaMensal: number;
  /**
   * Janela da obra ("MM/YYYY" início e fim) para a evolução (2.8). Sem ela, a
   * evolução é premissa linear ao longo das parcelas, rotulada.
   */
  janelaObra?: { inicio: string; fim: string } | null;
}

export interface SimulatorMonth {
  /** 1..mensais */
  n: number;
  /** "MM/YYYY" */
  mm: string;
  /** evolução de obra acumulada (%) */
  evolucao: number;
  /** INCC acumulado do mês (%) */
  inccAc: number;
  /** parcela antes da correção (amortização + juros, ou fixa, ou saldo/n) */
  parcBase: number;
  /** correção INCC aplicada nesta parcela (R$) */
  correcao: number;
  /** juros embutidos na parcela (R$; SAC e PRICE) */
  juros: number;
  /** parcela corrigida (parcBase + correcao) */
  parcTotal: number;
  /** reforços do mês (entrada, sinais, anuais, FGTS, subsídio) */
  especial: number;
  total: number;
}

export interface SimulatorResult {
  /** 2.4 · o que entra até o início do plano: entrada + sinais. */
  entradaEfetiva: number;
  /** 2.4 · anuais, FGTS e subsídio, com o mês de cada um. */
  recursosFuturos: { nome: string; valor: number; mes: number }[];
  totalRecursosFuturos: number;
  financiamento: number;
  /** % de entrada sobre o valor do imóvel, pela entrada efetiva. */
  pctEntrada: number;
  /** saldo a parcelar: valor − entrada efetiva − recursos futuros − financiamento. */
  saldoMensal: number;
  /** parcela base (saldo ÷ n), referência. */
  parcMensal: number;
  /** 2.1 · a maior parcela do fluxo (sem os reforços). */
  maiorParcela: number;
  mesDaMaiorParcela: number;
  /** limite de comprometimento de renda (30 %). */
  maxParcela: number;
  /** 2.1 · a MAIOR parcela cabe no limite? */
  dentroLimite: boolean;
  /** 2.8 · "obra" (janela cadastrada) ou "premissa" (linear nas parcelas). */
  origemDaEvolucao: "obra" | "premissa";
  meses: SimulatorMonth[];
  /** 4.3 · resumo do fluxo. */
  totalPago: number;
  totalJuros: number;
  totalCorrecao: number;
}

const round2 = (v: number) => Math.round(v * 100) / 100;
const ordDoMes = (mes: string) => {
  const [m, y] = mes.split("/").map(Number);
  return y * 12 + (m - 1);
};

/** 3.3/2.7 · motivos para recusar a entrada; vazio quando está em ordem. */
export function validarSimulacao(input: SimulatorInput): string[] {
  const erros: string[] = [];
  const num = (v: number, nome: string) => {
    if (!Number.isFinite(v)) erros.push(`${nome}: informe um número.`);
    else if (v < 0) erros.push(`${nome}: não pode ser negativo.`);
  };
  num(input.valorImovel, "Valor do imóvel");
  num(input.entrada, "Entrada");
  num(input.financiamento, "Financiamento");
  num(input.renda, "Renda mensal");
  if (!Number.isFinite(input.taxaMensal) || input.taxaMensal < 0) erros.push("Juros ao mês: informe um percentual maior ou igual a zero.");
  if (!Number.isInteger(input.mensais) || input.mensais <= 0) erros.push("Nº de mensais: informe um inteiro maior que zero.");
  else if (input.mensais > MAX_PARCELAS) erros.push(`Nº de mensais: no máximo ${MAX_PARCELAS}.`);
  const reforcos: [string, Reforco][] = [
    ["Sinal 1", input.s1],
    ["Sinal 2", input.s2],
    ["Sinal 3", input.s3],
    ["Anual 1", input.anual1],
    ["Anual 2", input.anual2],
    ["FGTS", input.fgts],
    ["Subsídio", input.subsidio],
  ];
  for (const [nome, r] of reforcos) {
    num(r.valor, nome);
    if (r.valor > 0) {
      if (!Number.isInteger(r.mes) || r.mes < 1) erros.push(`${nome}: informe o mês (1 ou mais).`);
      else if (Number.isInteger(input.mensais) && input.mensais > 0 && r.mes > input.mensais) erros.push(`${nome}: mês ${r.mes} está além do plano de ${input.mensais} parcelas.`);
    }
  }
  if (!/^\d{4}-\d{2}-\d{2}$/.test(input.dataInicio)) erros.push("Data de início: informe uma data.");
  return erros;
}

/** Mês do plano em que termina a "entrada": o último sinal com valor (ou 1). */
function fimDaEntrada(input: SimulatorInput): number {
  return Math.max(1, ...[input.s1, input.s2, input.s3].filter((r) => r.valor > 0).map((r) => r.mes));
}

export function simulate(input: SimulatorInput, incc: readonly InccRow[] = []): SimulatorResult {
  const { tipo, valorImovel, entrada, mensais, financiamento, renda, dataInicio } = input;
  const taxa = Number.isFinite(input.taxaMensal) && input.taxaMensal >= 0 ? input.taxaMensal : TAXA_MENSAL_PADRAO;
  const n = Number.isInteger(mensais) && mensais > 0 ? Math.min(mensais, MAX_PARCELAS) : 0;

  // 2.4 — entrada efetiva × recursos futuros × financiamento.
  const inicioDoPlano = fimDaEntrada(input);
  const sinais = [input.s1, input.s2, input.s3].filter((r) => r.valor > 0 && r.mes <= inicioDoPlano);
  const entradaEfetiva = round2(entrada + sinais.reduce((a, r) => a + r.valor, 0));
  const futuros = (
    [
      ["Sinal 1", input.s1],
      ["Sinal 2", input.s2],
      ["Sinal 3", input.s3],
      ["Anual 1", input.anual1],
      ["Anual 2", input.anual2],
      ["FGTS", input.fgts],
      ["Subsídio", input.subsidio],
    ] as [string, Reforco][]
  )
    .filter(([, r]) => r.valor > 0 && !sinais.includes(r))
    .map(([nome, r]) => ({ nome, valor: r.valor, mes: r.mes }))
    .sort((a, b) => a.mes - b.mes);
  const totalRecursosFuturos = round2(futuros.reduce((a, r) => a + r.valor, 0));
  const saldoMensal = Math.max(0, round2(valorImovel - entradaEfetiva - totalRecursosFuturos - financiamento));
  const parcMensal = n > 0 ? saldoMensal / n : 0;
  const pctEntrada = valorImovel > 0 ? (entradaEfetiva / valorImovel) * 100 : 0;
  const maxParcela = renda * LIMITE_RENDA;

  // 2.8 — evolução: janela da obra quando há; senão premissa linear nas parcelas.
  const janela = input.janelaObra && input.janelaObra.inicio && input.janelaObra.fim ? { ini: ordDoMes(input.janelaObra.inicio), fim: ordDoMes(input.janelaObra.fim) } : null;
  const origemDaEvolucao: SimulatorResult["origemDaEvolucao"] = janela && janela.fim > janela.ini ? "obra" : "premissa";

  const start = new Date(dataInicio);
  const especialPorMes = new Map<number, number>();
  const add = (r: Reforco) => {
    if (r.valor > 0) especialPorMes.set(r.mes, (especialPorMes.get(r.mes) ?? 0) + r.valor);
  };
  if (entrada > 0) especialPorMes.set(1, entrada);
  for (const r of [input.s1, input.s2, input.s3, input.anual1, input.anual2, input.fgts, input.subsidio]) add(r);

  // PRICE: parcela fixa pela fórmula de anuidade (taxa zero → saldo/n).
  const parcelaPrice = n > 0 ? (taxa > 0 ? (saldoMensal * (taxa * Math.pow(1 + taxa, n))) / (Math.pow(1 + taxa, n) - 1) : saldoMensal / n) : 0;
  const amort = n > 0 ? saldoMensal / n : 0;

  const meses: SimulatorMonth[] = [];
  let saldoDevedor = saldoMensal;
  let maiorParcela = 0;
  let mesDaMaiorParcela = 0;
  let totalJuros = 0;
  let totalCorrecao = 0;
  let totalPago = 0;
  for (let i = 0; i < n; i++) {
    const d = new Date(start);
    d.setMonth(d.getMonth() + i);
    const mm = String(d.getMonth() + 1).padStart(2, "0") + "/" + d.getFullYear();
    const inccAc = getIncc(incc, mm);
    let evolucao: number;
    if (origemDaEvolucao === "obra" && janela) {
      const ord = d.getFullYear() * 12 + d.getMonth();
      evolucao = Math.max(0, Math.min(100, ((ord - janela.ini + 1) / (janela.fim - janela.ini + 1)) * 100));
    } else {
      evolucao = Math.min(100, ((i + 1) / n) * 100);
    }

    let parcBase: number;
    let juros = 0;
    if (tipo === "SAC") {
      // 2.6 — amortiza até o saldo zerar; nunca negativo.
      const amortizacao = Math.min(amort, saldoDevedor);
      juros = saldoDevedor * taxa;
      parcBase = amortizacao + juros;
      saldoDevedor = Math.max(0, saldoDevedor - amortizacao);
    } else if (tipo === "PRICE") {
      juros = saldoDevedor * taxa;
      parcBase = Math.min(parcelaPrice, saldoDevedor + juros);
      saldoDevedor = Math.max(0, saldoDevedor - (parcBase - juros));
    } else {
      parcBase = parcMensal;
      saldoDevedor = Math.max(0, saldoDevedor - parcMensal);
    }
    // 2.2 — correção nos três tipos, a partir da 5ª parcela, pelo acumulado do mês.
    const correcao = i >= INCC_FROM_INSTALLMENT ? parcBase * (inccAc / 100) : 0;
    const parcTotal = parcBase + correcao;
    const especial = especialPorMes.get(i + 1) ?? 0;
    if (parcTotal > maiorParcela) {
      maiorParcela = parcTotal;
      mesDaMaiorParcela = i + 1;
    }
    totalJuros += juros;
    totalCorrecao += correcao;
    totalPago += parcTotal + especial;
    meses.push({ n: i + 1, mm, evolucao, inccAc, parcBase, correcao, juros, parcTotal, especial, total: parcTotal + especial });
  }
  // Reforços além do fluxo (plano com menos parcelas que o mês informado) não
  // entram no total: a validação já os recusa; aqui só não se inventa linha.

  return {
    entradaEfetiva,
    recursosFuturos: futuros,
    totalRecursosFuturos,
    financiamento,
    pctEntrada,
    saldoMensal,
    parcMensal,
    maiorParcela,
    mesDaMaiorParcela,
    maxParcela,
    dentroLimite: maiorParcela <= maxParcela,
    origemDaEvolucao,
    meses,
    totalPago: round2(totalPago),
    totalJuros: round2(totalJuros),
    totalCorrecao: round2(totalCorrecao),
  };
}
