"use client";

import { useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import * as XLSX from "xlsx";
import { importCash, type ImportCashRow } from "@/lib/actions/caixa";
import { Button } from "@/components/ui/button";
import { Input, Label, Select } from "@/components/ui/input";
import { brl0 } from "@/lib/utils";

interface Conta {
  id: string;
  banco: string;
  cc: string | null;
}

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

const SALDO_KEYS = ["saldo", "saldo final", "balance", "saldo (r$)"];

export function ImportExtratoButton({ contas }: { contas: Conta[] }) {
  const inputRef = useRef<HTMLInputElement>(null);
  const router = useRouter();
  const [pending, start] = useTransition();
  const [msg, setMsg] = useState<string | null>(null);
  const [bankAccountId, setBankAccountId] = useState("");
  const [saldoFinal, setSaldoFinal] = useState("");

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

    // Saldo final: usa o valor digitado ou detecta a última linha com "saldo".
    let saldo: number | null = num(saldoFinal) ?? null;
    if (saldo == null) {
      for (let i = json.length - 1; i >= 0; i--) {
        const s = num(pick(json[i], SALDO_KEYS));
        if (s != null) {
          saldo = s;
          break;
        }
      }
    }

    start(async () => {
      try {
        const res = await importCash({
          rows,
          bankAccountId: bankAccountId || null,
          saldoFinal: saldo,
        });
        const parts = [`${res.inserted} lançamentos importados`];
        if (res.conciliated > 0)
          parts.push(`${res.conciliated} conciliados automaticamente`);
        if (res.saldoUpdated && saldo != null)
          parts.push(`saldo da conta atualizado para ${brl0(saldo)}`);
        setMsg(parts.join(" · ") + ".");
        setSaldoFinal("");
        router.refresh();
      } catch (e) {
        setMsg(e instanceof Error ? e.message : "Falha na importação.");
      }
    });
  }

  return (
    <div className="rounded-[10px] border border-[var(--color-accent2)]/12 bg-[var(--color-surface2)] p-4">
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
      <div className="flex flex-col gap-3 sm:flex-row sm:items-end">
        <div className="sm:w-56">
          <Label>Conta corrente do extrato</Label>
          <Select value={bankAccountId} onChange={(e) => setBankAccountId(e.target.value)}>
            <option value="">Selecione a conta…</option>
            {contas.map((c) => (
              <option key={c.id} value={c.id}>
                {c.banco} · {c.cc || "s/ conta"}
              </option>
            ))}
          </Select>
        </div>
        <div className="sm:w-44">
          <Label>Saldo final (opcional)</Label>
          <Input
            type="number"
            step="0.01"
            value={saldoFinal}
            onChange={(e) => setSaldoFinal(e.target.value)}
            placeholder="detecta do extrato"
          />
        </div>
        <Button
          variant="outline"
          disabled={pending || !bankAccountId}
          onClick={() => inputRef.current?.click()}
        >
          {pending ? "Importando…" : "Upload Extrato"}
        </Button>
      </div>
      <p className="mt-2 text-[11.5px] leading-relaxed text-[var(--color-ink3)]">
        Os lançamentos são atribuídos à conta selecionada e casados
        automaticamente com as despesas e receitas previstas (por valor e mês);
        os sem correspondência ficam pendentes na aba Conciliação. O saldo final
        (digitado ou detectado da coluna “saldo” do extrato) atualiza o saldo da
        conta corrente.
      </p>
      {!bankAccountId && contas.length === 0 && (
        <p className="mt-1 text-[11.5px] text-[var(--color-warning)]">
          Cadastre uma conta corrente em Contas Correntes para importar o extrato.
        </p>
      )}
      {msg && <p className="mt-2 text-xs text-[var(--color-ink2)]">{msg}</p>}
    </div>
  );
}
