"use client";

import { useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import * as XLSX from "xlsx";
import { importCash, type ImportCashRow } from "@/lib/actions/caixa";
import { Button } from "@/components/ui/button";
import { Input, Label, Select } from "@/components/ui/input";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { dateBR } from "@/lib/utils";

interface Conta {
  id: string;
  banco: string;
  cc: string | null;
}

const brl = (v: number) =>
  v.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });

// ─────────────────────────── Parsing robusto ───────────────────────────────

/** Converte texto/valor monetário em número, tolerando formatos BR e US. */
function parseMoney(v: unknown): number | null {
  if (v == null || v === "") return null;
  if (typeof v === "number") return Number.isFinite(v) ? v : null;
  let s = String(v).trim();
  if (!s) return null;
  s = s.replace(/r\$/i, "").trim();
  let neg = false;
  if (/^\(.*\)$/.test(s)) {
    neg = true;
    s = s.slice(1, -1);
  }
  if (/^-\s*/.test(s)) {
    neg = true;
    s = s.replace(/^-\s*/, "");
  }
  if (/-\s*$/.test(s)) {
    neg = true;
    s = s.replace(/-\s*$/, "");
  }
  s = s.replace(/\s/g, "");
  if (!/[0-9]/.test(s)) return null;
  const hasComma = s.includes(",");
  const hasDot = s.includes(".");
  let normd: string;
  if (hasComma && hasDot) {
    normd =
      s.lastIndexOf(",") > s.lastIndexOf(".")
        ? s.replace(/\./g, "").replace(",", ".")
        : s.replace(/,/g, "");
  } else if (hasComma) {
    const after = s.length - s.lastIndexOf(",") - 1;
    normd = after <= 2 ? s.replace(",", ".") : s.replace(/,/g, "");
  } else if (hasDot) {
    const dots = (s.match(/\./g) || []).length;
    const after = s.length - s.lastIndexOf(".") - 1;
    normd = dots === 1 && after <= 2 ? s : s.replace(/\./g, "");
  } else {
    normd = s;
  }
  const n = Number(normd);
  if (!Number.isFinite(n)) return null;
  return neg ? -n : n;
}

/** Converte data em texto/Date para o formato interno "MM/DD/YYYY". */
function toInternalDate(v: unknown): string {
  if (v == null || v === "") return "";
  if (v instanceof Date) {
    return `${String(v.getMonth() + 1).padStart(2, "0")}/${String(v.getDate()).padStart(2, "0")}/${v.getFullYear()}`;
  }
  const s = String(v).trim();
  const br = s.match(/^(\d{1,2})[/\-.](\d{1,2})[/\-.](\d{2,4})/);
  if (br) {
    let y = br[3];
    if (y.length === 2) y = "20" + y;
    return `${br[2].padStart(2, "0")}/${br[1].padStart(2, "0")}/${y}`;
  }
  const iso = s.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (iso) return `${iso[2]}/${iso[3]}/${iso[1]}`;
  return "";
}

const norm = (s: string) =>
  s.toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "").trim();

interface PreviewRow {
  incluir: boolean;
  data: string; // interno MM/DD/YYYY
  descricao: string;
  doc: string;
  valor: number;
  tipo: "entrada" | "saida";
}
interface ParseResult {
  rows: PreviewRow[];
  headers: string[];
  reconhecidos: number;
  ignorados: number;
}

/** Localiza o índice de coluna cujo cabeçalho casa com um dos apelidos. */
function findCol(headers: string[], aliases: string[]): number {
  return headers.findIndex((h) => aliases.some((a) => norm(h).includes(a)));
}

function parseSheet(aoa: unknown[][]): ParseResult {
  // Acha a linha de cabeçalho: contém "valor" e uma coluna de data/histórico.
  let headerIdx = -1;
  for (let i = 0; i < Math.min(aoa.length, 15); i++) {
    const cells = (aoa[i] || []).map((c) => norm(String(c ?? "")));
    const temValor = cells.some((c) => c.includes("valor") || c === "amount");
    const temData = cells.some((c) => c.includes("data") || c.includes("date"));
    const temHist = cells.some(
      (c) => c.includes("hist") || c.includes("descri") || c.includes("memo"),
    );
    if (temValor && (temData || temHist)) {
      headerIdx = i;
      break;
    }
  }
  if (headerIdx < 0)
    throw new Error(
      "Não encontrei a linha de cabeçalho do extrato (com colunas de Data e Valor). Verifique se o arquivo é um extrato bancário válido.",
    );

  const headers = (aoa[headerIdx] || []).map((c) => String(c ?? ""));
  const iDataMov = findCol(headers, ["data movimento", "data do movimento"]);
  const iData = iDataMov >= 0 ? iDataMov : findCol(headers, ["data lancamento", "data", "date"]);
  const iDesc = findCol(headers, ["histor", "descri", "memo", "lancamento"]);
  const iDoc = findCol(headers, ["documento", "doc"]);
  const iValor = findCol(headers, ["valor lancamento", "valor", "amount", "credito"]);
  const iNome = findCol(headers, ["nome", "razao", "favorecido"]);

  const faltando: string[] = [];
  if (iData < 0) faltando.push("Data");
  if (iValor < 0) faltando.push("Valor");
  if (faltando.length) {
    throw new Error(
      `Colunas obrigatórias não encontradas: ${faltando.join(", ")}. Cabeçalhos lidos: ${headers
        .filter(Boolean)
        .join(" | ")}.`,
    );
  }

  const rows: PreviewRow[] = [];
  let ignorados = 0;
  for (let i = headerIdx + 1; i < aoa.length; i++) {
    const r = aoa[i] || [];
    const valor = parseMoney(r[iValor]);
    const descRaw = String(r[iDesc] ?? "").trim();
    const nome = iNome >= 0 ? String(r[iNome] ?? "").trim() : "";
    const doc = iDoc >= 0 ? String(r[iDoc] ?? "").trim() : "";
    const isTotalRow = /saldo|total/i.test(descRaw);
    if (valor == null || valor === 0 || isTotalRow) {
      if (descRaw || r.some((c) => String(c ?? "").trim())) ignorados++;
      continue;
    }
    const data = toInternalDate(r[iData]);
    const descricao = [descRaw, nome].filter(Boolean).join(" · ");
    rows.push({
      incluir: true,
      data,
      descricao: descricao || "—",
      doc,
      valor,
      tipo: valor >= 0 ? "entrada" : "saida",
    });
  }
  return { rows, headers: headers.filter(Boolean), reconhecidos: rows.length, ignorados };
}

// ─────────────────────────── Componente ────────────────────────────────────

export function ImportExtratoButton({ contas }: { contas: Conta[] }) {
  const inputRef = useRef<HTMLInputElement>(null);
  const router = useRouter();
  const [pending, start] = useTransition();
  const [msg, setMsg] = useState<string | null>(null);
  const [erro, setErro] = useState<string | null>(null);
  const [bankAccountId, setBankAccountId] = useState("");
  const [saldoFinal, setSaldoFinal] = useState("");
  const [preview, setPreview] = useState<PreviewRow[] | null>(null);
  const [resumo, setResumo] = useState<{ reconhecidos: number; ignorados: number } | null>(null);

  async function onFile(file: File) {
    setMsg(null);
    setErro(null);
    setPreview(null);
    try {
      const wb = XLSX.read(await file.arrayBuffer(), { cellDates: true });
      const ws = wb.Sheets[wb.SheetNames[0]];
      const aoa = XLSX.utils.sheet_to_json<unknown[]>(ws, {
        header: 1,
        raw: false,
        defval: "",
        blankrows: false,
      });
      const res = parseSheet(aoa);
      if (res.rows.length === 0) {
        setErro(
          `Nenhum lançamento com valor foi reconhecido (${res.ignorados} linhas ignoradas). Confira as colunas de Data e Valor do arquivo.`,
        );
        return;
      }
      setPreview(res.rows);
      setResumo({ reconhecidos: res.reconhecidos, ignorados: res.ignorados });
    } catch (e) {
      setErro(e instanceof Error ? e.message : "Falha ao ler o arquivo.");
    }
  }

  const selecionados = preview?.filter((r) => r.incluir) ?? [];
  const totEntradas = selecionados
    .filter((r) => r.tipo === "entrada")
    .reduce((a, r) => a + r.valor, 0);
  const totSaidas = selecionados
    .filter((r) => r.tipo === "saida")
    .reduce((a, r) => a + Math.abs(r.valor), 0);

  const toggle = (idx: number) =>
    setPreview((s) => (s ? s.map((r, i) => (i === idx ? { ...r, incluir: !r.incluir } : r)) : s));
  const marcarTodos = (v: boolean) =>
    setPreview((s) => (s ? s.map((r) => ({ ...r, incluir: v })) : s));

  function confirmar() {
    if (!preview) return;
    setErro(null);
    const rows: ImportCashRow[] = selecionados.map((r) => ({
      data: r.data || undefined,
      descricao: r.descricao,
      valor: r.valor,
      doc: r.doc || undefined,
      cat: "extrato",
    }));
    if (rows.length === 0) {
      setErro("Selecione ao menos um lançamento para importar.");
      return;
    }
    const saldo = parseMoney(saldoFinal);
    start(async () => {
      try {
        const res = await importCash({
          rows,
          bankAccountId: bankAccountId || null,
          saldoFinal: saldo,
        });
        const parts = [`${res.inserted} lançamentos importados`];
        if (res.conciliated > 0) parts.push(`${res.conciliated} conciliados automaticamente`);
        if (res.skipped > 0) parts.push(`${res.skipped} ignorados (já importados)`);
        if (res.saldoUpdated && saldo != null) parts.push(`saldo atualizado para ${brl(saldo)}`);
        setMsg(parts.join(" · ") + ".");
        setPreview(null);
        setResumo(null);
        setSaldoFinal("");
        router.refresh();
      } catch (e) {
        setErro(e instanceof Error ? e.message : "Falha na importação.");
      }
    });
  }

  return (
    <div className="space-y-3">
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
            Selecionar arquivo (XLSX/CSV)
          </Button>
        </div>
        <p className="mt-2 text-[11.5px] leading-relaxed text-[var(--color-ink3)]">
          Selecione a conta e o arquivo do extrato. O sistema lê as colunas de
          Data, Histórico, Documento e Valor (formatos brasileiro e americano,
          valores positivos/negativos), mostra uma{" "}
          <strong>pré-visualização</strong> para você escolher o que importar e
          concilia automaticamente com as despesas/receitas previstas.
          Lançamentos já importados são ignorados.
        </p>
        {!bankAccountId && contas.length === 0 && (
          <p className="mt-1 text-[11.5px] text-[var(--color-warning)]">
            Cadastre uma conta corrente em Contas Correntes para importar o extrato.
          </p>
        )}
        {erro && <p className="mt-2 text-xs text-[var(--color-danger)]">{erro}</p>}
        {msg && <p className="mt-2 text-xs text-[var(--color-success)]">{msg}</p>}
      </div>

      {/* Pré-visualização / conciliação */}
      {preview && (
        <Card>
          <CardContent className="p-4">
            <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
              <div className="flex flex-wrap items-center gap-2">
                <h3 className="text-sm font-semibold text-[var(--color-ink)]">
                  Pré-visualização do extrato
                </h3>
                <Badge tone="neutral">{resumo?.reconhecidos ?? preview.length} reconhecidos</Badge>
                {resumo && resumo.ignorados > 0 && (
                  <Badge tone="warning">{resumo.ignorados} ignorados (saldo/total)</Badge>
                )}
                <Badge tone="success">{selecionados.length} selecionados</Badge>
              </div>
              <div className="flex items-center gap-2">
                <button
                  className="text-[11px] text-[var(--color-accent2)] hover:underline"
                  onClick={() => marcarTodos(true)}
                >
                  marcar todos
                </button>
                <button
                  className="text-[11px] text-[var(--color-ink3)] hover:underline"
                  onClick={() => marcarTodos(false)}
                >
                  desmarcar
                </button>
              </div>
            </div>

            <div className="max-h-[420px] overflow-auto rounded-[8px] border border-[var(--color-accent2)]/12">
              <table className="w-full border-collapse text-[12.5px]">
                <thead className="sticky top-0 bg-[var(--color-surface2)]">
                  <tr className="text-left font-[family-name:var(--font-mono)] text-[10px] uppercase tracking-wide text-[var(--color-ink3)]">
                    <th className="w-8 px-2 py-2"></th>
                    <th className="px-2 py-2">Data</th>
                    <th className="px-2 py-2">Descrição</th>
                    <th className="px-2 py-2">Documento</th>
                    <th className="px-2 py-2 text-right">Valor</th>
                    <th className="px-2 py-2">Tipo</th>
                  </tr>
                </thead>
                <tbody>
                  {preview.map((r, i) => (
                    <tr
                      key={i}
                      className={`border-t border-[var(--color-accent2)]/8 ${
                        r.incluir ? "" : "opacity-40"
                      }`}
                    >
                      <td className="px-2 py-1.5">
                        <input
                          type="checkbox"
                          checked={r.incluir}
                          onChange={() => toggle(i)}
                          className="h-4 w-4 accent-[var(--color-accent2)]"
                        />
                      </td>
                      <td className="whitespace-nowrap px-2 py-1.5 font-[family-name:var(--font-mono)] text-[var(--color-ink2)]">
                        {r.data ? dateBR(r.data) : "—"}
                      </td>
                      <td className="px-2 py-1.5 text-[var(--color-ink)]">{r.descricao}</td>
                      <td className="px-2 py-1.5 font-[family-name:var(--font-mono)] text-[var(--color-ink3)]">
                        {r.doc || "—"}
                      </td>
                      <td
                        className={`whitespace-nowrap px-2 py-1.5 text-right font-[family-name:var(--font-mono)] ${
                          r.valor < 0 ? "text-[var(--color-danger)]" : "text-[var(--color-success)]"
                        }`}
                      >
                        {brl(r.valor)}
                      </td>
                      <td className="px-2 py-1.5">
                        <Badge tone={r.tipo === "entrada" ? "success" : "danger"}>
                          {r.tipo === "entrada" ? "Entrada" : "Saída"}
                        </Badge>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            <div className="mt-3 flex flex-wrap items-center justify-between gap-3">
              <p className="text-[12px] text-[var(--color-ink3)]">
                Entradas <strong className="text-[var(--color-success)]">{brl(totEntradas)}</strong> ·
                Saídas <strong className="text-[var(--color-danger)]">{brl(totSaidas)}</strong>
              </p>
              <div className="flex items-center gap-2">
                <Button variant="outline" onClick={() => setPreview(null)} disabled={pending}>
                  Cancelar
                </Button>
                <Button onClick={confirmar} disabled={pending || selecionados.length === 0}>
                  {pending ? "Importando…" : `Importar ${selecionados.length} lançamento(s)`}
                </Button>
              </div>
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
