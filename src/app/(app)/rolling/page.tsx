import { getActiveContext } from "@/lib/context";
import { getCash, getMonthlyRevenue, sortMonthKey } from "@/lib/queries";
import { brl0 } from "@/lib/utils";
import { PageHeader } from "@/components/app/page-header";
import { Table, THead, TH, TR, TD } from "@/components/ui/table";

export const dynamic = "force-dynamic";

function dataMonth(d: string | null): string | null {
  if (!d) return null;
  const p = d.split("/");
  return p.length === 3 ? `${p[0]}/${p[2]}` : null;
}

export default async function RollingPage() {
  const ctx = await getActiveContext();
  if (!ctx) return null;

  const [previsto, cash] = await Promise.all([
    getMonthlyRevenue(ctx.version.id, ctx.project.id),
    getCash(ctx.version.id),
  ]);

  const realizado: Record<string, number> = {};
  for (const c of cash) {
    const mm = dataMonth(c.data);
    if (mm && Number(c.valor) > 0)
      realizado[mm] = (realizado[mm] || 0) + Number(c.valor);
  }

  const axis = [
    ...new Set([...Object.keys(previsto), ...Object.keys(realizado)]),
  ].sort(sortMonthKey);
  const maxVal = Math.max(
    1,
    ...axis.map((m) => Math.max(previsto[m] || 0, realizado[m] || 0)),
  );

  const totP = Object.values(previsto).reduce((a, b) => a + b, 0);
  const totR = Object.values(realizado).reduce((a, b) => a + b, 0);

  return (
    <>
      <PageHeader
        eyebrow={ctx.version.label}
        title="Rolling Forecast"
        subtitle={`Previsto ${brl0(totP)} · Realizado ${brl0(totR)} · atingimento ${totP > 0 ? ((totR / totP) * 100).toFixed(0) : 0}%`}
      />

      <Table>
        <THead>
          <tr>
            <TH>Mês</TH>
            <TH className="text-right">Previsto</TH>
            <TH className="text-right">Realizado</TH>
            <TH>Comparativo</TH>
          </tr>
        </THead>
        <tbody>
          {axis
            .filter((m) => (previsto[m] || 0) > 0 || (realizado[m] || 0) > 0)
            .map((m) => {
              const p = previsto[m] || 0;
              const r = realizado[m] || 0;
              return (
                <TR key={m}>
                  <TD className="font-[family-name:var(--font-mono)] font-medium text-[var(--color-ink)]">
                    {m}
                  </TD>
                  <TD className="text-right font-[family-name:var(--font-mono)]">
                    {p > 0 ? brl0(p) : "—"}
                  </TD>
                  <TD className="text-right font-[family-name:var(--font-mono)]">
                    {r > 0 ? brl0(r) : "—"}
                  </TD>
                  <TD>
                    <div className="flex flex-col gap-1">
                      <Bar value={p} max={maxVal} color="var(--color-budget)" />
                      <Bar value={r} max={maxVal} color="var(--color-forecast)" />
                    </div>
                  </TD>
                </TR>
              );
            })}
        </tbody>
      </Table>

      <div className="mt-3 flex gap-4 text-xs text-[var(--color-ink3)]">
        <Legend color="var(--color-budget)" label="Previsto" />
        <Legend color="var(--color-forecast)" label="Realizado" />
      </div>
    </>
  );
}

function Bar({ value, max, color }: { value: number; max: number; color: string }) {
  const pct = Math.max(0, Math.min(100, (value / max) * 100));
  return (
    <div className="h-2 w-40 overflow-hidden rounded-full bg-[var(--color-surface3)]">
      <div className="h-full rounded-full" style={{ width: `${pct}%`, background: color }} />
    </div>
  );
}

function Legend({ color, label }: { color: string; label: string }) {
  return (
    <span className="flex items-center gap-1.5">
      <span className="inline-block h-2.5 w-2.5 rounded-full" style={{ background: color }} />
      {label}
    </span>
  );
}
