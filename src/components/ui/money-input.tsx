"use client";

import { useEffect, useState } from "react";
import { cn } from "@/lib/utils";

/**
 * Formata centavos (inteiro) no padrão brasileiro: 100050 → "1.000,50".
 * Sempre com duas casas decimais.
 */
function fmtCents(cents: number): string {
  const neg = cents < 0;
  const abs = Math.abs(Math.trunc(cents));
  const s = String(abs).padStart(3, "0");
  const int = s.slice(0, -2);
  const dec = s.slice(-2);
  const intFmt = int.replace(/\B(?=(\d{3})+(?!\d))/g, ".");
  return (neg ? "-" : "") + intFmt + "," + dec;
}

/** Valor canônico (reais) → centavos inteiros. "1000.5" → 100050. */
function valueToCents(v: string | number): number {
  const n =
    typeof v === "number" ? v : parseFloat(String(v).replace(/\s/g, "").replace(",", "."));
  if (!isFinite(n) || n === 0) return 0;
  return Math.round(n * 100);
}

const toDisplay = (v: string | number): string =>
  v === "" || v === null || v === undefined ? "" : fmtCents(valueToCents(v));

/**
 * Campo monetário com formatação automática no padrão BR enquanto o usuário
 * digita (estilo "acumulador de centavos"): digitar 100000 exibe 1.000,00.
 * O `onChange` emite o valor canônico em reais (ponto decimal, ex.: "1000").
 */
export function MoneyInput({
  value,
  onChange,
  disabled,
  placeholder = "0,00",
  className,
  name,
  "aria-label": ariaLabel,
}: {
  value: string | number;
  onChange: (v: string) => void;
  disabled?: boolean;
  placeholder?: string;
  className?: string;
  name?: string;
  "aria-label"?: string;
}) {
  const [text, setText] = useState(() => toDisplay(value));

  // Sincroniza a exibição quando o valor muda por fora (import, IA, reset).
  useEffect(() => {
    setText(toDisplay(value));
  }, [value]);

  const handle = (raw: string) => {
    const digitsOnly = raw.replace(/\D/g, "");
    if (digitsOnly === "") {
      setText("");
      onChange("");
      return;
    }
    const cents = Number(digitsOnly);
    setText(fmtCents(cents));
    onChange(String(cents / 100));
  };

  return (
    <>
      {name && (
        <input
          type="hidden"
          name={name}
          value={value === "" || value === null || value === undefined ? "" : String(value)}
        />
      )}
      <input
        type="text"
        inputMode="numeric"
        aria-label={ariaLabel}
        disabled={disabled}
        value={text}
        placeholder={placeholder}
        onChange={(e) => handle(e.target.value)}
        className={cn(
          "h-9 w-full rounded-[8px] border border-[var(--color-accent2)]/20 bg-white px-3 text-right text-sm text-[var(--color-ink)] outline-none transition-colors placeholder:text-[var(--color-ink4)] focus:border-[var(--color-accent2)] focus:ring-2 focus:ring-[var(--color-accent2)]/20 disabled:opacity-60",
          className,
        )}
      />
    </>
  );
}
