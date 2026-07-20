"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import {
  conciliarDespesa,
  desfazerConciliacao,
  conciliarContaReceber,
  criarContaFromExtrato,
} from "@/lib/actions/caixa";
import type {
  MovimentoPendente,
  MovimentoPendenteEntrada,
  MovimentoConciliado,
} from "@/lib/queries";
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
  pendentesEntrada = [],
  conciliados,
  canDesfazer,
}: {
  pendentes: MovimentoPendente[];
  pendentesEntrada?: MovimentoPendenteEntrada[];
  conciliados: MovimentoConciliado[];
  canDesfazer: boolean;
}) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [msg, setMsg] = useState<string | null>(null);
  const [erro, setErro] = useState<string | null>(null);

  const run = (fn: () => Promise<void>, ok: string) => {
    setErro(null);
    setMsg(null);
    start(async () => {
      try {
        await fn();
        setMsg(ok);
        router.refresh();
      } catch (e) {
        setErro(e instanceof Error ? e.message : "Falha na operação.");
      }
    });
  };

  const conciliar = (cashEntryId: string, despesaId: string) =>
    run(() => conciliarDespesa({ cashEntryId, despesaId }), "Movimento conciliado: despesa marcada como paga.");
  const conciliarReceber = (cashEntryId: string, contaReceberId: string) =>
    run(() => conciliarContaReceber({ cashEntryId, contaReceberId }), "Movimento conciliado: conta a receber marcada como recebida.");
  const criarConta = (cashEntryId: string, entrada: boolean) =>
    run(
      () => criarContaFromExtrato(cashEntryId),
      entrada ? "Conta a receber criada a partir do extrato." : "Conta a pagar criada a partir do extrato.",
    );
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
              <div className="mt-2 flex items-center gap-3">
                <Button
                  size="sm"
                  variant="outline"
                  disabled={pending}
                  onClick={() => criarConta(m.cashEntryId, false)}
                >
                  Criar conta a pagar
                </Button>
                <span className="text-[11px] text-[var(--color-ink4)]">
                  ou deixe pendente para não processar agora.
                </span>
              </div>
            </CardContent>
          </Card>
        ))}
      </section>

      {/* Entradas do extrato → conta a receber (item 6/7) */}
      <section className="space-y-2">
        <h3 className="text-sm font-semibold text-[var(--color-ink)]">
          Entradas do extrato a conciliar{" "}
          <span className="font-normal text-[var(--color-ink3)]">({pendentesEntrada.length})</span>
        </h3>
        <p className="text-[12px] text-[var(--color-ink3)]">
          Para cada entrada, sugerimos as contas a receber compatíveis. Você pode
          vincular a uma conta existente, criar uma nova conta a receber, ou deixar
          pendente. Nada é processado sem confirmação.
        </p>
        {pendentesEntrada.length === 0 && (
          <p className="py-6 text-center text-sm text-[var(--color-ink4)]">
            Nenhuma entrada do extrato pendente.
          </p>
        )}
        {pendentesEntrada.map((m) => (
          <Card key={m.cashEntryId}>
            <CardContent className="p-4">
              <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
                <div className="flex flex-wrap items-center gap-2 text-[13px]">
                  <span className="font-[family-name:var(--font-mono)] text-[var(--color-ink3)]">
                    {m.data ? dateBR(m.data) : "—"}
                  </span>
                  <span className="text-[var(--color-ink)]">{m.descricao ?? "—"}</span>
                </div>
                <span className="font-[family-name:var(--font-mono)] text-[13px] font-semibold text-[var(--color-success)]">
                  +{brl0(Math.abs(m.valor))}
                </span>
              </div>
              {m.sugestoes.length > 0 && (
                <div className="divide-y divide-[var(--color-accent2)]/8 rounded-[8px] border border-[var(--color-accent2)]/12">
                  {m.sugestoes.map((s) => (
                    <div key={s.contaReceberId} className="flex flex-wrap items-center gap-2 px-3 py-2">
                      <Badge tone={grauTone(s.grau)}>{grauLabel(s.grau)}</Badge>
                      <span className="text-[13px] text-[var(--color-ink)]">{s.projectName}</span>
                      <span className="text-[12px] text-[var(--color-ink3)]">{s.descricao ?? ""}</span>
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
                        onClick={() => conciliarReceber(m.cashEntryId, s.contaReceberId)}
                      >
                        Conciliar
                      </Button>
                    </div>
                  ))}
                </div>
              )}
              <div className="mt-2 flex items-center gap-3">
                <Button
                  size="sm"
                  variant="outline"
                  disabled={pending}
                  onClick={() => criarConta(m.cashEntryId, true)}
                >
                  Criar conta a receber
                </Button>
                <span className="text-[11px] text-[var(--color-ink4)]">
                  ou deixe pendente para não processar agora.
                </span>
              </div>
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
