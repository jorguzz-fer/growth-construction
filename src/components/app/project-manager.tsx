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
import { MoneyInput } from "@/components/ui/money-input";
import { DateField } from "@/components/ui/date-field";
import { Badge } from "@/components/ui/badge";
import { brl } from "@/lib/utils";
import { ProjetoDocs, type ProjetoDoc } from "@/components/app/projeto-docs";

interface Perms {
  criar: boolean;
  editar: boolean;
  excluir: boolean;
}
export interface ClienteOpt {
  id: string;
  nome: string;
}

type Status = "Em andamento" | "Planejamento";

/** Dropdown de Cliente: "próprio" (tenant) + clientes cadastrados. */
function ClienteSelect({
  clientes,
  tenantName,
  value,
  onChange,
  disabled,
}: {
  clientes: ClienteOpt[];
  tenantName: string;
  value: string;
  onChange: (v: string) => void;
  disabled?: boolean;
}) {
  return (
    <Select value={value} onChange={(e) => onChange(e.target.value)} disabled={disabled}>
      <option value="">Empreendimento próprio — {tenantName}</option>
      {clientes.map((c) => (
        <option key={c.id} value={c.id}>
          {c.nome}
        </option>
      ))}
    </Select>
  );
}

export function ProjectManager({
  projects,
  activeId,
  perms,
  clientes,
  tenantName,
  docsByProject = {},
  r2Configured = false,
}: {
  projects: Project[];
  activeId: string;
  perms: Perms;
  clientes: ClienteOpt[];
  tenantName: string;
  docsByProject?: Record<string, ProjetoDoc[]>;
  r2Configured?: boolean;
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
        {perms.criar && (
          <NewProjectForm clientes={clientes} tenantName={tenantName} />
        )}
        {empreendimentos.map((p) => (
          <ProjectRow
            key={p.id}
            project={p}
            active={p.id === activeId}
            canDelete={canDelete}
            canEdit={perms.editar}
            clientes={clientes}
            tenantName={tenantName}
            docs={docsByProject[p.id] ?? []}
            r2={r2Configured}
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

function NewProjectForm({
  clientes,
  tenantName,
}: {
  clientes: ClienteOpt[];
  tenantName: string;
}) {
  const [name, setName] = useState("");
  const [duration, setDuration] = useState("");
  const [status, setStatus] = useState<Status>("Planejamento");
  const [startDate, setStartDate] = useState("");
  const [endDate, setEndDate] = useState("");
  const [clienteId, setClienteId] = useState("");
  const [pending, start] = useTransition();

  const submit = () => {
    const clean = name.trim();
    if (!clean) return;
    const months = duration.trim() ? Number(duration) : null;
    start(async () => {
      await createProject(clean, months, {
        kind: "proj",
        status,
        startDate,
        endDate,
        clienteId,
      });
      setName("");
      setDuration("");
      setStatus("Planejamento");
      setStartDate("");
      setEndDate("");
      setClienteId("");
    });
  };

  return (
    <Card>
      <CardContent className="p-5">
        <h3 className="mb-3 text-sm font-semibold text-[var(--color-ink)]">
          Novo projeto
        </h3>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
          <div className="sm:col-span-2">
            <Label>Nome da obra</Label>
            <Input
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Ex.: Bloco A — RMV"
              disabled={pending}
            />
          </div>
          <div>
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
          <div>
            <Label>Data de início</Label>
            <DateField value={startDate} onChange={setStartDate} />
          </div>
          <div>
            <Label>Data de fim</Label>
            <DateField value={endDate} onChange={setEndDate} />
          </div>
          <div>
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
          <div className="sm:col-span-2">
            <Label>Cliente</Label>
            <ClienteSelect
              clientes={clientes}
              tenantName={tenantName}
              value={clienteId}
              onChange={setClienteId}
              disabled={pending}
            />
          </div>
          <div className="flex items-end">
            <Button onClick={submit} disabled={pending || !name.trim()} className="w-full">
              Adicionar
            </Button>
          </div>
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
  clientes,
  tenantName,
  docs,
  r2,
}: {
  project: Project;
  active: boolean;
  canEdit: boolean;
  canDelete: boolean;
  clientes: ClienteOpt[];
  tenantName: string;
  docs: ProjetoDoc[];
  r2: boolean;
}) {
  const [name, setName] = useState(project.name);
  const [duration, setDuration] = useState(
    project.durationMonths != null ? String(project.durationMonths) : "",
  );
  const [status, setStatus] = useState<Status>(project.status as Status);
  const [startDate, setStartDate] = useState(project.startDate ?? "");
  const [endDate, setEndDate] = useState(project.endDate ?? "");
  const [clienteId, setClienteId] = useState(project.clienteId ?? "");
  const numStr = (v: unknown) => (v === null || v === undefined ? "" : String(v));
  const [terr, setTerr] = useState({
    custoConstrucao: numStr(project.custoConstrucao),
    custoTerreno: numStr(project.custoTerreno),
    valorConstrucao: numStr(project.valorConstrucao),
    valorTerreno: numStr(project.valorTerreno),
    formaPagamentoTerreno: project.formaPagamentoTerreno ?? "",
    proprietarioTerreno: project.proprietarioTerreno ?? "",
    terrenoForaCaixa: project.terrenoForaCaixa ?? true,
  });
  const [pending, start] = useTransition();
  const isObra = project.kind !== "office";
  const valorGlobal = (Number(terr.valorConstrucao) || 0) + (Number(terr.valorTerreno) || 0);

  const terrDirty =
    terr.custoConstrucao !== numStr(project.custoConstrucao) ||
    terr.custoTerreno !== numStr(project.custoTerreno) ||
    terr.valorConstrucao !== numStr(project.valorConstrucao) ||
    terr.valorTerreno !== numStr(project.valorTerreno) ||
    terr.formaPagamentoTerreno !== (project.formaPagamentoTerreno ?? "") ||
    terr.proprietarioTerreno !== (project.proprietarioTerreno ?? "") ||
    terr.terrenoForaCaixa !== (project.terrenoForaCaixa ?? true);

  const dirty =
    name.trim() !== project.name ||
    status !== project.status ||
    (duration.trim() ? Number(duration) : null) !==
      (project.durationMonths ?? null) ||
    startDate !== (project.startDate ?? "") ||
    endDate !== (project.endDate ?? "") ||
    clienteId !== (project.clienteId ?? "") ||
    terrDirty;

  const save = () =>
    start(() =>
      updateProject(project.id, {
        name,
        durationMonths: duration.trim() ? Number(duration) : null,
        status,
        startDate,
        endDate,
        clienteId,
        custoConstrucao: terr.custoConstrucao || null,
        custoTerreno: terr.custoTerreno || null,
        valorConstrucao: terr.valorConstrucao || null,
        valorTerreno: terr.valorTerreno || null,
        formaPagamentoTerreno: terr.formaPagamentoTerreno || null,
        proprietarioTerreno: terr.proprietarioTerreno || null,
        terrenoForaCaixa: terr.terrenoForaCaixa,
      }),
    );

  return (
    <Card>
      <CardContent className="grid grid-cols-1 gap-3 p-4 sm:grid-cols-3">
        <div className="sm:col-span-2">
          <Label>Nome da obra</Label>
          <Input
            value={name}
            onChange={(e) => setName(e.target.value)}
            disabled={!canEdit || pending}
          />
        </div>
        <div>
          <Label>Duração (meses)</Label>
          <Input
            type="number"
            min={1}
            value={duration}
            onChange={(e) => setDuration(e.target.value)}
            disabled={!canEdit || pending}
          />
        </div>
        <div>
          <Label>Data de início</Label>
          <DateField value={startDate} onChange={setStartDate} />
        </div>
        <div>
          <Label>Data de fim</Label>
          <DateField value={endDate} onChange={setEndDate} />
        </div>
        <div>
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
        <div className="sm:col-span-2">
          <Label>Cliente</Label>
          <ClienteSelect
            clientes={clientes}
            tenantName={tenantName}
            value={clienteId}
            onChange={setClienteId}
            disabled={!canEdit || pending}
          />
        </div>

        {isObra && (
          <div className="rounded-[10px] border border-[var(--color-accent2)]/12 bg-[var(--color-surface2)] p-4 sm:col-span-3">
            <h3 className="mb-1 text-[13px] font-semibold text-[var(--color-ink)]">
              Terreno &amp; valor global da operação
            </h3>
            <p className="mb-3 text-[11.5px] text-[var(--color-ink3)]">
              Distingue a <strong>visão financeira</strong> da construtora (o que entra/sai do caixa)
              da <strong>visão econômica/imobiliária</strong> (valor global, incluindo o terreno).
            </p>
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
              <div>
                <Label>Custo da construção</Label>
                <MoneyInput value={terr.custoConstrucao} onChange={(v) => setTerr((s) => ({ ...s, custoConstrucao: v }))} />
              </div>
              <div>
                <Label>Custo do terreno</Label>
                <MoneyInput value={terr.custoTerreno} onChange={(v) => setTerr((s) => ({ ...s, custoTerreno: v }))} />
              </div>
              <div>
                <Label>Valor da construção</Label>
                <MoneyInput value={terr.valorConstrucao} onChange={(v) => setTerr((s) => ({ ...s, valorConstrucao: v }))} />
              </div>
              <div>
                <Label>Valor do terreno</Label>
                <MoneyInput value={terr.valorTerreno} onChange={(v) => setTerr((s) => ({ ...s, valorTerreno: v }))} />
              </div>
              <div className="sm:col-span-2">
                <Label>Proprietário do terreno</Label>
                <Input
                  value={terr.proprietarioTerreno}
                  onChange={(e) => setTerr((s) => ({ ...s, proprietarioTerreno: e.target.value }))}
                  disabled={!canEdit || pending}
                />
              </div>
              <div className="sm:col-span-2">
                <Label>Forma de pagamento do terreno</Label>
                <Input
                  value={terr.formaPagamentoTerreno}
                  onChange={(e) => setTerr((s) => ({ ...s, formaPagamentoTerreno: e.target.value }))}
                  disabled={!canEdit || pending}
                />
              </div>
            </div>
            <label className="mt-3 flex cursor-pointer items-center gap-2 text-[12.5px] text-[var(--color-ink)]">
              <input
                type="checkbox"
                checked={terr.terrenoForaCaixa}
                onChange={(e) => setTerr((s) => ({ ...s, terrenoForaCaixa: e.target.checked }))}
                disabled={!canEdit || pending}
                className="h-4 w-4 accent-[var(--color-accent2)]"
              />
              Terreno pago direto ao proprietário — <strong>não passa pelo caixa da construtora</strong>
            </label>
            <div className="mt-3 flex flex-wrap gap-4 border-t border-[var(--color-accent2)]/10 pt-3 text-[12.5px]">
              <span className="text-[var(--color-ink3)]">
                Valor global da operação:{" "}
                <strong className="font-[family-name:var(--font-mono)] text-[var(--color-accent)]">
                  {brl(valorGlobal)}
                </strong>
              </span>
              <span className="text-[var(--color-ink3)]">
                Entrada financeira da construtora:{" "}
                <strong className="font-[family-name:var(--font-mono)] text-[var(--color-ink)]">
                  {brl(
                    terr.terrenoForaCaixa
                      ? Number(terr.valorConstrucao) || 0
                      : valorGlobal,
                  )}
                </strong>
              </span>
            </div>
          </div>
        )}

        <ProjetoDocs projectId={project.id} docs={docs} canEdit={canEdit} r2={r2} />

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
