import { getActiveContext } from "@/lib/context";
import {
  getCash,
  getChartAccounts,
  getDespesas,
  getInccRows,
  getMedicoes,
  getReembolsos,
  getUnits,
  reembToCalc,
  toCalcUnit,
} from "@/lib/queries";
import {
  calcProjectionBySource,
  reembursementsByMonth,
  PROJECTION_SOURCES,
  type MonthlyProjection,
  type ProjectionSource,
} from "@/lib/calc";
import { PageHeader } from "@/components/app/page-header";
import {
  RollingSimulator,
  type DriverItem,
} from "@/components/app/rolling-simulator";

export const dynamic = "force-dynamic";

function sortMonth(a: string, b: string): number {
  const [ma, ya] = a.split("/").map(Number);
  const [mb, yb] = b.split("/").map(Number);
  return ya - yb || ma - mb;
}

/** "MM/DD/YYYY" ou "MM/YYYY" → "MM/YYYY". */
function toMonth(d: string | null): string | null {
  if (!d) return null;
  const p = d.split("/");
  if (p.length === 3) return `${p[0]}/${p[2]}`;
  if (p.length === 2) return d;
  return null;
}

export default async function RollingPage({
  searchParams,
}: {
  searchParams: Promise<{ periodo?: string }>;
}) {
  const ctx = await getActiveContext();
  if (!ctx) return null;

  const [unitRows, reembRows, incc, despesas, medicoes, cash, chart] =
    await Promise.all([
      getUnits(ctx.version.id),
      getReembolsos(ctx.version.id),
      getInccRows(ctx.project.id),
      getDespesas(ctx.version.id),
      getMedicoes(ctx.version.id),
      getCash(ctx.version.id),
      getChartAccounts(ctx.tenant.id),
    ]);

  // ── Receita projetada por fonte (todas as unidades) + reembolso ──────────
  const sources = Object.fromEntries(
    PROJECTION_SOURCES.map((s) => [s, {} as MonthlyProjection]),
  ) as Record<ProjectionSource, MonthlyProjection>;
  for (const u of unitRows) {
    const bs = calcProjectionBySource(toCalcUnit(u), incc);
    for (const s of PROJECTION_SOURCES) {
      for (const [mm, v] of Object.entries(bs[s])) {
        sources[s][mm] = (sources[s][mm] || 0) + v;
      }
    }
  }
  const reembMonth = reembursementsByMonth(reembToCalc(reembRows));

  // ── Horizonte + janelas de 12 meses (Ano N) ──────────────────────────────
  const axis = Array.from(
    new Set([
      ...incc.map((r) => r.m),
      ...PROJECTION_SOURCES.flatMap((s) => Object.keys(sources[s])),
      ...Object.keys(reembMonth),
      ...despesas.map((d) => toMonth(d.competencia)).filter(Boolean) as string[],
      ...medicoes.map((m) => m.competencia),
    ]),
  ).sort(sortMonth);

  const years: { value: string; months: string[]; label: string }[] = [];
  for (let i = 0; i < axis.length; i += 12) {
    const months = axis.slice(i, i + 12);
    if (months.length)
      years.push({
        value: String(years.length + 1),
        months,
        label: `Ano ${years.length + 1} (${months[0]}–${months[months.length - 1]})`,
      });
  }

  const sp = await searchParams;
  const periodo = sp.periodo ?? "acum";
  const periodMonths =
    periodo !== "acum"
      ? new Set(years.find((y) => y.value === periodo)?.months ?? [])
      : null;
  const inP = (mm: string | null) => !periodMonths || (mm != null && periodMonths.has(mm));
  const sumOver = (map: MonthlyProjection) =>
    Object.entries(map).reduce((a, [mm, v]) => a + (inP(mm) ? v : 0), 0);

  // ── Drivers de receita (por fonte + reembolso) ───────────────────────────
  const receitaSources: DriverItem[] = [
    ...PROJECTION_SOURCES.map((s) => ({
      key: s,
      label: s,
      base: sumOver(sources[s]),
    })),
    { key: "Reembolso", label: "Reembolso", base: sumOver(reembMonth) },
  ].filter((d) => d.base > 0);

  // ── Drivers de despesa: grupos CEF (obra) ────────────────────────────────
  const cefNames = new Map<string, string>();
  for (const r of chart) {
    if (r.kind === "cef" && !cefNames.has(r.groupCode))
      cefNames.set(r.groupCode, r.groupName);
  }
  const groupBase: Record<string, number> = {};
  let outrasDespesas = 0;
  for (const d of despesas) {
    if (!inP(toMonth(d.competencia))) continue;
    const val = Number(d.valor);
    const grp = d.contaCef ? d.contaCef.split(".")[0] : null;
    if (grp) groupBase[grp] = (groupBase[grp] || 0) + val;
    else outrasDespesas += val;
  }
  const custoGroups: DriverItem[] = Object.entries(groupBase)
    .filter(([, base]) => base > 0)
    .sort((a, b) =>
      a[0].localeCompare(b[0], undefined, { numeric: true }),
    )
    .map(([code, base]) => ({
      key: code,
      label: cefNames.get(code) ? `${code} · ${cefNames.get(code)}` : `Grupo ${code}`,
      base,
    }));

  // ── Custo variável (medição de obra do engenheiro) ───────────────────────
  const custoVar = medicoes
    .filter((m) => inP(m.competencia))
    .reduce((a, m) => a + Number(m.valor), 0);

  // ── Realizado (entradas de caixa positivas no período) ───────────────────
  const realizado = cash.reduce((a, c) => {
    const v = Number(c.valor);
    return v > 0 && inP(toMonth(c.data)) ? a + v : a;
  }, 0);

  const periodLabel =
    periodMonths && years.find((y) => y.value === periodo)
      ? years.find((y) => y.value === periodo)!.label
      : "Acumulado (todo o horizonte)";

  return (
    <>
      <PageHeader
        eyebrow={ctx.version.label}
        title="Rolling Forecast"
        subtitle={`Simulador driver-based · ${periodLabel} · variações não alteram os dados reais`}
      />
      <RollingSimulator
        receitaSources={receitaSources}
        custoGroups={custoGroups}
        custoVar={custoVar}
        outrasDespesas={outrasDespesas}
        realizado={realizado}
        years={[
          { value: "acum", label: "Acumulado (todos os anos)" },
          ...years.map((y) => ({ value: y.value, label: y.label })),
        ]}
        periodo={periodo}
      />
    </>
  );
}
