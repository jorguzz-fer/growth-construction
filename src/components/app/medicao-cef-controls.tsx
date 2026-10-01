"use client";

import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useState, useTransition } from "react";
import { Button } from "@/components/ui/button";
import { Select } from "@/components/ui/input";
import { MonthField } from "@/components/ui/date-field";

/**
 * Controles do Relatório CEF (Prompt V, 3.8 e 3.9).
 *
 * `OrcamentoPicker`: com mais de um Orçamento na obra, a escolha é explícita
 * (`?orc=`) — o cabeçalho declara qual entrou.
 * `RecorteDeCompetencia`: o relatório é ACUMULADO por padrão; o recorte é
 * opção rotulada, por competência (MM/AAAA), e só vale com os dois limites.
 */
export function OrcamentoPicker({ opcoes, selected }: { opcoes: { id: string; label: string }[]; selected: string }) {
  const router = useRouter();
  const pathname = usePathname();
  const sp = useSearchParams();
  const [pending, start] = useTransition();
  return (
    <div className="flex flex-col gap-1">
      <span className="font-[family-name:var(--font-mono)] text-[10px] uppercase tracking-wide text-[var(--color-ink3)]">Orçamento</span>
      <Select
        aria-label="Orçamento do relatório"
        value={selected}
        disabled={pending}
        onChange={(e) => {
          const params = new URLSearchParams(sp.toString());
          params.set("orc", e.target.value);
          start(() => router.push(`${pathname}?${params.toString()}`));
        }}
      >
        {opcoes.map((o) => (
          <option key={o.id} value={o.id}>
            {o.label}
          </option>
        ))}
      </Select>
    </div>
  );
}

export function RecorteDeCompetencia({ de, ate }: { de: string; ate: string }) {
  const router = useRouter();
  const pathname = usePathname();
  const sp = useSearchParams();
  const [pending, start] = useTransition();
  const [localDe, setLocalDe] = useState(de);
  const [localAte, setLocalAte] = useState(ate);
  const aplicar = (nd: string, na: string) => {
    const params = new URLSearchParams(sp.toString());
    if (nd) params.set("de", nd);
    else params.delete("de");
    if (na) params.set("ate", na);
    else params.delete("ate");
    start(() => router.push(`${pathname}?${params.toString()}`));
  };
  const ativo = !!(de && ate);
  return (
    <div className="flex flex-col gap-1">
      <span className="font-[family-name:var(--font-mono)] text-[10px] uppercase tracking-wide text-[var(--color-ink3)]" title="O relatório é acumulado desde o início da obra. O recorte é opcional e só vale com as duas competências.">
        Recorte por competência (opcional)
      </span>
      <div className="flex flex-wrap items-center gap-2">
        <span className="text-[12px] text-[var(--color-ink3)]">de</span>
        <MonthField value={localDe} onChange={setLocalDe} className="h-9 w-32" />
        <span className="text-[12px] text-[var(--color-ink3)]">até</span>
        <MonthField value={localAte} onChange={setLocalAte} className="h-9 w-32" />
        <Button size="sm" variant="outline" disabled={pending || !localDe || !localAte} onClick={() => aplicar(localDe, localAte)}>
          Aplicar recorte
        </Button>
        {ativo && (
          <Button size="sm" variant="ghost" disabled={pending} onClick={() => { setLocalDe(""); setLocalAte(""); aplicar("", ""); }}>
            Voltar ao acumulado
          </Button>
        )}
      </div>
    </div>
  );
}
