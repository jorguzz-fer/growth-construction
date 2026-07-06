"use client";

import { useState, useTransition } from "react";
import { deleteMedicao, updateMedicao } from "@/lib/actions/medicao";
import { brl0 } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { MonthField } from "@/components/ui/date-field";
import { Table, THead, TH, TR, TD } from "@/components/ui/table";

export interface MedicaoRowData {
  id: string;
  competencia: string;
  grupoCode: string;
  grupoName: string;
  valor: number;
  obs: string;
}

export function MedicaoTable({
  rows,
  canEditar,
  canExcluir,
}: {
  rows: MedicaoRowData[];
  canEditar: boolean;
  canExcluir: boolean;
}) {
  const showActions = canEditar || canExcluir;
  return (
    <Table>
      <THead>
        <tr>
          <TH>Competência</TH>
          <TH>Grupo de obra</TH>
          <TH className="text-right">Valor medido</TH>
          <TH>Observação</TH>
          {showActions && <TH className="text-right">Ações</TH>}
        </tr>
      </THead>
      <tbody>
        {rows.length === 0 ? (
          <TR>
            <TD colSpan={showActions ? 5 : 4} className="py-8 text-center text-[var(--color-ink4)]">
              Nenhuma medição lançada nesta versão.
            </TD>
          </TR>
        ) : (
          rows.map((r) => (
            <Row key={r.id} row={r} canEditar={canEditar} canExcluir={canExcluir} />
          ))
        )}
      </tbody>
    </Table>
  );
}

function Row({
  row,
  canEditar,
  canExcluir,
}: {
  row: MedicaoRowData;
  canEditar: boolean;
  canExcluir: boolean;
}) {
  const [competencia, setCompetencia] = useState(row.competencia);
  const [valor, setValor] = useState(String(row.valor));
  const [obs, setObs] = useState(row.obs);
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);

  const dirty =
    competencia !== row.competencia ||
    Number(valor) !== row.valor ||
    obs !== row.obs;

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

  if (!canEditar && !canExcluir) {
    return (
      <TR>
        <TD className="font-[family-name:var(--font-mono)]">{row.competencia}</TD>
        <TD>
          <span className="font-[family-name:var(--font-mono)] text-[var(--color-accent)]">
            {row.grupoCode}
          </span>{" "}
          {row.grupoName}
        </TD>
        <TD className="text-right font-[family-name:var(--font-mono)]">{brl0(row.valor)}</TD>
        <TD>{row.obs || "—"}</TD>
      </TR>
    );
  }

  return (
    <TR>
      <TD>
        <MonthField
          value={competencia}
          onChange={setCompetencia}
          disabled={!canEditar || pending}
          className="h-8 w-32 text-xs"
        />
      </TD>
      <TD>
        <span className="font-[family-name:var(--font-mono)] text-[var(--color-accent)]">
          {row.grupoCode}
        </span>{" "}
        {row.grupoName}
      </TD>
      <TD className="text-right">
        <Input
          type="number"
          step="0.01"
          value={valor}
          onChange={(e) => setValor(e.target.value)}
          disabled={!canEditar || pending}
          className="h-8 w-32 text-right font-[family-name:var(--font-mono)] text-xs"
        />
      </TD>
      <TD>
        <Input
          value={obs}
          onChange={(e) => setObs(e.target.value)}
          disabled={!canEditar || pending}
          className="h-8 text-xs"
        />
        {error && <div className="text-xs text-[var(--color-danger)]">{error}</div>}
      </TD>
      <TD className="text-right">
        <div className="flex items-center justify-end gap-2">
          {canEditar && (
            <Button
              size="sm"
              variant="outline"
              disabled={pending || !dirty}
              onClick={() => run(() => updateMedicao(row.id, { competencia, valor, obs }))}
            >
              Salvar
            </Button>
          )}
          {canExcluir && (
            <button
              disabled={pending}
              onClick={() => run(() => deleteMedicao(row.id))}
              className="text-sm text-[var(--color-danger)] hover:underline disabled:opacity-50"
            >
              Excluir
            </button>
          )}
        </div>
      </TD>
    </TR>
  );
}
