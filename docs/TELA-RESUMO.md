# TELA-RESUMO — código na íntegra

Coleta do código da tela **Resumo Executivo** (`/resumo`), em `main`
(commit `45f4ce3`). Sem resumo, sem análise.

> **Uma premissa do pedido não se confirma: a tabela tem DOZE linhas, não
> quatorze.** Os `indicadores` são um array de 12 entradas
> (`page.tsx:149–162`, e a mesma lista em `:47–60` para o modo comparação).
> O card Unidades, à direita, tem mais quatro números (Disponíveis,
> Reservadas, Vendidas, Total) — se esses forem contados junto, dá 16. Colo as
> doze uma a uma em (b), e as quatro do card em (f).

**Árvore de dependências própria:**

```
resumo/page.tsx
├── components/app/page-header.tsx
├── components/app/date-range-filter.tsx
├── components/app/version-multiselect.tsx
├── components/app/version-compare.tsx      (VersionCompareTable)
└── StatRow                                 — local do page.tsx (291–317)

queries:  getUnits · getPermutas · getReembolsos · getMonthlyRevenue
          + helpers toCalcUnit, permToCalc, permToResale, reembToCalc
calc:     calcTotals · permutaCashByMonth
libs:     report-versions (resolveCompareVersions) · utils (monthInRange)
actions:  NENHUMA — a tela é somente leitura
```

---

## 1. A página

### `src/app/(app)/resumo/page.tsx`

```tsx
import { getActiveContext } from "@/lib/context";
import {
  getMonthlyRevenue,
  getPermutas,
  getReembolsos,
  getUnits,
  permToCalc,
  permToResale,
  reembToCalc,
  toCalcUnit,
} from "@/lib/queries";
import { calcTotals, permutaCashByMonth } from "@/lib/calc";
import { brl0, dateBR, monthInRange } from "@/lib/utils";
import { PageHeader } from "@/components/app/page-header";
import { DateRangeFilter } from "@/components/app/date-range-filter";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Table, THead, TH, TR, TD } from "@/components/ui/table";
import { VersionMultiSelect } from "@/components/app/version-multiselect";
import {
  VersionCompareTable,
  type CompareRow,
} from "@/components/app/version-compare";
import { resolveCompareVersions } from "@/lib/report-versions";
import type { Version } from "@/lib/context";

export const dynamic = "force-dynamic";

/** Indicadores gerais (valores contratados) de uma versão. */
async function versionIndicadores(
  version: Version,
): Promise<{ label: string; value: number }[]> {
  const [unitRows, permRows, reembRows] = await Promise.all([
    getUnits(version.id),
    getPermutas(version.id),
    getReembolsos(version.id),
  ]);
  const totals = calcTotals(
    unitRows.map(toCalcUnit),
    permToCalc(permRows),
    reembToCalc(reembRows),
  );
  const permByTipo = (match: string) =>
    permRows
      .filter((p) => (p.tipoPermuta ?? "").toLowerCase().includes(match))
      .reduce((a, p) => a + Number(p.estimado ?? 0), 0);
  return [
    { label: "VGV Total (tabela de preços)", value: totals.vgv },
    { label: "AS + S1 + S2 + S3 (Sinais)", value: totals.sinais },
    { label: "Mensais (c/INCC p.5+)", value: totals.mens },
    { label: "Semestrais (c/INCC p.5+)", value: totals.sem },
    { label: "Anuais (c/INCC p.5+)", value: totals.anu },
    { label: "FGTS", value: totals.fgts },
    { label: "Subsídio estimado", value: totals.sub },
    { label: "Permuta Recebido (estimado)", value: totals.permRec },
    { label: "Permuta Vendidos (rec. projetada)", value: totals.permVend },
    { label: "Permuta por Materiais", value: permByTipo("material") },
    { label: "Permuta por Serviços de Terceiros", value: permByTipo("servi") },
    { label: "Reembolso (aba própria)", value: totals.reemb },
  ];
}

export default async function ResumoPage({
  searchParams,
}: {
  searchParams: Promise<{ de?: string; ate?: string; vs?: string }>;
}) {
  const ctx = await getActiveContext();
  if (!ctx) return null;

  const sp = await searchParams;
  const de = sp.de ?? "";
  const ate = sp.ate ?? "";
  const hasRange = !!(de || ate);

  const compareVersions = resolveCompareVersions(sp.vs, ctx.versions, ctx.version);
  const multi = compareVersions.length > 1;
  const versionSelect = (
    <VersionMultiSelect
      versions={ctx.versions.map((v) => ({ id: v.id, label: v.label, color: v.color }))}
      selected={compareVersions.map((v) => v.id)}
    />
  );

  // ─────────────────────── Modo comparação (2–3 versões) ───────────────────
  if (multi) {
    const perVersion = await Promise.all(compareVersions.map(versionIndicadores));
    const labels = perVersion[0].map((i) => i.label);
    const rows: CompareRow[] = labels.map((label, ri) => ({
      label,
      values: perVersion.map((ind) => ind[ri]?.value ?? 0),
    }));
    return (
      <>
        <PageHeader
          title="Resumo Executivo"
          subtitle="Comparativo de versões · indicadores gerais (valores contratados)"
          actions={
            <div className="flex flex-wrap items-end gap-3">
              <DateRangeFilter de={de} ate={ate} />
              {versionSelect}
            </div>
          }
        />
        <VersionCompareTable
          firstColLabel="Indicador"
          columns={compareVersions.map((v) => ({ label: v.label, color: v.color }))}
          rows={rows}
        />
      </>
    );
  }

  // ─────────────────────── Modo detalhado (1 versão) ───────────────────────
  const version = compareVersions[0];
  const [unitRows, permRows, reembRows, revenue] = await Promise.all([
    getUnits(version.id),
    getPermutas(version.id),
    getReembolsos(version.id),
    getMonthlyRevenue(version.id, ctx.project.id),
  ]);

  // Recebimentos previstos no período (item 3): receita mensal + revenda de
  // permuta, restritos ao intervalo [de, ate]. Os "Indicadores Gerais" abaixo
  // são valores contratados (acumulados) e não dependem do período.
  const permCash = permutaCashByMonth(permToResale(permRows));
  const recebimentosPeriodo = [
    ...Object.entries(revenue),
    ...Object.entries(permCash),
  ]
    .filter(([mm]) => monthInRange(mm, de, ate))
    .reduce((a, [, v]) => a + v, 0);

  const totals = calcTotals(
    unitRows.map(toCalcUnit),
    permToCalc(permRows),
    reembToCalc(reembRows),
  );
  const totalUnidades = totals.vend + totals.res + totals.disp;

  // Permuta por tipo (estimado), quando classificada em tipoPermuta.
  const permByTipo = (match: string) =>
    permRows
      .filter((p) => (p.tipoPermuta ?? "").toLowerCase().includes(match))
      .reduce((a, p) => a + Number(p.estimado ?? 0), 0);
  const permMateriais = permByTipo("material");
  const permServicos = permByTipo("servi");

  const indicadores: { label: string; value: number }[] = [
    { label: "VGV Total (tabela de preços)", value: totals.vgv },
    { label: "AS + S1 + S2 + S3 (Sinais)", value: totals.sinais },
    { label: "Mensais (c/INCC p.5+)", value: totals.mens },
    { label: "Semestrais (c/INCC p.5+)", value: totals.sem },
    { label: "Anuais (c/INCC p.5+)", value: totals.anu },
    { label: "FGTS", value: totals.fgts },
    { label: "Subsídio estimado", value: totals.sub },
    { label: "Permuta Recebido (estimado)", value: totals.permRec },
    { label: "Permuta Vendidos (rec. projetada)", value: totals.permVend },
    { label: "Permuta por Materiais", value: permMateriais },
    { label: "Permuta por Serviços de Terceiros", value: permServicos },
    { label: "Reembolso (aba própria)", value: totals.reemb },
  ];

  return (
    <>
      <PageHeader
        eyebrow={`${ctx.project.name} · Versão ${version.label}`}
        title="Resumo Executivo"
        subtitle="Indicadores gerais calculados dinamicamente"
        actions={
          <div className="flex flex-wrap items-end gap-3">
            <DateRangeFilter de={de} ate={ate} />
            {versionSelect}
          </div>
        }
      />

      {hasRange && (
        <Card className="mb-6">
          <CardContent className="flex flex-wrap items-center justify-between gap-3 p-5">
            <div>
              <div className="font-[family-name:var(--font-mono)] text-[10px] uppercase tracking-wide text-[var(--color-ink3)]">
                Recebimentos previstos no período
              </div>
              <div className="text-[12px] text-[var(--color-ink3)]">
                {dateBR(de) !== "—" ? dateBR(de) : "início"} até{" "}
                {dateBR(ate) !== "—" ? dateBR(ate) : "fim"} · receita das unidades
                + reembolso + revenda de permuta
              </div>
            </div>
            <div className="font-[family-name:var(--font-mono)] text-2xl font-semibold text-[var(--color-success)]">
              {brl0(recebimentosPeriodo)}
            </div>
          </CardContent>
        </Card>
      )}

      <div className="grid gap-6 lg:grid-cols-[1fr_360px]">
        {/* Indicadores gerais */}
        <Card>
          <CardContent className="p-5">
            <h2 className="text-sm font-semibold text-[var(--color-ink)]">
              Indicadores Gerais
            </h2>
            <p className="mb-4 text-[11px] text-[var(--color-ink3)]">
              Valores contratados (acumulados) — não variam por período. O recorte
              por data afeta os recebimentos previstos acima.
            </p>
            <Table>
              <THead>
                <tr>
                  <TH>Indicador</TH>
                  <TH className="text-right">Valor</TH>
                </tr>
              </THead>
              <tbody>
                {indicadores.map((i) => (
                  <TR key={i.label}>
                    <TD className="text-[var(--color-ink2)]">{i.label}</TD>
                    <TD
                      className={`text-right font-[family-name:var(--font-mono)] font-medium ${
                        i.value > 0
                          ? "text-[var(--color-accent2)]"
                          : "text-[var(--color-ink4)]"
                      }`}
                    >
                      {brl0(i.value)}
                    </TD>
                  </TR>
                ))}
              </tbody>
            </Table>
          </CardContent>
        </Card>

        {/* Coluna direita */}
        <div className="space-y-6">
          <Card>
            <CardContent className="p-5">
              <h2 className="mb-4 text-sm font-semibold text-[var(--color-ink)]">
                Unidades
              </h2>
              <dl className="space-y-3">
                <StatRow label="Disponíveis" value={totals.disp} />
                <StatRow label="Reservadas" value={totals.res} tone="warning" />
                <StatRow label="Vendidas" value={totals.vend} tone="success" />
                <div className="flex items-center justify-between border-t border-[var(--color-accent2)]/12 pt-3">
                  <dt className="text-sm font-semibold text-[var(--color-ink)]">
                    Total
                  </dt>
                  <dd className="font-[family-name:var(--font-mono)] text-sm font-semibold text-[var(--color-ink)]">
                    {totalUnidades}
                  </dd>
                </div>
              </dl>
            </CardContent>
          </Card>

          <Card>
            <CardContent className="p-5">
              <div className="mb-4 flex items-center justify-between">
                <h2 className="text-sm font-semibold text-[var(--color-ink)]">
                  Financiamento Banco
                </h2>
                <Badge tone="danger">não gera projeção</Badge>
              </div>
              <dl className="space-y-3">
                <div className="flex items-center justify-between">
                  <dt className="text-[13px] text-[var(--color-ink2)]">Aprovado</dt>
                  <dd className="font-[family-name:var(--font-mono)] text-[13px] font-medium text-[var(--color-success)]">
                    {brl0(totals.banco)}
                  </dd>
                </div>
                <div className="flex items-center justify-between border-t border-[var(--color-accent2)]/12 pt-3">
                  <dt className="text-sm font-semibold text-[var(--color-ink)]">
                    Total financiado
                  </dt>
                  <dd className="font-[family-name:var(--font-mono)] text-sm font-semibold text-[var(--color-ink)]">
                    {brl0(totals.banco)}
                  </dd>
                </div>
              </dl>
            </CardContent>
          </Card>
        </div>
      </div>
    </>
  );
}

function StatRow({
  label,
  value,
  tone,
}: {
  label: string;
  value: number;
  tone?: "warning" | "success";
}) {
  const color =
    tone === "warning"
      ? "var(--color-warning)"
      : tone === "success"
        ? "var(--color-success)"
        : "var(--color-ink)";
  return (
    <div className="flex items-center justify-between">
      <dt className="text-[13px] text-[var(--color-ink2)]">{label}</dt>
      <dd
        className="font-[family-name:var(--font-mono)] text-sm font-semibold"
        style={{ color }}
      >
        {value}
      </dd>
    </div>
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

### `src/components/app/version-compare.tsx`

```tsx
import { brl0 } from "@/lib/utils";
import { Card, CardContent } from "@/components/ui/card";
import { Table, THead, TH, TR, TD } from "@/components/ui/table";

export interface CompareColumn {
  label: string;
  color?: string;
}

export interface CompareRow {
  label: string;
  values: number[];
  /** ênfase visual: linha de subtotal ou total final. */
  emphasis?: "sub" | "final";
}

/**
 * Tabela de comparação de 1–3 versões: primeira coluna = linhas do relatório
 * (fontes/categorias/indicadores), demais colunas = uma por versão selecionada,
 * cada célula com o total daquela linha na versão. Compartilhada por todos os
 * reports para o modo "comparar versões".
 */
export function VersionCompareTable({
  firstColLabel = "Item",
  columns,
  rows,
}: {
  firstColLabel?: string;
  columns: CompareColumn[];
  rows: CompareRow[];
}) {
  return (
    <Card>
      <CardContent className="p-5">
        <div className="tbl-scroll overflow-x-auto">
          <Table>
            <THead>
              <tr>
                <TH>{firstColLabel}</TH>
                {columns.map((c, ci) => (
                  <TH key={ci} className="text-right">
                    <span className="inline-flex items-center gap-1.5">
                      {c.color && (
                        <span
                          className="inline-block h-2.5 w-2.5 rounded-full"
                          style={{ background: c.color }}
                        />
                      )}
                      {c.label}
                    </span>
                  </TH>
                ))}
              </tr>
            </THead>
            <tbody>
              {rows.map((r, ri) => {
                const emph = r.emphasis;
                return (
                  <TR
                    key={ri}
                    className={emph ? "bg-[var(--color-surface2)]" : undefined}
                  >
                    <TD
                      className={
                        emph === "final"
                          ? "font-semibold text-[var(--color-accent)]"
                          : emph === "sub"
                            ? "font-semibold text-[var(--color-ink)]"
                            : "text-[var(--color-ink2)]"
                      }
                    >
                      {r.label}
                    </TD>
                    {r.values.map((v, i) => (
                      <TD
                        key={i}
                        className={`text-right font-[family-name:var(--font-mono)] ${
                          emph ? "font-semibold" : ""
                        } ${
                          v < 0
                            ? "text-[var(--color-danger)]"
                            : emph
                              ? "text-[var(--color-ink)]"
                              : "text-[var(--color-ink2)]"
                        }`}
                      >
                        {v !== 0 ? brl0(v) : "—"}
                      </TD>
                    ))}
                  </TR>
                );
              })}
            </tbody>
          </Table>
        </div>
      </CardContent>
    </Card>
  );
}
```

---

## 3. As funções de `queries.ts`

### `src/lib/queries.ts` · linhas 85–91

`getUnits`.

```ts
export async function getUnits(versionId: string): Promise<UnitRow[]> {
  return db
    .select()
    .from(schema.units)
    .where(eq(schema.units.versionId, versionId))
    .orderBy(asc(schema.units.code));
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

### `src/lib/queries.ts` · linhas 134–141

`getReembolsos`.

```ts
export async function getReembolsos(
  versionId: string,
): Promise<ReembolsoRow[]> {
  return db
    .select()
    .from(schema.reembolsos)
    .where(eq(schema.reembolsos.versionId, versionId));
}
```

### `src/lib/queries.ts` · linhas 1100–1176

`getMonthlyRevenue` — usada só no modo de versão única, para o card de período.

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

### `src/lib/queries.ts` · linhas 34–61

`toCalcUnit`.

```ts
/** Converte uma linha de unidade do banco para o tipo consumido pelos cálculos. */
export function toCalcUnit(row: UnitRow): CalcUnit {
  // Mescla o plano salvo sobre um plano padrão COMPLETO. Assim, planos antigos
  // ou parciais (com algum subobjeto ausente, ex.: sem "S2") não quebram os
  // cálculos (dashboard, projeção, etc.) — os campos faltantes viram defaults.
  const base = stripIdentity(emptyUnit(row.code)) as Record<string, unknown>;
  const stored = (row.paymentPlan ?? {}) as Record<string, unknown>;
  const plan: Record<string, unknown> = { ...base };
  for (const k of Object.keys(base)) {
    const b = base[k];
    const s = stored[k];
    if (b && typeof b === "object" && !Array.isArray(b)) {
      plan[k] = s && typeof s === "object" ? { ...(b as object), ...(s as object) } : b;
    } else if (s !== undefined) {
      plan[k] = s;
    }
  }
  // Preserva chaves extras do plano salvo (flags de nível superior, etc.).
  for (const k of Object.keys(stored)) {
    if (!(k in plan)) plan[k] = stored[k];
  }
  return {
    ...(plan as Omit<CalcUnit, "code" | "status" | "valor">),
    code: row.code,
    status: row.status,
    valor: Number(row.valor),
  };
}
```

### `src/lib/queries.ts` · linhas 164–171

`permToCalc` — três campos.

```ts

export function permToCalc(rows: PermutaRow[]): CalcPermuta[] {
  return rows.map((p) => ({
    estimado: Number(p.estimado ?? 0),
    status: p.status ?? "",
    valorVenda: Number(p.valorVenda ?? 0),
  }));
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

### `src/lib/queries.ts` · linhas 159–163

`reembToCalc`.

```ts
// helpers de conversão para agregados

export function reembToCalc(rows: ReembolsoRow[]): CalcReembolso[] {
  return rows.map((r) => ({ data: r.data ?? "", valor: Number(r.valor ?? 0) }));
}
```

---

## 4. De `src/lib/calc/`

### `src/lib/calc/projection.ts` · linhas 353–413

**`calcTotals`** — a função que produz onze dos doze indicadores e as três contagens de unidade. Ver (a), (e) e (g).

```ts
/**
 * Agrega os totais de receita de uma versão (VGV, sinais, mensais, semestrais,
 * anuais, FGTS, subsídio, permuta recebida/vendida, reembolsos, banco e
 * contagem por status). Espelha `calcTotals()`, recebendo as coleções da
 * versão ao invés de ler estado global.
 */
export function calcTotals(
  units: readonly CalcUnit[],
  permutas: readonly CalcPermuta[],
  reembolsos: readonly CalcReembolso[],
): VersionTotals {
  let sinais = 0,
    mens = 0,
    sem = 0,
    anu = 0,
    fgts = 0,
    sub = 0,
    permRec = 0,
    permVend = 0,
    banco = 0;

  units.forEach((u) => {
    if (u.status !== "Vendido") return;
    sinais +=
      (u.AS.val || 0) * (u.AS.n || 1) +
      (u.S1.val || 0) +
      (u.S2.val || 0) +
      (u.S3.val || 0);
    mens += (u.Mensais.val || 0) * (u.Mensais.n || 0);
    sem += (u.Semestrais.val || 0) * (u.Semestrais.n || 0);
    anu += (u.Anuais.val || 0) * (u.Anuais.n || 0);
    fgts += u.FGTS.val || 0;
    sub += u.Subsidio.val || 0;
    banco += u.Banco.valFinanc || 0;
  });

  permutas.forEach((p) => {
    permRec += p.estimado || 0;
    if (p.status === "Vendido") permVend += p.valorVenda || 0;
  });

  const reemb = reembolsos.reduce((a, r) => a + (r.valor || 0), 0);
  const vgv = units.reduce((a, u) => a + u.valor, 0);

  return {
    vgv,
    sinais,
    mens,
    sem,
    anu,
    fgts,
    sub,
    permRec,
    permVend,
    reemb,
    banco,
    disp: units.filter((u) => u.status === "Disponivel").length,
    res: units.filter((u) => u.status === "Reservado").length,
    vend: units.filter((u) => u.status === "Vendido").length,
  };
}
```

### `src/lib/calc/types.ts` · linhas 108–124

`VersionTotals` — o tipo devolvido.

```ts
/** Agregados de receita por versão (ver `calcTotals`). */
export interface VersionTotals {
  vgv: number;
  sinais: number;
  mens: number;
  sem: number;
  anu: number;
  fgts: number;
  sub: number;
  permRec: number;
  permVend: number;
  reemb: number;
  banco: number;
  disp: number;
  res: number;
  vend: number;
}
```

### `src/lib/calc/projection.ts` · linhas 277–310

`permutaCashByMonth`.

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


E, para comparação em (g), as duas funções que expandem o `payment_plan` e
que **esta tela não usa**:

### `src/lib/calc/receivables.ts`

`expandUnitReceivables` — usada por `/contasreceber`, `/fechamento` e `getMonthlyRevenue`.

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

### `src/lib/calc/projection.ts` · linhas 156–239

`calcProjectionBySource` — usada por `/consolidado` e `/projecao`.

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

---

## 5. Server Actions


**Nenhuma.** A tela é somente leitura: não importa nada de `@/lib/actions`, não
grava, não tem formulário nem botão de ação. Também não há
`revalidatePath("/resumo")` em nenhuma action do repositório.

---

## 6. As tabelas envolvidas

### `src/lib/db/schema.ts` · linhas 190–195

`unitStatusEnum` — **quatro** valores. Ver (f).

```ts
export const unitStatusEnum = pgEnum("unit_status", [
  "Disponivel",
  "Reservado",
  "Vendido",
  "Permutado",
]);
```

### `src/lib/db/schema.ts` · linhas 415–440

`unit` — a coluna `valor` e o `payment_plan`.

```ts
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

/** Inventário de ativos recebidos em permuta. Ver docs/SPEC.md §3 e §7.4. */
export const permutas = pgTable("permuta", {
  id: uuid("id").primaryKey().defaultRandom(),
  versionId: uuid("version_id")
    .notNull()
    .references(() => versions.id, { onDelete: "cascade" }),
  tenantId: uuid("tenant_id")
    .notNull()
    .references(() => tenants.id, { onDelete: "cascade" }),
  /** código da unidade vinculada (ex.: "BLA 401"). */
```

### `src/lib/db/schema.ts` · linhas 442–460

`permuta`.

```ts
  cliente: text("cliente"),
  dataRecebimento: text("data_recebimento"),
  tipo: text("tipo"),
  descricao: text("descricao"),
  estimado: numeric("estimado", { precision: 15, scale: 2 }),
  status: text("status"),
  dataVenda: text("data_venda"),
  valorVenda: numeric("valor_venda", { precision: 15, scale: 2 }),
  tipoPermuta: text("tipo_permuta"),
  /** revenda do bem recebido: "avista" | "parcelada" | "escambo". */
  formaVenda: text("forma_venda"),
  /** nº de parcelas (revenda parcelada). */
  parcelas: integer("parcelas"),
  /** periodicidade das parcelas: "mensal" | "semestral" | "anual". */
  periodicidade: text("periodicidade"),
  /** vencimento da 1ª parcela "MM/DD/YYYY". */
  dataPrimParcela: text("data_prim_parcela"),
  obs: text("obs"),
});
```

### `src/lib/db/schema.ts` · linhas 462–479

`reembolso`.

```ts
/** Reembolsos da versão. Ver docs/SPEC.md §3 e §7.3. */
export const reembolsos = pgTable("reembolso", {
  id: uuid("id").primaryKey().defaultRandom(),
  versionId: uuid("version_id")
    .notNull()
    .references(() => versions.id, { onDelete: "cascade" }),
  tenantId: uuid("tenant_id")
    .notNull()
    .references(() => tenants.id, { onDelete: "cascade" }),
  /** data REAL "MM/DD/YYYY". */
  data: text("data"),
  origem: text("origem"),
  valor: numeric("valor", { precision: 15, scale: 2 }),
  pct: text("pct"),
  obs: text("obs"),
  serial: integer("serial"),
  status: text("status"),
});
```

---

## 7. As perguntas


### (a) De onde sai o "VGV Total (tabela de preços)"


**É a soma de `unit.valor`.** Não do `payment_plan`, não de
`project.valor_construcao + valor_terreno`.

A expressão é uma linha (`projection.ts:395`):

```ts
const vgv = units.reduce((a, u) => a + u.valor, 0);
```

onde `u.valor` vem de `toCalcUnit` (`queries.ts:59`): `valor: Number(row.valor)`
— a coluna `unit.valor` (`schema.ts:421`).

Três características que saem dessa linha:

- **Soma TODAS as unidades, qualquer que seja o status.** O `forEach` de cima
  (`projection.ts:374–387`) tem `if (u.status !== "Vendido") return;`, mas o
  `reduce` do VGV **está fora dele** e não filtra nada. Unidade disponível,
  reservada e permutada entram no VGV.
- **Não olha o `payment_plan`.** O plano só alimenta os outros indicadores
  (sinais, mensais, …), e para unidades vendidas.
- **Não tem relação com `project.valor_construcao`/`valor_terreno`.** Essas
  colunas existem e são lidas por `getStatusProjeto` (`queries.ts:2109–2111`),
  que alimenta o Dashboard — não esta tela.

Consequência aritmética: o VGV pode não bater com a soma dos demais
indicadores, porque eles cobrem só as vendidas e ele cobre todas.

### `src/lib/calc/projection.ts` · linhas 374–396

O `forEach` filtrado por Vendido e, fora dele, o `reduce` do VGV.

```ts
  units.forEach((u) => {
    if (u.status !== "Vendido") return;
    sinais +=
      (u.AS.val || 0) * (u.AS.n || 1) +
      (u.S1.val || 0) +
      (u.S2.val || 0) +
      (u.S3.val || 0);
    mens += (u.Mensais.val || 0) * (u.Mensais.n || 0);
    sem += (u.Semestrais.val || 0) * (u.Semestrais.n || 0);
    anu += (u.Anuais.val || 0) * (u.Anuais.n || 0);
    fgts += u.FGTS.val || 0;
    sub += u.Subsidio.val || 0;
    banco += u.Banco.valFinanc || 0;
  });

  permutas.forEach((p) => {
    permRec += p.estimado || 0;
    if (p.status === "Vendido") permVend += p.valorVenda || 0;
  });

  const reemb = reembolsos.reduce((a, r) => a + (r.valor || 0), 0);
  const vgv = units.reduce((a, u) => a + u.valor, 0);
```

### (b) As doze linhas, uma a uma


Todas vêm de `calcTotals`, exceto duas calculadas na própria página.

| # | Rótulo | Expressão exata | Origem | Tabela · coluna |
|---|---|---|---|---|
| 1 | VGV Total (tabela de preços) | `units.reduce((a,u) => a + u.valor, 0)` | `projection.ts:395` | `unit.valor` — **todas** as unidades |
| 2 | AS + S1 + S2 + S3 (Sinais) | `(u.AS.val\|\|0)*(u.AS.n\|\|1) + (u.S1.val\|\|0) + (u.S2.val\|\|0) + (u.S3.val\|\|0)` | `projection.ts:376–380` | `unit.payment_plan` → `AS`,`S1`,`S2`,`S3` — só Vendido |
| 3 | Mensais (c/INCC p.5+) | `(u.Mensais.val\|\|0) * (u.Mensais.n\|\|0)` | `projection.ts:381` | `payment_plan.Mensais` — só Vendido |
| 4 | Semestrais (c/INCC p.5+) | `(u.Semestrais.val\|\|0) * (u.Semestrais.n\|\|0)` | `projection.ts:382` | `payment_plan.Semestrais` |
| 5 | Anuais (c/INCC p.5+) | `(u.Anuais.val\|\|0) * (u.Anuais.n\|\|0)` | `projection.ts:383` | `payment_plan.Anuais` |
| 6 | FGTS | `u.FGTS.val \|\| 0` | `projection.ts:384` | `payment_plan.FGTS.val` |
| 7 | Subsídio estimado | `u.Subsidio.val \|\| 0` | `projection.ts:385` | `payment_plan.Subsidio.val` |
| 8 | Permuta Recebido (estimado) | `permRec += p.estimado \|\| 0` | `projection.ts:390` | `permuta.estimado` — **todas**, sem filtro de status |
| 9 | Permuta Vendidos (rec. projetada) | `if (p.status === "Vendido") permVend += p.valorVenda \|\| 0` | `projection.ts:391` | `permuta.valor_venda` + `permuta.status` |
| 10 | Permuta por Materiais | `permRows.filter(p => (p.tipoPermuta ?? "").toLowerCase().includes("material")).reduce((a,p) => a + Number(p.estimado ?? 0), 0)` | `page.tsx:142–146` | `permuta.tipo_permuta` + `.estimado` |
| 11 | Permuta por Serviços de Terceiros | idem, com `includes("servi")` | `page.tsx:142,147` | idem |
| 12 | Reembolso (aba própria) | `reembolsos.reduce((a,r) => a + (r.valor \|\| 0), 0)` | `projection.ts:394` | `reembolso.valor` — **sem filtro de status** |

Quatro observações factuais sobre a tabela:

- **Os itens 2–7 só contam unidades com `status === "Vendido"`**
  (`projection.ts:375`). O item 1 conta todas.
- **O item 2 multiplica só o AS por `n`.** `S1`, `S2` e `S3` entram pelo valor
  unitário, sem multiplicar pela quantidade — e o `AS` usa `|| 1` como default
  de `n`, enquanto os periódicos usam `|| 0`.
- **Os itens 10 e 11 são busca por substring, em minúsculas.** `"servi"` casa
  com "Serviços" e com qualquer outra palavra que a contenha; um tipo grafado
  diferente não casa com nenhum dos dois e some dos dois indicadores — embora
  continue no item 8.
- **O item 12 não filtra status de reembolso.** Como registrado em
  `docs/AUDITORIA-DASHBOARD-FORMULAS.md`, a coluna `reembolso.status` existe e
  é ignorada por `reembToCalc`.

### `src/app/(app)/resumo/page.tsx` · linhas 141–162

As duas linhas calculadas na página e a lista completa.

```tsx
  // Permuta por tipo (estimado), quando classificada em tipoPermuta.
  const permByTipo = (match: string) =>
    permRows
      .filter((p) => (p.tipoPermuta ?? "").toLowerCase().includes(match))
      .reduce((a, p) => a + Number(p.estimado ?? 0), 0);
  const permMateriais = permByTipo("material");
  const permServicos = permByTipo("servi");

  const indicadores: { label: string; value: number }[] = [
    { label: "VGV Total (tabela de preços)", value: totals.vgv },
    { label: "AS + S1 + S2 + S3 (Sinais)", value: totals.sinais },
    { label: "Mensais (c/INCC p.5+)", value: totals.mens },
    { label: "Semestrais (c/INCC p.5+)", value: totals.sem },
    { label: "Anuais (c/INCC p.5+)", value: totals.anu },
    { label: "FGTS", value: totals.fgts },
    { label: "Subsídio estimado", value: totals.sub },
    { label: "Permuta Recebido (estimado)", value: totals.permRec },
    { label: "Permuta Vendidos (rec. projetada)", value: totals.permVend },
    { label: "Permuta por Materiais", value: permMateriais },
    { label: "Permuta por Serviços de Terceiros", value: permServicos },
    { label: "Reembolso (aba própria)", value: totals.reemb },
  ];
```

### (c) O bloco que o rodapé menciona


**Existe, e some quando não há data preenchida.** É o card "Recebimentos
previstos no período", e a condição que o esconde é uma só (`page.tsx:178`):

```tsx
{hasRange && (
  <Card className="mb-6">
    …
  </Card>
)}
```

com `hasRange = !!(de || ate)` (`page.tsx:74`) — **basta um dos dois campos**
para o card aparecer.

O texto do rodapé (`page.tsx:205–208`) diz:

> *"Valores contratados (acumulados) — não variam por período. O recorte por
> data afeta os recebimentos previstos acima."*

Ele descreve corretamente o que acontece **quando há período**: o card acima é
o único elemento da tela afetado por `de`/`ate`. Sem período, o card não
existe e a frase aponta para nada.

O valor do card (`page.tsx:126–132`):

```ts
const permCash = permutaCashByMonth(permToResale(permRows));
const recebimentosPeriodo = [
  ...Object.entries(revenue),
  ...Object.entries(permCash),
]
  .filter(([mm]) => monthInRange(mm, de, ate))
  .reduce((a, [, v]) => a + v, 0);

**Duas fontes**, somadas: `getMonthlyRevenue` (que já inclui recebíveis das
unidades, reembolsos e contas a receber) e `permutaCashByMonth`. O subtítulo
do card descreve como *"receita das unidades + reembolso + revenda de
permuta"* (`page.tsx:187–188`).

Registro também que **`getMonthlyRevenue` só é chamada no modo de versão
única** (`page.tsx:116–121`). No modo comparação, `versionIndicadores`
(`page.tsx:30–61`) não a chama — e o card de período **não é renderizado**, nem
com data preenchida. O `DateRangeFilter` continua visível ali
(`page.tsx:100`), sem efeito nenhum.

### `src/app/(app)/resumo/page.tsx` · linhas 114–133

O cálculo do card, e as quatro consultas do modo detalhado.

```tsx
  // ─────────────────────── Modo detalhado (1 versão) ───────────────────────
  const version = compareVersions[0];
  const [unitRows, permRows, reembRows, revenue] = await Promise.all([
    getUnits(version.id),
    getPermutas(version.id),
    getReembolsos(version.id),
    getMonthlyRevenue(version.id, ctx.project.id),
  ]);

  // Recebimentos previstos no período (item 3): receita mensal + revenda de
  // permuta, restritos ao intervalo [de, ate]. Os "Indicadores Gerais" abaixo
  // são valores contratados (acumulados) e não dependem do período.
  const permCash = permutaCashByMonth(permToResale(permRows));
  const recebimentosPeriodo = [
    ...Object.entries(revenue),
    ...Object.entries(permCash),
  ]
    .filter(([mm]) => monthInRange(mm, de, ate))
    .reduce((a, [, v]) => a + v, 0);
```

### `src/app/(app)/resumo/page.tsx` · linhas 178–197

O card e a condição que o esconde.

```tsx
      {hasRange && (
        <Card className="mb-6">
          <CardContent className="flex flex-wrap items-center justify-between gap-3 p-5">
            <div>
              <div className="font-[family-name:var(--font-mono)] text-[10px] uppercase tracking-wide text-[var(--color-ink3)]">
                Recebimentos previstos no período
              </div>
              <div className="text-[12px] text-[var(--color-ink3)]">
                {dateBR(de) !== "—" ? dateBR(de) : "início"} até{" "}
                {dateBR(ate) !== "—" ? dateBR(ate) : "fim"} · receita das unidades
                + reembolso + revenda de permuta
              </div>
            </div>
            <div className="font-[family-name:var(--font-mono)] text-2xl font-semibold text-[var(--color-success)]">
              {brl0(recebimentosPeriodo)}
            </div>
          </CardContent>
        </Card>
      )}
```

### (d) O selo "não gera projeção"


O código que o renderiza (`page.tsx:259–284`):

```tsx
<div className="mb-4 flex items-center justify-between">
  <h2 className="text-sm font-semibold text-[var(--color-ink)]">
    Financiamento Banco
  </h2>
  <Badge tone="danger">não gera projeção</Badge>
</div>
```

**Não há comentário** — nem na linha, nem no bloco, nem no arquivo. O selo é
literal e sem justificativa no código.

**O que o número é:** `totals.banco` = `Σ u.Banco.valFinanc` das unidades
**vendidas** (`projection.ts:386`). O mesmo valor aparece duas vezes no card,
como "Aprovado" e "Total financiado" (`page.tsx:271` e `:279`).

**Em que consulta o financiamento é excluído:** em `calcTotals`, o `banco` é
somado numa **variável própria** e **não entra em nenhum outro total** — não
está no `vgv`, não está nos sinais, não está nas mensais. É uma linha isolada
do agregado.

**Mas a Projeção mostra o mesmo valor** — e o motivo está em outra função.
`expandUnitReceivables` (`calc/receivables.ts:64–75`) trata `Banco` como uma
das **quatro fontes de parcela única**:

```ts
{ venc: str(sec("Banco").dataPrimParc), val: num(sec("Banco").valFinanc), label: "Financiamento" },
```

Ela gera **um recebível de `valFinanc` inteiro na data `dataPrimParc`**. E
`getMonthlyRevenue`, no ramo Atual, chama exatamente essa função
(`queries.ts:1142–1149`) — que é o que alimenta a Projeção de Receitas, a DRE
e o Fluxo de Caixa.

| Função | Trata `Banco`? | Consumidores |
|---|---|---|
| `calcTotals` | **linha isolada**, fora dos totais | `/resumo` |
| `expandUnitReceivables` | **gera recebível** em `dataPrimParc` | `getMonthlyRevenue` → Projeção, DRE, Fluxo, Dashboard |
| `calcProjection` / `calcProjectionBySource` | ver `projection.ts` | `/consolidado`, `/projecao` |

Ou seja: o selo descreve o comportamento **desta tela** — onde o
financiamento realmente fica de fora dos agregados. Ele não descreve o
comportamento das demais, onde `expandUnitReceivables` o projeta na data da
primeira parcela. Se o `dataPrimParc` da unidade for 01/2026, é nesse mês que
a Projeção o mostra.

### `src/app/(app)/resumo/page.tsx` · linhas 259–285

O card inteiro, com o selo.

```tsx
          <Card>
            <CardContent className="p-5">
              <div className="mb-4 flex items-center justify-between">
                <h2 className="text-sm font-semibold text-[var(--color-ink)]">
                  Financiamento Banco
                </h2>
                <Badge tone="danger">não gera projeção</Badge>
              </div>
              <dl className="space-y-3">
                <div className="flex items-center justify-between">
                  <dt className="text-[13px] text-[var(--color-ink2)]">Aprovado</dt>
                  <dd className="font-[family-name:var(--font-mono)] text-[13px] font-medium text-[var(--color-success)]">
                    {brl0(totals.banco)}
                  </dd>
                </div>
                <div className="flex items-center justify-between border-t border-[var(--color-accent2)]/12 pt-3">
                  <dt className="text-sm font-semibold text-[var(--color-ink)]">
                    Total financiado
                  </dt>
                  <dd className="font-[family-name:var(--font-mono)] text-sm font-semibold text-[var(--color-ink)]">
                    {brl0(totals.banco)}
                  </dd>
                </div>
              </dl>
            </CardContent>
          </Card>
        </div>
```

### `src/lib/calc/receivables.ts` · linhas 64–76

As quatro fontes de parcela única — o `Banco` é a quarta.

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
  return out;
```

### (e) O INCC nas linhas "(c/INCC p.5+)"


**Não. O INCC não é aplicado aqui. Os rótulos são apenas texto.**

As três expressões são multiplicação nominal (`projection.ts:381–383`):

```ts
mens += (u.Mensais.val || 0) * (u.Mensais.n || 0);
sem  += (u.Semestrais.val || 0) * (u.Semestrais.n || 0);
anu  += (u.Anuais.val || 0) * (u.Anuais.n || 0);
```

Verificação em três frentes:

| Verificação | Resultado |
|---|---|
| `calcTotals` recebe parâmetro `incc`? | **não** — a assinatura é `(units, permutas, reembolsos)` (`projection.ts:359–363`) |
| `calcTotals` chama `getIncc`? | **não** — as únicas chamadas no arquivo são `:66` e `:180`, dentro de `calcProjection` e `calcProjectionBySource` |
| A página busca `getInccRows`? | **não** — não está nos imports (`page.tsx:1–25`) |

**A partir de qual parcela e com qual taxa:** a regra `i >= INCC_FROM_INSTALLMENT`
(constante `4`, isto é, da 5ª parcela) com `getIncc(incc, mk)` existe — mas
**em `calcProjection` e `calcProjectionBySource`**, que esta tela não chama.
Aqui não há índice, não há parcela, não há data: é `valor unitário × quantidade`.

Consequência: o número desta tela e o da Projeção de Receitas **divergem por
construção** para as mesmas mensais — um é nominal, o outro corrigido.

### `src/lib/calc/projection.ts` · linhas 42–70

`INCC_FROM_INSTALLMENT` e `calcProjection`, que aplica o índice — para contraste.

```ts

const INCC_FROM_INSTALLMENT = 4; // correção a partir da 5ª parcela (i >= 4)

// ───────────────────────────── projeção ─────────────────────────────────

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
```

### (f) O card Unidades


A contagem (`projection.ts:409–411`):

```ts
disp: units.filter((u) => u.status === "Disponivel").length,
res:  units.filter((u) => u.status === "Reservado").length,
vend: units.filter((u) => u.status === "Vendido").length,
```

**A coluna é `unit.status`** (`schema.ts:424`), do enum `unitStatusEnum`
(`schema.ts:190–195`), que aceita **quatro** valores:

```ts
export const unitStatusEnum = pgEnum("unit_status", [
  "Disponivel",
  "Reservado",
  "Vendido",
  "Permutado",
]);
```

**`"Permutado"` não é contado por nenhuma das três linhas.** E o Total da tela
é `totals.vend + totals.res + totals.disp` (`page.tsx:139`), a soma das três —
logo **uma unidade com status `"Permutado"` não aparece em lugar nenhum do
card**, embora o seu `valor` esteja no VGV (item (a)).

Note a grafia: `"Disponivel"` sem acento no enum, exibido como "Disponíveis"
na tela. O filtro compara com a string exata do banco.

### `src/app/(app)/resumo/page.tsx` · linhas 236–258

O card e o `StatRow`.

```tsx
        {/* Coluna direita */}
        <div className="space-y-6">
          <Card>
            <CardContent className="p-5">
              <h2 className="mb-4 text-sm font-semibold text-[var(--color-ink)]">
                Unidades
              </h2>
              <dl className="space-y-3">
                <StatRow label="Disponíveis" value={totals.disp} />
                <StatRow label="Reservadas" value={totals.res} tone="warning" />
                <StatRow label="Vendidas" value={totals.vend} tone="success" />
                <div className="flex items-center justify-between border-t border-[var(--color-accent2)]/12 pt-3">
                  <dt className="text-sm font-semibold text-[var(--color-ink)]">
                    Total
                  </dt>
                  <dd className="font-[family-name:var(--font-mono)] text-sm font-semibold text-[var(--color-ink)]">
                    {totalUnidades}
                  </dd>
                </div>
              </dl>
            </CardContent>
          </Card>
```

### `src/app/(app)/resumo/page.tsx` · linhas 291–317

`StatRow` — o componente local.

```tsx
function StatRow({
  label,
  value,
  tone,
}: {
  label: string;
  value: number;
  tone?: "warning" | "success";
}) {
  const color =
    tone === "warning"
      ? "var(--color-warning)"
      : tone === "success"
        ? "var(--color-success)"
        : "var(--color-ink)";
  return (
    <div className="flex items-center justify-between">
      <dt className="text-[13px] text-[var(--color-ink2)]">{label}</dt>
      <dd
        className="font-[family-name:var(--font-mono)] text-sm font-semibold"
        style={{ color }}
      >
        {value}
      </dd>
    </div>
  );
}
```

### (g) Qual expansão do `payment_plan` esta tela usa


**Uma terceira implementação: `calcTotals`.** Não é `expandUnitReceivables`,
não é `calcProjectionBySource`.

| Função | Usa flags `usar*`? | Aplica INCC? | Gera datas? | Filtro de status |
|---|---|---|---|---|
| **`calcTotals`** (esta tela) | **não** | **não** | **não** | `status === "Vendido"` |
| `expandUnitReceivables` | não | não | **sim** — uma linha por vencimento | `status === "Vendido"` |
| `calcProjection` / `…BySource` | **sim** — cascata de flags | **sim** | sim — por mês | `status === "Vendido"` |

**`calcTotals` não respeita as flags `usar*`.** Busca por `usar` em
`calcTotals` (`projection.ts:359–413`): **zero ocorrências**. O único filtro
é o `status`, na linha 375. Uma unidade vendida com `usarMens: false` tem as
mensais somadas assim mesmo.

**`calcTotals` não aplica INCC** — ver (e).

**`calcTotals` não gera datas.** Ela produz treze números agregados
(`VersionTotals`, `types.ts:109–124`) e nada por mês. É por isso que os
indicadores "não variam por período": não há eixo temporal para recortar.

As três funções estão coladas na íntegra na seção 4, lado a lado.

### `src/lib/calc/projection.ts` · linhas 353–413

`calcTotals` — repetida aqui para a comparação.

```ts
/**
 * Agrega os totais de receita de uma versão (VGV, sinais, mensais, semestrais,
 * anuais, FGTS, subsídio, permuta recebida/vendida, reembolsos, banco e
 * contagem por status). Espelha `calcTotals()`, recebendo as coleções da
 * versão ao invés de ler estado global.
 */
export function calcTotals(
  units: readonly CalcUnit[],
  permutas: readonly CalcPermuta[],
  reembolsos: readonly CalcReembolso[],
): VersionTotals {
  let sinais = 0,
    mens = 0,
    sem = 0,
    anu = 0,
    fgts = 0,
    sub = 0,
    permRec = 0,
    permVend = 0,
    banco = 0;

  units.forEach((u) => {
    if (u.status !== "Vendido") return;
    sinais +=
      (u.AS.val || 0) * (u.AS.n || 1) +
      (u.S1.val || 0) +
      (u.S2.val || 0) +
      (u.S3.val || 0);
    mens += (u.Mensais.val || 0) * (u.Mensais.n || 0);
    sem += (u.Semestrais.val || 0) * (u.Semestrais.n || 0);
    anu += (u.Anuais.val || 0) * (u.Anuais.n || 0);
    fgts += u.FGTS.val || 0;
    sub += u.Subsidio.val || 0;
    banco += u.Banco.valFinanc || 0;
  });

  permutas.forEach((p) => {
    permRec += p.estimado || 0;
    if (p.status === "Vendido") permVend += p.valorVenda || 0;
  });

  const reemb = reembolsos.reduce((a, r) => a + (r.valor || 0), 0);
  const vgv = units.reduce((a, u) => a + u.valor, 0);

  return {
    vgv,
    sinais,
    mens,
    sem,
    anu,
    fgts,
    sub,
    permRec,
    permVend,
    reemb,
    banco,
    disp: units.filter((u) => u.status === "Disponivel").length,
    res: units.filter((u) => u.status === "Reservado").length,
    vend: units.filter((u) => u.status === "Vendido").length,
  };
}
```

### (h) Como a tela resolve projeto e versão


**Projeto: não resolve.** A tela **não tem seletor de projeto** — não há
`ProjectPicker` nem `?proj=` no `searchParams` (`page.tsx:66`). Usa
`ctx.project` diretamente, em dois lugares: o `eyebrow` (`page.tsx:167`) e o
argumento de `getMonthlyRevenue` (`page.tsx:120`).

| Fallback de projeto | Existe? |
|---|---|
| `?proj=` | **não** |
| `ctx.project` | **sim** — é a única fonte |
| `ctx.projects[0]` | **não** |
| cookie | só indiretamente, via `getActiveContext` |

**Versão** (`page.tsx:76`):

```ts
const compareVersions = resolveCompareVersions(sp.vs, ctx.versions, ctx.version);
```

A lista é **`ctx.versions`** — as versões do projeto ativo, já resolvidas por
`getActiveContext`. A tela **não consulta a tabela `version`**: não importa
`db`, `schema` nem `getVersionsDoProjeto`.

O fallback está dentro de `resolveCompareVersions` (`report-versions.ts:13–15`):

```ts
const ids = (vs ?? "").split(",").filter(Boolean);
const sel = ids.length ? versions.filter((v) => ids.includes(v.id)) : [active];
return (sel.length ? sel : [active]).slice(0, max);
```

**Dois níveis:** sem `?vs=`, usa `ctx.version`; com `?vs=` que não casa com
nenhum id, também cai em `ctx.version`.

| Pergunta | Resposta |
|---|---|
| Lê `version.kind`? | **não** — nenhuma ocorrência no `page.tsx` |
| Lê `version.status`? | **não** |
| Lê `version.label` / `.color` / `.id` | sim — rótulo, cor da pílula e id da consulta |

Diferente da DRE (que procura `kind === "atual"`) e do Fluxo de Caixa
(idem), **o Resumo abre na versão ATIVA da sessão**, qualquer que seja o seu
kind — pode abrir em Budget sem avisar.

### `src/app/(app)/resumo/page.tsx` · linhas 63–84

A resolução inteira.

```tsx
export default async function ResumoPage({
  searchParams,
}: {
  searchParams: Promise<{ de?: string; ate?: string; vs?: string }>;
}) {
  const ctx = await getActiveContext();
  if (!ctx) return null;

  const sp = await searchParams;
  const de = sp.de ?? "";
  const ate = sp.ate ?? "";
  const hasRange = !!(de || ate);

  const compareVersions = resolveCompareVersions(sp.vs, ctx.versions, ctx.version);
  const multi = compareVersions.length > 1;
  const versionSelect = (
    <VersionMultiSelect
      versions={ctx.versions.map((v) => ({ id: v.id, label: v.label, color: v.color }))}
      selected={compareVersions.map((v) => v.id)}
    />
  );
```

### `src/lib/report-versions.ts`

`resolveCompareVersions`.

```ts
import type { Version } from "@/lib/context";

/**
 * Resolve as versões selecionadas para comparação a partir do parâmetro `vs`
 * (ids separados por vírgula). Sem seleção, usa a versão ativa. Limita a `max`.
 */
export function resolveCompareVersions(
  vs: string | undefined,
  versions: Version[],
  active: Version,
  max = 3,
): Version[] {
  const ids = (vs ?? "").split(",").filter(Boolean);
  const sel = ids.length ? versions.filter((v) => ids.includes(v.id)) : [active];
  return (sel.length ? sel : [active]).slice(0, max);
}
```

### (i) O seletor de versões


**A lista é `ctx.versions`, sem filtro e sem ordenação na tela**
(`page.tsx:79–82`):

```tsx
<VersionMultiSelect
  versions={ctx.versions.map((v) => ({ id: v.id, label: v.label, color: v.color }))}
  selected={compareVersions.map((v) => v.id)}
/>
```

**Quantas versões o projeto tem: o código não fixa.** Quem monta `ctx.versions`
é `getActiveContext`, e o limite documentado está no schema
(`schema.ts:360–364`): *"Limite de 6 por projeto (3 fixas + 3 customizadas)"*.
Quatro pílulas significam quatro versões cadastradas nesse projeto — o número
exato depende do banco, que esta sessão não acessa.

**Ordenação:** a tela não ordena. A ordem é a que `getActiveContext` produziu.

**Há limite — dois, em camadas diferentes:**

| Limite | Onde | Valor |
|---|---|---|
| Pílulas exibidas | nenhum — mapeia `ctx.versions` inteiro | — |
| Versões **selecionáveis** ao mesmo tempo | `resolveCompareVersions(…, max = 3)` | **3** |
| Seleção no componente | `VersionMultiSelect` (`max = 3`), que descarta a mais antiga ao passar | **3** |
| Versões por projeto | comentário do schema | 6 |

No `VersionMultiSelect`, tentar marcar uma quarta **remove a primeira
selecionada** em vez de recusar, e desmarcar a última mantém ao menos uma
(`version-multiselect.tsx:31–39`).

### `src/components/app/version-multiselect.tsx`

`VersionMultiSelect` — a mecânica de seleção e o limite.

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

### (j) O JSX das células de valor


```tsx
<TD
  className={`text-right font-[family-name:var(--font-mono)] font-medium ${
    i.value > 0
      ? "text-[var(--color-accent2)]"
      : "text-[var(--color-ink4)]"
  }`}
>
  {brl0(i.value)}
</TD>
```

(`page.tsx:220–228`.)

**A tela não distingue ausência de zero.** O valor é sempre `brl0(i.value)`,
sem condicional de conteúdo — não há `"—"` em nenhuma célula da tabela de
indicadores.

**O que o `> 0` faz é só mudar a cor:** valor positivo fica em
`--color-accent2`; zero (e negativo) fica em `--color-ink4`, o cinza mais
claro. É uma distinção **visual**, não textual — e não separa "sem dado" de
"dado igual a zero": os dois casos produzem `R$ 0` no mesmo cinza.

Como `brl0` passa por `clampZero(value, 0)`, um valor como `-0,4` também
imprime `R$ 0` — e cai no cinza, porque `-0,4 > 0` é falso.

O card Unidades é diferente: exibe o número cru (`{value}`,
`page.tsx:313`), sem formatação de moeda. Zero unidades aparece como `0`.

### `src/app/(app)/resumo/page.tsx` · linhas 209–233

A tabela de indicadores inteira.

```tsx
            <Table>
              <THead>
                <tr>
                  <TH>Indicador</TH>
                  <TH className="text-right">Valor</TH>
                </tr>
              </THead>
              <tbody>
                {indicadores.map((i) => (
                  <TR key={i.label}>
                    <TD className="text-[var(--color-ink2)]">{i.label}</TD>
                    <TD
                      className={`text-right font-[family-name:var(--font-mono)] font-medium ${
                        i.value > 0
                          ? "text-[var(--color-accent2)]"
                          : "text-[var(--color-ink4)]"
                      }`}
                    >
                      {brl0(i.value)}
                    </TD>
                  </TR>
                ))}
              </tbody>
            </Table>
          </CardContent>
```

### (k) Permissão


**A tela não chama `can`.** O guard inteiro são duas linhas
(`page.tsx:68–69`):

```tsx
const ctx = await getActiveContext();
if (!ctx) return null;
```

Não importa `can` nem `AccessDenied`.

| Pergunta | Resposta |
|---|---|
| Chama `can(ctx.perms, "resumo", "ver")`? | **não** |
| `"resumo"` está em `SCREENS`? | **sim** — `permissions.ts:45` |
| Está em `CONTADOR_VE`? | **sim** — `permissions.ts:88` |

Como está em `SCREENS`, o enforcement central do layout cobre a rota no
servidor (`layout.tsx:94–95`).

### `src/lib/permissions.ts` · linhas 41–46

`resumo` em `SCREENS`.

```ts
  { id: "balancodia", label: "Balanço do Dia", modulo: "Reports" },
  { id: "dre", label: "DRE", modulo: "Reports" },
  { id: "fluxocaixa", label: "Fluxo de Caixa", modulo: "Reports" },
  { id: "medicao", label: "Medição de Obra", modulo: "Reports" },
  { id: "resumo", label: "Resumo Executivo", modulo: "Reports" },
  { id: "unidades", label: "Unidades / Dados de Venda", modulo: "Receitas" },
```

### `src/lib/permissions.ts` · linhas 83–93

`CONTADOR_VE` — inclui `resumo`.

```ts
/** Telas que o perfil "contador" (somente leitura) enxerga. */
const CONTADOR_VE = new Set([
  "dre",
  "fluxocaixa",
  "medicao",
  "resumo",
  "consolidado",
  "planocontas",
  "despesas",
  "acoes",
]);
```

### `src/app/(app)/layout.tsx` · linhas 92–95

O enforcement central.

```tsx
  // Enforcement central de "Ver": mapeia a rota atual para a tela governada.
  const pathname = (await headers()).get("x-pathname");
  const screenId = screenIdOfPath(pathname);
  const denied = screenId ? !can(ctx.perms, screenId, "ver") : false;
```

### (l) `tenant_id` no where, linha a linha


São **quatro** consultas diretas (mais as internas de `getMonthlyRevenue`), e
**nenhuma** tem `tenant_id`.

| # | Função | Linha | Tabela | Tenant no WHERE? | O que há no WHERE |
|---|---|---|---|---|---|
| 1 | `getUnits` | `queries.ts:89` | `unit` | **NÃO** | `eq(units.versionId, versionId)` |
| 2 | `getPermutas` | `queries.ts:147` | `permuta` | **NÃO** | `eq(permutas.versionId, versionId)` |
| 3 | `getReembolsos` | `queries.ts:140` | `reembolso` | **NÃO** | `eq(reembolsos.versionId, versionId)` |
| 4 | `getMonthlyRevenue` → `getVersionKind` | `queries.ts:949` | `version` | **NÃO** | `eq(versions.id, versionId)` |
| 5 | `getMonthlyRevenue` (budget) | `queries.ts:1122–1127` | `budget_line` | **NÃO** | `version_id` + `kind` |
| 6 | `getMonthlyRevenue` → `getUnits` | `queries.ts:89` | `unit` | **NÃO** | só `version_id` |
| 7 | `getMonthlyRevenue` → `getReembolsos` | `queries.ts:140` | `reembolso` | **NÃO** | só `version_id` |
| 8 | `getMonthlyRevenue` | `queries.ts:1163–1168` | `conta_receber` | **NÃO** | `project_id` + `cancelado` |

**Zero de oito.** O isolamento é indireto: `version_id` em sete casos e
`project_id` em um, ambos UUIDs vindos de `ctx`, já resolvido dentro do
tenant. **Nenhum filtro de tenant aplicado depois em JavaScript.**

A página não faz consulta inline: não importa `db` nem `schema`.

É a tela com a menor cobertura de `tenant_id` entre as auditadas — a
comparação: Fluxo de Caixa 2 de 13, Dashboard 11 de 17, Medição CEF 0 de 2,
Resumo **0 de 8**.

### (m) `BETWEEN` e `ORDER BY` sobre coluna `text` de data


**`BETWEEN` não existe** — nem `gte`/`lte` do Drizzle, em nenhuma das oito
consultas. O único recorte de período é `monthInRange` (`page.tsx:131`), em
JavaScript, sobre as chaves `"MM/YYYY"` já agregadas.

**`ORDER BY` sobre coluna `text` de data: nenhum no caminho desta tela.**

| Consulta | `ORDER BY` | Coluna | Tipo |
|---|---|---|---|
| `getUnits` | `asc(units.code)` | `code` | `text` — **código, não data** |
| `getPermutas` | **nenhum** | — | — |
| `getReembolsos` | **nenhum** | — | — |
| `getVersionKind` | **nenhum** (tem `limit(1)`) | — | — |
| `budget_line` / `conta_receber` (em `getMonthlyRevenue`) | **nenhum** | — | — |

A única ordenação do caminho é por `unit.code`, que não é data.

### (n) Exportação ou impressão


**Não existe nenhuma das duas.**

Busca no `page.tsx` por `PrintButton`, `print`, `csv` e `xlsx`: zero
ocorrências. As únicas linhas com `export` são as declarações de módulo
(`export const dynamic`, `export default async function ResumoPage`). Não há
botão, rota de API nem action de exportação.

Como registrado em `docs/TELA-FLUXOCAIXA.md`, o `PrintButton` tem **um único
uso em todo o app** — `/medicao`.
