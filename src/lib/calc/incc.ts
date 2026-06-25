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
