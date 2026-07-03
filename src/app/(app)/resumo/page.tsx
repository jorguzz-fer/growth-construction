import { getActiveContext } from "@/lib/context";
import {
  getPermutas,
  getReembolsos,
  getUnits,
  permToCalc,
  reembToCalc,
  toCalcUnit,
} from "@/lib/queries";
import { calcTotals } from "@/lib/calc";
import { brl0 } from "@/lib/utils";
import { PageHeader } from "@/components/app/page-header";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Table, THead, TH, TR, TD } from "@/components/ui/table";

export const dynamic = "force-dynamic";

export default async function ResumoPage() {
  const ctx = await getActiveContext();
  if (!ctx) return null;

  const [unitRows, permRows, reembRows] = await Promise.all([
    getUnits(ctx.version.id),
    getPermutas(ctx.version.id),
    getReembolsos(ctx.version.id),
  ]);

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
        eyebrow={`${ctx.project.name} · Versão ${ctx.version.label}`}
        title="Resumo Executivo"
        subtitle="Indicadores gerais calculados dinamicamente"
      />

      <div className="grid gap-6 lg:grid-cols-[1fr_360px]">
        {/* Indicadores gerais */}
        <Card>
          <CardContent className="p-5">
            <h2 className="mb-4 text-sm font-semibold text-[var(--color-ink)]">
              Indicadores Gerais
            </h2>
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
