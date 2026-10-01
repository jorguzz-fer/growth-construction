/**
 * Resultado da revenda do bem recebido em permuta (Prompt P, 4.1; Prompt I,
 * §57.4.3; decisão BP-3 de 30/09/2026). Puro, sem banco.
 *
 * O bem é ATIVO: entra no inventário pelo valor estimado. Quando é revendido,
 * o que entra no resultado é o GANHO OU A PERDA — valor da venda menos o
 * valor pelo qual o bem entrou — nunca o valor cheio da venda, que é caixa.
 *
 * Onde isto entra: a DRE continua lendo `permutaRevenueByMonth` (valor cheio)
 * até a I-9 ligar a chave única das seções 54/56/57 (§57.7). Até lá, estas
 * funções alimentam a PRÉVIA na tela de Permuta e os testes.
 *
 * BP-2 (o status governa): `apenasVendidos` é o filtro que a chave vai
 * aplicar antes de qualquer cálculo de revenda — hoje `permutaCashByMonth`
 * lê valor e data de venda sem olhar o status.
 */
import { parseDate, monthKey } from "./projection";
import type { MonthlyProjection } from "./types";

export interface CalcPermutaRevenda {
  estimado: number;
  status: string;
  valorVenda: number;
  dataVenda: string;
  formaVenda: string;
  dataPrimParcela: string;
}

/** BP-2: só o que está marcado como vendido conta como revenda. */
export function apenasVendidos<T extends { status: string }>(rows: readonly T[]): T[] {
  return rows.filter((r) => (r.status || "").trim() === "Vendido");
}

/** Ganho (+) ou perda (−) de um ativo revendido: venda − entrada. Sem venda, zero. */
export function resultadoDaRevenda(r: Pick<CalcPermutaRevenda, "estimado" | "valorVenda" | "status">): number {
  if ((r.status || "").trim() !== "Vendido" || !(r.valorVenda > 0)) return 0;
  return Math.round((r.valorVenda - (r.estimado || 0)) * 100) / 100;
}

/**
 * Resultado das revendas por mês ("MM/YYYY"), na competência da venda (ou
 * da 1ª parcela, se a data da venda faltar) — à vista, parcelada e escambo
 * entram do mesmo jeito: a troca realiza o resultado sem caixa (BP-3).
 * Perdas aparecem negativas; meses sem revenda não aparecem.
 */
export function permutaGanhoByMonth(rows: readonly CalcPermutaRevenda[]): MonthlyProjection {
  const out: MonthlyProjection = {};
  for (const r of apenasVendidos(rows)) {
    const resultado = resultadoDaRevenda(r);
    if (resultado === 0) continue;
    const d = parseDate(r.dataVenda) ?? parseDate(r.dataPrimParcela);
    if (!d) continue;
    const k = monthKey(d.mo, d.yr);
    out[k] = Math.round(((out[k] || 0) + resultado) * 100) / 100;
  }
  return out;
}

/** Totais da prévia na tela: quanto a DRE mostra hoje (valor cheio) × o que a §57 define (resultado). */
export function previaDaRevenda(rows: readonly CalcPermutaRevenda[]): { valorCheio: number; resultado: number; revendidos: number } {
  const vendidos = apenasVendidos(rows).filter((r) => r.valorVenda > 0);
  return {
    valorCheio: Math.round(vendidos.reduce((a, r) => a + r.valorVenda, 0) * 100) / 100,
    resultado: Math.round(vendidos.reduce((a, r) => a + resultadoDaRevenda(r), 0) * 100) / 100,
    revendidos: vendidos.length,
  };
}
