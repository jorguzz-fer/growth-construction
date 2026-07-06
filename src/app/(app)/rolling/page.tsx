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
import { dateBR, monthInRange } from "@/lib/utils";
import { PageHeader } from "@/components/app/page-header";
import { DateRangeFilter } from "@/components/app/date-range-filter";
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
  searchParams: Promise<{ periodo?: string; de?: string; ate?: string }>;
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
  const de = sp.de ?? "";
  const ate = sp.ate ?? "";
  const hasRange = !!(de || ate);
  const periodo = hasRange ? "acum" : sp.periodo ?? "acum";
  const periodMonths =
    !hasRange && periodo !== "acum"
      ? new Set(years.find((y) => y.value === periodo)?.months ?? [])
      : null;
  // Intervalo de datas (item 3) tem prioridade sobre a seleção de Ano.
  const inP = (mm: string | null) =>
    hasRange
      ? monthInRange(mm, de, ate)
      : !periodMonths || (mm != null && periodMonths.has(mm));
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

  // ── Bases de despesa: por grupo CEF (obra) e por categoria (corporativo) ──
  // Grupos CEF vêm do plano de contas (sempre presentes), então os drivers de
  // obra nunca ficam em branco mesmo sem despesas lançadas ainda.
  const cefGroups = new Map<string, string>(); // code → name
  for (const r of chart) {
    if (r.kind === "cef" && !cefGroups.has(r.groupCode))
      cefGroups.set(r.groupCode, r.groupName);
  }
  const groupBase: Record<string, number> = {};
  const catBase: Record<string, number> = {};
  for (const d of despesas) {
    if (!inP(toMonth(d.competencia))) continue;
    const val = Number(d.valor);
    const grp = d.contaCef ? d.contaCef.split(".")[0] : null;
    if (grp) {
      groupBase[grp] = (groupBase[grp] || 0) + val;
    } else {
      const cat = d.categoriaDre || "Outros";
      catBase[cat] = (catBase[cat] || 0) + val;
    }
  }
  // Grupos que aparecem em despesas mas não no plano (defensivo).
  for (const code of Object.keys(groupBase)) {
    if (!cefGroups.has(code)) cefGroups.set(code, "");
  }
  const custoGroups: DriverItem[] = [...cefGroups.keys()]
    .sort((a, b) => a.localeCompare(b, undefined, { numeric: true }))
    .map((code) => ({
      key: code,
      label: cefGroups.get(code) ? `${code} · ${cefGroups.get(code)}` : `Grupo ${code}`,
      base: groupBase[code] || 0,
    }));

  // Gastos fixos / corporativos: despesas sem conta CEF, por categoria DRE.
  const CORP_CATS = [
    "Custo Fixo",
    "Despesa Variável",
    "Despesa Fixa",
    "Retiradas",
    "Investimento",
    "Empréstimos",
  ];
  const gastosFixos: DriverItem[] = [
    ...new Set([...CORP_CATS, ...Object.keys(catBase)]),
  ]
    .map((cat) => ({ key: cat, label: cat, base: catBase[cat] || 0 }))
    .sort((a, b) => {
      const ia = CORP_CATS.indexOf(a.key);
      const ib = CORP_CATS.indexOf(b.key);
      return (ia < 0 ? 99 : ia) - (ib < 0 ? 99 : ib) || a.key.localeCompare(b.key);
    });

  // ── Custo variável (medição de obra do engenheiro) ───────────────────────
  const custoVar = medicoes
    .filter((m) => inP(m.competencia))
    .reduce((a, m) => a + Number(m.valor), 0);

  // ── Realizado (entradas de caixa positivas no período) ───────────────────
  const realizado = cash.reduce((a, c) => {
    const v = Number(c.valor);
    return v > 0 && inP(toMonth(c.data)) ? a + v : a;
  }, 0);

  const periodLabel = hasRange
    ? `${dateBR(de) !== "—" ? dateBR(de) : "início"} – ${dateBR(ate) !== "—" ? dateBR(ate) : "fim"}`
    : periodMonths && years.find((y) => y.value === periodo)
      ? years.find((y) => y.value === periodo)!.label
      : "Acumulado (todo o horizonte)";

  return (
    <>
      <PageHeader
        eyebrow={ctx.version.label}
        title="Rolling Forecast"
        subtitle={`Simulador driver-based · ${periodLabel} · variações não alteram os dados reais`}
        actions={<DateRangeFilter de={de} ate={ate} />}
      />
      <RollingSimulator
        receitaSources={receitaSources}
        custoGroups={custoGroups}
        gastosFixos={gastosFixos}
        custoVar={custoVar}
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
