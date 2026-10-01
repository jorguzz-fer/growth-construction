"use client";

import { Fragment, useMemo, useState, useTransition } from "react";
import {
  CONTADOR_VE,
  HERDA_DE,
  SCREENS,
  TELAS_SO_ADMIN,
  temTetoDeLeitura,
  type PermMatrix,
  type PermAction,
  type Modulo,
} from "@/lib/permissions";
import { resetMemberPermissions, setMemberPermissions } from "@/lib/actions/users";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";

export interface AccessMatrixMember {
  userId: string;
  name: string | null;
  email: string | null;
  role: string;
  perms: PermMatrix;
  /** Telas com override gravado; as demais seguem o padrão do papel (AJ 2.3). */
  personalizadas: number;
}

const ACTIONS: { key: PermAction; label: string }[] = [
  { key: "ver", label: "Ver" },
  { key: "criar", label: "Criar" },
  { key: "editar", label: "Editar" },
  { key: "excluir", label: "Excluir" },
];
const MODULOS: Modulo[] = [
  // A ordem espelha o menu lateral. "Planejamento" estava faltando: as telas de
  // Budget, Forecast e Plano de Contas não apareciam na matriz, e não havia como
  // conceder ou revogar acesso a elas por aqui.
  "Planejamento",
  "Receitas",
  "Despesas",
  "Conciliação de Caixa",
  "Pessoas",
  "Reports",
  "Config",
  "Backup",
];

export function AccessMatrix({
  members,
  canEdit = true,
  currentUserId,
}: {
  members: AccessMatrixMember[];
  canEdit?: boolean;
  /** Quem está logado — não edita a própria linha (AJ 3.2). */
  currentUserId?: string | null;
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
        <MemberMatrix
          key={member.userId}
          member={member}
          canEdit={canEdit}
          isSelf={member.userId === currentUserId}
        />
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
  isSelf,
}: {
  member: AccessMatrixMember;
  canEdit: boolean;
  isSelf: boolean;
}) {
  const [perms, setPerms] = useState<PermMatrix>(() =>
    Object.fromEntries(
      SCREENS.map((s) => [s.id, { ...(member.perms[s.id] ?? { ver: false, criar: false, editar: false, excluir: false }) }]),
    ),
  );
  const [pending, start] = useTransition();
  const [saved, setSaved] = useState(false);
  const [dirty, setDirty] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // Owner e admin: acesso total, garantido no módulo (AJ 3.3) — não configurável.
  const ownerFull = member.role === "owner" || member.role === "admin";
  const editable = canEdit && !ownerFull && !isSelf;
  // Prompt AL, Parte 3: o contador só recebe "Ver" — as outras colunas
  // aparecem como traço, com o motivo, e o servidor recusa o mesmo.
  const soLeitura = temTetoDeLeitura(member.role);
  const padraoContador = SCREENS.filter((s) => CONTADOR_VE.has(s.id)).map((s) => s.label);

  // Persiste (e registra no log de auditoria) apenas ao clicar em "Salvar" —
  // evita gerar uma entrada de auditoria a cada clique de checkbox. "Salvo."
  // só aparece quando o servidor confirmou (AJ 4.4).
  const save = () => {
    if (!editable || !dirty) return;
    setSaved(false);
    setError(null);
    start(async () => {
      const r = await setMemberPermissions(member.userId, perms);
      if (!r.ok) {
        setError(r.error ?? "Falha ao salvar.");
        return;
      }
      setDirty(false);
      setSaved(true);
    });
  };

  const voltarAoPadrao = () => {
    if (!editable) return;
    if (
      !window.confirm(
        `Descartar as ${member.personalizadas} tela(s) personalizada(s) de ${member.name ?? member.email} e voltar ao padrão do papel "${member.role}"? A matriz descartada fica registrada no log.`,
      )
    )
      return;
    setSaved(false);
    setError(null);
    start(async () => {
      const r = await resetMemberPermissions(member.userId);
      if (!r.ok) setError(r.error ?? "Falha ao voltar ao padrão.");
      else window.location.reload();
    });
  };

  function toggle(screenId: string, action: PermAction) {
    if (!editable || TELAS_SO_ADMIN.has(screenId) || HERDA_DE[screenId]) return;
    if (soLeitura && action !== "ver") return;
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
      const next = { ...prev, [screenId]: cur };
      // Telas que acompanham esta (AN 5.4) mudam junto, na hora.
      for (const [filha, mae] of Object.entries(HERDA_DE)) if (mae === screenId) next[filha] = { ...cur };
      return next;
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
            <Badge tone="accent">{member.role} — acesso total</Badge>
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

        {!ownerFull && (
          <div className="mb-3 flex flex-wrap items-center gap-3 text-xs text-[var(--color-ink3)]">
            <span>
              {member.personalizadas > 0
                ? `${member.personalizadas} tela(s) personalizada(s); as demais seguem o padrão do papel.`
                : "Todas as telas seguem o padrão do papel."}
            </span>
            {editable && member.personalizadas > 0 && (
              <button
                type="button"
                onClick={voltarAoPadrao}
                disabled={pending}
                className="text-[var(--color-accent2)] underline-offset-2 hover:underline"
              >
                Voltar ao padrão do papel
              </button>
            )}
            {isSelf && (
              <span className="text-[var(--color-warning)]">
                Suas próprias permissões só podem ser editadas por outro administrador.
              </span>
            )}
          </div>
        )}
        {soLeitura && (
          <div className="mb-3 rounded-[8px] border border-[var(--color-line)] bg-[var(--color-surface2)] px-3 py-2 text-xs text-[var(--color-ink2)]">
            <p>
              <span className="font-semibold text-[var(--color-ink)]">Contador é somente leitura.</span>{" "}
              Pode receber “Ver” em qualquer tela; criar, editar e excluir não se concedem a este papel.
            </p>
            <p className="mt-1">
              <span className="font-semibold text-[var(--color-ink)]">Padrão do papel:</span> {padraoContador.join(", ")}.
              Telas marcadas fora dessa lista ou desmarcadas dentro dela ficam como personalizadas deste membro.
            </p>
          </div>
        )}
        {error && <p className="mb-3 text-sm text-[var(--color-danger)]">{error}</p>}

        <div className="tbl-scroll overflow-x-auto">
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
                      <td className="px-2 py-2 text-[var(--color-ink2)]">
                        {s.label}
                        {HERDA_DE[s.id] && (
                          <span className="ml-1.5 text-[11px] text-[var(--color-ink3)]">
                            · acompanha {SCREENS.find((x) => x.id === HERDA_DE[s.id])?.label}
                          </span>
                        )}
                        {!ownerFull && TELAS_SO_ADMIN.has(s.id) && (
                          <span className="ml-1.5 text-[11px] text-[var(--color-ink3)]">
                            · exclusiva de owner e admin
                          </span>
                        )}
                      </td>
                      {ACTIONS.map((a) => {
                        if (soLeitura && a.key !== "ver") {
                          return (
                            <td key={a.key} className="px-2 py-2 text-center text-[var(--color-ink3)]" title="O contador é somente leitura.">
                              <span aria-label="não se aplica: contador é somente leitura">—</span>
                            </td>
                          );
                        }
                        const checked = ownerFull ? true : perms[s.id]?.[a.key] ?? false;
                        const restrita = (!ownerFull && TELAS_SO_ADMIN.has(s.id)) || !!HERDA_DE[s.id];
                        return (
                          <td key={a.key} className="px-2 py-2 text-center">
                            <input
                              type="checkbox"
                              checked={checked}
                              disabled={!editable || pending || restrita}
                              title={
                                HERDA_DE[s.id]
                                  ? "Esta tela acompanha a permissão de Lançamentos de Despesas."
                                  : restrita
                                    ? "Usuários e Gestão de Acessos são exclusivas de owner e admin."
                                    : undefined
                              }
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
