# TELA-unidades — código na íntegra

Coleta do código das três telas de **Unidades / Vendas** (`/unidades`,
`/unidades/nova`, `/unidades/[id]`), em `main` (commit `45f4ce3`).
Sem resumo, sem análise.

**Árvore de dependências própria:**

```
unidades/page.tsx
├── components/app/page-header.tsx
├── components/app/project-picker.tsx
└── components/app/unidades-import-export.tsx

unidades/nova/page.tsx
├── components/app/page-header.tsx        (já listado)
└── components/app/unit-form.tsx

unidades/[id]/page.tsx
├── components/app/page-header.tsx        (já listado)
├── components/app/unit-form.tsx          (já listado)
└── components/app/unit-actions.tsx

queries chamadas pelas páginas:  getUnits · getUnitWithProject · getAtualVersion
server actions disparadas:       saveUnit     (actions/units.ts)
                                 deleteUnit   (actions/units.ts)
                                 importUnits  (actions/units.ts)
```

Duas observações de fato sobre o item 3, para o recorte ficar explícito:

- **`getUnitCodesByTenant` e `getReceivables` não são chamadas por estas três
  páginas.** Vão coladas porque foram pedidas nominalmente. Quem as chama:
  `getUnitCodesByTenant` — `/contasreceber`, `/clientes/novo`, `/clientes/[id]`;
  `getReceivables` — `/contasreceber`, `/fechamento` e a rota
  `api/agent/contas-receber`.
- **`getAtualVersion` é chamada e não estava na lista.** Vai junto, marcada,
  para a coleta das páginas ficar completa.

Ficam de fora os primitivos de `components/ui/` (`badge`, `button`, `card`,
`date-field`, `input`, `table`) e `@/lib/calc`, `@/lib/context`,
`@/lib/download`, `@/lib/permissions`, `@/lib/utils`.

---

## 1. Páginas

### `src/app/(app)/unidades/page.tsx`

Listagem — **Unidades do Empreendimento**.

```tsx
import Link from "next/link";
import { getActiveContext } from "@/lib/context";
import { getUnits, getAtualVersion, toCalcUnit } from "@/lib/queries";
import { calcUnitTotal } from "@/lib/calc";
import { can } from "@/lib/permissions";
import { brl0 } from "@/lib/utils";
import { PageHeader } from "@/components/app/page-header";
import { ProjectPicker } from "@/components/app/project-picker";
import { Badge, unitStatusTone } from "@/components/ui/badge";
import { buttonVariants } from "@/components/ui/button";
import { Table, THead, TH, TR, TD } from "@/components/ui/table";
import { UnitActions } from "@/components/app/unit-actions";
import { UnidadesImportExport } from "@/components/app/unidades-import-export";

export const dynamic = "force-dynamic";

const STATUS_FILTERS = ["Disponivel", "Reservado", "Vendido"] as const;

/** VGV compacto em milhões, no formato do protótipo (ex.: R$ 40,19M). */
function vgvMi(value: number): string {
  const mi = (value / 1e6).toLocaleString("pt-BR", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
  return `R$ ${mi}M`;
}

export default async function UnidadesPage({
  searchParams,
}: {
  searchParams: Promise<{ status?: string; proj?: string }>;
}) {
  const ctx = await getActiveContext();
  if (!ctx) return null;

  const sp = await searchParams;
  const filter = STATUS_FILTERS.find((s) => s === sp.status);

  const project = ctx.projects.find((p) => p.id === sp.proj) ?? ctx.projects[0];
  const version = await getAtualVersion(ctx.tenant.id, project.id);
  // Só lista unidades da versão Atual DESTE projeto. Sem versão Atual, lista
  // vazia — nunca cai na versão de outro projeto (evita mostrar unidades alheias).
  const allRows = version ? await getUnits(version.id) : [];
  const rows = filter ? allRows.filter((r) => r.status === filter) : allRows;

  const vgv = allRows.reduce((a, r) => a + Number(r.valor), 0);
  const countOf = (s: string) => allRows.filter((r) => r.status === s).length;

  const blocos = [
    ...new Set(allRows.map((r) => r.bloco).filter((b): b is string => !!b)),
  ];
  const blocoLabel =
    blocos.length === 1
      ? `Bloco ${blocos[0]}`
      : blocos.length > 1
        ? `Blocos ${blocos.join(" · ")}`
        : null;
  const subtitle = [blocoLabel, `${allRows.length} unidades`, `VGV ${vgvMi(vgv)}`]
    .filter(Boolean)
    .join(" · ");

  const canEdit = can(ctx.perms, "unidades", "criar");
  const canEditar = can(ctx.perms, "unidades", "editar");
  const canExcluir = can(ctx.perms, "unidades", "excluir");
  const showActions = canEditar || canExcluir;

  const tabs = [
    { key: undefined as string | undefined, label: "Todas", count: allRows.length },
    { key: "Disponivel", label: "Disponíveis", count: countOf("Disponivel") },
    { key: "Reservado", label: "Reservadas", count: countOf("Reservado") },
    { key: "Vendido", label: "Vendidas", count: countOf("Vendido") },
  ];

  const colCount = showActions ? 10 : 9;

  return (
    <>
      <PageHeader
        eyebrow={`${project.name} · Atual`}
        title="Unidades do Empreendimento"
        subtitle={subtitle}
        actions={
          <div className="flex flex-wrap items-end gap-3">
            <ProjectPicker
              projects={ctx.projects.map((p) => ({ id: p.id, label: p.name }))}
              selected={project.id}
            />
            {canEdit && (
              <Link
                href={`/unidades/nova?proj=${project.id}`}
                className={buttonVariants({ size: "sm" })}
              >
                Nova Unidade
              </Link>
            )}
          </div>
        }
      />

      {/* Import / export de unidades por planilha (considera o projeto selecionado) */}
      <div className="mb-4">
        <UnidadesImportExport
          projectId={project.id}
          projectName={project.name}
          canImport={canEdit}
          units={allRows.map((u) => ({
            code: u.code,
            bloco: u.bloco,
            tipo: u.tipo,
            m2: u.m2,
            andar: u.andar,
            valor: String(u.valor),
            status: u.status,
          }))}
        />
      </div>

      {/* Filtros por status */}
      <div className="mb-4 flex flex-wrap gap-2">
        {tabs.map((t) => {
          const active = filter === t.key;
          return (
            <Link
              key={t.label}
              href={
                t.key
                  ? `/unidades?proj=${project.id}&status=${t.key}`
                  : `/unidades?proj=${project.id}`
              }
              className={`inline-flex items-center gap-2 rounded-full px-4 py-1.5 text-[13px] font-medium transition-colors ${
                active
                  ? "bg-[var(--color-accent)] text-white"
                  : "border border-[var(--color-accent2)]/15 bg-[var(--color-surface)] text-[var(--color-ink2)] hover:bg-[var(--color-surface3)]"
              }`}
            >
              {t.label}
              <span
                className={`font-[family-name:var(--font-mono)] text-[11px] ${
                  active ? "text-white/70" : "text-[var(--color-ink4)]"
                }`}
              >
                {t.count}
              </span>
            </Link>
          );
        })}
      </div>

      <Table>
        <THead>
          <tr>
            <TH>Unidade</TH>
            <TH>Tipo</TH>
            <TH className="text-right">m²</TH>
            <TH className="text-right">And.</TH>
            <TH className="text-right">Valor R$</TH>
            <TH>Status</TH>
            <TH>Mês venda</TH>
            <TH className="text-right">Total fontes</TH>
            <TH className="text-right">Saldo</TH>
            {showActions && <TH className="text-right">Ações</TH>}
          </tr>
        </THead>
        <tbody>
          {rows.length === 0 ? (
            <TR>
              <TD colSpan={colCount} className="py-8 text-center text-[var(--color-ink4)]">
                Nenhuma unidade{filter ? " com este status" : ""}.
              </TD>
            </TR>
          ) : (
            rows.map((row) => {
              const u = toCalcUnit(row);
              const total = calcUnitTotal(u);
              const saldo = total - u.valor;
              const sold = u.status === "Vendido";
              const ok = !sold || Math.abs(saldo) < 1;
              return (
                <TR key={row.id}>
                  <TD className="font-medium text-[var(--color-ink)]">
                    <Link
                      href={`/unidades/${row.id}`}
                      className="hover:text-[var(--color-accent2)] hover:underline"
                    >
                      {row.code}
                    </Link>
                    {row.itemType === "condominio" && (
                      <Badge tone="accent" className="ml-2">
                        Condomínio
                      </Badge>
                    )}
                  </TD>
                  <TD>{row.tipo ?? "—"}</TD>
                  <TD className="text-right font-[family-name:var(--font-mono)]">
                    {row.m2 ? Number(row.m2).toFixed(2) : "—"}
                  </TD>
                  <TD className="text-right font-[family-name:var(--font-mono)]">
                    {row.andar != null ? `${row.andar}º` : "—"}
                  </TD>
                  <TD className="text-right font-[family-name:var(--font-mono)]">
                    {brl0(u.valor)}
                  </TD>
                  <TD>
                    <Badge tone={unitStatusTone(row.status)}>{row.status}</Badge>
                  </TD>
                  <TD className="font-[family-name:var(--font-mono)]">
                    {row.mesVenda ?? "—"}
                  </TD>
                  <TD className="text-right font-[family-name:var(--font-mono)]">
                    {sold ? brl0(total) : "—"}
                  </TD>
                  <TD
                    className={`text-right font-[family-name:var(--font-mono)] ${
                      sold
                        ? ok
                          ? "text-[var(--color-success)]"
                          : "text-[var(--color-danger)]"
                        : ""
                    }`}
                  >
                    {sold ? brl0(saldo) : "—"}
                  </TD>
                  {showActions && (
                    <TD className="text-right">
                      <UnitActions
                        id={row.id}
                        code={row.code}
                        canEditar={canEditar}
                        canExcluir={canExcluir}
                      />
                    </TD>
                  )}
                </TR>
              );
            })
          )}
        </tbody>
      </Table>
    </>
  );
}
```

### `src/app/(app)/unidades/nova/page.tsx`

Cadastro — **Nova Unidade**.

```tsx
import { getActiveContext } from "@/lib/context";
import { can } from "@/lib/permissions";
import { PageHeader } from "@/components/app/page-header";
import { UnitForm } from "@/components/app/unit-form";
import { emptyPlan } from "@/lib/calc";

export const dynamic = "force-dynamic";

export default async function NovaUnidadePage({
  searchParams,
}: {
  searchParams: Promise<{ proj?: string }>;
}) {
  const ctx = await getActiveContext();
  if (!ctx) return null;
  if (!can(ctx.perms, "unidades", "criar")) {
    return <p className="text-sm text-[var(--color-warning)]">Sem permissão para criar unidades.</p>;
  }
  const sp = await searchParams;
  const project = ctx.projects.find((p) => p.id === sp.proj) ?? ctx.projects[0];

  return (
    <>
      <PageHeader eyebrow="Nova venda · versão Atual" title="Nova Unidade" />
      <UnitForm
        projetos={ctx.projects.map((p) => ({ id: p.id, nome: p.name }))}
        initial={{
          projetoId: project.id,
          itemType: "unidade",
          code: "",
          bloco: "",
          tipo: "",
          m2: "",
          andar: "",
          valor: "",
          status: "Disponivel",
          mesVenda: "",
          plan: emptyPlan(),
        }}
      />
    </>
  );
}
```

### `src/app/(app)/unidades/[id]/page.tsx`

Edição — **Editar unidade**.

```tsx
import { notFound } from "next/navigation";
import { getActiveContext } from "@/lib/context";
import { getUnitWithProject } from "@/lib/queries";
import { PageHeader } from "@/components/app/page-header";
import { UnitForm } from "@/components/app/unit-form";
import { emptyPlan } from "@/lib/calc";

export const dynamic = "force-dynamic";

export default async function EditarUnidadePage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const ctx = await getActiveContext();
  if (!ctx) return null;
  const { id } = await params;
  const row = await getUnitWithProject(ctx.tenant.id, id);
  if (!row) notFound();
  const project = ctx.projects.find((p) => p.id === row.projectId) ?? ctx.projects[0];

  return (
    <>
      <PageHeader eyebrow={`${project.name} · Atual`} title={`Editar ${row.code}`} />
      <UnitForm
        projetos={ctx.projects.map((p) => ({ id: p.id, nome: p.name }))}
        initial={{
          id: row.id,
          projetoId: row.projectId,
          itemType: row.itemType,
          code: row.code,
          bloco: row.bloco ?? "",
          tipo: row.tipo ?? "",
          m2: row.m2 ?? "",
          andar: row.andar != null ? String(row.andar) : "",
          valor: row.valor ?? "",
          status: row.status,
          mesVenda: row.mesVenda ?? "",
          plan: row.paymentPlan ?? emptyPlan(),
        }}
      />
    </>
  );
}
```

---

## 2. Componentes de `components/app/`

| Componente | Usado por |
|---|---|
| `page-header` | as três páginas |
| `project-picker` | `/unidades` |
| `unidades-import-export` | `/unidades` |
| `unit-form` | `/unidades/nova`, `/unidades/[id]` |
| `unit-actions` | `/unidades/[id]` |

### `src/components/app/page-header.tsx`

Usado pelas três páginas.

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

### `src/components/app/project-picker.tsx`

Usado por `/unidades`.

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

### `src/components/app/unidades-import-export.tsx`

Usado por `/unidades`.

```tsx
"use client";

import { useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import * as XLSX from "xlsx";
import { importUnits, type ImportUnitRow } from "@/lib/actions/units";
import { baixarXlsx } from "@/lib/download";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";

export interface UnitExport {
  code: string;
  bloco: string | null;
  tipo: string | null;
  m2: string | null;
  andar: number | null;
  valor: string;
  status: string;
}

const HEADERS = ["Código", "Bloco", "Tipo", "m2", "Andar", "Valor", "Status"];
const STATUS_VALIDOS = ["Disponivel", "Reservado", "Vendido"];

/** Número tolerante a formato BR/US ("1.234,56" ou "1234.56") → number | null. */
function num(v: unknown): number | null {
  if (v == null || v === "") return null;
  if (typeof v === "number") return Number.isFinite(v) ? v : null;
  let s = String(v).trim().replace(/[R$\s]/g, "");
  if (!s) return null;
  if (/,\d{1,2}$/.test(s)) s = s.replace(/\./g, "").replace(",", ".");
  else if ((s.match(/\./g) || []).length > 1) s = s.replace(/\./g, "");
  const n = Number(s.replace(/,/g, ""));
  return Number.isFinite(n) ? n : null;
}

interface PreviewRow extends ImportUnitRow {
  erros: string[];
}

export function UnidadesImportExport({
  projectId,
  projectName,
  units,
  canImport,
}: {
  projectId: string;
  projectName: string;
  units: UnitExport[];
  canImport: boolean;
}) {
  const router = useRouter();
  const fileRef = useRef<HTMLInputElement>(null);
  const [pending, start] = useTransition();
  const [preview, setPreview] = useState<PreviewRow[] | null>(null);
  const [msg, setMsg] = useState<string | null>(null);
  const [erro, setErro] = useState<string | null>(null);

  const exportar = () => {
    const aoa: (string | number)[][] = [HEADERS];
    for (const u of units)
      aoa.push([
        u.code,
        u.bloco ?? "",
        u.tipo ?? "",
        u.m2 ? Number(u.m2) : "",
        u.andar ?? "",
        Number(u.valor) || 0,
        u.status,
      ]);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(aoa), "Unidades");
    baixarXlsx(wb, `unidades-${projectName.replace(/[^\w]+/g, "_")}.xlsx`);
  };

  const modelo = () => {
    const wb = XLSX.utils.book_new();
    const aoa = [HEADERS, ["101", "A", "Apartamento", 65.5, 10, 350000, "Disponivel"]];
    XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(aoa), "Unidades");
    baixarXlsx(wb, "modelo-unidades.xlsx");
  };

  const onFile = async (file: File) => {
    setMsg(null);
    setErro(null);
    setPreview(null);
    try {
      const wb = XLSX.read(await file.arrayBuffer(), { cellDates: false });
      const ws = wb.Sheets["Unidades"] ?? wb.Sheets[wb.SheetNames[0]];
      const grid = XLSX.utils
        .sheet_to_json<unknown[]>(ws, { header: 1, raw: true, defval: "" })
        .filter((r) => r.some((c) => String(c ?? "").trim()));
      if (grid.length < 2) {
        setErro("Planilha vazia ou sem linhas de dados.");
        return;
      }
      const head = (grid[0] as unknown[]).map((c) => String(c ?? "").trim().toLowerCase());
      const idx = (aliases: string[]) => head.findIndex((h) => aliases.some((a) => h.includes(a)));
      const iCode = idx(["código", "codigo", "unidade", "code"]);
      const iBloco = idx(["bloco"]);
      const iTipo = idx(["tipo"]);
      const iM2 = idx(["m2", "m²", "area", "área"]);
      const iAndar = idx(["andar"]);
      const iValor = idx(["valor", "preço", "preco"]);
      const iStatus = idx(["status", "situa"]);
      if (iCode < 0) {
        setErro('Coluna "Código" não encontrada. Baixe o modelo e use os mesmos cabeçalhos.');
        return;
      }
      const codesVistos = new Set<string>();
      const existentes = new Set(units.map((u) => u.code.trim().toLowerCase()));
      const rows: PreviewRow[] = [];
      for (const r of grid.slice(1)) {
        const cell = (i: number) => (i >= 0 ? String((r as unknown[])[i] ?? "").trim() : "");
        const code = cell(iCode);
        if (!code) continue;
        const erros: string[] = [];
        const key = code.toLowerCase();
        if (codesVistos.has(key)) erros.push("código duplicado na planilha");
        codesVistos.add(key);
        if (existentes.has(key)) erros.push("já existe uma unidade com este código no projeto");
        const m2 = iM2 >= 0 ? num((r as unknown[])[iM2]) : null;
        const andarN = iAndar >= 0 ? num((r as unknown[])[iAndar]) : null;
        const valor = iValor >= 0 ? num((r as unknown[])[iValor]) : null;
        let status = cell(iStatus) || "Disponivel";
        if (!STATUS_VALIDOS.includes(status)) {
          erros.push(`status inválido "${status}" (use ${STATUS_VALIDOS.join("/")})`);
          status = "Disponivel";
        }
        rows.push({
          code,
          bloco: cell(iBloco) || undefined,
          tipo: cell(iTipo) || undefined,
          m2: m2 ?? undefined,
          andar: andarN != null ? Math.trunc(andarN) : undefined,
          valor: valor ?? 0,
          status: status as ImportUnitRow["status"],
          erros,
        });
      }
      if (rows.length === 0) {
        setErro("Nenhuma linha com código preenchido.");
        return;
      }
      setPreview(rows);
    } catch (e) {
      setErro(e instanceof Error ? e.message : "Falha ao ler a planilha.");
    }
  };

  const validas = preview?.filter((r) => r.erros.length === 0) ?? [];
  const comErro = preview?.filter((r) => r.erros.length > 0) ?? [];

  const confirmar = () => {
    if (validas.length === 0) return;
    setErro(null);
    start(async () => {
      try {
        const res = await importUnits(
          validas.map(({ erros, ...r }) => { void erros; return r; }),
          projectId,
        );
        setMsg(`${res.inserted} unidade(s) importada(s) para ${projectName}.`);
        setPreview(null);
        router.refresh();
      } catch (e) {
        setErro(e instanceof Error ? e.message : "Falha ao importar.");
      }
    });
  };

  return (
    <div className="space-y-2">
      <div className="flex flex-wrap items-center gap-2">
        <Button variant="outline" size="sm" onClick={exportar} disabled={pending}>
          ⬇ Exportar planilha
        </Button>
        <Button variant="outline" size="sm" onClick={modelo} disabled={pending}>
          Modelo
        </Button>
        {canImport && (
          <>
            <input
              ref={fileRef}
              type="file"
              accept=".xlsx,.xls,.csv"
              hidden
              onChange={(e) => {
                const f = e.target.files?.[0];
                e.target.value = "";
                if (f) onFile(f);
              }}
            />
            <Button variant="outline" size="sm" onClick={() => fileRef.current?.click()} disabled={pending}>
              ⬆ Importar planilha
            </Button>
          </>
        )}
        {msg && <span className="text-xs text-[var(--color-success)]">{msg}</span>}
        {erro && <span className="text-xs text-[var(--color-danger)]">{erro}</span>}
      </div>

      {preview && (
        <Card>
          <CardContent className="p-4">
            <div className="mb-2 flex flex-wrap items-center gap-2">
              <h3 className="text-sm font-semibold text-[var(--color-ink)]">
                Pré-visualização — {projectName}
              </h3>
              <Badge tone="success">{validas.length} válidas</Badge>
              {comErro.length > 0 && <Badge tone="danger">{comErro.length} com erro</Badge>}
            </div>
            <div className="max-h-[360px] overflow-auto rounded-[8px] border border-[var(--color-accent2)]/12">
              <table className="w-full border-collapse text-[12.5px]">
                <thead className="sticky top-0 bg-[var(--color-surface2)] text-left font-[family-name:var(--font-mono)] text-[10px] uppercase text-[var(--color-ink3)]">
                  <tr>
                    <th className="px-2 py-2">Código</th>
                    <th className="px-2 py-2">Bloco</th>
                    <th className="px-2 py-2">Tipo</th>
                    <th className="px-2 py-2 text-right">m²</th>
                    <th className="px-2 py-2 text-right">Andar</th>
                    <th className="px-2 py-2 text-right">Valor</th>
                    <th className="px-2 py-2">Status</th>
                    <th className="px-2 py-2">Validação</th>
                  </tr>
                </thead>
                <tbody>
                  {preview.map((r, i) => (
                    <tr
                      key={i}
                      className={`border-t border-[var(--color-accent2)]/8 ${r.erros.length ? "bg-[var(--color-danger)]/5" : ""}`}
                    >
                      <td className="px-2 py-1.5 font-medium">{r.code}</td>
                      <td className="px-2 py-1.5">{r.bloco ?? "—"}</td>
                      <td className="px-2 py-1.5">{r.tipo ?? "—"}</td>
                      <td className="px-2 py-1.5 text-right font-[family-name:var(--font-mono)]">{r.m2 ?? "—"}</td>
                      <td className="px-2 py-1.5 text-right font-[family-name:var(--font-mono)]">{r.andar ?? "—"}</td>
                      <td className="px-2 py-1.5 text-right font-[family-name:var(--font-mono)]">
                        {(r.valor ?? 0).toLocaleString("pt-BR", { minimumFractionDigits: 2 })}
                      </td>
                      <td className="px-2 py-1.5">{r.status}</td>
                      <td className="px-2 py-1.5 text-[var(--color-danger)]">
                        {r.erros.length ? r.erros.join("; ") : "✓"}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <div className="mt-3 flex items-center justify-end gap-2">
              <Button variant="outline" size="sm" onClick={() => setPreview(null)} disabled={pending}>
                Cancelar
              </Button>
              <Button size="sm" onClick={confirmar} disabled={pending || validas.length === 0}>
                {pending ? "Importando…" : `Importar ${validas.length} unidade(s)`}
              </Button>
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
```

### `src/components/app/unit-form.tsx`

Usado por `/unidades/nova` e `/unidades/[id]`.

```tsx
"use client";

import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { calcUnitTotal, type PaymentPlan, type UnitStatus } from "@/lib/calc";
import { saveUnit, deleteUnit, type SaveUnitInput } from "@/lib/actions/units";
import { brl0 } from "@/lib/utils";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input, Label, Select } from "@/components/ui/input";
import { DateField } from "@/components/ui/date-field";
import { Badge } from "@/components/ui/badge";

export interface UnitFormValue {
  id?: string;
  projetoId: string;
  itemType: "unidade" | "condominio";
  code: string;
  bloco: string;
  tipo: string;
  m2: string;
  andar: string;
  valor: string;
  status: UnitStatus;
  mesVenda: string;
  plan: PaymentPlan;
}

const n = (v: string) => (v === "" ? 0 : Number(v));

export function UnitForm({
  initial,
  projetos,
}: {
  initial: UnitFormValue;
  projetos: { id: string; nome: string }[];
}) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [v, setV] = useState<UnitFormValue>(initial);
  const plan = v.plan;

  const setPlan = (patch: Partial<PaymentPlan>) =>
    setV((s) => ({ ...s, plan: { ...s.plan, ...patch } }));
  // atualiza um campo de uma fonte
  const setSrc = <K extends keyof PaymentPlan>(
    key: K,
    field: string,
    value: unknown,
  ) =>
    setPlan({
      [key]: { ...(plan[key] as object), [field]: value },
    } as Partial<PaymentPlan>);

  const total = useMemo(
    () =>
      calcUnitTotal({
        code: v.code,
        status: v.status,
        valor: n(v.valor),
        ...plan,
      }),
    [v, plan],
  );
  const saldo = total - n(v.valor);
  const ok = v.status !== "Vendido" || Math.abs(saldo) < 1;

  function submit() {
    setError(null);
    const input: SaveUnitInput = {
      id: v.id,
      projectId: v.projetoId,
      itemType: v.itemType,
      code: v.code,
      bloco: v.bloco,
      tipo: v.tipo,
      m2: v.m2 ? n(v.m2) : undefined,
      andar: v.andar ? n(v.andar) : undefined,
      valor: n(v.valor),
      status: v.status,
      mesVenda: v.mesVenda,
      plan,
    };
    start(async () => {
      try {
        await saveUnit(input);
      } catch (e) {
        setError(e instanceof Error ? e.message : "Erro ao salvar.");
      }
    });
  }

  function remove() {
    if (!v.id) return;
    start(async () => {
      await deleteUnit(v.id!);
      router.push("/unidades");
    });
  }

  return (
    <div className="space-y-5">
      {/* Dados básicos */}
      <Card>
        <CardContent className="grid grid-cols-2 gap-3 p-5 sm:grid-cols-4">
          <Field label="Projeto">
            <Select
              value={v.projetoId}
              onChange={(e) => setV({ ...v, projetoId: e.target.value })}
            >
              {projetos.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.nome}
                </option>
              ))}
            </Select>
          </Field>
          <Field label="Tipo de cadastro">
            <Select
              value={v.itemType}
              onChange={(e) =>
                setV({ ...v, itemType: e.target.value as "unidade" | "condominio" })
              }
            >
              <option value="unidade">Unidade</option>
              <option value="condominio">Condomínio</option>
            </Select>
          </Field>
          <Field label="Código">
            <Input value={v.code} onChange={(e) => setV({ ...v, code: e.target.value })} />
          </Field>
          <Field label="Bloco">
            <Input value={v.bloco} onChange={(e) => setV({ ...v, bloco: e.target.value })} />
          </Field>
          <Field label="Tipo">
            <Input value={v.tipo} onChange={(e) => setV({ ...v, tipo: e.target.value })} />
          </Field>
          <Field label="Status">
            <Select
              value={v.status}
              onChange={(e) => setV({ ...v, status: e.target.value as UnitStatus })}
            >
              <option>Disponivel</option>
              <option>Reservado</option>
              <option>Vendido</option>
              <option>Permutado</option>
            </Select>
          </Field>
          <Field label="m²">
            <Input type="number" value={v.m2} onChange={(e) => setV({ ...v, m2: e.target.value })} />
          </Field>
          <Field label="Andar">
            <Input type="number" value={v.andar} onChange={(e) => setV({ ...v, andar: e.target.value })} />
          </Field>
          <Field label="VGV (valor)">
            <Input type="number" value={v.valor} onChange={(e) => setV({ ...v, valor: e.target.value })} />
          </Field>
          <Field label="Data da venda">
            <DateField value={v.mesVenda} onChange={(x) => setV({ ...v, mesVenda: x })} />
          </Field>
        </CardContent>
      </Card>

      {/* Total / saldo ao vivo */}
      <div className="flex flex-wrap items-center gap-3 rounded-[12px] border border-[var(--color-accent2)]/12 bg-white p-4">
        <span className="text-sm text-[var(--color-ink3)]">Total contratado:</span>
        <span className="font-[family-name:var(--font-mono)] font-semibold">{brl0(total)}</span>
        <span className="text-sm text-[var(--color-ink3)]">· Saldo vs VGV:</span>
        <Badge tone={ok ? "success" : "danger"}>{brl0(saldo)}</Badge>
        {v.status !== "Vendido" && (
          <span className="text-xs text-[var(--color-ink4)]">
            (o plano só projeta receita quando a unidade está &quot;Vendido&quot;)
          </span>
        )}
      </div>

      {/* Cascata do plano de pagamento */}
      <div className="space-y-2">
        <SourceGroup
          title="Ato de Assinatura (AS)"
          enabled={plan.usarAS}
          onToggle={(b) => setPlan({ usarAS: b })}
        >
          <Money label="Valor" value={plan.AS.val} onChange={(x) => setSrc("AS", "val", x)} />
          <Dt label="Vencimento" value={plan.AS.venc} onChange={(x) => setSrc("AS", "venc", x)} />
          <Num label="Parcelas" value={plan.AS.n} onChange={(x) => setSrc("AS", "n", x)} />
          <Flag label="Usar Sinal 1" value={plan.AS.usarS1} onChange={(b) => setSrc("AS", "usarS1", b)} />
        </SourceGroup>

        {(["S1", "S2", "S3"] as const).map((k, i) => {
          const nextFlag = (["usarS2", "usarS3", "usarMens"] as const)[i];
          const nextLabel = ["Usar Sinal 2", "Usar Sinal 3", "Usar Mensais"][i];
          const src = plan[k];
          return (
            <SourceGroup key={k} title={`Sinal ${i + 1} (${k})`}>
              <Money label="Valor" value={src.val} onChange={(x) => setSrc(k, "val", x)} />
              <Dt label="Vencimento" value={src.venc} onChange={(x) => setSrc(k, "venc", x)} />
              <Num label="Parcelas" value={src.n} onChange={(x) => setSrc(k, "n", x)} />
              <Flag
                label={nextLabel}
                value={(src as unknown as Record<string, boolean>)[nextFlag]}
                onChange={(b) => setSrc(k, nextFlag, b)}
              />
            </SourceGroup>
          );
        })}

        <SourceGroup title="Mensais">
          <Money label="Valor" value={plan.Mensais.val} onChange={(x) => setSrc("Mensais", "val", x)} />
          <Dt label="1º Vencimento" value={plan.Mensais.venc} onChange={(x) => setSrc("Mensais", "venc", x)} />
          <Num label="Parcelas" value={plan.Mensais.n} onChange={(x) => setSrc("Mensais", "n", x)} />
          <Flag label="Usar Semestrais" value={plan.Mensais.usarSem} onChange={(b) => setSrc("Mensais", "usarSem", b)} />
        </SourceGroup>
        <SourceGroup title="Semestrais">
          <Money label="Valor" value={plan.Semestrais.val} onChange={(x) => setSrc("Semestrais", "val", x)} />
          <Dt label="1º Vencimento" value={plan.Semestrais.venc} onChange={(x) => setSrc("Semestrais", "venc", x)} />
          <Num label="Parcelas" value={plan.Semestrais.n} onChange={(x) => setSrc("Semestrais", "n", x)} />
          <Flag label="Usar Anuais" value={plan.Semestrais.usarAnu} onChange={(b) => setSrc("Semestrais", "usarAnu", b)} />
        </SourceGroup>
        <SourceGroup title="Anuais">
          <Money label="Valor" value={plan.Anuais.val} onChange={(x) => setSrc("Anuais", "val", x)} />
          <Dt label="1º Vencimento" value={plan.Anuais.venc} onChange={(x) => setSrc("Anuais", "venc", x)} />
          <Num label="Parcelas" value={plan.Anuais.n} onChange={(x) => setSrc("Anuais", "n", x)} />
          <Flag label="Usar FGTS" value={plan.Anuais.usarFGTS} onChange={(b) => setSrc("Anuais", "usarFGTS", b)} />
        </SourceGroup>
        <SourceGroup title="FGTS">
          <Money label="Valor" value={plan.FGTS.val} onChange={(x) => setSrc("FGTS", "val", x)} />
          <Dt label="Data prevista" value={plan.FGTS.dataPrev} onChange={(x) => setSrc("FGTS", "dataPrev", x)} />
          <Flag label="Usar Subsídio" value={plan.FGTS.usarSub} onChange={(b) => setSrc("FGTS", "usarSub", b)} />
        </SourceGroup>
        <SourceGroup title="Subsídio">
          <Money label="Valor" value={plan.Subsidio.val} onChange={(x) => setSrc("Subsidio", "val", x)} />
          <Dt label="Data prevista" value={plan.Subsidio.dataPrev} onChange={(x) => setSrc("Subsidio", "dataPrev", x)} />
          <Field label="Status subsídio">
            <Select
              value={plan.Subsidio.statusSub}
              onChange={(e) => setSrc("Subsidio", "statusSub", e.target.value)}
            >
              <option>Aguardando Caixa</option>
              <option>Recebido</option>
            </Select>
          </Field>
          <Flag label="Usar Permuta" value={plan.Subsidio.usarPer} onChange={(b) => setSrc("Subsidio", "usarPer", b)} />
        </SourceGroup>
        <SourceGroup title="Permuta">
          <Txt label="Descrição" value={plan.Permuta.desc} onChange={(x) => setSrc("Permuta", "desc", x)} />
          <Money label="Valor" value={plan.Permuta.val} onChange={(x) => setSrc("Permuta", "val", x)} />
          <Dt label="Data prevista" value={plan.Permuta.dataPrev} onChange={(x) => setSrc("Permuta", "dataPrev", x)} />
          <Flag label="Usar Financiamento" value={plan.Permuta.usarFinanc} onChange={(b) => setSrc("Permuta", "usarFinanc", b)} />
        </SourceGroup>
        <SourceGroup title="Financiamento Bancário">
          <Money label="Valor financiado" value={plan.Banco.valFinanc} onChange={(x) => setSrc("Banco", "valFinanc", x)} />
          <Dt label="Data entrada" value={plan.Banco.dataEntrada} onChange={(x) => setSrc("Banco", "dataEntrada", x)} />
          <Dt label="1ª parcela" value={plan.Banco.dataPrimParc} onChange={(x) => setSrc("Banco", "dataPrimParc", x)} />
          <Txt label="Status" value={plan.Banco.statusFinanc} onChange={(x) => setSrc("Banco", "statusFinanc", x)} />
        </SourceGroup>
      </div>

      {error && <p className="text-sm text-[var(--color-danger)]">{error}</p>}

      <div className="flex items-center gap-3">
        <Button onClick={submit} disabled={pending}>
          {pending ? "Salvando..." : "Salvar unidade"}
        </Button>
        <Button variant="ghost" onClick={() => router.push("/unidades")} disabled={pending}>
          Cancelar
        </Button>
        {v.id && (
          <button
            onClick={remove}
            disabled={pending}
            className="ml-auto text-sm text-[var(--color-danger)] hover:underline disabled:opacity-50"
          >
            Excluir
          </button>
        )}
      </div>
    </div>
  );
}

// ───────────────────────────── subcomponentes ─────────────────────────────

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <Label>{label}</Label>
      {children}
    </div>
  );
}

function Money({ label, value, onChange }: { label: string; value: number; onChange: (v: number) => void }) {
  return (
    <Field label={label}>
      <Input type="number" step="0.01" value={value} onChange={(e) => onChange(n(e.target.value))} />
    </Field>
  );
}
function Num({ label, value, onChange }: { label: string; value: number; onChange: (v: number) => void }) {
  return (
    <Field label={label}>
      <Input type="number" value={value} onChange={(e) => onChange(n(e.target.value))} />
    </Field>
  );
}
function Txt({ label, value, onChange }: { label: string; value: string; onChange: (v: string) => void }) {
  return (
    <Field label={label}>
      <Input value={value} onChange={(e) => onChange(e.target.value)} />
    </Field>
  );
}
function Dt({ label, value, onChange }: { label: string; value: string; onChange: (v: string) => void }) {
  return (
    <Field label={label}>
      <DateField value={value} onChange={onChange} />
    </Field>
  );
}
function Flag({ label, value, onChange }: { label: string; value: boolean; onChange: (v: boolean) => void }) {
  return (
    <label className="mt-5 flex items-center gap-2 text-[13px] text-[var(--color-ink2)]">
      <input type="checkbox" checked={value} onChange={(e) => onChange(e.target.checked)} />
      {label}
    </label>
  );
}

function SourceGroup({
  title,
  enabled,
  onToggle,
  children,
}: {
  title: string;
  enabled?: boolean;
  onToggle?: (b: boolean) => void;
  children: React.ReactNode;
}) {
  return (
    <details className="rounded-[12px] border border-[var(--color-accent2)]/12 bg-white">
      <summary className="flex cursor-pointer items-center gap-2 px-4 py-3 text-sm font-medium text-[var(--color-ink)]">
        {title}
        {onToggle && (
          <label
            className="ml-auto flex items-center gap-1.5 text-xs font-normal text-[var(--color-ink2)]"
            onClick={(e) => e.stopPropagation()}
          >
            <input type="checkbox" checked={!!enabled} onChange={(e) => onToggle(e.target.checked)} />
            ativo
          </label>
        )}
      </summary>
      <div className="grid grid-cols-2 gap-3 border-t border-[var(--color-accent2)]/8 p-4 sm:grid-cols-4">
        {children}
      </div>
    </details>
  );
}
```

### `src/components/app/unit-actions.tsx`

Usado por `/unidades/[id]`.

```tsx
"use client";

import Link from "next/link";
import { useState, useTransition } from "react";
import { deleteUnit } from "@/lib/actions/units";

/**
 * Ações por linha na lista de Unidades: editar (link para o formulário) e
 * excluir (server action com confirmação). Cada ação só aparece conforme a
 * permissão do usuário na tela "unidades".
 */
export function UnitActions({
  id,
  code,
  canEditar,
  canExcluir,
}: {
  id: string;
  code: string;
  canEditar: boolean;
  canExcluir: boolean;
}) {
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);

  const remove = () => {
    if (
      !window.confirm(
        `Excluir a unidade "${code}"? Esta ação não pode ser desfeita.`,
      )
    )
      return;
    setError(null);
    start(async () => {
      try {
        await deleteUnit(id);
      } catch (e) {
        setError(e instanceof Error ? e.message : "Erro ao excluir.");
      }
    });
  };

  if (!canEditar && !canExcluir) return <span className="text-[var(--color-ink4)]">—</span>;

  return (
    <div className="flex items-center justify-end gap-3">
      {canEditar && (
        <Link
          href={`/unidades/${id}`}
          className="text-[var(--color-accent2)] hover:underline"
        >
          Editar
        </Link>
      )}
      {canExcluir && (
        <button
          onClick={remove}
          disabled={pending}
          className="text-[var(--color-danger)] hover:underline disabled:opacity-50"
        >
          {pending ? "Excluindo..." : "Excluir"}
        </button>
      )}
      {error && <span className="text-xs text-[var(--color-danger)]">{error}</span>}
    </div>
  );
}
```

---

## 3. Funções de `src/lib/queries.ts`

| Função | Linhas | Chamada pelas páginas desta coleta? |
|---|---|---|
| `getUnits` | 85–91 | sim — `/unidades` |
| `getUnitWithProject` | 120–132 | sim — `/unidades/[id]` |
| `getAtualVersion` | 924–942 | sim — `/unidades`, `/unidades/nova`, `/unidades/[id]` |
| `getUnitCodesByTenant` | 93–104 | não |
| `getReceivables` | 406–450 | não |

### `src/lib/queries.ts` · linhas 85–91

`getUnits` — Chamada por `/unidades`.

```ts
export async function getUnits(versionId: string): Promise<UnitRow[]> {
  return db
    .select()
    .from(schema.units)
    .where(eq(schema.units.versionId, versionId))
    .orderBy(asc(schema.units.code));
}
```

### `src/lib/queries.ts` · linhas 120–132

`getUnitWithProject` — Chamada por `/unidades/[id]`.

```ts
/** Unidade por id no escopo do tenant, com o projeto da sua versão. */
export async function getUnitWithProject(
  tenantId: string,
  unitId: string,
): Promise<(UnitRow & { projectId: string }) | undefined> {
  const [row] = await db
    .select({ u: schema.units, projectId: schema.versions.projectId })
    .from(schema.units)
    .innerJoin(schema.versions, eq(schema.units.versionId, schema.versions.id))
    .where(and(eq(schema.units.id, unitId), eq(schema.units.tenantId, tenantId)))
    .limit(1);
  return row ? { ...row.u, projectId: row.projectId } : undefined;
}
```

### `src/lib/queries.ts` · linhas 924–942

`getAtualVersion` — Chamada pelas três páginas. Não constava na lista pedida — incluída para a coleta ficar completa.

```ts
/**
 * Versão "Atual" (detalhada) de um projeto, no escopo do tenant. Como não há
 * mais "versão ativa", os lançamentos de despesas/receitas sempre gravam aqui.
 */
export async function getAtualVersion(tenantId: string, projectId: string) {
  const [v] = await db
    .select()
    .from(schema.versions)
    .where(
      and(
        eq(schema.versions.tenantId, tenantId),
        eq(schema.versions.projectId, projectId),
        eq(schema.versions.kind, "atual"),
      ),
    )
    .orderBy(asc(schema.versions.createdAt))
    .limit(1);
  return v ?? null;
}
```

### `src/lib/queries.ts` · linhas 93–104

`getUnitCodesByTenant` — **Não é chamada por estas páginas.** Pedida nominalmente. Quem chama: `/contasreceber`, `/clientes/novo`, `/clientes/[id]`.

```ts
/**
 * Todas as unidades do tenant (versão Atual de cada projeto) — para os cadastros
 * de cliente/contrato listarem unidades de qualquer projeto, não só do ativo.
 */
export async function getUnitCodesByTenant(tenantId: string): Promise<string[]> {
  const rows = await db
    .select({ code: schema.units.code })
    .from(schema.units)
    .where(eq(schema.units.tenantId, tenantId))
    .orderBy(asc(schema.units.code));
  return [...new Set(rows.map((r) => r.code))];
}
```

### `src/lib/queries.ts` · linhas 406–450

`getReceivables` — **Não é chamada por estas páginas.** Pedida nominalmente. Quem chama: `/contasreceber`, `/fechamento`, `api/agent/contas-receber`.

```ts
/**
 * Recebíveis previstos do tenant: expande os planos de pagamento das unidades
 * vendidas (versão Atual de cada obra) em recebíveis datados, com projeto e
 * cliente comprador. Base do painel "Receitas a Receber do Dia".
 */
export async function getReceivables(tenantId: string): Promise<ReceivableRow[]> {
  const rows = await db
    .select({
      u: schema.units,
      projectId: schema.projects.id,
      projectName: schema.projects.name,
      clienteNome: schema.clientes.nomeCompleto,
    })
    .from(schema.units)
    .innerJoin(schema.versions, eq(schema.units.versionId, schema.versions.id))
    .innerJoin(schema.projects, eq(schema.versions.projectId, schema.projects.id))
    .leftJoin(
      schema.clientes,
      and(
        eq(schema.clientes.unitCode, schema.units.code),
        eq(schema.clientes.tenantId, tenantId),
      ),
    )
    .where(and(eq(schema.units.tenantId, tenantId), eq(schema.versions.kind, "atual")));

  const out: ReceivableRow[] = [];
  for (const r of rows) {
    const recs = expandUnitReceivables(r.u.paymentPlan, r.u.status);
    for (let i = 0; i < recs.length; i++) {
      const rec = recs[i];
      out.push({
        refId: `${r.u.id}:${i}`,
        dia: rec.dia,
        valor: rec.valor,
        descricao: `${r.u.code} — ${rec.label}`,
        unitCode: r.u.code,
        projectId: r.projectId,
        projectName: r.projectName,
        clienteNome: r.clienteNome,
        status: "A receber",
      });
    }
  }
  return out;
}
```

---

## 4. `src/lib/actions/units.ts`

### `src/lib/actions/units.ts`

```ts
"use server";

import { and, eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { db, schema } from "@/lib/db";
import { getActiveContext } from "@/lib/context";
import { getAtualVersion } from "@/lib/queries";
import { can } from "@/lib/permissions";
import { logAudit } from "@/lib/audit";
import { emptyPlan } from "@/lib/calc/plan";
import type { PaymentPlan, UnitStatus } from "@/lib/calc/types";

export interface SaveUnitInput {
  id?: string;
  /** projeto ao qual a unidade/venda pertence (grava na versão Atual dele). */
  projectId?: string;
  /** item comercializável: unidade individual ou condomínio inteiro. */
  itemType?: "unidade" | "condominio";
  code: string;
  bloco?: string;
  tipo?: string;
  m2?: number;
  andar?: number;
  valor: number;
  status: UnitStatus;
  mesVenda?: string;
  plan: PaymentPlan;
}

export async function saveUnit(input: SaveUnitInput) {
  const ctx = await getActiveContext();
  if (!ctx || !can(ctx.perms, "unidades", input.id ? "editar" : "criar")) {
    throw new Error("Sem permissão para editar unidades.");
  }
  // Sem "versão ativa": a venda é gravada na versão Atual do projeto escolhido.
  const projectId = input.projectId || ctx.project.id;
  const version = await getAtualVersion(ctx.tenant.id, projectId);
  if (!version) throw new Error("Projeto sem versão Atual.");
  if (version.locked) throw new Error("Versão congelada — edição bloqueada.");

  const values = {
    versionId: version.id,
    tenantId: ctx.tenant.id,
    itemType: input.itemType === "condominio" ? ("condominio" as const) : ("unidade" as const),
    code: input.code.trim() || "SEM CÓDIGO",
    bloco: input.bloco || null,
    tipo: input.tipo || null,
    m2: input.m2 != null ? String(input.m2) : null,
    andar: input.andar ?? null,
    valor: String(input.valor ?? 0),
    status: input.status,
    mesVenda: input.mesVenda || null,
    paymentPlan: input.plan,
    updatedAt: new Date(),
  };

  if (input.id) {
    await db
      .update(schema.units)
      .set(values)
      .where(
        and(
          eq(schema.units.id, input.id),
          eq(schema.units.tenantId, ctx.tenant.id),
        ),
      );
    await logAudit({
      tenantId: ctx.tenant.id,
      userId: ctx.userId,
      action: "unit.update",
      entity: "unit",
      entityId: input.id,
      meta: { code: values.code, status: values.status },
    });
  } else {
    const [row] = await db.insert(schema.units).values(values).returning();
    await logAudit({
      tenantId: ctx.tenant.id,
      userId: ctx.userId,
      action: "unit.create",
      entity: "unit",
      entityId: row.id,
      meta: { code: values.code },
    });
  }

  revalidatePath("/unidades");
  redirect("/unidades");
}

export interface ImportUnitRow {
  code: string;
  bloco?: string;
  tipo?: string;
  m2?: number;
  andar?: number;
  valor?: number;
  status?: UnitStatus;
}

/** Importa unidades em lote (ex.: de uma planilha XLSX). */
export async function importUnits(
  rows: ImportUnitRow[],
  projectId?: string,
): Promise<{ inserted: number }> {
  const ctx = await getActiveContext();
  if (!ctx || !can(ctx.perms, "unidades", "criar")) {
    throw new Error("Sem permissão para importar unidades.");
  }
  const version = await getAtualVersion(ctx.tenant.id, projectId || ctx.project.id);
  if (!version) throw new Error("Projeto sem versão Atual.");
  const valid = rows.filter((r) => r.code && r.code.trim());
  if (valid.length === 0) return { inserted: 0 };

  await db.insert(schema.units).values(
    valid.map((r) => ({
      versionId: version.id,
      tenantId: ctx.tenant.id,
      code: r.code.trim(),
      bloco: r.bloco || null,
      tipo: r.tipo || null,
      m2: r.m2 != null ? String(r.m2) : null,
      andar: r.andar ?? null,
      valor: String(r.valor ?? 0),
      status: r.status ?? "Disponivel",
      paymentPlan: emptyPlan(),
    })),
  );
  await logAudit({
    tenantId: ctx.tenant.id,
    userId: ctx.userId,
    action: "unit.import",
    entity: "unit",
    meta: { count: valid.length },
  });
  revalidatePath("/unidades");
  return { inserted: valid.length };
}

export async function deleteUnit(id: string) {
  const ctx = await getActiveContext();
  if (!ctx || !can(ctx.perms, "unidades", "excluir")) return;
  await db
    .delete(schema.units)
    .where(
      and(eq(schema.units.id, id), eq(schema.units.tenantId, ctx.tenant.id)),
    );
  await logAudit({
    tenantId: ctx.tenant.id,
    userId: ctx.userId,
    action: "unit.delete",
    entity: "unit",
    entityId: id,
  });
  revalidatePath("/unidades");
}
```

---

## 5. Tabela `unit` no schema

### `src/lib/db/schema.ts` · linhas 401–429

```ts
/**
 * Unidade (imóvel) de uma versão. O plano de pagamento em cascata é guardado
 * como JSONB (`payment_plan`) — agregado sempre lido/gravado por inteiro e
 * consumido 1:1 pela lógica de cálculo (src/lib/calc). Ver docs/SPEC.md §3 e §5.
 */
export const units = pgTable("unit", {
  id: uuid("id").primaryKey().defaultRandom(),
  versionId: uuid("version_id")
    .notNull()
    .references(() => versions.id, { onDelete: "cascade" }),
  tenantId: uuid("tenant_id")
    .notNull()
    .references(() => tenants.id, { onDelete: "cascade" }),
  code: text("code").notNull(),
  bloco: text("bloco"),
  tipo: text("tipo"),
  m2: numeric("m2", { precision: 8, scale: 2 }),
  andar: integer("andar"),
  /** VGV da unidade. */
  valor: numeric("valor", { precision: 15, scale: 2 }).notNull().default("0"),
  status: unitStatusEnum("status").notNull().default("Disponivel"),
  /** Item comercializável: unidade individual (default) ou condomínio inteiro. */
  itemType: unitItemTypeEnum("item_type").notNull().default("unidade"),
  /** "MM/DD/YYYY" como no protótipo. */
  mesVenda: text("mes_venda"),
  paymentPlan: jsonb("payment_plan").$type<PaymentPlan>(),
  createdAt: timestamp("created_at", { mode: "date" }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { mode: "date" }).notNull().defaultNow(),
});
```

