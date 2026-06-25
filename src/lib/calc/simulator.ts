import { getIncc } from "./incc";
import type { InccRow } from "./types";

export type FinancingType = "SAC" | "PRICE" | "SBPE";

export interface SimulatorInput {
  tipo: FinancingType;
  valorImovel: number;
  entrada: number;
  s1: number;
  s2: number;
  s3: number;
  anual1: number;
  anual2: number;
  /** nº de parcelas mensais */
  mensais: number;
  fgts: number;
  subsidio: number;
  financiamento: number;
  renda: number;
  /** data ISO "YYYY-MM-DD" */
  dataInicio: string;
}

export interface SimulatorMonth {
  /** 1..36 */
  n: number;
  /** "MM/YYYY" */
  mm: string;
  /** evolução de obra acumulada (%) */
  evolucao: number;
  /** INCC acumulado do mês (%) */
  inccAc: number;
  parcBase: number;
  parcComIncc: number;
  parcTotal: number;
  especial: number;
  total: number;
}

export interface SimulatorResult {
  totalEntrada: number;
  saldoMensal: number;
  parcMensal: number;
  pctEntrada: number;
  /** limite de 30% de comprometimento de renda */
  maxParcela: number;
  /** parcela mensal cabe no limite de 30%? */
  dentroLimite: boolean;
  meses: SimulatorMonth[];
}

const MESES_FLUXO = 36; // evolução de obra linear em 36 meses
const TAXA_MENSAL = 0.01; // 1% a.m.
const INCC_FROM_INSTALLMENT = 4; // a partir da 5ª parcela

/**
 * Simulação de financiamento de uma unidade (SAC / PRICE / SBPE), portada de
 * `pgSimulador()` do protótipo. Gera o fluxo de 36 meses com evolução de obra
 * linear e correção INCC a partir da 5ª parcela. Ver docs/SPEC.md §7.2.
 */
export function simulate(
  input: SimulatorInput,
  incc: readonly InccRow[] = [],
): SimulatorResult {
  const {
    tipo,
    valorImovel,
    entrada,
    s1,
    s2,
    s3,
    anual1,
    anual2,
    mensais,
    fgts,
    subsidio,
    financiamento,
    renda,
    dataInicio,
  } = input;

  const totalEntrada =
    entrada + s1 + s2 + s3 + anual1 + anual2 + fgts + subsidio + financiamento;
  const saldoMensal = Math.max(0, valorImovel - totalEntrada);
  const parcMensal = mensais > 0 ? saldoMensal / mensais : 0;
  const pctEntrada = valorImovel > 0 ? (totalEntrada / valorImovel) * 100 : 0;
  const maxParcela = renda * 0.3;

  const start = new Date(dataInicio);
  const meses: SimulatorMonth[] = [];

  for (let i = 0; i < MESES_FLUXO; i++) {
    const d = new Date(start);
    d.setMonth(d.getMonth() + i);
    const mm = String(d.getMonth() + 1).padStart(2, "0") + "/" + d.getFullYear();
    const inccAc = getIncc(incc, mm);
    const evolucao = Math.min(100, (i + 1) * (100 / MESES_FLUXO));

    const parcBase = parcMensal;
    const parcComIncc =
      i >= INCC_FROM_INSTALLMENT ? parcBase * (1 + inccAc / 100) : parcBase;

    let parcSAC = 0;
    let parcPRICE = 0;
    if (tipo === "SAC") {
      const amort = mensais > 0 ? saldoMensal / mensais : 0;
      const saldoAtual = saldoMensal - amort * i;
      parcSAC = saldoAtual * TAXA_MENSAL + amort; // juros simplificado 1% a.m.
    } else if (tipo === "PRICE") {
      parcPRICE =
        mensais > 0
          ? (saldoMensal *
              (TAXA_MENSAL * Math.pow(1 + TAXA_MENSAL, mensais))) /
            (Math.pow(1 + TAXA_MENSAL, mensais) - 1)
          : 0;
    }

    let especial = 0;
    if (i === 0) especial = entrada;
    else if (i === 1) especial = s1;
    else if (i === 2) especial = s2;
    else if (i === 3) especial = s3;
    else if (i === 11) especial = anual1;
    else if (i === 23) especial = anual2;

    const parcTotal =
      tipo === "SAC" ? parcSAC : tipo === "PRICE" ? parcPRICE : parcComIncc;

    meses.push({
      n: i + 1,
      mm,
      evolucao,
      inccAc,
      parcBase,
      parcComIncc,
      parcTotal,
      especial,
      total: parcTotal + especial,
    });
  }

  return {
    totalEntrada,
    saldoMensal,
    parcMensal,
    pctEntrada,
    maxParcela,
    dentroLimite: parcMensal <= maxParcela,
    meses,
  };
}
