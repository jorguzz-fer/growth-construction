"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { updateDespesa, deleteDespesa } from "@/lib/actions/despesas";
import { brl0, dateBR } from "@/lib/utils";
import { Badge } from "@/components/ui/badge";
import { Table, THead, TH, TR, TD } from "@/components/ui/table";
import { Input, Select } from "@/components/ui/input";
import { DateField, MonthField } from "@/components/ui/date-field";
import { Button } from "@/components/ui/button";

export interface DespesaDTO {
  id: string;
  numDoc: string | null;
  fornecedorId: string | null;
  bancoId: string | null;
  contaCef: string | null;
  categoriaDre: string | null;
  competencia: string | null;
  vencimento: string | null;
  valor: string;
  status: string | null;
}

interface Ref {
  fornecedores: { id: string; nome: string }[];
  contas: { code: string; name: string }[];
  bancos: { id: string; banco: string; tipo: string }[];
  categorias: readonly string[];
}

export function DespesasTable({
  rows,
  fornecedores,
  contas,
  bancos,
  categorias,
  venc,
  canEditar,
  canExcluir,
  canEditNumero = false,
}: {
  rows: DespesaDTO[];
  venc?: boolean;
  canEditar: boolean;
  canExcluir: boolean;
  canEditNumero?: boolean;
} & Ref) {
  const fornById = new Map(fornecedores.map((f) => [f.id, f.nome]));
  const showActions = canEditar || canExcluir;
  const cols = showActions ? 8 : 7;

  return (
    <Table>
      <THead>
        <tr>
          <TH>{venc ? "Vencimento" : "Competência"}</TH>
          <TH>Nº Doc</TH>
          <TH>Fornecedor</TH>
          <TH>Conta CEF</TH>
          <TH>Cat. DRE</TH>
          <TH className="text-right">Valor</TH>
          <TH>Status</TH>
          {showActions && <TH className="text-right">Ações</TH>}
        </tr>
      </THead>
      <tbody>
        {rows.map((d) => (
          <Row
            key={d.id}
            d={d}
            fornById={fornById}
            fornecedores={fornecedores}
            contas={contas}
            bancos={bancos}
            categorias={categorias}
            venc={venc}
            canEditar={canEditar}
            canExcluir={canExcluir}
            canEditNumero={canEditNumero}
          />
        ))}
        {rows.length === 0 && (
          <TR>
            <TD colSpan={cols} className="py-6 text-center text-[var(--color-ink3)]">
              Nada por aqui nesta versão.
            </TD>
          </TR>
        )}
      </tbody>
    </Table>
  );
}

function Row({
  d,
  fornById,
  fornecedores,
  contas,
  categorias,
  venc,
  canEditar,
  canExcluir,
  canEditNumero = false,
}: {
  d: DespesaDTO;
  fornById: Map<string, string>;
  venc?: boolean;
  canEditar: boolean;
  canExcluir: boolean;
  canEditNumero?: boolean;
} & Ref) {
  const router = useRouter();
  const [editing, setEditing] = useState(false);
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [f, setF] = useState({
    numDoc: d.numDoc ?? "",
    fornecedorId: d.fornecedorId ?? "",
    contaCef: d.contaCef ?? "",
    categoriaDre: d.categoriaDre ?? "",
    bancoId: d.bancoId ?? "",
    competencia: d.competencia ?? "",
    vencimento: d.vencimento ?? "",
    valor: d.valor,
    status: d.status ?? "A pagar",
  });
  const showActions = canEditar || canExcluir;

  const cancel = () => {
    setF({
      numDoc: d.numDoc ?? "",
      fornecedorId: d.fornecedorId ?? "",
      contaCef: d.contaCef ?? "",
      categoriaDre: d.categoriaDre ?? "",
      bancoId: d.bancoId ?? "",
      competencia: d.competencia ?? "",
      vencimento: d.vencimento ?? "",
      valor: d.valor,
      status: d.status ?? "A pagar",
    });
    setError(null);
    setEditing(false);
  };

  const save = () => {
    setError(null);
    start(async () => {
      try {
        await updateDespesa(d.id, {
          numDoc: f.numDoc,
          fornecedorId: f.fornecedorId,
          contaCef: f.contaCef,
          categoriaDre: f.categoriaDre,
          bancoId: f.bancoId,
          competencia: f.competencia,
          vencimento: f.vencimento,
          valor: f.valor,
          status: f.status,
        });
        setEditing(false);
        router.refresh();
      } catch (e) {
        setError(e instanceof Error ? e.message : "Falha ao salvar.");
      }
    });
  };

  const remove = () => {
    if (
      !window.confirm(
        `Excluir a despesa ${d.numDoc ?? ""} (${brl0(Number(d.valor))})? Esta ação não pode ser desfeita.`,
      )
    )
      return;
    setError(null);
    start(async () => {
      try {
        await deleteDespesa(d.id);
        router.refresh();
      } catch (e) {
        setError(e instanceof Error ? e.message : "Falha ao excluir.");
      }
    });
  };

  if (editing) {
    return (
      <TR>
        <TD>
          {venc ? (
            <DateField
              value={f.vencimento}
              onChange={(v) => setF((s) => ({ ...s, vencimento: v }))}
              className="h-8 text-xs"
            />
          ) : (
            <MonthField
              value={f.competencia}
              onChange={(v) => setF((s) => ({ ...s, competencia: v }))}
              className="h-8 text-xs"
            />
          )}
        </TD>
        <TD>
          {canEditNumero ? (
            <Input
              value={f.numDoc}
              onChange={(e) => setF((s) => ({ ...s, numDoc: e.target.value }))}
              className="h-8 w-28 text-xs"
            />
          ) : (
            <span className="font-[family-name:var(--font-mono)] text-[var(--color-ink3)]">
              {f.numDoc || "—"}
            </span>
          )}
        </TD>
        <TD>
          <Select
            value={f.fornecedorId}
            onChange={(e) => setF((s) => ({ ...s, fornecedorId: e.target.value }))}
            className="h-8 text-xs"
          >
            <option value="">—</option>
            {fornecedores.map((x) => (
              <option key={x.id} value={x.id}>
                {x.nome}
              </option>
            ))}
          </Select>
        </TD>
        <TD>
          <Select
            value={f.contaCef}
            onChange={(e) => setF((s) => ({ ...s, contaCef: e.target.value }))}
            className="h-8 text-xs"
          >
            <option value="">—</option>
            {contas.map((c) => (
              <option key={c.code} value={c.code}>
                {c.code} — {c.name}
              </option>
            ))}
          </Select>
        </TD>
        <TD>
          <Select
            value={f.categoriaDre}
            onChange={(e) => setF((s) => ({ ...s, categoriaDre: e.target.value }))}
            className="h-8 text-xs"
          >
            <option value="">—</option>
            {categorias.map((c) => (
              <option key={c} value={c}>
                {c}
              </option>
            ))}
          </Select>
        </TD>
        <TD>
          <Input
            type="number"
            step="0.01"
            value={f.valor}
            onChange={(e) => setF((s) => ({ ...s, valor: e.target.value }))}
            className="h-8 w-24 text-right text-xs"
          />
        </TD>
        <TD>
          <Select
            value={f.status}
            onChange={(e) => setF((s) => ({ ...s, status: e.target.value }))}
            className="h-8 text-xs"
          >
            <option>A pagar</option>
            <option>Pago</option>
          </Select>
        </TD>
        <TD className="text-right">
          <div className="flex justify-end gap-1.5">
            <Button size="sm" disabled={pending} onClick={save}>
              Salvar
            </Button>
            <Button size="sm" variant="ghost" disabled={pending} onClick={cancel}>
              Cancelar
            </Button>
          </div>
          {error && (
            <p className="mt-1 text-right text-[11px] text-[var(--color-danger)]">
              {error}
            </p>
          )}
        </TD>
      </TR>
    );
  }

  return (
    <TR>
      <TD className="font-[family-name:var(--font-mono)]">
        {dateBR(venc ? d.vencimento : d.competencia)}
      </TD>
      <TD className="font-[family-name:var(--font-mono)] text-[var(--color-ink3)]">
        {d.numDoc ?? "—"}
      </TD>
      <TD>{d.fornecedorId ? fornById.get(d.fornecedorId) ?? "—" : "—"}</TD>
      <TD>
        <Badge tone="warning">{d.contaCef ?? "—"}</Badge>
      </TD>
      <TD className="text-[var(--color-ink2)]">{d.categoriaDre ?? "—"}</TD>
      <TD className="text-right font-[family-name:var(--font-mono)]">
        {brl0(Number(d.valor))}
      </TD>
      <TD>
        <Badge tone={d.status === "Pago" ? "success" : "neutral"}>
          {d.status ?? "—"}
        </Badge>
      </TD>
      {showActions && (
        <TD className="text-right">
          <div className="flex justify-end gap-2">
            {canEditar && (
              <button
                onClick={() => setEditing(true)}
                disabled={pending}
                className="text-sm text-[var(--color-accent2)] hover:underline disabled:opacity-50"
              >
                Editar
              </button>
            )}
            {canExcluir && (
              <button
                onClick={remove}
                disabled={pending}
                className="text-sm text-[var(--color-danger)] hover:underline disabled:opacity-50"
              >
                Excluir
              </button>
            )}
          </div>
          {error && (
            <p className="mt-1 text-right text-[11px] text-[var(--color-danger)]">
              {error}
            </p>
          )}
        </TD>
      )}
    </TR>
  );
}
