import type { InccRow } from "./types";

/**
 * Recalcula o acumulado encadeado a partir das variações mensais (`mo`).
 * Espelha `recalcINCC()` do protótipo: o primeiro mês usa a própria variação;
 * os seguintes compõem `(1+ac/100)*(1+mo/100)`. Retorna uma NOVA lista
 * (função pura) — não muta a entrada.
 */
export function recalcIncc(rows: readonly InccRow[]): InccRow[] {
  let acc = 0;
  return rows.map((row, i) => {
    acc =
      i === 0
        ? row.mo
        : Math.round(((1 + acc / 100) * (1 + row.mo / 100) * 100 - 100) * 1000) /
          1000;
    return { ...row, ac: acc };
  });
}

/** Retorna o acumulado de um mês ("MM/YYYY"), ou 0 se ausente. */
export function getIncc(rows: readonly InccRow[], month: string): number {
  const row = rows.find((r) => r.m === month);
  return row ? row.ac : 0;
}

/**
 * Preenche as variações mensais dos meses projetados (`projected === true`) com
 * a média móvel das últimas 12 variações (oficiais ou já projetadas), na ordem
 * cronológica. Meses oficiais (índice real) nunca são alterados. Depois
 * recalcula o acumulado encadeado de toda a série. Função pura.
 */
export function projectIncc(rows: readonly InccRow[]): InccRow[] {
  const out: InccRow[] = rows.map((r) => ({ ...r }));
  for (let i = 0; i < out.length; i++) {
    if (!out[i].projected) continue;
    const window = out.slice(Math.max(0, i - 12), i);
    if (window.length === 0) continue; // sem histórico → mantém valor atual
    const avg = window.reduce((a, r) => a + r.mo, 0) / window.length;
    out[i].mo = Math.round(avg * 1000) / 1000;
  }
  return recalcIncc(out);
}
