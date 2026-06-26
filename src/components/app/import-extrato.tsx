"use client";

import { useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import * as XLSX from "xlsx";
import { importCash, type ImportCashRow } from "@/lib/actions/caixa";
import { Button } from "@/components/ui/button";

function pick(row: Record<string, unknown>, keys: string[]): unknown {
  for (const k of Object.keys(row)) {
    if (keys.includes(k.trim().toLowerCase())) return row[k];
  }
  return undefined;
}

function num(v: unknown): number | undefined {
  if (v == null || v === "") return undefined;
  if (typeof v === "number") return Number.isFinite(v) ? v : undefined;
  const raw = String(v).trim();
  const br = /,\d{1,2}$/.test(raw)
    ? raw.replace(/\./g, "").replace(",", ".")
    : raw.replace(/,/g, "");
  const n = Number(br);
  return Number.isFinite(n) ? n : undefined;
}

export function ImportExtratoButton() {
  const inputRef = useRef<HTMLInputElement>(null);
  const router = useRouter();
  const [pending, start] = useTransition();
  const [msg, setMsg] = useState<string | null>(null);

  async function onFile(file: File) {
    setMsg(null);
    const wb = XLSX.read(await file.arrayBuffer());
    const json = XLSX.utils.sheet_to_json<Record<string, unknown>>(
      wb.Sheets[wb.SheetNames[0]],
    );
    const rows: ImportCashRow[] = json
      .map((r) => ({
        data: pick(r, ["data", "date"]) != null ? String(pick(r, ["data", "date"])) : undefined,
        descricao:
          pick(r, ["descricao", "descrição", "histórico", "historico", "memo"]) != null
            ? String(pick(r, ["descricao", "descrição", "histórico", "historico", "memo"]))
            : undefined,
        valor: num(pick(r, ["valor", "value", "amount", "crédito", "credito"])),
        cat: "extrato",
      }))
      .filter((r) => r.valor != null);

    if (rows.length === 0) {
      setMsg("Nenhuma linha com valor reconhecida.");
      return;
    }
    start(async () => {
      try {
        const res = await importCash(rows);
        setMsg(`${res.inserted} lançamentos importados.`);
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
      <Button variant="outline" size="sm" disabled={pending} onClick={() => inputRef.current?.click()}>
        {pending ? "Importando..." : "Upload Extrato"}
      </Button>
      {msg && <span className="text-xs text-[var(--color-ink3)]">{msg}</span>}
    </span>
  );
}
