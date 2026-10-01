"use client";

import { useEffect, useId, useMemo, useRef, useState } from "react";
import { cn } from "@/lib/utils";
import { Label } from "@/components/ui/input";

/**
 * Seleção múltipla para filtros (Prompt R, seção 5). Fechado, mostra o
 * resumo ("Todos", o nome quando é um só, "3 selecionados"); aberto, lista com
 * caixinhas, busca quando há muitos itens, e marcar/desmarcar todos. Teclado:
 * o botão abre com Enter/Espaço, as caixas são `<input type="checkbox">`
 * nativas (Tab/Espaço), Escape fecha. Nenhum marcado = todos.
 */
export interface OpcaoMulti {
  value: string;
  label: string;
}

export function MultiSelect({ label, options, value, onChange, buscaAPartirDe = 8, className }: { label: string; options: OpcaoMulti[]; value: string[]; onChange: (v: string[]) => void; buscaAPartirDe?: number; className?: string }) {
  const [aberto, setAberto] = useState(false);
  const [busca, setBusca] = useState("");
  const raiz = useRef<HTMLDivElement>(null);
  const id = useId();
  const selecionados = new Set(value);

  useEffect(() => {
    if (!aberto) return;
    const fora = (e: MouseEvent) => {
      if (raiz.current && !raiz.current.contains(e.target as Node)) setAberto(false);
    };
    const tecla = (e: KeyboardEvent) => {
      if (e.key === "Escape") setAberto(false);
    };
    document.addEventListener("mousedown", fora);
    document.addEventListener("keydown", tecla);
    return () => {
      document.removeEventListener("mousedown", fora);
      document.removeEventListener("keydown", tecla);
    };
  }, [aberto]);

  const visiveis = useMemo(() => {
    const q = busca.trim().toLowerCase();
    return q ? options.filter((o) => o.label.toLowerCase().includes(q)) : options;
  }, [options, busca]);

  const resumo =
    value.length === 0 ? "Todos" : value.length === 1 ? (options.find((o) => o.value === value[0])?.label ?? value[0]) : `${value.length} selecionados`;

  const alternar = (v: string) => {
    const next = new Set(selecionados);
    if (next.has(v)) next.delete(v);
    else next.add(v);
    onChange([...next]);
  };

  return (
    <div ref={raiz} className={cn("relative", className)}>
      <Label htmlFor={id}>{label}</Label>
      <button
        id={id}
        type="button"
        aria-haspopup="listbox"
        aria-expanded={aberto}
        onClick={() => setAberto((a) => !a)}
        className={cn(
          "flex h-9 w-full items-center justify-between gap-2 rounded-[8px] border border-[var(--color-accent2)]/20 bg-white px-3 text-left text-sm text-[var(--color-ink)] outline-none transition-colors focus:border-[var(--color-accent2)] focus:ring-2 focus:ring-[var(--color-accent2)]/20",
          value.length > 0 && "border-[var(--color-accent2)]/60",
        )}
      >
        <span className="truncate">{resumo}</span>
        <span aria-hidden className="text-[var(--color-ink3)]">
          {aberto ? "▴" : "▾"}
        </span>
      </button>
      {aberto && (
        <div role="group" aria-label={label} className="absolute left-0 z-20 mt-1 w-full min-w-[220px] rounded-[10px] border border-[var(--color-line)] bg-white p-2 shadow-lg">
          {options.length >= buscaAPartirDe && (
            <input value={busca} onChange={(e) => setBusca(e.target.value)} placeholder="Buscar…" aria-label={`Buscar em ${label}`} className="mb-2 h-8 w-full rounded-[6px] border border-[var(--color-line)] px-2 text-[12px] outline-none focus:border-[var(--color-accent2)]" />
          )}
          <div className="mb-1 flex gap-3 text-[11px]">
            <button type="button" className="text-[var(--color-accent2)] hover:underline" onClick={() => onChange([...new Set([...value, ...visiveis.map((o) => o.value)])])}>
              Marcar todos
            </button>
            <button type="button" className="text-[var(--color-accent2)] hover:underline" onClick={() => onChange(value.filter((v) => !visiveis.some((o) => o.value === v)))}>
              Desmarcar todos
            </button>
          </div>
          <ul className="max-h-56 space-y-0.5 overflow-auto">
            {visiveis.map((o) => (
              <li key={o.value}>
                <label className="flex cursor-pointer items-center gap-2 rounded-[6px] px-1.5 py-1 text-[12.5px] text-[var(--color-ink2)] hover:bg-[var(--color-surface2)]">
                  <input type="checkbox" checked={selecionados.has(o.value)} onChange={() => alternar(o.value)} className="h-4 w-4 accent-[var(--color-accent2)]" />
                  <span className="truncate">{o.label}</span>
                </label>
              </li>
            ))}
            {visiveis.length === 0 && <li className="px-1.5 py-1 text-[12px] text-[var(--color-ink3)]">Nada encontrado.</li>}
          </ul>
        </div>
      )}
    </div>
  );
}
