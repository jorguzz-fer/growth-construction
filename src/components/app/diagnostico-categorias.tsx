"use client";

import Link from "next/link";
import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import {
  reclassificarDespesas,
  type DespesaSuspeita,
} from "@/lib/actions/diagnostico";
import { brl0, dateBR } from "@/lib/utils";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Label, Select } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Table, THead, TH, TR, TD } from "@/components/ui/table";

/**
 * Reclassificação ASSISTIDA de lançamentos históricos.
 *
 * O fluxo é deliberadamente lento: marcar → escolher a categoria → ver o
 * preview do que exatamente vai mudar → confirmar. Nenhum caminho aplica
 * correção sem que o usuário tenha visto a lista item a item. Valor,
 * competência, vencimento, status e número PED nunca são tocados.
 */
export function DiagnosticoCategorias({
  rows,
  categorias,
  canEditar,
}: {
  rows: DespesaSuspeita[];
  categorias: string[];
  canEditar: boolean;
}) {
  const router = useRouter();
  const [sel, setSel] = useState<Set<string>>(new Set());
  const [categoria, setCategoria] = useState("");
  const [preview, setPreview] = useState(false);
  const [pending, start] = useTransition();
  const [msg, setMsg] = useState<string | null>(null);
  const [erro, setErro] = useState<string | null>(null);

  // Só lançamentos ainda ativos podem ser reclassificados; os cancelados ficam
  // visíveis para conferência, mas fora da seleção.
  const selecionaveis = useMemo(
    () => rows.filter((r) => !r.motivos.includes("lançamento cancelado")),
    [rows],
  );
  const marcadas = useMemo(
    () => selecionaveis.filter((r) => sel.has(r.id)),
    [selecionaveis, sel],
  );

  const alternar = (id: string) =>
    setSel((s) => {
      const n = new Set(s);
      if (n.has(id)) n.delete(id);
      else n.add(id);
      return n;
    });

  const confirmar = () => {
    if (pending) return;
    setErro(null);
    setMsg(null);
    start(async () => {
      const res = await reclassificarDespesas([...sel], categoria);
      if (!res.ok) {
        setErro(res.error ?? "Falha ao reclassificar.");
        return;
      }
      setMsg(
        `${res.alteradas} lançamento(s) reclassificado(s) para "${categoria}". A alteração está registrada na auditoria.`,
      );
      setSel(new Set());
      setPreview(false);
      router.refresh();
    });
  };

  if (rows.length === 0) {
    return (
      <Card>
        <CardContent className="p-8 text-center text-[var(--color-ink3)]">
          Nenhum lançamento fora das regras novas. Nada a conferir.
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-4">
      <Card>
        <CardContent className="p-4 text-[13px] leading-relaxed text-[var(--color-ink2)]">
          Estes lançamentos foram gravados antes das validações novas e{" "}
          <strong>continuam íntegros, legíveis e editáveis</strong>. Eles não
          estão bloqueados nem foram alterados. Corrigir é opcional e sempre
          manual: marque os que quiser reclassificar, escolha a categoria,
          confira o preview e confirme. Valor, competência, vencimento, status e
          número PED não são tocados.
        </CardContent>
      </Card>

      <div className="flex flex-wrap items-center gap-3 text-[13px]">
        <Badge tone="warning">{rows.length} a conferir</Badge>
        <span className="text-[var(--color-ink3)]">
          Total{" "}
          <strong className="font-[family-name:var(--font-mono)] text-[var(--color-ink)]">
            {brl0(rows.reduce((a, r) => a + r.valor, 0))}
          </strong>
        </span>
        {sel.size > 0 && <Badge tone="info">{sel.size} selecionado(s)</Badge>}
      </div>

      {canEditar && selecionaveis.length > 0 && (
        <Card>
          <CardContent className="flex flex-wrap items-end gap-3 p-4">
            <div className="min-w-[240px]">
              <Label>Reclassificar os selecionados para</Label>
              <Select value={categoria} onChange={(e) => setCategoria(e.target.value)}>
                <option value="">Selecione...</option>
                {categorias.map((c) => (
                  <option key={c} value={c}>
                    {c}
                  </option>
                ))}
              </Select>
            </div>
            <Button
              type="button"
              disabled={sel.size === 0 || !categoria || pending}
              onClick={() => setPreview(true)}
            >
              Revisar {sel.size > 0 ? `${sel.size} lançamento(s)` : ""}
            </Button>
            <button
              type="button"
              onClick={() => setSel(new Set(selecionaveis.map((r) => r.id)))}
              className="text-[12px] text-[var(--color-accent2)] hover:underline"
            >
              Marcar todos
            </button>
            {sel.size > 0 && (
              <button
                type="button"
                onClick={() => setSel(new Set())}
                className="text-[12px] text-[var(--color-ink3)] hover:underline"
              >
                Limpar seleção
              </button>
            )}
          </CardContent>
        </Card>
      )}

      {msg && <p className="text-sm text-[var(--color-success)]">{msg}</p>}
      {erro && <p className="text-sm text-[var(--color-danger)]">{erro}</p>}

      <Card>
        <CardContent className="p-0">
          <Table wrapperClassName="max-h-[70vh] scroll-x-always" className="min-w-[1100px]">
            <THead className="sticky top-0 z-10">
              <tr>
                {canEditar && <TH className="w-8"></TH>}
                <TH>PED</TH>
                <TH>Projeto</TH>
                <TH>Fornecedor</TH>
                <TH>Categoria atual</TH>
                <TH>Competência</TH>
                <TH className="text-right">Valor</TH>
                <TH>Motivo</TH>
                <TH className="text-right">Abrir</TH>
              </tr>
            </THead>
            <tbody>
              {rows.map((r) => {
                const cancelada = r.motivos.includes("lançamento cancelado");
                return (
                  <TR key={r.id}>
                    {canEditar && (
                      <TD>
                        <input
                          type="checkbox"
                          checked={sel.has(r.id)}
                          disabled={cancelada}
                          onChange={() => alternar(r.id)}
                          aria-label={`Selecionar ${r.numDoc ?? r.id}`}
                        />
                      </TD>
                    )}
                    <TD className="whitespace-nowrap font-[family-name:var(--font-mono)] text-[var(--color-ink)]">
                      {r.numDoc ?? "—"}
                    </TD>
                    <TD className="whitespace-nowrap">{r.projectName}</TD>
                    <TD className="max-w-[200px] truncate">{r.fornecedorNome ?? "—"}</TD>
                    <TD>
                      {r.categoriaDre ? (
                        <Badge tone="danger">{r.categoriaDre}</Badge>
                      ) : (
                        <span className="text-[var(--color-ink4)]">—</span>
                      )}
                    </TD>
                    <TD className="font-[family-name:var(--font-mono)] text-[var(--color-ink3)]">
                      {r.competencia ?? "—"}
                    </TD>
                    <TD className="text-right font-[family-name:var(--font-mono)]">
                      {brl0(r.valor)}
                    </TD>
                    <TD className="text-[12px] text-[var(--color-ink3)]">
                      {r.motivos.join(" · ")}
                    </TD>
                    <TD className="text-right">
                      <Link
                        href={`/despesas?proj=${r.projectId}&tab=lancamentos&edit=${r.id}`}
                        className="text-sm text-[var(--color-accent2)] hover:underline"
                      >
                        Abrir
                      </Link>
                    </TD>
                  </TR>
                );
              })}
            </tbody>
          </Table>
        </CardContent>
      </Card>

      {preview && (
        <div
          onClick={() => setPreview(false)}
          className="fixed inset-0 z-[100] flex items-center justify-center bg-black/40 p-4"
        >
          <Card className="w-full max-w-2xl">
            <CardContent className="p-6" onClick={(e) => e.stopPropagation()}>
              <h2 className="mb-1 text-lg font-semibold text-[var(--color-ink)]">
                Conferir antes de aplicar
              </h2>
              <p className="mb-3 text-[12.5px] text-[var(--color-ink3)]">
                {marcadas.length} lançamento(s) passarão a ter a categoria{" "}
                <strong className="text-[var(--color-ink)]">{categoria}</strong>. Só a
                categoria muda — valor, competência, vencimento, status e número PED
                permanecem exatamente como estão.
              </p>
              <div className="max-h-[45vh] overflow-auto rounded-[8px] border border-[var(--color-accent2)]/15">
                <table className="w-full border-collapse text-[12.5px]">
                  <thead className="sticky top-0 bg-[var(--color-surface2)]">
                    <tr className="text-left font-[family-name:var(--font-mono)] text-[10px] uppercase tracking-wide text-[var(--color-ink3)]">
                      <th className="px-2 py-1.5">PED</th>
                      <th className="px-2 py-1.5">Projeto</th>
                      <th className="px-2 py-1.5">De</th>
                      <th className="px-2 py-1.5">Para</th>
                      <th className="px-2 py-1.5 text-right">Valor</th>
                      <th className="px-2 py-1.5">Vencimento</th>
                    </tr>
                  </thead>
                  <tbody>
                    {marcadas.map((r) => (
                      <tr key={r.id} className="border-t border-[var(--color-accent2)]/8">
                        <td className="px-2 py-1.5 font-[family-name:var(--font-mono)]">
                          {r.numDoc ?? "—"}
                        </td>
                        <td className="px-2 py-1.5">{r.projectName}</td>
                        <td className="px-2 py-1.5 text-[var(--color-danger)]">
                          {r.categoriaDre ?? "sem categoria"}
                        </td>
                        <td className="px-2 py-1.5 text-[var(--color-success)]">{categoria}</td>
                        <td className="px-2 py-1.5 text-right font-[family-name:var(--font-mono)]">
                          {brl0(r.valor)}
                        </td>
                        <td className="px-2 py-1.5 font-[family-name:var(--font-mono)] text-[var(--color-ink3)]">
                          {r.vencimento ? dateBR(r.vencimento) : "—"}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              {erro && <p className="mt-2 text-sm text-[var(--color-danger)]">{erro}</p>}
              <div className="mt-4 flex justify-end gap-2">
                <Button variant="ghost" onClick={() => setPreview(false)} disabled={pending}>
                  Voltar
                </Button>
                <Button onClick={confirmar} disabled={pending || marcadas.length === 0}>
                  {pending ? "Aplicando…" : `Confirmar ${marcadas.length} alteração(ões)`}
                </Button>
              </div>
            </CardContent>
          </Card>
        </div>
      )}
    </div>
  );
}
