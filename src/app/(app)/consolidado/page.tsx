import { getActiveContext } from "@/lib/context";
import { getInccRows, getRevenueBySource } from "@/lib/queries";
import { PROJECTION_SOURCES, type MonthlyProjection } from "@/lib/calc";
import { brl0, monthInRange } from "@/lib/utils";
import { PageHeader } from "@/components/app/page-header";
import { Card, CardContent } from "@/components/ui/card";
import { Table, THead, TH, TR, TD } from "@/components/ui/table";
import { ConsolidadoControls } from "@/components/app/consolidado-controls";
import { DateRangeFilter } from "@/components/app/date-range-filter";
import { VersionMultiSelect } from "@/components/app/version-multiselect";
import {
  VersionCompareTable,
  type CompareRow,
} from "@/components/app/version-compare";
import { resolveCompareVersions } from "@/lib/report-versions";

export const dynamic = "force-dynamic";

type View = "mensal" | "trimestral" | "semestral" | "anual";
const VIEWS: { key: View; label: string }[] = [
  { key: "mensal", label: "Mensal" },
  { key: "trimestral", label: "Trimestral" },
  { key: "semestral", label: "Semestral" },
  { key: "anual", label: "Anual" },
];

function sortMonth(a: string, b: string): number {
  const [ma, ya] = a.split("/").map(Number);
  const [mb, yb] = b.split("/").map(Number);
  return ya - yb || ma - mb;
}

const fmt = (v: number) => (v > 0 ? brl0(v) : "—");
const sumOver = (map: MonthlyProjection, months: string[]) =>
  months.reduce((a, m) => a + (map[m] || 0), 0);

export default async function ConsolidadoPage({
  searchParams,
}: {
  searchParams: Promise<{ view?: string; ano?: string; de?: string; ate?: string; vs?: string }>;
}) {
  const ctx = await getActiveContext();
  if (!ctx) return null;

  const sp = await searchParams;
  const view: View = VIEWS.some((v) => v.key === sp.view) ? (sp.view as View) : "mensal";
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
      {
        label: "Reembolso",
        values: perVersion.map((rv) => sumFiltered(rv.reemb)),
      },
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
          title="Consolidado"
          subtitle="Comparativo de versões · total por fonte (Reembolso incluído no TOTAL)"
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
  const selected = compareVersions[0];
  const [{ sources, reemb: reembMonth }, incc] = await Promise.all([
    getRevenueBySource(selected.id, ctx.project.id),
    getInccRows(ctx.project.id),
  ]);

  // Horizonte (48 meses INCC + extras) e janelas de ano. Com período informado
  // (item 3), o eixo é restrito ao intervalo [de, ate].
  const fullAxis = Array.from(
    new Set([
      ...incc.map((r) => r.m),
      ...PROJECTION_SOURCES.flatMap((s) => Object.keys(sources[s])),
      ...Object.keys(reembMonth),
    ]),
  ).sort(sortMonth);
  const axis = hasRange
    ? fullAxis.filter((m) => monthInRange(m, de, ate))
    : fullAxis;

  const yearWindows: { value: number; months: string[]; label: string }[] = [];
  for (let i = 0; i < axis.length; i += 12) {
    const months = axis.slice(i, i + 12);
    if (months.length === 0) continue;
    yearWindows.push({
      value: yearWindows.length + 1,
      months,
      label: `Ano ${yearWindows.length + 1} (${months[0]}–${months[months.length - 1]})`,
    });
  }
  const wantedAno = Number(sp.ano) || 1;
  const ano = Math.min(Math.max(1, wantedAno), Math.max(1, yearWindows.length));
  const yearMonths = hasRange ? axis : yearWindows[ano - 1]?.months ?? [];

  // Colunas conforme a periodicidade.
  const columns: { label: string; months: string[] }[] = [];
  if (view === "anual") {
    for (const y of yearWindows) columns.push({ label: `Ano ${y.value}`, months: y.months });
  } else if (view === "mensal") {
    for (const m of yearMonths) columns.push({ label: m, months: [m] });
  } else {
    const size = view === "trimestral" ? 3 : 6;
    const prefix = view === "trimestral" ? "T" : "S";
    for (let i = 0; i < yearMonths.length; i += size) {
      const chunk = yearMonths.slice(i, i + size);
      if (chunk.length) columns.push({ label: `${prefix}${i / size + 1}`, months: chunk });
    }
  }

  // Linhas: fontes + reembolso; TOTAL por coluna e geral.
  const rowMaps: { label: string; map: MonthlyProjection }[] = [
    ...PROJECTION_SOURCES.map((s) => ({ label: s, map: sources[s] })),
    { label: "Reembolso", map: reembMonth },
  ];
  const rows = rowMaps.map((r) => ({
    label: r.label,
    values: columns.map((c) => sumOver(r.map, c.months)),
    total: sumOver(r.map, axis),
  }));
  const totalRow = {
    values: columns.map((_, ci) => rows.reduce((a, r) => a + r.values[ci], 0)),
    total: rows.reduce((a, r) => a + r.total, 0),
  };

  return (
    <>
      <PageHeader
        title="Consolidado"
        subtitle="Reembolso incluído no TOTAL"
        actions={
          <div className="flex flex-wrap items-end gap-3">
            <DateRangeFilter de={de} ate={ate} />
            {!hasRange && (
              <ConsolidadoControls
                views={VIEWS}
                view={view}
                years={yearWindows.map((y) => ({ value: y.value, label: y.label }))}
                ano={ano}
                anoDisabled={view === "anual"}
              />
            )}
            {versionSelect}
          </div>
        }
      />

      <Card>
        <CardContent className="p-5">
          <div className="overflow-x-auto">
            <Table>
              <THead>
                <tr>
                  <TH>Fonte</TH>
                  {columns.map((c) => (
                    <TH key={c.label} className="text-right">
                      {c.label}
                    </TH>
                  ))}
                  <TH className="text-right">Total</TH>
                </tr>
              </THead>
              <tbody>
                {rows.map((r) => (
                  <TR key={r.label}>
                    <TD className="whitespace-nowrap font-medium text-[var(--color-ink)]">
                      {r.label}
                    </TD>
                    {r.values.map((v, i) => (
                      <TD
                        key={i}
                        className="text-right font-[family-name:var(--font-mono)] text-[var(--color-ink2)]"
                      >
                        {fmt(v)}
                      </TD>
                    ))}
                    <TD className="text-right font-[family-name:var(--font-mono)] text-[var(--color-ink3)]">
                      {fmt(r.total)}
                    </TD>
                  </TR>
                ))}
                <TR>
                  <TD className="font-semibold text-[var(--color-ink)]">TOTAL</TD>
                  {totalRow.values.map((v, i) => (
                    <TD
                      key={i}
                      className="text-right font-[family-name:var(--font-mono)] font-semibold text-[var(--color-ink)]"
                    >
                      {fmt(v)}
                    </TD>
                  ))}
                  <TD className="text-right font-[family-name:var(--font-mono)] font-semibold text-[var(--color-accent)]">
                    {fmt(totalRow.total)}
                  </TD>
                </TR>
              </tbody>
            </Table>
          </div>
        </CardContent>
      </Card>
    </>
  );
}
