"use client";

import { Fragment, useMemo, useState, useTransition } from "react";
import {
  SCREENS,
  type PermMatrix,
  type PermAction,
  type Modulo,
} from "@/lib/permissions";
import { setMemberPermissions } from "@/lib/actions/users";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";

export interface AccessMatrixMember {
  userId: string;
  name: string | null;
  email: string | null;
  role: string;
  perms: PermMatrix;
}

const ACTIONS: { key: PermAction; label: string }[] = [
  { key: "ver", label: "Ver" },
  { key: "criar", label: "Criar" },
  { key: "editar", label: "Editar" },
  { key: "excluir", label: "Excluir" },
];
const MODULOS: Modulo[] = ["Receitas", "Despesas", "Reports", "Config"];

export function AccessMatrix({
  members,
  canEdit = true,
}: {
  members: AccessMatrixMember[];
  canEdit?: boolean;
}) {
  const [sel, setSel] = useState<string | null>(members[0]?.userId ?? null);
  const member = members.find((m) => m.userId === sel) ?? null;

  return (
    <div className="grid gap-6 lg:grid-cols-[260px_1fr]">
      {/* Lista de membros */}
      <div className="space-y-1.5">
        {members.map((m) => {
          const active = m.userId === sel;
          return (
            <button
              key={m.userId}
              onClick={() => setSel(m.userId)}
              className={`w-full rounded-[8px] border px-3 py-2.5 text-left transition-colors ${
                active
                  ? "border-[var(--color-accent2)] bg-[var(--color-accent4)]"
                  : "border-[var(--color-accent2)]/12 bg-white hover:bg-[var(--color-surface2)]"
              }`}
            >
              <div className="text-sm font-medium text-[var(--color-ink)]">
                {m.name ?? m.email}
              </div>
              <div className="mt-0.5 flex items-center gap-1.5">
                <Badge tone={m.role === "owner" ? "accent" : "neutral"}>
                  {m.role}
                </Badge>
              </div>
            </button>
          );
        })}
      </div>

      {/* Matriz do membro selecionado */}
      {member ? (
        <MemberMatrix key={member.userId} member={member} canEdit={canEdit} />
      ) : (
        <Card>
          <CardContent className="p-8 text-center text-sm text-[var(--color-ink3)]">
            Selecione um membro.
          </CardContent>
        </Card>
      )}
    </div>
  );
}

function MemberMatrix({
  member,
  canEdit,
}: {
  member: AccessMatrixMember;
  canEdit: boolean;
}) {
  const [perms, setPerms] = useState<PermMatrix>(() =>
    Object.fromEntries(
      SCREENS.map((s) => [s.id, { ...(member.perms[s.id] ?? { ver: false, criar: false, editar: false, excluir: false }) }]),
    ),
  );
  const [pending, start] = useTransition();
  const [saved, setSaved] = useState(false);
  const [dirty, setDirty] = useState(false);
  const ownerFull = member.role === "owner"; // owner sempre total
  const editable = canEdit && !ownerFull;

  // Persiste (e registra no log de auditoria) apenas ao clicar em "Salvar" —
  // evita gerar uma entrada de auditoria a cada clique de checkbox.
  const save = () => {
    if (!editable || !dirty) return;
    setSaved(false);
    start(async () => {
      await setMemberPermissions(member.userId, perms);
      setDirty(false);
      setSaved(true);
    });
  };

  function toggle(screenId: string, action: PermAction) {
    if (!editable) return;
    setSaved(false);
    setDirty(true);
    setPerms((prev) => {
      const cur = { ...prev[screenId] };
      const val = !cur[action];
      cur[action] = val;
      // "Ver" é pré-requisito das demais ações.
      if (action === "ver" && !val) {
        cur.criar = cur.editar = cur.excluir = false;
      } else if (action !== "ver" && val) {
        cur.ver = true;
      }
      return { ...prev, [screenId]: cur };
    });
  }

  const grouped = useMemo(
    () => MODULOS.map((mod) => ({ mod, screens: SCREENS.filter((s) => s.modulo === mod) })),
    [],
  );

  return (
    <Card>
      <CardContent className="p-5">
        <div className="mb-3 flex items-center justify-between">
          <h2 className="text-sm font-semibold text-[var(--color-ink)]">
            Permissões · {member.name ?? member.email}
          </h2>
          {ownerFull ? (
            <Badge tone="accent">owner — acesso total</Badge>
          ) : (
            <div className="flex items-center gap-3">
              {pending ? (
                <span className="text-xs text-[var(--color-ink3)]">Salvando…</span>
              ) : saved ? (
                <span className="text-xs text-[var(--color-success)]">Salvo.</span>
              ) : dirty ? (
                <span className="text-xs text-[var(--color-warning)]">
                  Alterações não salvas
                </span>
              ) : null}
              {editable && (
                <Button size="sm" onClick={save} disabled={!dirty || pending}>
                  Salvar
                </Button>
              )}
            </div>
          )}
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-[var(--color-accent2)]/12">
                <th className="px-2 py-2 text-left font-[family-name:var(--font-mono)] text-[10px] uppercase tracking-wide text-[var(--color-ink3)]">
                  Tela
                </th>
                {ACTIONS.map((a) => (
                  <th key={a.key} className="px-2 py-2 text-center font-[family-name:var(--font-mono)] text-[10px] uppercase tracking-wide text-[var(--color-ink3)]">
                    {a.label}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {grouped.map(({ mod, screens }) => (
                <Fragment key={mod}>
                  <tr className="bg-[var(--color-surface2)]">
                    <td colSpan={5} className="px-2 py-1.5 font-[family-name:var(--font-mono)] text-[10px] uppercase tracking-wide text-[var(--color-accent)]">
                      {mod}
                    </td>
                  </tr>
                  {screens.map((s) => (
                    <tr key={s.id} className="border-b border-[var(--color-accent2)]/8">
                      <td className="px-2 py-2 text-[var(--color-ink2)]">{s.label}</td>
                      {ACTIONS.map((a) => {
                        const checked = ownerFull ? true : perms[s.id]?.[a.key] ?? false;
                        return (
                          <td key={a.key} className="px-2 py-2 text-center">
                            <input
                              type="checkbox"
                              checked={checked}
                              disabled={!editable || pending}
                              onChange={() => toggle(s.id, a.key)}
                            />
                          </td>
                        );
                      })}
                    </tr>
                  ))}
                </Fragment>
              ))}
            </tbody>
          </table>
        </div>
      </CardContent>
    </Card>
  );
}
