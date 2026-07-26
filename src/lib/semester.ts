/**
 * Semestres-calendário (Jan–Jun = H1, Jul–Dez = H2) — base do backup periódico.
 *
 * A visualização do app NÃO remove dados antigos; o backup é apenas uma cópia
 * de segurança oferecida a cada virada de semestre. Estas funções são puras
 * (sem acesso a banco) e trabalham com competências "MM/YYYY" e datas.
 */

export interface SemesterInfo {
  key: string; // "2026-H1"
  year: number;
  half: 1 | 2;
  label: string; // "1º semestre de 2026 (Jan–Jun)"
  months: string[]; // ["01/2026", …, "06/2026"]
  start: Date; // primeiro instante do semestre
  end: Date; // último instante do semestre
}

const MESES_H1 = "Jan–Jun";
const MESES_H2 = "Jul–Dez";

/** Chave do semestre de uma data (H1 = Jan–Jun, H2 = Jul–Dez). */
export function semesterKeyOf(date: Date): string {
  const y = date.getFullYear();
  const h = date.getMonth() < 6 ? 1 : 2;
  return `${y}-H${h}`;
}

/** Semestre corrente (aberto) relativo a `today`. */
export function currentSemesterKey(today: Date = new Date()): string {
  return semesterKeyOf(today);
}

/** Semestre imediatamente anterior a `key`. */
export function previousSemesterKey(key: string): string {
  const info = semesterInfo(key);
  if (!info) return key;
  return info.half === 1 ? `${info.year - 1}-H2` : `${info.year}-H1`;
}

/** Último semestre JÁ ENCERRADO (o anterior ao corrente). */
export function lastClosedSemesterKey(today: Date = new Date()): string {
  return previousSemesterKey(currentSemesterKey(today));
}

/** Semestre de uma competência "MM/YYYY" (ou null se inválida). */
export function semesterOfMonthKey(mk: string): string | null {
  const p = mk.split("/");
  if (p.length !== 2) return null;
  const m = Number(p[0]);
  const y = Number(p[1]);
  if (!m || !y || m < 1 || m > 12) return null;
  return `${y}-H${m <= 6 ? 1 : 2}`;
}

/** Detalhes de um semestre a partir da chave "YYYY-H1"/"YYYY-H2". */
export function semesterInfo(key: string): SemesterInfo | null {
  const m = key.match(/^(\d{4})-H([12])$/);
  if (!m) return null;
  const year = Number(m[1]);
  const half = Number(m[2]) as 1 | 2;
  const firstMonth = half === 1 ? 1 : 7; // 1-based
  const months: string[] = [];
  for (let i = 0; i < 6; i++) {
    months.push(`${String(firstMonth + i).padStart(2, "0")}/${year}`);
  }
  const start = new Date(year, firstMonth - 1, 1, 0, 0, 0, 0);
  // Último dia do 6º mês, 23:59:59.999.
  const end = new Date(year, firstMonth - 1 + 6, 0, 23, 59, 59, 999);
  return {
    key,
    year,
    half,
    label: `${half}º semestre de ${year} (${half === 1 ? MESES_H1 : MESES_H2})`,
    months,
    start,
    end,
  };
}

/** Índice ordinal de um semestre (para comparar/ordenar). */
export function semesterOrdinal(key: string): number {
  const info = semesterInfo(key);
  if (!info) return 0;
  return info.year * 2 + (info.half - 1);
}

/** Lista de chaves de semestre de `fromKey` até `toKey` (inclusive). */
export function enumSemesters(fromKey: string, toKey: string): string[] {
  const a = semesterOrdinal(fromKey);
  const b = semesterOrdinal(toKey);
  if (!a || !b) return [];
  const [lo, hi] = a <= b ? [a, b] : [b, a];
  const out: string[] = [];
  for (let o = lo; o <= hi; o++) {
    const year = Math.floor(o / 2);
    const half = (o % 2) + 1;
    out.push(`${year}-H${half}`);
  }
  return out;
}

/** Uma data "MM/DD/YYYY" (formato interno) cai dentro do semestre? */
export function internalDateInSemester(d: string | null, info: SemesterInfo): boolean {
  if (!d) return false;
  const p = d.split("/");
  if (p.length !== 3) return false;
  const [mo, day, y] = p.map(Number);
  if (!y || !mo || !day) return false;
  const t = new Date(y, mo - 1, day).getTime();
  return t >= info.start.getTime() && t <= info.end.getTime();
}
