import { getActiveContext } from "@/lib/context";
import {
  getInccRows,
  getReembolsos,
  getRevenueBySource,
  getUnits,
  reembToCalc,
  toCalcUnit,
} from "@/lib/queries";
import {
  calcProjection,
  reembursementsByMonth,
  PROJECTION_SOURCES,
  type MonthlyProjection,
} from "@/lib/calc";
import { brl0, monthInRange } from "@/lib/utils";
import { PageHeader } from "@/components/app/page-header";
import { Card, CardContent } from "@/components/ui/card";
import { Table, THead, TH, TR, TD } from "@/components/ui/table";
import { BarChart, CHART_COLORS } from "@/components/app/charts";
import {
  ProjecaoYearSelect,
  ProjecaoExport,
  type ExportMatrix,
} from "@/components/app/projecao-controls";
import { DateRangeFilter } from "@/components/app/date-range-filter";
import { VersionMultiSelect } from "@/components/app/version-multiselect";
import {
  VersionCompareTable,
  type CompareRow,
} from "@/components/app/version-compare";
import { resolveCompareVersions } from "@/lib/report-versions";

export const dynamic = "force-dynamic";

function sortMonth(a: string, b: string): number {
  const [ma, ya] = a.split("/").map(Number);
  const [mb, yb] = b.split("/").map(Number);
  return ya - yb || ma - mb;
}

const fmt = (v: number) => (v > 0 ? brl0(v) : "—");

export default async function ProjecaoPage({
  searchParams,
}: {
  searchParams: Promise<{ ano?: string; de?: string; ate?: string; vs?: string }>;
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
    const inFilter = (m: string) => !hasRange || monthInRange(m, de, ate);
    const perVersion = await Promise.all(
      compareVersions.map((v) => getRevenueBySource(v.id, ctx.project.id)),
    );
    const sumFiltered = (map: MonthlyProjection) =>
      Object.entries(map)
        .filter(([m]) => inFilter(m))
        .reduce((a, [, v]) => a + v, 0);
    const rows: CompareRow[] = [
      ...PROJECTION_SOURCES.map((s) => ({
        label: s,
        values: perVersion.map((rv) => sumFiltered(rv.sources[s])),
      })),
      { label: "Reembolso", values: perVersion.map((rv) => sumFiltered(rv.reemb)) },
      {
        label: "TOTAL",
        emphasis: "final" as const,
        values: perVersion.map(
          (rv) =>
            PROJECTION_SOURCES.reduce((a, s) => a + sumFiltered(rv.sources[s]), 0) +
            sumFiltered(rv.reemb),
        ),
      },
    ];
    return (
      <>
        <PageHeader
          title="Projeção de Receitas"
          subtitle="Comparativo de versões · receita total projetada por fonte"
          actions={
            <div className="flex flex-wrap items-end gap-3">
              <DateRangeFilter de={de} ate={ate} />
              {versionSelect}
            </div>
          }
        />
        <VersionCompareTable
          firstColLabel="Fonte"
          columns={compareVersions.map((v) => ({ label: v.label, color: v.color }))}
          rows={rows}
        />
      </>
    );
  }

  // ─────────────────────── Modo detalhado (1 versão) ───────────────────────
  const version = compareVersions[0];
  const [unitRows, reembRows, incc] = await Promise.all([
    getUnits(version.id),
    getReembolsos(version.id),
    getInccRows(ctx.project.id),
  ]);

  const perUnit = unitRows.map((u) => ({
    row: u,
    proj: calcProjection(toCalcUnit(u), incc),
  }));
  const unitsProj: MonthlyProjection = {};
  for (const u of perUnit) {
    for (const [mm, v] of Object.entries(u.proj)) unitsProj[mm] = (unitsProj[mm] || 0) + v;
  }
  const reembMonth = reembursementsByMonth(reembToCalc(reembRows));

  // Horizonte (48 meses da tabela INCC + meses extras da projeção).
  const axis = Array.from(
    new Set([...incc.map((r) => r.m), ...Object.keys(unitsProj), ...Object.keys(reembMonth)]),
  ).sort(sortMonth);

  // Janelas de 12 meses (Ano 1..N).
  const years: { value: number; months: string[]; label: string }[] = [];
  for (let i = 0; i < axis.length; i += 12) {
    const months = axis.slice(i, i + 12);
    if (months.length === 0) continue;
    years.push({
      value: years.length + 1,
      months,
      label: `Ano ${years.length + 1} (${months[0]}–${months[months.length - 1]})`,
    });
  }
  const wantedAno = Number(sp.ano) || 1;
  const selectedYear = Math.min(Math.max(1, wantedAno), Math.max(1, years.length));
  const yearMonths = hasRange
    ? axis.filter((m) => monthInRange(m, de, ate))
    : years[selectedYear - 1]?.months ?? [];

  const vendidas = unitRows.filter((u) => u.status === "Vendido").length;
  const grand = (p: MonthlyProjection) => Object.values(p).reduce((a, b) => a + b, 0);
  const reembGrand = grand(reembMonth);
  const totalGrand = grand(unitsProj) + reembGrand;

  // Matriz completa (todos os meses) para exportação.
  const exportMatrix: ExportMatrix = {
    months: axis,
    rows: [
      { label: "Reembolso", values: axis.map((m) => reembMonth[m] || 0), total: reembGrand },
      {
        label: "TOTAL (todas as unidades)",
        values: axis.map((m) => (unitsProj[m] || 0) + (reembMonth[m] || 0)),
        total: totalGrand,
      },
      ...perUnit.map((u) => ({
        label: `${u.row.code} ${u.row.tipo ?? ""}`.trim(),
        values: axis.map((m) => u.proj[m] || 0),
        total: grand(u.proj),
      })),
    ],
  };

  return (
    <>
      <PageHeader
        title="Projeção de Receitas"
        subtitle={`Versão: ${version.label} · ${vendidas} unidades vendidas`}
        actions={
          <div className="flex flex-wrap items-end gap-3">
            <DateRangeFilter de={de} ate={ate} />
            {!hasRange && years.length > 1 && (
              <ProjecaoYearSelect years={years} selected={selectedYear} />
            )}
            <ProjecaoExport matrix={exportMatrix} filename={`projecao-${version.key}.csv`} />
            {versionSelect}
          </div>
        }
      />

      <Card className="mb-6">
        <CardContent className="p-5">
          <BarChart
            height={300}
            currency
            stacked
            data={{
              labels: yearMonths,
              datasets: [
                {
                  label: "Unidades vendidas",
                  data: yearMonths.map((m) => unitsProj[m] || 0),
                  backgroundColor: CHART_COLORS.violet,
                  borderRadius: 4,
                },
                {
                  label: "Reembolso",
                  data: yearMonths.map((m) => reembMonth[m] || 0),
                  backgroundColor: CHART_COLORS.green,
                  borderRadius: 4,
                },
              ],
            }}
          />
        </CardContent>
      </Card>

      {/* Consolidado por fonte */}
      <Card className="mb-6">
        <CardContent className="p-5">
          <div className="mb-3 flex items-center justify-between">
            <h2 className="text-sm font-semibold text-[var(--color-ink)]">
              Consolidado por fonte — todas as unidades
            </h2>
            <span className="font-[family-name:var(--font-mono)] text-[11px] text-[var(--color-accent)]">
              {vendidas} unidades vendidas
            </span>
          </div>
          <Matrix
            months={yearMonths}
            rows={[
              {
                label: "Reembolso",
                values: yearMonths.map((m) => reembMonth[m] || 0),
                total: reembGrand,
              },
            ]}
            totalRow={{
              label: "TOTAL (todas as unidades)",
              values: yearMonths.map((m) => (unitsProj[m] || 0) + (reembMonth[m] || 0)),
              total: totalGrand,
            }}
          />
        </CardContent>
      </Card>

      {/* Detalhe por unidade */}
      <Card>
        <CardContent className="p-5">
          <h2 className="mb-3 flex items-center gap-2 text-sm font-semibold text-[var(--color-ink)]">
            <span aria-hidden>≣</span> Detalhe por unidade
          </h2>
          <Matrix
            months={yearMonths}
            firstColLabel="Unidade"
            rows={perUnit.map((u) => ({
              label: `${u.row.code} ${u.row.tipo ?? ""}`.trim(),
              values: yearMonths.map((m) => u.proj[m] || 0),
              total: grand(u.proj),
            }))}
          />
        </CardContent>
      </Card>
    </>
  );
}

function Matrix({
  months,
  rows,
  totalRow,
  firstColLabel = "Fonte",
}: {
  months: string[];
  rows: { label: string; values: number[]; total: number }[];
  totalRow?: { label: string; values: number[]; total: number };
  firstColLabel?: string;
}) {
  return (
    <Table>
      <THead>
        <tr>
          <TH>{firstColLabel}</TH>
          {months.map((m) => (
            <TH key={m} className="text-right">
              {m}
            </TH>
          ))}
          <TH className="text-right">Total</TH>
        </tr>
      </THead>
      <tbody>
        {rows.map((r) => (
          <TR key={r.label}>
            <TD className="whitespace-nowrap font-medium text-[var(--color-ink)]">{r.label}</TD>
            {r.values.map((v, i) => (
              <TD key={i} className="text-right font-[family-name:var(--font-mono)] text-[var(--color-ink2)]">
                {fmt(v)}
              </TD>
            ))}
            <TD className="text-right font-[family-name:var(--font-mono)] font-semibold text-[var(--color-accent)]">
              {fmt(r.total)}
            </TD>
          </TR>
        ))}
        {totalRow && (
          <TR>
            <TD className="whitespace-nowrap font-semibold text-[var(--color-accent)]">
              {totalRow.label}
            </TD>
            {totalRow.values.map((v, i) => (
              <TD key={i} className="text-right font-[family-name:var(--font-mono)] font-medium text-[var(--color-ink)]">
                {fmt(v)}
              </TD>
            ))}
            <TD className="text-right font-[family-name:var(--font-mono)] font-semibold text-[var(--color-accent)]">
              {fmt(totalRow.total)}
            </TD>
          </TR>
        )}
      </tbody>
    </Table>
  );
}
