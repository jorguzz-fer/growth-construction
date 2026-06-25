import Link from "next/link";
import { getActiveContext } from "@/lib/context";
import {
  getInccRows,
  getReembolsos,
  getUnits,
  reembToCalc,
  toCalcUnit,
} from "@/lib/queries";
import {
  calcProjection,
  reembursementsByMonth,
  type MonthlyProjection,
} from "@/lib/calc";
import { brl0 } from "@/lib/utils";
import { PageHeader } from "@/components/app/page-header";
import { Table, THead, TH, TR, TD } from "@/components/ui/table";

export const dynamic = "force-dynamic";

type View = "mensal" | "trimestral" | "semestral" | "anual";
const VIEWS: { key: View; label: string }[] = [
  { key: "mensal", label: "Mensal" },
  { key: "trimestral", label: "Trimestral" },
  { key: "semestral", label: "Semestral" },
  { key: "anual", label: "Anual" },
];

function bucketKey(mm: string, view: View): string {
  const [m, y] = mm.split("/").map(Number);
  if (view === "mensal") return mm;
  if (view === "anual") return String(y);
  if (view === "semestral") return `${y} · S${m <= 6 ? 1 : 2}`;
  return `${y} · T${Math.ceil(m / 3)}`;
}

export default async function ConsolidadoPage({
  searchParams,
}: {
  searchParams: Promise<{ view?: string }>;
}) {
  const ctx = await getActiveContext();
  if (!ctx) return null;

  const sp = await searchParams;
  const view: View = VIEWS.some((v) => v.key === sp.view)
    ? (sp.view as View)
    : "anual";

  const [unitRows, reembRows, incc] = await Promise.all([
    getUnits(ctx.version.id),
    getReembolsos(ctx.version.id),
    getInccRows(ctx.project.id),
  ]);

  const monthly: MonthlyProjection = {};
  for (const row of unitRows) {
    const p = calcProjection(toCalcUnit(row), incc);
    for (const [mm, v] of Object.entries(p)) monthly[mm] = (monthly[mm] || 0) + v;
  }
  const reembMonth = reembursementsByMonth(reembToCalc(reembRows));
  const allMonths = new Set([
    ...Object.keys(monthly),
    ...Object.keys(reembMonth),
  ]);

  const buckets = new Map<string, number>();
  const order: string[] = [];
  for (const mm of [...allMonths].sort(sortMonth)) {
    const total = (monthly[mm] || 0) + (reembMonth[mm] || 0);
    if (total <= 0) continue;
    const k = bucketKey(mm, view);
    if (!buckets.has(k)) order.push(k);
    buckets.set(k, (buckets.get(k) || 0) + total);
  }
  const totalGeral = [...buckets.values()].reduce((a, b) => a + b, 0);

  return (
    <>
      <PageHeader
        eyebrow={ctx.version.label}
        title="Consolidado"
        subtitle={`Recebíveis agregados · total ${brl0(totalGeral)}`}
        actions={
          <div className="flex gap-1 rounded-[8px] bg-[var(--color-surface3)] p-1">
            {VIEWS.map((v) => (
              <Link
                key={v.key}
                href={`/consolidado?view=${v.key}`}
                className={`rounded-[6px] px-2.5 py-1 text-xs transition-colors ${
                  v.key === view
                    ? "bg-white text-[var(--color-ink)] shadow-sm"
                    : "text-[var(--color-ink3)] hover:text-[var(--color-ink)]"
                }`}
              >
                {v.label}
              </Link>
            ))}
          </div>
        }
      />

      <Table>
        <THead>
          <tr>
            <TH>Período</TH>
            <TH className="text-right">Recebíveis</TH>
            <TH className="text-right">% do total</TH>
          </tr>
        </THead>
        <tbody>
          {order.map((k) => {
            const v = buckets.get(k) || 0;
            return (
              <TR key={k}>
                <TD className="font-[family-name:var(--font-mono)] font-medium text-[var(--color-ink)]">
                  {k}
                </TD>
                <TD className="text-right font-[family-name:var(--font-mono)]">
                  {brl0(v)}
                </TD>
                <TD className="text-right font-[family-name:var(--font-mono)] text-[var(--color-ink3)]">
                  {totalGeral > 0 ? ((v / totalGeral) * 100).toFixed(1) : "0"}%
                </TD>
              </TR>
            );
          })}
        </tbody>
      </Table>
    </>
  );
}

function sortMonth(a: string, b: string): number {
  const [ma, ya] = a.split("/").map(Number);
  const [mb, yb] = b.split("/").map(Number);
  return ya - yb || ma - mb;
}
