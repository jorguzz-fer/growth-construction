"use client";

import { useState } from "react";
import type { ContaCorrenteTerceiro } from "@/lib/actions/restituicoes";
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
}: {
  contas: ContaCorrenteTerceiro[];
}) {
  const [aberta, setAberta] = useState<string | null>(null);
  if (contas.length === 0) return null;

  const totalDevido = contas.reduce((a, c) => a + c.saldoDevido, 0);

  return (
    <Card className="mb-5">
      <CardContent className="p-4">
        <div className="mb-2 flex flex-wrap items-center gap-3">
          <h2 className="text-sm font-semibold text-[var(--color-ink)]">
            Conta corrente de terceiros
          </h2>
          <span className="text-[12px] text-[var(--color-ink3)]">
            Saldo devido total{" "}
            <strong className="font-[family-name:var(--font-mono)] text-[var(--color-warning)]">
              {brl0(totalDevido)}
            </strong>
          </span>
          <span className="text-[11.5px] text-[var(--color-ink4)]">
            obrigação com terceiros — não é saldo bancário disponível
          </span>
        </div>

        <div className="tbl-scroll overflow-x-auto">
          <table className="w-full border-collapse text-[13px]">
            <thead>
              <tr className="border-b border-[var(--color-accent2)]/12 text-left font-[family-name:var(--font-mono)] text-[10px] uppercase tracking-wide text-[var(--color-ink3)]">
                <th className="px-2 py-2">Terceiro / sócio</th>
                <th className="px-2 py-2 text-right">Movimentos</th>
                <th className="px-2 py-2 text-right">Total desembolsado</th>
                <th className="px-2 py-2 text-right">Total restituído</th>
                <th className="px-2 py-2 text-right">Saldo devido</th>
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
                        <td colSpan={6} className="bg-[var(--color-surface2)]/60 px-2 py-3">
                          <table className="w-full border-collapse text-[12.5px]">
                            <thead>
                              <tr className="text-left font-[family-name:var(--font-mono)] text-[10px] uppercase tracking-wide text-[var(--color-ink4)]">
                                <th className="px-2 py-1">Data</th>
                                <th className="px-2 py-1">Movimento</th>
                                <th className="px-2 py-1">Documento</th>
                                <th className="px-2 py-1 text-right">Valor</th>
                                <th className="px-2 py-1 text-right">Saldo devido</th>
                              </tr>
                            </thead>
                            <tbody>
                              {c.movimentos.map((m) => (
                                <tr key={`${m.tipo}-${m.id}`}>
                                  <td className="px-2 py-1 font-[family-name:var(--font-mono)] text-[var(--color-ink3)]">
                                    {m.data ? dateBR(m.data) : "—"}
                                  </td>
                                  <td className="px-2 py-1">
                                    <Badge
                                      tone={m.tipo === "desembolso" ? "warning" : "success"}
                                    >
                                      {m.tipo === "desembolso" ? "Desembolso" : "Restituição"}
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
                                      m.tipo === "desembolso"
                                        ? "text-[var(--color-ink)]"
                                        : "text-[var(--color-success)]"
                                    }`}
                                  >
                                    {m.tipo === "desembolso" ? "+" : "−"}
                                    {brl0(m.valor)}
                                  </td>
                                  <td className="px-2 py-1 text-right font-[family-name:var(--font-mono)] font-medium">
                                    {brl0(m.saldoAcumulado)}
                                  </td>
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
