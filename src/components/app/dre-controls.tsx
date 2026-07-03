"use client";

import { useRouter } from "next/navigation";
import { useTransition } from "react";
import { Select } from "@/components/ui/input";

export function DreControls({
  projects,
  proj,
  periods,
  periodo,
  periodDisabled,
}: {
  projects: { id: string; label: string }[];
  proj: string;
  periods: { value: string; label: string }[];
  periodo: string;
  periodDisabled: boolean;
}) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const go = (p: string, per: string) =>
    start(() => router.push(`/dre?proj=${p}&periodo=${per}`));

  return (
    <div className="flex flex-wrap items-center gap-2">
      <Select
        value={proj}
        disabled={pending}
        onChange={(e) => go(e.target.value, periodo)}
        className="h-9 w-auto"
      >
        {projects.map((p) => (
          <option key={p.id} value={p.id}>
            {p.label}
          </option>
        ))}
        <option value="all">Todos os projetos (DRE geral)</option>
      </Select>
      <Select
        value={periodo}
        disabled={pending || periodDisabled}
        onChange={(e) => go(proj, e.target.value)}
        className="h-9 w-auto"
      >
        {periods.map((p) => (
          <option key={p.value} value={p.value}>
            {p.label}
          </option>
        ))}
      </Select>
    </div>
  );
}
