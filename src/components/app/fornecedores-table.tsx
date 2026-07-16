"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import {
  updateStakeholder,
  setStakeholderAtivo,
  deleteStakeholder,
} from "@/lib/actions/despesas";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input, Label, Select } from "@/components/ui/input";
import { Table, THead, TH, TR, TD } from "@/components/ui/table";

export interface StakeholderView {
  id: string;
  nome: string;
  tipo: string;
  doc: string | null;
  papeis: string[];
  email: string | null;
  tel: string | null;
  obs: string | null;
  ativo: boolean;
}

export function FornecedoresTable({
  stakeholders,
  papeis,
  canEditar,
  canExcluir,
}: {
  stakeholders: StakeholderView[];
  papeis: readonly string[];
  canEditar: boolean;
  canExcluir: boolean;
}) {
  const [mostrarInativos, setMostrarInativos] = useState(false);
  const visiveis = stakeholders.filter((s) => mostrarInativos || s.ativo);

  return (
    <div className="space-y-3">
      <label className="flex w-fit cursor-pointer items-center gap-2 text-[12.5px] text-[var(--color-ink2)]">
        <input
          type="checkbox"
          checked={mostrarInativos}
          onChange={(e) => setMostrarInativos(e.target.checked)}
          className="h-4 w-4 accent-[var(--color-accent2)]"
        />
        Mostrar inativos
      </label>

      <Table>
        <THead>
          <tr>
            <TH>Nome</TH>
            <TH>Tipo</TH>
            <TH>Documento</TH>
            <TH>Papéis</TH>
            <TH>Status</TH>
            {(canEditar || canExcluir) && <TH className="text-right">Ações</TH>}
          </tr>
        </THead>
        <tbody>
          {visiveis.map((s) => (
            <StakeholderRow
              key={s.id}
              s={s}
              papeis={papeis}
              canEditar={canEditar}
              canExcluir={canExcluir}
            />
          ))}
          {visiveis.length === 0 && (
            <TR>
              <TD colSpan={6} className="py-6 text-center text-[var(--color-ink3)]">
                Nenhum cadastro.
              </TD>
            </TR>
          )}
        </tbody>
      </Table>
    </div>
  );
}

function StakeholderRow({
  s,
  papeis,
  canEditar,
  canExcluir,
}: {
  s: StakeholderView;
  papeis: readonly string[];
  canEditar: boolean;
  canExcluir: boolean;
}) {
  const router = useRouter();
  const [editing, setEditing] = useState(false);
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);

  const toggleAtivo = () =>
    start(async () => {
      try {
        await setStakeholderAtivo(s.id, !s.ativo);
        router.refresh();
      } catch (e) {
        setError(e instanceof Error ? e.message : "Falha.");
      }
    });

  const excluir = () => {
    if (!window.confirm(`Excluir definitivamente "${s.nome}"? (Se houver histórico, prefira inativar.)`)) return;
    start(async () => {
      try {
        await deleteStakeholder(s.id);
        router.refresh();
      } catch (e) {
        setError(e instanceof Error ? e.message : "Falha ao excluir.");
      }
    });
  };

  if (editing) {
    return (
      <TR>
        <TD colSpan={6}>
          <form
            action={async (fd) => {
              await updateStakeholder(fd);
              setEditing(false);
              router.refresh();
            }}
            className="rounded-[8px] border border-[var(--color-accent2)]/15 bg-[var(--color-surface2)] p-3"
          >
            <input type="hidden" name="id" value={s.id} />
            <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
              <div className="sm:col-span-2"><Label>Nome</Label><Input name="nome" defaultValue={s.nome} required /></div>
              <div>
                <Label>Tipo</Label>
                <Select name="tipo" defaultValue={s.tipo}>
                  <option value="PJ">PJ</option>
                  <option value="PF">PF</option>
                </Select>
              </div>
              <div><Label>Documento</Label><Input name="doc" defaultValue={s.doc ?? ""} /></div>
              <div><Label>E-mail</Label><Input name="email" defaultValue={s.email ?? ""} /></div>
              <div><Label>Telefone</Label><Input name="tel" defaultValue={s.tel ?? ""} /></div>
              <div className="sm:col-span-2"><Label>Observação</Label><Input name="obs" defaultValue={s.obs ?? ""} /></div>
            </div>
            <div className="mt-2">
              <Label>Papéis (uma pessoa pode ter vários)</Label>
              <div className="flex flex-wrap gap-2">
                {papeis.map((p) => (
                  <label key={p} className="flex items-center gap-1.5 text-[12.5px] text-[var(--color-ink2)]">
                    <input
                      type="checkbox"
                      name="papeis"
                      value={p}
                      defaultChecked={s.papeis.includes(p)}
                      className="h-4 w-4 accent-[var(--color-accent2)]"
                    />
                    {p}
                  </label>
                ))}
              </div>
            </div>
            <div className="mt-2 flex justify-end gap-2">
              <Button size="sm" type="submit" disabled={pending}>Salvar</Button>
              <Button size="sm" type="button" variant="ghost" onClick={() => setEditing(false)}>Cancelar</Button>
            </div>
          </form>
        </TD>
      </TR>
    );
  }

  return (
    <TR className={s.ativo ? undefined : "opacity-60"}>
      <TD className="font-medium text-[var(--color-ink)]">{s.nome}</TD>
      <TD><Badge tone={s.tipo === "PJ" ? "info" : "neutral"}>{s.tipo}</Badge></TD>
      <TD className="font-[family-name:var(--font-mono)]">{s.doc || "—"}</TD>
      <TD>
        <div className="flex flex-wrap gap-1">
          {s.papeis.length ? s.papeis.map((p) => <Badge key={p}>{p}</Badge>) : <span className="text-[var(--color-ink4)]">—</span>}
        </div>
      </TD>
      <TD><Badge tone={s.ativo ? "success" : "neutral"}>{s.ativo ? "Ativo" : "Inativo"}</Badge></TD>
      {(canEditar || canExcluir) && (
        <TD className="text-right">
          <div className="flex flex-wrap justify-end gap-2">
            {canEditar && (
              <button onClick={() => setEditing(true)} disabled={pending} className="text-sm text-[var(--color-accent2)] hover:underline disabled:opacity-50">Editar</button>
            )}
            {canEditar && (
              <button onClick={toggleAtivo} disabled={pending} className="text-sm text-[var(--color-warning)] hover:underline disabled:opacity-50">
                {s.ativo ? "Inativar" : "Reativar"}
              </button>
            )}
            {canExcluir && (
              <button onClick={excluir} disabled={pending} className="text-sm text-[var(--color-danger)] hover:underline disabled:opacity-50">Excluir</button>
            )}
          </div>
          {error && <p className="mt-1 text-[11px] text-[var(--color-danger)]">{error}</p>}
        </TD>
      )}
    </TR>
  );
}
