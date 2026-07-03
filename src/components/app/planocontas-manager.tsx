"use client";

import { useState, useTransition } from "react";
import {
  addChartGroup,
  addChartItem,
  deleteChartGroup,
  deleteChartItem,
  renameChartGroup,
  updateChartItem,
} from "@/lib/actions/planocontas";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

type Kind = "cef" | "complementar";
interface Item {
  id: string;
  code: string;
  name: string;
}
interface Group {
  code: string;
  name: string;
  kind: Kind;
  items: Item[];
}
export interface PlanoPerms {
  criar: boolean;
  editar: boolean;
  excluir: boolean;
}

export function PlanoContasManager({
  cef,
  comp,
  perms,
}: {
  cef: Group[];
  comp: Group[];
  perms: PlanoPerms;
}) {
  return (
    <div className="space-y-8">
      <GroupSection title="Grupos CEF / Obra" kind="cef" groups={cef} perms={perms} />
      <GroupSection
        title="Grupos Complementares"
        kind="complementar"
        groups={comp}
        perms={perms}
      />
    </div>
  );
}

function GroupSection({
  title,
  kind,
  groups,
  perms,
}: {
  title: string;
  kind: Kind;
  groups: Group[];
  perms: PlanoPerms;
}) {
  return (
    <section>
      <h2 className="mb-3 text-sm font-semibold text-[var(--color-ink)]">{title}</h2>
      <div className="space-y-3">
        {groups.map((g) => (
          <GroupCard key={`${g.kind}-${g.code}`} group={g} perms={perms} />
        ))}
        {groups.length === 0 && (
          <p className="text-[13px] text-[var(--color-ink4)]">Nenhum grupo ainda.</p>
        )}
      </div>
      {perms.criar && <NewGroupForm kind={kind} />}
    </section>
  );
}

function GroupCard({ group, perms }: { group: Group; perms: PlanoPerms }) {
  const [open, setOpen] = useState(false);
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [groupName, setGroupName] = useState(group.name);
  const [groupCode, setGroupCode] = useState(group.code);
  const canManage = perms.criar || perms.editar || perms.excluir;

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
    <Card>
      <CardContent className="p-4">
        <div className="mb-2 flex items-center gap-2">
          <span className="flex h-6 min-w-6 items-center justify-center rounded-[6px] bg-[var(--color-accent4)] px-1.5 font-[family-name:var(--font-mono)] text-[11px] font-semibold text-[var(--color-accent)]">
            {group.code}
          </span>
          <span className="flex-1 text-sm font-semibold text-[var(--color-ink)]">
            {group.name}
          </span>
          {canManage && (
            <button
              onClick={() => setOpen((o) => !o)}
              className="text-[11px] text-[var(--color-accent2)] hover:underline"
            >
              {open ? "Fechar" : "Editar"}
            </button>
          )}
        </div>

        {!open ? (
          <div className="flex flex-wrap gap-2">
            {group.items.map((it) => (
              <span
                key={it.id}
                className="rounded-[8px] bg-[var(--color-surface3)] px-2.5 py-1 font-[family-name:var(--font-mono)] text-[12px] text-[var(--color-ink2)]"
              >
                {it.code} {it.name}
              </span>
            ))}
            {group.items.length === 0 && (
              <span className="text-[12px] text-[var(--color-ink4)]">Sem subitens.</span>
            )}
          </div>
        ) : (
          <div className="space-y-3">
            {/* Editar / excluir o grupo */}
            {(perms.editar || perms.excluir) && (
              <div className="flex flex-wrap items-end gap-2 rounded-[8px] bg-[var(--color-surface2)] p-2.5">
                <div className="w-20">
                  <label className="text-[10px] text-[var(--color-ink3)]">Código</label>
                  <Input
                    value={groupCode}
                    onChange={(e) => setGroupCode(e.target.value)}
                    disabled={!perms.editar || pending}
                    className="h-8 text-xs"
                  />
                </div>
                <div className="flex-1">
                  <label className="text-[10px] text-[var(--color-ink3)]">Nome do grupo</label>
                  <Input
                    value={groupName}
                    onChange={(e) => setGroupName(e.target.value)}
                    disabled={!perms.editar || pending}
                    className="h-8 text-xs"
                  />
                </div>
                {perms.editar && (
                  <Button
                    size="sm"
                    disabled={pending}
                    onClick={() =>
                      run(() =>
                        renameChartGroup({
                          kind: group.kind,
                          groupCode: group.code,
                          groupName,
                          newGroupCode: groupCode,
                        }),
                      )
                    }
                  >
                    Salvar
                  </Button>
                )}
                {perms.excluir && (
                  <button
                    disabled={pending}
                    onClick={() => {
                      if (
                        window.confirm(
                          `Excluir o grupo "${group.code} ${group.name}" e todos os seus subitens?`,
                        )
                      )
                        run(() =>
                          deleteChartGroup({ kind: group.kind, groupCode: group.code }),
                        );
                    }}
                    className="text-xs text-[var(--color-danger)] hover:underline disabled:opacity-50"
                  >
                    Excluir grupo
                  </button>
                )}
              </div>
            )}

            {/* Subitens editáveis */}
            <div className="space-y-1.5">
              {group.items.map((it) => (
                <ItemRow key={it.id} item={it} perms={perms} />
              ))}
            </div>

            {/* Novo subitem */}
            {perms.criar && <NewItemRow group={group} />}
          </div>
        )}

        {error && <p className="mt-2 text-xs text-[var(--color-danger)]">{error}</p>}
      </CardContent>
    </Card>
  );
}

function ItemRow({ item, perms }: { item: Item; perms: PlanoPerms }) {
  const [code, setCode] = useState(item.code);
  const [name, setName] = useState(item.name);
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const dirty = code !== item.code || name !== item.name;

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
    <div className="flex flex-wrap items-center gap-2">
      <Input
        value={code}
        onChange={(e) => setCode(e.target.value)}
        disabled={!perms.editar || pending}
        className="h-8 w-20 font-[family-name:var(--font-mono)] text-xs"
      />
      <Input
        value={name}
        onChange={(e) => setName(e.target.value)}
        disabled={!perms.editar || pending}
        className="h-8 flex-1 text-xs"
      />
      {perms.editar && (
        <Button
          size="sm"
          variant="outline"
          disabled={pending || !dirty}
          onClick={() => run(() => updateChartItem(item.id, { code, name }))}
        >
          Salvar
        </Button>
      )}
      {perms.excluir && (
        <button
          disabled={pending}
          onClick={() => run(() => deleteChartItem(item.id))}
          className="px-1 text-[var(--color-danger)] hover:opacity-70 disabled:opacity-50"
          title="Excluir subitem"
        >
          ×
        </button>
      )}
      {error && <span className="text-xs text-[var(--color-danger)]">{error}</span>}
    </div>
  );
}

function NewItemRow({ group }: { group: Group }) {
  const [code, setCode] = useState("");
  const [name, setName] = useState("");
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);

  const add = () => {
    setError(null);
    start(async () => {
      try {
        await addChartItem({
          kind: group.kind,
          groupCode: group.code,
          groupName: group.name,
          code,
          name,
        });
        setCode("");
        setName("");
      } catch (e) {
        setError(e instanceof Error ? e.message : "Erro.");
      }
    });
  };

  return (
    <div className="flex flex-wrap items-center gap-2 border-t border-[var(--color-accent2)]/8 pt-2">
      <Input
        value={code}
        onChange={(e) => setCode(e.target.value)}
        placeholder="1.11"
        disabled={pending}
        className="h-8 w-20 font-[family-name:var(--font-mono)] text-xs"
      />
      <Input
        value={name}
        onChange={(e) => setName(e.target.value)}
        placeholder="Novo subitem"
        disabled={pending}
        className="h-8 flex-1 text-xs"
      />
      <Button size="sm" disabled={pending || !code.trim() || !name.trim()} onClick={add}>
        Adicionar
      </Button>
      {error && <span className="text-xs text-[var(--color-danger)]">{error}</span>}
    </div>
  );
}

function NewGroupForm({ kind }: { kind: Kind }) {
  const [open, setOpen] = useState(false);
  const [groupCode, setGroupCode] = useState("");
  const [groupName, setGroupName] = useState("");
  const [code, setCode] = useState("");
  const [name, setName] = useState("");
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);

  const create = () => {
    setError(null);
    start(async () => {
      try {
        await addChartGroup({ kind, groupCode, groupName, code, name });
        setGroupCode("");
        setGroupName("");
        setCode("");
        setName("");
        setOpen(false);
      } catch (e) {
        setError(e instanceof Error ? e.message : "Erro.");
      }
    });
  };

  if (!open) {
    return (
      <button
        onClick={() => setOpen(true)}
        className="mt-3 flex w-full items-center justify-center gap-1.5 rounded-[10px] border border-dashed border-[var(--color-accent2)]/25 px-3 py-2 text-[12px] text-[var(--color-ink3)] transition-colors hover:border-[var(--color-accent2)]/50 hover:text-[var(--color-ink)]"
      >
        + Novo grupo
      </button>
    );
  }

  return (
    <Card className="mt-3">
      <CardContent className="space-y-2 p-4">
        <h3 className="text-[13px] font-semibold text-[var(--color-ink)]">Novo grupo</h3>
        <div className="flex flex-wrap items-end gap-2">
          <div className="w-24">
            <label className="text-[10px] text-[var(--color-ink3)]">Código grupo</label>
            <Input
              value={groupCode}
              onChange={(e) => setGroupCode(e.target.value)}
              placeholder="11"
              className="h-8 text-xs"
            />
          </div>
          <div className="min-w-[180px] flex-1">
            <label className="text-[10px] text-[var(--color-ink3)]">Nome do grupo</label>
            <Input
              value={groupName}
              onChange={(e) => setGroupName(e.target.value)}
              placeholder="Instalações"
              className="h-8 text-xs"
            />
          </div>
        </div>
        <div className="flex flex-wrap items-end gap-2">
          <div className="w-24">
            <label className="text-[10px] text-[var(--color-ink3)]">1º subitem</label>
            <Input
              value={code}
              onChange={(e) => setCode(e.target.value)}
              placeholder="11.1"
              className="h-8 font-[family-name:var(--font-mono)] text-xs"
            />
          </div>
          <div className="min-w-[180px] flex-1">
            <label className="text-[10px] text-[var(--color-ink3)]">Nome do subitem</label>
            <Input
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Descrição"
              className="h-8 text-xs"
            />
          </div>
        </div>
        <div className="flex items-center gap-2">
          <Button
            size="sm"
            disabled={pending || !groupCode.trim() || !groupName.trim() || !code.trim() || !name.trim()}
            onClick={create}
          >
            Criar grupo
          </Button>
          <button
            onClick={() => setOpen(false)}
            disabled={pending}
            className="text-xs text-[var(--color-ink3)] hover:underline"
          >
            Cancelar
          </button>
          {error && <span className="text-xs text-[var(--color-danger)]">{error}</span>}
        </div>
      </CardContent>
    </Card>
  );
}
