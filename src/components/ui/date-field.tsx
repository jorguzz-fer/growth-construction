"use client";

import { useEffect, useRef, useState } from "react";
import { cn, toISODate, fromISODate } from "@/lib/utils";

// ── helpers de formatação (interno MM/DD/YYYY ↔ exibição DD/MM/AAAA) ──────
const toBR = (internal: string) => {
  const p = (internal || "").split("/");
  return p.length === 3 ? `${p[1].padStart(2, "0")}/${p[0].padStart(2, "0")}/${p[2]}` : "";
};
const fromBR = (br: string): string | null => {
  const m = br.trim().match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
  if (!m) return null;
  const d = Number(m[1]);
  const mo = Number(m[2]);
  if (d < 1 || d > 31 || mo < 1 || mo > 12) return null;
  return `${String(mo).padStart(2, "0")}/${String(d).padStart(2, "0")}/${m[3]}`;
};

const monthToBR = (internal: string) => {
  const p = (internal || "").split("/");
  return p.length === 2 ? `${p[0].padStart(2, "0")}/${p[1]}` : "";
};
const monthFromBR = (br: string): string | null => {
  const m = br.trim().match(/^(\d{1,2})\/(\d{4})$/);
  if (!m) return null;
  const mo = Number(m[1]);
  if (mo < 1 || mo > 12) return null;
  return `${String(mo).padStart(2, "0")}/${m[2]}`;
};
const monthToISO = (internal: string) => {
  const p = (internal || "").split("/");
  return p.length === 2 ? `${p[1]}-${p[0].padStart(2, "0")}` : "";
};
const monthFromISO = (iso: string) => {
  const p = (iso || "").split("-");
  return p.length === 2 ? `${p[1]}/${p[0]}` : "";
};

interface BaseProps {
  name?: string;
  value?: string;
  defaultValue?: string;
  onChange?: (internal: string) => void;
  disabled?: boolean;
  id?: string;
  required?: boolean;
  className?: string;
}

/**
 * Campo de data: exibe/digita SEMPRE em DD/MM/AAAA e mantém o valor interno em
 * "MM/DD/YYYY". O botão de calendário abre o Date Picker nativo (moderno,
 * acessível) via showPicker(); a digitação é permitida como recurso
 * complementar. Uso controlado (`value`+`onChange`) ou em <form> (`name`).
 */
export function DateField(props: BaseProps) {
  return (
    <PickerField
      {...props}
      display={toBR}
      parse={fromBR}
      toNativeISO={toISODate}
      fromNativeISO={fromISODate}
      nativeType="date"
      placeholder="dd/mm/aaaa"
    />
  );
}

/**
 * Campo de competência/mês: exibe/digita em MM/AAAA e mantém o valor interno em
 * "MM/YYYY". Botão abre o seletor de mês nativo.
 */
export function MonthField(props: BaseProps) {
  return (
    <PickerField
      {...props}
      display={monthToBR}
      parse={monthFromBR}
      toNativeISO={monthToISO}
      fromNativeISO={monthFromISO}
      nativeType="month"
      placeholder="mm/aaaa"
    />
  );
}

function PickerField({
  name,
  value,
  defaultValue,
  onChange,
  disabled,
  id,
  required,
  className,
  display,
  parse,
  toNativeISO,
  fromNativeISO,
  nativeType,
  placeholder,
}: BaseProps & {
  display: (internal: string) => string;
  parse: (text: string) => string | null;
  toNativeISO: (internal: string) => string;
  fromNativeISO: (iso: string) => string;
  nativeType: "date" | "month";
  placeholder: string;
}) {
  const controlled = value !== undefined;
  const [state, setState] = useState(defaultValue ?? "");
  const internal = controlled ? value ?? "" : state;
  const [text, setText] = useState(display(internal));
  const nativeRef = useRef<HTMLInputElement>(null);

  // Sincroniza o texto quando o valor interno muda por fora (edição controlada).
  useEffect(() => {
    setText(display(internal));
  }, [internal, display]);

  const commit = (next: string) => {
    if (!controlled) setState(next);
    onChange?.(next);
  };

  const onText = (raw: string) => {
    setText(raw);
    if (raw.trim() === "") return commit("");
    const parsed = parse(raw);
    if (parsed !== null) commit(parsed);
  };

  const openPicker = () => {
    const el = nativeRef.current;
    if (!el) return;
    if (typeof el.showPicker === "function") el.showPicker();
    else el.focus();
  };

  return (
    <div className={cn("relative flex items-stretch", className)}>
      {name && <input type="hidden" name={name} value={internal} />}
      <input
        type="text"
        id={id}
        inputMode="numeric"
        required={required}
        disabled={disabled}
        value={text}
        placeholder={placeholder}
        onChange={(e) => onText(e.target.value)}
        onBlur={() => setText(display(internal))}
        className="h-9 w-full rounded-l-[8px] border border-r-0 border-[var(--color-accent2)]/20 bg-white px-3 text-sm text-[var(--color-ink)] outline-none transition-colors focus:border-[var(--color-accent2)] focus:ring-2 focus:ring-[var(--color-accent2)]/20"
      />
      <button
        type="button"
        aria-label="Abrir calendário"
        disabled={disabled}
        onClick={openPicker}
        className="flex h-9 w-9 shrink-0 items-center justify-center rounded-r-[8px] border border-[var(--color-accent2)]/20 bg-[var(--color-surface2)] text-[var(--color-ink3)] transition-colors hover:bg-[var(--color-surface3)] disabled:opacity-50"
      >
        📅
      </button>
      {/* Date Picker nativo (só o popup) — ancorado ao botão, sem exibir texto. */}
      <input
        ref={nativeRef}
        type={nativeType}
        tabIndex={-1}
        aria-hidden
        disabled={disabled}
        value={toNativeISO(internal)}
        onChange={(e) => commit(fromNativeISO(e.target.value))}
        className="pointer-events-none absolute bottom-0 right-0 h-0 w-9 opacity-0"
      />
    </div>
  );
}
