# TELA-projeto — código na íntegra

Coleta do código que compõe a tela **Projetos & Unidades** (`/projeto`), em
`main` (commit `45f4ce3`). Sem resumo, sem comentário, sem análise.

Fora do escopo desta coleta, por serem genéricos ou de terceiros:
`@/components/ui/*` (card, button, input, money-input, date-field, badge),
`@/lib/context`, `@/lib/permissions`, `@/lib/storage/r2`, `@/lib/utils`, e
as bibliotecas `react`, `next/navigation` e `drizzle-orm`.

**Árvore de dependências própria da tela:**

```
projeto/page.tsx
├── components/app/page-header.tsx
├── components/app/access-denied.tsx
│   └── components/app/page-header.tsx        (já listado)
├── components/app/project-picker.tsx
└── components/app/project-manager.tsx
    └── components/app/projeto-docs.tsx

queries chamadas pela página:  getClientes · getDocuments
server actions disparadas:     setActiveProject          (actions/context.ts)
                               createProject             (actions/projects.ts)
                               updateProject             (actions/projects.ts)
                               deleteProject             (actions/projects.ts)
                               uploadProjetoDoc          (actions/projects.ts)
                               deleteProjetoDoc          (actions/projects.ts)
```

---

## 1. Página

### `src/app/(app)/projeto/page.tsx`

```tsx
import { getActiveContext } from "@/lib/context";
import { getClientes, getDocuments } from "@/lib/queries";
import { can } from "@/lib/permissions";
import { isR2Configured, readUrl } from "@/lib/storage/r2";
import { PageHeader } from "@/components/app/page-header";
import { AccessDenied } from "@/components/app/access-denied";
import { ProjectManager } from "@/components/app/project-manager";
import { ProjectPicker } from "@/components/app/project-picker";
import type { ProjetoDoc } from "@/components/app/projeto-docs";

export const dynamic = "force-dynamic";

export default async function ProjetoPage({
  searchParams,
}: {
  searchParams: Promise<{ proj?: string }>;
}) {
  const ctx = await getActiveContext();
  if (!ctx) return null;
  if (!can(ctx.perms, "projeto", "ver")) return <AccessDenied />;

  // Seletor no topo (?proj=): a tela listava TODOS os projetos empilhados, o
  // que obriga a rolar muito para achar um. "all" mantém o comportamento
  // anterior — quem quiser a lista inteira continua tendo.
  const sp = await searchParams;
  const selecionado = !sp.proj || sp.proj === "all" ? "all" : sp.proj;
  const projetoSel =
    selecionado === "all" ? null : ctx.projects.find((p) => p.id === selecionado) ?? null;

  const r2 = isR2Configured();
  const [clientes, docs] = await Promise.all([
    getClientes(ctx.tenant.id),
    getDocuments(ctx.tenant.id),
  ]);
  // Documentos vinculados a projetos, com URL assinada (item 4).
  const projDocs = docs.filter((d) => d.projectId);
  const docsByProject: Record<string, ProjetoDoc[]> = {};
  for (const d of projDocs) {
    const url = r2 ? await readUrl(d.storageKey) : null;
    (docsByProject[d.projectId!] ??= []).push({
      id: d.id,
      filename: d.filename,
      tipo: d.tipo,
      url,
      uploadedAt: d.uploadedAt ? new Date(d.uploadedAt).toISOString() : null,
    });
  }

  return (
    <>
      <PageHeader
        eyebrow={ctx.tenant.name}
        title="Projetos & Unidades"
        subtitle={
          projetoSel
            ? `Exibindo ${projetoSel.name}. Escolha "Todos" no seletor para ver a lista completa.`
            : "Cadastre empreendimentos (nome, datas, cliente e duração) e unidades/escritórios (matriz e filiais)."
        }
        actions={
          <ProjectPicker
            projects={ctx.projects.map((p) => ({
              id: p.id,
              // Matriz/filial fica identificada na própria lista: as duas
              // aparecem juntas porque a tela também tem as duas seções.
              label: p.kind === "office" ? `${p.name} · Matriz/Filial` : p.name,
            }))}
            selected={selecionado}
            allOption
          />
        }
      />

      <ProjectManager
        projects={ctx.projects}
        selecionadoId={selecionado}
        activeId={ctx.project.id}
        clientes={clientes.map((c) => ({ id: c.id, nome: c.nomeCompleto }))}
        tenantName={ctx.tenant.name}
        docsByProject={docsByProject}
        r2Configured={r2}
        perms={{
          criar: can(ctx.perms, "projeto", "criar"),
          editar: can(ctx.perms, "projeto", "editar"),
          excluir: can(ctx.perms, "projeto", "excluir"),
        }}
      />
    </>
  );
}
```

---

## 2. Componentes próprios, recursivamente

### `src/components/app/page-header.tsx`

```tsx
import * as React from "react";

export function PageHeader({
  title,
  actions,
}: {
  /** Mantidos por compatibilidade; ocultados por ora para um visual mais clean. */
  eyebrow?: string;
  title: string;
  subtitle?: string;
  actions?: React.ReactNode;
}) {
  return (
    <header className="mb-6 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between sm:gap-4">
      <h1 className="font-[family-name:var(--font-serif)] text-2xl text-[var(--color-ink)]">
        {title}
      </h1>
      {actions && <div className="flex shrink-0 items-center gap-2">{actions}</div>}
    </header>
  );
}
```

### `src/components/app/access-denied.tsx`

```tsx
import { PageHeader } from "@/components/app/page-header";
import { Card, CardContent } from "@/components/ui/card";

export function AccessDenied() {
  return (
    <>
      <PageHeader title="Acesso negado" />
      <Card>
        <CardContent className="flex flex-col items-center gap-2 p-12 text-center">
          <span className="font-[family-name:var(--font-mono)] text-[10px] uppercase tracking-[0.2em] text-[var(--color-ink4)]">
            Sem permissão
          </span>
          <p className="text-sm text-[var(--color-ink3)]">
            Você não tem permissão de <strong>Ver</strong> esta tela. Fale com um
            administrador em Gestão de Acessos.
          </p>
        </CardContent>
      </Card>
    </>
  );
}
```

### `src/components/app/project-picker.tsx`

```tsx
"use client";

import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useTransition } from "react";
import { Select } from "@/components/ui/input";

export interface ProjectOpt {
  id: string;
  label: string;
}

/**
 * Seletor de projeto para telas sem "projeto ativo" (Budget/Forecast). Grava
 * a escolha em `proj` na URL, preservando os demais parâmetros.
 */
export function ProjectPicker({
  projects,
  selected,
  allOption = false,
}: {
  projects: ProjectOpt[];
  selected: string;
  /** inclui a opção "Todos os projetos" (valor "all"). */
  allOption?: boolean;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const sp = useSearchParams();
  const [pending, start] = useTransition();

  return (
    <div className="flex flex-col gap-1">
      <span className="font-[family-name:var(--font-mono)] text-[10px] uppercase tracking-wide text-[var(--color-ink3)]">
        Projeto
      </span>
      <Select
        value={selected}
        disabled={pending}
        onChange={(e) => {
          const params = new URLSearchParams(sp.toString());
          params.set("proj", e.target.value);
          start(() => router.push(`${pathname}?${params.toString()}`));
        }}
        className="h-9 min-w-[220px]"
      >
        {allOption && <option value="all">Todos os projetos / filiais</option>}
        {projects.map((p) => (
          <option key={p.id} value={p.id}>
            {p.label}
          </option>
        ))}
      </Select>
    </div>
  );
}
```

### `src/components/app/project-manager.tsx`

```tsx
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
  selecionadoId = "all",
}: {
  projects: Project[];
  activeId: string;
  perms: Perms;
  clientes: ClienteOpt[];
  tenantName: string;
  docsByProject?: Record<string, ProjetoDoc[]>;
  r2Configured?: boolean;
  /** id vindo do seletor do topo; "all" lista todos (comportamento original). */
  selecionadoId?: string;
}) {
  const umSo = selecionadoId !== "all";
  // O seletor filtra o que é EXIBIDO. `projects` continua completo, então a
  // trava de exclusão (não deixar o tenant sem nenhum projeto) segue olhando o
  // total real, e não o que está na tela.
  const visiveis = umSo ? projects.filter((p) => p.id === selecionadoId) : projects;
  const empreendimentos = visiveis.filter((p) => p.kind !== "office");
  const escritorios = visiveis.filter((p) => p.kind === "office");
  const canDelete = perms.excluir && projects.length > 1;

  return (
    <div className="space-y-8">
      {/* Projetos — empreendimentos imobiliários */}
      {(!umSo || empreendimentos.length > 0) && (
      <section className="space-y-3">
        <h2 className="font-[family-name:var(--font-mono)] text-[11px] uppercase tracking-wide text-[var(--color-ink3)]">
          Projetos — empreendimentos imobiliários
        </h2>
        {/* Com um projeto escolhido, o formulário de cadastro só atrapalha:
            quem selecionou uma obra veio olhar aquela obra. Ele volta ao
            escolher "Todos" no seletor. */}
        {perms.criar && !umSo && (
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
      )}

      {/* Unidades / escritórios — centros de custo */}
      {(!umSo || escritorios.length > 0) && (
      <section className="space-y-3">
        <h2 className="font-[family-name:var(--font-mono)] text-[11px] uppercase tracking-wide text-[var(--color-ink3)]">
          Unidades / Escritórios — centros de custo
        </h2>
        {!umSo && (
          <p className="text-[12px] text-[var(--color-ink3)]">
            Matriz e filiais: contas corporativas não vinculadas a um
            empreendimento específico (despesas administrativas, overhead).
          </p>
        )}
        {perms.criar && !umSo && <NewOfficeForm />}
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
      )}
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
          <p className="sm:col-span-2 text-[11.5px] leading-relaxed text-[var(--color-ink3)]">
            A Data de início e a Data de fim definem as colunas mensais do Budget e
            do Forecast deste projeto.
          </p>
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
    financiamentoConstrucao: numStr(project.financiamentoConstrucao),
    financiamentoTerreno: numStr(project.financiamentoTerreno),
    recursosProprios: numStr(project.recursosProprios),
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
    terr.terrenoForaCaixa !== (project.terrenoForaCaixa ?? true) ||
    terr.financiamentoConstrucao !== numStr(project.financiamentoConstrucao) ||
    terr.financiamentoTerreno !== numStr(project.financiamentoTerreno) ||
    terr.recursosProprios !== numStr(project.recursosProprios);

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
        financiamentoConstrucao: terr.financiamentoConstrucao || null,
        financiamentoTerreno: terr.financiamentoTerreno || null,
        recursosProprios: terr.recursosProprios || null,
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
        {isObra && (
          <p className="sm:col-span-3 -mt-1 text-[11.5px] leading-relaxed text-[var(--color-ink3)]">
            A Data de início e a Data de fim determinam as colunas mensais do
            Budget e do Forecast deste projeto.
          </p>
        )}
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
              <div>
                <Label>Financiamento da construção</Label>
                <MoneyInput value={terr.financiamentoConstrucao} onChange={(v) => setTerr((s) => ({ ...s, financiamentoConstrucao: v }))} />
              </div>
              <div>
                <Label>Financiamento do terreno</Label>
                <MoneyInput value={terr.financiamentoTerreno} onChange={(v) => setTerr((s) => ({ ...s, financiamentoTerreno: v }))} />
              </div>
              <div>
                <Label>Recursos próprios</Label>
                <MoneyInput value={terr.recursosProprios} onChange={(v) => setTerr((s) => ({ ...s, recursosProprios: v }))} />
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
```

### `src/components/app/projeto-docs.tsx`

Importado por `project-manager.tsx`; a página importa dele apenas o tipo `ProjetoDoc`.

```tsx
"use client";

import { uploadProjetoDoc, deleteProjetoDoc } from "@/lib/actions/projects";
import { Button } from "@/components/ui/button";
import { Label, Select } from "@/components/ui/input";

export interface ProjetoDoc {
  id: string;
  filename: string;
  tipo: string | null;
  url: string | null;
  uploadedAt: string | null;
}

const TIPOS = [
  "Contrato",
  "Proposta",
  "Documento jurídico",
  "Estrutura societária",
  "Outros",
];

/**
 * Área de documentos do projeto (item 4): anexar múltiplos arquivos (contratos,
 * propostas, documentos jurídicos), listar, abrir e remover. Reusa a tabela
 * `documents` (project_id) e o R2. Preservados em edições do projeto.
 */
export function ProjetoDocs({
  projectId,
  docs,
  canEdit,
  r2,
}: {
  projectId: string;
  docs: ProjetoDoc[];
  canEdit: boolean;
  r2: boolean;
}) {
  return (
    <div className="rounded-[10px] border border-[var(--color-accent2)]/12 bg-[var(--color-surface2)] p-4 sm:col-span-3">
      <h3 className="mb-2 text-[13px] font-semibold text-[var(--color-ink)]">
        Documentos do projeto
        <span className="ml-2 font-normal text-[var(--color-ink3)]">
          contratos, propostas, jurídico e outros
        </span>
      </h3>

      {canEdit && r2 && (
        <form
          action={uploadProjetoDoc}
          className="mb-3 grid grid-cols-1 gap-2 sm:grid-cols-4 sm:items-end"
        >
          <input type="hidden" name="projectId" value={projectId} />
          <div className="sm:col-span-1">
            <Label>Tipo</Label>
            <Select name="tipo" defaultValue="Contrato">
              {TIPOS.map((t) => (
                <option key={t} value={t}>
                  {t}
                </option>
              ))}
            </Select>
          </div>
          <div className="sm:col-span-2">
            <Label>Arquivo (até 20 MB)</Label>
            <input type="file" name="file" required className="text-xs" />
          </div>
          <div>
            <Button type="submit" size="sm" className="w-full">
              Anexar
            </Button>
          </div>
        </form>
      )}
      {!r2 && (
        <p className="mb-2 text-[12px] text-[var(--color-warning)]">
          Configure as variáveis R2_* para habilitar o anexo de documentos.
        </p>
      )}

      {docs.length === 0 ? (
        <p className="text-[12px] text-[var(--color-ink4)]">Nenhum documento anexado.</p>
      ) : (
        <ul className="divide-y divide-[var(--color-accent2)]/8 rounded-[8px] border border-[var(--color-accent2)]/12 bg-white">
          {docs.map((d) => (
            <li key={d.id} className="flex flex-wrap items-center gap-2 px-3 py-2 text-[13px]">
              <span className="font-medium text-[var(--color-ink)]">{d.filename}</span>
              {d.tipo && (
                <span className="rounded-full bg-[var(--color-surface3)] px-2 py-0.5 text-[10px] text-[var(--color-ink3)]">
                  {d.tipo}
                </span>
              )}
              <span className="ml-auto flex items-center gap-3">
                {d.url && (
                  <a
                    href={d.url}
                    target="_blank"
                    rel="noopener"
                    className="text-[12px] text-[var(--color-accent2)] hover:underline"
                  >
                    Abrir
                  </a>
                )}
                {canEdit && (
                  <form action={deleteProjetoDoc}>
                    <input type="hidden" name="id" value={d.id} />
                    <button
                      type="submit"
                      className="text-[12px] text-[var(--color-danger)] hover:underline"
                    >
                      Remover
                    </button>
                  </form>
                )}
              </span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
```

---

## 3. Funções de `src/lib/queries.ts` chamadas pela página

A página chama duas: `getClientes` e `getDocuments`. Cada uma vem com o tipo
de retorno declarado logo acima dela no arquivo.

### `src/lib/queries.ts` · linhas 1032–1041

```ts
export type DocumentRow = typeof schema.documents.$inferSelect;

export async function getDocuments(tenantId: string): Promise<DocumentRow[]> {
  return db
    .select()
    .from(schema.documents)
    .where(eq(schema.documents.tenantId, tenantId))
    .orderBy(desc(schema.documents.uploadedAt));
}
```

### `src/lib/queries.ts` · linhas 1080–1088

```ts
export type ClienteRow = typeof schema.clientes.$inferSelect;

export async function getClientes(tenantId: string): Promise<ClienteRow[]> {
  return db
    .select()
    .from(schema.clientes)
    .where(eq(schema.clientes.tenantId, tenantId))
    .orderBy(asc(schema.clientes.nomeCompleto));
}
```

---

## 4. Server Actions disparadas pela tela

As cinco actions de `actions/projects.ts` são todas usadas por esta tela —
`createProject`, `updateProject` e `deleteProject` por `project-manager.tsx`;
`uploadProjetoDoc` e `deleteProjetoDoc` por `projeto-docs.tsx`. O arquivo vai
inteiro. De `actions/context.ts`, a tela dispara `setActiveProject`;
`setActiveVersion` está no mesmo arquivo mas não é usada aqui.

### `src/lib/actions/projects.ts`

```ts
"use server";

import { and, eq } from "drizzle-orm";
import { cookies } from "next/headers";
import { revalidatePath } from "next/cache";
import { db, schema } from "@/lib/db";
import {
  getActiveContext,
  ACTIVE_PROJECT_COOKIE,
  ACTIVE_VERSION_COOKIE,
} from "@/lib/context";
import { can } from "@/lib/permissions";
import { logAudit } from "@/lib/audit";
import { DEFAULT_INCC } from "@/lib/calc/constants";
import { isR2Configured, putObject } from "@/lib/storage/r2";

const ONE_YEAR = 60 * 60 * 24 * 365;

/** Versões padrão criadas junto com um projeto novo (ver seed.ts). */
const DEFAULT_VERSIONS = [
  { key: "budget", kind: "budget" as const, label: "Budget / Orçamento", color: "#6366f1", isDefault: false },
  { key: "forecast", kind: "forecast" as const, label: "Previsto / Forecast", color: "#10b981", isDefault: true },
  { key: "atual", kind: "atual" as const, label: "Atual — caixa real", color: "#f59e0b", isDefault: false },
];

type ProjectKind = "proj" | "office";
type ProjectStatus = "Em andamento" | "Planejamento";

/** Normaliza a duração (meses): inteiro positivo ou null. */
function normDuration(value: number | null | undefined): number | null {
  if (value == null) return null;
  const n = Math.trunc(Number(value));
  if (!Number.isFinite(n) || n <= 0) return null;
  return n;
}

const normStatus = (s: unknown): ProjectStatus =>
  s === "Em andamento" ? "Em andamento" : "Planejamento";

/** Normaliza um id de cliente vindo do formulário (vazio = próprio). */
const normClienteId = (v: string | null | undefined): string | null => {
  const s = (v ?? "").trim();
  return s ? s : null;
};
const normDate = (v: string | null | undefined): string | null => {
  const s = (v ?? "").trim();
  return s ? s : null;
};
/** Normaliza uma competência "MM/YYYY" (ou null). */
const normMonth = (v: string | null | undefined): string | null => {
  const s = (v ?? "").trim();
  return /^\d{1,2}\/\d{4}$/.test(s)
    ? `${s.split("/")[0].padStart(2, "0")}/${s.split("/")[1]}`
    : null;
};

/**
 * Cria um projeto (empreendimento) ou uma unidade/escritório (centro de custo)
 * com nome e duração e já provisiona as três versões padrão
 * (budget/forecast/atual) e a tabela INCC, de modo que todas as telas
 * vinculadas ao contexto funcionem imediatamente. O item criado passa a ser o
 * contexto ativo. `kind = "office"` cria matriz/filiais corporativas (sem
 * duração).
 */
export async function createProject(
  name: string,
  durationMonths: number | null,
  opts?: {
    kind?: ProjectKind;
    status?: ProjectStatus;
    startDate?: string | null;
    endDate?: string | null;
    mesInicial?: string | null;
    mesFinal?: string | null;
    clienteId?: string | null;
  },
) {
  const ctx = await getActiveContext();
  if (!ctx || !can(ctx.perms, "projeto", "criar")) {
    throw new Error("Sem permissão para criar projetos.");
  }
  const clean = (name || "").trim();
  if (!clean) throw new Error("Informe o nome do projeto.");

  const tenantId = ctx.tenant.id;
  const kind: ProjectKind = opts?.kind === "office" ? "office" : "proj";
  // Escritórios/unidades são centros de custo — não têm cronograma de obra.
  const duration = kind === "office" ? null : normDuration(durationMonths);
  const status = normStatus(opts?.status);

  const projectId = await db.transaction(async (tx) => {
    const [project] = await tx
      .insert(schema.projects)
      .values({
        tenantId,
        name: clean,
        kind,
        status,
        durationMonths: duration,
        startDate: kind === "office" ? null : normDate(opts?.startDate),
        endDate: kind === "office" ? null : normDate(opts?.endDate),
        mesInicial: kind === "office" ? null : normMonth(opts?.mesInicial),
        mesFinal: kind === "office" ? null : normMonth(opts?.mesFinal),
        clienteId: kind === "office" ? null : normClienteId(opts?.clienteId),
      })
      .returning();

    await tx
      .insert(schema.versions)
      .values(DEFAULT_VERSIONS.map((v) => ({ ...v, projectId: project.id, tenantId })));

    await tx.insert(schema.inccRates).values(
      DEFAULT_INCC.map((r, i) => ({
        projectId: project.id,
        tenantId,
        mes: r.m,
        monthly: r.mo.toString(),
        accumulated: r.ac.toString(),
        ordem: i,
      })),
    );

    return project.id;
  });

  // Torna o novo projeto o ativo (e reseta a versão para a default).
  const ck = await cookies();
  ck.set(ACTIVE_PROJECT_COOKIE, projectId, { path: "/", maxAge: ONE_YEAR });
  ck.delete(ACTIVE_VERSION_COOKIE);

  await logAudit({
    tenantId,
    userId: ctx.userId,
    action: "project.create",
    entity: "project",
    entityId: projectId,
    meta: { name: clean, kind, status, durationMonths: duration },
  });
  revalidatePath("/", "layout");
}

/** Renomeia / ajusta a duração e o status de um projeto (ou escritório). */
/** Converte string/number em texto numérico (ou null) para colunas numeric. */
function normValor(v: string | number | null | undefined): string | null {
  if (v === undefined || v === null || v === "") return null;
  const n = typeof v === "number" ? v : Number(String(v).replace(/\s/g, "").replace(",", "."));
  return Number.isFinite(n) ? String(n) : null;
}

export async function updateProject(
  projectId: string,
  patch: {
    name?: string;
    durationMonths?: number | null;
    status?: ProjectStatus;
    startDate?: string | null;
    endDate?: string | null;
    mesInicial?: string | null;
    mesFinal?: string | null;
    clienteId?: string | null;
    custoConstrucao?: string | number | null;
    custoTerreno?: string | number | null;
    valorConstrucao?: string | number | null;
    valorTerreno?: string | number | null;
    formaPagamentoTerreno?: string | null;
    proprietarioTerreno?: string | null;
    terrenoForaCaixa?: boolean;
    financiamentoConstrucao?: string | number | null;
    financiamentoTerreno?: string | number | null;
    recursosProprios?: string | number | null;
  },
) {
  const ctx = await getActiveContext();
  if (!ctx || !can(ctx.perms, "projeto", "editar")) return;
  if (!ctx.projects.some((p) => p.id === projectId)) return;

  const set: Partial<typeof schema.projects.$inferInsert> = {};
  if (patch.name !== undefined && patch.name.trim()) set.name = patch.name.trim();
  if (patch.durationMonths !== undefined) set.durationMonths = normDuration(patch.durationMonths);
  if (patch.status !== undefined) set.status = normStatus(patch.status);
  if (patch.startDate !== undefined) set.startDate = normDate(patch.startDate);
  if (patch.endDate !== undefined) set.endDate = normDate(patch.endDate);
  if (patch.mesInicial !== undefined) set.mesInicial = normMonth(patch.mesInicial);
  if (patch.mesFinal !== undefined) set.mesFinal = normMonth(patch.mesFinal);
  if (patch.clienteId !== undefined) set.clienteId = normClienteId(patch.clienteId);
  if (patch.custoConstrucao !== undefined) set.custoConstrucao = normValor(patch.custoConstrucao);
  if (patch.custoTerreno !== undefined) set.custoTerreno = normValor(patch.custoTerreno);
  if (patch.valorConstrucao !== undefined) set.valorConstrucao = normValor(patch.valorConstrucao);
  if (patch.valorTerreno !== undefined) set.valorTerreno = normValor(patch.valorTerreno);
  if (patch.formaPagamentoTerreno !== undefined)
    set.formaPagamentoTerreno = patch.formaPagamentoTerreno?.trim() || null;
  if (patch.proprietarioTerreno !== undefined)
    set.proprietarioTerreno = patch.proprietarioTerreno?.trim() || null;
  if (patch.terrenoForaCaixa !== undefined) set.terrenoForaCaixa = patch.terrenoForaCaixa;
  if (patch.financiamentoConstrucao !== undefined)
    set.financiamentoConstrucao = normValor(patch.financiamentoConstrucao);
  if (patch.financiamentoTerreno !== undefined)
    set.financiamentoTerreno = normValor(patch.financiamentoTerreno);
  if (patch.recursosProprios !== undefined)
    set.recursosProprios = normValor(patch.recursosProprios);
  if (Object.keys(set).length === 0) return;

  await db.update(schema.projects).set(set).where(eq(schema.projects.id, projectId));
  await logAudit({
    tenantId: ctx.tenant.id,
    userId: ctx.userId,
    action: "project.update",
    entity: "project",
    entityId: projectId,
    meta: set,
  });
  revalidatePath("/", "layout");
}

/**
 * Exclui um projeto e, em cascata, todas as suas versões e dados de movimento.
 * Não é permitido excluir o último projeto do tenant (o contexto exige ao menos
 * um). Se o projeto ativo for excluído, a seleção volta para o primeiro.
 */
export async function deleteProject(projectId: string) {
  const ctx = await getActiveContext();
  if (!ctx || !can(ctx.perms, "projeto", "excluir")) return;
  const target = ctx.projects.find((p) => p.id === projectId);
  if (!target) return;
  if (ctx.projects.length <= 1) {
    throw new Error("É preciso manter ao menos um projeto ou unidade no tenant.");
  }

  await db.delete(schema.projects).where(eq(schema.projects.id, projectId));

  // Se o projeto excluído era o ativo, limpa os cookies (fallback p/ projects[0]).
  if (ctx.project.id === projectId) {
    const ck = await cookies();
    ck.delete(ACTIVE_PROJECT_COOKIE);
    ck.delete(ACTIVE_VERSION_COOKIE);
  }

  await logAudit({
    tenantId: ctx.tenant.id,
    userId: ctx.userId,
    action: "project.delete",
    entity: "project",
    entityId: projectId,
    meta: { name: target.name },
  });
  revalidatePath("/", "layout");
}

/**
 * Anexa um arquivo (contrato, proposta, documento jurídico, etc.) ao cadastro do
 * projeto. Reusa a tabela `documents` (vínculo por project_id) e o armazenamento
 * R2. Múltiplos arquivos por projeto; os documentos são preservados em edições
 * posteriores do projeto. Requer permissão de edição de projeto.
 */
export async function uploadProjetoDoc(formData: FormData) {
  const ctx = await getActiveContext();
  if (!ctx || !can(ctx.perms, "projeto", "editar")) {
    throw new Error("Sem permissão para anexar documentos ao projeto.");
  }
  if (!isR2Configured()) {
    throw new Error("Storage (R2) não configurado — defina as variáveis R2_*.");
  }
  const projectId = (formData.get("projectId") as string) || "";
  if (!projectId || !ctx.projects.some((p) => p.id === projectId)) {
    throw new Error("Projeto inválido.");
  }
  const file = formData.get("file") as File | null;
  if (!file || file.size === 0) throw new Error("Selecione um arquivo.");
  if (file.size > 20 * 1024 * 1024) throw new Error("Arquivo deve ter até 20 MB.");

  const safe = file.name.replace(/[^\w.\-]+/g, "_");
  const key = `tenants/${ctx.tenant.id}/projetos/${projectId}/${Date.now()}_${safe}`;
  await putObject(key, new Uint8Array(await file.arrayBuffer()), file.type || "application/octet-stream");

  await db.insert(schema.documents).values({
    tenantId: ctx.tenant.id,
    projectId,
    storageKey: key,
    filename: file.name,
    contentType: file.type || null,
    size: file.size,
    tipo: ((formData.get("tipo") as string) || "").trim() || "Documento do projeto",
    uploadedBy: ctx.userEmail || ctx.userId || null,
  });
  await logAudit({
    tenantId: ctx.tenant.id,
    userId: ctx.userId,
    action: "projeto.doc.upload",
    entity: "document",
    entityId: projectId,
    meta: { filename: file.name, tipo: (formData.get("tipo") as string) || null },
  });
  revalidatePath("/projeto");
}

/** Remove um documento anexado ao projeto (registro; o objeto R2 fica órfão). */
export async function deleteProjetoDoc(formData: FormData) {
  const ctx = await getActiveContext();
  if (!ctx || !can(ctx.perms, "projeto", "editar")) {
    throw new Error("Sem permissão.");
  }
  const id = (formData.get("id") as string) || "";
  if (!id) return;
  await db
    .delete(schema.documents)
    .where(and(eq(schema.documents.id, id), eq(schema.documents.tenantId, ctx.tenant.id)));
  await logAudit({
    tenantId: ctx.tenant.id,
    userId: ctx.userId,
    action: "projeto.doc.delete",
    entity: "document",
    entityId: id,
  });
  revalidatePath("/projeto");
}
```

### `src/lib/actions/context.ts`

```ts
"use server";

import { cookies } from "next/headers";
import { revalidatePath } from "next/cache";
import { ACTIVE_PROJECT_COOKIE, ACTIVE_VERSION_COOKIE } from "@/lib/context";

const ONE_YEAR = 60 * 60 * 24 * 365;

export async function setActiveVersion(versionId: string) {
  const ck = await cookies();
  ck.set(ACTIVE_VERSION_COOKIE, versionId, { path: "/", maxAge: ONE_YEAR });
  revalidatePath("/", "layout");
}

export async function setActiveProject(projectId: string) {
  const ck = await cookies();
  ck.set(ACTIVE_PROJECT_COOKIE, projectId, { path: "/", maxAge: ONE_YEAR });
  // Troca de projeto reseta a versão ativa (será resolvida pela default).
  ck.delete(ACTIVE_VERSION_COOKIE);
  revalidatePath("/", "layout");
}
```

---

## 5. Tabela `project` no schema

### `src/lib/db/schema.ts` · linhas 229–323

```ts
/** Empreendimento ou escritório do tenant. */
export const projects = pgTable("project", {
  id: uuid("id").primaryKey().defaultRandom(),
  tenantId: uuid("tenant_id")
    .notNull()
    .references(() => tenants.id, { onDelete: "cascade" }),
  name: text("name").notNull(),
  kind: projectKindEnum("kind").notNull().default("proj"),
  status: projectStatusEnum("status").notNull().default("Planejamento"),
  /** Duração planejada do empreendimento, em meses. */
  durationMonths: integer("duration_months"),
  /** Datas de início e fim da obra ("MM/DD/YYYY", como no restante do app). */
  startDate: text("start_date"),
  endDate: text("end_date"),
  /**
   * Período de planejamento (competências "MM/YYYY"). É a fonte OFICIAL das
   * colunas mensais do Budget e do Forecast — o período não é editável nessas
   * telas, vem daqui. Ver docs/SPEC (Planejamento §2).
   */
  mesInicial: text("mes_inicial"),
  mesFinal: text("mes_final"),
  /**
   * Cliente da obra (lista fechada). NULL = empreendimento próprio da
   * construtora/incorporadora (tenant), que comercializará as unidades.
   */
  clienteId: uuid("cliente_id").references((): AnyPgColumn => clientes.id, {
    onDelete: "set null",
  }),
  // ── Custo do terreno / valor global (visão econômica × financeira) ──────
  /** Custo de construção (obra) e custo de aquisição do terreno. */
  custoConstrucao: numeric("custo_construcao", { precision: 15, scale: 2 }),
  custoTerreno: numeric("custo_terreno", { precision: 15, scale: 2 }),
  /** Valor de venda da construção e do terreno (compõem o valor global). */
  valorConstrucao: numeric("valor_construcao", { precision: 15, scale: 2 }),
  valorTerreno: numeric("valor_terreno", { precision: 15, scale: 2 }),
  /** Forma de pagamento e proprietário do terreno. */
  formaPagamentoTerreno: text("forma_pagamento_terreno"),
  proprietarioTerreno: text("proprietario_terreno"),
  /**
   * Composição do funding da obra (indicador "Recursos próprios" do Budget).
   * Valores informados no cadastro (não é fórmula calculada).
   */
  financiamentoConstrucao: numeric("financiamento_construcao", { precision: 15, scale: 2 }),
  financiamentoTerreno: numeric("financiamento_terreno", { precision: 15, scale: 2 }),
  recursosProprios: numeric("recursos_proprios", { precision: 15, scale: 2 }),
  /**
   * Terreno pago direto ao proprietário (não passa pelo caixa da construtora).
   * Quando true, o valor do terreno compõe a visão econômica/global, mas NÃO é
   * lançado no caixa da construtora.
   */
  terrenoForaCaixa: boolean("terreno_fora_caixa").notNull().default(true),
  // ── Localização da obra (controle de ponto georreferenciado) ────────────
  endereco: text("endereco"),
  latitude: numeric("latitude", { precision: 10, scale: 7 }),
  longitude: numeric("longitude", { precision: 10, scale: 7 }),
  // ── Dados fiscais da obra (emissão de NFS-e) ────────────────────────────
  // Na construção civil o ISS é devido no município da OBRA (LC 116/2003,
  // art. 3º, III), que nem sempre é o da sede. Por isso o município de
  // incidência sai do projeto e não do tenant. Opcionais: projeto que não
  // fatura serviço nunca precisa deles.
  /** código IBGE (7 dígitos) do município onde a obra é executada. */
  codigoMunicipioObra: text("codigo_municipio_obra"),
  municipioObra: text("municipio_obra"),
  ufObra: text("uf_obra"),
  /** matrícula CNO/CEI da obra — vai no campo `codigo_obra` da NFS-e. */
  codigoObra: text("codigo_obra"),
  /** número da ART/RRT do responsável técnico. */
  art: text("art"),
  /** raio permitido para registro de ponto, em metros (padrão 100). */
  pontoRaioMetros: integer("ponto_raio_metros").notNull().default(100),
  // ── Medição / BDI / provisionamento (ver docs/BDI-PROVISIONAMENTO.md) ───
  // Todos OPCIONAIS: projetos existentes seguem funcionando sem preenchê-los.
  /** CUB de referência (R$/m²) e metragem — custo referencial = CUB × metragem. */
  cub: numeric("cub", { precision: 15, scale: 2 }),
  metragem: numeric("metragem", { precision: 12, scale: 2 }),
  /** Parcela de referência do caixa (base do cálculo de E.V.O). */
  parcelaReferencia: numeric("parcela_referencia", { precision: 15, scale: 2 }),
  /**
   * Percentual de BDI do projeto. CONFIGURÁVEL — a alíquota varia conforme o
   * tipo de executor da obra e não é presumida pelo sistema. A planilha de
   * referência do cliente traz 6% para "Profissional Autônomo"; a regra para
   * construtora depende de confirmação e por isso não há valor padrão.
   */
  pctBdi: numeric("pct_bdi", { precision: 8, scale: 4 }),
  /** Executor da obra — "Profissional Autônomo" | "Construtora" (texto livre). */
  tipoExecutor: text("tipo_executor"),
  /** Percentual de taxas incidentes sobre a liberação (ex.: 1,5). */
  pctTaxaLiberacao: numeric("pct_taxa_liberacao", { precision: 8, scale: 4 }),
  /**
   * Tipo de obra: regras e nomenclaturas de construção individual e de
   * empreendimento não devem ser reaproveitadas automaticamente entre si.
   */
  tipoObra: text("tipo_obra"),
  createdAt: timestamp("created_at", { mode: "date" }).notNull().defaultNow(),
});
```

---

## 6. Tabela `membership` no schema

### `src/lib/db/schema.ts` · linhas 149–171

```ts
/** Vínculo usuário ⇄ tenant com papel (RBAC). */
export const memberships = pgTable(
  "membership",
  {
    userId: text("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    tenantId: uuid("tenant_id")
      .notNull()
      .references(() => tenants.id, { onDelete: "cascade" }),
    role: roleEnum("role").notNull().default("membro"),
    /**
     * Permissões granulares (override do perfil/role): matriz tela → ações
     * {ver,criar,editar,excluir}. Null = usa os defaults do role.
     * Ver src/lib/permissions.ts.
     */
    permissions: jsonb("permissions").$type<
      Record<string, { ver: boolean; criar: boolean; editar: boolean; excluir: boolean }>
    >(),
    createdAt: timestamp("created_at", { mode: "date" }).notNull().defaultNow(),
  },
  (m) => [primaryKey({ columns: [m.userId, m.tenantId] })],
);
```

