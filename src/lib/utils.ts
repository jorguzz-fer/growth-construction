import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

/** Combina classes condicionais e resolve conflitos do Tailwind. */
export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

/** Formata um número como moeda BRL (ex.: R$ 1.234,56). */
export function brl(value: number): string {
  return new Intl.NumberFormat("pt-BR", {
    style: "currency",
    currency: "BRL",
  }).format(value);
}

/** BRL sem casas decimais (ex.: R$ 1.235). */
export function brl0(value: number): string {
  return new Intl.NumberFormat("pt-BR", {
    style: "currency",
    currency: "BRL",
    maximumFractionDigits: 0,
  }).format(value);
}

/** BRL compacto em milhares/milhões (ex.: R$ 46,8 mi). */
export function brlk(value: number): string {
  return new Intl.NumberFormat("pt-BR", {
    style: "currency",
    currency: "BRL",
    notation: "compact",
    maximumFractionDigits: 1,
  }).format(value);
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
