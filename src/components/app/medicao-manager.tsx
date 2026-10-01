"use client";

import { useState, useTransition } from "react";
import { deleteMedicao, updateMedicao } from "@/lib/actions/medicao";
import { brl0 } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
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
  /** rótulo do autor (0.5): nome, e-mail ou "autor não registrado". */
  autor: string;
  semAutor: boolean;
  quando: string;
  /** 0.5.5 — o usuário pode editar/excluir ESTA medição (conferido de novo na action). */
  podeTocar: boolean;
  /** 0.4.4 — repete grupo + competência com outra medição da lista. */
  duplicada: boolean;
}

/**
 * Lista de medições (Prompt V, 0.4). Editar e excluir chamam as mesmas
 * actions, que devolvem `{ ok, error, aviso }`; a exclusão pede confirmação
 * (4.3) e a duplicidade aparece marcada com o motivo (0.4.4). Sem coluna de
 * orçado (0.5.6): quem não tem a aba do relatório não vê orçado aqui.
 */
export function MedicaoTable({ rows, canEditar, canExcluir, vazio }: { rows: MedicaoRowData[]; canEditar: boolean; canExcluir: boolean; vazio: string }) {
  const showActions = canEditar || canExcluir;
  const cols = showActions ? 6 : 5;
  return (
    <Table>
      <THead>
        <tr>
          <TH>Competência</TH>
          <TH>Grupo de obra</TH>
          <TH className="text-right">Valor medido</TH>
          <TH>Observação</TH>
          <TH>Quem lançou</TH>
          {showActions && <TH className="text-right">Ações</TH>}
        </tr>
      </THead>
      <tbody>
        {rows.length === 0 ? (
          <TR>
            <TD colSpan={cols} className="py-8 text-center text-[var(--color-ink4)]">
              {vazio}
            </TD>
          </TR>
        ) : (
          rows.map((r) => <Row key={r.id} row={r} canEditar={canEditar && r.podeTocar} canExcluir={canExcluir && r.podeTocar} />)
        )}
      </tbody>
    </Table>
  );
}

function Autor({ row }: { row: MedicaoRowData }) {
  return (
    <span className="text-[12px] text-[var(--color-ink2)]">
      {row.semAutor ? <Badge tone="neutral">{row.autor}</Badge> : row.autor}
      <span className="block text-[11px] text-[var(--color-ink4)]">{row.quando}</span>
    </span>
  );
}

function Duplicada({ row }: { row: MedicaoRowData }) {
  if (!row.duplicada) return null;
  return (
    <Badge tone="warning" title="Outra medição do mesmo grupo nesta competência. Pode ser medição complementar — confira antes de somar duas vezes.">
      duplicidade aparente
    </Badge>
  );
}

function Row({ row, canEditar, canExcluir }: { row: MedicaoRowData; canEditar: boolean; canExcluir: boolean }) {
  const [competencia, setCompetencia] = useState(row.competencia);
  const [valor, setValor] = useState(String(row.valor));
  const [obs, setObs] = useState(row.obs);
  const [pending, start] = useTransition();
  const [msg, setMsg] = useState<{ erro: boolean; texto: string } | null>(null);

  const dirty = competencia !== row.competencia || Number(valor) !== row.valor || obs !== row.obs;

  const run = (fn: () => Promise<{ ok: boolean; error?: string; aviso?: string }>, recarregar: boolean) => {
    setMsg(null);
    start(async () => {
      try {
        const r = await fn();
        if (!r.ok) return setMsg({ erro: true, texto: r.error ?? "Erro." });
        if (r.aviso) setMsg({ erro: false, texto: r.aviso });
        if (recarregar) window.location.reload();
      } catch (e) {
        setMsg({ erro: true, texto: e instanceof Error ? e.message : "Erro." });
      }
    });
  };

  if (!canEditar && !canExcluir) {
    return (
      <TR>
        <TD className="font-[family-name:var(--font-mono)]">{row.competencia}</TD>
        <TD>
          <span className="font-[family-name:var(--font-mono)] text-[var(--color-accent)]">{row.grupoCode}</span> {row.grupoName} <Duplicada row={row} />
        </TD>
        <TD className="text-right font-[family-name:var(--font-mono)]">{brl0(row.valor)}</TD>
        <TD>{row.obs || "—"}</TD>
        <TD>
          <Autor row={row} />
        </TD>
      </TR>
    );
  }

  return (
    <TR>
      <TD>
        <MonthField value={competencia} onChange={setCompetencia} disabled={!canEditar || pending} className="h-8 w-32 text-xs" />
      </TD>
      <TD>
        <span className="font-[family-name:var(--font-mono)] text-[var(--color-accent)]">{row.grupoCode}</span> {row.grupoName} <Duplicada row={row} />
      </TD>
      <TD className="text-right">
        <Input
          type="number"
          step="0.01"
          min="0.01"
          value={valor}
          onChange={(e) => setValor(e.target.value)}
          disabled={!canEditar || pending}
          className="h-8 w-32 text-right font-[family-name:var(--font-mono)] text-xs"
        />
      </TD>
      <TD>
        <Input value={obs} onChange={(e) => setObs(e.target.value)} disabled={!canEditar || pending} className="h-8 text-xs" />
        {msg && (
          <div role={msg.erro ? "alert" : "status"} className={`text-xs ${msg.erro ? "text-[var(--color-danger)]" : "text-[#92400e]"}`}>
            {msg.texto}
          </div>
        )}
      </TD>
      <TD>
        <Autor row={row} />
      </TD>
      <TD className="text-right">
        <div className="flex items-center justify-end gap-2">
          {canEditar && (
            <Button size="sm" variant="outline" disabled={pending || !dirty} onClick={() => run(() => updateMedicao(row.id, { competencia, valor, obs }), false)}>
              Salvar
            </Button>
          )}
          {canExcluir && (
            <button
              disabled={pending}
              onClick={() => {
                // 4.3 — confirmação antes da exclusão física; a action exige `confirmado`.
                if (!window.confirm(`Excluir a medição de ${row.competencia}, grupo ${row.grupoCode} (${brl0(row.valor)})? Esta exclusão é definitiva e fica na Auditoria.`)) return;
                run(() => deleteMedicao(row.id, true), true);
              }}
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
