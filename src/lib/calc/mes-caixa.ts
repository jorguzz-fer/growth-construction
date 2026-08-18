/**
 * Atribuição do MÊS de um lançamento no fluxo de caixa — RG-01.
 *
 * Vive isolada das queries de propósito: é a função que decide em que mês cada
 * valor cai, tanto no fluxo PREVISTO (que recebe o vencimento) quanto no
 * REALIZADO (que recebe a data de liquidação). Sendo pura, pode ser testada
 * diretamente — `fluxo-caixa.ts` importa banco e sessão e não é testável assim.
 */

/** "MM/DD/YYYY" → "MM/YYYY" (mês do vencimento ou da liquidação). */
export function vencMonth(d: string | null): string | null {
  if (!d) return null;
  const p = d.split("/");
  if (p.length === 3) return `${p[0]}/${p[2]}`;
  if (p.length === 2) return d;
  return null;
}
