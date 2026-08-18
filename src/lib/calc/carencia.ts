/**
 * Datas de vencimento: ajuste de fim de mês e carência — itens 2.4 e 6.2.
 *
 * Duas regras que o sistema não tinha:
 *
 * 1. **Fim de mês.** "Todo dia 30" precisa cair em 28/29 de fevereiro e o dia 31
 *    precisa cair em 30 nos meses de 30 dias. O expansor de recebíveis montava a
 *    data com o dia ORIGINAL no mês deslocado, produzindo strings como
 *    "04/31/2026" — data que não existe no calendário. Somar 30 dias também não
 *    resolve: desloca o dia de vencimento a cada mês.
 * 2. **Carência.** O intervalo entre a data-base (ato/contrato) e a primeira
 *    mensal precisa ser explícito, e não um número que emerge do que o usuário
 *    digitou em dois campos independentes.
 *
 * Todas as datas usam o formato interno da aplicação, "MM/DD/YYYY".
 */

export interface DataPartes {
  mo: number;
  d: number;
  yr: number;
}

/** "MM/DD/YYYY" → partes. `null` quando vazio ou malformado. */
export function parseDataInterna(s: string | null | undefined): DataPartes | null {
  if (!s || !s.trim()) return null;
  const p = s.split("/");
  if (p.length !== 3) return null;
  const mo = Number(p[0]);
  const d = Number(p[1]);
  const yr = Number(p[2]);
  if (!Number.isInteger(mo) || !Number.isInteger(d) || !Number.isInteger(yr)) return null;
  if (mo < 1 || mo > 12 || d < 1 || d > 31 || yr < 1900) return null;
  return { mo, d, yr };
}

/** Partes → "MM/DD/YYYY". */
export function formatDataInterna(p: DataPartes): string {
  return `${String(p.mo).padStart(2, "0")}/${String(p.d).padStart(2, "0")}/${p.yr}`;
}

/** Último dia do mês (trata ano bissexto). */
export function ultimoDiaDoMes(mo: number, yr: number): number {
  // Dia 0 do mês seguinte = último dia deste mês.
  return new Date(Date.UTC(yr, mo, 0)).getUTCDate();
}

/**
 * Data com o `diaDesejado` no mês/ano informados, encolhida para o último dia
 * quando o mês não tem esse dia.
 *
 * "todo dia 31" em abril vira 30/04; em fevereiro de 2027 vira 28/02; em
 * fevereiro de 2028 (bissexto) vira 29/02.
 */
export function ajustaDiaFimDeMes(mo: number, yr: number, diaDesejado: number): DataPartes {
  const ultimo = ultimoDiaDoMes(mo, yr);
  return { mo, yr, d: Math.min(Math.max(1, diaDesejado), ultimo) };
}

/**
 * Avança `n` meses a partir de uma data-base, preservando o dia desejado e
 * encolhendo-o quando o mês de destino não o tem.
 *
 * O dia desejado é sempre o da data-base — encolher num mês curto NÃO
 * "contamina" os meses seguintes: dia 31 → 28/02 → 31/03, e não 28/03.
 */
export function avancaMeses(base: DataPartes, n: number, diaDesejado?: number): DataPartes {
  const total = base.mo - 1 + n;
  const mo = ((total % 12) + 12) % 12 + 1;
  const yr = base.yr + Math.floor(total / 12);
  return ajustaDiaFimDeMes(mo, yr, diaDesejado ?? base.d);
}

/**
 * Série de vencimentos mensais (ou de passo `passoMeses`) a partir da data-base.
 *
 * `qtd` parcelas, todas com o mesmo dia de vencimento, ajustado ao fim de mês.
 */
export function serieVencimentos(
  dataBase: string,
  qtd: number,
  passoMeses = 1,
  diaVencimento?: number,
): string[] {
  const base = parseDataInterna(dataBase);
  if (!base || qtd <= 0) return [];
  const dia = diaVencimento ?? base.d;
  const out: string[] = [];
  for (let i = 0; i < qtd; i++) {
    out.push(formatDataInterna(avancaMeses(base, i * passoMeses, dia)));
  }
  return out;
}

/**
 * Diferença em MESES entre duas datas internas (ignora o dia).
 *
 * É a medida certa para carência: de 11/02/2026 até 20/01/2027 são 11 meses,
 * independentemente de o dia ter mudado de 11 para 20.
 */
export function intervaloMeses(de: string | null, ate: string | null): number {
  const a = parseDataInterna(de);
  const b = parseDataInterna(ate);
  if (!a || !b) return 0;
  return (b.yr - a.yr) * 12 + (b.mo - a.mo);
}

/**
 * Data da primeira parcela a partir da data-base e da carência (item 6.2).
 *
 * Carência 1 = primeira parcela um mês depois da data-base, que é o padrão de
 * mercado. Carência 0 = no mesmo mês.
 */
export function dataPrimeiraParcela(
  dataBase: string,
  carenciaMeses: number,
  diaVencimento?: number,
): string | null {
  const base = parseDataInterna(dataBase);
  if (!base) return null;
  return formatDataInterna(avancaMeses(base, Math.max(0, carenciaMeses), diaVencimento));
}

/**
 * A primeira parcela está mais distante da data-base do que a carência
 * configurada? Serve ao ALERTA do item 6.3 — que nunca bloqueia nem corrige.
 */
export function carenciaDivergente(
  dataBase: string | null,
  primeiraParcela: string | null,
  carenciaEsperadaMeses: number,
): boolean {
  if (!dataBase || !primeiraParcela) return false;
  return intervaloMeses(dataBase, primeiraParcela) > carenciaEsperadaMeses;
}
