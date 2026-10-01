"use client";

import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useState, useTransition } from "react";
import { proximaSelecao } from "@/lib/dashboard-tela";

export interface VersionOpt {
  id: string;
  label: string;
  color: string;
  /** Prompt H (BH-3): "Rascunho — não entra nos totais" quando a regra está ligada. */
  aviso?: string | null;
  /** Prompt AA, 1.4: marca da versão (ex.: "cópia", por `source_version_id`). */
  marca?: string | null;
}

/**
 * Seletor de 1 a 3 versões para comparação nos relatórios. Persiste em `vs`
 * (ids separados por vírgula) na URL, preservando os demais parâmetros.
 */
export function VersionMultiSelect({
  versions,
  selected,
  max = 3,
  noLimite = "trocar",
}: {
  versions: VersionOpt[];
  selected: string[];
  max?: number;
  /**
   * Prompt AA, 1.4: "avisar" mantém a seleção e diz por quê ao tentar passar
   * do limite; "trocar" (padrão das outras telas) troca a mais antiga.
   */
  noLimite?: "trocar" | "avisar";
}) {
  const [avisoDoLimite, setAvisoDoLimite] = useState<string | null>(null);
  const router = useRouter();
  const pathname = usePathname();
  const sp = useSearchParams();
  const [pending, start] = useTransition();

  const toggle = (id: string) => {
    if (noLimite === "avisar") {
      const r = proximaSelecao(selected, id, max);
      setAvisoDoLimite(r.aviso);
      if (r.aviso) return;
      const params = new URLSearchParams(sp.toString());
      params.set("vs", r.proxima.join(","));
      start(() => router.push(`${pathname}?${params.toString()}`));
      return;
    }
    let next: string[];
    if (selected.includes(id)) {
      next = selected.filter((x) => x !== id);
      if (next.length === 0) next = [id]; // mantém pelo menos uma
    } else {
      next = selected.length >= max ? [...selected.slice(1), id] : [...selected, id];
    }
    const params = new URLSearchParams(sp.toString());
    params.set("vs", next.join(","));
    start(() => router.push(`${pathname}?${params.toString()}`));
  };

  return (
    <div className="flex flex-wrap items-center gap-1.5">
      <span className="font-[family-name:var(--font-mono)] text-[10px] uppercase tracking-wide text-[var(--color-ink3)]">
        Versões
      </span>
      {versions.map((v) => {
        const on = selected.includes(v.id);
        return (
          <button
            key={v.id}
            disabled={pending}
            onClick={() => toggle(v.id)}
            className={`flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-[12px] transition-colors ${
              on
                ? "border-[var(--color-accent2)] bg-[var(--color-accent4)] text-[var(--color-ink)]"
                : "border-[var(--color-accent2)]/20 text-[var(--color-ink3)] hover:bg-[var(--color-surface2)]"
            }`}
          >
            <span className="inline-block h-2.5 w-2.5 rounded-full" style={{ background: v.color }} />
            {v.label}
            {v.marca && (
              <span className="rounded-full bg-[var(--color-surface3)] px-1.5 py-0.5 text-[10px] font-medium text-[var(--color-ink2)]">{v.marca}</span>
            )}
            {v.aviso && (
              <span className="rounded-full bg-[#fef3c7] px-1.5 py-0.5 text-[10px] font-medium text-[#92400e]" title="Versão de planejamento ainda não Aprovada: selecionável, mas não soma nos relatórios enquanto a regra estiver ligada.">
                {v.aviso}
              </span>
            )}
          </button>
        );
      })}
      <span className="text-[11px] text-[var(--color-ink4)]">(até {max})</span>
      {avisoDoLimite && (
        <span role="status" className="w-full text-[11px] text-[var(--color-warning)]" data-aviso-limite>
          {avisoDoLimite}
        </span>
      )}
    </div>
  );
}
