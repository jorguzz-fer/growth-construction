"use client";

import { useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import * as XLSX from "xlsx";
import { importUnits, type ImportUnitRow } from "@/lib/actions/units";
import { Button } from "@/components/ui/button";
import type { UnitStatus } from "@/lib/calc";

/** Lê o valor de uma linha tolerando variações de cabeçalho. */
function pick(row: Record<string, unknown>, keys: string[]): unknown {
  for (const k of Object.keys(row)) {
    const norm = k.trim().toLowerCase();
    if (keys.includes(norm)) return row[k];
  }
  return undefined;
}

function toStatus(v: unknown): UnitStatus | undefined {
  const s = String(v ?? "").toLowerCase();
  if (s.startsWith("vend")) return "Vendido";
  if (s.startsWith("reserv")) return "Reservado";
  if (s.startsWith("dispon")) return "Disponivel";
  return undefined;
}

export function ImportUnitsButton() {
  const inputRef = useRef<HTMLInputElement>(null);
  const router = useRouter();
  const [pending, start] = useTransition();
  const [msg, setMsg] = useState<string | null>(null);

  async function onFile(file: File) {
    setMsg(null);
    const buf = await file.arrayBuffer();
    const wb = XLSX.read(buf);
    const sheet = wb.Sheets[wb.SheetNames[0]];
    const json = XLSX.utils.sheet_to_json<Record<string, unknown>>(sheet);

    const rows: ImportUnitRow[] = json
      .map((r) => ({
        code: String(pick(r, ["code", "código", "codigo", "unidade"]) ?? "").trim(),
        bloco: pick(r, ["bloco"]) != null ? String(pick(r, ["bloco"])) : undefined,
        tipo: pick(r, ["tipo"]) != null ? String(pick(r, ["tipo"])) : undefined,
        m2: num(pick(r, ["m2", "m²", "area", "área"])),
        andar: num(pick(r, ["andar"])),
        valor: num(pick(r, ["valor", "vgv", "preço", "preco"])),
        status: toStatus(pick(r, ["status"])),
      }))
      .filter((r) => r.code);

    if (rows.length === 0) {
      setMsg("Nenhuma linha válida (esperado ao menos a coluna 'código').");
      return;
    }
    start(async () => {
      try {
        const res = await importUnits(rows);
        setMsg(`${res.inserted} unidades importadas.`);
        router.refresh();
      } catch (e) {
        setMsg(e instanceof Error ? e.message : "Falha na importação.");
      }
    });
  }

  return (
    <span className="flex items-center gap-2">
      <input
        ref={inputRef}
        type="file"
        accept=".xlsx,.xls,.csv"
        hidden
        onChange={(e) => {
          const f = e.target.files?.[0];
          if (f) onFile(f);
          e.target.value = "";
        }}
      />
      <Button
        variant="outline"
        size="sm"
        disabled={pending}
        onClick={() => inputRef.current?.click()}
      >
        {pending ? "Importando..." : "Importar xlsx"}
      </Button>
      {msg && <span className="text-xs text-[var(--color-ink3)]">{msg}</span>}
    </span>
  );
}

function num(v: unknown): number | undefined {
  if (v == null || v === "") return undefined;
  if (typeof v === "number") return Number.isFinite(v) ? v : undefined;
  // string: tolera formato BR (1.234,56) e formato simples (1234.56)
  const raw = String(v).trim();
  const br = /,\d{1,2}$/.test(raw)
    ? raw.replace(/\./g, "").replace(",", ".")
    : raw.replace(/,/g, "");
  const n = Number(br);
  return Number.isFinite(n) ? n : undefined;
}
