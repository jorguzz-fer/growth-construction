# TELA-forecast — código na íntegra

Coleta do código da tela **Lançamento Forecast** (`/forecast`), em `main`
(commit `45f4ce3`). Sem resumo, sem análise.

Esta coleta é **incremental sobre `docs/TELA-budget.md`**: as duas telas
compartilham quase tudo. Já entregues lá e por isso ausentes aqui:
`budget-planning-screen.tsx`, `page-header.tsx`, `access-denied.tsx`,
`getBudgetPlanning` e o arquivo `src/lib/actions/planning.ts` inteiro.

**Árvore da página:**

```
forecast/page.tsx
├── components/app/access-denied.tsx            (em TELA-budget.md)
├── components/app/budget-planning-screen.tsx   (em TELA-budget.md)
└── components/app/budget-forecast-compare.tsx  ← novo, seção 2
    (não importa nenhum outro componente de components/app/)

queries chamadas:  getBudgetPlanning         (em TELA-budget.md)
                   getProjectVersionsByKind  ← novo, seção 4
                   getForecastComparison     ← novo, seção 4
```

Sobre o item 3, um fato: **não existe Server Action de comparação.** A
comparação Budget × Forecast é feita direto na página (Server Component),
chamando `getForecastComparison` de `queries.ts` — ver seção 4. A action de
criação existe e é `createForecastFromBudget`; `duplicateForecast` vai junto
por ser o outro caminho de criação de Forecast disparado pela mesma tela.

---

## 1. Página

### `src/app/(app)/forecast/page.tsx`

```tsx
import { getActiveContext } from "@/lib/context";
import { can } from "@/lib/permissions";
import {
  getBudgetPlanning,
  getProjectVersionsByKind,
  getForecastComparison,
} from "@/lib/queries";
import { AccessDenied } from "@/components/app/access-denied";
import { BudgetPlanningScreen } from "@/components/app/budget-planning-screen";
import { BudgetForecastCompare } from "@/components/app/budget-forecast-compare";

export const dynamic = "force-dynamic";

export default async function ForecastPage({
  searchParams,
}: {
  searchParams: Promise<{ proj?: string; v?: string; cmp?: string }>;
}) {
  const ctx = await getActiveContext();
  if (!ctx) return null;
  if (!can(ctx.perms, "forecast", "ver")) return <AccessDenied />;
  const sp = await searchParams;

  // Inclui obras e matriz/filiais (office). Offices usam ano atual + 5 anos.
  const alvos = ctx.projects;
  const projId =
    alvos.find((p) => p.id === sp.proj)?.id ??
    alvos.find((p) => p.id === ctx.project.id)?.id ??
    alvos[0]?.id ??
    ctx.project.id;
  const [data, budgetVersions] = await Promise.all([
    getBudgetPlanning(ctx.tenant.id, projId, "forecast", sp.v ?? null),
    getProjectVersionsByKind(ctx.tenant.id, projId, "budget"),
  ]);

  // Modo comparação (spec §16): Forecast selecionado × Budget de origem.
  if (sp.cmp === "1" && data.versionId) {
    const cmp = await getForecastComparison(ctx.tenant.id, data.versionId);
    const back = `/forecast?proj=${projId}&v=${data.versionId}`;
    return <BudgetForecastCompare data={cmp} backHref={back} />;
  }

  const projects = alvos.map((p) => ({
    id: p.id,
    label: p.kind === "office" ? `${p.name} · Matriz/Filial` : p.name,
  }));
  return (
    <BudgetPlanningScreen
      data={data}
      kind="forecast"
      projects={projects}
      canEdit={can(ctx.perms, "forecast", "editar")}
      budgetVersions={budgetVersions.map((v) => ({ id: v.id, label: v.label }))}
      canCreateForecast={can(ctx.perms, "forecast", "criar")}
    />
  );
}
```

---

## 2. Componente próprio ainda não coletado

### `src/components/app/budget-forecast-compare.tsx`

Renderizado quando a URL traz `?cmp=1`. Não importa nenhum outro componente de `components/app/`.

```tsx
import Link from "next/link";
import type { CompareRowP, ForecastComparisonData } from "@/lib/queries";
import { Card, CardContent } from "@/components/ui/card";
import { brl0 } from "@/lib/utils";

/** Variação percentual segura (Budget zero → mostra "—" ou "novo"). */
function varPct(budget: number, forecast: number): string {
  if (budget === 0) return forecast === 0 ? "—" : "novo";
  return `${(((forecast - budget) / budget) * 100).toFixed(1)}%`;
}

function tone(diff: number): string {
  if (Math.abs(diff) < 0.005) return "var(--color-ink3)";
  return diff > 0 ? "var(--color-success)" : "var(--color-danger)";
}

function CompareBloco({ titulo, rows }: { titulo: string; rows: CompareRowP[] }) {
  const totB = rows.reduce((a, r) => a + r.budget, 0);
  const totF = rows.reduce((a, r) => a + r.forecast, 0);
  return (
    <Card>
      <CardContent className="p-0">
        <h2 className="border-b border-[var(--color-accent2)]/12 p-4 text-[15px] font-semibold text-[var(--color-ink)]">
          {titulo}
        </h2>
        <div className="tbl-scroll overflow-x-auto">
          <table className="w-full border-collapse text-sm">
            <thead className="bg-[var(--color-surface2)]">
              <tr>
                <th className="px-3 py-2 text-left font-[family-name:var(--font-mono)] text-[10px] uppercase tracking-wide text-[var(--color-ink3)]">Conta</th>
                <th className="px-3 py-2 text-right font-[family-name:var(--font-mono)] text-[10px] uppercase tracking-wide text-[var(--color-ink3)]">Budget</th>
                <th className="px-3 py-2 text-right font-[family-name:var(--font-mono)] text-[10px] uppercase tracking-wide text-[var(--color-ink3)]">Forecast</th>
                <th className="px-3 py-2 text-right font-[family-name:var(--font-mono)] text-[10px] uppercase tracking-wide text-[var(--color-ink3)]">Var. R$</th>
                <th className="px-3 py-2 text-right font-[family-name:var(--font-mono)] text-[10px] uppercase tracking-wide text-[var(--color-ink3)]">Var. %</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => {
                const diff = r.forecast - r.budget;
                return (
                  <tr key={r.rowKey} className="border-b border-[var(--color-accent2)]/8">
                    <td className="px-3 py-1.5 text-[var(--color-ink)]">{r.label}</td>
                    <td className="px-3 py-1.5 text-right font-[family-name:var(--font-mono)]">{brl0(r.budget)}</td>
                    <td className="px-3 py-1.5 text-right font-[family-name:var(--font-mono)]">{brl0(r.forecast)}</td>
                    <td className="px-3 py-1.5 text-right font-[family-name:var(--font-mono)]" style={{ color: tone(diff) }}>{brl0(diff)}</td>
                    <td className="px-3 py-1.5 text-right font-[family-name:var(--font-mono)]" style={{ color: tone(diff) }}>{varPct(r.budget, r.forecast)}</td>
                  </tr>
                );
              })}
              {rows.length === 0 && (
                <tr><td colSpan={5} className="px-3 py-6 text-center text-[var(--color-ink3)]">Sem contas.</td></tr>
              )}
              <tr className="border-t-2 border-[var(--color-accent2)]/20 bg-[var(--color-surface2)] font-semibold">
                <td className="px-3 py-2">Total</td>
                <td className="px-3 py-2 text-right font-[family-name:var(--font-mono)]">{brl0(totB)}</td>
                <td className="px-3 py-2 text-right font-[family-name:var(--font-mono)]">{brl0(totF)}</td>
                <td className="px-3 py-2 text-right font-[family-name:var(--font-mono)]" style={{ color: tone(totF - totB) }}>{brl0(totF - totB)}</td>
                <td className="px-3 py-2 text-right font-[family-name:var(--font-mono)]" style={{ color: tone(totF - totB) }}>{varPct(totB, totF)}</td>
              </tr>
            </tbody>
          </table>
        </div>
      </CardContent>
    </Card>
  );
}

export function BudgetForecastCompare({
  data,
  backHref,
}: {
  data: ForecastComparisonData;
  backHref: string;
}) {
  if (!data.ok) {
    return (
      <Card>
        <CardContent className="p-6 text-center text-[var(--color-ink3)]">
          {data.message ?? "Comparação indisponível."}
          <div className="mt-3">
            <Link href={backHref} className="text-[13px] text-[var(--color-accent2)] hover:underline">
              ← Voltar ao Forecast
            </Link>
          </div>
        </CardContent>
      </Card>
    );
  }
  const resB =
    data.receitas.reduce((a, r) => a + r.budget, 0) -
    data.despesas.reduce((a, r) => a + r.budget, 0);
  const resF =
    data.receitas.reduce((a, r) => a + r.forecast, 0) -
    data.despesas.reduce((a, r) => a + r.forecast, 0);

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="font-[family-name:var(--font-serif)] text-2xl text-[var(--color-ink)]">
            Comparação Budget × Forecast
          </h1>
          <p className="mt-0.5 text-[12.5px] text-[var(--color-ink3)]">
            Budget <strong>{data.budgetLabel}</strong> × Forecast <strong>{data.forecastLabel}</strong>
          </p>
        </div>
        <Link
          href={backHref}
          className="rounded-[8px] border border-[var(--color-accent2)]/30 px-3 py-1.5 text-[13px] text-[var(--color-accent2)] hover:bg-[var(--color-accent2)]/8"
        >
          ← Voltar ao Forecast
        </Link>
      </div>

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
        <Card><CardContent className="p-4"><div className="text-[12px] text-[var(--color-ink3)]">Resultado — Budget</div><div className="mt-1 font-[family-name:var(--font-mono)] text-[18px] font-semibold">{brl0(resB)}</div></CardContent></Card>
        <Card><CardContent className="p-4"><div className="text-[12px] text-[var(--color-ink3)]">Resultado — Forecast</div><div className="mt-1 font-[family-name:var(--font-mono)] text-[18px] font-semibold">{brl0(resF)}</div></CardContent></Card>
        <Card><CardContent className="p-4"><div className="text-[12px] text-[var(--color-ink3)]">Variação do resultado</div><div className="mt-1 font-[family-name:var(--font-mono)] text-[18px] font-semibold" style={{ color: tone(resF - resB) }}>{brl0(resF - resB)}</div></CardContent></Card>
      </div>

      <CompareBloco titulo="Receitas — variação por conta" rows={data.receitas} />
      <CompareBloco titulo="Despesas — variação por conta" rows={data.despesas} />
    </div>
  );
}
```

---

## 3. Server Actions de criação de Forecast

Vivem em `src/lib/actions/planning.ts`, arquivo já colado por inteiro em
`docs/TELA-budget.md`. Aqui vão as duas funções pedidas, com seus intervalos.

Não há Server Action de comparação — ver a seção 4.

### `src/lib/actions/planning.ts` · linhas 180–249

`createForecastFromBudget` — cria um Forecast a partir de uma versão de Budget.

```ts
export async function createForecastFromBudget(
  projectId: string,
  budgetVersionId: string,
  label: string,
): Promise<string> {
  const ctx = await getActiveContext();
  if (!ctx || !can(ctx.perms, "forecast", "criar")) {
    throw new Error("Sem permissão para criar Forecast.");
  }
  if (!ctx.projects.some((p) => p.id === projectId)) {
    throw new Error("Projeto inválido.");
  }
  const [budget] = await db
    .select()
    .from(schema.versions)
    .where(
      and(
        eq(schema.versions.id, budgetVersionId),
        eq(schema.versions.tenantId, ctx.tenant.id),
        eq(schema.versions.projectId, projectId),
        eq(schema.versions.kind, "budget"),
      ),
    )
    .limit(1);
  if (!budget) throw new Error("Versão de Budget de origem não encontrada.");

  const existing = await db
    .select({ id: schema.versions.id })
    .from(schema.versions)
    .where(
      and(eq(schema.versions.projectId, projectId), eq(schema.versions.kind, "forecast")),
    );
  if (existing.length >= MAX_FORECASTS) {
    throw new Error(`Limite de ${MAX_FORECASTS} versões de Forecast por projeto atingido.`);
  }
  const clean = (label || "").trim() || "Forecast";
  const key = `forecast-${crypto.randomUUID().slice(0, 8)}`;
  const color = FORECAST_COLORS[existing.length % FORECAST_COLORS.length];

  const newId = await db.transaction(async (tx) => {
    const [v] = await tx
      .insert(schema.versions)
      .values({
        projectId,
        tenantId: ctx.tenant.id,
        key,
        kind: "forecast",
        label: clean,
        color,
        isDefault: false,
        locked: false,
        status: "Rascunho",
        sourceVersionId: budgetVersionId,
      })
      .returning();
    await copyPlanningData(tx, ctx.tenant.id, budgetVersionId, v.id);
    return v.id;
  });

  await logAudit({
    tenantId: ctx.tenant.id,
    userId: ctx.userId,
    action: "forecast.createFromBudget",
    entity: "version",
    entityId: newId,
    meta: { projectId, budgetVersionId, label: clean },
  });
  revalidatePath("/forecast");
  return newId;
}
```

### `src/lib/actions/planning.ts` · linhas 252–316

`duplicateForecast` — o outro caminho de criação, a partir de um Forecast existente.

```ts
export async function duplicateForecast(
  forecastVersionId: string,
  label: string,
): Promise<string> {
  const ctx = await getActiveContext();
  if (!ctx || !can(ctx.perms, "forecast", "criar")) {
    throw new Error("Sem permissão para duplicar Forecast.");
  }
  const [src] = await db
    .select()
    .from(schema.versions)
    .where(
      and(
        eq(schema.versions.id, forecastVersionId),
        eq(schema.versions.tenantId, ctx.tenant.id),
        eq(schema.versions.kind, "forecast"),
      ),
    )
    .limit(1);
  if (!src) throw new Error("Forecast de origem não encontrado.");

  const existing = await db
    .select({ id: schema.versions.id })
    .from(schema.versions)
    .where(
      and(eq(schema.versions.projectId, src.projectId), eq(schema.versions.kind, "forecast")),
    );
  if (existing.length >= MAX_FORECASTS) {
    throw new Error(`Limite de ${MAX_FORECASTS} versões de Forecast por projeto atingido.`);
  }
  const clean = (label || "").trim() || `${src.label} (cópia)`;
  const key = `forecast-${crypto.randomUUID().slice(0, 8)}`;
  const color = FORECAST_COLORS[existing.length % FORECAST_COLORS.length];

  const newId = await db.transaction(async (tx) => {
    const [v] = await tx
      .insert(schema.versions)
      .values({
        projectId: src.projectId,
        tenantId: ctx.tenant.id,
        key,
        kind: "forecast",
        label: clean,
        color,
        isDefault: false,
        locked: false,
        status: "Rascunho",
        sourceVersionId: src.sourceVersionId,
      })
      .returning();
    await copyPlanningData(tx, ctx.tenant.id, src.id, v.id);
    return v.id;
  });

  await logAudit({
    tenantId: ctx.tenant.id,
    userId: ctx.userId,
    action: "forecast.duplicate",
    entity: "version",
    entityId: newId,
    meta: { from: forecastVersionId, label: clean },
  });
  revalidatePath("/forecast");
  return newId;
}
```

---

## 4. Funções de `queries.ts` não coletadas em TELA-budget.md

| Função | Linhas | Papel |
|---|---|---|
| `getForecastComparison` | 601–699 | alimenta a comparação Budget × Forecast |
| `getProjectVersionsByKind` | 701–723 | lista as versões de Budget do projeto, para o seletor de origem |

`getBudgetPlanning`, também chamada pela página, está em `docs/TELA-budget.md`
(linhas 733–922 de `queries.ts`).

### `src/lib/queries.ts` · linhas 601–699

`getForecastComparison` — é esta função que alimenta a comparação; não há Server Action para isso.

```ts
/**
 * Comparação entre um Forecast e o Budget de origem (spec §16). Reaproveita
 * getBudgetPlanning para as duas versões e calcula a variação por conta e por
 * mês. Se o Forecast não tem origem registrada, usa o Budget padrão do projeto.
 */
export async function getForecastComparison(
  tenantId: string,
  forecastVersionId: string,
): Promise<ForecastComparisonData> {
  const empty: ForecastComparisonData = {
    ok: false,
    forecastLabel: "",
    budgetLabel: "",
    months: [],
    receitas: [],
    despesas: [],
    budgetByMonth: {},
    forecastByMonth: {},
  };
  const [fv] = await db
    .select()
    .from(schema.versions)
    .where(
      and(
        eq(schema.versions.id, forecastVersionId),
        eq(schema.versions.tenantId, tenantId),
        eq(schema.versions.kind, "forecast"),
      ),
    )
    .limit(1);
  if (!fv) return { ...empty, message: "Forecast não encontrado." };

  let budgetVersionId = fv.sourceVersionId;
  if (!budgetVersionId) {
    const budgets = await getProjectVersionsByKind(tenantId, fv.projectId, "budget");
    budgetVersionId = budgets[0]?.id ?? null;
  }
  if (!budgetVersionId) {
    return { ...empty, forecastLabel: fv.label, message: "Projeto sem Budget para comparar." };
  }
  const [bv] = await db
    .select({ label: schema.versions.label })
    .from(schema.versions)
    .where(eq(schema.versions.id, budgetVersionId))
    .limit(1);

  const [budgetData, forecastData] = await Promise.all([
    getBudgetPlanning(tenantId, fv.projectId, "budget", budgetVersionId),
    getBudgetPlanning(tenantId, fv.projectId, "forecast", forecastVersionId),
  ]);
  const months = forecastData.months.length ? forecastData.months : budgetData.months;

  const merge = (
    bRows: import("./planning").PlanningAccountRow[],
    fRows: import("./planning").PlanningAccountRow[],
  ): CompareRowP[] => {
    const map = new Map<string, CompareRowP>();
    for (const r of bRows)
      map.set(r.rowKey, { rowKey: r.rowKey, label: r.label, budget: r.total, forecast: 0 });
    for (const r of fRows) {
      const cur = map.get(r.rowKey);
      if (cur) cur.forecast = r.total;
      else map.set(r.rowKey, { rowKey: r.rowKey, label: r.label, budget: 0, forecast: r.total });
    }
    return [...map.values()];
  };

  const monthlyTotals = (rows: import("./planning").PlanningAccountRow[]) => {
    const out: Record<string, number> = {};
    for (const m of months) {
      let s = 0;
      for (const r of rows) s += Math.round(r.total * (Number(r.pct[m]) || 0)) / 100;
      out[m] = s;
    }
    return out;
  };
  const sumMonthly = (a: Record<string, number>, b: Record<string, number>) => {
    const out: Record<string, number> = {};
    for (const m of months) out[m] = (a[m] || 0) + (b[m] || 0);
    return out;
  };

  return {
    ok: true,
    forecastLabel: fv.label,
    budgetLabel: bv?.label ?? "Budget",
    months,
    receitas: merge(budgetData.receitas, forecastData.receitas),
    despesas: merge(budgetData.despesas, forecastData.despesas),
    budgetByMonth: sumMonthly(
      monthlyTotals(budgetData.receitas),
      monthlyTotals(budgetData.despesas),
    ),
    forecastByMonth: sumMonthly(
      monthlyTotals(forecastData.receitas),
      monthlyTotals(forecastData.despesas),
    ),
  };
}
```

### `src/lib/queries.ts` · linhas 701–723

`getProjectVersionsByKind`.

```ts
/** Versões de um tipo (budget/forecast) de um projeto — para seletores/criação. */
export async function getProjectVersionsByKind(
  tenantId: string,
  projectId: string,
  kind: "budget" | "forecast",
): Promise<{ id: string; label: string; status: string }[]> {
  const rows = await db
    .select({
      id: schema.versions.id,
      label: schema.versions.label,
      status: schema.versions.status,
    })
    .from(schema.versions)
    .where(
      and(
        eq(schema.versions.tenantId, tenantId),
        eq(schema.versions.projectId, projectId),
        eq(schema.versions.kind, kind),
      ),
    )
    .orderBy(asc(schema.versions.createdAt));
  return rows;
}
```

---

## 5. `src/lib/planning.ts`

### `src/lib/planning.ts`

```ts
/**
 * Utilidades do módulo de planejamento (Budget/Forecast) — modelo total + %.
 *
 * O período (colunas mensais) vem SEMPRE do cadastro do projeto (mês inicial /
 * mês final). O valor mensal de cada conta é derivado do total pela distribuição
 * percentual: valor = total × pct / 100.
 */

/** "MM/YYYY" → índice absoluto de mês (ou null se inválido). */
export function monthKeyIndex(mk: string): number | null {
  const p = (mk || "").split("/");
  if (p.length !== 2) return null;
  const m = Number(p[0]);
  const y = Number(p[1]);
  if (!m || !y || m < 1 || m > 12) return null;
  return y * 12 + (m - 1);
}

function idxToKey(idx: number): string {
  const y = Math.floor(idx / 12);
  const m = (idx % 12) + 1;
  return `${String(m).padStart(2, "0")}/${y}`;
}

/**
 * Competências "MM/YYYY" do período do projeto (inclusive). Vazio se o período
 * não estiver definido ou for inválido (fim antes do início).
 */
export function projectPeriodMonths(
  mesInicial: string | null | undefined,
  mesFinal: string | null | undefined,
): string[] {
  const a = monthKeyIndex((mesInicial || "").trim());
  const b = monthKeyIndex((mesFinal || "").trim());
  if (a == null || b == null || b < a) return [];
  const out: string[] = [];
  for (let i = a; i <= b; i++) out.push(idxToKey(i));
  return out;
}

/** Data interna "MM/DD/YYYY" → competência "MM/YYYY" (ou null). */
export function monthKeyOfInternalDate(d: string | null | undefined): string | null {
  const p = (d || "").trim().split("/");
  if (p.length !== 3) return null;
  const m = Number(p[0]);
  const y = Number(p[2]);
  if (!m || !y || m < 1 || m > 12) return null;
  return `${String(m).padStart(2, "0")}/${y}`;
}

/**
 * Meses do período a partir das DATAS de início e fim do projeto (fonte oficial
 * das colunas do Budget/Forecast). "MM/DD/YYYY" → competências "MM/YYYY".
 */
export function projectPeriodMonthsFromDates(
  startDate: string | null | undefined,
  endDate: string | null | undefined,
): string[] {
  return projectPeriodMonths(
    monthKeyOfInternalDate(startDate),
    monthKeyOfInternalDate(endDate),
  );
}

/**
 * Recortes por ANO-CALENDÁRIO para os seletores de período dos relatórios:
 * 2025, 2026, 2027… do ano mais antigo com dados (ou o ano atual) até o ano
 * atual + `fwd` (padrão 5). Cada opção traz os 12 meses "MM/YYYY" do ano.
 */
export function calendarYearWindows(
  months: string[],
  currentYear: number,
  fwd: number = 5,
): { value: string; label: string; months: string[] }[] {
  const dataYears = months
    .map((m) => Number(m.split("/")[1]))
    .filter((y) => Number.isFinite(y) && y > 0);
  const start = Math.min(currentYear, ...(dataYears.length ? dataYears : [currentYear]));
  const end = Math.max(currentYear + fwd, ...(dataYears.length ? dataYears : [currentYear]));
  const out: { value: string; label: string; months: string[] }[] = [];
  for (let y = start; y <= end; y++) {
    out.push({
      value: String(y),
      label: String(y),
      months: Array.from({ length: 12 }, (_, i) => `${String(i + 1).padStart(2, "0")}/${y}`),
    });
  }
  return out;
}

/** Uma conta (linha) do Budget/Forecast: total + percentual/valor por mês. */
export interface PlanningAccountRow {
  /** identidade da linha = código do grupo do Plano de Contas (ou chave legada). */
  rowKey: string;
  label: string;
  dreCategory: string | null;
  /** total planejado da conta no projeto. */
  total: number;
  /** percentual por mês ("MM/YYYY" → %). */
  pct: Record<string, number>;
  /** conta ativa no Plano de Contas (legadas = true). */
  ativo: boolean;
  /** existe como grupo no Plano de Contas atual (false = linha legada). */
  fromChart: boolean;
}

export interface PlanningVersion {
  id: string;
  label: string;
  kind: string;
  status: string;
  isDefault: boolean;
  locked: boolean;
  sourceVersionId: string | null;
}

export interface BudgetPlanningData {
  project: {
    id: string;
    name: string;
    mesInicial: string | null;
    mesFinal: string | null;
    /** indicador "Recursos próprios" (valor do cadastro; 0 se não informado). */
    recursosProprios: number;
  };
  /** true quando o período está definido no cadastro do projeto. */
  hasPeriod: boolean;
  months: string[];
  versions: PlanningVersion[];
  versionId: string | null;
  receitas: PlanningAccountRow[];
  despesas: PlanningAccountRow[];
}

/** Valor mensal a partir do total e do percentual (arredondado a centavos). */
export function monthValue(total: number, pct: number): number {
  return Math.round(total * pct) / 100;
}

/** Soma dos percentuais de uma conta no período. */
export function sumPct(pct: Record<string, number>, months: string[]): number {
  return months.reduce((a, m) => a + (Number(pct[m]) || 0), 0);
}
```

---

## 6. Tabela `version` e o enum que ela usa

A tabela referencia um único enum: `versionKindEnum`. As colunas `status` e
`locked` **não** são enums — `status` é `text` com default `"Rascunho"`, e
`locked` é `boolean` com default `false`.

### `src/lib/db/schema.ts` · linhas 183–188

`versionKindEnum` — o enum usado pela coluna `kind`.

```ts
export const versionKindEnum = pgEnum("version_kind", [
  "budget",
  "forecast",
  "atual",
  "custom",
]);
```

### `src/lib/db/schema.ts` · linhas 360–397

Tabela `version`.

```ts
/**
 * Versão/cenário de planejamento de um projeto. Cada versão isola seus dados
 * de movimento (units, permutas, reembolsos, caixa, despesas). Limite de 6 por
 * projeto (3 fixas + 3 customizadas). Ver docs/SPEC.md §4.
 */
export const versions = pgTable(
  "version",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    projectId: uuid("project_id")
      .notNull()
      .references(() => projects.id, { onDelete: "cascade" }),
    tenantId: uuid("tenant_id")
      .notNull()
      .references(() => tenants.id, { onDelete: "cascade" }),
    /** chave estável: "budget" | "forecast" | "atual" | slug da customizada */
    key: text("key").notNull(),
    kind: versionKindEnum("kind").notNull(),
    label: text("label").notNull(),
    color: text("color").notNull(),
    isDefault: boolean("is_default").notNull().default(false),
    /** congelada: bloqueia lançamentos/edições (ver Configuração da Versão). */
    locked: boolean("locked").notNull().default(false),
    /** status do workflow da versão: "Rascunho" | "Concluído" | "Aprovado". */
    status: text("status").notNull().default("Rascunho"),
    /**
     * Versão de Budget que originou este Forecast (rastreabilidade/comparação).
     * NULL para Budget/Atual ou Forecast sem origem. O Forecast é um snapshot
     * independente — esta referência NÃO o mantém sincronizado com o Budget.
     */
    sourceVersionId: uuid("source_version_id").references(
      (): AnyPgColumn => versions.id,
      { onDelete: "set null" },
    ),
    createdAt: timestamp("created_at", { mode: "date" }).notNull().defaultNow(),
  },
  (v) => [unique("version_project_key_uq").on(v.projectId, v.key)],
);
```

---

## 7. Onde `version.locked` é GRAVADO

Há **três** lugares no repositório que gravam a coluna, não apenas
`toggleVersionLock`. Um é UPDATE; os outros dois são INSERT que fixam o valor
explicitamente na criação do Forecast.

| Arquivo | Linha | Operação | Trecho |
|---|---|---|---|
| `src/lib/actions/versions.ts` | 206 | UPDATE | `await db.update(schema.versions).set({ locked }).where(eq(schema.versions.id, versionId));` |
| `src/lib/actions/planning.ts` | 230 | INSERT | `locked: false,` — dentro de `createForecastFromBudget` |
| `src/lib/actions/planning.ts` | 297 | INSERT | `locked: false,` — dentro de `duplicateForecast` |

Nenhum outro caminho grava a coluna:

- `updateVersion` (`versions.ts:180–200`) monta o `set` com apenas `label` e
  `color`; não alcança `locked`.
- `setDefaultVersion` (`versions.ts:217–232`) grava só `isDefault`.
- Os demais INSERT em `schema.versions` — `actions/projects.ts:109`,
  `actions/versions.ts:34`, `lib/tenant/provision.ts:117` e `lib/db/seed.ts:138`
  — não informam `locked`; a coluna nasce com o default `false` do schema.

Para referência, o trecho do UPDATE por inteiro:

### `src/lib/actions/versions.ts` · linhas 203–216

`toggleVersionLock` — o único UPDATE de `locked`.

```ts
export async function toggleVersionLock(versionId: string, locked: boolean) {
  const ctx = await guardVersionEdit(versionId);
  if (!ctx) return;
  await db.update(schema.versions).set({ locked }).where(eq(schema.versions.id, versionId));
  await logAudit({
    tenantId: ctx.tenant.id,
    userId: ctx.userId,
    action: "version.lock",
    entity: "version",
    entityId: versionId,
    meta: { locked },
  });
  revalidatePath("/", "layout");
}
```

---

## 8. Ocorrências de `version.status`

### Escrita

| Arquivo | Linha | Operação | Trecho |
|---|---|---|---|
| `src/lib/actions/planning.ts` | 335–336 | UPDATE | `.update(schema.versions)` / `.set({ status })` — em `setVersionStatus` |
| `src/lib/actions/planning.ts` | 231 | INSERT | `status: "Rascunho",` — em `createForecastFromBudget` |
| `src/lib/actions/planning.ts` | 298 | INSERT | `status: "Rascunho",` — em `duplicateForecast` |

Os demais INSERT em `schema.versions` (`projects.ts:109`, `versions.ts:34`,
`provision.ts:117`, `seed.ts:138`) não informam `status`; a coluna nasce com o
default `"Rascunho"` do schema. `updateVersion` não escreve `status`.

### Leitura

| Arquivo | Linha | Trecho |
|---|---|---|
| `src/lib/queries.ts` | 711 | `status: schema.versions.status,` — projeção em `getProjectVersionsByKind` |
| `src/lib/queries.ts` | 766 | `status: v.status,` — mapeamento das versões em `getBudgetPlanning` |
| `src/lib/planning.ts` | 111 | `status: string;` — campo do tipo `PlanningVersionRow` |
| `src/components/app/budget-planning-screen.tsx` | 349 | `value={version.status}` — valor do seletor de status na tela |

### Nenhuma consulta filtra por status

**Confirmado explicitamente:** não existe no repositório nenhuma cláusula
`where`/`eq`/`inArray` sobre `schema.versions.status`. A coluna é apenas
projetada e exibida; nenhuma listagem, relatório ou regra de negócio restringe
resultados por ela. A única referência direta à coluna em uma consulta é a
projeção da linha 711.

Para referência, a action de escrita por inteiro:

### `src/lib/actions/planning.ts` · linhas 319–348

`setVersionStatus` — o único UPDATE de `status`.

```ts
export async function setVersionStatus(versionId: string, status: string) {
  const ctx = await getActiveContext();
  if (!ctx) throw new Error("Sessão inválida.");
  const allowed = ["Rascunho", "Concluído", "Aprovado"];
  if (!allowed.includes(status)) throw new Error("Status inválido.");
  const [version] = await db
    .select()
    .from(schema.versions)
    .where(and(eq(schema.versions.id, versionId), eq(schema.versions.tenantId, ctx.tenant.id)))
    .limit(1);
  if (!version) return;
  const screen = screenOf(version.kind);
  if (!screen || !can(ctx.perms, screen, "editar")) {
    throw new Error("Sem permissão.");
  }
  await db
    .update(schema.versions)
    .set({ status })
    .where(eq(schema.versions.id, versionId));
  await logAudit({
    tenantId: ctx.tenant.id,
    userId: ctx.userId,
    action: "version.status",
    entity: "version",
    entityId: versionId,
    meta: { status },
  });
  revalidatePath("/budget");
  revalidatePath("/forecast");
}
```

