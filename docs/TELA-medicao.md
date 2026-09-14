# TELA-medicao — código na íntegra

Coleta do código das duas telas de medição — **Lançamento de Medição**
(`/medicaolanc`) e **Medição de Obra — Relatório CEF** (`/medicao`) — em `main`
(commit `45f4ce3`). Sem resumo, sem análise.

**Árvore de dependências própria (recursiva):**

```
medicaolanc/page.tsx
├── components/app/page-header.tsx
├── components/app/medicao-manager.tsx      (exporta MedicaoTable)
└── components/app/project-picker.tsx

medicao/page.tsx
├── components/app/page-header.tsx          (já listado)
├── components/app/print-button.tsx
└── components/app/date-range-filter.tsx

Nenhum deles importa outro componente próprio. As demais importações são
primitivas de UI (card, button, input, date-field, table) e libs
(calc/constants, utils, context, permissions).

queries chamadas:  getAtualVersion · getChartAccounts · getMedicoes   (/medicaolanc)
                   getBudgetLines  · getMedicoes                      (/medicao)
actions:           addMedicao, updateMedicao, deleteMedicao
                   — as TRÊS únicas de medição no repositório
```

> **Nenhuma das duas telas verifica permissão de "ver".** `/medicaolanc` só
> checa `criar` / `editar` / `excluir` para habilitar controles; `/medicao` não
> chama `can` nenhuma vez. Quem governa as duas é o enforcement central do
> layout, já que `medicaolanc` e `medicao` estão ambos em `SCREENS`.

---

## 1. As duas páginas

### `src/app/(app)/medicaolanc/page.tsx`

```tsx
import { getActiveContext } from "@/lib/context";
import { getAtualVersion, getChartAccounts, getMedicoes } from "@/lib/queries";
import { addMedicao } from "@/lib/actions/medicao";
import { can } from "@/lib/permissions";
import { brl0 } from "@/lib/utils";
import { PageHeader } from "@/components/app/page-header";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input, Label, Select } from "@/components/ui/input";
import { MonthField } from "@/components/ui/date-field";
import { MedicaoTable } from "@/components/app/medicao-manager";
import { ProjectPicker } from "@/components/app/project-picker";

export const dynamic = "force-dynamic";

export default async function MedicaoLancamentoPage({
  searchParams,
}: {
  searchParams: Promise<{ proj?: string }>;
}) {
  const ctx = await getActiveContext();
  if (!ctx) return null;
  const sp = await searchParams;

  // Projetos de obra (kind "proj") — só eles têm medição/CEF.
  const projetos = ctx.projects.filter((p) => p.kind === "proj");
  const selectedProject =
    projetos.find((p) => p.id === sp.proj) ??
    (ctx.project.kind === "proj" ? ctx.project : projetos[0]) ??
    ctx.project;

  // Versão Atual do projeto medido (a medição alimenta o realizado da DRE).
  const atual =
    selectedProject.id === ctx.project.id && ctx.version.kind === "atual"
      ? ctx.version
      : (await getAtualVersion(ctx.tenant.id, selectedProject.id)) ?? ctx.version;

  const [rows, chart] = await Promise.all([
    getMedicoes(atual.id),
    getChartAccounts(ctx.tenant.id),
  ]);

  // Grupos CEF distintos (para o seletor de grupo de obra).
  const grupos = [
    ...new Map(
      chart
        .filter((c) => c.kind === "cef")
        .map((c) => [c.groupCode, { code: c.groupCode, name: c.groupName }]),
    ).values(),
  ].sort((a, b) => a.code.localeCompare(b.code, undefined, { numeric: true }));

  const canCriar = can(ctx.perms, "medicaolanc", "criar");
  const canEditar = can(ctx.perms, "medicaolanc", "editar");
  const canExcluir = can(ctx.perms, "medicaolanc", "excluir");
  const total = rows.reduce((a, r) => a + Number(r.valor), 0);
  const locked = atual.locked;

  return (
    <>
      <PageHeader
        eyebrow={`${selectedProject.name} · ${atual.label}`}
        title="Lançamento de Medição"
        subtitle={`${rows.length} lançamentos · total ${brl0(total)} — alimenta o Custo Variável da DRE`}
        actions={
          projetos.length > 1 ? (
            <ProjectPicker
              projects={projetos.map((p) => ({ id: p.id, label: p.name }))}
              selected={selectedProject.id}
            />
          ) : undefined
        }
      />

      {locked && (
        <p className="mb-4 rounded-[8px] bg-[#fef3c7] px-3 py-2 text-[13px] text-[#92400e]">
          Versão congelada — lançamentos bloqueados.
        </p>
      )}

      {canCriar && !locked && (
        <Card className="mb-6">
          <CardContent className="p-5">
            <form action={addMedicao} className="grid grid-cols-2 gap-3 sm:grid-cols-6">
              <input type="hidden" name="projectId" value={selectedProject.id} />
              <div>
                <Label>Competência</Label>
                <MonthField name="competencia" required />
              </div>
              <div className="sm:col-span-2">
                <Label>Grupo de obra (CEF)</Label>
                <Select name="grupo" defaultValue="">
                  <option value="">Selecione...</option>
                  {grupos.map((g) => (
                    <option key={g.code} value={`${g.code}|${g.name}`}>
                      {g.code} — {g.name}
                    </option>
                  ))}
                </Select>
              </div>
              <div>
                <Label>Valor medido</Label>
                <Input name="valor" type="number" step="0.01" placeholder="0" />
              </div>
              <div className="sm:col-span-4">
                <Label>Observação</Label>
                <Input name="obs" placeholder="" />
              </div>
              <div className="flex items-end sm:col-span-2">
                <Button type="submit" className="w-full">
                  Lançar medição
                </Button>
              </div>
            </form>
          </CardContent>
        </Card>
      )}

      <MedicaoTable
        rows={rows.map((r) => ({
          id: r.id,
          competencia: r.competencia,
          grupoCode: r.grupoCode,
          grupoName: r.grupoName,
          valor: Number(r.valor),
          obs: r.obs ?? "",
        }))}
        canEditar={canEditar && !locked}
        canExcluir={canExcluir && !locked}
      />
    </>
  );
}
```

### `src/app/(app)/medicao/page.tsx`

```tsx
import { getActiveContext } from "@/lib/context";
import { getBudgetLines, getMedicoes } from "@/lib/queries";
import { PLANO_CONTAS, PCT_REF_CEF } from "@/lib/calc/constants";
import { brl0, monthInRange } from "@/lib/utils";
import { PageHeader } from "@/components/app/page-header";
import { PrintButton } from "@/components/app/print-button";
import { DateRangeFilter } from "@/components/app/date-range-filter";
import { Table, THead, TH, TR, TD } from "@/components/ui/table";

export const dynamic = "force-dynamic";

export default async function MedicaoPage({
  searchParams,
}: {
  searchParams: Promise<{ de?: string; ate?: string }>;
}) {
  const ctx = await getActiveContext();
  if (!ctx) return null;

  const sp = await searchParams;
  const de = sp.de ?? "";
  const ate = sp.ate ?? "";
  const hasRange = !!(de || ate);
  const inRange = (mm: string | null) => !hasRange || monthInRange(mm, de, ate);

  // Fontes dos dados:
  //  - Orçado  → lançamento simplificado da versão Budget (despesas por grupo CEF).
  //  - Realizado → lançamento de medição da versão Atual (medições por grupo).
  const budgetV = ctx.versions.find((v) => v.kind === "budget");
  const atualV =
    ctx.versions.find((v) => v.kind === "atual") ??
    ctx.versions.find((v) => v.isDefault) ??
    ctx.version;

  const [budgetLines, medicoes] = await Promise.all([
    budgetV ? getBudgetLines(budgetV.id) : Promise.resolve([]),
    getMedicoes(atualV.id),
  ]);

  // Orçado por grupo de obra (prefixo antes do primeiro ponto do rowKey/CEF).
  // Vem exclusivamente do lançamento do Budget: se o grupo estiver zerado no
  // Budget, o orçado aqui também é zero (sem estimativa de referência).
  const orcadoPorGrupo = new Map<string, number>();
  for (const l of budgetLines) {
    if (l.kind !== "despesa" || !inRange(l.mes)) continue;
    const grp = (l.rowKey ?? "").split(".")[0];
    orcadoPorGrupo.set(grp, (orcadoPorGrupo.get(grp) || 0) + Number(l.valor));
  }

  // Realizado por grupo de obra a partir das medições lançadas (versão Atual).
  const realizadoPorGrupo = new Map<string, number>();
  for (const m of medicoes) {
    if (!inRange(m.competencia)) continue;
    realizadoPorGrupo.set(
      m.grupoCode,
      (realizadoPorGrupo.get(m.grupoCode) || 0) + Number(m.valor),
    );
  }

  const rows = PLANO_CONTAS.obra.map((g, i) => {
    // Orçado estritamente do Budget: grupo sem lançamento no Budget → zero.
    const orcado = orcadoPorGrupo.get(g.id) || 0;
    const realizado = realizadoPorGrupo.get(g.id) || 0;
    const pctFisico = orcado > 0 ? Math.min((realizado / orcado) * 100, 100) : 0;
    return { g, pctRef: PCT_REF_CEF[i], orcado, realizado, pctFisico };
  });
  const totOrc = rows.reduce((a, r) => a + r.orcado, 0);
  const totReal = rows.reduce((a, r) => a + r.realizado, 0);
  const totPct = totOrc > 0 ? (totReal / totOrc) * 100 : 0;

  return (
    <>
      <PageHeader
        eyebrow={`${ctx.project.name} · Orçado ${budgetV?.label ?? "Budget"} · Realizado ${atualV.label}`}
        title="Medição de Obra — Relatório CEF"
        subtitle="Orçado: lançamento do Budget · Realizado: lançamento de medição (versão Atual)"
        actions={
          <div className="flex flex-wrap items-end gap-3">
            <DateRangeFilter de={de} ate={ate} />
            <PrintButton label="Imprimir Relatório" />
          </div>
        }
      />

      <Table>
        <THead>
          <tr>
            <TH>Grupo de Despesa (CEF)</TH>
            <TH className="text-right">% Ref. CEF</TH>
            <TH className="text-right">Orçado</TH>
            <TH className="text-right">Realizado</TH>
            <TH className="text-right">% Físico</TH>
          </tr>
        </THead>
        <tbody>
          {rows.map((r) => (
            <TR key={r.g.id}>
              <TD className="font-medium text-[var(--color-ink)]">
                <span className="font-[family-name:var(--font-mono)] text-[var(--color-accent)]">
                  {r.g.id}
                </span>{" "}
                {r.g.nome}
              </TD>
              <TD className="text-right font-[family-name:var(--font-mono)] text-[var(--color-ink3)]">
                {r.pctRef.toFixed(2)}%
              </TD>
              <TD className="text-right font-[family-name:var(--font-mono)]">
                {r.orcado > 0 ? brl0(r.orcado) : "—"}
              </TD>
              <TD className="text-right font-[family-name:var(--font-mono)]">
                {r.realizado > 0 ? brl0(r.realizado) : "—"}
              </TD>
              <TD className="text-right font-[family-name:var(--font-mono)] font-medium text-[var(--color-ink)]">
                {r.pctFisico.toFixed(1)}%
              </TD>
            </TR>
          ))}
          <TR>
            <TD className="font-semibold text-[var(--color-ink)]">Total</TD>
            <TD className="text-right font-[family-name:var(--font-mono)]">
              100%
            </TD>
            <TD className="text-right font-[family-name:var(--font-mono)] font-semibold">
              {brl0(totOrc)}
            </TD>
            <TD className="text-right font-[family-name:var(--font-mono)] font-semibold">
              {brl0(totReal)}
            </TD>
            <TD className="text-right font-[family-name:var(--font-mono)] font-semibold">
              {totPct.toFixed(1)}%
            </TD>
          </TR>
        </tbody>
      </Table>

      <p className="mt-4 text-xs text-[var(--color-ink3)]">
        <strong>Orçado</strong> importado do lançamento simplificado da versão{" "}
        <strong>Budget</strong> (despesas por grupo do plano de contas).{" "}
        <strong>Realizado</strong> importado do{" "}
        <strong>Lançamento de Medição</strong> da versão <strong>Atual</strong>.
        Use <strong>Imprimir Relatório</strong> para gerar a versão formatada
        (FRE / Cronograma CEF).
      </p>
    </>
  );
}
```

---

## 2. Componentes próprios (recursivo)

### `src/components/app/page-header.tsx`

Importado pelas duas páginas.

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

### `src/components/app/medicao-manager.tsx`

Exporta `MedicaoTable`. Único consumidor de `updateMedicao` e `deleteMedicao`.

```tsx
"use client";

import { useState, useTransition } from "react";
import { deleteMedicao, updateMedicao } from "@/lib/actions/medicao";
import { brl0 } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { MonthField } from "@/components/ui/date-field";
import { Table, THead, TH, TR, TD } from "@/components/ui/table";

export interface MedicaoRowData {
  id: string;
  competencia: string;
  grupoCode: string;
  grupoName: string;
  valor: number;
  obs: string;
}

export function MedicaoTable({
  rows,
  canEditar,
  canExcluir,
}: {
  rows: MedicaoRowData[];
  canEditar: boolean;
  canExcluir: boolean;
}) {
  const showActions = canEditar || canExcluir;
  return (
    <Table>
      <THead>
        <tr>
          <TH>Competência</TH>
          <TH>Grupo de obra</TH>
          <TH className="text-right">Valor medido</TH>
          <TH>Observação</TH>
          {showActions && <TH className="text-right">Ações</TH>}
        </tr>
      </THead>
      <tbody>
        {rows.length === 0 ? (
          <TR>
            <TD colSpan={showActions ? 5 : 4} className="py-8 text-center text-[var(--color-ink4)]">
              Nenhuma medição lançada nesta versão.
            </TD>
          </TR>
        ) : (
          rows.map((r) => (
            <Row key={r.id} row={r} canEditar={canEditar} canExcluir={canExcluir} />
          ))
        )}
      </tbody>
    </Table>
  );
}

function Row({
  row,
  canEditar,
  canExcluir,
}: {
  row: MedicaoRowData;
  canEditar: boolean;
  canExcluir: boolean;
}) {
  const [competencia, setCompetencia] = useState(row.competencia);
  const [valor, setValor] = useState(String(row.valor));
  const [obs, setObs] = useState(row.obs);
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);

  const dirty =
    competencia !== row.competencia ||
    Number(valor) !== row.valor ||
    obs !== row.obs;

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

  if (!canEditar && !canExcluir) {
    return (
      <TR>
        <TD className="font-[family-name:var(--font-mono)]">{row.competencia}</TD>
        <TD>
          <span className="font-[family-name:var(--font-mono)] text-[var(--color-accent)]">
            {row.grupoCode}
          </span>{" "}
          {row.grupoName}
        </TD>
        <TD className="text-right font-[family-name:var(--font-mono)]">{brl0(row.valor)}</TD>
        <TD>{row.obs || "—"}</TD>
      </TR>
    );
  }

  return (
    <TR>
      <TD>
        <MonthField
          value={competencia}
          onChange={setCompetencia}
          disabled={!canEditar || pending}
          className="h-8 w-32 text-xs"
        />
      </TD>
      <TD>
        <span className="font-[family-name:var(--font-mono)] text-[var(--color-accent)]">
          {row.grupoCode}
        </span>{" "}
        {row.grupoName}
      </TD>
      <TD className="text-right">
        <Input
          type="number"
          step="0.01"
          value={valor}
          onChange={(e) => setValor(e.target.value)}
          disabled={!canEditar || pending}
          className="h-8 w-32 text-right font-[family-name:var(--font-mono)] text-xs"
        />
      </TD>
      <TD>
        <Input
          value={obs}
          onChange={(e) => setObs(e.target.value)}
          disabled={!canEditar || pending}
          className="h-8 text-xs"
        />
        {error && <div className="text-xs text-[var(--color-danger)]">{error}</div>}
      </TD>
      <TD className="text-right">
        <div className="flex items-center justify-end gap-2">
          {canEditar && (
            <Button
              size="sm"
              variant="outline"
              disabled={pending || !dirty}
              onClick={() => run(() => updateMedicao(row.id, { competencia, valor, obs }))}
            >
              Salvar
            </Button>
          )}
          {canExcluir && (
            <button
              disabled={pending}
              onClick={() => run(() => deleteMedicao(row.id))}
              className="text-sm text-[var(--color-danger)] hover:underline disabled:opacity-50"
            >
              Excluir
            </button>
          )}
        </div>
      </TD>
    </TR>
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

### `src/components/app/print-button.tsx`

```tsx
"use client";

import { Button } from "@/components/ui/button";

export function PrintButton({ label = "Imprimir" }: { label?: string }) {
  return (
    <Button variant="outline" onClick={() => window.print()}>
      {label}
    </Button>
  );
}
```

### `src/components/app/date-range-filter.tsx`

```tsx
"use client";

import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useState, useTransition } from "react";
import { DateField } from "@/components/ui/date-field";
import { Button } from "@/components/ui/button";
import { dateBR } from "@/lib/utils";

/**
 * Filtro de período (Data inicial / Data final) padrão para todos os reports
 * (exceto DRE). Persiste em `de`/`ate` na URL (formato interno MM/DD/YYYY),
 * preservando os demais parâmetros da tela.
 *
 * O período escolhido NÃO é aplicado automaticamente: o usuário ajusta as datas
 * e confirma numa janela ("Confirmar período"); só após a confirmação o
 * dashboard é recarregado com o intervalo selecionado.
 */
export function DateRangeFilter({ de, ate }: { de: string; ate: string }) {
  const router = useRouter();
  const pathname = usePathname();
  const sp = useSearchParams();
  const [pending, start] = useTransition();

  // Rascunho local: só vira filtro aplicado após confirmação.
  const [localDe, setLocalDe] = useState(de);
  const [localAte, setLocalAte] = useState(ate);
  const [confirming, setConfirming] = useState(false);

  const dirty = localDe !== de || localAte !== ate;

  const apply = (nd: string, na: string) => {
    const params = new URLSearchParams(sp.toString());
    if (nd) params.set("de", nd);
    else params.delete("de");
    if (na) params.set("ate", na);
    else params.delete("ate");
    start(() => router.push(`${pathname}?${params.toString()}`));
  };

  const confirmar = () => {
    setConfirming(false);
    apply(localDe, localAte);
  };

  const limpar = () => {
    setLocalDe("");
    setLocalAte("");
    apply("", "");
  };

  return (
    <div className="flex flex-wrap items-end gap-2">
      <div>
        <label className="mb-1 block font-[family-name:var(--font-mono)] text-[10px] uppercase tracking-wide text-[var(--color-ink3)]">
          Data inicial
        </label>
        <DateField value={localDe} onChange={setLocalDe} className="h-9 w-40" />
      </div>
      <div>
        <label className="mb-1 block font-[family-name:var(--font-mono)] text-[10px] uppercase tracking-wide text-[var(--color-ink3)]">
          Data final
        </label>
        <DateField value={localAte} onChange={setLocalAte} className="h-9 w-40" />
      </div>

      <Button
        size="sm"
        disabled={pending || !dirty}
        onClick={() => setConfirming(true)}
      >
        Confirmar período
      </Button>

      {(de || ate || localDe || localAte) && (
        <Button variant="ghost" size="sm" disabled={pending} onClick={limpar}>
          Limpar período
        </Button>
      )}

      {confirming && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4"
          role="dialog"
          aria-modal="true"
          onClick={() => setConfirming(false)}
        >
          <div
            className="w-full max-w-sm rounded-[12px] bg-white p-5 shadow-xl"
            onClick={(e) => e.stopPropagation()}
          >
            <h3 className="text-sm font-semibold text-[var(--color-ink)]">
              Confirmar período
            </h3>
            <p className="mt-2 text-[13px] text-[var(--color-ink2)]">
              O dashboard será atualizado com o intervalo:
            </p>
            <p className="mt-2 font-[family-name:var(--font-mono)] text-[13px] text-[var(--color-ink)]">
              {localDe ? dateBR(localDe) : "início"} — {localAte ? dateBR(localAte) : "fim"}
            </p>
            <div className="mt-5 flex justify-end gap-2">
              <Button variant="ghost" size="sm" onClick={() => setConfirming(false)}>
                Cancelar
              </Button>
              <Button size="sm" disabled={pending} onClick={confirmar}>
                Confirmar
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
```

---

## 3. Funções de `queries.ts` chamadas

### `src/lib/queries.ts` · linhas 1090–1098

`MedicaoRow` e `getMedicoes` — **a única consulta do repositório que lê a tabela `medicao`**. Filtra por `version_id` (não por tenant) e ordena por competência e grupo.

```ts
export type MedicaoRow = typeof schema.medicoes.$inferSelect;

export async function getMedicoes(versionId: string): Promise<MedicaoRow[]> {
  return db
    .select()
    .from(schema.medicoes)
    .where(eq(schema.medicoes.versionId, versionId))
    .orderBy(asc(schema.medicoes.competencia), asc(schema.medicoes.grupoCode));
}
```

### `src/lib/queries.ts` · linhas 924–942

`getAtualVersion` — usada por `/medicaolanc` e por `addMedicao`.

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

### `src/lib/queries.ts` · linhas 229–236

`getChartAccounts` — de onde saem os grupos CEF do seletor.

```ts
export async function getChartAccounts(
  tenantId: string,
): Promise<ChartAccountRow[]> {
  return db
    .select()
    .from(schema.chartAccounts)
    .where(eq(schema.chartAccounts.tenantId, tenantId));
}
```

### `src/lib/queries.ts` · linhas 725–731

`getBudgetLines` — a fonte do "Orçado" em `/medicao`.

```ts
/** Lançamentos simplificados (Budget/Forecast) de uma versão. */
export async function getBudgetLines(versionId: string): Promise<BudgetLineRow[]> {
  return db
    .select()
    .from(schema.budgetLines)
    .where(eq(schema.budgetLines.versionId, versionId));
}
```

---

## 4. As Server Actions de medição


São três, todas em `src/lib/actions/medicao.ts`. Não existe nenhuma outra
action de medição no repositório — em particular, **não existe action alguma
que grave `medicao_servico` ou `servico`** (ver seção 7).

### `src/lib/actions/medicao.ts`

```ts
"use server";

import { and, eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { db, schema } from "@/lib/db";
import { getActiveContext } from "@/lib/context";
import { getAtualVersion } from "@/lib/queries";
import { can } from "@/lib/permissions";
import { logAudit } from "@/lib/audit";

/**
 * Lançamentos de medição de obra (engenheiro), por competência e grupo CEF.
 * A soma alimenta o Custo Variável da DRE.
 */

export async function addMedicao(formData: FormData) {
  const ctx = await getActiveContext();
  if (!ctx || !can(ctx.perms, "medicaolanc", "criar")) {
    throw new Error("Sem permissão para lançar medições.");
  }
  // Projeto sendo medido: resolve a versão Atual dele. Sem projeto explícito,
  // usa a versão do contexto (compatibilidade).
  const projectId = ((formData.get("projectId") as string) || "").trim();
  let versionId = ctx.version.id;
  let locked = ctx.version.locked;
  if (projectId && projectId !== ctx.project.id) {
    const v = await getAtualVersion(ctx.tenant.id, projectId);
    if (!v) throw new Error("Projeto selecionado não possui versão Atual.");
    versionId = v.id;
    locked = v.locked;
  }
  if (locked) throw new Error("Versão congelada — lançamentos bloqueados.");
  const competencia = ((formData.get("competencia") as string) || "").trim();
  const grupo = ((formData.get("grupo") as string) || "").trim();
  const valor = (formData.get("valor") as string) || "0";
  if (!competencia) throw new Error("Informe a competência (MM/YYYY).");
  if (!grupo) throw new Error("Selecione o grupo de obra.");
  // "grupoCode|grupoName" vem do select para preservar o nome do grupo.
  const [grupoCode, ...rest] = grupo.split("|");
  const grupoName = rest.join("|") || grupoCode;

  await db.insert(schema.medicoes).values({
    versionId,
    tenantId: ctx.tenant.id,
    competencia,
    grupoCode: grupoCode.trim(),
    grupoName: grupoName.trim(),
    valor,
    obs: (formData.get("obs") as string) || null,
  });
  await logAudit({
    tenantId: ctx.tenant.id,
    userId: ctx.userId,
    action: "medicao.create",
    entity: "medicao",
    meta: { competencia, grupoCode: grupoCode.trim(), valor, projectId: projectId || ctx.project.id },
  });
  revalidatePath("/medicaolanc");
  revalidatePath("/dre");
}

export async function updateMedicao(
  id: string,
  patch: { competencia?: string; valor?: string; obs?: string },
) {
  const ctx = await getActiveContext();
  if (!ctx || !can(ctx.perms, "medicaolanc", "editar")) return;
  const set: { competencia?: string; valor?: string; obs?: string | null } = {};
  if (patch.competencia && patch.competencia.trim()) set.competencia = patch.competencia.trim();
  if (patch.valor !== undefined) set.valor = patch.valor || "0";
  if (patch.obs !== undefined) set.obs = patch.obs || null;
  if (Object.keys(set).length === 0) return;
  await db
    .update(schema.medicoes)
    .set(set)
    .where(
      and(eq(schema.medicoes.id, id), eq(schema.medicoes.tenantId, ctx.tenant.id)),
    );
  await logAudit({
    tenantId: ctx.tenant.id,
    userId: ctx.userId,
    action: "medicao.update",
    entity: "medicao",
    entityId: id,
    meta: set,
  });
  revalidatePath("/medicaolanc");
  revalidatePath("/dre");
}

export async function deleteMedicao(id: string) {
  const ctx = await getActiveContext();
  if (!ctx || !can(ctx.perms, "medicaolanc", "excluir")) return;
  await db
    .delete(schema.medicoes)
    .where(
      and(eq(schema.medicoes.id, id), eq(schema.medicoes.tenantId, ctx.tenant.id)),
    );
  await logAudit({
    tenantId: ctx.tenant.id,
    userId: ctx.userId,
    action: "medicao.delete",
    entity: "medicao",
    entityId: id,
  });
  revalidatePath("/medicaolanc");
  revalidatePath("/dre");
}
```

---

## 5. As três tabelas no schema


Observação de leitura: o comentário das linhas 1073–1076 documenta `medicao`,
mas está posicionado **imediatamente acima do comentário de `servico`** — a
declaração de `medicoes` está 54 linhas abaixo, na 1130, sem docstring
própria. Incluo o trecho como está no arquivo.

### `src/lib/db/schema.ts` · linhas 1073–1104

O comentário órfão de `medicao` (1073–1076), o comentário de `servico` (1077–1085) e a tabela `servico`.

```ts
/**
 * Medição de obra lançada pelo engenheiro, por competência (MM/YYYY) e grupo
 * de obra (CEF). A soma das medições alimenta o Custo Variável da DRE.
 */
/**
 * Catálogo de SERVIÇOS do projeto (orçamento de obra). Cada serviço tem um
 * custo proposto; a incidência é derivada (custo ÷ custo total dos serviços) e
 * os limites mínimo/máximo permitem sinalizar quando a incidência está fora da
 * faixa aceitável. Ver docs/BDI-PROVISIONAMENTO.md §2.
 *
 * Tabela NOVA e independente: não altera nem substitui `medicao`, que continua
 * válida e em uso (Custo Variável da DRE).
 */
export const servicos = pgTable("servico", {
  id: uuid("id").primaryKey().defaultRandom(),
  tenantId: uuid("tenant_id")
    .notNull()
    .references(() => tenants.id, { onDelete: "cascade" }),
  projectId: uuid("project_id")
    .notNull()
    .references(() => projects.id, { onDelete: "cascade" }),
  /** ordem de exibição (1..N), como na planilha de referência. */
  ordem: integer("ordem").notNull().default(0),
  nome: text("nome").notNull(),
  custoProposto: numeric("custo_proposto", { precision: 15, scale: 2 })
    .notNull()
    .default("0"),
  /** faixa aceitável de incidência (%), opcional. */
  limiteMin: numeric("limite_min", { precision: 8, scale: 4 }),
  limiteMax: numeric("limite_max", { precision: 8, scale: 4 }),
  createdAt: timestamp("created_at", { mode: "date" }).notNull().defaultNow(),
});
```

### `src/lib/db/schema.ts` · linhas 1106–1128

`medicao_servico`.

```ts
/**
 * Medição de um serviço numa competência: o usuário informa APENAS o percentual
 * EXECUTADO ACUMULADO do serviço ao final do mês. A variação mensal e o valor
 * medido são derivados pelo sistema (nunca digitados) — ver
 * docs/BDI-PROVISIONAMENTO.md §4.
 */
export const medicaoServicos = pgTable("medicao_servico", {
  id: uuid("id").primaryKey().defaultRandom(),
  tenantId: uuid("tenant_id")
    .notNull()
    .references(() => tenants.id, { onDelete: "cascade" }),
  servicoId: uuid("servico_id")
    .notNull()
    .references(() => servicos.id, { onDelete: "cascade" }),
  /** "MM/YYYY". */
  competencia: text("competencia").notNull(),
  /** % executado ACUMULADO do serviço até o fim desta competência (0..100). */
  pctExecutadoAcum: numeric("pct_executado_acum", { precision: 8, scale: 4 })
    .notNull()
    .default("0"),
  obs: text("obs"),
  createdAt: timestamp("created_at", { mode: "date" }).notNull().defaultNow(),
});
```

### `src/lib/db/schema.ts` · linhas 1130–1146

`medicao` — sem comentário imediatamente acima.

```ts
export const medicoes = pgTable("medicao", {
  id: uuid("id").primaryKey().defaultRandom(),
  versionId: uuid("version_id")
    .notNull()
    .references(() => versions.id, { onDelete: "cascade" }),
  tenantId: uuid("tenant_id")
    .notNull()
    .references(() => tenants.id, { onDelete: "cascade" }),
  /** "MM/YYYY". */
  competencia: text("competencia").notNull(),
  /** código do grupo CEF (ex.: "1", "3"). */
  grupoCode: text("grupo_code").notNull(),
  grupoName: text("grupo_name").notNull(),
  valor: numeric("valor", { precision: 15, scale: 2 }).notNull().default("0"),
  obs: text("obs"),
  createdAt: timestamp("created_at", { mode: "date" }).notNull().defaultNow(),
});
```

---

## 6. Todo ponto que lê a tabela `medicao`


A tabela é tocada em **exatamente cinco lugares** do código de aplicação, e só
**um** deles é leitura.

| # | Arquivo:linha | Operação | O que faz com o valor |
|---|---|---|---|
| 1 | `src/lib/queries.ts:1092–1098` | **SELECT** | `getMedicoes(versionId)` — devolve as linhas cruas, sem somar nem transformar |
| 2 | `src/lib/actions/medicao.ts:42` | INSERT | grava a linha nova |
| 3 | `src/lib/actions/medicao.ts:74–78` | UPDATE | altera competência / valor / obs |
| 4 | `src/lib/actions/medicao.ts:95–98` | DELETE | remove a linha (exclusão física) |
| 5 | `src/lib/queries.ts:1090` | — | só o tipo `MedicaoRow` |

`getMedicoes` é importada em **dois** arquivos, e em nenhum outro:

| Arquivo:linha | O que faz com `Number(m.valor)` |
|---|---|
| `medicaolanc/page.tsx:39` | soma tudo (`total`, linha 55) só para o subtítulo, e passa as linhas para `MedicaoTable`, que exibe e edita |
| `medicao/page.tsx:37` | agrupa por `grupoCode` em `realizadoPorGrupo` (52–58), filtrando por competência; vira a coluna **Realizado** e o divisor do **% Físico** |

### 6.1 A DRE NÃO lê `medicao`

Verificado por três caminhos independentes:

- `grep -i medic` em `src/app/(app)/dre/page.tsx` → **zero ocorrências**;
- `grep -i medic` em `src/lib/calc/*.ts` → só `medicao-bdi.ts` (que lê
  `medicao_servico`, não `medicao`) e `"Medicina do trabalho"` em
  `constants.ts:225`;
- `getMedicoes` não é importada por `dre/page.tsx` nem por nenhum módulo de
  `calc/`.

Não há SQL cru no projeto (`db.execute` / `` sql` `` não aparecem em
`queries.ts`, em `calc/` nem no `dre/page.tsx`), então não há caminho
alternativo de leitura.

Isso contrasta com três afirmações do próprio código, que registro como
estão:

| Onde | O que diz |
|---|---|
| `medicaolanc/page.tsx:63` | subtítulo da tela: *"alimenta o Custo Variável da DRE"* |
| `actions/medicao.ts:13` | docstring: *"A soma alimenta o Custo Variável da DRE."* |
| `schema.ts:1075` | docstring: *"A soma das medições alimenta o Custo Variável da DRE."* |

E as três actions chamam `revalidatePath("/dre")`
(`medicao.ts:59`, `:88`, `:107`) — invalidam o cache de uma tela que não lê
a tabela.

### `src/lib/queries.ts` · linhas 1090–1098

A única leitura, repetida aqui para referência.

```ts
export type MedicaoRow = typeof schema.medicoes.$inferSelect;

export async function getMedicoes(versionId: string): Promise<MedicaoRow[]> {
  return db
    .select()
    .from(schema.medicoes)
    .where(eq(schema.medicoes.versionId, versionId))
    .orderBy(asc(schema.medicoes.competencia), asc(schema.medicoes.grupoCode));
}
```

### `src/app/(app)/medicao/page.tsx` · linhas 50–69

O que `/medicao` faz com os valores lidos.

```tsx
  // Realizado por grupo de obra a partir das medições lançadas (versão Atual).
  const realizadoPorGrupo = new Map<string, number>();
  for (const m of medicoes) {
    if (!inRange(m.competencia)) continue;
    realizadoPorGrupo.set(
      m.grupoCode,
      (realizadoPorGrupo.get(m.grupoCode) || 0) + Number(m.valor),
    );
  }

  const rows = PLANO_CONTAS.obra.map((g, i) => {
    // Orçado estritamente do Budget: grupo sem lançamento no Budget → zero.
    const orcado = orcadoPorGrupo.get(g.id) || 0;
    const realizado = realizadoPorGrupo.get(g.id) || 0;
    const pctFisico = orcado > 0 ? Math.min((realizado / orcado) * 100, 100) : 0;
    return { g, pctRef: PCT_REF_CEF[i], orcado, realizado, pctFisico };
  });
  const totOrc = rows.reduce((a, r) => a + r.orcado, 0);
  const totReal = rows.reduce((a, r) => a + r.realizado, 0);
  const totPct = totOrc > 0 ? (totReal / totOrc) * 100 : 0;
```

### `src/app/(app)/medicaolanc/page.tsx` · linhas 38–56

O que `/medicaolanc` faz com eles.

```tsx
  const [rows, chart] = await Promise.all([
    getMedicoes(atual.id),
    getChartAccounts(ctx.tenant.id),
  ]);

  // Grupos CEF distintos (para o seletor de grupo de obra).
  const grupos = [
    ...new Map(
      chart
        .filter((c) => c.kind === "cef")
        .map((c) => [c.groupCode, { code: c.groupCode, name: c.groupName }]),
    ).values(),
  ].sort((a, b) => a.code.localeCompare(b.code, undefined, { numeric: true }));

  const canCriar = can(ctx.perms, "medicaolanc", "criar");
  const canEditar = can(ctx.perms, "medicaolanc", "editar");
  const canExcluir = can(ctx.perms, "medicaolanc", "excluir");
  const total = rows.reduce((a, r) => a + Number(r.valor), 0);
  const locked = atual.locked;
```

---

## 7. `medicao` × `medicao_servico`: quem grava, quem lê


São duas tabelas **independentes**, de gerações diferentes, que não se
conversam. O próprio schema diz isso (`schema.ts:1083–1084`): *"Tabela NOVA e
independente: não altera nem substitui `medicao`, que continua válida e em uso
(Custo Variável da DRE)."*

| | `medicao` | `medicao_servico` |
|---|---|---|
| Migração | anterior à 0033 | `0033_medicao_servicos_bdi.sql` |
| Granularidade | **grupo CEF** ("1", "3"…) por competência | **serviço** por competência |
| O que o usuário informa | um **valor em R$** medido | um **% executado acumulado** (0..100) |
| Chave de escopo | `version_id` (+ `tenant_id`) | `tenant_id` + `servico_id` → `project_id` |
| Vinculada a versão? | **sim** — cada versão tem as suas | **não** — é do projeto, atravessa versões |
| Quem GRAVA | `addMedicao` / `updateMedicao` / `deleteMedicao` (`actions/medicao.ts`) | **ninguém** |
| Quem LÊ | `getMedicoes` (`queries.ts:1092`) → `/medicaolanc` e `/medicao` | `getIndicadoresObra` (`queries.ts:1903–1909`) → Dashboard |
| Chega à DRE? | não | não |

### 7.1 Ninguém grava `medicao_servico` nem `servico`

Busca por `medicao_servico` / `medicaoServicos` em todo o repositório
(`.ts`, `.tsx`, `.sql`, `.mjs`, fora de `node_modules`) devolve:

```
src/lib/queries.ts:1907                          .from(schema.medicaoServicos)     ← leitura
src/lib/queries.ts:1908                          .where(...medicaoServicos.tenantId...) ← leitura
src/lib/db/schema.ts:1112                        definição
src/lib/db/migrations/0033_medicao_servicos_bdi.sql       CREATE TABLE
src/lib/db/migrations/down/0033_medicao_servicos_bdi.sql  DROP TABLE
```

`schema.servicos` tem o mesmo perfil: uma única leitura
(`queries.ts:1898–1900`), zero `insert`, `update` ou `delete` em todo o
repositório — inclusive em `scripts/`.

Não há tela, formulário, action, seed nem script que crie um serviço ou lance
um percentual. Na prática, `servicoRows` volta vazio, `medRows` nem chega a
ser consultada (o `if` da linha 1904 curto-circuita), `evolucao` é `[]` e
`temMedicao` (`queries.ts:1977`) é `false` — a menos que as linhas sejam
inseridas direto no banco.

### `src/lib/queries.ts` · linhas 1885–1909

`getIndicadoresObra` — o trecho que lê `servico` e `medicao_servico`.

```ts
export async function getIndicadoresObra(
  tenantId: string,
  projectId: string,
): Promise<IndicadoresObra> {
  const [proj] = await db
    .select()
    .from(schema.projects)
    .where(and(eq(schema.projects.id, projectId), eq(schema.projects.tenantId, tenantId)))
    .limit(1);

  const servicoRows = proj
    ? await db
        .select()
        .from(schema.servicos)
        .where(eq(schema.servicos.projectId, projectId))
        .orderBy(asc(schema.servicos.ordem))
    : [];
  const servicoIds = servicoRows.map((s) => s.id);
  const medRows =
    servicoIds.length > 0
      ? await db
          .select()
          .from(schema.medicaoServicos)
          .where(eq(schema.medicaoServicos.tenantId, tenantId))
      : [];
```

### `src/lib/queries.ts` · linhas 1932–1949

O que ela faz com as linhas lidas: monta `medicoes` e chama `calcEvolucao`.

```ts
  const medicoes = medRows
    .filter((m) => servicoIds.includes(m.servicoId))
    .map((m) => ({
      servicoId: m.servicoId,
      competencia: m.competencia,
      pctExecutadoAcum: num(m.pctExecutadoAcum),
    }));
  const evolucao = calcEvolucao(servicos, medicoes);
  const provis = calcProvisionamento(evolucao, {
    financiamentoConstrucao,
    financiamentoTerreno,
    custoReferencial: custoRef,
    parcelaReferencia,
    pctTaxa,
  });
  const ultimo = provis[provis.length - 1];
  const ultimaEvol = evolucao[evolucao.length - 1];
```

### `src/lib/queries.ts` · linhas 1968–1979

Os campos de evolução que a função devolve, e o `temMedicao`.

```ts
    evolucaoAcumulada: ultimaEvol?.acumulado ?? 0,
    evolucaoMes: ultimaEvol?.variacao ?? 0,
    liberacaoMes: ultimo?.liberacao ?? 0,
    liberacaoAcumulada: ultimo?.liberacaoAcumulada ?? financiamentoTerreno,
    saldoFinanciamento:
      ultimo?.saldoFinanciamento ?? financiamentoConstrucao,
    custoEstimadoMes: ultimo?.custoEstimado ?? 0,
    geracaoCaixaMes: ultimo?.caixa ?? 0,
    pctRecebido: ultimo?.pctRecebido ?? 0,
    temMedicao: evolucao.length > 0,
    temParametros: financiamentoConstrucao > 0 || cub > 0 || pctBdi > 0,
  };
```

---

## 8. De onde vem o percentual de evolução de obra


Há **dois** percentuais de obra na interface, de origens diferentes. Nenhum
dos dois sai da tabela `medicao_servico` **e** da `medicao` ao mesmo tempo.

### 8.1 `/medicao` — coluna "% Físico"

Vem de `medicao`, mas **não é um percentual físico declarado**: é a razão
financeira `realizado ÷ orçado`, com teto em 100 (`medicao/page.tsx:64`):

```ts
const pctFisico = orcado > 0 ? Math.min((realizado / orcado) * 100, 100) : 0;
```

- `realizado` = soma de `medicao.valor` do grupo, da versão **Atual**;
- `orcado` = soma de `budget_line.valor` do mesmo grupo, da versão **Budget**,
  só linhas com `kind === "despesa"`;
- grupo sem lançamento no Budget → `orcado = 0` → `pctFisico = 0`, **mesmo
  havendo medição lançada** (o `orcado > 0 ?` da linha 64).

A coluna vizinha, **% Ref. CEF**, não vem do banco: é a constante
`PCT_REF_CEF` (`calc/constants.ts:313`), indexada pela posição do grupo em
`PLANO_CONTAS.obra`.

O **Total** (linha 69) usa `totReal / totOrc` sem o `Math.min` — o total pode
passar de 100%, enquanto nenhuma linha individual pode.

### 8.2 Dashboard — "Evolução física acumulada" e "Evolução do mês"

Vêm de `medicao_servico`, **não** de `medicao`. O caminho completo:

```
servico + medicao_servico
  → getIndicadoresObra            queries.ts:1885
     → calcIncidencias            calc/medicao-bdi.ts
     → calcEvolucao               calc/medicao-bdi.ts:120
  → IndicadoresObra.evolucaoAcumulada / .evolucaoMes   queries.ts:1968–1969
  → IndicadoresObraPanel          components/app/indicadores-obra.tsx:109–118
  → dashboard/page.tsx:248
```

A conta é física de verdade: `incidência do serviço × % executado do serviço`,
somado sobre os serviços; a variação do mês é a diferença de acumulados. O
`%` executado é *carregado* para os meses seguintes enquanto não houver nova
medição, de modo que o acumulado nunca regride por falta de lançamento.

Como nada grava `medicao_servico`, `temMedicao` é `false` e os dois KPIs
exibem `"—"`, com um `Badge tone="warning"` escrito **"sem medição lançada"**
ao lado do título (`indicadores-obra.tsx:104–106`) — inclusive quando há
medições lançadas em `/medicaolanc`, porque são tabelas distintas.

Para o Dashboard consolidado, `getIndicadoresObraConsolidado`
(`queries.ts:1992`) **não soma percentuais**: pondera a evolução física pelo
custo total dos serviços de cada obra.

### `src/app/(app)/medicao/page.tsx` · linhas 60–69

O cálculo do "% Físico" em `/medicao`.

```tsx
  const rows = PLANO_CONTAS.obra.map((g, i) => {
    // Orçado estritamente do Budget: grupo sem lançamento no Budget → zero.
    const orcado = orcadoPorGrupo.get(g.id) || 0;
    const realizado = realizadoPorGrupo.get(g.id) || 0;
    const pctFisico = orcado > 0 ? Math.min((realizado / orcado) * 100, 100) : 0;
    return { g, pctRef: PCT_REF_CEF[i], orcado, realizado, pctFisico };
  });
  const totOrc = rows.reduce((a, r) => a + r.orcado, 0);
  const totReal = rows.reduce((a, r) => a + r.realizado, 0);
  const totPct = totOrc > 0 ? (totReal / totOrc) * 100 : 0;
```

### `src/lib/calc/medicao-bdi.ts` · linhas 101–146

`EvolucaoMes` e `calcEvolucao` — a evolução física de verdade.

```ts
export interface EvolucaoMes {
  competencia: string;
  /** execução acumulada da OBRA (%) ao fim do mês. */
  acumulado: number;
  /** variação do mês = acumulado atual − acumulado anterior. */
  variacao: number;
}

/**
 * Evolução física da obra mês a mês.
 *
 *   execução acumulada do serviço = incidência × %executado do serviço
 *   acumulado da obra             = Σ execuções acumuladas dos serviços
 *   variação mensal               = acumulado atual − acumulado anterior
 *
 * O %executado de um serviço é "carregado" para os meses seguintes enquanto não
 * houver nova medição — o acumulado nunca regride sozinho por falta de
 * lançamento no mês.
 */
export function calcEvolucao(
  servicos: ServicoOrcado[],
  medicoes: MedicaoServicoInput[],
): EvolucaoMes[] {
  const incid = new Map(calcIncidencias(servicos).map((s) => [s.id, s.incidencia]));
  const competencias = sortCompetencias([
    ...new Set(medicoes.map((m) => m.competencia)),
  ]);

  // Último % executado conhecido de cada serviço (carregado mês a mês).
  const ultimoPct = new Map<string, number>();
  const out: EvolucaoMes[] = [];
  let anterior = 0;

  for (const comp of competencias) {
    for (const m of medicoes.filter((x) => x.competencia === comp)) {
      ultimoPct.set(m.servicoId, Number(m.pctExecutadoAcum) || 0);
    }
    let acumulado = 0;
    for (const [servicoId, pct] of ultimoPct) {
      acumulado += ((incid.get(servicoId) ?? 0) * pct) / 100;
    }
    out.push({ competencia: comp, acumulado, variacao: acumulado - anterior });
    anterior = acumulado;
  }
  return out;
}
```

### `src/components/app/indicadores-obra.tsx` · linhas 100–128

Os KPIs no painel do Dashboard.

```tsx
      {/* Evolução física e liberação */}
      <div>
        <h2 className="mb-2 flex items-center gap-2 text-sm font-semibold text-[var(--color-ink)]">
          Evolução da obra e liberação
          {!ind.temMedicao && (
            <Badge tone="warning">sem medição lançada</Badge>
          )}
        </h2>
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <KPI
            label="Evolução física acumulada"
            value={ind.temMedicao ? pct(ind.evolucaoAcumulada) : "—"}
            tone={ind.temMedicao ? "good" : "muted"}
          />
          <KPI
            label="Evolução do mês"
            value={ind.temMedicao ? pct(ind.evolucaoMes) : "—"}
            tone={ind.temMedicao ? "normal" : "muted"}
          />
          <KPI
            label="Liberação do mês"
            value={ind.temMedicao ? brl0(ind.liberacaoMes) : "—"}
            tone={ind.temMedicao ? "normal" : "muted"}
          />
          <KPI
            label="Liberação acumulada"
            value={brl0(ind.liberacaoAcumulada)}
            hint={`${pct(ind.pctRecebido * 100)} do financiado`}
          />
```
