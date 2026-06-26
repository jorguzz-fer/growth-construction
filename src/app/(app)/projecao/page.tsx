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
import { Card, CardContent } from "@/components/ui/card";
import { Table, THead, TH, TR, TD } from "@/components/ui/table";
import { LineChart, CHART_COLORS } from "@/components/app/charts";

export const dynamic = "force-dynamic";

export default async function ProjecaoPage() {
  const ctx = await getActiveContext();
  if (!ctx) return null;

  const [unitRows, reembRows, incc] = await Promise.all([
    getUnits(ctx.version.id),
    getReembolsos(ctx.version.id),
    getInccRows(ctx.project.id),
  ]);

  // Soma a projeção de todas as unidades vendidas, mês a mês.
  const unitsProj: MonthlyProjection = {};
  for (const row of unitRows) {
    const p = calcProjection(toCalcUnit(row), incc);
    for (const [mm, v] of Object.entries(p)) {
      unitsProj[mm] = (unitsProj[mm] || 0) + v;
    }
  }
  const reembMonth = reembursementsByMonth(reembToCalc(reembRows));

  // Eixo: meses da tabela INCC; inclui também meses extras presentes na projeção.
  const axis = Array.from(
    new Set([
      ...incc.map((r) => r.m),
      ...Object.keys(unitsProj),
      ...Object.keys(reembMonth),
    ]),
  ).sort(sortMonth);

  let acumulado = 0;
  const linhas = axis.map((mm) => {
    const proj = unitsProj[mm] || 0;
    const reemb = reembMonth[mm] || 0;
    const total = proj + reemb;
    acumulado += total;
    return { mm, proj, reemb, total, acumulado };
  });
  const totalGeral = linhas.reduce((a, l) => a + l.total, 0);

  return (
    <>
      <PageHeader
        eyebrow={ctx.version.label}
        title="Projeção de Receitas"
        subtitle={`Recebíveis projetados mês a mês · total ${brl0(totalGeral)}`}
      />

      {linhas.some((l) => l.total > 0) && (
        <Card className="mb-6">
          <CardContent className="p-5">
            <h2 className="mb-3 text-sm font-semibold text-[var(--color-ink)]">
              Recebíveis projetados por mês
            </h2>
            <LineChart
              currency
              data={{
                labels: linhas.filter((l) => l.total > 0).map((l) => l.mm),
                datasets: [
                  {
                    label: "Total/mês",
                    data: linhas.filter((l) => l.total > 0).map((l) => l.total),
                    borderColor: CHART_COLORS.indigo,
                    backgroundColor: "rgba(99,102,241,.15)",
                    fill: true,
                    tension: 0.3,
                  },
                ],
              }}
            />
          </CardContent>
        </Card>
      )}

      <Table>
        <THead>
          <tr>
            <TH>Mês</TH>
            <TH className="text-right">Unidades</TH>
            <TH className="text-right">Reembolsos</TH>
            <TH className="text-right">Total</TH>
            <TH className="text-right">Acumulado</TH>
          </tr>
        </THead>
        <tbody>
          {linhas
            .filter((l) => l.total > 0)
            .map((l) => (
              <TR key={l.mm}>
                <TD className="font-[family-name:var(--font-mono)] font-medium text-[var(--color-ink)]">
                  {l.mm}
                </TD>
                <TD className="text-right font-[family-name:var(--font-mono)]">
                  {l.proj > 0 ? brl0(l.proj) : "—"}
                </TD>
                <TD className="text-right font-[family-name:var(--font-mono)]">
                  {l.reemb > 0 ? brl0(l.reemb) : "—"}
                </TD>
                <TD className="text-right font-[family-name:var(--font-mono)] font-medium text-[var(--color-ink)]">
                  {brl0(l.total)}
                </TD>
                <TD className="text-right font-[family-name:var(--font-mono)] text-[var(--color-ink3)]">
                  {brl0(l.acumulado)}
                </TD>
              </TR>
            ))}
        </tbody>
      </Table>

      {linhas.every((l) => l.total === 0) && (
        <p className="mt-4 text-sm text-[var(--color-ink3)]">
          Nenhuma receita projetada nesta versão. Marque unidades como vendidas e
          preencha o plano de pagamento.
        </p>
      )}
    </>
  );
}

/** Ordena chaves "MM/YYYY" cronologicamente. */
function sortMonth(a: string, b: string): number {
  const [ma, ya] = a.split("/").map(Number);
  const [mb, yb] = b.split("/").map(Number);
  return ya - yb || ma - mb;
}
