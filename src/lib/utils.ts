import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

/** Combina classes condicionais e resolve conflitos do Tailwind. */
export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

/**
 * Evita o "-0"/"-0,00": se o valor arredondado na precisão exibida é zero,
 * retorna 0 positivo. Sem isso, valores como -0,004 viram "-R$ 0,00".
 */
export function clampZero(value: number, decimals = 2): number {
  if (!Number.isFinite(value)) return 0;
  const f = 10 ** decimals;
  return Math.round(value * f) === 0 ? 0 : value;
}

/** Formata um número como moeda BRL (ex.: R$ 1.234,56). */
export function brl(value: number): string {
  return new Intl.NumberFormat("pt-BR", {
    style: "currency",
    currency: "BRL",
  }).format(clampZero(value, 2));
}

/** BRL sem casas decimais (ex.: R$ 1.235). */
export function brl0(value: number): string {
  return new Intl.NumberFormat("pt-BR", {
    style: "currency",
    currency: "BRL",
    maximumFractionDigits: 0,
  }).format(clampZero(value, 0));
}

/** Percentual com 1 casa, sem "-0,0%" (ex.: 12,3%). */
export function pct1(value: number): string {
  const v = clampZero(value, 1);
  return `${v.toFixed(1).replace(".", ",")}%`;
}

/**
 * BRL compacto em milhares/milhões (ex.: R$ 46,8 mi). Implementação
 * determinística (sem Intl compact) para evitar divergência de formatação
 * entre servidor (Node/ICU) e navegador — que causava hydration mismatch
 * (ex.: "R$ 0,0" vs "R$ 0").
 */
export function brlk(value: number): string {
  const v = clampZero(value, 0);
  const sign = v < 0 ? "-" : "";
  const abs = Math.abs(v);
  const fix1 = (v: number) => (Math.round(v * 10) / 10).toFixed(1).replace(".", ",");
  if (abs >= 1e9) return `${sign}R$ ${fix1(abs / 1e9)} bi`;
  if (abs >= 1e6) return `${sign}R$ ${fix1(abs / 1e6)} mi`;
  if (abs >= 1e3) return `${sign}R$ ${fix1(abs / 1e3)} mil`;
  return `${sign}R$ ${Math.round(abs)}`;
}

// ─────────────────────────────── datas ──────────────────────────────────
// Armazenamento interno: "MM/DD/YYYY" (datas) e "MM/YYYY" (meses). Exibição
// padronizada em DD/MM/AAAA. Os helpers abaixo convertem sem alterar o dado.

/** "MM/DD/YYYY" → "DD/MM/YYYY"; "MM/YYYY" → "MM/YYYY"; vazio/invalid → "—". */
export function dateBR(s: string | null | undefined): string {
  if (!s) return "—";
  const p = s.trim().split("/");
  if (p.length === 3) return `${p[1].padStart(2, "0")}/${p[0].padStart(2, "0")}/${p[2]}`;
  if (p.length === 2) return `${p[0].padStart(2, "0")}/${p[1]}`;
  return s;
}

/** "MM/DD/YYYY" → "YYYY-MM-DD" (valor de <input type="date">); vazio → "". */
export function toISODate(s: string | null | undefined): string {
  if (!s) return "";
  const p = s.trim().split("/");
  if (p.length !== 3) return "";
  const [mo, d, y] = p;
  if (!mo || !d || !y) return "";
  return `${y}-${mo.padStart(2, "0")}-${d.padStart(2, "0")}`;
}

/** "YYYY-MM-DD" → "MM/DD/YYYY" (formato interno); vazio → "". */
export function fromISODate(iso: string | null | undefined): string {
  if (!iso) return "";
  const p = iso.trim().split("-");
  if (p.length !== 3) return "";
  const [y, mo, d] = p;
  return `${mo}/${d}/${y}`;
}

/** "MM/DD/YYYY" → número YYYYMMDD (comparável); null se inválido. */
export function ymd(s: string | null | undefined): number | null {
  if (!s) return null;
  const p = s.trim().split("/");
  if (p.length !== 3) return null;
  const [mo, d, y] = p.map(Number);
  if (!y || !mo || !d) return null;
  return y * 10000 + mo * 100 + d;
}

/** "MM/YYYY" → número YYYYMM (comparável); null se inválido. */
export function ym(s: string | null | undefined): number | null {
  if (!s) return null;
  const p = s.trim().split("/");
  if (p.length === 2) {
    const [mo, y] = p.map(Number);
    return y && mo ? y * 100 + mo : null;
  }
  if (p.length === 3) {
    const [mo, , y] = p.map(Number);
    return y && mo ? y * 100 + mo : null;
  }
  return null;
}

/** Verdadeiro se a DATA "MM/DD/YYYY" está no intervalo [de, ate] (inclusive). */
export function dateInRange(
  data: string | null | undefined,
  de: string,
  ate: string,
): boolean {
  const v = ymd(data);
  const lo = ymd(de);
  const hi = ymd(ate);
  if (lo != null && (v == null || v < lo)) return false;
  if (hi != null && (v == null || v > hi)) return false;
  return true;
}

/** Verdadeiro se o MÊS "MM/YYYY" está no intervalo [de, ate] (por competência). */
export function monthInRange(
  mes: string | null | undefined,
  de: string,
  ate: string,
): boolean {
  const v = ym(mes);
  const lo = ym(de);
  const hi = ym(ate);
  if (lo != null && (v == null || v < lo)) return false;
  if (hi != null && (v == null || v > hi)) return false;
  return true;
}

/**
 * Número de série da data no padrão de planilha — INT(Data): dias desde
 * 1899-12-30 (mesma convenção do Excel/Sheets). Aceita "MM/DD/YYYY" (formato
 * usado no protótipo). Retorna null quando a data é inválida.
 */
export function excelSerial(dateStr: string | null | undefined): number | null {
  if (!dateStr) return null;
  const m = dateStr.trim().match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
  if (!m) return null;
  const month = Number(m[1]);
  const day = Number(m[2]);
  const year = Number(m[3]);
  if (month < 1 || month > 12 || day < 1 || day > 31) return null;
  const ms = Date.UTC(year, month - 1, day) - Date.UTC(1899, 11, 30);
  return Math.round(ms / 86_400_000);
}
