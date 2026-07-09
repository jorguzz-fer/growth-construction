"use client";

import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import type { ContaPagarRow, ReceivableRow } from "@/lib/queries";
import { closeDia } from "@/lib/actions/fechamento";
import { brl0, dateBR } from "@/lib/utils";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input, Label } from "@/components/ui/input";
import { DateField } from "@/components/ui/date-field";
import { Table, THead, TH, TR, TD } from "@/components/ui/table";

function toISO(d: string | null): string {
  if (!d) return "";
  const p = d.split("/");
  return p.length === 3 ? `${p[2]}-${p[0].padStart(2, "0")}-${p[1].padStart(2, "0")}` : "";
}

export interface FechamentoPanelProps {
  contasPagar: ContaPagarRow[];
  receivables: ReceivableRow[];
  cash: { data: string | null; valor: number }[];
  saldoContas: number;
  hojeInternal: string; // "MM/DD/YYYY"
  canClose: boolean;
}

export function FechamentoPanel({
  contasPagar,
  receivables,
  cash,
  saldoContas,
  hojeInternal,
  canClose,
}: FechamentoPanelProps) {
  const router = useRouter();
  const [dia, setDia] = useState(hojeInternal);
  const [divergencias, setDivergencias] = useState("0");
  const [obs, setObs] = useState("");
  const [pending, start] = useTransition();
  const [msg, setMsg] = useState<string | null>(null);

  const diaISO = toISO(dia);

  // Pendentes acumulados até o dia (implementa o carry-over visual): contas a
  // pagar vencidas/não pagas e recebíveis previstos até a data.
  const contasDia = useMemo(
    () =>
      contasPagar.filter((c) => {
        if (c.status === "Pago") return false;
        const iso = toISO(c.vencimento);
        return !diaISO || (iso && iso <= diaISO);
      }),
    [contasPagar, diaISO],
  );
  const receberDia = useMemo(
    () =>
      receivables.filter((r) => {
        const iso = toISO(r.dia);
        return !diaISO || (iso && iso <= diaISO);
      }),
    [receivables, diaISO],
  );

  const totalPagar = contasDia.reduce((a, c) => a + c.valor, 0);
  const totalReceber = receberDia.reduce((a, r) => a + r.valor, 0);

  // Entradas/saídas reais do dia (caixa) + saldo.
  const { entradas, saidas } = useMemo(() => {
    let e = 0, s = 0;
    for (const c of cash) {
      if (toISO(c.data) !== diaISO) continue;
      if (c.valor >= 0) e += c.valor;
      else s += -c.valor;
    }
    return { entradas: e, saidas: s };
  }, [cash, diaISO]);
  const saldoFinal = saldoContas + entradas - saidas;

  const fechar = () => {
    setMsg(null);
    const pendentes = [
      ...contasDia.map((c) => ({
        tipo: "pagar" as const,
        refId: c.id,
        descricao: `${c.fornecedorNome ?? ""} · ${c.descricao ?? ""}`.trim(),
        valor: c.valor,
        vencimento: c.vencimento,
      })),
      ...receberDia.map((r) => ({
        tipo: "receber" as const,
        refId: r.refId,
        descricao: r.descricao,
        valor: r.valor,
        vencimento: r.dia,
      })),
    ];
    start(async () => {
      try {
        await closeDia({
          dia,
          projectId: null,
          saldoInicial: saldoContas,
          totalEntradas: entradas,
          totalSaidas: saidas,
          divergencias: Number(divergencias) || 0,
          obs,
          pendentes,
        });
        setMsg("Dia fechado. Pendências transferidas para o dia seguinte.");
        router.refresh();
      } catch (e) {
        setMsg(e instanceof Error ? e.message : "Falha ao fechar o dia.");
      }
    });
  };

  return (
    <div className="space-y-5">
      {/* Controles + resumo do fechamento */}
      <Card>
        <CardContent className="grid grid-cols-2 gap-4 p-5 sm:grid-cols-4 lg:grid-cols-6">
          <div>
            <Label>Dia do fechamento</Label>
            <DateField value={dia} onChange={setDia} />
          </div>
          <Resumo label="Saldo inicial" value={brl0(saldoContas)} />
          <Resumo label="Entradas do dia" value={brl0(entradas)} tone="pos" />
          <Resumo label="Saídas do dia" value={brl0(saidas)} tone="neg" />
          <Resumo label="Saldo final" value={brl0(saldoFinal)} tone="accent" />
          <div>
            <Label>Divergências</Label>
            <Input
              type="number"
              step="0.01"
              value={divergencias}
              onChange={(e) => setDivergencias(e.target.value)}
            />
          </div>
        </CardContent>
      </Card>

      {/* Dois painéis */}
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        {/* Esquerda: Contas a Pagar do Dia */}
        <Card>
          <CardContent className="p-4">
            <div className="mb-3 flex items-center justify-between">
              <h2 className="text-sm font-semibold text-[var(--color-ink)]">
                Contas a Pagar do Dia
              </h2>
              <Badge tone="warning">{brl0(totalPagar)}</Badge>
            </div>
            <div className="overflow-x-auto">
              <Table>
                <THead>
                  <tr>
                    <TH>Fornecedor</TH>
                    <TH>Descrição</TH>
                    <TH className="text-right">Valor</TH>
                    <TH>Vencimento</TH>
                    <TH>Forma</TH>
                    <TH>Status</TH>
                  </tr>
                </THead>
                <tbody>
                  {contasDia.map((c) => (
                    <TR key={c.id}>
                      <TD className="whitespace-nowrap font-medium text-[var(--color-ink)]">{c.fornecedorNome ?? "—"}</TD>
                      <TD className="max-w-[160px] truncate">{c.descricao ?? "—"}</TD>
                      <TD className="text-right font-[family-name:var(--font-mono)]">{brl0(c.valor)}</TD>
                      <TD className="font-[family-name:var(--font-mono)] text-[var(--color-ink2)]">{c.vencimento ? dateBR(c.vencimento) : "—"}</TD>
                      <TD>{c.formaPagamento ?? "—"}</TD>
                      <TD><Badge tone="warning">{c.status ?? "—"}</Badge></TD>
                    </TR>
                  ))}
                  {contasDia.length === 0 && (
                    <TR><TD colSpan={6} className="py-6 text-center text-[var(--color-ink4)]">Sem contas a pagar pendentes.</TD></TR>
                  )}
                </tbody>
              </Table>
            </div>
          </CardContent>
        </Card>

        {/* Direita: Receitas a Receber do Dia */}
        <Card>
          <CardContent className="p-4">
            <div className="mb-3 flex items-center justify-between">
              <h2 className="text-sm font-semibold text-[var(--color-ink)]">
                Receitas a Receber do Dia
              </h2>
              <Badge tone="success">{brl0(totalReceber)}</Badge>
            </div>
            <div className="overflow-x-auto">
              <Table>
                <THead>
                  <tr>
                    <TH>Cliente</TH>
                    <TH>Projeto</TH>
                    <TH>Descrição</TH>
                    <TH className="text-right">Valor</TH>
                    <TH>Previsto</TH>
                    <TH>Status</TH>
                  </tr>
                </THead>
                <tbody>
                  {receberDia.map((r) => (
                    <TR key={r.refId}>
                      <TD className="whitespace-nowrap text-[var(--color-ink2)]">{r.clienteNome ?? "—"}</TD>
                      <TD className="whitespace-nowrap">{r.projectName}</TD>
                      <TD className="max-w-[160px] truncate">{r.descricao}</TD>
                      <TD className="text-right font-[family-name:var(--font-mono)]">{brl0(r.valor)}</TD>
                      <TD className="font-[family-name:var(--font-mono)] text-[var(--color-ink2)]">{dateBR(r.dia)}</TD>
                      <TD><Badge tone="neutral">{r.status}</Badge></TD>
                    </TR>
                  ))}
                  {receberDia.length === 0 && (
                    <TR><TD colSpan={6} className="py-6 text-center text-[var(--color-ink4)]">Sem receitas a receber previstas.</TD></TR>
                  )}
                </tbody>
              </Table>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Fechar o dia */}
      {canClose && (
        <Card>
          <CardContent className="flex flex-wrap items-end gap-3 p-5">
            <div className="flex-1">
              <Label>Observação do fechamento</Label>
              <Input value={obs} onChange={(e) => setObs(e.target.value)} placeholder="Opcional" />
            </div>
            {msg && <span className="text-xs text-[var(--color-ink3)]">{msg}</span>}
            <Button onClick={fechar} disabled={pending}>
              {pending ? "Fechando…" : "Fechar o dia"}
            </Button>
          </CardContent>
        </Card>
      )}
    </div>
  );
}

function Resumo({ label, value, tone }: { label: string; value: string; tone?: "pos" | "neg" | "accent" }) {
  const color =
    tone === "pos" ? "var(--color-success)" : tone === "neg" ? "var(--color-danger)" : tone === "accent" ? "var(--color-accent)" : "var(--color-ink)";
  return (
    <div>
      <p className="font-[family-name:var(--font-mono)] text-[10px] uppercase tracking-wide text-[var(--color-ink3)]">{label}</p>
      <p className="mt-1 text-lg font-semibold" style={{ color }}>{value}</p>
    </div>
  );
}
