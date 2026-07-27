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
