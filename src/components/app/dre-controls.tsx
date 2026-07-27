"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { useEffect, useState, useTransition } from "react";
import { Select } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { MonthField } from "@/components/ui/date-field";

export function DreControls({
  projects,
  proj,
  periods,
  periodo,
  periodDisabled,
  view,
  vs,
  de,
  ate,
  showVersionKind = false,
  versionKind = "atual",
}: {
  projects: { id: string; label: string }[];
  proj: string;
  periods: { value: string; label: string }[];
  periodo: string;
  periodDisabled: boolean;
  view: string;
  vs: string;
  /** Recorte customizado (competência interna "MM/YYYY"). */
  de: string;
  ate: string;
  /** Mostra o seletor de TIPO de versão (usado na visão "Empresa toda"). */
  showVersionKind?: boolean;
  versionKind?: string;
}) {
  const router = useRouter();
  const sp = useSearchParams();
  const [pending, start] = useTransition();

  // Estado local dos campos De/Até (aplicados via botão, para não navegar a
  // cada tecla). Sincroniza quando a URL muda por fora.
  const [deVal, setDeVal] = useState(de);
  const [ateVal, setAteVal] = useState(ate);
  useEffect(() => setDeVal(de), [de]);
  useEffect(() => setAteVal(ate), [ate]);

  const go = (
    patch: Partial<
      Record<"proj" | "periodo" | "view" | "vs" | "de" | "ate" | "vkind", string>
    >,
  ) => {
    const params = new URLSearchParams(sp.toString());
    const next = { proj, periodo, view, vs, de, ate, ...patch };
    params.set("proj", next.proj);
    params.set("periodo", next.periodo);
    if (patch.vkind !== undefined) {
      if (patch.vkind && patch.vkind !== "atual") params.set("vkind", patch.vkind);
      else params.delete("vkind");
    }
    if (next.view) params.set("view", next.view);
    else params.delete("view");
    if (next.vs) params.set("vs", next.vs);
    else params.delete("vs");
    // De/Até só valem no recorte customizado.
    if (next.periodo === "custom") {
      if (next.de) params.set("de", next.de);
      else params.delete("de");
      if (next.ate) params.set("ate", next.ate);
      else params.delete("ate");
    } else {
      params.delete("de");
      params.delete("ate");
    }
    start(() => router.push(`/dre?${params.toString()}`));
  };

  const aplicarCustom = () => go({ periodo: "custom", de: deVal, ate: ateVal });

  return (
    <div className="flex flex-wrap items-center gap-2">
      <Select
        value={proj}
        disabled={pending}
        onChange={(e) => go({ proj: e.target.value })}
        className="h-9 w-auto"
      >
        {projects.map((p) => (
          <option key={p.id} value={p.id}>
            {p.label}
          </option>
        ))}
        <option value="all">Empresa toda (matriz + filiais + projetos)</option>
      </Select>
      <Select
        value={periodo}
        disabled={pending || periodDisabled}
        onChange={(e) => go({ periodo: e.target.value })}
        className="h-9 w-auto"
      >
        {periods.map((p) => (
          <option key={p.value} value={p.value}>
            {p.label}
          </option>
        ))}
      </Select>
      {showVersionKind && (
        <Select
          value={versionKind}
          disabled={pending}
          onChange={(e) => go({ vkind: e.target.value })}
          className="h-9 w-auto"
          title="Tipo de versão aplicado a todos os projetos"
        >
          <option value="atual">Atual (real)</option>
          <option value="forecast">Forecast</option>
          <option value="budget">Budget</option>
        </Select>
      )}
      {periodo === "custom" && (
        <div className="flex flex-wrap items-end gap-2">
          <div>
            <span className="mb-0.5 block font-[family-name:var(--font-mono)] text-[9px] uppercase tracking-wide text-[var(--color-ink3)]">
              De
            </span>
            <MonthField value={deVal} onChange={setDeVal} className="h-9 w-[110px]" />
          </div>
          <div>
            <span className="mb-0.5 block font-[family-name:var(--font-mono)] text-[9px] uppercase tracking-wide text-[var(--color-ink3)]">
              Até
            </span>
            <MonthField value={ateVal} onChange={setAteVal} className="h-9 w-[110px]" />
          </div>
          <Button
            type="button"
            variant="outline"
            disabled={pending}
            onClick={aplicarCustom}
            className="h-9"
          >
            Aplicar
          </Button>
        </div>
      )}
      <Select
        value={view}
        disabled={pending}
        onChange={(e) => go({ view: e.target.value })}
        className="h-9 w-auto"
      >
        <option value="">Consolidado</option>
        <option value="mensal">Mensal (coluna por mês)</option>
      </Select>
    </div>
  );
}
