"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { conciliarDespesa, desfazerConciliacao } from "@/lib/actions/caixa";
import type { MovimentoPendente, MovimentoConciliado } from "@/lib/queries";
import { brl0, dateBR } from "@/lib/utils";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";

const grauTone = (g: "alta" | "media" | "baixa") =>
  g === "alta" ? "success" : g === "media" ? "warning" : "neutral";
const grauLabel = (g: "alta" | "media" | "baixa") =>
  g === "alta" ? "Alta compatibilidade" : g === "media" ? "Média" : "Baixa";

export function ConciliacaoReview({
  pendentes,
  conciliados,
  canDesfazer,
}: {
  pendentes: MovimentoPendente[];
  conciliados: MovimentoConciliado[];
  canDesfazer: boolean;
}) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [msg, setMsg] = useState<string | null>(null);
  const [erro, setErro] = useState<string | null>(null);

  const conciliar = (cashEntryId: string, despesaId: string) => {
    setErro(null);
    setMsg(null);
    start(async () => {
      try {
        await conciliarDespesa({ cashEntryId, despesaId });
        setMsg("Movimento conciliado: despesa marcada como paga.");
        router.refresh();
      } catch (e) {
        setErro(e instanceof Error ? e.message : "Falha ao conciliar.");
      }
    });
  };
  const desfazer = (cashEntryId: string) => {
    setErro(null);
    setMsg(null);
    start(async () => {
      try {
        await desfazerConciliacao(cashEntryId);
        setMsg("Conciliação desfeita: despesa voltou para 'A pagar'.");
        router.refresh();
      } catch (e) {
        setErro(e instanceof Error ? e.message : "Falha ao desfazer.");
      }
    });
  };

  return (
    <div className="space-y-4">
      {erro && <p className="text-xs text-[var(--color-danger)]">{erro}</p>}
      {msg && <p className="text-xs text-[var(--color-success)]">{msg}</p>}

      <section className="space-y-2">
        <h3 className="text-sm font-semibold text-[var(--color-ink)]">
          Movimentos do extrato a conciliar{" "}
          <span className="font-normal text-[var(--color-ink3)]">
            ({pendentes.length})
          </span>
        </h3>
        <p className="text-[12px] text-[var(--color-ink3)]">
          Para cada saída do extrato, sugerimos as contas a pagar mais compatíveis
          (o grau é só orientação). Nada é conciliado sem a sua confirmação. Ao
          conciliar, a despesa é marcada como paga na data e no banco do movimento.
        </p>
        {pendentes.length === 0 && (
          <p className="py-6 text-center text-sm text-[var(--color-ink4)]">
            Nenhuma saída do extrato pendente de conciliação.
          </p>
        )}
        {pendentes.map((m) => (
          <Card key={m.cashEntryId}>
            <CardContent className="p-4">
              <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
                <div className="flex flex-wrap items-center gap-2 text-[13px]">
                  <span className="font-[family-name:var(--font-mono)] text-[var(--color-ink3)]">
                    {m.data ? dateBR(m.data) : "—"}
                  </span>
                  <span className="text-[var(--color-ink)]">{m.descricao ?? "—"}</span>
                  {m.doc && (
                    <span className="font-[family-name:var(--font-mono)] text-[11px] text-[var(--color-ink4)]">
                      doc {m.doc}
                    </span>
                  )}
                </div>
                <span className="font-[family-name:var(--font-mono)] text-[13px] font-semibold text-[var(--color-danger)]">
                  −{brl0(Math.abs(m.valor))}
                </span>
              </div>
              {m.sugestoes.length === 0 ? (
                <p className="text-[12px] text-[var(--color-ink4)]">
                  Sem contas a pagar compatíveis. Concilie manualmente em Despesas
                  ou mantenha pendente.
                </p>
              ) : (
                <div className="divide-y divide-[var(--color-accent2)]/8 rounded-[8px] border border-[var(--color-accent2)]/12">
                  {m.sugestoes.map((s) => (
                    <div
                      key={s.despesaId}
                      className="flex flex-wrap items-center gap-2 px-3 py-2"
                    >
                      <Badge tone={grauTone(s.grau)}>{grauLabel(s.grau)}</Badge>
                      <span className="text-[13px] text-[var(--color-ink)]">
                        {s.fornecedor ?? "—"}
                      </span>
                      <span className="text-[12px] text-[var(--color-ink3)]">
                        {s.descricao ?? s.numDoc ?? ""}
                      </span>
                      <span className="font-[family-name:var(--font-mono)] text-[12px] text-[var(--color-ink2)]">
                        {brl0(Math.abs(s.valor))}
                      </span>
                      {s.vencimento && (
                        <span className="font-[family-name:var(--font-mono)] text-[11px] text-[var(--color-ink4)]">
                          venc {dateBR(s.vencimento)}
                        </span>
                      )}
                      <Button
                        size="sm"
                        className="ml-auto"
                        disabled={pending}
                        onClick={() => conciliar(m.cashEntryId, s.despesaId)}
                      >
                        Conciliar
                      </Button>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        ))}
      </section>

      {conciliados.length > 0 && (
        <section className="space-y-2">
          <h3 className="text-sm font-semibold text-[var(--color-ink)]">
            Conciliados{" "}
            <span className="font-normal text-[var(--color-ink3)]">
              ({conciliados.length})
            </span>
          </h3>
          <div className="overflow-x-auto rounded-[8px] border border-[var(--color-accent2)]/12">
            <table className="w-full border-collapse text-[12.5px]">
              <thead className="bg-[var(--color-surface2)] text-left font-[family-name:var(--font-mono)] text-[10px] uppercase tracking-wide text-[var(--color-ink3)]">
                <tr>
                  <th className="px-3 py-2">Data</th>
                  <th className="px-3 py-2">Movimento</th>
                  <th className="px-3 py-2">Despesa</th>
                  <th className="px-3 py-2 text-right">Valor</th>
                  <th className="px-3 py-2">Por</th>
                  {canDesfazer && <th className="px-3 py-2 text-right">Ação</th>}
                </tr>
              </thead>
              <tbody>
                {conciliados.map((c) => (
                  <tr key={c.cashEntryId} className="border-t border-[var(--color-accent2)]/8">
                    <td className="whitespace-nowrap px-3 py-1.5 font-[family-name:var(--font-mono)] text-[var(--color-ink3)]">
                      {c.data ? dateBR(c.data) : "—"}
                    </td>
                    <td className="px-3 py-1.5 text-[var(--color-ink)]">{c.descricao ?? "—"}</td>
                    <td className="px-3 py-1.5 text-[var(--color-ink2)]">
                      {c.fornecedor ?? c.despesaNumDoc ?? "—"}
                    </td>
                    <td className="whitespace-nowrap px-3 py-1.5 text-right font-[family-name:var(--font-mono)]">
                      {brl0(Math.abs(c.valor))}
                    </td>
                    <td className="px-3 py-1.5 text-[var(--color-ink4)]">{c.conciliadoPor ?? "—"}</td>
                    {canDesfazer && (
                      <td className="px-3 py-1.5 text-right">
                        <button
                          className="text-[12px] text-[var(--color-danger)] hover:underline disabled:opacity-50"
                          disabled={pending}
                          onClick={() => desfazer(c.cashEntryId)}
                        >
                          Desfazer
                        </button>
                      </td>
                    )}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      )}
    </div>
  );
}
