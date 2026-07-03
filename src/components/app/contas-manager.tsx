"use client";

import { useState, useTransition } from "react";
import { deleteConta, updateConta } from "@/lib/actions/contas";
import { brl0 } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Input, Select } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Table, THead, TH, TR, TD } from "@/components/ui/table";

export interface ContaData {
  id: string;
  banco: string;
  ag: string | null;
  op: string | null;
  cc: string | null;
  tipo: string;
  saldo: number;
  saldoSource: string;
  openFinanceId: string | null;
}

export function ContasManager({
  contas,
  canEditar,
  canExcluir,
}: {
  contas: ContaData[];
  canEditar: boolean;
  canExcluir: boolean;
}) {
  const total = contas.reduce((a, c) => a + c.saldo, 0);
  const showActions = canEditar || canExcluir;

  return (
    <Table>
      <THead>
        <tr>
          <TH>Banco</TH>
          <TH>Agência / Conta</TH>
          <TH>Tipo</TH>
          <TH>Open Finance</TH>
          <TH className="text-right">Saldo atual</TH>
          <TH>Atualização</TH>
          {showActions && <TH className="text-right">Ações</TH>}
        </tr>
      </THead>
      <tbody>
        {contas.length === 0 ? (
          <TR>
            <TD colSpan={showActions ? 7 : 6} className="py-8 text-center text-[var(--color-ink4)]">
              Nenhuma conta cadastrada.
            </TD>
          </TR>
        ) : (
          contas.map((c) => (
            <Row key={c.id} conta={c} canEditar={canEditar} canExcluir={canExcluir} />
          ))
        )}
        <TR>
          <TD colSpan={4} className="font-semibold text-[var(--color-ink)]">
            Saldo total
          </TD>
          <TD className="text-right font-[family-name:var(--font-mono)] font-semibold text-[var(--color-accent)]">
            {brl0(total)}
          </TD>
          <TD colSpan={showActions ? 2 : 1} />
        </TR>
      </tbody>
    </Table>
  );
}

function Row({
  conta,
  canEditar,
  canExcluir,
}: {
  conta: ContaData;
  canEditar: boolean;
  canExcluir: boolean;
}) {
  const [saldo, setSaldo] = useState(String(conta.saldo));
  const [source, setSource] = useState(conta.saldoSource);
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const dirty = Number(saldo) !== conta.saldo || source !== conta.saldoSource;

  const run = (fn: () => Promise<void>) => {
    setError(null);
    start(async () => {
      try {
        await fn();
      } catch (e) {
        setError(e instanceof Error ? e.message : "Erro.");
      }
    });
  };

  return (
    <TR>
      <TD className="font-medium text-[var(--color-ink)]">{conta.banco}</TD>
      <TD className="font-[family-name:var(--font-mono)] text-[var(--color-ink3)]">
        {conta.ag || "—"}
        {conta.op ? ` · op ${conta.op}` : ""} · {conta.cc || "—"}
      </TD>
      <TD>
        <Badge tone={conta.tipo === "Imobiliária" ? "info" : "neutral"}>{conta.tipo}</Badge>
      </TD>
      <TD>
        <Badge tone={conta.openFinanceId ? "success" : "neutral"}>
          {conta.openFinanceId ? "conectado" : "não conectado"}
        </Badge>
      </TD>
      <TD className="text-right">
        {canEditar ? (
          <Input
            type="number"
            step="0.01"
            value={saldo}
            onChange={(e) => setSaldo(e.target.value)}
            disabled={pending}
            className="h-8 w-32 text-right font-[family-name:var(--font-mono)] text-xs"
          />
        ) : (
          <span className="font-[family-name:var(--font-mono)]">{brl0(conta.saldo)}</span>
        )}
      </TD>
      <TD>
        {canEditar ? (
          <Select
            value={source}
            onChange={(e) => setSource(e.target.value)}
            disabled={pending}
            className="h-8 w-28 text-xs"
          >
            <option value="manual">Manual</option>
            <option value="auto">Automático</option>
          </Select>
        ) : (
          <Badge tone={conta.saldoSource === "auto" ? "info" : "neutral"}>
            {conta.saldoSource === "auto" ? "Automático" : "Manual"}
          </Badge>
        )}
        {error && <div className="text-xs text-[var(--color-danger)]">{error}</div>}
      </TD>
      {(canEditar || canExcluir) && (
        <TD className="text-right">
          <div className="flex items-center justify-end gap-2">
            {canEditar && (
              <Button
                size="sm"
                variant="outline"
                disabled={pending || !dirty}
                onClick={() => run(() => updateConta(conta.id, { saldo, saldoSource: source }))}
              >
                Salvar
              </Button>
            )}
            {canExcluir && (
              <button
                disabled={pending}
                onClick={() => run(() => deleteConta(conta.id))}
                className="text-sm text-[var(--color-danger)] hover:underline disabled:opacity-50"
              >
                Excluir
              </button>
            )}
          </div>
        </TD>
      )}
    </TR>
  );
}
