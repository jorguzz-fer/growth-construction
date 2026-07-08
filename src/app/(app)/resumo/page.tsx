import { getActiveContext } from "@/lib/context";
import {
  getMonthlyRevenue,
  getPermutas,
  getReembolsos,
  getUnits,
  permToCalc,
  permToResale,
  reembToCalc,
  toCalcUnit,
} from "@/lib/queries";
import { calcTotals, permutaCashByMonth } from "@/lib/calc";
import { brl0, dateBR, monthInRange } from "@/lib/utils";
import { PageHeader } from "@/components/app/page-header";
import { DateRangeFilter } from "@/components/app/date-range-filter";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Table, THead, TH, TR, TD } from "@/components/ui/table";
import { VersionMultiSelect } from "@/components/app/version-multiselect";
import {
  VersionCompareTable,
  type CompareRow,
} from "@/components/app/version-compare";
import { resolveCompareVersions } from "@/lib/report-versions";
import type { Version } from "@/lib/context";

export const dynamic = "force-dynamic";

/** Indicadores gerais (valores contratados) de uma versão. */
async function versionIndicadores(
  version: Version,
): Promise<{ label: string; value: number }[]> {
  const [unitRows, permRows, reembRows] = await Promise.all([
    getUnits(version.id),
    getPermutas(version.id),
    getReembolsos(version.id),
  ]);
  const totals = calcTotals(
    unitRows.map(toCalcUnit),
    permToCalc(permRows),
    reembToCalc(reembRows),
  );
  const permByTipo = (match: string) =>
    permRows
      .filter((p) => (p.tipoPermuta ?? "").toLowerCase().includes(match))
      .reduce((a, p) => a + Number(p.estimado ?? 0), 0);
  return [
    { label: "VGV Total (tabela de preços)", value: totals.vgv },
    { label: "AS + S1 + S2 + S3 (Sinais)", value: totals.sinais },
    { label: "Mensais (c/INCC p.5+)", value: totals.mens },
    { label: "Semestrais (c/INCC p.5+)", value: totals.sem },
    { label: "Anuais (c/INCC p.5+)", value: totals.anu },
    { label: "FGTS", value: totals.fgts },
    { label: "Subsídio estimado", value: totals.sub },
    { label: "Permuta Recebido (estimado)", value: totals.permRec },
    { label: "Permuta Vendidos (rec. projetada)", value: totals.permVend },
    { label: "Permuta por Materiais", value: permByTipo("material") },
    { label: "Permuta por Serviços de Terceiros", value: permByTipo("servi") },
    { label: "Reembolso (aba própria)", value: totals.reemb },
  ];
}

export default async function ResumoPage({
  searchParams,
}: {
  searchParams: Promise<{ de?: string; ate?: string; vs?: string }>;
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
    const perVersion = await Promise.all(compareVersions.map(versionIndicadores));
    const labels = perVersion[0].map((i) => i.label);
    const rows: CompareRow[] = labels.map((label, ri) => ({
      label,
      values: perVersion.map((ind) => ind[ri]?.value ?? 0),
    }));
    return (
      <>
        <PageHeader
          title="Resumo Executivo"
          subtitle="Comparativo de versões · indicadores gerais (valores contratados)"
          actions={
            <div className="flex flex-wrap items-end gap-3">
              <DateRangeFilter de={de} ate={ate} />
              {versionSelect}
            </div>
          }
        />
        <VersionCompareTable
          firstColLabel="Indicador"
          columns={compareVersions.map((v) => ({ label: v.label, color: v.color }))}
          rows={rows}
        />
      </>
    );
  }

  // ─────────────────────── Modo detalhado (1 versão) ───────────────────────
  const version = compareVersions[0];
  const [unitRows, permRows, reembRows, revenue] = await Promise.all([
    getUnits(version.id),
    getPermutas(version.id),
    getReembolsos(version.id),
    getMonthlyRevenue(version.id, ctx.project.id),
  ]);

  // Recebimentos previstos no período (item 3): receita mensal + revenda de
  // permuta, restritos ao intervalo [de, ate]. Os "Indicadores Gerais" abaixo
  // são valores contratados (acumulados) e não dependem do período.
  const permCash = permutaCashByMonth(permToResale(permRows));
  const recebimentosPeriodo = [
    ...Object.entries(revenue),
    ...Object.entries(permCash),
  ]
    .filter(([mm]) => monthInRange(mm, de, ate))
    .reduce((a, [, v]) => a + v, 0);

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
        eyebrow={`${ctx.project.name} · Versão ${version.label}`}
        title="Resumo Executivo"
        subtitle="Indicadores gerais calculados dinamicamente"
        actions={
          <div className="flex flex-wrap items-end gap-3">
            <DateRangeFilter de={de} ate={ate} />
            {versionSelect}
          </div>
        }
      />

      {hasRange && (
        <Card className="mb-6">
          <CardContent className="flex flex-wrap items-center justify-between gap-3 p-5">
            <div>
              <div className="font-[family-name:var(--font-mono)] text-[10px] uppercase tracking-wide text-[var(--color-ink3)]">
                Recebimentos previstos no período
              </div>
              <div className="text-[12px] text-[var(--color-ink3)]">
                {dateBR(de) !== "—" ? dateBR(de) : "início"} até{" "}
                {dateBR(ate) !== "—" ? dateBR(ate) : "fim"} · receita das unidades
                + reembolso + revenda de permuta
              </div>
            </div>
            <div className="font-[family-name:var(--font-mono)] text-2xl font-semibold text-[var(--color-success)]">
              {brl0(recebimentosPeriodo)}
            </div>
          </CardContent>
        </Card>
      )}

      <div className="grid gap-6 lg:grid-cols-[1fr_360px]">
        {/* Indicadores gerais */}
        <Card>
          <CardContent className="p-5">
            <h2 className="text-sm font-semibold text-[var(--color-ink)]">
              Indicadores Gerais
            </h2>
            <p className="mb-4 text-[11px] text-[var(--color-ink3)]">
              Valores contratados (acumulados) — não variam por período. O recorte
              por data afeta os recebimentos previstos acima.
            </p>
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
