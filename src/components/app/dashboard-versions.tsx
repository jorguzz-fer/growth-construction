"use client";

import { useRouter } from "next/navigation";
import { useTransition } from "react";

interface V {
  id: string;
  label: string;
  color: string;
}

/**
 * Seletor de versões do Dashboard — independente da versão ativa. Permite
 * escolher de 1 a 3 versões; a seleção vai para a URL (?v=id1,id2,id3).
 */
export function DashboardVersions({
  versions,
  selected,
}: {
  versions: V[];
  selected: string[];
}) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const sel = new Set(selected);

  const apply = (ids: string[]) => {
    start(() => router.push(`/dashboard?v=${ids.join(",")}`));
  };

  const toggle = (id: string) => {
    const next = new Set(sel);
    if (next.has(id)) {
      if (next.size <= 1) return; // mantém ao menos 1
      next.delete(id);
    } else {
      if (next.size >= 3) return; // no máximo 3
      next.add(id);
    }
    apply(versions.filter((v) => next.has(v.id)).map((v) => v.id));
  };

  return (
    <div className="mb-6 flex flex-wrap items-center gap-3 rounded-[12px] border border-[var(--color-accent2)]/12 bg-[var(--color-surface)] px-4 py-3">
      <span className="font-[family-name:var(--font-mono)] text-[10px] uppercase tracking-[0.14em] text-[var(--color-ink3)]">
        Versões:
      </span>
      <div className="flex flex-wrap gap-2">
        {versions.map((v) => {
          const active = sel.has(v.id);
          const atLimit = !active && sel.size >= 3;
          return (
            <button
              key={v.id}
              onClick={() => toggle(v.id)}
              disabled={pending || atLimit}
              className={`inline-flex items-center gap-2 rounded-full px-3 py-1.5 text-[13px] font-medium transition-colors disabled:opacity-40 ${
                active
                  ? "text-[var(--color-ink)]"
                  : "text-[var(--color-ink3)] hover:text-[var(--color-ink)]"
              }`}
              style={
                active
                  ? { background: `${v.color}1a`, boxShadow: `inset 0 0 0 1px ${v.color}55` }
                  : { background: "var(--color-surface3)" }
              }
            >
              <span
                className="inline-block h-2.5 w-2.5 rounded-full"
                style={{ background: v.color }}
              />
              {v.label}
            </button>
          );
        })}
      </div>
      <span className="ml-auto font-[family-name:var(--font-mono)] text-[11px] text-[var(--color-ink3)]">
        {sel.size}/3 selecionadas
      </span>
    </div>
  );
}
