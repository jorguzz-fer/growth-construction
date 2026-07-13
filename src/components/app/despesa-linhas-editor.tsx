"use client";

import { useMemo, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import * as XLSX from "xlsx";
import {
  saveBudgetDespesaLinhas,
  type DespesaLinhaInput,
} from "@/lib/actions/budget";
import { brl0 } from "@/lib/utils";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Select } from "@/components/ui/input";

export interface ProjetoOpt { id: string; nome: string; office: boolean }
export interface GrupoOpt { code: string; label: string; dreCategory: string; cef: boolean }
export interface DespesaLinhaView {
  projectId: string;
  grupoCode: string;
  dreCategory: string;
  values: Record<string, number>;
}

interface Linha {
  key: string;
  projectId: string;
  grupoCode: string;
  dreCategory: string;
  values: Record<string, string>;
}

function monthKey(cell: unknown): string {
  if (cell == null || cell === "") return "";
  if (cell instanceof Date) return `${String(cell.getMonth() + 1).padStart(2, "0")}/${cell.getFullYear()}`;
  const s = String(cell).trim();
  let m = s.match(/^(\d{1,2})\/(\d{4})$/);
  if (m) return `${m[1].padStart(2, "0")}/${m[2]}`;
  m = s.match(/^(\d{4})-(\d{1,2})/);
  if (m) return `${m[2].padStart(2, "0")}/${m[1]}`;
  m = s.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
  if (m) return `${m[1].padStart(2, "0")}/${m[3]}`;
  return s;
}
function numCell(v: unknown): number {
  if (v == null || v === "") return 0;
  if (typeof v === "number") return Number.isFinite(v) ? v : 0;
  let raw = String(v).trim().replace(/[R$\s]/g, "");
  if (!raw) return 0;
  if (/,\d{1,2}$/.test(raw)) raw = raw.replace(/\./g, "").replace(",", ".");
  else { raw = raw.replace(/,/g, ""); if ((raw.match(/\./g) || []).length > 1) raw = raw.replace(/\./g, ""); }
  const n = Number(raw);
  return Number.isFinite(n) ? n : 0;
}

let counter = 0;
const newKey = () => `l${counter++}`;

export function DespesaLinhasEditor({
  kind,
  months,
  projetos,
  grupos,
  dreCategories,
  initialLines,
  canEdit,
}: {
  kind: "budget" | "forecast";
  months: string[];
  projetos: ProjetoOpt[];
  grupos: GrupoOpt[];
  dreCategories: string[];
  initialLines: DespesaLinhaView[];
  canEdit: boolean;
}) {
  const router = useRouter();
  const fileRef = useRef<HTMLInputElement>(null);
  const [pending, start] = useTransition();
  const [msg, setMsg] = useState<string | null>(null);
  const [linhas, setLinhas] = useState<Linha[]>(() =>
    initialLines.map((l) => ({
      key: newKey(),
      projectId: l.projectId,
      grupoCode: l.grupoCode,
      dreCategory: l.dreCategory,
      values: Object.fromEntries(Object.entries(l.values).map(([m, v]) => [m, String(v)])),
    })),
  );

  const grupoByCode = useMemo(() => new Map(grupos.map((g) => [g.code, g])), [grupos]);
  const isCef = (code: string) => grupoByCode.get(code)?.cef ?? false;
  const projetosFor = (code: string) =>
    isCef(code) ? projetos.filter((p) => !p.office) : projetos;

  const set = (key: string, patch: Partial<Linha>) =>
    setLinhas((s) => s.map((l) => (l.key === key ? { ...l, ...patch } : l)));
  const setVal = (key: string, mes: string, v: string) =>
    setLinhas((s) => s.map((l) => (l.key === key ? { ...l, values: { ...l.values, [mes]: v } } : l)));

  const onGrupo = (key: string, code: string) => {
    const g = grupoByCode.get(code);
    setLinhas((s) =>
      s.map((l) => {
        if (l.key !== key) return l;
        // CEF não pode ficar em filial/matriz — limpa o projeto se for office.
        const proj = projetos.find((p) => p.id === l.projectId);
        const projectId = g?.cef && proj?.office ? "" : l.projectId;
        return { ...l, grupoCode: code, dreCategory: g?.dreCategory ?? l.dreCategory, projectId };
      }),
    );
  };

  const addLinha = () =>
    setLinhas((s) => [...s, { key: newKey(), projectId: "", grupoCode: "", dreCategory: dreCategories[0] ?? "Despesa Fixa", values: {} }]);
  const removeLinha = (key: string) => setLinhas((s) => s.filter((l) => l.key !== key));

  const totalLinha = (l: Linha) => months.reduce((a, m) => a + (Number(l.values[m]) || 0), 0);

  const collect = (): DespesaLinhaInput[] =>
    linhas
      .filter((l) => l.projectId && l.grupoCode)
      .map((l) => ({
        projectId: l.projectId,
        grupoCode: l.grupoCode,
        dreCategory: l.dreCategory,
        cef: isCef(l.grupoCode),
        values: months.map((m) => ({ mes: m, valor: Number(l.values[m]) || 0 })),
      }));

  const salvar = () => {
    setMsg(null);
    start(async () => {
      try {
        await saveBudgetDespesaLinhas(kind, collect());
        setMsg("Despesas salvas.");
        router.refresh();
      } catch (e) {
        setMsg(e instanceof Error ? e.message : "Falha ao salvar.");
      }
    });
  };

  const exportar = () => {
    const aoa: (string | number)[][] = [["Projeto/Filial", "Grupo", "Categoria DRE", ...months]];
    for (const l of linhas) {
      const proj = projetos.find((p) => p.id === l.projectId)?.nome ?? "";
      const grupo = grupoByCode.get(l.grupoCode)?.label ?? l.grupoCode;
      aoa.push([proj, grupo, l.dreCategory, ...months.map((m) => Number(l.values[m]) || 0)]);
    }
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(aoa), "Despesas");
    const buf = XLSX.write(wb, { type: "array", bookType: "xlsx" });
    const url = URL.createObjectURL(new Blob([buf], { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" }));
    const a = document.createElement("a");
    a.href = url; a.download = `despesas-${kind}.xlsx`; a.click();
    URL.revokeObjectURL(url);
  };

  const importar = (file: File) => {
    setMsg(null);
    const byProjName = new Map(projetos.map((p) => [p.nome.trim().toLowerCase(), p]));
    const byGrupoLabel = new Map(grupos.map((g) => [g.label.trim().toLowerCase(), g]));
    const byGrupoCode = new Map(grupos.map((g) => [g.code, g]));
    start(async () => {
      try {
        const wb = XLSX.read(await file.arrayBuffer(), { cellDates: true });
        const ws = wb.Sheets["Despesas"] ?? wb.Sheets[wb.SheetNames[0]];
        const grid = XLSX.utils.sheet_to_json<unknown[]>(ws, { header: 1, raw: true }).filter((r) => r.length);
        if (!grid.length) throw new Error("Planilha vazia.");
        const cols = (grid[0] as unknown[]).slice(3).map(monthKey);
        const next: Linha[] = [];
        for (const row of grid.slice(1)) {
          const projNome = String((row as unknown[])[0] ?? "").trim().toLowerCase();
          const grupoTxt = String((row as unknown[])[1] ?? "").trim();
          const proj = byProjName.get(projNome);
          const grupo = byGrupoLabel.get(grupoTxt.toLowerCase()) ?? byGrupoCode.get(grupoTxt.split(/\s*·\s*/)[0].trim());
          if (!proj || !grupo) continue;
          if (grupo.cef && proj.office) continue; // CEF não vai p/ filial
          const dre = String((row as unknown[])[2] ?? "").trim() || grupo.dreCategory;
          const values: Record<string, string> = {};
          cols.forEach((mes, i) => {
            if (!mes) return;
            const v = numCell((row as unknown[])[i + 3]);
            if (v !== 0) values[mes] = String(v);
          });
          next.push({ key: newKey(), projectId: proj.id, grupoCode: grupo.code, dreCategory: dre, values });
        }
        setLinhas(next);
        await saveBudgetDespesaLinhas(
          kind,
          next.map((l) => ({
            projectId: l.projectId, grupoCode: l.grupoCode, dreCategory: l.dreCategory,
            cef: byGrupoCode.get(l.grupoCode)?.cef ?? false,
            values: months.map((m) => ({ mes: m, valor: Number(l.values[m]) || 0 })),
          })),
        );
        setMsg("Planilha de despesas importada.");
        router.refresh();
      } catch (e) {
        setMsg(e instanceof Error ? e.message : "Falha ao importar.");
      }
    });
  };

  return (
    <div className="space-y-3">
      {canEdit && (
        <div className="flex flex-wrap items-center gap-2">
          <Button variant="outline" size="sm" disabled={pending} onClick={addLinha}>+ Adicionar despesa</Button>
          <Button variant="outline" size="sm" disabled={pending} onClick={exportar}>⬇ Exportar planilha</Button>
          <input ref={fileRef} type="file" accept=".xlsx,.xls" hidden onChange={(e) => { const f = e.target.files?.[0]; e.target.value = ""; if (f) importar(f); }} />
          <Button variant="outline" size="sm" disabled={pending} onClick={() => fileRef.current?.click()}>⬆ Importar planilha</Button>
          <div className="ml-auto flex items-center gap-3">
            {msg && <span className="text-xs text-[var(--color-ink3)]">{msg}</span>}
            <Button disabled={pending} onClick={salvar}>{pending ? "Salvando…" : "Salvar despesas"}</Button>
          </div>
        </div>
      )}

      <Card>
        <CardContent className="p-0">
          <div className="overflow-x-auto">
            <table className="w-full border-collapse text-sm">
              <thead>
                <tr className="border-b border-[var(--color-accent2)]/12">
                  <th className="sticky left-0 z-10 min-w-[300px] bg-white px-3 py-2 text-left font-[family-name:var(--font-mono)] text-[10px] uppercase tracking-wide text-[var(--color-ink3)]">
                    Grupo · Projeto/Filial · Categoria DRE
                  </th>
                  {months.map((m) => (
                    <th key={m} className="min-w-[90px] px-2 py-2 text-right font-[family-name:var(--font-mono)] text-[10px] text-[var(--color-ink3)]">{m}</th>
                  ))}
                  <th className="min-w-[100px] px-3 py-2 text-right font-[family-name:var(--font-mono)] text-[10px] uppercase text-[var(--color-accent)]">Total</th>
                  {canEdit && <th className="px-2"></th>}
                </tr>
              </thead>
              <tbody>
                {linhas.map((l) => (
                  <tr key={l.key} className="border-b border-[var(--color-accent2)]/8 align-top">
                    <td className="sticky left-0 z-10 bg-white px-3 py-1.5">
                      <div className="space-y-1">
                        <Select value={l.grupoCode} disabled={!canEdit} onChange={(e) => onGrupo(l.key, e.target.value)} className="h-7 w-full text-[12px]">
                          <option value="">Grupo (plano de contas)…</option>
                          {grupos.map((g) => <option key={g.code} value={g.code}>{g.label}</option>)}
                        </Select>
                        <Select value={l.projectId} disabled={!canEdit || !l.grupoCode} onChange={(e) => set(l.key, { projectId: e.target.value })} className="h-7 w-full text-[12px]">
                          <option value="">Projeto/Filial…</option>
                          {projetosFor(l.grupoCode).map((p) => <option key={p.id} value={p.id}>{p.nome}</option>)}
                        </Select>
                        <Select value={l.dreCategory} disabled={!canEdit} onChange={(e) => set(l.key, { dreCategory: e.target.value })} className="h-7 w-full text-[11px]">
                          {dreCategories.map((c) => <option key={c} value={c}>{c}</option>)}
                        </Select>
                      </div>
                    </td>
                    {months.map((m) => (
                      <td key={m} className="px-1 py-1">
                        <input type="number" step="0.01" disabled={!canEdit} value={l.values[m] ?? ""} onChange={(e) => setVal(l.key, m, e.target.value)} className="h-7 w-full rounded-[6px] border border-[var(--color-accent2)]/15 bg-white px-1.5 text-right text-[12px] disabled:opacity-60" />
                      </td>
                    ))}
                    <td className="px-3 py-1.5 text-right font-[family-name:var(--font-mono)] text-[12px] font-semibold text-[var(--color-ink)]">{brl0(totalLinha(l))}</td>
                    {canEdit && (
                      <td className="px-2 text-center">
                        <button onClick={() => removeLinha(l.key)} className="text-[var(--color-danger)] hover:opacity-70" title="Remover">✕</button>
                      </td>
                    )}
                  </tr>
                ))}
                {linhas.length === 0 && (
                  <tr><td colSpan={months.length + (canEdit ? 3 : 2)} className="px-3 py-8 text-center text-[var(--color-ink4)]">Nenhuma despesa. Use “+ Adicionar despesa”.</td></tr>
                )}
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
