"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { cancelarRestituicao } from "@/lib/actions/restituicoes";
import { rotuloDoMovimento } from "@/lib/calc/conta-corrente";
import { somarAging } from "@/lib/calc/aging";
import type { ContaCorrenteComAging } from "@/lib/actions/restituicoes";
import { brl0, dateBR } from "@/lib/utils";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";

/**
 * Conta corrente de terceiros/sócios (§13).
 *
 * Responde "quanto ainda devo ao sócio X" e mostra COMO se chegou nesse número:
 *
 *     Saldo devido = total desembolsado por ele − total já restituído
 *
 * Cada linha do extrato é um fato: um desembolso (ele pagou um fornecedor pela
 * empresa, aumentando a dívida) ou uma restituição (a empresa devolveu, e a
 * dívida caiu). O saldo acumulado é recalculado a cada movimento, em ordem de
 * data, para que o número final seja conferível linha a linha.
 *
 * Este saldo NÃO é caixa disponível da empresa — é obrigação com terceiros.
 */
export function ContaCorrenteTerceiros({
  contas,
  projectId,
  podeCancelar = false,
}: {
  contas: ContaCorrenteComAging[];
  /** obra da tela: onde cai o estorno de caixa (chave "segue a despesa" desligada). */
  projectId?: string;
  /** Prompt T, 9 — `cancelarRestituicao` não tinha porta de interface; esta é ela. */
  podeCancelar?: boolean;
}) {
  const [aberta, setAberta] = useState<string | null>(null);
  const router = useRouter();
  const [pending, start] = useTransition();
  const [erro, setErro] = useState<string | null>(null);
  const cancelar = (id: string) => {
    const motivo = window.prompt("Cancelar este ressarcimento? O registro fica, marcado como cancelado, e o saldo da obrigação volta. Informe o motivo:");
    if (motivo === null) return;
    start(async () => {
      setErro(null);
      const r = await cancelarRestituicao(id, projectId ?? "", motivo);
      if (!r.ok) {
        setErro(r.error);
        return;
      }
      router.refresh();
    });
  };
  if (contas.length === 0) return null;

  const totalDevido = contas.reduce((a, c) => a + c.saldoDevido, 0);
  // Prompt T, 2-A — o total do topo ganha a mesma quebra por idade das linhas.
  const agingTotal = somarAging(contas.map((c) => c.aging).filter((a): a is NonNullable<typeof a> => !!a));
  const faixas = (a: NonNullable<ContaCorrenteComAging["aging"]>) => (
    <span className="inline-flex flex-wrap gap-1">
      <Badge tone="neutral">0–30: {brl0(a.ate30)}</Badge>
      <Badge tone="neutral">31–60: {brl0(a.de31a60)}</Badge>
      <Badge tone="warning">61–90: {brl0(a.de61a90)}</Badge>
      <Badge tone="danger">90+: {brl0(a.acima90)}</Badge>
    </span>
  );

  return (
    <Card className="mb-5">
      <CardContent className="p-4">
        <div className="mb-2 flex flex-wrap items-center gap-3">
          <h2 className="text-sm font-semibold text-[var(--color-ink)]">
            Conta corrente de terceiros
          </h2>
          {erro && (
            <p role="alert" className="mt-1 text-[12px] text-[var(--color-danger)]">{erro}</p>
          )}
          <span className="text-[12px] text-[var(--color-ink3)]">
            Saldo devido total{" "}
            <strong className="font-[family-name:var(--font-mono)] text-[var(--color-warning)]">
              {brl0(totalDevido)}
            </strong>
          </span>
          <span className="text-[11.5px] text-[var(--color-ink4)]">
            obrigação com terceiros — não é saldo bancário disponível
          </span>
          {totalDevido > 0 && (
            <span className="flex items-center gap-1 text-[11px] text-[var(--color-ink3)]" title="Idade do saldo em aberto: previsão de ressarcimento, senão a data do desembolso. Mesmo cálculo do ressarcimento em lote.">
              em aberto há: {faixas(agingTotal)}
            </span>
          )}
        </div>

        <div className="tbl-scroll overflow-x-auto">
          <table className="w-full border-collapse text-[13px]">
            <thead>
              <tr className="border-b border-[var(--color-accent2)]/12 text-left font-[family-name:var(--font-mono)] text-[10px] uppercase tracking-wide text-[var(--color-ink3)]">
                <th className="px-2 py-2">Terceiro / sócio</th>
                <th className="px-2 py-2 text-right">Movimentos</th>
                <th className="px-2 py-2 text-right">Total desembolsado</th>
                <th className="px-2 py-2 text-right">Total restituído</th>
                <th className="px-2 py-2 text-right">Compensado</th>
                <th className="px-2 py-2 text-right">Saldo devido</th>
                <th className="px-2 py-2 text-right">A repassar</th>
                <th className="px-2 py-2">Em aberto há</th>
                <th className="px-2 py-2 text-right">Extrato</th>
              </tr>
            </thead>
            <tbody>
              {contas.map((c) => {
                const chave = c.pagadorId ?? c.pagador;
                const aberto = aberta === chave;
                return (
                  <>
                    <tr key={chave} className="border-b border-[var(--color-accent2)]/8">
                      <td className="px-2 py-2 font-medium text-[var(--color-ink)]">
                        {c.pagador}
                      </td>
                      <td className="px-2 py-2 text-right font-[family-name:var(--font-mono)] text-[var(--color-ink3)]">
                        {c.movimentos.length}
                      </td>
                      <td className="px-2 py-2 text-right font-[family-name:var(--font-mono)]">
                        {brl0(c.totalDesembolsado)}
                      </td>
                      <td className="px-2 py-2 text-right font-[family-name:var(--font-mono)] text-[var(--color-success)]">
                        {brl0(c.totalRestituido)}
                      </td>
                      <td className="px-2 py-2 text-right font-[family-name:var(--font-mono)] text-[var(--color-ink3)]">
                        {brl0(c.totalCompensado)}
                      </td>
                      <td
                        className={`px-2 py-2 text-right font-[family-name:var(--font-mono)] font-semibold ${
                          c.saldoDevido > 0
                            ? "text-[var(--color-warning)]"
                            : c.saldoDevido < 0
                              ? "text-[var(--color-danger)]"
                              : "text-[var(--color-ink3)]"
                        }`}
                        title={
                          c.saldoDevido < 0
                            ? "Restituído a mais do que o desembolsado — conferir."
                            : undefined
                        }
                      >
                        {brl0(c.saldoDevido)}
                      </td>
                      <td
                        className="px-2 py-2 text-right font-[family-name:var(--font-mono)]"
                        title="Recebido do cliente pelo terceiro e ainda não repassado à empresa."
                      >
                        {brl0(c.saldoARepassar)}
                      </td>
                      <td className="px-2 py-2 text-[11px]">{c.aging && c.saldoDevido > 0 ? faixas(c.aging) : <span className="text-[var(--color-ink4)]">—</span>}</td>
                      <td className="px-2 py-2 text-right">
                        <button
                          onClick={() => setAberta(aberto ? null : chave)}
                          className="text-[12px] text-[var(--color-accent2)] hover:underline"
                        >
                          {aberto ? "Fechar" : "Ver"}
                        </button>
                      </td>
                    </tr>
                    {aberto && (
                      <tr key={`${chave}-ext`} className="border-b border-[var(--color-accent2)]/8">
                        <td colSpan={9} className="bg-[var(--color-surface2)]/60 px-2 py-3">
                          <table className="w-full border-collapse text-[12.5px]">
                            <thead>
                              <tr className="text-left font-[family-name:var(--font-mono)] text-[10px] uppercase tracking-wide text-[var(--color-ink4)]">
                                <th className="px-2 py-1">Data</th>
                                <th className="px-2 py-1">Movimento</th>
                                <th className="px-2 py-1">Documento</th>
                                <th className="px-2 py-1 text-right">Valor</th>
                                <th className="px-2 py-1 text-right">Saldo devido</th>
                                <th className="px-2 py-1 text-right">A repassar</th>
                                {podeCancelar && <th className="px-2 py-1 text-right">Ação</th>}
                              </tr>
                            </thead>
                            <tbody>
                              {c.movimentos.map((m) => (
                                <tr key={`${m.tipo}-${m.id}`}>
                                  <td className="px-2 py-1 font-[family-name:var(--font-mono)] text-[var(--color-ink3)]">
                                    {m.data ? dateBR(m.data) : "—"}
                                  </td>
                                  <td className="px-2 py-1">
                                    <Badge tone={rotuloDoMovimento(m.tipo).tom}>
                                      {rotuloDoMovimento(m.tipo).rotulo}
                                    </Badge>{" "}
                                    <span className="text-[var(--color-ink3)]">
                                      {m.descricao}
                                    </span>
                                  </td>
                                  <td className="px-2 py-1 font-[family-name:var(--font-mono)] text-[var(--color-ink3)]">
                                    {m.numDoc ?? "—"}
                                  </td>
                                  <td
                                    className={`px-2 py-1 text-right font-[family-name:var(--font-mono)] ${
                                      m.efeitoRestituir > 0 || m.efeitoRepassar > 0
                                        ? "text-[var(--color-ink)]"
                                        : "text-[var(--color-success)]"
                                    }`}
                                    title={m.tipo === "compensacao" ? "Baixa os dois lados pelo mesmo valor." : undefined}
                                  >
                                    {m.efeitoRestituir > 0 || m.efeitoRepassar > 0 ? "+" : "−"}
                                    {brl0(m.valor)}
                                  </td>
                                  <td className="px-2 py-1 text-right font-[family-name:var(--font-mono)] font-medium">
                                    {brl0(m.saldoAcumulado)}
                                  </td>
                                  <td className="px-2 py-1 text-right font-[family-name:var(--font-mono)] text-[var(--color-ink3)]">
                                    {brl0(m.saldoRepassarAcumulado)}
                                  </td>
                                  {podeCancelar && (
                                    <td className="px-2 py-1 text-right">
                                      {m.tipo === "restituicao" && !/cancelad/i.test(m.descricao) && (
                                        <button type="button" disabled={pending} onClick={() => cancelar(m.id)} className="text-[11px] text-[var(--color-danger)] hover:underline disabled:opacity-50" title="Cancela o ressarcimento: o registro fica, marcado, e o saldo volta">
                                          Cancelar
                                        </button>
                                      )}
                                    </td>
                                  )}
                                </tr>
                              ))}
                            </tbody>
                          </table>
                        </td>
                      </tr>
                    )}
                  </>
                );
              })}
            </tbody>
          </table>
        </div>
      </CardContent>
    </Card>
  );
}
