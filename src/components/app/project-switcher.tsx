"use client";

import { useState, useTransition } from "react";
import { createPortal } from "react-dom";
import type { Project } from "@/lib/context";
import { setActiveProject } from "@/lib/actions/context";
import { createProject, deleteProject } from "@/lib/actions/projects";

type Status = "Em andamento" | "Planejamento";

/**
 * Seletor de contexto (projeto / unidade) exibido na sidebar. Abre o modal
 * "Selecionar Projeto / Unidade" com os empreendimentos e as unidades /
 * escritórios (centros de custo), permitindo selecionar, criar e excluir.
 */
export function ProjectSwitcher({
  projects,
  activeId,
  canCreate,
  canDelete,
}: {
  projects: Project[];
  activeId: string;
  canCreate: boolean;
  canDelete: boolean;
}) {
  const [open, setOpen] = useState(false);
  const active = projects.find((p) => p.id === activeId) ?? projects[0];
  const isOffice = active?.kind === "office";

  return (
    <>
      <button
        onClick={() => setOpen(true)}
        className="flex w-full items-center gap-2 rounded-[8px] border border-white/10 bg-white/5 px-2.5 py-2 text-left transition-colors hover:bg-white/10"
      >
        <span className="min-w-0 flex-1">
          <span className="block truncate text-[13px] font-semibold text-white/90">
            {active?.name ?? "—"}
          </span>
          <span className="mt-0.5 inline-block rounded-full bg-white/10 px-1.5 py-0.5 font-[family-name:var(--font-mono)] text-[8.5px] uppercase tracking-wide text-white/50">
            {isOffice ? "Unidade" : "Projeto"}
          </span>
        </span>
        <span className="shrink-0 text-white/40">›</span>
      </button>

      {open && (
        <SwitcherModal
          projects={projects}
          activeId={activeId}
          canCreate={canCreate}
          canDelete={canDelete}
          onClose={() => setOpen(false)}
        />
      )}
    </>
  );
}

function SwitcherModal({
  projects,
  activeId,
  canCreate,
  canDelete,
  onClose,
}: {
  projects: Project[];
  activeId: string;
  canCreate: boolean;
  canDelete: boolean;
  onClose: () => void;
}) {
  const [pending, start] = useTransition();
  const [creating, setCreating] = useState<"proj" | "office" | null>(null);
  const empreendimentos = projects.filter((p) => p.kind !== "office");
  const escritorios = projects.filter((p) => p.kind === "office");

  const select = (id: string) => {
    if (id === activeId) return onClose();
    start(async () => {
      await setActiveProject(id);
      onClose();
    });
  };

  const remove = (p: Project) => {
    if (
      !window.confirm(
        `Excluir "${p.name}"? Todas as versões e dados vinculados serão removidos.`,
      )
    )
      return;
    start(() => deleteProject(p.id));
  };

  // Portal para o document.body: a sidebar usa `transform` (translate-x), o que
  // faria um `position: fixed` filho se posicionar relativo à sidebar em vez da
  // viewport — deixando o modal preso "sobre o menu".
  return createPortal(
    <div
      onClick={onClose}
      className="fixed inset-0 z-[100] flex items-center justify-center bg-black/40 p-4"
    >
      <div
        onClick={(e) => e.stopPropagation()}
        className="max-h-[85vh] w-full max-w-xl overflow-y-auto rounded-[16px] bg-white p-6 text-[var(--color-ink)] shadow-xl"
      >
        <div className="mb-5 flex items-center justify-between">
          <h2 className="text-lg font-semibold">Selecionar Projeto / Unidade</h2>
          <button
            onClick={onClose}
            className="flex h-8 w-8 items-center justify-center rounded-full bg-[var(--color-surface2)] text-[var(--color-ink3)] hover:bg-[var(--color-surface3)]"
            aria-label="Fechar"
          >
            ✕
          </button>
        </div>

        {/* Projetos */}
        <div className="mb-2 font-[family-name:var(--font-mono)] text-[10px] uppercase tracking-wide text-[var(--color-ink3)]">
          Projetos — empreendimentos imobiliários
        </div>
        <div className="space-y-2">
          {empreendimentos.map((p) => (
            <Row
              key={p.id}
              project={p}
              active={p.id === activeId}
              icon="🏢"
              iconBg="var(--color-accent4)"
              badge="Projeto"
              subtitle={`${p.status}${p.durationMonths ? ` · ${p.durationMonths} meses` : ""}`}
              pending={pending}
              canDelete={canDelete}
              onSelect={() => select(p.id)}
              onDelete={() => remove(p)}
            />
          ))}
        </div>

        {/* Unidades / escritórios */}
        <div className="mb-2 mt-6 font-[family-name:var(--font-mono)] text-[10px] uppercase tracking-wide text-[var(--color-ink3)]">
          Unidades / Escritórios — centros de custo
        </div>
        <p className="mb-2 rounded-[8px] bg-[var(--color-surface2)] px-3 py-2 text-[12px] text-[var(--color-ink3)]">
          Contas corporativas não vinculadas a projetos específicos.
        </p>
        <div className="space-y-2">
          {escritorios.map((p) => (
            <Row
              key={p.id}
              project={p}
              active={p.id === activeId}
              icon="💼"
              iconBg="#dcfce7"
              badge="Unidade"
              subtitle="Ativo"
              pending={pending}
              canDelete={canDelete}
              onSelect={() => select(p.id)}
              onDelete={() => remove(p)}
            />
          ))}
          {escritorios.length === 0 && (
            <p className="text-[12px] text-[var(--color-ink4)]">
              Nenhuma unidade/escritório cadastrado.
            </p>
          )}
        </div>

        {/* Criar */}
        {canCreate && (
          <div className="mt-5">
            {creating ? (
              <CreateForm
                kind={creating}
                pending={pending}
                onCancel={() => setCreating(null)}
                onCreate={(name, months, status) =>
                  start(async () => {
                    await createProject(name, months, { kind: creating, status });
                    setCreating(null);
                    onClose();
                  })
                }
              />
            ) : (
              <div className="flex flex-wrap gap-2">
                <button
                  onClick={() => setCreating("proj")}
                  className="rounded-[8px] bg-[var(--color-accent)] px-3 py-2 text-[13px] font-medium text-white hover:opacity-90"
                >
                  + Novo Projeto
                </button>
                <button
                  onClick={() => setCreating("office")}
                  className="rounded-[8px] border border-[var(--color-accent2)]/25 px-3 py-2 text-[13px] font-medium text-[var(--color-ink)] hover:bg-[var(--color-surface2)]"
                >
                  + Nova Unidade/Escritório
                </button>
              </div>
            )}
          </div>
        )}

        <div className="mt-6 flex justify-end">
          <button
            onClick={onClose}
            className="rounded-[8px] border border-[var(--color-accent2)]/20 px-4 py-2 text-[13px] text-[var(--color-ink2)] hover:bg-[var(--color-surface2)]"
          >
            Fechar
          </button>
        </div>
      </div>
    </div>,
    document.body,
  );
}

function Row({
  project,
  active,
  icon,
  iconBg,
  badge,
  subtitle,
  pending,
  canDelete,
  onSelect,
  onDelete,
}: {
  project: Project;
  active: boolean;
  icon: string;
  iconBg: string;
  badge: string;
  subtitle: string;
  pending: boolean;
  canDelete: boolean;
  onSelect: () => void;
  onDelete: () => void;
}) {
  return (
    <div
      className={`flex items-center gap-3 rounded-[12px] border px-3 py-2.5 ${
        active
          ? "border-[var(--color-accent2)] bg-[var(--color-accent4)]/40"
          : "border-[var(--color-accent2)]/12 hover:bg-[var(--color-surface2)]"
      }`}
    >
      <button
        onClick={onSelect}
        disabled={pending}
        className="flex min-w-0 flex-1 items-center gap-3 text-left disabled:opacity-60"
      >
        <span
          className="flex h-9 w-9 shrink-0 items-center justify-center rounded-[8px] text-[16px]"
          style={{ background: iconBg }}
        >
          {icon}
        </span>
        <span className="min-w-0">
          <span className="block truncate text-[14px] font-semibold text-[var(--color-ink)]">
            {project.name}
            {active && (
              <span className="ml-1.5 text-[11px] font-normal text-[var(--color-accent)]">
                (ativo)
              </span>
            )}
          </span>
          <span className="block truncate text-[12px] text-[var(--color-ink3)]">
            {subtitle}
          </span>
        </span>
      </button>
      <span className="shrink-0 rounded-full bg-[var(--color-surface3)] px-2 py-0.5 font-[family-name:var(--font-mono)] text-[10px] text-[var(--color-ink2)]">
        {badge}
      </span>
      {canDelete && (
        <button
          onClick={onDelete}
          disabled={pending}
          aria-label="Excluir"
          className="flex h-8 w-8 shrink-0 items-center justify-center rounded-[8px] text-[var(--color-danger)] hover:bg-[var(--color-danger)]/10 disabled:opacity-50"
        >
          🗑
        </button>
      )}
    </div>
  );
}

function CreateForm({
  kind,
  pending,
  onCancel,
  onCreate,
}: {
  kind: "proj" | "office";
  pending: boolean;
  onCancel: () => void;
  onCreate: (name: string, months: number | null, status: Status) => void;
}) {
  const [name, setName] = useState("");
  const [duration, setDuration] = useState("");
  const [status, setStatus] = useState<Status>("Planejamento");
  const isProj = kind === "proj";

  return (
    <div className="rounded-[12px] border border-[var(--color-accent2)]/15 bg-[var(--color-surface2)] p-3">
      <div className="mb-2 text-[13px] font-semibold text-[var(--color-ink)]">
        {isProj ? "Novo projeto" : "Nova unidade / escritório"}
      </div>
      <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
        <input
          autoFocus
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder={isProj ? "Nome do projeto" : "Nome da unidade / escritório"}
          className="h-9 flex-1 rounded-[8px] border border-[var(--color-accent2)]/20 bg-white px-2.5 text-[13px]"
        />
        {isProj && (
          <>
            <input
              type="number"
              min={1}
              value={duration}
              onChange={(e) => setDuration(e.target.value)}
              placeholder="Meses"
              className="h-9 w-24 rounded-[8px] border border-[var(--color-accent2)]/20 bg-white px-2.5 text-[13px]"
            />
            <select
              value={status}
              onChange={(e) => setStatus(e.target.value as Status)}
              className="h-9 rounded-[8px] border border-[var(--color-accent2)]/20 bg-white px-2 text-[13px]"
            >
              <option value="Planejamento">Planejamento</option>
              <option value="Em andamento">Em andamento</option>
            </select>
          </>
        )}
      </div>
      <div className="mt-2 flex gap-2">
        <button
          onClick={() => {
            if (name.trim())
              onCreate(name.trim(), duration.trim() ? Number(duration) : null, status);
          }}
          disabled={pending || !name.trim()}
          className="rounded-[8px] bg-[var(--color-accent)] px-3 py-1.5 text-[13px] font-medium text-white hover:opacity-90 disabled:opacity-50"
        >
          Criar
        </button>
        <button
          onClick={onCancel}
          disabled={pending}
          className="rounded-[8px] px-3 py-1.5 text-[13px] text-[var(--color-ink3)] hover:bg-[var(--color-surface3)]"
        >
          Cancelar
        </button>
      </div>
    </div>
  );
}
