"use client";

import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useTransition } from "react";
import { CENARIOS, ROTULO_CENARIO, type Cenario } from "@/lib/dre";

/**
 * Cenários lado a lado na DRE da Empresa toda (Prompt AC, 1.2): Orçamento,
 * Previsão Atualizada e Realizado. Cada coluna soma, por projeto, a versão
 * daquele cenário NAQUELE projeto. Persiste em `cen`; o antigo `vkind` sai.
 */
export function CenarioMultiSelect({ selected }: { selected: Cenario[] }) {
  const router = useRouter();
  const pathname = usePathname();
  const sp = useSearchParams();
  const [pending, start] = useTransition();
  const toggle = (c: Cenario) => {
    let next = selected.includes(c) ? selected.filter((x) => x !== c) : [...selected, c];
    if (next.length === 0) next = [c];
    const params = new URLSearchParams(sp.toString());
    params.set("cen", CENARIOS.filter((x) => next.includes(x)).join(","));
    params.delete("vkind");
    start(() => router.push(`${pathname}?${params.toString()}`));
  };
  return (
    <div className="flex flex-wrap items-center gap-1.5">
      <span className="font-[family-name:var(--font-mono)] text-[10px] uppercase tracking-wide text-[var(--color-ink3)]">Cenários</span>
      {CENARIOS.map((c) => {
        const on = selected.includes(c);
        return (
          <button
            key={c}
            type="button"
            disabled={pending}
            aria-pressed={on}
            onClick={() => toggle(c)}
            className={`rounded-full border px-2.5 py-1 text-[12px] transition-colors ${
              on
                ? "border-[var(--color-accent2)] bg-[var(--color-accent4)] text-[var(--color-ink)]"
                : "border-[var(--color-accent2)]/20 text-[var(--color-ink3)] hover:bg-[var(--color-surface2)]"
            }`}
          >
            {ROTULO_CENARIO[c]}
          </button>
        );
      })}
    </div>
  );
}
