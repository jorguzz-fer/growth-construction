"use client";

import Link from "next/link";
import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { concederPapelPagador, retirarPapelPagador } from "@/lib/actions/stakeholders";
import { brl0 } from "@/lib/utils";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Label, Select } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Table, THead, TH, TR, TD } from "@/components/ui/table";

export interface PagadorView {
  id: string;
  nome: string;
  docMascarado: string | null;
  ativo: boolean;
  obrigacoes: number;
  saldoDevido: number;
}

/**
 * Prompt T, seção 1 — cadastro de pagadores terceiros: quem pode pagar pela
 * empresa. A lista é de quem tem o papel; conceder é escolher um cadastro
 * existente (1.2: não cria registro novo); retirar só sem obrigação (1.3).
 * Cadastro novo nasce em Fornecedores (Prompt W), com o papel já marcado.
 */
export function PagadoresTerceiros({ pagadores, candidatos, canEditar }: { pagadores: PagadorView[]; candidatos: { id: string; nome: string; papeis: string[] }[]; canEditar: boolean }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [escolhido, setEscolhido] = useState("");
  const [msg, setMsg] = useState<{ ok: boolean; texto: string } | null>(null);
  const cand = candidatos.find((c) => c.id === escolhido);

  const rodar = (fn: () => Promise<{ ok: true; avisos: string[] } | { ok: false; error: string }>, feito: string) =>
    start(async () => {
      setMsg(null);
      const r = await fn();
      if (!r.ok) {
        setMsg({ ok: false, texto: r.error });
        return;
      }
      setMsg({ ok: true, texto: r.avisos.length ? r.avisos.join(" ") : feito });
      setEscolhido("");
      router.refresh();
    });

  return (
    <Card>
      <CardContent className="p-5">
        <div className="mb-3 flex flex-wrap items-end justify-between gap-3">
          <div>
            <h2 className="text-sm font-semibold text-[var(--color-ink)]">Pagadores terceiros</h2>
            <p className="text-[11.5px] text-[var(--color-ink3)]">
              Quem pode pagar fornecedores pela empresa — é quem o lançamento de despesa oferece em &ldquo;pago por terceiro&rdquo;. O papel é concedido aqui, item a item.
            </p>
          </div>
          {canEditar && (
            <Link href="/fornecedores" className="text-[12px] text-[var(--color-accent2)] hover:underline">
              Cadastro novo em Fornecedores →
            </Link>
          )}
        </div>

        {canEditar && (
          <div className="mb-4 flex flex-wrap items-end gap-2 rounded-[8px] bg-[var(--color-surface2)] p-3">
            <div className="min-w-[260px] flex-1">
              <Label>Conceder o papel a um cadastro existente</Label>
              <Select value={escolhido} onChange={(e) => setEscolhido(e.target.value)} aria-label="Cadastro que passa a ser pagador">
                <option value="">— escolha —</option>
                {candidatos.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.nome}
                  </option>
                ))}
              </Select>
              {cand && (
                <p className="mt-1 text-[11px] text-[var(--color-ink3)]">
                  Já cadastrado{cand.papeis.length ? ` como ${cand.papeis.join(", ")}` : ", sem papel"} — o papel é acrescentado; nenhum registro novo é criado.
                </p>
              )}
            </div>
            <Button size="sm" disabled={pending || !escolhido} onClick={() => rodar(() => concederPapelPagador(escolhido), "Papel concedido.")}>
              Conceder papel
            </Button>
          </div>
        )}

        {msg && (
          <p role={msg.ok ? "status" : "alert"} className={`mb-3 text-[12.5px] ${msg.ok ? "text-[var(--color-success)]" : "text-[var(--color-danger)]"}`}>
            {msg.texto}
          </p>
        )}

        <Table>
          <THead>
            <tr>
              <TH>Pagador</TH>
              <TH>Documento</TH>
              <TH className="text-right">Obrigações</TH>
              <TH className="text-right">Saldo devido</TH>
              <TH>Status</TH>
              {canEditar && <TH className="text-right">Ação</TH>}
            </tr>
          </THead>
          <tbody>
            {pagadores.map((p) => (
              <TR key={p.id} className={p.ativo ? undefined : "opacity-60"}>
                <TD className="font-medium text-[var(--color-ink)]">{p.nome}</TD>
                <TD className="font-[family-name:var(--font-mono)] text-[var(--color-ink3)]">{p.docMascarado ?? "—"}</TD>
                <TD className="text-right font-[family-name:var(--font-mono)]">{p.obrigacoes}</TD>
                <TD className="text-right font-[family-name:var(--font-mono)] text-[var(--color-warning)]">{brl0(p.saldoDevido)}</TD>
                <TD>
                  <Badge tone={p.ativo ? "success" : "neutral"}>{p.ativo ? "Ativo" : "Inativo"}</Badge>
                </TD>
                {canEditar && (
                  <TD className="text-right">
                    <button
                      type="button"
                      disabled={pending}
                      onClick={() => rodar(() => retirarPapelPagador(p.id), "Papel retirado.")}
                      className="text-[12px] text-[var(--color-danger)] hover:underline disabled:opacity-50"
                      title={p.obrigacoes > 0 ? "Com obrigação vinculada o papel não sai: inative o cadastro em Fornecedores" : "Retirar o papel de pagador"}
                    >
                      Retirar papel
                    </button>
                  </TD>
                )}
              </TR>
            ))}
            {pagadores.length === 0 && (
              <TR>
                <TD colSpan={canEditar ? 6 : 5} className="py-6 text-center text-[var(--color-ink3)]">
                  Ninguém tem o papel de pagador ainda. Conceda a um cadastro existente acima.
                </TD>
              </TR>
            )}
          </tbody>
        </Table>
      </CardContent>
    </Card>
  );
}
