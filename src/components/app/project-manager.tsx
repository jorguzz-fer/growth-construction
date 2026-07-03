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
import { Input, Label } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";

interface Perms {
  criar: boolean;
  editar: boolean;
  excluir: boolean;
}

export function ProjectManager({
  projects,
  activeId,
  perms,
}: {
  projects: Project[];
  activeId: string;
  perms: Perms;
}) {
  return (
    <div className="space-y-5">
      {perms.criar && <NewProjectForm />}

      <div className="space-y-3">
        {projects.map((p) => (
          <ProjectRow
            key={p.id}
            project={p}
            active={p.id === activeId}
            canDelete={perms.excluir && projects.length > 1}
            canEdit={perms.editar}
          />
        ))}
      </div>
    </div>
  );
}

function NewProjectForm() {
  const [name, setName] = useState("");
  const [duration, setDuration] = useState("");
  const [pending, start] = useTransition();

  const submit = () => {
    const clean = name.trim();
    if (!clean) return;
    const months = duration.trim() ? Number(duration) : null;
    start(async () => {
      await createProject(clean, months);
      setName("");
      setDuration("");
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
              placeholder="Ex.: Signature Suarão"
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
          <Button onClick={submit} disabled={pending || !name.trim()}>
            Adicionar
          </Button>
        </div>
      </CardContent>
    </Card>
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
  const [pending, start] = useTransition();

  const dirty =
    name.trim() !== project.name ||
    (duration.trim() ? Number(duration) : null) !==
      (project.durationMonths ?? null);

  const save = () =>
    start(() =>
      updateProject(project.id, {
        name,
        durationMonths: duration.trim() ? Number(duration) : null,
      }),
    );

  const remove = () => {
    if (
      !window.confirm(
        `Excluir o projeto "${project.name}"? Todas as versões e dados vinculados serão removidos. Esta ação não pode ser desfeita.`,
      )
    )
      return;
    start(() => deleteProject(project.id));
  };

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
        <div className="sm:w-32">
          <Label>Duração (meses)</Label>
          <Input
            type="number"
            min={1}
            value={duration}
            onChange={(e) => setDuration(e.target.value)}
            disabled={!canEdit || pending}
          />
        </div>
        <div className="flex flex-wrap items-center gap-2 pb-1.5">
          {active ? (
            <Badge tone="accent">ativo</Badge>
          ) : (
            <Button
              size="sm"
              variant="outline"
              disabled={pending}
              onClick={() => start(() => setActiveProject(project.id))}
            >
              Selecionar
            </Button>
          )}
          {canEdit && (
            <Button size="sm" disabled={pending || !dirty} onClick={save}>
              Salvar
            </Button>
          )}
          {canDelete && (
            <button
              disabled={pending}
              onClick={remove}
              className="text-sm text-[var(--color-danger)] hover:underline disabled:opacity-50"
            >
              Excluir
            </button>
          )}
        </div>
      </CardContent>
    </Card>
  );
}
