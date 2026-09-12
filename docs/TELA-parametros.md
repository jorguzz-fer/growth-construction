# TELA-parametros — código na íntegra

Coleta do código da tela **Parâmetros / INCC** (`/parametros`), em `main`
(commit `45f4ce3`). Sem resumo, sem análise.

**Árvore de dependências própria:**

```
parametros/page.tsx
├── components/app/page-header.tsx
└── components/app/incc-editor.tsx
    (não importa nenhum outro componente de components/app/)

query chamada:     getInccRows
server actions:    updateInccMonth · projectFutureIncc  (actions/incc.ts)
                   saveIncc existe no mesmo arquivo mas NÃO é disparada por
                   esta tela — ver seção 4
```

> **Item 6 — são DOIS estados no banco, não três.** A tabela guarda um único
> booleano, `projected`. Na tela, “Oficial” e “índice real informado” são o
> mesmo estado: a legenda diz literalmente *“Oficial — índice real
> informado”*. Ver seção 6.

Ficam de fora os primitivos de `components/ui/` (`badge`, `button`, `table`)
e `@/lib/context`, `@/lib/permissions`.

---

## 1. Página

### `src/app/(app)/parametros/page.tsx`

```tsx
import { getActiveContext } from "@/lib/context";
import { getInccRows } from "@/lib/queries";
import { can } from "@/lib/permissions";
import { PageHeader } from "@/components/app/page-header";
import { InccEditor } from "@/components/app/incc-editor";

export const dynamic = "force-dynamic";

export default async function ParametrosPage() {
  const ctx = await getActiveContext();
  if (!ctx) return null;
  const incc = await getInccRows(ctx.project.id);
  const canEdit = can(ctx.perms, "parametros", "editar");

  return (
    <>
      <PageHeader
        eyebrow={ctx.project.name}
        title="Parâmetros / INCC"
        subtitle="Índice Nacional de Custo da Construção · correção a partir da 5ª parcela"
      />
      <InccEditor projectId={ctx.project.id} initial={incc} canEdit={canEdit} />
    </>
  );
}
```

---

## 2. Componentes próprios

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

### `src/components/app/incc-editor.tsx`

A grade editável. Dispara `updateInccMonth` ao editar um mês e `projectFutureIncc` pelo botão “Recalcular projeção (média 12m)”.

```tsx
"use client";

import { useEffect, useMemo, useRef, useTransition } from "react";
import { useRouter } from "next/navigation";
import type { InccRow } from "@/lib/calc";
import { updateInccMonth, projectFutureIncc } from "@/lib/actions/incc";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Table, THead, TH, TR, TD } from "@/components/ui/table";

const CONFIRM_MSG =
  "Confirma a alteração deste índice? Esta alteração impactará os cálculos futuros.";

const ordOf = (mes: string) => {
  const [m, y] = mes.split("/").map(Number);
  return y * 12 + (m - 1);
};

export function InccEditor({
  projectId,
  initial,
  canEdit,
}: {
  projectId: string;
  initial: InccRow[];
  canEdit: boolean;
}) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const autoRan = useRef(false);

  // Projeção automática: se existem meses futuros ainda não projetados, gera a
  // projeção por média móvel automaticamente ao abrir a tela (item 2).
  const needsProjection = useMemo(() => {
    const now = new Date();
    const curOrd = now.getFullYear() * 12 + now.getMonth();
    return initial.some((r) => ordOf(r.m) > curOrd && !r.projected);
  }, [initial]);

  useEffect(() => {
    if (!canEdit || !needsProjection || autoRan.current) return;
    autoRan.current = true;
    start(async () => {
      await projectFutureIncc(projectId);
      router.refresh();
    });
  }, [canEdit, needsProjection, projectId, router]);

  const commit = (row: InccRow, raw: string, input: HTMLInputElement) => {
    const value = raw.trim() === "" ? 0 : Number(raw);
    if (!Number.isFinite(value) || value === row.mo) {
      input.value = String(row.mo); // sem mudança real → restaura
      return;
    }
    if (!window.confirm(CONFIRM_MSG)) {
      input.value = String(row.mo); // cancelado → restaura
      return;
    }
    start(async () => {
      await updateInccMonth(projectId, row.m, value);
      router.refresh();
    });
  };

  const projetados = initial.filter((r) => r.projected).length;

  return (
    <>
      <div className="mb-4 flex flex-wrap items-center gap-3">
        {canEdit && (
          <Button
            variant="outline"
            disabled={pending}
            onClick={() =>
              start(async () => {
                await projectFutureIncc(projectId);
                router.refresh();
              })
            }
          >
            {pending ? "Processando…" : "Recalcular projeção (média 12m)"}
          </Button>
        )}
        <span className="flex items-center gap-1.5 text-xs text-[var(--color-ink3)]">
          <Badge tone="neutral">Oficial</Badge> índice real informado
        </span>
        <span className="flex items-center gap-1.5 text-xs text-[var(--color-ink3)]">
          <Badge tone="warning">Projeção</Badge> média móvel de 12 meses ·{" "}
          {projetados} {projetados === 1 ? "mês" : "meses"}
        </span>
      </div>

      <p className="mb-4 rounded-[8px] bg-[var(--color-surface2)] px-3 py-2 text-[12px] leading-relaxed text-[var(--color-ink3)]">
        Edite qualquer índice diretamente na tabela — a alteração pede
        confirmação e recalcula os meses projetados automaticamente. Meses
        oficiais nunca são sobrescritos pela projeção.
      </p>

      <Table>
        <THead>
          <tr>
            <TH>Mês</TH>
            <TH>Tipo</TH>
            <TH className="text-right">Variação mensal %</TH>
            <TH className="text-right">Acumulado %</TH>
          </tr>
        </THead>
        <tbody>
          {initial.map((r) => (
            <TR
              key={r.m}
              className={r.projected ? "bg-[var(--color-warning)]/[0.06]" : undefined}
            >
              <TD className="font-[family-name:var(--font-mono)] font-medium text-[var(--color-ink)]">
                {r.m}
              </TD>
              <TD>
                <Badge tone={r.projected ? "warning" : "neutral"}>
                  {r.projected ? "Projeção" : "Oficial"}
                </Badge>
              </TD>
              <TD className="text-right">
                <input
                  type="number"
                  step="0.001"
                  defaultValue={String(r.mo)}
                  key={`${r.m}-${r.mo}-${r.projected ? "p" : "o"}`}
                  disabled={!canEdit || pending}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") e.currentTarget.blur();
                  }}
                  onBlur={(e) => commit(r, e.target.value, e.currentTarget)}
                  className={`ml-auto h-8 w-28 rounded-[8px] border px-2 text-right font-[family-name:var(--font-mono)] text-sm ${
                    r.projected
                      ? "border-[var(--color-warning)]/40 bg-white text-[var(--color-ink2)]"
                      : "border-[var(--color-accent2)]/20 bg-white"
                  } disabled:opacity-60`}
                />
              </TD>
              <TD className="text-right font-[family-name:var(--font-mono)] text-[var(--color-ink3)]">
                {r.ac.toFixed(3)}
              </TD>
            </TR>
          ))}
        </tbody>
      </Table>
    </>
  );
}
```

---

## 3. Funções de `src/lib/queries.ts`

A página chama uma só: `getInccRows`. Ela usa o helper `toInccRows`, do mesmo
arquivo, que converte a linha do banco no `InccRow` que os cálculos consomem.

### `src/lib/queries.ts` · linhas 150–157

`getInccRows` — ordena por `ordem`, não por mês.

```ts
export async function getInccRows(projectId: string): Promise<InccRow[]> {
  const rows = await db
    .select()
    .from(schema.inccRates)
    .where(eq(schema.inccRates.projectId, projectId))
    .orderBy(asc(schema.inccRates.ordem));
  return toInccRows(rows);
}
```

### `src/lib/queries.ts` · linhas 72–81

`toInccRows` — é aqui que `projected` do banco vira o campo `projected` do tipo de cálculo.

```ts
export function toInccRows(
  rows: (typeof schema.inccRates.$inferSelect)[],
): InccRow[] {
  return rows.map((r) => ({
    m: r.mes,
    mo: Number(r.monthly),
    ac: Number(r.accumulated),
    projected: r.projected,
  }));
}
```

### `src/lib/calc/types.ts` · linhas 79–89

`InccRow` — o tipo que circula nos cálculos.

```ts
/** Linha da tabela INCC: variação mensal e acumulada (em %). */
export interface InccRow {
  /** "MM/YYYY" */
  m: string;
  /** variação mensal % */
  mo: number;
  /** acumulado % */
  ac: number;
  /** true = valor projetado (média móvel); false/undefined = índice oficial. */
  projected?: boolean;
}
```

---

## 4. Server Actions de INCC

As três vivem em `src/lib/actions/incc.ts`, que vai inteiro. Só duas são
disparadas por esta tela:

| Action | Linha | Disparada por | O que faz |
|---|---|---|---|
| `updateInccMonth` | 72 | edição de um campo da grade | marca o mês como oficial (`projected: false`), reprojeta os demais pela média móvel e reencadeia o acumulado |
| `projectFutureIncc` | 105 | botão “Recalcular projeção (média 12m)” | marca como projetados todos os meses estritamente futuros e os preenche pela média móvel |
| `saveIncc` | 42 | **ninguém** — nenhum componente ou página a importa | grava variações em lote e reencadeia o acumulado; não toca em `projected` |

O recálculo por média móvel que o item 4 pede não vive nas actions: elas
delegam a duas funções puras de `src/lib/calc/incc.ts` — `projectIncc`
(a média móvel) e `recalcIncc` (o encadeamento do acumulado). As duas vão
na seção 5, junto de `getIncc`.

### `src/lib/actions/incc.ts`

```ts
"use server";

import { and, eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { db, schema } from "@/lib/db";
import { getActiveContext } from "@/lib/context";
import { can } from "@/lib/permissions";
import { logAudit } from "@/lib/audit";
import { getInccRows } from "@/lib/queries";
import { recalcIncc, projectIncc, type InccRow } from "@/lib/calc";

const ordOf = (mes: string): number => {
  const [m, y] = mes.split("/").map(Number);
  return y * 12 + (m - 1);
};

/** Persiste (monthly, accumulated, projected) de cada linha em transação. */
async function persistIncc(projectId: string, rows: InccRow[]) {
  await db.transaction(async (tx) => {
    for (const r of rows) {
      await tx
        .update(schema.inccRates)
        .set({
          monthly: r.mo.toString(),
          accumulated: r.ac.toString(),
          projected: !!r.projected,
        })
        .where(
          and(
            eq(schema.inccRates.projectId, projectId),
            eq(schema.inccRates.mes, r.m),
          ),
        );
    }
  });
}

/**
 * Persiste a tabela INCC de um projeto: recebe as variações mensais, recalcula
 * o acumulado encadeado e atualiza cada linha. Ver docs/SPEC.md §6.
 */
export async function saveIncc(
  projectId: string,
  monthly: { mes: string; mo: number }[],
) {
  const ctx = await getActiveContext();
  if (!ctx || !can(ctx.perms, "parametros", "editar")) return;
  const recalced = recalcIncc(monthly.map((r) => ({ m: r.mes, mo: r.mo, ac: 0 })));

  await db.transaction(async (tx) => {
    for (const r of recalced) {
      await tx
        .update(schema.inccRates)
        .set({ monthly: r.mo.toString(), accumulated: r.ac.toString() })
        .where(
          and(
            eq(schema.inccRates.projectId, projectId),
            eq(schema.inccRates.mes, r.m),
          ),
        );
    }
  });

  revalidatePath("/parametros");
}

/**
 * Edita manualmente o índice de UM mês (item 1). O mês passa a ser oficial
 * (projected = false) e, em seguida, os meses ainda projetados são recalculados
 * pela média móvel (item 2) e o acumulado é reencadeado.
 */
export async function updateInccMonth(
  projectId: string,
  mes: string,
  mo: number,
) {
  const ctx = await getActiveContext();
  if (!ctx || !can(ctx.perms, "parametros", "editar")) return;
  if (!ctx.projects.some((p) => p.id === projectId)) return;

  const rows = await getInccRows(projectId);
  const next = rows.map((r) =>
    r.m === mes
      ? { ...r, mo: Number.isFinite(mo) ? mo : 0, projected: false }
      : r,
  );
  const projected = projectIncc(next);
  await persistIncc(projectId, projected);

  await logAudit({
    tenantId: ctx.tenant.id,
    userId: ctx.userId,
    action: "incc.update",
    entity: "incc_rate",
    meta: { projectId, mes, mo },
  });
  revalidatePath("/parametros");
}

/**
 * Marca como projetados todos os meses estritamente futuros (após o mês
 * corrente) e os preenche pela média móvel de 12 meses (item 2). Meses
 * históricos/correntes permanecem oficiais e inalterados.
 */
export async function projectFutureIncc(projectId: string) {
  const ctx = await getActiveContext();
  if (!ctx || !can(ctx.perms, "parametros", "editar")) return;
  if (!ctx.projects.some((p) => p.id === projectId)) return;

  const now = new Date();
  const curOrd = now.getFullYear() * 12 + now.getMonth();

  const rows = await getInccRows(projectId);
  const flagged = rows.map((r) => ({
    ...r,
    projected: ordOf(r.m) > curOrd,
  }));
  const projected = projectIncc(flagged);
  await persistIncc(projectId, projected);

  await logAudit({
    tenantId: ctx.tenant.id,
    userId: ctx.userId,
    action: "incc.project",
    entity: "incc_rate",
    meta: { projectId },
  });
  revalidatePath("/parametros");
}
```

E as funções puras que elas chamam — `src/lib/calc/incc.ts` inteiro:

### `src/lib/calc/incc.ts`

`recalcIncc` encadeia o acumulado; `projectIncc` preenche os meses projetados pela média das últimas 12 variações; `getIncc` devolve o acumulado de um mês.

```ts
import type { InccRow } from "./types";

/**
 * Recalcula o acumulado encadeado a partir das variações mensais (`mo`).
 * Espelha `recalcINCC()` do protótipo: o primeiro mês usa a própria variação;
 * os seguintes compõem `(1+ac/100)*(1+mo/100)`. Retorna uma NOVA lista
 * (função pura) — não muta a entrada.
 */
export function recalcIncc(rows: readonly InccRow[]): InccRow[] {
  let acc = 0;
  return rows.map((row, i) => {
    acc =
      i === 0
        ? row.mo
        : Math.round(((1 + acc / 100) * (1 + row.mo / 100) * 100 - 100) * 1000) /
          1000;
    return { ...row, ac: acc };
  });
}

/** Retorna o acumulado de um mês ("MM/YYYY"), ou 0 se ausente. */
export function getIncc(rows: readonly InccRow[], month: string): number {
  const row = rows.find((r) => r.m === month);
  return row ? row.ac : 0;
}

/**
 * Preenche as variações mensais dos meses projetados (`projected === true`) com
 * a média móvel das últimas 12 variações (oficiais ou já projetadas), na ordem
 * cronológica. Meses oficiais (índice real) nunca são alterados. Depois
 * recalcula o acumulado encadeado de toda a série. Função pura.
 */
export function projectIncc(rows: readonly InccRow[]): InccRow[] {
  const out: InccRow[] = rows.map((r) => ({ ...r }));
  for (let i = 0; i < out.length; i++) {
    if (!out[i].projected) continue;
    const window = out.slice(Math.max(0, i - 12), i);
    if (window.length === 0) continue; // sem histórico → mantém valor atual
    const avg = window.reduce((a, r) => a + r.mo, 0) / window.length;
    out[i].mo = Math.round(avg * 1000) / 1000;
  }
  return recalcIncc(out);
}
```

---

## 5. Tabela `incc_rate` no schema

### `src/lib/db/schema.ts` · linhas 1276–1298

```ts
/** Tabela INCC por projeto (48 meses, editável). Ver docs/SPEC.md §6. */
export const inccRates = pgTable(
  "incc_rate",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    projectId: uuid("project_id")
      .notNull()
      .references(() => projects.id, { onDelete: "cascade" }),
    tenantId: uuid("tenant_id")
      .notNull()
      .references(() => tenants.id, { onDelete: "cascade" }),
    /** "MM/YYYY". */
    mes: text("mes").notNull(),
    /** variação mensal (%). */
    monthly: numeric("monthly", { precision: 8, scale: 4 }).notNull(),
    /** acumulado (%). */
    accumulated: numeric("accumulated", { precision: 8, scale: 4 }).notNull(),
    ordem: integer("ordem").notNull(),
    /** true = valor projetado (média móvel 12m); false = índice oficial. */
    projected: boolean("projected").notNull().default(false),
  },
  (r) => [unique("incc_project_mes_uq").on(r.projectId, r.mes)],
);
```

---

## 6. Como os tipos são distinguidos no banco

**Não são três tipos. São dois estados, e um único booleano os separa.**

A coluna é `projected: boolean`. Não há coluna de “tipo”, nem enum, nem
terceiro valor possível.

| Estado no banco | Badge na tela | Legenda da tela |
|---|---|---|
| `projected = false` | `Oficial` (tom neutro) | “índice real informado” |
| `projected = true` | `Projeção` (tom warning) | “média móvel de 12 meses” |

Os dois nomes que o item 6 trata como distintos — **Oficial** e **índice real
informado** — são o mesmo estado. A legenda os une numa frase só, em
`incc-editor.tsx`, linha 85:

```tsx
<Badge tone="neutral">Oficial</Badge> índice real informado
```

contra a linha 88, do outro estado:

```tsx
<Badge tone="warning">Projeção</Badge> média móvel de 12 meses ·{" "}
{projetados} {projetados === 1 ? "mês" : "meses"}
```

E o badge da linha da tabela, em `incc-editor.tsx`, linhas 118–119, é ternário
sobre o mesmo booleano:

```tsx
<Badge tone={r.projected ? "warning" : "neutral"}>
  {r.projected ? "Projeção" : "Oficial"}
```

### Quem grava cada estado

| Caminho | Arquivo | Linha | Grava |
|---|---|---|---|
| Editar um mês na grade | `src/lib/actions/incc.ts` | 84 | `projected: false` no mês editado |
| Botão de reprojetar | `src/lib/actions/incc.ts` | 116 | `projected: ordOf(r.m) > curOrd` — true para todo mês estritamente futuro |
| Persistência comum | `src/lib/actions/incc.ts` | 26 | `projected: !!r.projected` |
| Criação do projeto | `src/lib/actions/projects.ts` | 113 | `DEFAULT_INCC` — não informa `projected`, fica no default do schema |
| Provisionamento de tenant | `src/lib/tenant/provision.ts` | 152 | idem |
| Seed | `src/lib/db/seed.ts` | 157 | idem |

---

## 7. Todo ponto que aplica a correção INCC

São **três** pontos de aplicação, todos em funções puras de cálculo, e todos
com a mesma regra de início: a correção só incide da **5ª parcela em diante**
(`i >= INCC_FROM_INSTALLMENT`, com a constante valendo `4`).

| Arquivo | Linha | Sobre o que incide | Fórmula |
|---|---|---|---|
| `src/lib/calc/projection.ts` | 66 | valor da parcela periódica de uma unidade, dentro de `calcProjection` (linha 47) | `val * (1 + getIncc(incc, mk) / 100)` |
| `src/lib/calc/projection.ts` | 180 | idem, dentro de `calcProjectionBySource` (linha 156) — mesma conta, separada por fonte | `val * (1 + getIncc(incc, mk) / 100)` |
| `src/lib/calc/simulator.ts` | 102 | parcela mensal do simulador, em `simulate` | `parcBase * (1 + inccAc / 100)` |

O índice usado é sempre o **acumulado** (`ac`) do mês do vencimento, via
`getIncc(rows, month)` — nunca a variação mensal (`mo`).

### Sobre o que a correção NÃO incide

| Função | Aplica INCC? | Consequência |
|---|---|---|
| `expandUnitReceivables` (`receivables.ts`) | **não** — zero ocorrências de `getIncc` no arquivo | os recebíveis exibidos em **Contas a Receber**, e a receita que a **DRE** e o **Fluxo de Caixa** recebem por `getMonthlyRevenue`, saem **sem correção** |
| `despesa_parcela` / `registrarPagamento` | **não** | parcelas de despesa não têm INCC |
| `reembursementsByMonth` | **não** | reembolso entra pelo valor nominal |
| `permutaRevenueByMonth` / `permutaCashByMonth` | **não** | revenda de permuta entra pelo valor nominal |

Os dois caminhos de receita divergem nisso: `calcProjection` corrige,
`expandUnitReceivables` não. Quem consome cada um:

| Função | Telas |
|---|---|
| `calcProjection` | `/caixa` (linha 454) |
| `calcProjectionBySource` | `/queries.ts:1442` (comparação Budget × Forecast) e `actions/budget.ts:561` |
| `expandUnitReceivables` | `/contasreceber`, e tudo que passa por `getMonthlyRevenue` — DRE, Dashboard, Fluxo, Resumo, Contabilidade |

---

## 8. Um mês que era Projeção e vira Oficial

### As parcelas já calculadas são recalculadas?

**Não há o que recalcular: nenhum valor corrigido por INCC é gravado no
banco.** A correção é aplicada na LEITURA, a cada render.

As três aplicações da seção 7 vivem em funções puras chamadas durante o
render da página. Nenhuma action e nenhuma camada de banco chama `getIncc` —
verificado: as únicas menções a INCC em `src/lib/actions/` são
`getInccRows` (a leitura da tabela) em `incc.ts` e `budget.ts`.

Portanto, editar um mês na grade muda os números de todas as telas que
aplicam correção **na próxima renderização**, sem migração, sem job e sem
tocar em nenhuma outra tabela. O que `updateInccMonth` grava é apenas a
própria tabela `incc_rate`: `monthly`, `accumulated` e `projected` de cada
linha do projeto.

### O que a ação faz, em ordem

`updateInccMonth` (`incc.ts:72–98`):

1. lê todas as linhas do projeto (`getInccRows`);
2. troca a variação do mês editado e marca **esse** mês como
   `projected: false` (linha 84);
3. passa a lista inteira por `projectIncc`, que reescreve a variação de
   **todos** os meses ainda `projected: true` pela média das 12 anteriores e
   reencadeia o acumulado de toda a série;
4. persiste `monthly`, `accumulated` e `projected` de cada linha, em transação
   (`persistIncc`, linhas 18–36);
5. audita como `incc.update` e revalida `/parametros`.

O passo 3 é a razão de a mudança de um mês alterar os meses seguintes: como
o acumulado é encadeado, corrigir um índice desloca toda a curva à frente
dele.

### A exceção: valores congelados em `budget_line`

Existe **um** caminho que grava valor já corrigido por INCC, e ele não é
recalculado depois: `replicateFromAtual`, em `src/lib/actions/budget.ts`,
linha 542.

Ela chama `calcProjectionBySource(toCalcUnit(u), incc)` (linha 561), soma as
fontes por mês e grava o resultado em `budget_line` via `replaceLines`
(linha 585). O valor gravado é um **retrato do índice no instante em que a
ação rodou**. Alterar o INCC depois não mexe nessas linhas — elas só mudam se
a ação for executada de novo.

### `src/lib/actions/budget.ts` · linhas 542–597

`replicateFromAtual` — o único caminho que persiste valor corrigido por INCC.

```ts
/** Deriva os lançamentos simplificados a partir da versão "atual" (detalhada). */
export async function replicateFromAtual(targetVersionId: string) {
  const ctx = await getActiveContext();
  if (!ctx) throw new Error("Sem permissão.");
  const target = await loadBudgetTarget(ctx, targetVersionId);
  const atual = await siblingVersion(target.projectId, "atual");
  if (!atual) throw new Error("Não encontrei a versão Atual.");

  const [units, reembRows, incc, despesas] = await Promise.all([
    getUnits(atual.id),
    getReembolsos(atual.id),
    getInccRows(target.projectId),
    getDespesas(atual.id),
  ]);

  // Receita consolidada por projeto (linha única "Receita") × mês: soma todas
  // as fontes projetadas das unidades + reembolsos.
  const receitaByMonth: Record<string, number> = {};
  for (const u of units) {
    const bs = calcProjectionBySource(toCalcUnit(u), incc);
    for (const s of PROJECTION_SOURCES)
      for (const [mm, v] of Object.entries(bs[s]))
        receitaByMonth[mm] = (receitaByMonth[mm] || 0) + v;
  }
  const reemb = reembursementsByMonth(reembToCalc(reembRows));
  for (const [mm, v] of Object.entries(reemb))
    receitaByMonth[mm] = (receitaByMonth[mm] || 0) + v;
  const receitaCells: BudgetCell[] = Object.entries(receitaByMonth).map(
    ([mes, valor]) => ({ rowKey: RECEITA_ROW_KEY, dreCategory: "Receita", mes, valor }),
  );

  // Despesa por grupo CEF × mês (com a categoria DRE já lançada).
  const despMap = new Map<string, BudgetCell>();
  for (const d of despesas) {
    if (!d.contaCef || !d.competencia) continue;
    const grp = d.contaCef.split(".")[0];
    const key = `${grp}|${d.competencia}`;
    const cur = despMap.get(key);
    const val = Number(d.valor);
    if (cur) cur.valor += val;
    else despMap.set(key, { rowKey: grp, dreCategory: d.categoriaDre ?? "Custo Variável", mes: d.competencia, valor: val });
  }

  await replaceLines(ctx.tenant.id, targetVersionId, "receita", receitaCells);
  await replaceLines(ctx.tenant.id, targetVersionId, "despesa", [...despMap.values()]);

  await logAudit({
    tenantId: ctx.tenant.id,
    userId: ctx.userId,
    action: "budget.replicateFromAtual",
    entity: "budget_line",
    entityId: targetVersionId,
    meta: { receita: receitaCells.length, despesa: despMap.size },
  });
  revalidateLancamento();
}
```

Para referência, as duas funções que aplicam a correção:

### `src/lib/calc/projection.ts` · linhas 47–142

`calcProjection` — a correção está na linha 66.

```ts
/**
 * Projeta os recebíveis de uma unidade vendida mês a mês (matriz "MM/YYYY" →
 * valor). Espelha `calcProj()` do protótipo: percorre a cascata de fontes,
 * cada uma liberada pela flag da anterior, aplicando INCC nas fontes
 * periódicas a partir da 5ª parcela. Retorna {} se a unidade não estiver
 * vendida.
 */
export function calcProjection(
  u: CalcUnit,
  incc: readonly InccRow[] = [],
): MonthlyProjection {
  const proj: MonthlyProjection = {};
  const add = (mm: string, v: number) => {
    if (v > 0) proj[mm] = (proj[mm] || 0) + v;
  };
  if (u.status !== "Vendido") return proj;

  const periodic = (val: number, i: number, mk: string) =>
    Math.round(
      val * (1 + (i >= INCC_FROM_INSTALLMENT ? getIncc(incc, mk) : 0) / 100) *
        100,
    ) / 100;

  if (u.usarAS && u.AS.val > 0) {
    const d = parseDate(u.AS.venc);
    if (d)
      for (let i = 0; i < (u.AS.n || 1); i++) {
        const dt = addMonths(d.mo, d.yr, i);
        add(monthKey(dt.mo, dt.yr), u.AS.val);
      }
  }
  if (u.AS.usarS1 && u.S1.val > 0) {
    const d = parseDate(u.S1.venc);
    if (d)
      for (let i = 0; i < (u.S1.n || 1); i++) {
        const dt = addMonths(d.mo, d.yr, i);
        add(monthKey(dt.mo, dt.yr), u.S1.val);
      }
  }
  if (u.S1.usarS2 && u.S2.val > 0) {
    const d = parseDate(u.S2.venc);
    if (d)
      for (let i = 0; i < (u.S2.n || 1); i++) {
        const dt = addMonths(d.mo, d.yr, i);
        add(monthKey(dt.mo, dt.yr), u.S2.val);
      }
  }
  if (u.S2.usarS3 && u.S3.val > 0) {
    const d = parseDate(u.S3.venc);
    if (d)
      for (let i = 0; i < (u.S3.n || 1); i++) {
        const dt = addMonths(d.mo, d.yr, i);
        add(monthKey(dt.mo, dt.yr), u.S3.val);
      }
  }
  if (u.S3.usarMens && u.Mensais.val > 0) {
    const d = parseDate(u.Mensais.venc);
    if (d)
      for (let i = 0; i < (u.Mensais.n || 0); i++) {
        const dt = addMonths(d.mo, d.yr, i);
        const mk = monthKey(dt.mo, dt.yr);
        add(mk, periodic(u.Mensais.val, i, mk));
      }
  }
  if (u.Mensais.usarSem && u.Semestrais.val > 0) {
    const d = parseDate(u.Semestrais.venc);
    if (d)
      for (let i = 0; i < (u.Semestrais.n || 0); i++) {
        const dt = addMonths(d.mo, d.yr, i * 6);
        const mk = monthKey(dt.mo, dt.yr);
        add(mk, periodic(u.Semestrais.val, i, mk));
      }
  }
  if (u.Semestrais.usarAnu && u.Anuais.val > 0) {
    const d = parseDate(u.Anuais.venc);
    if (d)
      for (let i = 0; i < (u.Anuais.n || 0); i++) {
        const dt = addMonths(d.mo, d.yr, i * 12);
        const mk = monthKey(dt.mo, dt.yr);
        add(mk, periodic(u.Anuais.val, i, mk));
      }
  }
  if (u.Anuais.usarFGTS && u.FGTS.val > 0) {
    const d = parseDate(u.FGTS.dataPrev);
    if (d) add(monthKey(d.mo, d.yr), u.FGTS.val);
  }
  if (u.FGTS.usarSub && u.Subsidio.val > 0 && u.Subsidio.statusSub === "Recebido") {
    const d = parseDate(u.Subsidio.dataPrev);
    if (d) add(monthKey(d.mo, d.yr), u.Subsidio.val);
  }
  if (u.Subsidio.usarPer && u.Permuta.val > 0) {
    const d = parseDate(u.Permuta.dataPrev);
    if (d) add(monthKey(d.mo, d.yr), u.Permuta.val);
  }
  return proj;
}
```

### `src/lib/calc/projection.ts` · linhas 156–239

`calcProjectionBySource` — a correção está na linha 180.

```ts
/**
 * Igual a `calcProjection`, mas separando a receita projetada por tipo de fonte
 * (AS/Sinais, Mensais, …). Usado no Consolidado. Retorna um mapa vazio por
 * fonte se a unidade não estiver vendida.
 */
export function calcProjectionBySource(
  u: CalcUnit,
  incc: readonly InccRow[] = [],
): Record<ProjectionSource, MonthlyProjection> {
  const out = {
    "AS/Sinais": {},
    Mensais: {},
    Semestrais: {},
    Anuais: {},
    FGTS: {},
    Subsídio: {},
    Permuta: {},
  } as Record<ProjectionSource, MonthlyProjection>;
  if (u.status !== "Vendido") return out;
  const add = (key: ProjectionSource, mm: string, v: number) => {
    if (v > 0) out[key][mm] = (out[key][mm] || 0) + v;
  };
  const periodic = (val: number, i: number, mk: string) =>
    Math.round(
      val * (1 + (i >= INCC_FROM_INSTALLMENT ? getIncc(incc, mk) : 0) / 100) * 100,
    ) / 100;

  const signals: { use: boolean; val: number; venc: string; n: number }[] = [
    { use: u.usarAS, val: u.AS.val, venc: u.AS.venc, n: u.AS.n },
    { use: u.AS.usarS1, val: u.S1.val, venc: u.S1.venc, n: u.S1.n },
    { use: u.S1.usarS2, val: u.S2.val, venc: u.S2.venc, n: u.S2.n },
    { use: u.S2.usarS3, val: u.S3.val, venc: u.S3.venc, n: u.S3.n },
  ];
  for (const s of signals) {
    if (s.use && s.val > 0) {
      const d = parseDate(s.venc);
      if (d)
        for (let i = 0; i < (s.n || 1); i++) {
          const dt = addMonths(d.mo, d.yr, i);
          add("AS/Sinais", monthKey(dt.mo, dt.yr), s.val);
        }
    }
  }
  if (u.S3.usarMens && u.Mensais.val > 0) {
    const d = parseDate(u.Mensais.venc);
    if (d)
      for (let i = 0; i < (u.Mensais.n || 0); i++) {
        const dt = addMonths(d.mo, d.yr, i);
        const mk = monthKey(dt.mo, dt.yr);
        add("Mensais", mk, periodic(u.Mensais.val, i, mk));
      }
  }
  if (u.Mensais.usarSem && u.Semestrais.val > 0) {
    const d = parseDate(u.Semestrais.venc);
    if (d)
      for (let i = 0; i < (u.Semestrais.n || 0); i++) {
        const dt = addMonths(d.mo, d.yr, i * 6);
        const mk = monthKey(dt.mo, dt.yr);
        add("Semestrais", mk, periodic(u.Semestrais.val, i, mk));
      }
  }
  if (u.Semestrais.usarAnu && u.Anuais.val > 0) {
    const d = parseDate(u.Anuais.venc);
    if (d)
      for (let i = 0; i < (u.Anuais.n || 0); i++) {
        const dt = addMonths(d.mo, d.yr, i * 12);
        const mk = monthKey(dt.mo, dt.yr);
        add("Anuais", mk, periodic(u.Anuais.val, i, mk));
      }
  }
  if (u.Anuais.usarFGTS && u.FGTS.val > 0) {
    const d = parseDate(u.FGTS.dataPrev);
    if (d) add("FGTS", monthKey(d.mo, d.yr), u.FGTS.val);
  }
  if (u.FGTS.usarSub && u.Subsidio.val > 0 && u.Subsidio.statusSub === "Recebido") {
    const d = parseDate(u.Subsidio.dataPrev);
    if (d) add("Subsídio", monthKey(d.mo, d.yr), u.Subsidio.val);
  }
  if (u.Subsidio.usarPer && u.Permuta.val > 0) {
    const d = parseDate(u.Permuta.dataPrev);
    if (d) add("Permuta", monthKey(d.mo, d.yr), u.Permuta.val);
  }
  return out;
}
```

