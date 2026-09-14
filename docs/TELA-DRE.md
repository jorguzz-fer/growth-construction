# TELA-DRE — código na íntegra

Coleta do código da tela **DRE — Demonstração de Resultado** (`/dre`), em
`main` (commit `45f4ce3`). Sem resumo, sem análise.

> **Três premissas do pedido não se confirmam no código. Registro antes de
> tudo, para a leitura não partir delas:**
>
> 1. **`versionInputsByMonth` não está em `queries.ts`.** É uma função local
>    do próprio `page.tsx` (linha 109), não exportada.
> 2. **A DRE não lê `despesa_parcela`.** Ela lê `despesa` via
>    `getExpenseRows` → `getDespesas`. `getParcelasByVersion` existe, mas é
>    consumida por `/despesas` e pelo Fluxo de Caixa — não pela DRE. Ver (d).
> 3. **`chart_account` não tem coluna de categoria da DRE.** Tem `natureza`
>    (`"receita"`/`"despesa"`), que é outra coisa e não é lida pela DRE.
>    Ver (f) e (h).

> **Itens (a) e (e) exigem DADOS de produção.** Esta sessão não tem
> `DATABASE_URL` — não há banco para consultar. As seções trazem o SQL
> somente-leitura pronto, e param onde só a consulta responde.

**Árvore de dependências própria:**

```
dre/page.tsx
├── components/app/page-header.tsx
├── components/app/dre-controls.tsx
└── components/app/version-multiselect.tsx

Funções LOCAIS do page.tsx (não exportadas):
  monthIndex · enumMonths · aggregateInputs · addInto · emptyInputs
  defaultVersionId · versionIdOfKind · versionInputsByMonth
  projectInputsByMonth · projectInputs · versionInputs · waterfall

queries.ts:  getExpenseRows · getInccRows · getMonthlyRevenue
             getPermutas · permToResale
calc:        permutaRevenueByMonth
planning:    calendarYearWindows
action:      getEncargosByVersion   (actions/pagamentos.ts — leitura)
consulta inline: schema.versions em versionIdOfKind (page.tsx:92–96)
```

---

## 1. A página

### `src/app/(app)/dre/page.tsx`

```tsx
import { asc, eq } from "drizzle-orm";
import { db, schema } from "@/lib/db";
import { getActiveContext, type Project } from "@/lib/context";
import {
  getExpenseRows,
  getInccRows,
  getMonthlyRevenue,
  getPermutas,
  permToResale,
} from "@/lib/queries";
import { permutaRevenueByMonth } from "@/lib/calc";
import { calendarYearWindows } from "@/lib/planning";
import { getEncargosByVersion } from "@/lib/actions/pagamentos";
import { brl0, pct1 } from "@/lib/utils";
import { PageHeader } from "@/components/app/page-header";
import { Card, CardContent } from "@/components/ui/card";
import { Table, THead, TH, TR, TD } from "@/components/ui/table";
import { DreControls } from "@/components/app/dre-controls";
import { VersionMultiSelect } from "@/components/app/version-multiselect";

export const dynamic = "force-dynamic";

interface Inputs {
  receita: number;
  custoVar: number;
  byCat: Record<string, number>;
}

/** Chave de "sem competência": entra só no acumulado (sem filtro de período). */
const NO_COMP = "";

const emptyInputs = (): Inputs => ({ receita: 0, custoVar: 0, byCat: {} });

function addInto(target: Inputs, src: Inputs) {
  target.receita += src.receita;
  target.custoVar += src.custoVar;
  for (const [k, v] of Object.entries(src.byCat))
    target.byCat[k] = (target.byCat[k] || 0) + v;
}

/** Índice absoluto de mês a partir de "MM/YYYY" (ou null se inválido). */
function monthIndex(mm: string): number | null {
  const p = mm.split("/");
  if (p.length !== 2) return null;
  const m = Number(p[0]);
  const y = Number(p[1]);
  if (!m || !y) return null;
  return y * 12 + (m - 1);
}

/** Competências "MM/YYYY" entre `de` e `ate` (inclusive; aceita ordem trocada). */
function enumMonths(de: string, ate: string): string[] {
  const a = monthIndex(de);
  const b = monthIndex(ate);
  if (a == null || b == null) return [];
  const [lo, hi] = a <= b ? [a, b] : [b, a];
  const out: string[] = [];
  for (let i = lo; i <= hi; i++) {
    const y = Math.floor(i / 12);
    const m = (i % 12) + 1;
    out.push(`${String(m).padStart(2, "0")}/${y}`);
  }
  return out;
}

/** Soma os inputs mensais dentro do período (ou tudo, quando `periodMonths` é nulo). */
function aggregateInputs(
  byMonth: Record<string, Inputs>,
  periodMonths: Set<string> | null,
): Inputs {
  const out = emptyInputs();
  for (const [mm, inp] of Object.entries(byMonth)) {
    if (periodMonths && !periodMonths.has(mm)) continue;
    addInto(out, inp);
  }
  return out;
}

async function defaultVersionId(projectId: string): Promise<string | null> {
  return versionIdOfKind(projectId, "atual");
}

/**
 * Id da versão de um tipo (atual/forecast/budget) do projeto — usado na visão
 * "Empresa toda", onde as versões são por projeto e o usuário escolhe o TIPO.
 * Cai para Atual → default → 1ª se o tipo pedido não existir.
 */
async function versionIdOfKind(
  projectId: string,
  kind: string,
): Promise<string | null> {
  const vs = await db
    .select()
    .from(schema.versions)
    .where(eq(schema.versions.projectId, projectId))
    .orderBy(asc(schema.versions.createdAt));
  return (
    vs.find((v) => v.kind === kind) ??
    vs.find((v) => v.kind === "atual") ??
    vs.find((v) => v.isDefault) ??
    vs[0]
  )?.id ?? null;
}

/**
 * Inputs da DRE detalhados por mês (competência). Um único fetch alimenta tanto
 * a visão consolidada (soma dos meses) quanto a visão mensal (coluna por mês).
 */
async function versionInputsByMonth(
  vid: string,
  projectId: string,
): Promise<Record<string, Inputs>> {
  const [revenue, despesas, permutas, encargosMes] = await Promise.all([
    getMonthlyRevenue(vid, projectId),
    getExpenseRows(vid),
    getPermutas(vid),
    getEncargosByVersion(vid),
  ]);
  const out: Record<string, Inputs> = {};
  const bucket = (mm: string | null) => (out[mm ?? NO_COMP] ??= emptyInputs());

  // Receita do projeto.
  for (const [mm, v] of Object.entries(revenue)) bucket(mm).receita += v;
  // Receita da revenda de bens de permuta (inclui escambo), item 10.
  const permRev = permutaRevenueByMonth(permToResale(permutas));
  for (const [mm, v] of Object.entries(permRev)) bucket(mm).receita += v;
  // Despesas por categoria da DRE.
  for (const d of despesas) {
    if (!d.categoriaDre) continue;
    const b = bucket(d.competencia);
    b.byCat[d.categoriaDre] = (b.byCat[d.categoriaDre] || 0) + Number(d.valor);
    // Receita/Custo Variável lançados como despesa entram na linha própria.
    if (d.categoriaDre === "Receita") b.receita += Number(d.valor);
    if (d.categoriaDre === "Custo Variável") b.custoVar += Number(d.valor);
  }
  // Custo Variável vem apenas das despesas lançadas como "Custo Variável"
  // (por competência) — a medição de obra NÃO entra na DRE (evita duplicidade).
  // Encargos financeiros (multa/juros/outros − desconto) por data de pagamento.
  for (const [mm, v] of Object.entries(encargosMes))
    bucket(mm).byCat["Despesas Financeiras"] =
      (bucket(mm).byCat["Despesas Financeiras"] || 0) + v;
  return out;
}

async function projectInputsByMonth(
  project: Project,
  versionKind?: string,
): Promise<Record<string, Inputs>> {
  const vid = versionKind
    ? await versionIdOfKind(project.id, versionKind)
    : await defaultVersionId(project.id);
  if (!vid) return {};
  return versionInputsByMonth(vid, project.id);
}

async function projectInputs(
  project: Project,
  periodMonths: Set<string> | null,
  versionKind?: string,
): Promise<Inputs> {
  return aggregateInputs(await projectInputsByMonth(project, versionKind), periodMonths);
}

async function versionInputs(
  vid: string,
  projectId: string,
  periodMonths: Set<string> | null,
): Promise<Inputs> {
  return aggregateInputs(await versionInputsByMonth(vid, projectId), periodMonths);
}

interface DreRow {
  label: string;
  value: number;
  kind: "item" | "sub" | "final";
}

/** Calcula a cascata da DRE (linhas) a partir dos inputs agregados. */
function waterfall(all: Inputs[]): { rows: DreRow[]; R: number } {
  const R = all.reduce((a, x) => a + x.receita, 0);
  const CV = all.reduce((a, x) => a + x.custoVar, 0);
  const cat = (k: string) => all.reduce((a, x) => a + (x.byCat[k] || 0), 0);
  const CF = cat("Custo Fixo");
  const DV = cat("Despesa Variável");
  const DF = cat("Despesa Fixa");
  const RET = cat("Retiradas");
  const INV = cat("Investimento");
  const EMP = cat("Empréstimos");
  const DFIN = cat("Despesas Financeiras");
  // Margem de Contribuição = Receita − Custo Variável − Despesa Variável
  // (definição de negócio confirmada pelo cliente). O EBITDA continua sendo o
  // mesmo total: a mudança é só na composição das linhas até a MC.
  const MC = R - CV - DV;
  const EBITDA = MC - (CF + DF + RET);
  const RF = EBITDA - INV - EMP - DFIN;
  return {
    R,
    rows: [
      { label: "Receita", value: R, kind: "item" },
      { label: "(−) Custo Variável", value: CV, kind: "item" },
      { label: "(−) Despesa Variável", value: DV, kind: "item" },
      { label: "= Margem de Contribuição", value: MC, kind: "sub" },
      { label: "(−) Custo Fixo", value: CF, kind: "item" },
      { label: "(−) Despesa Fixa", value: DF, kind: "item" },
      { label: "(−) Retiradas", value: RET, kind: "item" },
      { label: "= EBITDA", value: EBITDA, kind: "sub" },
      { label: "(−) Investimentos", value: INV, kind: "item" },
      { label: "(−) Empréstimos", value: EMP, kind: "item" },
      { label: "(−) Despesas Financeiras (juros/multas)", value: DFIN, kind: "item" },
      { label: "= Resultado Final", value: RF, kind: "final" },
    ],
  };
}

export default async function DREPage({
  searchParams,
}: {
  searchParams: Promise<{
    proj?: string;
    periodo?: string;
    vs?: string;
    view?: string;
    de?: string;
    ate?: string;
    vkind?: string;
  }>;
}) {
  const ctx = await getActiveContext();
  if (!ctx) return null;
  const sp = await searchParams;
  const monthly = sp.view === "mensal";

  const projParam = sp.proj ?? ctx.project.id;
  const isAll = projParam === "all";
  const selectedProjects = isAll
    ? ctx.projects
    : [ctx.projects.find((p) => p.id === projParam) ?? ctx.project];

  // Janelas de ano a partir da tabela INCC. Para "empresa toda", usa a união
  // dos meses de todos os projetos selecionados, de modo que o filtro de
  // período continua editável em qualquer combinação de filtros.
  const inccAll = await Promise.all(
    selectedProjects.map((p) => getInccRows(p.id)),
  );
  // Eixo a partir da tabela INCC dos projetos selecionados (âncora dos dados).
  const axis = [
    ...new Set(inccAll.flat().map((r) => r.m)),
  ].sort((a, b) => {
    const [ma, ya] = a.split("/").map(Number);
    const [mb, yb] = b.split("/").map(Number);
    return ya - yb || ma - mb;
  });
  // Recortes por ano-calendário: 2025, 2026, … até o ano atual + 5.
  const years = calendarYearWindows(axis, new Date().getFullYear());
  const periodo = sp.periodo ?? "acum";
  const customDe = (sp.de ?? "").trim();
  const customAte = (sp.ate ?? "").trim();
  let periodMonths: Set<string> | null;
  if (periodo === "custom") {
    // Recorte customizado por competência (De / Até em MM/AAAA).
    if (customDe && customAte) {
      periodMonths = new Set(enumMonths(customDe, customAte));
    } else if (customDe || customAte) {
      // Limite aberto de um lado: filtra o eixo pelo(s) limite(s) informado(s).
      const a = customDe ? monthIndex(customDe) : null;
      const b = customAte ? monthIndex(customAte) : null;
      periodMonths = new Set(
        axis.filter((m) => {
          const idx = monthIndex(m);
          if (idx == null) return false;
          if (a != null && idx < a) return false;
          if (b != null && idx > b) return false;
          return true;
        }),
      );
    } else {
      periodMonths = null; // sem limites → acumulado
    }
  } else if (periodo !== "acum") {
    periodMonths = new Set(years.find((y) => y.value === periodo)?.months ?? []);
  } else {
    periodMonths = null;
  }

  const scopeLabel = isAll
    ? "Empresa toda (matriz + filiais + projetos)"
    : selectedProjects[0].name;

  // Comparação de 1–3 versões: só quando o projeto selecionado é o ativo
  // (cujas versões estão no contexto). Caso contrário, coluna única agregada.
  const canCompareVersions = !isAll && selectedProjects[0].id === ctx.project.id;
  // Sem seleção explícita, a DRE abre na versão ATUAL (dados reais).
  const atualVersion = ctx.versions.find((v) => v.kind === "atual") ?? ctx.version;
  const vsIds = (sp.vs ?? "").split(",").filter(Boolean);
  const compareVersions = canCompareVersions
    ? (vsIds.length
        ? ctx.versions.filter((v) => vsIds.includes(v.id))
        : [atualVersion]
      ).slice(0, 3)
    : [];

  // Tipo de versão para a agregação por projeto (visão "Empresa toda" e
  // projetos não-ativos): Atual (padrão) / Forecast / Budget.
  const vkind = ["atual", "forecast", "budget"].includes(sp.vkind ?? "")
    ? (sp.vkind as string)
    : "atual";

  let columns: { label: string; color?: string; wf: ReturnType<typeof waterfall> }[];
  if (monthly) {
    // Visão mensal: uma coluna por mês do período + coluna "Total". Usa a série
    // selecionada (versão de comparação, quando aplicável, ou o escopo agregado).
    let byMonth: Record<string, Inputs>;
    if (canCompareVersions && compareVersions.length >= 1) {
      byMonth = await versionInputsByMonth(compareVersions[0].id, ctx.project.id);
    } else {
      byMonth = {};
      const perP = await Promise.all(
        selectedProjects.map((p) => projectInputsByMonth(p, vkind)),
      );
      for (const bm of perP)
        for (const [mm, inp] of Object.entries(bm))
          addInto((byMonth[mm] ??= emptyInputs()), inp);
    }
    const monthsToShow = periodMonths
      ? [...periodMonths].sort((a, b) => (monthIndex(a) ?? 0) - (monthIndex(b) ?? 0))
      : axis;
    columns = monthsToShow.map((mm) => ({
      label: mm,
      wf: waterfall([byMonth[mm] ?? emptyInputs()]),
    }));
    columns.push({
      label: "Total",
      wf: waterfall([aggregateInputs(byMonth, periodMonths)]),
    });
  } else if (compareVersions.length >= 1) {
    const perV = await Promise.all(
      compareVersions.map((v) => versionInputs(v.id, ctx.project.id, periodMonths)),
    );
    columns = compareVersions.map((v, i) => ({
      label: v.label,
      color: v.color,
      wf: waterfall([perV[i]]),
    }));
  } else {
    const all = await Promise.all(
      selectedProjects.map((p) => projectInputs(p, periodMonths, vkind)),
    );
    columns = [{ label: scopeLabel, wf: waterfall(all) }];
  }
  const multi = columns.length > 1;

  const periodLabel =
    periodo === "custom"
      ? customDe && customAte
        ? `Personalizado (${customDe} – ${customAte})`
        : customDe
          ? `Personalizado (a partir de ${customDe})`
          : customAte
            ? `Personalizado (até ${customAte})`
            : "Personalizado (informe De / Até)"
      : periodMonths
        ? years.find((y) => y.value === periodo)?.label
        : "Acumulado (todo o horizonte)";
  const labels = columns[0].wf.rows;

  return (
    <>
      <PageHeader
        eyebrow={scopeLabel}
        title="DRE — Demonstração de Resultado"
        subtitle={`${periodLabel}${
          monthly
            ? " · visão mensal"
            : multi
              ? " · comparativo de versões"
              : " · análise vertical (% da receita)"
        }`}
        actions={
          <div className="flex flex-wrap items-end gap-3">
            <DreControls
              projects={ctx.projects.map((p) => ({
                id: p.id,
                label: p.kind === "office" ? `${p.name} · Unidade/Escritório` : p.name,
              }))}
              proj={projParam}
              periods={[
                { value: "acum", label: "Acumulado (todos os anos)" },
                ...years.map((y) => ({ value: y.value, label: y.label })),
                { value: "custom", label: "Personalizado (De / Até)" },
              ]}
              periodo={periodo}
              periodDisabled={false}
              view={monthly ? "mensal" : ""}
              vs={sp.vs ?? ""}
              de={customDe}
              ate={customAte}
              showVersionKind={isAll}
              versionKind={vkind}
            />
            {canCompareVersions && (
              <VersionMultiSelect
                versions={ctx.versions.map((v) => ({ id: v.id, label: v.label, color: v.color }))}
                selected={compareVersions.map((v) => v.id)}
              />
            )}
          </div>
        }
      />

      <Card>
        <CardContent className="p-5">
          <Table>
            <THead>
              <tr>
                <TH>Item</TH>
                {columns.map((c) => (
                  <TH key={c.label} className="text-right">
                    <span className="inline-flex items-center gap-1.5">
                      {c.color && (
                        <span className="inline-block h-2.5 w-2.5 rounded-full" style={{ background: c.color }} />
                      )}
                      {c.label}
                    </span>
                  </TH>
                ))}
                {!multi && <TH className="text-right">% Receita</TH>}
              </tr>
            </THead>
            <tbody>
              {labels.map((lbl, ri) => {
                const isSub = lbl.kind !== "item";
                return (
                  <TR key={lbl.label} className={isSub ? "bg-[var(--color-surface2)]" : undefined}>
                    <TD
                      className={
                        lbl.kind === "final"
                          ? "font-semibold text-[var(--color-accent)]"
                          : isSub
                            ? "font-semibold text-[var(--color-ink)]"
                            : "text-[var(--color-ink2)]"
                      }
                    >
                      {lbl.label}
                    </TD>
                    {columns.map((c) => {
                      const v = c.wf.rows[ri].value;
                      return (
                        <TD
                          key={c.label}
                          className={`text-right font-[family-name:var(--font-mono)] ${
                            isSub ? "font-semibold" : ""
                          } ${
                            v < 0
                              ? "text-[var(--color-danger)]"
                              : lbl.kind === "final" || lbl.kind === "sub"
                                ? "text-[var(--color-success)]"
                                : "text-[var(--color-ink)]"
                          }`}
                        >
                          {brl0(v)}
                        </TD>
                      );
                    })}
                    {!multi && (
                      <TD className="text-right font-[family-name:var(--font-mono)] text-[var(--color-ink3)]">
                        {pct1(columns[0].wf.R > 0 ? (columns[0].wf.rows[ri].value / columns[0].wf.R) * 100 : 0)}
                      </TD>
                    )}
                  </TR>
                );
              })}
            </tbody>
          </Table>
        </CardContent>
      </Card>
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

### `src/components/app/dre-controls.tsx`

```tsx
"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { useEffect, useState, useTransition } from "react";
import { Select } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { MonthField } from "@/components/ui/date-field";

export function DreControls({
  projects,
  proj,
  periods,
  periodo,
  periodDisabled,
  view,
  vs,
  de,
  ate,
  showVersionKind = false,
  versionKind = "atual",
}: {
  projects: { id: string; label: string }[];
  proj: string;
  periods: { value: string; label: string }[];
  periodo: string;
  periodDisabled: boolean;
  view: string;
  vs: string;
  /** Recorte customizado (competência interna "MM/YYYY"). */
  de: string;
  ate: string;
  /** Mostra o seletor de TIPO de versão (usado na visão "Empresa toda"). */
  showVersionKind?: boolean;
  versionKind?: string;
}) {
  const router = useRouter();
  const sp = useSearchParams();
  const [pending, start] = useTransition();

  // Estado local dos campos De/Até (aplicados via botão, para não navegar a
  // cada tecla). Sincroniza quando a URL muda por fora.
  const [deVal, setDeVal] = useState(de);
  const [ateVal, setAteVal] = useState(ate);
  useEffect(() => setDeVal(de), [de]);
  useEffect(() => setAteVal(ate), [ate]);

  const go = (
    patch: Partial<
      Record<"proj" | "periodo" | "view" | "vs" | "de" | "ate" | "vkind", string>
    >,
  ) => {
    const params = new URLSearchParams(sp.toString());
    const next = { proj, periodo, view, vs, de, ate, ...patch };
    params.set("proj", next.proj);
    params.set("periodo", next.periodo);
    if (patch.vkind !== undefined) {
      if (patch.vkind && patch.vkind !== "atual") params.set("vkind", patch.vkind);
      else params.delete("vkind");
    }
    if (next.view) params.set("view", next.view);
    else params.delete("view");
    if (next.vs) params.set("vs", next.vs);
    else params.delete("vs");
    // De/Até só valem no recorte customizado.
    if (next.periodo === "custom") {
      if (next.de) params.set("de", next.de);
      else params.delete("de");
      if (next.ate) params.set("ate", next.ate);
      else params.delete("ate");
    } else {
      params.delete("de");
      params.delete("ate");
    }
    start(() => router.push(`/dre?${params.toString()}`));
  };

  const aplicarCustom = () => go({ periodo: "custom", de: deVal, ate: ateVal });

  return (
    <div className="flex flex-wrap items-center gap-2">
      <Select
        value={proj}
        disabled={pending}
        onChange={(e) => go({ proj: e.target.value })}
        className="h-9 w-auto"
      >
        {projects.map((p) => (
          <option key={p.id} value={p.id}>
            {p.label}
          </option>
        ))}
        <option value="all">Empresa toda (matriz + filiais + projetos)</option>
      </Select>
      <Select
        value={periodo}
        disabled={pending || periodDisabled}
        onChange={(e) => go({ periodo: e.target.value })}
        className="h-9 w-auto"
      >
        {periods.map((p) => (
          <option key={p.value} value={p.value}>
            {p.label}
          </option>
        ))}
      </Select>
      {showVersionKind && (
        <Select
          value={versionKind}
          disabled={pending}
          onChange={(e) => go({ vkind: e.target.value })}
          className="h-9 w-auto"
          title="Tipo de versão aplicado a todos os projetos"
        >
          <option value="atual">Atual (real)</option>
          <option value="forecast">Forecast</option>
          <option value="budget">Budget</option>
        </Select>
      )}
      {periodo === "custom" && (
        <div className="flex flex-wrap items-end gap-2">
          <div>
            <span className="mb-0.5 block font-[family-name:var(--font-mono)] text-[9px] uppercase tracking-wide text-[var(--color-ink3)]">
              De
            </span>
            <MonthField value={deVal} onChange={setDeVal} className="h-9 w-[110px]" />
          </div>
          <div>
            <span className="mb-0.5 block font-[family-name:var(--font-mono)] text-[9px] uppercase tracking-wide text-[var(--color-ink3)]">
              Até
            </span>
            <MonthField value={ateVal} onChange={setAteVal} className="h-9 w-[110px]" />
          </div>
          <Button
            type="button"
            variant="outline"
            disabled={pending}
            onClick={aplicarCustom}
            className="h-9"
          >
            Aplicar
          </Button>
        </div>
      )}
      <Select
        value={view}
        disabled={pending}
        onChange={(e) => go({ view: e.target.value })}
        className="h-9 w-auto"
      >
        <option value="">Consolidado</option>
        <option value="mensal">Mensal (coluna por mês)</option>
      </Select>
    </div>
  );
}
```

### `src/components/app/version-multiselect.tsx`

```tsx
"use client";

import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useTransition } from "react";

export interface VersionOpt {
  id: string;
  label: string;
  color: string;
}

/**
 * Seletor de 1 a 3 versões para comparação nos relatórios. Persiste em `vs`
 * (ids separados por vírgula) na URL, preservando os demais parâmetros.
 */
export function VersionMultiSelect({
  versions,
  selected,
  max = 3,
}: {
  versions: VersionOpt[];
  selected: string[];
  max?: number;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const sp = useSearchParams();
  const [pending, start] = useTransition();

  const toggle = (id: string) => {
    let next: string[];
    if (selected.includes(id)) {
      next = selected.filter((x) => x !== id);
      if (next.length === 0) next = [id]; // mantém pelo menos uma
    } else {
      next = selected.length >= max ? [...selected.slice(1), id] : [...selected, id];
    }
    const params = new URLSearchParams(sp.toString());
    params.set("vs", next.join(","));
    start(() => router.push(`${pathname}?${params.toString()}`));
  };

  return (
    <div className="flex flex-wrap items-center gap-1.5">
      <span className="font-[family-name:var(--font-mono)] text-[10px] uppercase tracking-wide text-[var(--color-ink3)]">
        Versões
      </span>
      {versions.map((v) => {
        const on = selected.includes(v.id);
        return (
          <button
            key={v.id}
            disabled={pending}
            onClick={() => toggle(v.id)}
            className={`flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-[12px] transition-colors ${
              on
                ? "border-[var(--color-accent2)] bg-[var(--color-accent4)] text-[var(--color-ink)]"
                : "border-[var(--color-accent2)]/20 text-[var(--color-ink3)] hover:bg-[var(--color-surface2)]"
            }`}
          >
            <span className="inline-block h-2.5 w-2.5 rounded-full" style={{ background: v.color }} />
            {v.label}
          </button>
        );
      })}
      <span className="text-[11px] text-[var(--color-ink4)]">(até {max})</span>
    </div>
  );
}
```

---

## 3. As funções de dados


`versionInputsByMonth` entra aqui por ser o núcleo, apesar de viver no
`page.tsx`.

### `src/app/(app)/dre/page.tsx` · linhas 105–143

`versionInputsByMonth` — a função local que monta os inputs por competência.

```tsx
/**
 * Inputs da DRE detalhados por mês (competência). Um único fetch alimenta tanto
 * a visão consolidada (soma dos meses) quanto a visão mensal (coluna por mês).
 */
async function versionInputsByMonth(
  vid: string,
  projectId: string,
): Promise<Record<string, Inputs>> {
  const [revenue, despesas, permutas, encargosMes] = await Promise.all([
    getMonthlyRevenue(vid, projectId),
    getExpenseRows(vid),
    getPermutas(vid),
    getEncargosByVersion(vid),
  ]);
  const out: Record<string, Inputs> = {};
  const bucket = (mm: string | null) => (out[mm ?? NO_COMP] ??= emptyInputs());

  // Receita do projeto.
  for (const [mm, v] of Object.entries(revenue)) bucket(mm).receita += v;
  // Receita da revenda de bens de permuta (inclui escambo), item 10.
  const permRev = permutaRevenueByMonth(permToResale(permutas));
  for (const [mm, v] of Object.entries(permRev)) bucket(mm).receita += v;
  // Despesas por categoria da DRE.
  for (const d of despesas) {
    if (!d.categoriaDre) continue;
    const b = bucket(d.competencia);
    b.byCat[d.categoriaDre] = (b.byCat[d.categoriaDre] || 0) + Number(d.valor);
    // Receita/Custo Variável lançados como despesa entram na linha própria.
    if (d.categoriaDre === "Receita") b.receita += Number(d.valor);
    if (d.categoriaDre === "Custo Variável") b.custoVar += Number(d.valor);
  }
  // Custo Variável vem apenas das despesas lançadas como "Custo Variável"
  // (por competência) — a medição de obra NÃO entra na DRE (evita duplicidade).
  // Encargos financeiros (multa/juros/outros − desconto) por data de pagamento.
  for (const [mm, v] of Object.entries(encargosMes))
    bucket(mm).byCat["Despesas Financeiras"] =
      (bucket(mm).byCat["Despesas Financeiras"] || 0) + v;
  return out;
}
```

### `src/lib/queries.ts` · linhas 1100–1176

`getMonthlyRevenue`.

```ts
/**
 * Receita projetada mês a mês de uma versão.
 *
 * Cada versão respeita o que foi lançado NELA:
 *  - Budget/Forecast → budget_line (planejamento);
 *  - Atual → o que está efetivamente lançado, isto é, as CONTAS A RECEBER
 *    lançadas mais os recebíveis derivados dos planos de pagamento das vendas,
 *    mais os reembolsos. É daí que sai a projeção de receita futura.
 *
 * As duas origens da Atual são complementares, não duplicadas: os recebíveis de
 * venda são derivados do plano da unidade e não são copiados para conta_receber
 * (ver comentário do schema em `contasReceber`).
 */
export async function getMonthlyRevenue(
  versionId: string,
  projectId: string,
): Promise<MonthlyProjection> {
  const kind = await getVersionKind(versionId);
  if (kind === "budget" || kind === "forecast") {
    const lines = await db
      .select({ mes: schema.budgetLines.mes, valor: schema.budgetLines.valor })
      .from(schema.budgetLines)
      .where(
        and(
          eq(schema.budgetLines.versionId, versionId),
          eq(schema.budgetLines.kind, "receita"),
        ),
      );
    const out: MonthlyProjection = {};
    for (const l of lines) out[l.mes] = (out[l.mes] || 0) + Number(l.valor);
    return out;
  }

  const [unitRows, reembRows] = await Promise.all([
    getUnits(versionId),
    getReembolsos(versionId),
  ]);
  const out: MonthlyProjection = {};
  // Receita da versão Atual = recebíveis das vendas (MESMA fonte da tela Contas
  // a Receber: expandUnitReceivables — leitura tolerante do plano, sem depender
  // das flags usar*). Assim DRE e Fluxo batem com os recebíveis exibidos.
  // Agrega por mês do vencimento ("MM/DD/YYYY" → "MM/YYYY").
  for (const r of unitRows) {
    for (const rec of expandUnitReceivables(r.paymentPlan, r.status)) {
      const p = rec.dia.split("/");
      if (p.length !== 3) continue;
      const mk = `${p[0]}/${p[2]}`;
      out[mk] = (out[mk] || 0) + rec.valor;
    }
  }
  const reemb = reembursementsByMonth(reembToCalc(reembRows));
  for (const [mm, v] of Object.entries(reemb)) out[mm] = (out[mm] || 0) + v;

  // CONTAS A RECEBER lançadas do projeto — a projeção de receita futura da
  // versão Atual depende delas. Sem isto, uma receita lançada à mão (fora de um
  // plano de venda) aparecia em Contas a Receber e sumia da DRE, do Fluxo de
  // Caixa e do Dashboard. Agrega pelo mês do vencimento e ignora as canceladas.
  const crRows = await db
    .select({
      valor: schema.contasReceber.valor,
      vencimento: schema.contasReceber.vencimento,
    })
    .from(schema.contasReceber)
    .where(
      and(
        eq(schema.contasReceber.projectId, projectId),
        eq(schema.contasReceber.cancelado, false),
      ),
    );
  for (const c of crRows) {
    const p = (c.vencimento ?? "").split("/");
    if (p.length !== 3) continue;
    const mk = `${p[0]}/${p[2]}`;
    out[mk] = (out[mk] || 0) + Number(c.valor);
  }
  return out;
}
```

### `src/lib/queries.ts` · linhas 961–995

`getExpenseRows` — **a origem da despesa da DRE**. Note o ramo Budget/Forecast × Atual.

```ts
/**
 * Despesas normalizadas para os relatórios (DRE/Fluxo). Para Budget/Forecast
 * vêm do lançamento simplificado (budget_line, despesa); para a detalhada, das
 * despesas reais.
 */
export async function getExpenseRows(versionId: string): Promise<ExpenseRow[]> {
  const kind = await getVersionKind(versionId);
  if (kind === "budget" || kind === "forecast") {
    const lines = await db
      .select()
      .from(schema.budgetLines)
      .where(
        and(
          eq(schema.budgetLines.versionId, versionId),
          eq(schema.budgetLines.kind, "despesa"),
        ),
      );
    return lines.map((l) => ({
      contaCef: l.rowKey,
      categoriaDre: l.dreCategory,
      competencia: l.mes,
      valor: Number(l.valor),
    }));
  }
  const d = await getDespesas(versionId);
  // Despesas canceladas (exclusão lógica) não compõem a DRE/relatórios.
  return d
    .filter((x) => !x.cancelado)
    .map((x) => ({
      contaCef: x.contaCef,
      categoriaDre: x.categoriaDre,
      competencia: x.competencia,
      valor: Number(x.valor),
    }));
}
```

### `src/lib/queries.ts` · linhas 238–244

`getDespesas` — o `where` e o `orderBy` que a DRE realmente usa. Ver (d).

```ts
export async function getDespesas(versionId: string): Promise<DespesaRow[]> {
  return db
    .select()
    .from(schema.despesas)
    .where(eq(schema.despesas.versionId, versionId))
    .orderBy(asc(schema.despesas.competencia));
}
```

### `src/lib/queries.ts` · linhas 945–952

`getVersionKind`.

```ts
export async function getVersionKind(versionId: string): Promise<string | null> {
  const [v] = await db
    .select({ kind: schema.versions.kind })
    .from(schema.versions)
    .where(eq(schema.versions.id, versionId))
    .limit(1);
  return v?.kind ?? null;
}
```

### `src/lib/calc/projection.ts` · linhas 312–334

`permutaRevenueByMonth`.

```ts
/**
 * Receita CONTÁBIL da revenda de permuta para a DRE, por mês. Igual ao caixa
 * para à vista/parcelada; para ESCAMBO, contabiliza o valor na data do escambo
 * (data da venda), sem gerar caixa.
 */
export function permutaRevenueByMonth(
  rows: readonly CalcPermutaResale[],
): MonthlyProjection {
  const out: MonthlyProjection = {};
  const add = (mm: string, v: number) => {
    if (v > 0) out[mm] = (out[mm] || 0) + v;
  };
  const cash = permutaCashByMonth(rows);
  for (const [mm, v] of Object.entries(cash)) add(mm, v);
  // Escambo: só DRE, na data do escambo.
  for (const r of rows) {
    if ((r.formaVenda || "").toLowerCase() !== "escambo") continue;
    if (!r.valorVenda || r.valorVenda <= 0) continue;
    const d = parseDate(r.dataVenda) ?? parseDate(r.dataPrimParcela);
    if (d) add(monthKey(d.mo, d.yr), r.valorVenda);
  }
  return out;
}
```

### `src/lib/calc/projection.ts` · linhas 277–310

`permutaCashByMonth` — chamada por ela.

```ts
/**
 * Recebimentos FINANCEIROS da revenda de bens recebidos em permuta, por mês.
 * À vista: 1 recebimento na data da venda. Parcelada: N parcelas iguais a
 * partir da 1ª, na periodicidade informada. Escambo NÃO gera caixa (sem
 * entrada financeira). Alimenta Fluxo de Caixa e Caixa (previstas).
 */
export function permutaCashByMonth(
  rows: readonly CalcPermutaResale[],
): MonthlyProjection {
  const out: MonthlyProjection = {};
  const add = (mm: string, v: number) => {
    if (v > 0) out[mm] = (out[mm] || 0) + v;
  };
  for (const r of rows) {
    const forma = (r.formaVenda || "").toLowerCase();
    if (!r.valorVenda || r.valorVenda <= 0) continue;
    if (forma === "escambo") continue; // sem entrada financeira
    if (forma === "parcelada" && r.parcelas > 0) {
      const d = parseDate(r.dataPrimParcela) ?? parseDate(r.dataVenda);
      if (!d) continue;
      const step = STEP[(r.periodicidade || "mensal").toLowerCase()] ?? 1;
      const parc = Math.round((r.valorVenda / r.parcelas) * 100) / 100;
      for (let i = 0; i < r.parcelas; i++) {
        const dt = addMonths(d.mo, d.yr, i * step);
        add(monthKey(dt.mo, dt.yr), parc);
      }
    } else {
      // à vista (ou forma não informada): recebimento único na data da venda.
      const d = parseDate(r.dataVenda) ?? parseDate(r.dataPrimParcela);
      if (d) add(monthKey(d.mo, d.yr), r.valorVenda);
    }
  }
  return out;
}
```

### `src/lib/queries.ts` · linhas 173–183

`permToResale`.

```ts
/** Mapeia permutas → dados de revenda para os cálculos de caixa/DRE (item 10). */
export function permToResale(rows: PermutaRow[]): CalcPermutaResale[] {
  return rows.map((p) => ({
    valorVenda: Number(p.valorVenda ?? 0),
    dataVenda: p.dataVenda ?? "",
    formaVenda: p.formaVenda ?? "",
    parcelas: Number(p.parcelas ?? 0),
    periodicidade: p.periodicidade ?? "mensal",
    dataPrimParcela: p.dataPrimParcela ?? "",
  }));
}
```

### `src/lib/queries.ts` · linhas 143–148

`getPermutas`.

```ts
export async function getPermutas(versionId: string): Promise<PermutaRow[]> {
  return db
    .select()
    .from(schema.permutas)
    .where(eq(schema.permutas.versionId, versionId));
}
```

### `src/lib/queries.ts` · linhas 150–157

`getInccRows`.

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

### `src/lib/planning.ts` · linhas 65–89

`calendarYearWindows` — as janelas de ano do seletor de período.

```ts
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
```


E a consulta de `despesa_parcela`, **que a DRE não usa** — incluída porque foi
pedida:

### `src/lib/queries.ts` · linhas 997–1019

`ParcelaRow` e `getParcelasByVersion`. Consumidores: `/despesas` e `lib/fluxo-caixa.ts`.

```ts
export type ParcelaRow = typeof schema.despesaParcelas.$inferSelect;

/** Parcelas de contas a pagar de uma versão (join com despesa). Fase 2. */
export async function getParcelasByVersion(
  versionId: string,
): Promise<(ParcelaRow & { despesaNumDoc: string | null; contaCef: string | null; categoriaDre: string | null })[]> {
  const rows = await db
    .select({
      p: schema.despesaParcelas,
      numDoc: schema.despesas.numDoc,
      contaCef: schema.despesas.contaCef,
      categoriaDre: schema.despesas.categoriaDre,
    })
    .from(schema.despesaParcelas)
    .innerJoin(schema.despesas, eq(schema.despesaParcelas.despesaId, schema.despesas.id))
    .where(eq(schema.despesas.versionId, versionId));
  return rows.map((r) => ({
    ...r.p,
    despesaNumDoc: r.numDoc,
    contaCef: r.contaCef,
    categoriaDre: r.categoriaDre,
  }));
}
```

---

## 4. As Server Actions


A DRE é **somente leitura**: não tem nenhuma action própria. A única que ela
chama é de leitura, e vive em `actions/pagamentos.ts`.

### `src/lib/actions/pagamentos.ts` · linhas 122–145

`getEncargosByVersion` — encargos financeiros por mês. **Agrega por `pagamento.data_pagamento`**, não por competência.

```ts
export async function getEncargosByVersion(
  versionId: string,
): Promise<Record<string, number>> {
  const rows = await db
    .select({
      data: schema.pagamentos.dataPagamento,
      multa: schema.pagamentos.multa,
      juros: schema.pagamentos.juros,
      outros: schema.pagamentos.outrosAcrescimos,
      desconto: schema.pagamentos.desconto,
    })
    .from(schema.pagamentos)
    .innerJoin(schema.despesas, eq(schema.pagamentos.despesaId, schema.despesas.id))
    .where(eq(schema.despesas.versionId, versionId))
    .orderBy(asc(schema.pagamentos.dataPagamento));
  const out: Record<string, number> = {};
  for (const r of rows) {
    const enc = Number(r.multa) + Number(r.juros) + Number(r.outros) - Number(r.desconto);
    const p = (r.data ?? "").split("/");
    const mm = p.length === 3 ? `${p[0]}/${p[2]}` : null;
    if (mm) out[mm] = (out[mm] || 0) + enc;
  }
  return out;
}
```

---

## 5. As tabelas envolvidas

### `src/lib/db/schema.ts` · linhas 563–616

`despesa` — a fonte da despesa da DRE.

```ts
/** Lançamento de despesa por versão (competência + dupla classificação). §8.1 */
export const despesas = pgTable("despesa", {
  id: uuid("id").primaryKey().defaultRandom(),
  versionId: uuid("version_id")
    .notNull()
    .references(() => versions.id, { onDelete: "cascade" }),
  tenantId: uuid("tenant_id")
    .notNull()
    .references(() => tenants.id, { onDelete: "cascade" }),
  /** nº de documento interno (ex.: BMV-2026-001682). */
  numDoc: text("num_doc"),
  fornecedorId: uuid("fornecedor_id").references(() => stakeholders.id, {
    onDelete: "set null",
  }),
  bancoId: uuid("banco_id").references(() => bankAccounts.id, {
    onDelete: "set null",
  }),
  /** subitem CEF/plano de contas (ex.: "1.1"). */
  contaCef: text("conta_cef"),
  categoriaDre: dreCategoryEnum("categoria_dre"),
  competencia: text("competencia"),
  vencimento: text("vencimento"),
  dataCaixa: text("data_caixa"),
  valor: numeric("valor", { precision: 15, scale: 2 }).notNull().default("0"),
  status: text("status"),
  obs: text("obs"),
  // ── Fase 2: forma e condição de pagamento ──
  formaPagamento: text("forma_pagamento"),
  formaPagamentoDesc: text("forma_pagamento_desc"),
  condicaoPagamento: text("condicao_pagamento"),
  qtdParcelas: integer("qtd_parcelas"),
  dataEmissao: text("data_emissao"),
  // boleto
  boletoLinhaDigitavel: text("boleto_linha_digitavel"),
  boletoCodigoBarras: text("boleto_codigo_barras"),
  boletoBanco: text("boleto_banco"),
  // cheque
  chequeNumero: text("cheque_numero"),
  chequeBanco: text("cheque_banco"),
  chequeAg: text("cheque_ag"),
  chequeConta: text("cheque_conta"),
  chequeEmitente: text("cheque_emitente"),
  chequeDataEmissao: text("cheque_data_emissao"),
  chequeDataCompensacao: text("cheque_data_compensacao"),
  chequeStatus: text("cheque_status"),
  /** Fase 4: despesa paga por terceiro (não gera saída de caixa na competência). */
  pagoPorTerceiro: boolean("pago_por_terceiro").notNull().default(false),
  /** Cancelamento lógico: mantém histórico, sai de saldos/relatórios. */
  cancelado: boolean("cancelado").notNull().default(false),
  canceladoEm: text("cancelado_em"),
  canceladoPor: text("cancelado_por"),
  motivoCancelamento: text("motivo_cancelamento"),
  createdAt: timestamp("created_at", { mode: "date" }).notNull().defaultNow(),
});
```

### `src/lib/db/schema.ts` · linhas 1005–1031

`pagamento` — a fonte dos encargos financeiros.

```ts
export const pagamentos = pgTable("pagamento", {
  id: uuid("id").primaryKey().defaultRandom(),
  tenantId: uuid("tenant_id")
    .notNull()
    .references(() => tenants.id, { onDelete: "cascade" }),
  parcelaId: uuid("parcela_id").references(() => despesaParcelas.id, {
    onDelete: "cascade",
  }),
  despesaId: uuid("despesa_id").references(() => despesas.id, {
    onDelete: "cascade",
  }),
  valorOriginal: numeric("valor_original", { precision: 15, scale: 2 }).notNull().default("0"),
  desconto: numeric("desconto", { precision: 15, scale: 2 }).notNull().default("0"),
  multa: numeric("multa", { precision: 15, scale: 2 }).notNull().default("0"),
  juros: numeric("juros", { precision: 15, scale: 2 }).notNull().default("0"),
  outrosAcrescimos: numeric("outros_acrescimos", { precision: 15, scale: 2 }).notNull().default("0"),
  valorTotalPago: numeric("valor_total_pago", { precision: 15, scale: 2 }).notNull().default("0"),
  dataPagamento: text("data_pagamento"),
  bankAccountId: uuid("bank_account_id").references(() => bankAccounts.id, {
    onDelete: "set null",
  }),
  /** categoria DRE dos encargos (juros/multa). */
  categoriaEncargos: text("categoria_encargos").notNull().default("Despesas Financeiras"),
  obs: text("obs"),
  usuarioId: text("usuario_id").references(() => users.id, { onDelete: "set null" }),
  createdAt: timestamp("created_at", { mode: "date" }).notNull().defaultNow(),
});
```

### `src/lib/db/schema.ts` · linhas 956–998

`despesa_parcela` — **não lida pela DRE**.

```ts
/** Parcela de uma despesa (conta a pagar). Fase 2. */
export const despesaParcelas = pgTable(
  "despesa_parcela",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    tenantId: uuid("tenant_id")
      .notNull()
      .references(() => tenants.id, { onDelete: "cascade" }),
    despesaId: uuid("despesa_id")
      .notNull()
      .references(() => despesas.id, { onDelete: "cascade" }),
    numeroParcela: integer("numero_parcela").notNull(),
    vencimento: text("vencimento"),
    valorOriginal: numeric("valor_original", { precision: 15, scale: 2 }).notNull().default("0"),
    valorPago: numeric("valor_pago", { precision: 15, scale: 2 }).notNull().default("0"),
    multa: numeric("multa", { precision: 15, scale: 2 }).notNull().default("0"),
    juros: numeric("juros", { precision: 15, scale: 2 }).notNull().default("0"),
    desconto: numeric("desconto", { precision: 15, scale: 2 }).notNull().default("0"),
    outrosAcrescimos: numeric("outros_acrescimos", { precision: 15, scale: 2 }).notNull().default("0"),
    dataPagamento: text("data_pagamento"),
    formaPagamento: text("forma_pagamento"),
    bankAccountId: uuid("bank_account_id").references(() => bankAccounts.id, {
      onDelete: "set null",
    }),
    /** Pendente | Pago | Pago parcialmente | Vencido | Renegociado | Cancelado */
    /** Pendente | Pago | Pago parcialmente | Vencido | Renegociado | Cancelado.
     *  Para CHEQUE o ciclo é próprio: Pendente | Compensado | Devolvido |
     *  Cancelado — "Pago" esconderia a devolução, que é o evento que importa. */
    status: text("status").notNull().default("Pendente"),
    obs: text("obs"),
    // ── Cheque POR PARCELA (item 2.5) ──────────────────────────────────────
    // Antes os dados do cheque viviam no cabeçalho da despesa, ou seja, um
    // cheque para a compra inteira. Talão real tem numeração salteada e cada
    // parcela é um cheque diferente — por isso estes campos são da PARCELA.
    numeroCheque: text("numero_cheque"),
    emitenteCheque: text("emitente_cheque"),
    dataEmissaoCheque: text("data_emissao_cheque"),
    /** data acordada de apresentação do cheque pré-datado ("bom para"). */
    dataBomPara: text("data_bom_para"),
    createdAt: timestamp("created_at", { mode: "date" }).notNull().defaultNow(),
  },
  (t) => [unique("despesa_parcela_uq").on(t.despesaId, t.numeroParcela)],
);
```

### `src/lib/db/schema.ts` · linhas 537–561

`chart_account` — tem `natureza`, **não tem categoria da DRE**.

```ts
export const chartAccounts = pgTable(
  "chart_account",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    tenantId: uuid("tenant_id")
      .notNull()
      .references(() => tenants.id, { onDelete: "cascade" }),
    /** código do subitem (ex.: "1.1", "T.3"). */
    code: text("code").notNull(),
    name: text("name").notNull(),
    /** código do grupo pai (ex.: "1", "T"). */
    groupCode: text("group_code").notNull(),
    groupName: text("group_name").notNull(),
    kind: accountKindEnum("kind").notNull(),
    /**
     * Natureza da conta no planejamento: "receita" ou "despesa". Define em qual
     * bloco (Receitas/Despesas) do Budget/Forecast a conta aparece. Padrão
     * "despesa" (o plano de contas existente é orientado a despesa).
     */
    natureza: text("natureza").notNull().default("despesa"),
    /** Conta ativa: inativas não aparecem em novos lançamentos, mas ficam no histórico. */
    ativo: boolean("ativo").notNull().default(true),
  },
  (c) => [unique("chart_account_tenant_code_uq").on(c.tenantId, c.code)],
);
```

### `src/lib/db/schema.ts` · linhas 1355–1385

`budget_line` — a fonte quando a versão é Budget/Forecast.

```ts
 * contas (CEF), associado a uma categoria da DRE. A versão "atual" continua
 * usando o lançamento detalhado (unidades/despesas).
 */
export const budgetLines = pgTable(
  "budget_line",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    tenantId: uuid("tenant_id")
      .notNull()
      .references(() => tenants.id, { onDelete: "cascade" }),
    versionId: uuid("version_id")
      .notNull()
      .references(() => versions.id, { onDelete: "cascade" }),
    /** "receita" | "despesa" */
    kind: text("kind").notNull(),
    /** fonte de receita OU código do grupo CEF (despesa). */
    rowKey: text("row_key").notNull(),
    /** categoria DRE associada (para despesa; "Receita" para receita). */
    dreCategory: text("dre_category"),
    /** "MM/YYYY". */
    mes: text("mes").notNull(),
    valor: numeric("valor", { precision: 15, scale: 2 }).notNull().default("0"),
    /**
     * Percentual do mês sobre o total da conta (modelo total + %). O `valor` é
     * recalculado = total × pct / 100. NULL em lançamentos antigos que ainda não
     * migraram (a migração faz o backfill a partir do valor/total).
     */
    pct: numeric("pct", { precision: 7, scale: 4 }),
  },
  (t) => [unique("budget_line_uq").on(t.versionId, t.kind, t.rowKey, t.mes)],
);
```

---

## 6. As perguntas


### (a) A receita de R$ 375.000 da OBRA 28


**Não posso rodar: esta sessão não tem acesso ao banco de produção**
(`DATABASE_URL` não está definida no ambiente). O que posso dar é o caminho
exato do código e o SQL das cinco origens, lado a lado.

**O que o código determina:** a receita da DRE é a soma de **duas** parcelas
(`page.tsx:122–126`):

```ts
// Receita do projeto.
for (const [mm, v] of Object.entries(revenue)) bucket(mm).receita += v;
// Receita da revenda de bens de permuta (inclui escambo), item 10.
const permRev = permutaRevenueByMonth(permToResale(permutas));
for (const [mm, v] of Object.entries(permRev)) bucket(mm).receita += v;
```

mais uma terceira, condicional (`page.tsx:133`):

```ts
if (d.categoriaDre === "Receita") b.receita += Number(d.valor);
```

`revenue` é `getMonthlyRevenue(vid, projectId)`, que na versão **Atual** soma
três origens (`queries.ts:1133–1174`): recebíveis das unidades vendidas
(`expandUnitReceivables`), reembolsos e contas a receber não canceladas.

**As cinco somas pedidas, e o que cada uma significa no código:**

| # | Origem | Entra na receita da DRE? | Onde |
|---|---|---|---|
| 1 | `expandUnitReceivables` das unidades vendidas | **sim** | `queries.ts:1142–1149` |
| 2 | `conta_receber` não cancelada do projeto | **sim** | `queries.ts:1157–1174` |
| 3 | `reembolso` | **sim** | `queries.ts:1150–1151` |
| 4 | `permutaRevenueByMonth` | **sim**, somada à parte | `page.tsx:125–126` |
| 5 | `project.valor_construcao + valor_terreno` | **NÃO** | só o Dashboard usa, em `getStatusProjeto` (`queries.ts:2109–2111`) |

A quinta é a única que **não** chega à DRE. Se o número de R$ 375.000 bater
exatamente com ela, a origem não é a DRE — é `receitaPrevista` do Dashboard.

**O SQL, somente leitura. Substitua `:proj` pelo id da OBRA 28:**

```sql
-- 0) Identificar o projeto e a versão Atual.
SELECT p.id AS project_id, p.name, v.id AS version_id, v.kind
  FROM project p
  JOIN version v ON v.project_id = p.id
 WHERE p.name ILIKE '%28%';

-- 2) conta_receber não cancelada do projeto (origem 2).
--    ATENÇÃO: getMonthlyRevenue filtra SÓ project_id e cancelado — sem tenant.
SELECT COALESCE(SUM(valor), 0) AS total_conta_receber, COUNT(*) AS linhas
  FROM conta_receber
 WHERE project_id = :proj AND cancelado = false;

-- 3) reembolso da versão Atual (origem 3). Sem filtro de status — ver docs.
SELECT COALESCE(SUM(valor), 0) AS total_reembolso, COUNT(*) AS linhas
  FROM reembolso WHERE version_id = :ver;

-- 5) valor global do cadastro do projeto (origem 5).
SELECT COALESCE(valor_construcao,0) + COALESCE(valor_terreno,0) AS valor_global,
       valor_construcao, valor_terreno
  FROM project WHERE id = :proj;

-- 1) e 4) NÃO são SQL puro: expandUnitReceivables e permutaRevenueByMonth
--    expandem JSON em JavaScript. O que dá para ver no banco é a matéria-prima:
SELECT code, status, payment_plan FROM unit WHERE version_id = :ver;
SELECT id, estimado, status, valor_venda, data_venda, forma_venda,
       parcelas, periodicidade, data_prim_parcela
  FROM permuta WHERE version_id = :ver;

-- Despesas classificadas como Receita, que TAMBÉM somam na receita (page.tsx:133):
SELECT COALESCE(SUM(valor),0) AS receita_lancada_como_despesa, COUNT(*)
  FROM despesa
 WHERE version_id = :ver AND cancelado = false AND categoria_dre = 'Receita';
```

Para as origens 1 e 4, rodar em JS contra o banco é o caminho — as duas
funções estão coladas nas seções 3 e abaixo.

### (b) A linha Banco do `payment_plan`


**Os valores concretos dependem do banco** (mesma limitação de (a)). O que o
código determina é a mecânica, e ela é definitiva.

A linha `Banco` é uma das **quatro fontes de parcela única** de
`expandUnitReceivables` (`calc/receivables.ts:64–75`):

```ts
const singles: { venc: string; val: number; label: string }[] = [
  { venc: str(sec("FGTS").dataPrev), val: num(sec("FGTS").val), label: "FGTS" },
  { venc: str(sec("Subsidio").dataPrev), val: num(sec("Subsidio").val), label: "Subsídio" },
  { venc: str(sec("Permuta").dataPrev), val: num(sec("Permuta").val), label: "Permuta" },
  { venc: str(sec("Banco").dataPrimParc), val: num(sec("Banco").valFinanc), label: "Financiamento" },
];
for (const s of singles) {
  const d = parseDate(s.venc);
  const val = Number(s.val) || 0;
  if (!d || val <= 0) continue;
  out.push({ dia: fmt(d.mo, d.d, d.yr), valor: val, label: s.label });
}
```

**Confirmado: sim, o valor inteiro vira UM único recebível, na data
`dataPrimParc`.** Não há laço, não há `n`, não há amortização — `Banco.n` nem
existe no tipo. O rótulo gerado é `"Financiamento"`.

Detalhes que saem do mesmo trecho:

- A data usada é **`dataPrimParc`**, não `dataEntrada`. O campo `dataEntrada`
  existe em `BancoSource` (`types.ts:47`) e **não é lido por**
  `expandUnitReceivables`.
- `statusFinanc` também **não é lido** — um financiamento com status
  `"Recusado"` gera recebível igual.
- A guarda é `val <= 0` e data parseável. `valFinanc` zero ou data vazia
  simplesmente não gera linha.
- A flag `usarFinanc` (que mora em `Permuta`, `types.ts:67`) **não é
  consultada** — como registrado no apêndice da auditoria, a função não lê
  nenhuma flag `usar*`.

**SQL para ver os valores:**

```sql
SELECT code, status,
       payment_plan->'Banco'->>'valFinanc'    AS val_financ,
       payment_plan->'Banco'->>'dataPrimParc' AS data_prim_parc,
       payment_plan->'Banco'->>'dataEntrada'  AS data_entrada,
       payment_plan->'Banco'->>'statusFinanc' AS status_financ
  FROM unit
 WHERE version_id = :ver AND status = 'Vendido';
```

### `src/lib/calc/receivables.ts`

`expandUnitReceivables` inteiro.

```ts
import { parseDate } from "./projection";
import { serieVencimentos } from "./carencia";
import type { PaymentPlan, UnitStatus } from "./types";

export interface Receivable {
  /** data prevista, "MM/DD/YYYY". */
  dia: string;
  valor: number;
  label: string;
}

/**
 * Expande o plano de pagamento de uma unidade vendida em recebíveis datados
 * (uma linha por vencimento). Base do painel "Receitas a Receber do Dia".
 * Só gera recebíveis para unidades com status "Vendido".
 */
export function expandUnitReceivables(
  plan: PaymentPlan | null | undefined,
  status: UnitStatus,
): Receivable[] {
  if (status !== "Vendido" || !plan) return [];
  const out: Receivable[] = [];
  const fmt = (mo: number, d: number, yr: number) =>
    `${String(mo).padStart(2, "0")}/${String(d).padStart(2, "0")}/${yr}`;

  // Planos antigos/parciais podem não conter todas as seções — leia de forma
  // tolerante (seção ausente = campos vazios/zero) para nunca quebrar o cálculo.
  const p = plan as unknown as Record<string, unknown>;
  const sec = (k: string) => (p[k] ?? {}) as Record<string, unknown>;
  const str = (v: unknown) => (typeof v === "string" ? v : "");
  const num = (v: unknown) => Number(v) || 0;

  const periodic: { venc: string; val: number; n: number; label: string; step: number }[] = [
    { venc: str(sec("AS").venc), val: num(sec("AS").val), n: num(sec("AS").n), label: "Ato", step: 1 },
    { venc: str(sec("S1").venc), val: num(sec("S1").val), n: num(sec("S1").n), label: "Sinal 1", step: 1 },
    { venc: str(sec("S2").venc), val: num(sec("S2").val), n: num(sec("S2").n), label: "Sinal 2", step: 1 },
    { venc: str(sec("S3").venc), val: num(sec("S3").val), n: num(sec("S3").n), label: "Sinal 3", step: 1 },
    { venc: str(sec("Mensais").venc), val: num(sec("Mensais").val), n: num(sec("Mensais").n), label: "Mensal", step: 1 },
    { venc: str(sec("Semestrais").venc), val: num(sec("Semestrais").val), n: num(sec("Semestrais").n), label: "Semestral", step: 6 },
    { venc: str(sec("Anuais").venc), val: num(sec("Anuais").val), n: num(sec("Anuais").n), label: "Anual", step: 12 },
  ];
  for (const s of periodic) {
    const d = parseDate(s.venc);
    const val = Number(s.val) || 0;
    const n = Math.max(1, Number(s.n) || 1);
    if (!d || val <= 0) continue;
    // Item 6.2 / 2.4 — o dia de vencimento é ENCOLHIDO para o último dia do mês
    // quando o mês de destino não o tem. Antes a data era montada com o dia
    // ORIGINAL no mês deslocado, produzindo strings como "04/31/2026" — data
    // que não existe no calendário e que nenhuma tela conseguia interpretar.
    //
    // O dia desejado é sempre o da data-base: encolher em fevereiro NÃO
    // contamina março (31/01 → 28/02 → 31/03, e não 28/03).
    const datas = serieVencimentos(s.venc, n, s.step);
    for (let i = 0; i < n; i++) {
      out.push({
        dia: datas[i] ?? fmt(d.mo, d.d, d.yr),
        valor: val,
        label: n > 1 ? `${s.label} #${i + 1}` : s.label,
      });
    }
  }

  const singles: { venc: string; val: number; label: string }[] = [
    { venc: str(sec("FGTS").dataPrev), val: num(sec("FGTS").val), label: "FGTS" },
    { venc: str(sec("Subsidio").dataPrev), val: num(sec("Subsidio").val), label: "Subsídio" },
    { venc: str(sec("Permuta").dataPrev), val: num(sec("Permuta").val), label: "Permuta" },
    { venc: str(sec("Banco").dataPrimParc), val: num(sec("Banco").valFinanc), label: "Financiamento" },
  ];
  for (const s of singles) {
    const d = parseDate(s.venc);
    const val = Number(s.val) || 0;
    if (!d || val <= 0) continue;
    out.push({ dia: fmt(d.mo, d.d, d.yr), valor: val, label: s.label });
  }
  return out;
}
```

### (c) Os dois seletores do topo


São de **grupos diferentes**, e a pergunta junta dois seletores distintos:

| Rótulo | Seletor | Parâmetro | Valor |
|---|---|---|---|
| "Acumulado (todos os anos)" | **Período** | `?periodo=` | `acum` |
| "Consolidado" | **Visão** | `?view=` | `""` (vazio) |

**"Acumulado (todos os anos)"** é a primeira opção do seletor de período
(`page.tsx:387`). O código que o lê está em `page.tsx:255–283`:

```ts
const periodo = sp.periodo ?? "acum";
// …
} else if (periodo !== "acum") {
  periodMonths = new Set(years.find((y) => y.value === periodo)?.months ?? []);
} else {
  periodMonths = null;
}
```

`acum` produz `periodMonths = null`, e `aggregateInputs` (`page.tsx:67–77`)
então **não filtra nada** — soma todas as competências, inclusive a chave
especial `NO_COMP` (`" "`, linha 30), que recolhe lançamentos **sem
competência**. Um período datado exclui essa chave; o acumulado a inclui.

**"Consolidado"** é o valor vazio do seletor de visão
(`dre-controls.tsx:150`). O código que o lê é a primeira linha útil da página
(`page.tsx:231`):

```ts
const monthly = sp.view === "mensal";
```

**Sim, existe modo mensal por competência.** É o `?view=mensal`
(`page.tsx:309–334`): uma coluna por mês do período mais uma coluna "Total".
Os meses vêm de `periodMonths` ordenado, ou do `axis` quando o período é
acumulado. **O que muda na consulta: nada.** `versionInputsByMonth` é a mesma
nos dois modos — já devolve tudo por competência; o consolidado apenas soma
com `aggregateInputs`, e o mensal lê mês a mês do mesmo mapa. O comentário nas
linhas 106–107 registra isso: *"Um único fetch alimenta tanto a visão
consolidada quanto a visão mensal"*.

Há ainda um terceiro eixo de "consolidação", separado dos dois: `?proj=all`
(`page.tsx:234`), que agrega todos os projetos do contexto.

### `src/app/(app)/dre/page.tsx` · linhas 229–283

Onde os dois parâmetros são lidos e viram `periodMonths`.

```tsx
  if (!ctx) return null;
  const sp = await searchParams;
  const monthly = sp.view === "mensal";

  const projParam = sp.proj ?? ctx.project.id;
  const isAll = projParam === "all";
  const selectedProjects = isAll
    ? ctx.projects
    : [ctx.projects.find((p) => p.id === projParam) ?? ctx.project];

  // Janelas de ano a partir da tabela INCC. Para "empresa toda", usa a união
  // dos meses de todos os projetos selecionados, de modo que o filtro de
  // período continua editável em qualquer combinação de filtros.
  const inccAll = await Promise.all(
    selectedProjects.map((p) => getInccRows(p.id)),
  );
  // Eixo a partir da tabela INCC dos projetos selecionados (âncora dos dados).
  const axis = [
    ...new Set(inccAll.flat().map((r) => r.m)),
  ].sort((a, b) => {
    const [ma, ya] = a.split("/").map(Number);
    const [mb, yb] = b.split("/").map(Number);
    return ya - yb || ma - mb;
  });
  // Recortes por ano-calendário: 2025, 2026, … até o ano atual + 5.
  const years = calendarYearWindows(axis, new Date().getFullYear());
  const periodo = sp.periodo ?? "acum";
  const customDe = (sp.de ?? "").trim();
  const customAte = (sp.ate ?? "").trim();
  let periodMonths: Set<string> | null;
  if (periodo === "custom") {
    // Recorte customizado por competência (De / Até em MM/AAAA).
    if (customDe && customAte) {
      periodMonths = new Set(enumMonths(customDe, customAte));
    } else if (customDe || customAte) {
      // Limite aberto de um lado: filtra o eixo pelo(s) limite(s) informado(s).
      const a = customDe ? monthIndex(customDe) : null;
      const b = customAte ? monthIndex(customAte) : null;
      periodMonths = new Set(
        axis.filter((m) => {
          const idx = monthIndex(m);
          if (idx == null) return false;
          if (a != null && idx < a) return false;
          if (b != null && idx > b) return false;
          return true;
        }),
      );
    } else {
      periodMonths = null; // sem limites → acumulado
    }
  } else if (periodo !== "acum") {
    periodMonths = new Set(years.find((y) => y.value === periodo)?.months ?? []);
  } else {
    periodMonths = null;
  }
```

### `src/app/(app)/dre/page.tsx` · linhas 308–350

O que muda entre mensal e consolidado — só a montagem das colunas.

```tsx
  let columns: { label: string; color?: string; wf: ReturnType<typeof waterfall> }[];
  if (monthly) {
    // Visão mensal: uma coluna por mês do período + coluna "Total". Usa a série
    // selecionada (versão de comparação, quando aplicável, ou o escopo agregado).
    let byMonth: Record<string, Inputs>;
    if (canCompareVersions && compareVersions.length >= 1) {
      byMonth = await versionInputsByMonth(compareVersions[0].id, ctx.project.id);
    } else {
      byMonth = {};
      const perP = await Promise.all(
        selectedProjects.map((p) => projectInputsByMonth(p, vkind)),
      );
      for (const bm of perP)
        for (const [mm, inp] of Object.entries(bm))
          addInto((byMonth[mm] ??= emptyInputs()), inp);
    }
    const monthsToShow = periodMonths
      ? [...periodMonths].sort((a, b) => (monthIndex(a) ?? 0) - (monthIndex(b) ?? 0))
      : axis;
    columns = monthsToShow.map((mm) => ({
      label: mm,
      wf: waterfall([byMonth[mm] ?? emptyInputs()]),
    }));
    columns.push({
      label: "Total",
      wf: waterfall([aggregateInputs(byMonth, periodMonths)]),
    });
  } else if (compareVersions.length >= 1) {
    const perV = await Promise.all(
      compareVersions.map((v) => versionInputs(v.id, ctx.project.id, periodMonths)),
    );
    columns = compareVersions.map((v, i) => ({
      label: v.label,
      color: v.color,
      wf: waterfall([perV[i]]),
    }));
  } else {
    const all = await Promise.all(
      selectedProjects.map((p) => projectInputs(p, periodMonths, vkind)),
    );
    columns = [{ label: scopeLabel, wf: waterfall(all) }];
  }
  const multi = columns.length > 1;
```

### (d) A coluna de data da despesa


**A premissa não se confirma: a DRE não lê `despesa_parcela`.** Ela lê a
tabela `despesa`, e a coluna de data é a **`competencia` da própria despesa**
— nem `vencimento`, nem `data_caixa`.

O caminho completo:

```
versionInputsByMonth   page.tsx:115   getExpenseRows(vid)
  → getExpenseRows     queries.ts:985  getDespesas(versionId)
      → getDespesas    queries.ts:238  SELECT * FROM despesa WHERE version_id = ?
  → mapeia `competencia: x.competencia`   queries.ts:992
  → bucket(d.competencia)                 page.tsx:130
```

**O `where` e o `order by` exatos** (`queries.ts:238–244`):

```ts
export async function getDespesas(versionId: string): Promise<DespesaRow[]> {
  return db
    .select()
    .from(schema.despesas)
    .where(eq(schema.despesas.versionId, versionId))
    .orderBy(asc(schema.despesas.competencia));
}
```

Uma condição só — `version_id`. **Sem `tenant_id`**, sem filtro de status,
sem filtro de data. O `orderBy` é sobre `competencia`, coluna `text`
`"MM/YYYY"` — ordenação lexicográfica, mas irrelevante para o resultado,
porque o consumidor agrupa por chave e não depende da ordem.

O único filtro adicional está no mapeamento de `getExpenseRows`
(`queries.ts:987–988`): `.filter((x) => !x.cancelado)` — **despesa cancelada
não entra na DRE**.

Duas exceções à regra de competência, no mesmo `versionInputsByMonth`:

| O quê | Coluna de data | Onde |
|---|---|---|
| Despesas | `despesa.competencia` | `page.tsx:130` |
| Encargos financeiros | **`pagamento.data_pagamento`** | `pagamentos.ts:140–142` |
| Receita (Atual) | vencimento do recebível / `conta_receber.vencimento` / `reembolso.data` | `queries.ts:1144`, `:1170`, `projection.ts:344` |

Ou seja: a DRE mistura **regime de competência** (despesas) com **regime de
caixa** (encargos de pagamento) na mesma coluna de mês.

### `src/lib/queries.ts` · linhas 961–995

`getExpenseRows` — os dois ramos e o filtro de cancelado.

```ts
/**
 * Despesas normalizadas para os relatórios (DRE/Fluxo). Para Budget/Forecast
 * vêm do lançamento simplificado (budget_line, despesa); para a detalhada, das
 * despesas reais.
 */
export async function getExpenseRows(versionId: string): Promise<ExpenseRow[]> {
  const kind = await getVersionKind(versionId);
  if (kind === "budget" || kind === "forecast") {
    const lines = await db
      .select()
      .from(schema.budgetLines)
      .where(
        and(
          eq(schema.budgetLines.versionId, versionId),
          eq(schema.budgetLines.kind, "despesa"),
        ),
      );
    return lines.map((l) => ({
      contaCef: l.rowKey,
      categoriaDre: l.dreCategory,
      competencia: l.mes,
      valor: Number(l.valor),
    }));
  }
  const d = await getDespesas(versionId);
  // Despesas canceladas (exclusão lógica) não compõem a DRE/relatórios.
  return d
    .filter((x) => !x.cancelado)
    .map((x) => ({
      contaCef: x.contaCef,
      categoriaDre: x.categoriaDre,
      competencia: x.competencia,
      valor: Number(x.valor),
    }));
}
```

### `src/app/(app)/dre/page.tsx` · linhas 127–142

Onde a competência vira bucket, e onde os encargos entram.

```tsx
  // Despesas por categoria da DRE.
  for (const d of despesas) {
    if (!d.categoriaDre) continue;
    const b = bucket(d.competencia);
    b.byCat[d.categoriaDre] = (b.byCat[d.categoriaDre] || 0) + Number(d.valor);
    // Receita/Custo Variável lançados como despesa entram na linha própria.
    if (d.categoriaDre === "Receita") b.receita += Number(d.valor);
    if (d.categoriaDre === "Custo Variável") b.custoVar += Number(d.valor);
  }
  // Custo Variável vem apenas das despesas lançadas como "Custo Variável"
  // (por competência) — a medição de obra NÃO entra na DRE (evita duplicidade).
  // Encargos financeiros (multa/juros/outros − desconto) por data de pagamento.
  for (const [mm, v] of Object.entries(encargosMes))
    bucket(mm).byCat["Despesas Financeiras"] =
      (bucket(mm).byCat["Despesas Financeiras"] || 0) + v;
  return out;
```

### (e) Despesas da OBRA 28 por categoria e status


**Não posso rodar — sem `DATABASE_URL`.** Segue o SQL e, mais útil, o
critério exato do que a tela mostra e do que fica de fora.

**O que chega a "Custo Variável" e "Despesa Variável":**

```ts
for (const d of despesas) {
  if (!d.categoriaDre) continue;                       // ← filtro 1
  const b = bucket(d.competencia);
  b.byCat[d.categoriaDre] = (b.byCat[d.categoriaDre] || 0) + Number(d.valor);
  if (d.categoriaDre === "Custo Variável") b.custoVar += Number(d.valor);
}
```

Uma despesa só entra se passar por **quatro** filtros, nesta ordem:

| # | Filtro | Onde | O que descarta |
|---|---|---|---|
| 1 | `version_id = :ver` | `queries.ts:242` | despesa de outra versão do mesmo projeto |
| 2 | `!x.cancelado` | `queries.ts:988` | despesa cancelada |
| 3 | `if (!d.categoriaDre) continue` | `page.tsx:129` | **despesa sem categoria DRE** |
| 4 | competência no `periodMonths` | `page.tsx:73` | despesa fora do período (se houver recorte) |

**O que NÃO é filtrado:** o `status`. Uma despesa `"A pagar"` pesa igual a
uma `"Pago"` — é DRE por competência, não por caixa.

**O que não chega, portanto:** despesa sem `categoria_dre` (filtro 3, silencioso
— nem soma, nem aparece em lugar nenhum da tela) e despesa **sem `competencia`**,
que cai na chave `NO_COMP` e some de qualquer recorte datado, aparecendo só no
acumulado.

**SQL:**

```sql
-- Por categoria_dre e status, com soma e contagem.
SELECT COALESCE(d.categoria_dre, '(sem categoria)') AS categoria,
       COALESCE(d.status, '(sem status)')           AS status,
       COUNT(*) AS qtd, SUM(d.valor) AS total
  FROM despesa d
  JOIN version v ON v.id = d.version_id
 WHERE v.project_id = :proj AND d.cancelado = false
 GROUP BY 1, 2 ORDER BY 1, 2;

-- O que a DRE some: sem categoria (filtro 3) ou sem competência (NO_COMP).
SELECT d.num_doc, d.valor, d.categoria_dre, d.competencia, d.status, v.kind
  FROM despesa d JOIN version v ON v.id = d.version_id
 WHERE v.project_id = :proj AND d.cancelado = false
   AND (d.categoria_dre IS NULL OR d.categoria_dre = ''
        OR d.competencia IS NULL OR d.competencia = '')
 ORDER BY d.valor DESC;

-- Só a versão que a DRE abre por padrão (Atual):
SELECT COALESCE(d.categoria_dre,'(sem)') AS categoria, COUNT(*), SUM(d.valor)
  FROM despesa d JOIN version v ON v.id = d.version_id
 WHERE v.project_id = :proj AND v.kind = 'atual' AND d.cancelado = false
 GROUP BY 1 ORDER BY 3 DESC;
```

### (f) Como uma despesa vira linha da DRE


**Pela `categoria_dre`, e só por ela. O grupo CEF do `chart_account` não
participa.**

O mapa é o `waterfall` (`page.tsx:179–213`) e é uma correspondência direta de
string:

| Linha da DRE | Vem de |
|---|---|
| Receita | `inputs.receita` (recebíveis + permuta) **+** despesas com `categoria_dre = "Receita"` |
| (−) Custo Variável | `cat("Custo Variável")` |
| (−) Despesa Variável | `cat("Despesa Variável")` |
| (−) Custo Fixo | `cat("Custo Fixo")` |
| (−) Despesa Fixa | `cat("Despesa Fixa")` |
| (−) Retiradas | `cat("Retiradas")` |
| (−) Investimentos | `cat("Investimento")` — **singular no banco, plural no rótulo** |
| (−) Empréstimos | `cat("Empréstimos")` |
| (−) Despesas Financeiras | `cat("Despesas Financeiras")` **+** encargos de `pagamento` |

onde `cat(k) = all.reduce((a, x) => a + (x.byCat[k] || 0), 0)`
(`page.tsx:182`). É lookup por chave literal: categoria que não bater com uma
dessas strings **não aparece em nenhuma linha** — o valor entra em `byCat` e
nunca é lido.

`getExpenseRows` até traz `contaCef` (`queries.ts:990`), mas
`versionInputsByMonth` **nunca o usa**. Busca por `contaCef` no `page.tsx`:
zero ocorrências.

**Despesa cuja conta mudou de categoria depois de lançada: o número FICA ONDE
ESTAVA.** A DRE lê `despesa.categoria_dre`, que é uma coluna da própria linha
(`schema.ts:582`), gravada no lançamento. Nada relê o `chart_account` para
reclassificar. Mudar a conta no plano de contas — ou até a `natureza` dela —
não move nenhuma despesa já lançada.

O único caminho de reclassificação é **manual e explícito**:
`reclassificarDespesas` (`actions/diagnostico.ts:117`), que faz `UPDATE
despesa SET categoria_dre = …` sobre linhas que o usuário marcou, e grava
auditoria com `changes`.

### `src/app/(app)/dre/page.tsx` · linhas 178–213

O `waterfall` — o mapa inteiro.

```tsx
/** Calcula a cascata da DRE (linhas) a partir dos inputs agregados. */
function waterfall(all: Inputs[]): { rows: DreRow[]; R: number } {
  const R = all.reduce((a, x) => a + x.receita, 0);
  const CV = all.reduce((a, x) => a + x.custoVar, 0);
  const cat = (k: string) => all.reduce((a, x) => a + (x.byCat[k] || 0), 0);
  const CF = cat("Custo Fixo");
  const DV = cat("Despesa Variável");
  const DF = cat("Despesa Fixa");
  const RET = cat("Retiradas");
  const INV = cat("Investimento");
  const EMP = cat("Empréstimos");
  const DFIN = cat("Despesas Financeiras");
  // Margem de Contribuição = Receita − Custo Variável − Despesa Variável
  // (definição de negócio confirmada pelo cliente). O EBITDA continua sendo o
  // mesmo total: a mudança é só na composição das linhas até a MC.
  const MC = R - CV - DV;
  const EBITDA = MC - (CF + DF + RET);
  const RF = EBITDA - INV - EMP - DFIN;
  return {
    R,
    rows: [
      { label: "Receita", value: R, kind: "item" },
      { label: "(−) Custo Variável", value: CV, kind: "item" },
      { label: "(−) Despesa Variável", value: DV, kind: "item" },
      { label: "= Margem de Contribuição", value: MC, kind: "sub" },
      { label: "(−) Custo Fixo", value: CF, kind: "item" },
      { label: "(−) Despesa Fixa", value: DF, kind: "item" },
      { label: "(−) Retiradas", value: RET, kind: "item" },
      { label: "= EBITDA", value: EBITDA, kind: "sub" },
      { label: "(−) Investimentos", value: INV, kind: "item" },
      { label: "(−) Empréstimos", value: EMP, kind: "item" },
      { label: "(−) Despesas Financeiras (juros/multas)", value: DFIN, kind: "item" },
      { label: "= Resultado Final", value: RF, kind: "final" },
    ],
  };
}
```

### `src/lib/calc/constants.ts` · linhas 254–266

`CATEGORIAS_DRE` — as nove strings.

```ts
/** As 7 categorias da DRE. §8.3 */
export const CATEGORIAS_DRE = [
  "Receita",
  "Custo Variável",
  "Custo Fixo",
  "Despesa Variável",
  "Despesa Fixa",
  "Retiradas",
  "Investimento",
  "Empréstimos",
  "Despesas Financeiras",
] as const;
export type CategoriaDRE = (typeof CATEGORIAS_DRE)[number];
```

### `src/lib/calc/natureza-dre.ts`

`calc/natureza-dre.ts` inteiro — a classificação credora/devedora, usada na validação e no diagnóstico, **não** na montagem da DRE.

```ts
/**
 * Natureza contábil das categorias da DRE — RG-01 e a trava do item 1.3.
 *
 * A DRE do Growth tem nove categorias numa lista única (`CATEGORIAS_DRE`), sem
 * distinguir o que é conta CREDORA (receita) do que é DEVEDORA (custo, despesa,
 * saída patrimonial). Essa lista alimenta o `<Select>` de despesa, e como
 * "Receita" é o primeiro item, toda despesa nova nascia classificada como
 * receita — inflando receita e resultado ao mesmo tempo.
 *
 * Este módulo é a fonte única dessa classificação. Ele existe separado da
 * constante porque a regra é contábil, precisa de teste e é consumida tanto
 * pela interface (filtrar o dropdown) quanto pelo servidor (recusar a
 * gravação). Validar só no cliente não protege nada: a Server Action é
 * chamável direto.
 */
import { CATEGORIAS_DRE, type CategoriaDRE } from "./constants";

export type NaturezaDRE = "credora" | "devedora";

/**
 * Categorias de natureza CREDORA — entram no resultado como receita.
 *
 * Hoje só "Receita". Fica como conjunto (e não como comparação direta) porque
 * o pacote de controladoria acrescenta "Receitas Financeiras" (RG-07, descontos
 * obtidos), e o resto do código não deve precisar mudar quando isso acontecer.
 */
const CREDORAS = new Set<string>(["Receita"]);

/**
 * Natureza de uma categoria da DRE.
 *
 * O default é DEVEDORA de propósito: uma categoria desconhecida (vinda de dado
 * histórico ou de uma versão futura da lista) é tratada como despesa, que é o
 * lado seguro — classificar errado como receita é o erro que este módulo
 * existe para impedir.
 */
export function naturezaCategoriaDre(categoria: string | null | undefined): NaturezaDRE {
  if (!categoria) return "devedora";
  return CREDORAS.has(categoria.trim()) ? "credora" : "devedora";
}

/** Categoria válida para um lançamento de DESPESA? (RG-01, item 1.3) */
export function categoriaValidaParaDespesa(categoria: string | null | undefined): boolean {
  return naturezaCategoriaDre(categoria) === "devedora";
}

/**
 * Categorias que podem aparecer no dropdown de uma despesa: só as devedoras.
 * A ordem original da lista é preservada — a tela não deve reordenar o que o
 * usuário já conhece de cor.
 */
export function categoriasDeDespesa(
  categorias: readonly string[] = CATEGORIAS_DRE,
): string[] {
  return categorias.filter((c) => categoriaValidaParaDespesa(c));
}

/** Mensagem única de recusa, usada pelas duas telas que lançam despesa. */
export const ERRO_CATEGORIA_CREDORA =
  "Categoria de receita não é válida para lançamento de despesa.";

/**
 * Valida a categoria escolhida num lançamento de despesa.
 *
 * Devolve a mensagem de erro ou `null`. Categoria vazia é recusada aqui porque
 * o formulário passou a abrir em "Selecione…" — sem isso, deixar o campo em
 * branco gravaria despesa sem classificação na DRE.
 */
export function validarCategoriaDespesa(
  categoria: string | null | undefined,
): string | null {
  if (!categoria || !categoria.trim()) return "Selecione a categoria DRE da despesa.";
  if (!categoriaValidaParaDespesa(categoria)) return ERRO_CATEGORIA_CREDORA;
  return null;
}

/** Type guard: a string é uma das categorias conhecidas da DRE? */
export function ehCategoriaDre(v: string | null | undefined): v is CategoriaDRE {
  return !!v && (CATEGORIAS_DRE as readonly string[]).includes(v);
}
```

### `src/lib/db/schema.ts` · linhas 563–580

`despesa` — a coluna `categoria_dre` e a `conta_cef`, lado a lado.

```ts
/** Lançamento de despesa por versão (competência + dupla classificação). §8.1 */
export const despesas = pgTable("despesa", {
  id: uuid("id").primaryKey().defaultRandom(),
  versionId: uuid("version_id")
    .notNull()
    .references(() => versions.id, { onDelete: "cascade" }),
  tenantId: uuid("tenant_id")
    .notNull()
    .references(() => tenants.id, { onDelete: "cascade" }),
  /** nº de documento interno (ex.: BMV-2026-001682). */
  numDoc: text("num_doc"),
  fornecedorId: uuid("fornecedor_id").references(() => stakeholders.id, {
    onDelete: "set null",
  }),
  bancoId: uuid("banco_id").references(() => bankAccounts.id, {
    onDelete: "set null",
  }),
  /** subitem CEF/plano de contas (ex.: "1.1"). */
```

### (g) A Conferência de lançamentos usa o mesmo critério?


**Não. São critérios diferentes, e as consultas também.**

| | DRE | /diagnostico/categorias-invertidas |
|---|---|---|
| Consulta | `getDespesas(versionId)` | `getDespesasSuspeitas()` |
| Escopo | **uma versão** (`version_id`) | **todo o tenant**, todas as versões |
| `where` | `eq(despesas.versionId, versionId)` | `eq(despesas.tenantId, ctx.tenant.id)` |
| Tenant no SQL | **não** | **sim** |
| Cancelado | filtrado fora (`getExpenseRows`) | **incluído**, se houver outro motivo |
| Critério de classificação | `categoria_dre` como **chave literal** no `waterfall` | `naturezaCategoriaDre` — credora × devedora |
| O que faz com "Receita" | **soma na linha Receita** (`page.tsx:133`) | **marca como suspeita** (`diagnostico.ts:72–73`) |

A divergência central: **a mesma despesa classificada como `"Receita"` é
somada na receita pela DRE e apontada como erro pelo diagnóstico.** A DRE não
consulta `naturezaCategoriaDre` em ponto nenhum; o diagnóstico não consulta o
`waterfall`.

As duas consultas, lado a lado:

### `src/lib/queries.ts` · linhas 238–244

**DRE** — `getDespesas`.

```ts
export async function getDespesas(versionId: string): Promise<DespesaRow[]> {
  return db
    .select()
    .from(schema.despesas)
    .where(eq(schema.despesas.versionId, versionId))
    .orderBy(asc(schema.despesas.competencia));
}
```

### `src/lib/actions/diagnostico.ts` · linhas 45–101

**Diagnóstico** — `getDespesasSuspeitas`.

```ts
/**
 * Despesas gravadas com categoria de natureza credora (o bug do item 1.3), sem
 * categoria nenhuma, ou com valor zero (item 1.4).
 *
 * Somente leitura. Inclui lançamentos cancelados marcados como tal, para que a
 * conferência veja o quadro inteiro sem que eles poluam a contagem de pendências.
 */
export async function getDespesasSuspeitas(): Promise<DespesaSuspeita[]> {
  const ctx = await getActiveContext();
  if (!ctx || !can(ctx.perms, "despesas", "ver")) return [];

  const rows = await db
    .select({
      d: schema.despesas,
      projectId: schema.projects.id,
      projectName: schema.projects.name,
      fornecedorNome: schema.stakeholders.nome,
    })
    .from(schema.despesas)
    .innerJoin(schema.versions, eq(schema.despesas.versionId, schema.versions.id))
    .innerJoin(schema.projects, eq(schema.versions.projectId, schema.projects.id))
    .leftJoin(schema.stakeholders, eq(schema.despesas.fornecedorId, schema.stakeholders.id))
    .where(eq(schema.despesas.tenantId, ctx.tenant.id));

  const out: DespesaSuspeita[] = [];
  for (const r of rows) {
    const motivos: string[] = [];
    if (r.d.categoriaDre && !categoriaValidaParaDespesa(r.d.categoriaDre)) {
      motivos.push("categoria de receita em lançamento de despesa");
    }
    if (!r.d.categoriaDre) motivos.push("sem categoria DRE");
    if (Number(r.d.valor) === 0) motivos.push("valor zero");
    if (r.d.cancelado) {
      // Cancelada não é pendência — mas some da lista só se não houver outro
      // motivo, para não esconder um registro que a contabilidade queira ver.
      if (motivos.length === 0) continue;
      motivos.push("lançamento cancelado");
    }
    if (motivos.length === 0) continue;
    out.push({
      id: r.d.id,
      numDoc: r.d.numDoc,
      projectId: r.projectId,
      projectName: r.projectName,
      fornecedorNome: r.fornecedorNome,
      categoriaDre: r.d.categoriaDre,
      competencia: r.d.competencia,
      vencimento: r.d.vencimento,
      valor: Number(r.d.valor),
      status: r.d.status,
      obs: r.d.obs,
      motivos,
    });
  }
  // Maiores valores primeiro: é por onde a conferência começa.
  return out.sort((a, b) => b.valor - a.valor);
}
```

### (h) A cascata e as contas de Empréstimos/Investimentos


**Sim, Empréstimos subtrai do EBITDA.** A cascata inteira
(`page.tsx:193–195`):

```ts
const MC = R - CV - DV;
const EBITDA = MC - (CF + DF + RET);
const RF = EBITDA - INV - EMP - DFIN;
```

Em forma de linhas:

```
  Receita                                    R
(−) Custo Variável                           CV
(−) Despesa Variável                         DV
= Margem de Contribuição                     MC  = R − CV − DV
(−) Custo Fixo                               CF
(−) Despesa Fixa                             DF
(−) Retiradas                                RET
= EBITDA                                     EBITDA = MC − (CF + DF + RET)
(−) Investimentos                            INV
(−) Empréstimos                              EMP
(−) Despesas Financeiras (juros/multas)      DFIN
= Resultado Final                            RF = EBITDA − INV − EMP − DFIN
```

Os três — INV, EMP e DFIN — entram **depois** do EBITDA, subtraindo do
Resultado Final. O comentário das linhas 190–192 registra que a MC mudou de
composição mas o EBITDA continua o mesmo total.

**Sobre as contas do `chart_account` com categoria Empréstimos e
Investimentos: essa coluna não existe.** O `chart_account`
(`schema.ts:537–561`) tem `code`, `name`, `group_code`, `group_name`, `kind`
(`cef`/`complementar`), `natureza` (`"receita"`/`"despesa"`) e `ativo`. **Não
há coluna de categoria da DRE** — a categoria vive na despesa, não na conta.

Portanto não há como listar "contas com categoria Empréstimos". O que dá para
listar é o que existe:

```sql
-- Todas as contas do plano, com o que a tabela realmente tem.
SELECT code, name, group_code, group_name, kind, natureza, ativo
  FROM chart_account WHERE tenant_id = :tenant ORDER BY code;

-- E, do outro lado, as despesas efetivamente classificadas nessas categorias,
-- com a conta CEF que cada uma usou:
SELECT d.categoria_dre, d.conta_cef, c.name AS conta_nome,
       c.group_code, c.group_name, c.natureza,
       COUNT(*) AS qtd, SUM(d.valor) AS total
  FROM despesa d
  JOIN version v ON v.id = d.version_id
  LEFT JOIN chart_account c
         ON c.code = d.conta_cef AND c.tenant_id = d.tenant_id
 WHERE v.project_id = :proj AND d.cancelado = false
   AND d.categoria_dre IN ('Empréstimos', 'Investimento')
 GROUP BY 1,2,3,4,5,6 ORDER BY 1, 8 DESC;
```

Note o `'Investimento'` no singular — é a string em `CATEGORIAS_DRE`
(`constants.ts:262`) e a que o `waterfall` procura (`page.tsx:187`), mesmo o
rótulo da linha sendo "Investimentos".

### (i) O INCC entra na DRE?


**Entra de duas formas, e nenhuma delas é linha própria.**

**1. Como eixo de meses — uso direto, sem valor.** `/dre` importa
`getInccRows` (`page.tsx:6`) e o usa só para montar o eixo temporal
(`page.tsx:242–252`):

```ts
const inccAll = await Promise.all(selectedProjects.map((p) => getInccRows(p.id)));
const axis = [...new Set(inccAll.flat().map((r) => r.m))].sort(…);
```

Lê **apenas o campo `m`** (a competência). Os valores `mo` e `ac` não são
tocados aqui. O comentário da linha 245 chama a tabela de *"âncora dos
dados"*. Consequência: **a tabela INCC define quais meses a DRE consegue
exibir** — projeto sem linhas de INCC tem `axis` vazio.

**2. Como correção da receita — uso indireto, dentro do valor.** O índice
chega à DRE embutido na receita, por dois caminhos que já não passam por
`/dre`:

| Caminho | Aplica INCC? | Vai para |
|---|---|---|
| `getMonthlyRevenue` → `expandUnitReceivables` | **NÃO** | receita da DRE |
| `calcProjection` → `getIncc` | **sim** | Projeção/Consolidado, **não** a DRE |

Isto é decisivo: a receita da DRE vem de `expandUnitReceivables`
(`queries.ts:1142–1149`), e essa função **não importa nada de `incc`** — ela
expande o plano em valores nominais. Quem aplica o INCC é `calcProjection`
(`projection.ts:66`), que a DRE **não chama**.

**Resposta direta às três partes:**

- *Sobre o quê `incc_rate` é aplicado?* Nas parcelas periódicas
  (mensais/semestrais/anuais), a partir da 5ª (`i >= INCC_FROM_INSTALLMENT`) —
  mas em `calcProjection`, não no caminho da DRE.
- *Em que momento?* No cálculo, a cada leitura — não é gravado. `getIncc`
  devolve o **acumulado** (`ac`) do mês da parcela.
- *Vai para receita ou linha própria?* **Nenhuma linha própria.** Nas telas
  que o aplicam, ele infla o valor da parcela dentro da receita. Na DRE, não
  chega nem a isso.

### `src/app/(app)/dre/page.tsx` · linhas 239–254

O uso do INCC na DRE — só o eixo de meses.

```tsx
  // Janelas de ano a partir da tabela INCC. Para "empresa toda", usa a união
  // dos meses de todos os projetos selecionados, de modo que o filtro de
  // período continua editável em qualquer combinação de filtros.
  const inccAll = await Promise.all(
    selectedProjects.map((p) => getInccRows(p.id)),
  );
  // Eixo a partir da tabela INCC dos projetos selecionados (âncora dos dados).
  const axis = [
    ...new Set(inccAll.flat().map((r) => r.m)),
  ].sort((a, b) => {
    const [ma, ya] = a.split("/").map(Number);
    const [mb, yb] = b.split("/").map(Number);
    return ya - yb || ma - mb;
  });
  // Recortes por ano-calendário: 2025, 2026, … até o ano atual + 5.
  const years = calendarYearWindows(axis, new Date().getFullYear());
```

### (j) O divisor da coluna "% RECEITA"


**Divide por `columns[0].wf.R` — a Receita da PRIMEIRA coluna**
(`page.tsx:466`):

```tsx
{pct1(columns[0].wf.R > 0 ? (columns[0].wf.rows[ri].value / columns[0].wf.R) * 100 : 0)}
```

Quatro fatos sobre esse divisor:

- **`R` é o total da linha Receita** — `all.reduce((a, x) => a + x.receita, 0)`
  (`page.tsx:180`), já somando recebíveis, permuta e despesas classificadas
  como Receita.
- **Guardado:** `R > 0 ? … : 0`. Receita zero ou negativa exibe `0,0%`, não
  erro.
- **A coluna só existe quando há uma coluna de dados** — `{!multi && …}`
  (`page.tsx:426` e `:464`). Em comparativo de versões e na visão mensal
  (que sempre tem ≥ 2 colunas), **a coluna % Receita desaparece**.
- **Sempre a coluna 0.** No modo de coluna única isso é a própria coluna;
  não há caso em que o percentual seja calculado contra outra.

### (k) A tela distingue ausência de zero?


**Não.** Toda célula de valor é `brl0(v)`, sem condicional de ausência:

### `src/app/(app)/dre/page.tsx` · linhas 429–471

O corpo da tabela inteiro — as células de valor e a de % Receita.

```tsx
            <tbody>
              {labels.map((lbl, ri) => {
                const isSub = lbl.kind !== "item";
                return (
                  <TR key={lbl.label} className={isSub ? "bg-[var(--color-surface2)]" : undefined}>
                    <TD
                      className={
                        lbl.kind === "final"
                          ? "font-semibold text-[var(--color-accent)]"
                          : isSub
                            ? "font-semibold text-[var(--color-ink)]"
                            : "text-[var(--color-ink2)]"
                      }
                    >
                      {lbl.label}
                    </TD>
                    {columns.map((c) => {
                      const v = c.wf.rows[ri].value;
                      return (
                        <TD
                          key={c.label}
                          className={`text-right font-[family-name:var(--font-mono)] ${
                            isSub ? "font-semibold" : ""
                          } ${
                            v < 0
                              ? "text-[var(--color-danger)]"
                              : lbl.kind === "final" || lbl.kind === "sub"
                                ? "text-[var(--color-success)]"
                                : "text-[var(--color-ink)]"
                          }`}
                        >
                          {brl0(v)}
                        </TD>
                      );
                    })}
                    {!multi && (
                      <TD className="text-right font-[family-name:var(--font-mono)] text-[var(--color-ink3)]">
                        {pct1(columns[0].wf.R > 0 ? (columns[0].wf.rows[ri].value / columns[0].wf.R) * 100 : 0)}
                      </TD>
                    )}
                  </TR>
                );
              })}
```


Os pontos relevantes:

- **Célula de valor** (`page.tsx:460`): `{brl0(v)}`. Não há `—`, não há
  `null`, não há estado vazio. Uma linha sem nenhum lançamento e uma linha
  cujo somatório dá zero exibem o mesmo `R$ 0`.
- **Não há linha de "total" separada:** o que existe são linhas com
  `kind: "sub"` (MC, EBITDA) e `kind: "final"` (Resultado Final), que mudam
  só o estilo — fundo `surface2`, negrito, cor de destaque — e passam pelo
  mesmo `brl0`.
- **A cor distingue o sinal, não a ausência** (`page.tsx:453–457`):
  negativo é `danger`; `sub`/`final` não negativos são `success`; o resto é a
  cor normal de texto.
- Na visão mensal há uma coluna rotulada `"Total"` (`page.tsx:331–334`), que
  é uma coluna como as outras, com o mesmo tratamento.

Como `brl0` chama `clampZero(value, 0)`, um valor como `-0,4` também vira
`R$ 0` — indistinguível de zero real e de ausência.

### (l) `/dre` lê a tabela `version`?


**Sim, por consulta inline própria** — e há vários fallbacks encadeados.

**Resolução do projeto** (`page.tsx:233–237`):

```ts
const projParam = sp.proj ?? ctx.project.id;
const isAll = projParam === "all";
const selectedProjects = isAll
  ? ctx.projects
  : [ctx.projects.find((p) => p.id === projParam) ?? ctx.project];
```

| Ordem | Fonte | Fallback |
|---|---|---|
| 1 | `?proj=` do searchParams | — |
| 2 | `ctx.project.id` | quando não há `?proj=` |
| 3 | `ctx.project` | quando o `?proj=` não existe em `ctx.projects` |

**Resolução da versão — dois caminhos distintos.**

*Caminho A — projeto ativo, comparação de versões* (`page.tsx:291–300`): usa
`ctx.versions`, do contexto, sem consultar o banco:

```ts
const canCompareVersions = !isAll && selectedProjects[0].id === ctx.project.id;
const atualVersion = ctx.versions.find((v) => v.kind === "atual") ?? ctx.version;
const vsIds = (sp.vs ?? "").split(",").filter(Boolean);
const compareVersions = canCompareVersions
  ? (vsIds.length ? ctx.versions.filter((v) => vsIds.includes(v.id)) : [atualVersion]).slice(0, 3)
  : [];
```

*Caminho B — qualquer outro projeto, ou "Empresa toda"*: **consulta o banco**
(`page.tsx:88–103`):

```ts
const vs = await db
  .select()
  .from(schema.versions)
  .where(eq(schema.versions.projectId, projectId))
  .orderBy(asc(schema.versions.createdAt));
return (
  vs.find((v) => v.kind === kind) ??
  vs.find((v) => v.kind === "atual") ??
  vs.find((v) => v.isDefault) ??
  vs[0]
)?.id ?? null;
```

**Quatro fallbacks em cascata**: o `kind` pedido → `atual` → `isDefault` → a
primeira versão criada → `null`. Se der `null`, `projectInputsByMonth`
devolve `{}` (`page.tsx:152`) e o projeto entra zerado, em silêncio.

Dois pontos sobre essa consulta inline: **não tem `tenant_id` no `where`** (só
`project_id`), e é chamada **uma vez por projeto** no modo "Empresa toda" —
N+1 com o número de projetos.

**Cookie:** a página não lê nenhum diretamente. O que existe é indireto —
`getActiveContext` resolve tenant/projeto/versão ativos, e é dele que vêm
`ctx.project`, `ctx.version` e `ctx.versions`.

### `src/app/(app)/dre/page.tsx` · linhas 79–103

`defaultVersionId` e `versionIdOfKind` — a consulta inline e os fallbacks.

```tsx
async function defaultVersionId(projectId: string): Promise<string | null> {
  return versionIdOfKind(projectId, "atual");
}

/**
 * Id da versão de um tipo (atual/forecast/budget) do projeto — usado na visão
 * "Empresa toda", onde as versões são por projeto e o usuário escolhe o TIPO.
 * Cai para Atual → default → 1ª se o tipo pedido não existir.
 */
async function versionIdOfKind(
  projectId: string,
  kind: string,
): Promise<string | null> {
  const vs = await db
    .select()
    .from(schema.versions)
    .where(eq(schema.versions.projectId, projectId))
    .orderBy(asc(schema.versions.createdAt));
  return (
    vs.find((v) => v.kind === kind) ??
    vs.find((v) => v.kind === "atual") ??
    vs.find((v) => v.isDefault) ??
    vs[0]
  )?.id ?? null;
}
```

### `src/app/(app)/dre/page.tsx` · linhas 228–300

A resolução de projeto, período e versões.

```tsx
  const ctx = await getActiveContext();
  if (!ctx) return null;
  const sp = await searchParams;
  const monthly = sp.view === "mensal";

  const projParam = sp.proj ?? ctx.project.id;
  const isAll = projParam === "all";
  const selectedProjects = isAll
    ? ctx.projects
    : [ctx.projects.find((p) => p.id === projParam) ?? ctx.project];

  // Janelas de ano a partir da tabela INCC. Para "empresa toda", usa a união
  // dos meses de todos os projetos selecionados, de modo que o filtro de
  // período continua editável em qualquer combinação de filtros.
  const inccAll = await Promise.all(
    selectedProjects.map((p) => getInccRows(p.id)),
  );
  // Eixo a partir da tabela INCC dos projetos selecionados (âncora dos dados).
  const axis = [
    ...new Set(inccAll.flat().map((r) => r.m)),
  ].sort((a, b) => {
    const [ma, ya] = a.split("/").map(Number);
    const [mb, yb] = b.split("/").map(Number);
    return ya - yb || ma - mb;
  });
  // Recortes por ano-calendário: 2025, 2026, … até o ano atual + 5.
  const years = calendarYearWindows(axis, new Date().getFullYear());
  const periodo = sp.periodo ?? "acum";
  const customDe = (sp.de ?? "").trim();
  const customAte = (sp.ate ?? "").trim();
  let periodMonths: Set<string> | null;
  if (periodo === "custom") {
    // Recorte customizado por competência (De / Até em MM/AAAA).
    if (customDe && customAte) {
      periodMonths = new Set(enumMonths(customDe, customAte));
    } else if (customDe || customAte) {
      // Limite aberto de um lado: filtra o eixo pelo(s) limite(s) informado(s).
      const a = customDe ? monthIndex(customDe) : null;
      const b = customAte ? monthIndex(customAte) : null;
      periodMonths = new Set(
        axis.filter((m) => {
          const idx = monthIndex(m);
          if (idx == null) return false;
          if (a != null && idx < a) return false;
          if (b != null && idx > b) return false;
          return true;
        }),
      );
    } else {
      periodMonths = null; // sem limites → acumulado
    }
  } else if (periodo !== "acum") {
    periodMonths = new Set(years.find((y) => y.value === periodo)?.months ?? []);
  } else {
    periodMonths = null;
  }

  const scopeLabel = isAll
    ? "Empresa toda (matriz + filiais + projetos)"
    : selectedProjects[0].name;

  // Comparação de 1–3 versões: só quando o projeto selecionado é o ativo
  // (cujas versões estão no contexto). Caso contrário, coluna única agregada.
  const canCompareVersions = !isAll && selectedProjects[0].id === ctx.project.id;
  // Sem seleção explícita, a DRE abre na versão ATUAL (dados reais).
  const atualVersion = ctx.versions.find((v) => v.kind === "atual") ?? ctx.version;
  const vsIds = (sp.vs ?? "").split(",").filter(Boolean);
  const compareVersions = canCompareVersions
    ? (vsIds.length
        ? ctx.versions.filter((v) => vsIds.includes(v.id))
        : [atualVersion]
      ).slice(0, 3)
    : [];
```

### (m) Há `can(ctx.perms, "dre", "ver")`?


**Não. A página não chama `can` uma única vez**, e não importa nem `can` nem
`AccessDenied` (`page.tsx:1–19`).

O guard inteiro são duas linhas (`page.tsx:228–229`):

```tsx
const ctx = await getActiveContext();
if (!ctx) return null;
```

**A verificação existe, e é no servidor — mas no layout, não na página.**
`dre` está em `SCREENS` (`permissions.ts:42`), então
`screenIdOfPath("/dre")` devolve `"dre"` e o enforcement central
(`layout.tsx:94–95`) aplica `can(ctx.perms, "dre", "ver")` antes de a página
renderizar. É Server Component: roda no servidor, não é checagem de cliente.

É o mesmo padrão do Dashboard — e diferente de `/acerto` e
`/diagnostico/*`, cujos ids não estão em `SCREENS` e por isso escapam do
enforcement central.

Vale registrar que **nenhuma das funções de dados verifica permissão**.
`getDespesas`, `getMonthlyRevenue`, `getExpenseRows` e `getInccRows` são
funções de `queries.ts`: recebem ids e não consultam contexto. E
`getEncargosByVersion`, apesar de morar em `actions/pagamentos.ts` e ser
`"use server"`, também não chama `can` — abre direto no `db.select`
(`pagamentos.ts:122–126`).

### (n) O que revalida `/dre`


**Não há `revalidateTag` no repositório** — nenhuma ocorrência. E a página é
`dynamic = "force-dynamic"` (`page.tsx:21`), ou seja, já é recalculada a cada
request; os `revalidatePath` funcionam como invalidação de cache de rota.

**Catorze chamadas de `revalidatePath("/dre")`, em nove arquivos:**

| Arquivo:linha | Action |
|---|---|
| `actions/despesas.ts:730` | `cancelarDespesa` |
| `actions/despesas.ts:822` | `pagarDespesa` |
| `actions/receitas.ts:54` | ação de reembolso |
| `actions/budget.ts:84` | gravação do Budget/Forecast |
| `actions/planning.ts:126` | gravação do planejamento |
| `actions/medicao.ts:59` | `addMedicao` |
| `actions/medicao.ts:88` | `updateMedicao` |
| `actions/medicao.ts:107` | `deleteMedicao` |
| `actions/pagamentos.ts:118` | registro de pagamento (encargos) |
| `actions/acerto.ts:350` | `concluirAcerto` |
| `actions/acerto.ts:465` | `estornarAcerto` |
| `actions/acerto.ts:633` | `ratearEntreObras` |
| `actions/restituicoes.ts:283` | `registrarRestituicao` |
| `actions/diagnostico.ts:168` | `reclassificarDespesas` |

Duas observações factuais sobre essa lista:

- **As três de `medicao.ts` invalidam uma tela que não lê medição.** Como
  registrado em `docs/TELA-medicao.md`, a DRE não lê a tabela `medicao` — e o
  comentário do próprio `versionInputsByMonth` diz por quê (`page.tsx:136–137`):
  *"a medição de obra NÃO entra na DRE (evita duplicidade)"*.
- **Faltam actions que mudam a DRE e não a revalidam.** `addDespesa`,
  `updateDespesa` e `deleteDespesa` (`actions/despesas.ts`) alteram
  `categoria_dre`, `valor` e `competencia` — os três insumos da DRE — e não
  aparecem na lista. O mesmo vale para as actions de `contas-receber.ts` e
  `permutas`, que alimentam a receita.

### (o) Existe exportação ou impressão?


**Não. Nenhuma das duas.**

Busca no `page.tsx` por `PrintButton`, `print`, `export`, `csv` e `xlsx`:
as únicas ocorrências de `export` são as declarações de módulo
(`export const dynamic`, `export default async function DREPage`). O
componente `PrintButton` existe no repositório e é usado por `/medicao`
(`medicao/page.tsx:80`) — **não por `/dre`**.

Também não há rota de API, action de exportação, nem uso de `xlsx` na tela.
A lib `xlsx` aparece uma vez no app, no importador de extrato
(`import-extrato.tsx:5`), e é de leitura.

A pergunta seguinte — *"os números vêm da mesma consulta da tela ou de
outra?"* — fica sem objeto: não há segunda consulta porque não há segundo
consumidor. O único caminho para os números da DRE é o `versionInputsByMonth`
do próprio `page.tsx`.
