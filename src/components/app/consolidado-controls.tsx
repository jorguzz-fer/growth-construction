"use client";

import { useRouter } from "next/navigation";
import { useTransition } from "react";
import { Select } from "@/components/ui/input";

export function ConsolidadoControls({
  views,
  view,
  years,
  ano,
  anoDisabled,
}: {
  views: { key: string; label: string }[];
  view: string;
  years: { value: number; label: string }[];
  ano: number;
  anoDisabled: boolean;
}) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const go = (v: string, a: number) =>
    start(() => router.push(`/consolidado?view=${v}&ano=${a}`));

  return (
    <div className="flex items-center gap-2">
      <Select
        value={view}
        disabled={pending}
        onChange={(e) => go(e.target.value, ano)}
        className="h-9 w-auto"
      >
        {views.map((v) => (
          <option key={v.key} value={v.key}>
            {v.label}
          </option>
        ))}
      </Select>
      <Select
        value={String(ano)}
        disabled={pending || anoDisabled}
        onChange={(e) => go(view, Number(e.target.value))}
        className="h-9 w-auto"
      >
        {years.map((y) => (
          <option key={y.value} value={y.value}>
            {y.label}
          </option>
        ))}
      </Select>
    </div>
  );
}
