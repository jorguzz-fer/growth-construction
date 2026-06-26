import { eq } from "drizzle-orm";
import { db, schema } from "@/lib/db";
import { getActiveContext } from "@/lib/context";
import {
  getMonthlyRevenue,
  getUnits,
  getPermutas,
  getReembolsos,
  permToCalc,
  reembToCalc,
  toCalcUnit,
} from "@/lib/queries";
import { calcTotals } from "@/lib/calc";
import { brlk } from "@/lib/utils";
import { PageHeader } from "@/components/app/page-header";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Table, THead, TH, TR, TD } from "@/components/ui/table";

export const dynamic = "force-dynamic";

/** Agrega os indicadores de uma versão para o comparativo multi-versão. */
async function versionSummary(
  projectId: string,
  versionId: string,
): Promise<{ vgv: number; vend: number; receita: number; realizado: number }> {
  const [unitRows, revenue, cashRows] = await Promise.all([
    getUnits(versionId),
    getMonthlyRevenue(versionId, projectId),
    db
      .select({ valor: schema.cashEntries.valor })
      .from(schema.cashEntries)
      .where(eq(schema.cashEntries.versionId, versionId)),
  ]);
  return {
    vgv: unitRows.reduce((a, u) => a + Number(u.valor), 0),
    vend: unitRows.filter((u) => u.status === "Vendido").length,
    receita: Object.values(revenue).reduce((a, b) => a + b, 0),
    realizado: cashRows
      .filter((c) => Number(c.valor) > 0)
      .reduce((a, c) => a + Number(c.valor), 0),
  };
}

export default async function DashboardPage() {
  const ctx = await getActiveContext();
  if (!ctx) return null;

  const [unitRows, permRows, reembRows, cashRows] = await Promise.all([
    getUnits(ctx.version.id),
    getPermutas(ctx.version.id),
    getReembolsos(ctx.version.id),
    db
      .select()
      .from(schema.cashEntries)
      .where(eq(schema.cashEntries.versionId, ctx.version.id)),
  ]);

  const totals = calcTotals(
    unitRows.map(toCalcUnit),
    permToCalc(permRows),
    reembToCalc(reembRows),
  );
  const realizado = cashRows
    .filter((c) => Number(c.valor) > 0)
    .reduce((a, c) => a + Number(c.valor), 0);

  const kpis = [
    { label: "VGV total", value: brlk(totals.vgv), tone: "accent" as const },
    { label: "Vendidas", value: String(totals.vend), tone: "success" as const },
    {
      label: "Disponíveis",
      value: String(totals.disp),
      tone: "neutral" as const,
    },
    {
      label: "Receita realizada",
      value: brlk(realizado),
      tone: "warning" as const,
    },
  ];

  // Comparativo multi-versão (até 3 primeiras versões do projeto).
  const compareVersions = ctx.versions.slice(0, 3);
  const comparativo = await Promise.all(
    compareVersions.map(async (v) => ({
      version: v,
      ...(await versionSummary(ctx.project.id, v.id)),
    })),
  );

  const fontes = [
    { label: "Sinais / Atos", value: totals.sinais },
    { label: "Mensais", value: totals.mens },
    { label: "Semestrais", value: totals.sem },
    { label: "Anuais", value: totals.anu },
    { label: "FGTS", value: totals.fgts },
    { label: "Subsídio", value: totals.sub },
    { label: "Permuta (estimada)", value: totals.permRec },
    { label: "Financiamento", value: totals.banco },
    { label: "Reembolsos", value: totals.reemb },
  ];

  return (
    <>
      <PageHeader
        eyebrow={`${ctx.project.name} · ${ctx.tenant.name}`}
        title="Dashboard"
        subtitle={`Versão ativa: ${ctx.version.label}`}
        actions={
          <Badge tone="accent">
            {totals.vend + totals.res + totals.disp} unidades
          </Badge>
        }
      />

      <section className="grid grid-cols-2 gap-4 sm:grid-cols-4">
        {kpis.map((k) => (
          <Card key={k.label}>
            <CardContent className="p-5">
              <p className="font-[family-name:var(--font-mono)] text-[10px] uppercase tracking-wide text-[var(--color-ink3)]">
                {k.label}
              </p>
              <p className="mt-2 text-2xl font-semibold text-[var(--color-ink)]">
                {k.value}
              </p>
            </CardContent>
          </Card>
        ))}
      </section>

      <Card className="mt-6">
        <CardContent className="p-5">
          <h2 className="mb-3 text-sm font-semibold text-[var(--color-ink)]">
            Comparativo entre versões
          </h2>
          <Table>
            <THead>
              <tr>
                <TH>Versão</TH>
                <TH className="text-right">VGV</TH>
                <TH className="text-right">Vendidas</TH>
                <TH className="text-right">Receita proj.</TH>
                <TH className="text-right">Realizado</TH>
              </tr>
            </THead>
            <tbody>
              {comparativo.map((c) => (
                <TR key={c.version.id}>
                  <TD>
                    <span className="flex items-center gap-2">
                      <span
                        className="inline-block h-2.5 w-2.5 rounded-full"
                        style={{ background: c.version.color }}
                      />
                      <span className="font-medium text-[var(--color-ink)]">
                        {c.version.label}
                      </span>
                      {c.version.id === ctx.version.id && (
                        <Badge tone="accent">ativa</Badge>
                      )}
                    </span>
                  </TD>
                  <TD className="text-right font-[family-name:var(--font-mono)]">
                    {brlk(c.vgv)}
                  </TD>
                  <TD className="text-right font-[family-name:var(--font-mono)]">
                    {c.vend}
                  </TD>
                  <TD className="text-right font-[family-name:var(--font-mono)]">
                    {brlk(c.receita)}
                  </TD>
                  <TD className="text-right font-[family-name:var(--font-mono)]">
                    {brlk(c.realizado)}
                  </TD>
                </TR>
              ))}
            </tbody>
          </Table>
        </CardContent>
      </Card>

      <Card className="mt-6">
        <CardContent className="p-5">
          <h2 className="mb-3 text-sm font-semibold text-[var(--color-ink)]">
            Receita contratada por fonte
          </h2>
          <div className="grid grid-cols-2 gap-x-6 gap-y-2 sm:grid-cols-3">
            {fontes.map((f) => (
              <div
                key={f.label}
                className="flex items-center justify-between border-b border-[var(--color-accent2)]/8 py-1.5"
              >
                <span className="text-[13px] text-[var(--color-ink2)]">
                  {f.label}
                </span>
                <span className="font-[family-name:var(--font-mono)] text-[13px] text-[var(--color-ink)]">
                  {brlk(f.value)}
                </span>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>
    </>
  );
}
