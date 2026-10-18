/**
 * Semana do Fluxo de Caixa (Prompt AD2, Fase 3 · revisão V5: "uma visão
 * semanal do fluxo de caixa"). Módulo PURO.
 *
 * Regras (BAD2-1, decididas no prompt):
 *  - a semana começa na **segunda-feira**; a chave da semana é a data da
 *    segunda, "YYYY-MM-DD" (ordena como texto);
 *  - data completa "MM/DD/YYYY" cai na semana que a contém;
 *  - só competência "MM/YYYY" (sem dia — parcela de planejamento, permuta
 *    parcelada) cai na **semana do dia 1º** daquele mês.
 */

const DIA_MS = 86_400_000;

function utc(y: number, m: number, d: number): Date {
  return new Date(Date.UTC(y, m - 1, d));
}

function iso(d: Date): string {
  return d.toISOString().slice(0, 10);
}

/** Segunda-feira da semana de uma data (UTC, sem fuso). */
export function segundaDe(d: Date): Date {
  const dow = d.getUTCDay(); // 0 = domingo
  const recuo = dow === 0 ? 6 : dow - 1;
  return new Date(d.getTime() - recuo * DIA_MS);
}

/** "MM/DD/YYYY" ou "MM/YYYY" → chave da semana "YYYY-MM-DD"; inválida → null. */
export function semanaDe(data: string | null | undefined): string | null {
  if (!data) return null;
  const p = data.split("/").map((x) => Number(x));
  if (p.some((n) => !Number.isFinite(n))) return null;
  let d: Date;
  if (p.length === 3) {
    const [m, dia, y] = p;
    if (m < 1 || m > 12 || dia < 1 || dia > 31 || y < 1900) return null;
    d = utc(y, m, dia);
    // 02/31 e afins: Date rola para o mês seguinte; rejeita.
    if (d.getUTCMonth() !== m - 1) return null;
  } else if (p.length === 2) {
    const [m, y] = p;
    if (m < 1 || m > 12 || y < 1900) return null;
    d = utc(y, m, 1);
  } else return null;
  return iso(segundaDe(d));
}

/** Chave da semana de hoje (ou de `agora`). */
export function semanaDeHoje(agora: Date = new Date()): string {
  return iso(segundaDe(utc(agora.getUTCFullYear(), agora.getUTCMonth() + 1, agora.getUTCDate())));
}

/** Soma `n` semanas a uma chave ("YYYY-MM-DD"). */
export function somarSemanas(chave: string, n: number): string {
  const [y, m, d] = chave.split("-").map(Number);
  return iso(new Date(utc(y, m, d).getTime() + n * 7 * DIA_MS));
}

/** `n` semanas consecutivas a partir de `inicio` (inclusive). */
export function janelaDeSemanas(inicio: string, n: number): string[] {
  return Array.from({ length: Math.max(0, n) }, (_, i) => somarSemanas(inicio, i));
}

/** "2026-10-12" → "12/10 – 18/10/2026" (segunda a domingo). */
export function rotuloDaSemana(chave: string): string {
  const [y, m, d] = chave.split("-").map(Number);
  const ini = utc(y, m, d);
  const fim = new Date(ini.getTime() + 6 * DIA_MS);
  const dd = (x: Date) => String(x.getUTCDate()).padStart(2, "0");
  const mm = (x: Date) => String(x.getUTCMonth() + 1).padStart(2, "0");
  return `${dd(ini)}/${mm(ini)} – ${dd(fim)}/${mm(fim)}/${fim.getUTCFullYear()}`;
}

/** A chave é uma segunda-feira válida "YYYY-MM-DD"? (valida `?sem=` da URL) */
export function ehChaveDeSemana(s: string | null | undefined): s is string {
  if (!s || !/^\d{4}-\d{2}-\d{2}$/.test(s)) return false;
  const [y, m, d] = s.split("-").map(Number);
  const dt = utc(y, m, d);
  return iso(dt) === s && dt.getUTCDay() === 1;
}

export interface LinhaSemanal {
  semana: string;
  rotulo: string;
  entradas: number;
  saidas: number;
  saldoSemana: number;
  realE: number;
  realS: number;
  /** Acumulado pelo PREVISTO, desde o saldo de partida (como na visão mensal). */
  acumulado: number;
  atual: boolean;
}

/**
 * Linhas da janela. O acumulado parte de `saldoInicial` e soma o previsto de
 * TODAS as semanas anteriores à janela — a janela é um recorte, o saldo não
 * recomeça nela.
 */
export function linhasSemanais(
  janela: readonly string[],
  previsto: { entradas: Record<string, number>; saidas: Record<string, number> },
  realizado: { entradas: Record<string, number>; saidas: Record<string, number> },
  saldoInicial: number,
  hoje: string = semanaDeHoje(),
): LinhaSemanal[] {
  if (janela.length === 0) return [];
  const primeira = janela[0];
  const chaves = new Set([...Object.keys(previsto.entradas), ...Object.keys(previsto.saidas)]);
  let acumulado = saldoInicial;
  for (const k of chaves) {
    if (k < primeira) acumulado += (previsto.entradas[k] ?? 0) - (previsto.saidas[k] ?? 0);
  }
  return janela.map((semana) => {
    const entradas = previsto.entradas[semana] ?? 0;
    const saidas = previsto.saidas[semana] ?? 0;
    acumulado += entradas - saidas;
    return {
      semana,
      rotulo: rotuloDaSemana(semana),
      entradas,
      saidas,
      saldoSemana: entradas - saidas,
      realE: realizado.entradas[semana] ?? 0,
      realS: realizado.saidas[semana] ?? 0,
      acumulado,
      atual: semana === hoje,
    };
  });
}
