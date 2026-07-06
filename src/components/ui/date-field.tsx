"use client";

import * as React from "react";
import { useState } from "react";
import { cn, toISODate, fromISODate } from "@/lib/utils";

/**
 * Campo de data com calendário (Date Picker nativo) — exibe/entra em DD/MM/AAAA
 * conforme o locale e mantém o valor interno em "MM/DD/YYYY" (formato usado
 * pela camada de cálculo). Digitação permanece possível pelo próprio controle.
 *
 * Uso controlado: `value` + `onChange(internal)`.
 * Uso em <form>: passe `name` — um <input hidden> carrega o valor interno.
 */
export function DateField({
  name,
  value,
  defaultValue,
  onChange,
  disabled,
  id,
  required,
  className,
}: {
  name?: string;
  value?: string;
  defaultValue?: string;
  onChange?: (internal: string) => void;
  disabled?: boolean;
  id?: string;
  required?: boolean;
  className?: string;
}) {
  const controlled = value !== undefined;
  const [state, setState] = useState(defaultValue ?? "");
  const internal = controlled ? value ?? "" : state;

  const handle = (iso: string) => {
    const next = fromISODate(iso);
    if (!controlled) setState(next);
    onChange?.(next);
  };

  return (
    <>
      {name && <input type="hidden" name={name} value={internal} />}
      <input
        type="date"
        id={id}
        lang="pt-BR"
        value={toISODate(internal)}
        disabled={disabled}
        required={required}
        onChange={(e) => handle(e.target.value)}
        className={cn(
          "h-9 w-full rounded-[8px] border border-[var(--color-accent2)]/20 bg-white px-3 text-sm text-[var(--color-ink)] outline-none transition-colors focus:border-[var(--color-accent2)] focus:ring-2 focus:ring-[var(--color-accent2)]/20",
          className,
        )}
      />
    </>
  );
}

/** "MM/YYYY" → "YYYY-MM" (valor de <input type="month">). */
const monthToISO = (s: string) => {
  const p = (s || "").split("/");
  return p.length === 2 ? `${p[1]}-${p[0].padStart(2, "0")}` : "";
};
/** "YYYY-MM" → "MM/YYYY" (formato interno de competência). */
const monthFromISO = (iso: string) => {
  const p = (iso || "").split("-");
  return p.length === 2 ? `${p[1]}/${p[0]}` : "";
};

/**
 * Campo de mês/competência com seletor (Date Picker de mês). Valor interno em
 * "MM/YYYY". Mesma API do DateField (controlado ou via `name`).
 */
export function MonthField({
  name,
  value,
  defaultValue,
  onChange,
  disabled,
  id,
  required,
  className,
}: {
  name?: string;
  value?: string;
  defaultValue?: string;
  onChange?: (internal: string) => void;
  disabled?: boolean;
  id?: string;
  required?: boolean;
  className?: string;
}) {
  const controlled = value !== undefined;
  const [state, setState] = useState(defaultValue ?? "");
  const internal = controlled ? value ?? "" : state;

  const handle = (iso: string) => {
    const next = monthFromISO(iso);
    if (!controlled) setState(next);
    onChange?.(next);
  };

  return (
    <>
      {name && <input type="hidden" name={name} value={internal} />}
      <input
        type="month"
        id={id}
        lang="pt-BR"
        value={monthToISO(internal)}
        disabled={disabled}
        required={required}
        onChange={(e) => handle(e.target.value)}
        className={cn(
          "h-9 w-full rounded-[8px] border border-[var(--color-accent2)]/20 bg-white px-3 text-sm text-[var(--color-ink)] outline-none transition-colors focus:border-[var(--color-accent2)] focus:ring-2 focus:ring-[var(--color-accent2)]/20",
          className,
        )}
      />
    </>
  );
}
