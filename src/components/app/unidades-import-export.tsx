"use client";

import { useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import * as XLSX from "xlsx";
import { importUnits, type ImportUnitRow } from "@/lib/actions/units";
import { baixarXlsx } from "@/lib/download";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";

export interface UnitExport {
  code: string;
  bloco: string | null;
  tipo: string | null;
  m2: string | null;
  andar: number | null;
  valor: string;
  status: string;
}

const HEADERS = ["Código", "Bloco", "Tipo", "m2", "Andar", "Valor", "Status"];
const STATUS_VALIDOS = ["Disponivel", "Reservado", "Vendido"];

/** Número tolerante a formato BR/US ("1.234,56" ou "1234.56") → number | null. */
function num(v: unknown): number | null {
  if (v == null || v === "") return null;
  if (typeof v === "number") return Number.isFinite(v) ? v : null;
  let s = String(v).trim().replace(/[R$\s]/g, "");
  if (!s) return null;
  if (/,\d{1,2}$/.test(s)) s = s.replace(/\./g, "").replace(",", ".");
  else if ((s.match(/\./g) || []).length > 1) s = s.replace(/\./g, "");
  const n = Number(s.replace(/,/g, ""));
  return Number.isFinite(n) ? n : null;
}

interface PreviewRow extends ImportUnitRow {
  erros: string[];
}

export function UnidadesImportExport({
  projectId,
  projectName,
  units,
  canImport,
}: {
  projectId: string;
  projectName: string;
  units: UnitExport[];
  canImport: boolean;
}) {
  const router = useRouter();
  const fileRef = useRef<HTMLInputElement>(null);
  const [pending, start] = useTransition();
  const [preview, setPreview] = useState<PreviewRow[] | null>(null);
  const [msg, setMsg] = useState<string | null>(null);
  const [erro, setErro] = useState<string | null>(null);

  const exportar = () => {
    const aoa: (string | number)[][] = [HEADERS];
    for (const u of units)
      aoa.push([
        u.code,
        u.bloco ?? "",
        u.tipo ?? "",
        u.m2 ? Number(u.m2) : "",
        u.andar ?? "",
        Number(u.valor) || 0,
        u.status,
      ]);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(aoa), "Unidades");
    baixarXlsx(wb, `unidades-${projectName.replace(/[^\w]+/g, "_")}.xlsx`);
  };

  const modelo = () => {
    const wb = XLSX.utils.book_new();
    const aoa = [HEADERS, ["101", "A", "Apartamento", 65.5, 10, 350000, "Disponivel"]];
    XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(aoa), "Unidades");
    baixarXlsx(wb, "modelo-unidades.xlsx");
  };

  const onFile = async (file: File) => {
    setMsg(null);
    setErro(null);
    setPreview(null);
    try {
      const wb = XLSX.read(await file.arrayBuffer(), { cellDates: false });
      const ws = wb.Sheets["Unidades"] ?? wb.Sheets[wb.SheetNames[0]];
      const grid = XLSX.utils
        .sheet_to_json<unknown[]>(ws, { header: 1, raw: true, defval: "" })
        .filter((r) => r.some((c) => String(c ?? "").trim()));
      if (grid.length < 2) {
        setErro("Planilha vazia ou sem linhas de dados.");
        return;
      }
      const head = (grid[0] as unknown[]).map((c) => String(c ?? "").trim().toLowerCase());
      const idx = (aliases: string[]) => head.findIndex((h) => aliases.some((a) => h.includes(a)));
      const iCode = idx(["código", "codigo", "unidade", "code"]);
      const iBloco = idx(["bloco"]);
      const iTipo = idx(["tipo"]);
      const iM2 = idx(["m2", "m²", "area", "área"]);
      const iAndar = idx(["andar"]);
      const iValor = idx(["valor", "preço", "preco"]);
      const iStatus = idx(["status", "situa"]);
      if (iCode < 0) {
        setErro('Coluna "Código" não encontrada. Baixe o modelo e use os mesmos cabeçalhos.');
        return;
      }
      const codesVistos = new Set<string>();
      const existentes = new Set(units.map((u) => u.code.trim().toLowerCase()));
      const rows: PreviewRow[] = [];
      for (const r of grid.slice(1)) {
        const cell = (i: number) => (i >= 0 ? String((r as unknown[])[i] ?? "").trim() : "");
        const code = cell(iCode);
        if (!code) continue;
        const erros: string[] = [];
        const key = code.toLowerCase();
        if (codesVistos.has(key)) erros.push("código duplicado na planilha");
        codesVistos.add(key);
        if (existentes.has(key)) erros.push("já existe uma unidade com este código no projeto");
        const m2 = iM2 >= 0 ? num((r as unknown[])[iM2]) : null;
        const andarN = iAndar >= 0 ? num((r as unknown[])[iAndar]) : null;
        const valor = iValor >= 0 ? num((r as unknown[])[iValor]) : null;
        let status = cell(iStatus) || "Disponivel";
        if (!STATUS_VALIDOS.includes(status)) {
          erros.push(`status inválido "${status}" (use ${STATUS_VALIDOS.join("/")})`);
          status = "Disponivel";
        }
        rows.push({
          code,
          bloco: cell(iBloco) || undefined,
          tipo: cell(iTipo) || undefined,
          m2: m2 ?? undefined,
          andar: andarN != null ? Math.trunc(andarN) : undefined,
          valor: valor ?? 0,
          status: status as ImportUnitRow["status"],
          erros,
        });
      }
      if (rows.length === 0) {
        setErro("Nenhuma linha com código preenchido.");
        return;
      }
      setPreview(rows);
    } catch (e) {
      setErro(e instanceof Error ? e.message : "Falha ao ler a planilha.");
    }
  };

  const validas = preview?.filter((r) => r.erros.length === 0) ?? [];
  const comErro = preview?.filter((r) => r.erros.length > 0) ?? [];

  const confirmar = () => {
    if (validas.length === 0) return;
    setErro(null);
    start(async () => {
      try {
        const res = await importUnits(
          validas.map(({ erros, ...r }) => { void erros; return r; }),
          projectId,
        );
        setMsg(`${res.inserted} unidade(s) importada(s) para ${projectName}.`);
        setPreview(null);
        router.refresh();
      } catch (e) {
        setErro(e instanceof Error ? e.message : "Falha ao importar.");
      }
    });
  };

  return (
    <div className="space-y-2">
      <div className="flex flex-wrap items-center gap-2">
        <Button variant="outline" size="sm" onClick={exportar} disabled={pending}>
          ⬇ Exportar planilha
        </Button>
        <Button variant="outline" size="sm" onClick={modelo} disabled={pending}>
          Modelo
        </Button>
        {canImport && (
          <>
            <input
              ref={fileRef}
              type="file"
              accept=".xlsx,.xls,.csv"
              hidden
              onChange={(e) => {
                const f = e.target.files?.[0];
                e.target.value = "";
                if (f) onFile(f);
              }}
            />
            <Button variant="outline" size="sm" onClick={() => fileRef.current?.click()} disabled={pending}>
              ⬆ Importar planilha
            </Button>
          </>
        )}
        {msg && <span className="text-xs text-[var(--color-success)]">{msg}</span>}
        {erro && <span className="text-xs text-[var(--color-danger)]">{erro}</span>}
      </div>

      {preview && (
        <Card>
          <CardContent className="p-4">
            <div className="mb-2 flex flex-wrap items-center gap-2">
              <h3 className="text-sm font-semibold text-[var(--color-ink)]">
                Pré-visualização — {projectName}
              </h3>
              <Badge tone="success">{validas.length} válidas</Badge>
              {comErro.length > 0 && <Badge tone="danger">{comErro.length} com erro</Badge>}
            </div>
            <div className="max-h-[360px] overflow-auto rounded-[8px] border border-[var(--color-accent2)]/12">
              <table className="w-full border-collapse text-[12.5px]">
                <thead className="sticky top-0 bg-[var(--color-surface2)] text-left font-[family-name:var(--font-mono)] text-[10px] uppercase text-[var(--color-ink3)]">
                  <tr>
                    <th className="px-2 py-2">Código</th>
                    <th className="px-2 py-2">Bloco</th>
                    <th className="px-2 py-2">Tipo</th>
                    <th className="px-2 py-2 text-right">m²</th>
                    <th className="px-2 py-2 text-right">Andar</th>
                    <th className="px-2 py-2 text-right">Valor</th>
                    <th className="px-2 py-2">Status</th>
                    <th className="px-2 py-2">Validação</th>
                  </tr>
                </thead>
                <tbody>
                  {preview.map((r, i) => (
                    <tr
                      key={i}
                      className={`border-t border-[var(--color-accent2)]/8 ${r.erros.length ? "bg-[var(--color-danger)]/5" : ""}`}
                    >
                      <td className="px-2 py-1.5 font-medium">{r.code}</td>
                      <td className="px-2 py-1.5">{r.bloco ?? "—"}</td>
                      <td className="px-2 py-1.5">{r.tipo ?? "—"}</td>
                      <td className="px-2 py-1.5 text-right font-[family-name:var(--font-mono)]">{r.m2 ?? "—"}</td>
                      <td className="px-2 py-1.5 text-right font-[family-name:var(--font-mono)]">{r.andar ?? "—"}</td>
                      <td className="px-2 py-1.5 text-right font-[family-name:var(--font-mono)]">
                        {(r.valor ?? 0).toLocaleString("pt-BR", { minimumFractionDigits: 2 })}
                      </td>
                      <td className="px-2 py-1.5">{r.status}</td>
                      <td className="px-2 py-1.5 text-[var(--color-danger)]">
                        {r.erros.length ? r.erros.join("; ") : "✓"}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <div className="mt-3 flex items-center justify-end gap-2">
              <Button variant="outline" size="sm" onClick={() => setPreview(null)} disabled={pending}>
                Cancelar
              </Button>
              <Button size="sm" onClick={confirmar} disabled={pending || validas.length === 0}>
                {pending ? "Importando…" : `Importar ${validas.length} unidade(s)`}
              </Button>
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
