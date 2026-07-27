"use client";

import { useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import * as XLSX from "xlsx";
import {
  importCash,
  extractExtratoPdf,
  matchCandidatosMovimento,
  pairMovimento,
  type ImportCashRow,
  type CandidatoMatch,
} from "@/lib/actions/caixa";
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

export function ImportExtratoButton({
  contas,
  aiConfigured = false,
}: {
  contas: Conta[];
  aiConfigured?: boolean;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  const router = useRouter();
  const [pending, start] = useTransition();
  const [reading, startReading] = useTransition();
  const [msg, setMsg] = useState<string | null>(null);
  const [erro, setErro] = useState<string | null>(null);
  const [bankAccountId, setBankAccountId] = useState("");
  const [saldoFinal, setSaldoFinal] = useState("");
  const [preview, setPreview] = useState<PreviewRow[] | null>(null);
  const [resumo, setResumo] = useState<{ reconhecidos: number; ignorados: number } | null>(null);
  // Pareamento (modal): linha em conciliação, candidatos e estados de carga.
  const [matching, setMatching] = useState<PreviewRow | null>(null);
  const [cands, setCands] = useState<CandidatoMatch[] | null>(null);
  const [loadingCands, startCands] = useTransition();
  const [pairing, startPairing] = useTransition();
  const [modalErro, setModalErro] = useState<string | null>(null);

  const isPdfOrImage = (file: File) =>
    file.type === "application/pdf" || file.type.startsWith("image/");

  async function onFile(file: File) {
    setMsg(null);
    setErro(null);
    setPreview(null);
    // PDF/imagem: leitura por IA no servidor (mesma tela de conferência).
    if (isPdfOrImage(file)) {
      const fd = new FormData();
      fd.set("file", file);
      if (bankAccountId) fd.set("bankAccountId", bankAccountId);
      startReading(async () => {
        try {
          const res = await extractExtratoPdf(fd);
          if (res.error) {
            setErro(res.error);
            return;
          }
          const rows: PreviewRow[] = res.movimentos.map((m) => ({
            incluir: true,
            data: m.data,
            descricao: m.descricao,
            doc: m.doc,
            valor: m.valor,
            tipo: m.valor >= 0 ? "entrada" : "saida",
          }));
          if (rows.length === 0) {
            setErro(
              "Nenhuma movimentação foi reconhecida no PDF. Verifique se o extrato está legível (não protegido/escaneado sem texto).",
            );
            return;
          }
          setPreview(rows);
          setResumo({ reconhecidos: rows.length, ignorados: 0 });
          if (res.saldoFinal != null && !saldoFinal) setSaldoFinal(String(res.saldoFinal));
        } catch (e) {
          setErro(e instanceof Error ? e.message : "Falha ao ler o PDF do extrato.");
        }
      });
      return;
    }
    // XLSX/CSV: parsing local (comportamento existente, inalterado).
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

  const visiveis = preview ?? [];
  const totEntradas = visiveis
    .filter((r) => r.tipo === "entrada")
    .reduce((a, r) => a + r.valor, 0);
  const totSaidas = visiveis
    .filter((r) => r.tipo === "saida")
    .reduce((a, r) => a + Math.abs(r.valor), 0);

  // Remove uma linha da conferência por REFERÊNCIA (robusto a mudanças de índice
  // enquanto o modal de pareamento está aberto).
  const removeRow = (r: PreviewRow) =>
    setPreview((s) => {
      const next = s ? s.filter((x) => x !== r) : s;
      return next && next.length ? next : null;
    });

  /** Link "Adicionar": abre o cadastro pré-preenchido (nova aba). */
  function addHref(r: PreviewRow): string {
    if (r.tipo === "saida") {
      const p = new URLSearchParams({ tab: "lancamentos", novo: "1" });
      p.set("pf_valor", String(Math.abs(r.valor)));
      if (r.data) {
        p.set("pf_venc", r.data);
        const parts = r.data.split("/");
        if (parts.length === 3) p.set("pf_comp", `${parts[0]}/${parts[2]}`);
      }
      if (r.doc) p.set("pf_doc", r.doc);
      return `/despesas?${p.toString()}`;
    }
    // Entrada → cadastro de contas a receber.
    return "/contasreceber";
  }

  function abrirParear(r: PreviewRow) {
    setModalErro(null);
    setCands(null);
    setMatching(r);
    startCands(async () => {
      try {
        const res = await matchCandidatosMovimento({
          data: r.data,
          descricao: r.descricao,
          valor: r.valor,
          doc: r.doc,
        });
        setCands(res.candidatos);
      } catch {
        setModalErro("Falha ao buscar candidatos de conciliação.");
        setCands([]);
      }
    });
  }

  function confirmarPar(c: CandidatoMatch) {
    const r = matching;
    if (!r) return;
    setModalErro(null);
    startPairing(async () => {
      const res = await pairMovimento({
        mov: { data: r.data, descricao: r.descricao, valor: r.valor, doc: r.doc },
        bankAccountId: bankAccountId || null,
        alvoId: c.id,
        alvoTipo: c.tipo,
      });
      if (res.ok) {
        setMatching(null);
        setCands(null);
        removeRow(r);
        setMsg(
          `Movimento conciliado com ${c.tipo === "despesa" ? "a despesa" : "a conta a receber"} de ${c.nome}.`,
        );
        router.refresh();
      } else {
        setModalErro(res.error ?? "Falha ao conciliar o movimento.");
      }
    });
  }

  /** Importa as linhas restantes como movimentos de caixa (concilia automático). */
  function importarRestantes() {
    if (!preview || preview.length === 0) return;
    setErro(null);
    const rows: ImportCashRow[] = preview.map((r) => ({
      data: r.data || undefined,
      descricao: r.descricao,
      valor: r.valor,
      doc: r.doc || undefined,
      cat: "extrato",
    }));
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
          accept={
            aiConfigured
              ? ".xlsx,.xls,.csv,application/pdf,image/png,image/jpeg,image/webp"
              : ".xlsx,.xls,.csv,application/pdf"
          }
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
            disabled={pending || reading || !bankAccountId}
            onClick={() => inputRef.current?.click()}
          >
            {reading ? "Lendo PDF…" : "Selecionar arquivo (XLSX/CSV/PDF)"}
          </Button>
        </div>
        <p className="mt-2 text-[11.5px] leading-relaxed text-[var(--color-ink3)]">
          Selecione a conta e o arquivo do extrato (XLSX, CSV ou <strong>PDF</strong>).
          O sistema lê Data, Histórico, Documento e Valor, mostra uma{" "}
          <strong>pré-visualização</strong> para você revisar e escolher o que
          importar, e concilia com as despesas/receitas previstas. Lançamentos já
          importados são ignorados. O PDF original fica armazenado para auditoria.
          {aiConfigured
            ? " Com IA ativa, também lê extratos em imagem e PDFs escaneados."
            : " (Só PDF com texto; escaneados/imagem exigem IA — ative em Config → Diagnóstico de IA.)"}
        </p>
        {!bankAccountId && contas.length === 0 && (
          <p className="mt-1 text-[11.5px] text-[var(--color-warning)]">
            Cadastre uma conta corrente em Contas Correntes para importar o extrato.
          </p>
        )}
        {erro && <p className="mt-2 text-xs text-[var(--color-danger)]">{erro}</p>}
        {msg && <p className="mt-2 text-xs text-[var(--color-success)]">{msg}</p>}
      </div>

      {/* Pré-visualização / triagem: cada linha tem 3 ações (Adicionar / Parear /
          Ignorar). O que sobrar pode ser importado em lote como movimento. */}
      {preview && (
        <Card>
          <CardContent className="p-4">
            <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
              <div className="flex flex-wrap items-center gap-2">
                <h3 className="text-sm font-semibold text-[var(--color-ink)]">
                  Pré-visualização do extrato
                </h3>
                <Badge tone="neutral">{visiveis.length} pendentes</Badge>
                {resumo && resumo.ignorados > 0 && (
                  <Badge tone="warning">{resumo.ignorados} ignorados (saldo/total)</Badge>
                )}
              </div>
              <p className="font-[family-name:var(--font-mono)] text-[11px] text-[var(--color-ink3)]">
                Adicionar = cadastra · Parear = concilia com projeção · Ignorar = descarta
              </p>
            </div>

            <div className="tbl-scroll max-h-[440px] overflow-auto rounded-[8px] border border-[var(--color-accent2)]/12">
              <table className="w-full border-collapse text-[12.5px]">
                <thead className="sticky top-0 z-10 bg-[var(--color-surface2)]">
                  <tr className="text-left font-[family-name:var(--font-mono)] text-[10px] uppercase tracking-wide text-[var(--color-ink3)]">
                    <th className="px-2 py-2">Data</th>
                    <th className="px-2 py-2">Descrição</th>
                    <th className="px-2 py-2">Documento</th>
                    <th className="px-2 py-2 text-right">Valor</th>
                    <th className="px-2 py-2">Tipo</th>
                    <th className="px-2 py-2 text-right">Ações</th>
                  </tr>
                </thead>
                <tbody>
                  {visiveis.map((r, i) => (
                    <tr key={i} className="border-t border-[var(--color-accent2)]/8">
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
                      <td className="px-2 py-1.5">
                        <div className="flex items-center justify-end gap-1.5 whitespace-nowrap">
                          <Link
                            href={addHref(r)}
                            target="_blank"
                            onClick={() => removeRow(r)}
                            className="rounded-[6px] bg-[var(--color-accent2)] px-2 py-1 text-[11px] font-medium text-white hover:opacity-90"
                            title={
                              r.tipo === "saida"
                                ? "Abrir cadastro de despesa pré-preenchido (nova aba)"
                                : "Abrir contas a receber (nova aba)"
                            }
                          >
                            Adicionar
                          </Link>
                          <button
                            onClick={() => abrirParear(r)}
                            className="rounded-[6px] border border-[var(--color-accent2)]/40 px-2 py-1 text-[11px] font-medium text-[var(--color-accent2)] hover:bg-[var(--color-accent4)]"
                            title="Parear com uma despesa/receita já lançada"
                          >
                            Parear
                          </button>
                          <button
                            onClick={() => removeRow(r)}
                            className="rounded-[6px] border border-[var(--color-accent2)]/20 px-2 py-1 text-[11px] text-[var(--color-ink3)] hover:bg-[var(--color-surface2)]"
                            title="Ignorar esta linha"
                          >
                            Ignorar
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))}
                  {visiveis.length === 0 && (
                    <tr>
                      <td colSpan={6} className="px-2 py-6 text-center text-[var(--color-ink4)]">
                        Todas as linhas foram tratadas.
                      </td>
                    </tr>
                  )}
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
                  Fechar
                </Button>
                <Button
                  variant="outline"
                  onClick={importarRestantes}
                  disabled={pending || visiveis.length === 0}
                  title="Importa as linhas restantes como movimentos de caixa (concilia automaticamente por valor/mês)"
                >
                  {pending ? "Importando…" : `Importar ${visiveis.length} como movimento`}
                </Button>
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Modal de pareamento (Parear): candidatos de conciliação. */}
      {matching && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4"
          onClick={() => {
            if (!pairing) {
              setMatching(null);
              setCands(null);
            }
          }}
        >
          <div
            className="max-h-[85vh] w-full max-w-2xl overflow-auto rounded-[12px] bg-white p-5 shadow-xl"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="mb-1 flex items-start justify-between gap-3">
              <h3 className="text-sm font-semibold text-[var(--color-ink)]">
                Parear movimento com{" "}
                {matching.tipo === "saida" ? "conta a pagar" : "conta a receber"}
              </h3>
              <button
                onClick={() => {
                  if (!pairing) {
                    setMatching(null);
                    setCands(null);
                  }
                }}
                className="text-[var(--color-ink3)] hover:text-[var(--color-ink)]"
              >
                ✕
              </button>
            </div>
            <p className="mb-3 text-[12px] text-[var(--color-ink3)]">
              {matching.data ? dateBR(matching.data) : "—"} · {matching.descricao} ·{" "}
              <strong
                className={
                  matching.valor < 0 ? "text-[var(--color-danger)]" : "text-[var(--color-success)]"
                }
              >
                {brl(matching.valor)}
              </strong>
            </p>

            {loadingCands && (
              <p className="py-6 text-center text-[12px] text-[var(--color-ink3)]">
                Buscando candidatos…
              </p>
            )}

            {!loadingCands && cands && cands.length === 0 && (
              <div className="rounded-[8px] border border-[var(--color-accent2)]/12 bg-[var(--color-surface2)] p-4 text-center">
                <p className="text-[12.5px] text-[var(--color-ink2)]">
                  Nenhuma {matching.tipo === "saida" ? "despesa" : "receita"} lançada compatível
                  (mesmo valor aproximado) foi encontrada.
                </p>
                <p className="mt-1 text-[11.5px] text-[var(--color-ink3)]">
                  Use <strong>Adicionar</strong> para cadastrar, ou{" "}
                  <strong>Ignorar</strong> para descartar.
                </p>
              </div>
            )}

            {!loadingCands && cands && cands.length > 0 && (
              <div className="space-y-2">
                {cands.map((c) => (
                  <div
                    key={c.id}
                    className="flex items-center justify-between gap-3 rounded-[8px] border border-[var(--color-accent2)]/12 p-3"
                  >
                    <div className="min-w-0">
                      <div className="flex items-center gap-2">
                        <Badge tone={grauTone(c.grau)}>{grauLabel(c.grau)}</Badge>
                        <span className="truncate text-[13px] font-medium text-[var(--color-ink)]">
                          {c.nome}
                        </span>
                      </div>
                      <div className="mt-0.5 truncate text-[11.5px] text-[var(--color-ink3)]">
                        {c.descricao}
                        {c.projectName ? ` · ${c.projectName}` : ""}
                        {c.vencimento ? ` · venc. ${dateBR(c.vencimento)}` : ""}
                      </div>
                    </div>
                    <div className="flex items-center gap-3 whitespace-nowrap">
                      <span className="font-[family-name:var(--font-mono)] text-[12.5px] text-[var(--color-ink2)]">
                        {brl(c.valor)}
                      </span>
                      <Button size="sm" onClick={() => confirmarPar(c)} disabled={pairing}>
                        {pairing ? "Conciliando…" : "Conciliar"}
                      </Button>
                    </div>
                  </div>
                ))}
              </div>
            )}

            {modalErro && (
              <p className="mt-3 text-xs text-[var(--color-danger)]">{modalErro}</p>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

const grauTone = (g: "alta" | "media" | "baixa") =>
  g === "alta" ? "success" : g === "media" ? "warning" : "neutral";
const grauLabel = (g: "alta" | "media" | "baixa") =>
  g === "alta" ? "Alta compatibilidade" : g === "media" ? "Média" : "Baixa";
