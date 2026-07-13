"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { useTransition } from "react";
import { Select } from "@/components/ui/input";

export function DreControls({
  projects,
  proj,
  periods,
  periodo,
  periodDisabled,
  view,
  vs,
}: {
  projects: { id: string; label: string }[];
  proj: string;
  periods: { value: string; label: string }[];
  periodo: string;
  periodDisabled: boolean;
  view: string;
  vs: string;
}) {
  const router = useRouter();
  const sp = useSearchParams();
  const [pending, start] = useTransition();

  const go = (patch: Partial<Record<"proj" | "periodo" | "view" | "vs", string>>) => {
    const params = new URLSearchParams(sp.toString());
    const next = { proj, periodo, view, vs, ...patch };
    params.set("proj", next.proj);
    params.set("periodo", next.periodo);
    if (next.view) params.set("view", next.view);
    else params.delete("view");
    if (next.vs) params.set("vs", next.vs);
    else params.delete("vs");
    start(() => router.push(`/dre?${params.toString()}`));
  };

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
