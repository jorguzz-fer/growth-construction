/**
 * Horizonte de tempo padrão das telas de planejamento/relatórios.
 *
 * Janela MÓVEL relativa à data de hoje: sempre percorre 2 anos para trás e
 * 5 anos para frente (competências "MM/YYYY"). Cada tela de tempo une este
 * horizonte aos meses efetivamente presentes nos dados, de modo que o eixo
 * nunca fica menor que a janela — e nenhum mês com dado fora dela é perdido.
 *
 * Observação: a correção INCC é aplicada por mês (getIncc); meses fora da
 * tabela INCC apenas recebem 0% de correção (sem quebrar cálculos).
 */
export const HORIZON_MONTHS_BACK = 24; // 2 anos
export const HORIZON_MONTHS_FWD = 60; // 5 anos

/** Índice absoluto de mês (ano*12 + mês0) → competência "MM/YYYY". */
function idxToKey(idx: number): string {
  const y = Math.floor(idx / 12);
  const m = (idx % 12) + 1;
  return `${String(m).padStart(2, "0")}/${y}`;
}

/**
 * Lista de competências "MM/YYYY" do horizonte padrão: de (hoje − `back`
 * meses) até (hoje + `fwd` meses), inclusive.
 */
export function horizonMonths(
  today: Date = new Date(),
  back: number = HORIZON_MONTHS_BACK,
  fwd: number = HORIZON_MONTHS_FWD,
): string[] {
  const base = today.getFullYear() * 12 + today.getMonth(); // mês atual (0-based)
  const out: string[] = [];
  for (let i = base - back; i <= base + fwd; i++) out.push(idxToKey(i));
  return out;
}
