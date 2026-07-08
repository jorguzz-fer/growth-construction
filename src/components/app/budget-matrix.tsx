"use client";

import { useMemo, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import {
  saveBudgetLines,
  importFromBudget,
  replicateFromAtual,
  importBudgetXlsx,
  type BudgetCell,
} from "@/lib/actions/budget";
import { brl0 } from "@/lib/utils";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Select } from "@/components/ui/input";

export interface MatrixRow {
  rowKey: string;
  label: string;
  dreCategory: string;
}
export interface BudgetMatrixProps {
  versionId: string;
  versionLabel: string;
  isForecast: boolean;
  months: string[]; // "MM/YYYY"
  receitaRows: MatrixRow[];
  despesaRows: MatrixRow[];
  dreCategories: string[];
  /** valores atuais: kind → rowKey → mes → valor */
  initial: {
    receita: Record<string, Record<string, number>>;
    despesa: Record<string, Record<string, number>>;
  };
  initialDespCat: Record<string, string>; // rowKey → categoria DRE salva
  canEdit: boolean;
}

type Tab = "receita" | "despesa";

export function BudgetMatrix(props: BudgetMatrixProps) {
  const router = useRouter();
  const fileRef = useRef<HTMLInputElement>(null);
  const [tab, setTab] = useState<Tab>("receita");
  const [pending, start] = useTransition();
  const [msg, setMsg] = useState<string | null>(null);

  // Estado editável: kind → rowKey → mes → string
  const [rec, setRec] = useState(() => toState(props.initial.receita));
  const [desp, setDesp] = useState(() => toState(props.initial.despesa));
  const [despCat, setDespCat] = useState<Record<string, string>>(() => {
    const o: Record<string, string> = {};
    for (const r of props.despesaRows) o[r.rowKey] = props.initialDespCat[r.rowKey] ?? r.dreCategory;
    return o;
  });

  const rows = tab === "receita" ? props.receitaRows : props.despesaRows;
  const data = tab === "receita" ? rec : desp;
  const setData = tab === "receita" ? setRec : setDesp;

  const setCell = (rowKey: string, mes: string, v: string) =>
    setData((s) => ({ ...s, [rowKey]: { ...(s[rowKey] || {}), [mes]: v } }));

  const totalRow = (rowKey: string) =>
    props.months.reduce((a, m) => a + (Number(data[rowKey]?.[m]) || 0), 0);
  const totalMes = (m: string) =>
    rows.reduce((a, r) => a + (Number(data[r.rowKey]?.[m]) || 0), 0);
  const totalGeral = useMemo(
    () => rows.reduce((a, r) => a + totalRow(r.rowKey), 0),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [data, rows],
  );

  const salvar = () => {
    setMsg(null);
    const cells: BudgetCell[] = [];
    for (const r of rows) {
      for (const m of props.months) {
        const v = Number(data[r.rowKey]?.[m]) || 0;
        if (v !== 0)
          cells.push({
            rowKey: r.rowKey,
            mes: m,
            valor: v,
            dreCategory: tab === "receita" ? "Receita" : despCat[r.rowKey],
          });
      }
    }
    start(async () => {
      try {
        await saveBudgetLines(props.versionId, tab, cells);
        setMsg("Lançamento salvo.");
        router.refresh();
      } catch (e) {
        setMsg(e instanceof Error ? e.message : "Falha ao salvar.");
      }
    });
  };

  const acao = (fn: () => Promise<void>, ok: string) => {
    setMsg(null);
    start(async () => {
      try {
        await fn();
        setMsg(ok);
        router.refresh();
      } catch (e) {
        setMsg(e instanceof Error ? e.message : "Falha na operação.");
      }
    });
  };

  return (
    <div className="space-y-4">
      {props.canEdit && (
        <div className="flex flex-wrap items-center gap-2">
          {props.isForecast && (
            <>
              <Button
                variant="outline"
                size="sm"
                disabled={pending}
                onClick={() =>
                  window.confirm("Importar os lançamentos do Budget (substitui os atuais)?") &&
                  acao(() => importFromBudget(props.versionId), "Dados do Budget importados.")
                }
              >
                ⬇ Importar do Budget
              </Button>
              <Button
                variant="outline"
                size="sm"
                disabled={pending}
                onClick={() =>
                  window.confirm("Replicar os dados da versão Atual (substitui os atuais)?") &&
                  acao(() => replicateFromAtual(props.versionId), "Dados da Atual replicados.")
                }
              >
                ⟳ Replicar da Atual
              </Button>
            </>
          )}
          {!props.isForecast && (
            <Button
              variant="outline"
              size="sm"
              disabled={pending}
              onClick={() =>
                window.confirm("Replicar os dados da versão Atual (substitui os atuais)?") &&
                acao(() => replicateFromAtual(props.versionId), "Dados da Atual replicados.")
              }
            >
              ⟳ Replicar da Atual
            </Button>
          )}
          <a
            href={`/lancamento/export?v=${props.versionId}`}
            className="rounded-[8px] border border-[var(--color-accent2)]/20 px-3 py-1.5 text-[13px] text-[var(--color-ink2)] hover:bg-[var(--color-surface2)]"
          >
            ⬇ Exportar planilha
          </a>
          <input
            ref={fileRef}
            type="file"
            accept=".xlsx,.xls"
            hidden
            onChange={(e) => {
              const f = e.target.files?.[0];
              e.target.value = "";
              if (!f) return;
              const fd = new FormData();
              fd.set("versionId", props.versionId);
              fd.set("file", f);
              acao(() => importBudgetXlsx(fd), "Planilha importada.");
            }}
          />
          <Button
            variant="outline"
            size="sm"
            disabled={pending}
            onClick={() => fileRef.current?.click()}
          >
            ⬆ Importar planilha
          </Button>
          <div className="ml-auto flex items-center gap-3">
            {msg && <span className="text-xs text-[var(--color-ink3)]">{msg}</span>}
            <Button disabled={pending} onClick={salvar}>
              {pending ? "Salvando…" : "Salvar lançamento"}
            </Button>
          </div>
        </div>
      )}

      <div className="flex gap-1 rounded-[8px] bg-[var(--color-surface3)] p-1">
        {(["receita", "despesa"] as Tab[]).map((t) => (
          <button
            key={t}
            onClick={() => setTab(t)}
            className={`rounded-[6px] px-3 py-1.5 text-xs capitalize transition-colors ${
              tab === t ? "bg-white text-[var(--color-ink)] shadow-sm" : "text-[var(--color-ink3)]"
            }`}
          >
            {t === "receita" ? "Receitas" : "Despesas"}
          </button>
        ))}
      </div>

      <Card>
        <CardContent className="p-0">
          <div className="overflow-x-auto">
            <table className="w-full border-collapse text-sm">
              <thead>
                <tr className="border-b border-[var(--color-accent2)]/12">
                  <th className="sticky left-0 z-10 min-w-[220px] bg-white px-3 py-2 text-left font-[family-name:var(--font-mono)] text-[10px] uppercase tracking-wide text-[var(--color-ink3)]">
                    {tab === "receita" ? "Fonte" : "Grupo · Categoria DRE"}
                  </th>
                  {props.months.map((m) => (
                    <th key={m} className="min-w-[92px] px-2 py-2 text-right font-[family-name:var(--font-mono)] text-[10px] text-[var(--color-ink3)]">
                      {m}
                    </th>
                  ))}
                  <th className="min-w-[110px] px-3 py-2 text-right font-[family-name:var(--font-mono)] text-[10px] uppercase tracking-wide text-[var(--color-accent)]">
                    Total
                  </th>
                </tr>
              </thead>
              <tbody>
                {rows.map((r) => (
                  <tr key={r.rowKey} className="border-b border-[var(--color-accent2)]/8">
                    <td className="sticky left-0 z-10 bg-white px-3 py-1.5">
                      <div className="text-[13px] font-medium text-[var(--color-ink)]">{r.label}</div>
                      {tab === "despesa" && (
                        <Select
                          value={despCat[r.rowKey] ?? r.dreCategory}
                          disabled={!props.canEdit}
                          onChange={(e) => setDespCat((s) => ({ ...s, [r.rowKey]: e.target.value }))}
                          className="mt-0.5 h-7 w-full text-[11px]"
                        >
                          {props.dreCategories.map((c) => (
                            <option key={c} value={c}>{c}</option>
                          ))}
                        </Select>
                      )}
                    </td>
                    {props.months.map((m) => (
                      <td key={m} className="px-1 py-1">
                        <input
                          type="number"
                          step="0.01"
                          disabled={!props.canEdit}
                          value={data[r.rowKey]?.[m] ?? ""}
                          onChange={(e) => setCell(r.rowKey, m, e.target.value)}
                          className="h-7 w-full rounded-[6px] border border-[var(--color-accent2)]/15 bg-white px-1.5 text-right text-[12px] disabled:opacity-60"
                        />
                      </td>
                    ))}
                    <td className="px-3 py-1.5 text-right font-[family-name:var(--font-mono)] text-[12px] font-semibold text-[var(--color-ink)]">
                      {brl0(totalRow(r.rowKey))}
                    </td>
                  </tr>
                ))}
                <tr className="bg-[var(--color-surface2)] font-semibold">
                  <td className="sticky left-0 z-10 bg-[var(--color-surface2)] px-3 py-2 text-[12px] text-[var(--color-ink)]">TOTAL</td>
                  {props.months.map((m) => (
                    <td key={m} className="px-2 py-2 text-right font-[family-name:var(--font-mono)] text-[11px] text-[var(--color-ink2)]">
                      {totalMes(m) ? brl0(totalMes(m)) : "—"}
                    </td>
                  ))}
                  <td className="px-3 py-2 text-right font-[family-name:var(--font-mono)] text-[12px] text-[var(--color-accent)]">
                    {brl0(totalGeral)}
                  </td>
                </tr>
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

function toState(src: Record<string, Record<string, number>>): Record<string, Record<string, string>> {
  const out: Record<string, Record<string, string>> = {};
  for (const [rowKey, months] of Object.entries(src)) {
    out[rowKey] = {};
    for (const [mes, v] of Object.entries(months)) out[rowKey][mes] = String(v);
  }
  return out;
}
