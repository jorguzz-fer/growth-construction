"use client";

import { useRouter } from "next/navigation";
import { useTransition } from "react";
import { Select } from "@/components/ui/input";
import { Button } from "@/components/ui/button";

export interface YearOption {
  value: number;
  label: string;
}

export function ProjecaoYearSelect({
  years,
  selected,
}: {
  years: YearOption[];
  selected: number;
}) {
  const router = useRouter();
  const [pending, start] = useTransition();
  return (
    <Select
      value={String(selected)}
      disabled={pending}
      onChange={(e) => start(() => router.push(`/projecao?ano=${e.target.value}`))}
      className="h-9 w-auto"
    >
      {years.map((y) => (
        <option key={y.value} value={y.value}>
          {y.label}
        </option>
      ))}
    </Select>
  );
}

export interface ExportMatrix {
  months: string[];
  rows: { label: string; values: number[]; total: number }[];
}

/** Exporta a matriz completa (todas as colunas de mês + total) como CSV. */
export function ProjecaoExport({
  matrix,
  filename,
}: {
  matrix: ExportMatrix;
  filename: string;
}) {
  const download = () => {
    const esc = (s: string) => `"${s.replace(/"/g, '""')}"`;
    const header = ["Fonte / Unidade", ...matrix.months, "TOTAL"].map(esc).join(";");
    const lines = matrix.rows.map((r) =>
      [esc(r.label), ...r.values.map((v) => String(v)), String(r.total)].join(";"),
    );
    const csv = "﻿" + [header, ...lines].join("\n");
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = filename;
    a.click();
    URL.revokeObjectURL(url);
  };
  return (
    <Button type="button" variant="outline" size="sm" onClick={download}>
      ⬇ Exportar
    </Button>
  );
}
