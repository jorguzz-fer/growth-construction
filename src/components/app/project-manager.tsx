"use client";

import { useState, useTransition } from "react";
import type { Project } from "@/lib/context";
import { setActiveProject } from "@/lib/actions/context";
import {
  createProject,
  updateProject,
  deleteProject,
} from "@/lib/actions/projects";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input, Label, Select } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";

interface Perms {
  criar: boolean;
  editar: boolean;
  excluir: boolean;
}

type Status = "Em andamento" | "Planejamento";

export function ProjectManager({
  projects,
  activeId,
  perms,
}: {
  projects: Project[];
  activeId: string;
  perms: Perms;
}) {
  const empreendimentos = projects.filter((p) => p.kind !== "office");
  const escritorios = projects.filter((p) => p.kind === "office");
  const canDelete = perms.excluir && projects.length > 1;

  return (
    <div className="space-y-8">
      {/* Projetos — empreendimentos imobiliários */}
      <section className="space-y-3">
        <h2 className="font-[family-name:var(--font-mono)] text-[11px] uppercase tracking-wide text-[var(--color-ink3)]">
          Projetos — empreendimentos imobiliários
        </h2>
        {perms.criar && <NewProjectForm />}
        {empreendimentos.map((p) => (
          <ProjectRow
            key={p.id}
            project={p}
            active={p.id === activeId}
            canDelete={canDelete}
            canEdit={perms.editar}
          />
        ))}
      </section>

      {/* Unidades / escritórios — centros de custo */}
      <section className="space-y-3">
        <h2 className="font-[family-name:var(--font-mono)] text-[11px] uppercase tracking-wide text-[var(--color-ink3)]">
          Unidades / Escritórios — centros de custo
        </h2>
        <p className="text-[12px] text-[var(--color-ink3)]">
          Matriz e filiais: contas corporativas não vinculadas a um empreendimento
          específico (despesas administrativas, overhead).
        </p>
        {perms.criar && <NewOfficeForm />}
        {escritorios.map((p) => (
          <OfficeRow
            key={p.id}
            project={p}
            active={p.id === activeId}
            canDelete={canDelete}
            canEdit={perms.editar}
          />
        ))}
        {escritorios.length === 0 && (
          <p className="text-[12px] text-[var(--color-ink4)]">
            Nenhuma unidade/escritório cadastrado ainda.
          </p>
        )}
      </section>
    </div>
  );
}

function NewProjectForm() {
  const [name, setName] = useState("");
  const [duration, setDuration] = useState("");
  const [status, setStatus] = useState<Status>("Planejamento");
  const [pending, start] = useTransition();

  const submit = () => {
    const clean = name.trim();
    if (!clean) return;
    const months = duration.trim() ? Number(duration) : null;
    start(async () => {
      await createProject(clean, months, { kind: "proj", status });
      setName("");
      setDuration("");
      setStatus("Planejamento");
    });
  };

  return (
    <Card>
      <CardContent className="p-5">
        <h3 className="mb-3 text-sm font-semibold text-[var(--color-ink)]">
          Novo projeto
        </h3>
        <div className="flex flex-col gap-3 sm:flex-row sm:items-end">
          <div className="flex-1">
            <Label>Nome do projeto</Label>
            <Input
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Ex.: Bloco A — RMV"
              disabled={pending}
            />
          </div>
          <div className="sm:w-40">
            <Label>Duração (meses)</Label>
            <Input
              type="number"
              min={1}
              value={duration}
              onChange={(e) => setDuration(e.target.value)}
              placeholder="Ex.: 24"
              disabled={pending}
            />
          </div>
          <div className="sm:w-44">
            <Label>Status</Label>
            <Select
              value={status}
              onChange={(e) => setStatus(e.target.value as Status)}
              disabled={pending}
            >
              <option value="Planejamento">Planejamento</option>
              <option value="Em andamento">Em andamento</option>
            </Select>
          </div>
          <Button onClick={submit} disabled={pending || !name.trim()}>
            Adicionar
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}

function NewOfficeForm() {
  const [name, setName] = useState("");
  const [pending, start] = useTransition();

  const submit = () => {
    const clean = name.trim();
    if (!clean) return;
    start(async () => {
      await createProject(clean, null, { kind: "office" });
      setName("");
    });
  };

  return (
    <Card>
      <CardContent className="p-5">
        <h3 className="mb-3 text-sm font-semibold text-[var(--color-ink)]">
          Nova unidade / escritório
        </h3>
        <div className="flex flex-col gap-3 sm:flex-row sm:items-end">
          <div className="flex-1">
            <Label>Nome</Label>
            <Input
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Ex.: Escritório Central / Filial SP"
              disabled={pending}
            />
          </div>
          <Button onClick={submit} disabled={pending || !name.trim()}>
            Adicionar
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}

function SelectActive({
  id,
  active,
  pending,
  start,
}: {
  id: string;
  active: boolean;
  pending: boolean;
  start: (fn: () => void) => void;
}) {
  return active ? (
    <Badge tone="accent">ativo</Badge>
  ) : (
    <Button
      size="sm"
      variant="outline"
      disabled={pending}
      onClick={() => start(() => setActiveProject(id))}
    >
      Selecionar
    </Button>
  );
}

function DeleteButton({
  name,
  onDelete,
  pending,
}: {
  name: string;
  onDelete: () => void;
  pending: boolean;
}) {
  const remove = () => {
    if (
      !window.confirm(
        `Excluir "${name}"? Todas as versões e dados vinculados serão removidos. Esta ação não pode ser desfeita.`,
      )
    )
      return;
    onDelete();
  };
  return (
    <button
      disabled={pending}
      onClick={remove}
      className="text-sm text-[var(--color-danger)] hover:underline disabled:opacity-50"
    >
      Excluir
    </button>
  );
}

function ProjectRow({
  project,
  active,
  canEdit,
  canDelete,
}: {
  project: Project;
  active: boolean;
  canEdit: boolean;
  canDelete: boolean;
}) {
  const [name, setName] = useState(project.name);
  const [duration, setDuration] = useState(
    project.durationMonths != null ? String(project.durationMonths) : "",
  );
  const [status, setStatus] = useState<Status>(project.status as Status);
  const [pending, start] = useTransition();

  const dirty =
    name.trim() !== project.name ||
    status !== project.status ||
    (duration.trim() ? Number(duration) : null) !==
      (project.durationMonths ?? null);

  const save = () =>
    start(() =>
      updateProject(project.id, {
        name,
        durationMonths: duration.trim() ? Number(duration) : null,
        status,
      }),
    );

  return (
    <Card>
      <CardContent className="flex flex-col gap-3 p-4 sm:flex-row sm:items-end">
        <div className="flex-1">
          <Label>Nome do projeto</Label>
          <Input
            value={name}
            onChange={(e) => setName(e.target.value)}
            disabled={!canEdit || pending}
          />
        </div>
        <div className="sm:w-28">
          <Label>Duração</Label>
          <Input
            type="number"
            min={1}
            value={duration}
            onChange={(e) => setDuration(e.target.value)}
            disabled={!canEdit || pending}
          />
        </div>
        <div className="sm:w-40">
          <Label>Status</Label>
          <Select
            value={status}
            onChange={(e) => setStatus(e.target.value as Status)}
            disabled={!canEdit || pending}
          >
            <option value="Planejamento">Planejamento</option>
            <option value="Em andamento">Em andamento</option>
          </Select>
        </div>
        <div className="flex flex-wrap items-center gap-2 pb-1.5">
          <SelectActive id={project.id} active={active} pending={pending} start={start} />
          {canEdit && (
            <Button size="sm" disabled={pending || !dirty} onClick={save}>
              Salvar
            </Button>
          )}
          {canDelete && (
            <DeleteButton
              name={project.name}
              pending={pending}
              onDelete={() => start(() => deleteProject(project.id))}
            />
          )}
        </div>
      </CardContent>
    </Card>
  );
}

function OfficeRow({
  project,
  active,
  canEdit,
  canDelete,
}: {
  project: Project;
  active: boolean;
  canEdit: boolean;
  canDelete: boolean;
}) {
  const [name, setName] = useState(project.name);
  const [pending, start] = useTransition();
  const dirty = name.trim() !== project.name;

  const save = () => start(() => updateProject(project.id, { name }));

  return (
    <Card>
      <CardContent className="flex flex-col gap-3 p-4 sm:flex-row sm:items-end">
        <div className="flex-1">
          <Label>Nome da unidade / escritório</Label>
          <Input
            value={name}
            onChange={(e) => setName(e.target.value)}
            disabled={!canEdit || pending}
          />
        </div>
        <div className="flex flex-wrap items-center gap-2 pb-1.5">
          <Badge tone="success">Ativo</Badge>
          <SelectActive id={project.id} active={active} pending={pending} start={start} />
          {canEdit && (
            <Button size="sm" disabled={pending || !dirty} onClick={save}>
              Salvar
            </Button>
          )}
          {canDelete && (
            <DeleteButton
              name={project.name}
              pending={pending}
              onDelete={() => start(() => deleteProject(project.id))}
            />
          )}
        </div>
      </CardContent>
    </Card>
  );
}
