import { getActiveContext } from "@/lib/context";
import {
  getBankAccounts,
  getDespesas,
  getInccRows,
  getExpenseRows,
  getMonthlyRevenue,
  getParcelasByVersion,
  getPermutas,
  permToResale,
  sortMonthKey,
} from "@/lib/queries";
import { permutaCashByMonth } from "@/lib/calc";
import { isBudgetVersion } from "@/lib/budget/config";
import { getRestituicoesPendentesByVersion } from "@/lib/actions/restituicoes";
import { brl0, brlk, monthInRange } from "@/lib/utils";
import { PageHeader } from "@/components/app/page-header";
import { Card, CardContent } from "@/components/ui/card";
import { Table, THead, TH, TR, TD } from "@/components/ui/table";
import { ProjecaoYearSelect } from "@/components/app/projecao-controls";
import { DateRangeFilter } from "@/components/app/date-range-filter";
import { VersionMultiSelect } from "@/components/app/version-multiselect";
import {
  VersionCompareTable,
  type CompareRow,
} from "@/components/app/version-compare";
import { resolveCompareVersions } from "@/lib/report-versions";
import type { Version } from "@/lib/context";

export const dynamic = "force-dynamic";

/** "MM/DD/YYYY" → "MM/YYYY" (mês do vencimento). */
function vencMonth(d: string | null): string | null {
  if (!d) return null;
  const p = d.split("/");
  if (p.length === 3) return `${p[0]}/${p[2]}`;
  if (p.length === 2) return d;
  return null;
}

/** Mapas de entradas e saídas mensais de uma versão (budget-aware). */
async function flowMaps(
  version: Version,
  projectId: string,
): Promise<{ entradas: Record<string, number>; saidas: Record<string, number> }> {
  const [entradas, despesas, permutas, parcelas] = await Promise.all([
    getMonthlyRevenue(version.id, projectId),
    getDespesas(version.id),
    getPermutas(version.id),
    getParcelasByVersion(version.id),
  ]);

  // Recebimentos da revenda de bens recebidos em permuta (item 10).
  const permCash = permutaCashByMonth(permToResale(permutas));
  for (const [mm, v] of Object.entries(permCash)) {
    entradas[mm] = (entradas[mm] || 0) + v;
  }

  const saidas: Record<string, number> = {};
  if (isBudgetVersion(version.kind)) {
    // Budget/Forecast: saídas do lançamento simplificado (por competência).
    const expenses = await getExpenseRows(version.id);
    for (const e of expenses) {
      const mm = vencMonth(e.competencia);
      if (mm) saidas[mm] = (saidas[mm] || 0) + e.valor;
    }
  } else {
    // Versão detalhada: despesas pagas por terceiro NÃO geram saída na
    // competência — a saída ocorre só na restituição (Fase 4).
    const { despesaIds: terceiroIds, saidasPrevistas: restPrevistas } =
      await getRestituicoesPendentesByVersion(version.id);
    const excluir = new Set(terceiroIds);
    const comParcela = new Set(parcelas.map((p) => p.despesaId));
    for (const p of parcelas) {
      if (p.status === "Cancelado" || excluir.has(p.despesaId)) continue;
      const mm = vencMonth(p.vencimento);
      if (mm) saidas[mm] = (saidas[mm] || 0) + Number(p.valorOriginal);
    }
    for (const d of despesas) {
      if (comParcela.has(d.id) || excluir.has(d.id)) continue;
      const mm = vencMonth(d.vencimento) ?? vencMonth(d.competencia);
      if (mm) saidas[mm] = (saidas[mm] || 0) + Number(d.valor);
    }
    for (const [mm, v] of Object.entries(restPrevistas)) {
      saidas[mm] = (saidas[mm] || 0) + v;
    }
  }
  return { entradas, saidas };
}

export default async function FluxoCaixaPage({
  searchParams,
}: {
  searchParams: Promise<{ ano?: string; de?: string; ate?: string; vs?: string }>;
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
    const inFilter = (mm: string) => !hasRange || monthInRange(mm, de, ate);
    const perVersion = await Promise.all(
      compareVersions.map((v) => flowMaps(v, ctx.project.id)),
    );
    const sumMap = (map: Record<string, number>) =>
      Object.entries(map)
        .filter(([m]) => inFilter(m))
        .reduce((a, [, val]) => a + val, 0);
    const rows: CompareRow[] = [
      { label: "Entradas", values: perVersion.map((p) => sumMap(p.entradas)) },
      { label: "(−) Saídas", values: perVersion.map((p) => sumMap(p.saidas)) },
      {
        label: "= Saldo do período",
        emphasis: "final",
        values: perVersion.map((p) => sumMap(p.entradas) - sumMap(p.saidas)),
      },
    ];
    return (
      <>
        <PageHeader
          title="Fluxo de Caixa Mensal"
          subtitle="Comparativo de versões · entradas, saídas e saldo do período"
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
  const [{ entradas, saidas }, incc, contas] = await Promise.all([
    flowMaps(version, ctx.project.id),
    getInccRows(ctx.project.id),
    getBankAccounts(ctx.tenant.id),
  ]);

  // Saldo inicial = soma dos saldos das contas correntes.
  const saldoInicial = contas.reduce((a, c) => a + Number(c.saldo), 0);

  // Horizonte + janelas de 12 meses (Ano N).
  const axis = [
    ...new Set([...incc.map((r) => r.m), ...Object.keys(entradas), ...Object.keys(saidas)]),
  ].sort(sortMonthKey);
  const years: { value: number; months: string[]; label: string }[] = [];
  for (let i = 0; i < axis.length; i += 12) {
    const months = axis.slice(i, i + 12);
    if (months.length)
      years.push({
        value: years.length + 1,
        months,
        label: `Ano ${years.length + 1} (${months[0]}–${months[months.length - 1]})`,
      });
  }
  const selectedYear = Math.min(Math.max(1, Number(sp.ano) || 1), Math.max(1, years.length));
  // Com período informado, o intervalo de datas tem prioridade sobre o Ano N.
  const yearMonths = hasRange
    ? axis.filter((mm) => monthInRange(mm, de, ate))
    : years[selectedYear - 1]?.months ?? [];

  // Saldo acumulado corre desde o saldo inicial ao longo de todo o horizonte.
  let acumulado = saldoInicial;
  const acumMap: Record<string, number> = {};
  for (const mm of axis) {
    acumulado += (entradas[mm] || 0) - (saidas[mm] || 0);
    acumMap[mm] = acumulado;
  }

  const linhas = yearMonths.map((mm) => {
    const e = entradas[mm] || 0;
    const s = saidas[mm] || 0;
    return { mm, e, s, liquido: e - s, saldo: acumMap[mm] ?? saldoInicial };
  });
  const totE = linhas.reduce((a, l) => a + l.e, 0);
  const totS = linhas.reduce((a, l) => a + l.s, 0);
  const saldoAcumFinal = linhas.length ? linhas[linhas.length - 1].saldo : saldoInicial;

  return (
    <>
      <PageHeader
        title="Fluxo de Caixa Mensal"
        subtitle="Por data de vencimento/pagamento · saldo acumulado"
        actions={
          <div className="flex flex-wrap items-end gap-3">
            <DateRangeFilter de={de} ate={ate} />
            {!hasRange && years.length > 1 && (
              <ProjecaoYearSelect years={years} selected={selectedYear} basePath="/fluxocaixa" />
            )}
            {versionSelect}
          </div>
        }
      />

      <div className="mb-6 grid grid-cols-1 gap-4 sm:grid-cols-3">
        <Kpi icon="↓" label="Total entradas" value={brlk(totE)} tone="success" />
        <Kpi icon="↑" label="Total saídas" value={brlk(totS)} tone="danger" />
        <Kpi icon="⚖" label="Saldo do período" value={brlk(totE - totS)} tone="accent" />
      </div>

      <Card>
        <CardContent className="p-0">
          <Table>
            <THead>
              <tr>
                <TH>Mês</TH>
                <TH className="text-right">Entradas</TH>
                <TH className="text-right">Saídas</TH>
                <TH className="text-right">Saldo do mês</TH>
                <TH className="text-right">Saldo acumulado</TH>
              </tr>
            </THead>
            <tbody>
              {linhas.map((l) => (
                <TR key={l.mm}>
                  <TD className="font-[family-name:var(--font-mono)] font-medium text-[var(--color-ink)]">
                    {l.mm}
                  </TD>
                  <TD className="text-right font-[family-name:var(--font-mono)] text-[var(--color-success)]">
                    {l.e > 0 ? brl0(l.e) : "—"}
                  </TD>
                  <TD className="text-right font-[family-name:var(--font-mono)] text-[var(--color-danger)]">
                    {l.s > 0 ? brl0(l.s) : "—"}
                  </TD>
                  <TD className="text-right font-[family-name:var(--font-mono)] font-medium text-[var(--color-success)]">
                    {brl0(l.liquido)}
                  </TD>
                  <TD className="text-right font-[family-name:var(--font-mono)] font-semibold text-[var(--color-accent)]">
                    {brl0(l.saldo)}
                  </TD>
                </TR>
              ))}
              {linhas.length === 0 ? (
                <TR>
                  <TD colSpan={5} className="py-8 text-center text-[var(--color-ink4)]">
                    Sem movimentação neste período.
                  </TD>
                </TR>
              ) : (
                <TR className="bg-[var(--color-surface2)]">
                  <TD className="font-semibold text-[var(--color-ink)]">TOTAL</TD>
                  <TD className="text-right font-[family-name:var(--font-mono)] font-semibold text-[var(--color-success)]">
                    {brl0(totE)}
                  </TD>
                  <TD className="text-right font-[family-name:var(--font-mono)] font-semibold text-[var(--color-danger)]">
                    {brl0(totS)}
                  </TD>
                  <TD className="text-right font-[family-name:var(--font-mono)] font-semibold text-[var(--color-success)]">
                    {brl0(totE - totS)}
                  </TD>
                  <TD className="text-right font-[family-name:var(--font-mono)] font-semibold text-[var(--color-accent)]">
                    {brl0(saldoAcumFinal)}
                  </TD>
                </TR>
              )}
            </tbody>
          </Table>
        </CardContent>
      </Card>
    </>
  );
}

function Kpi({
  icon,
  label,
  value,
  tone,
}: {
  icon: string;
  label: string;
  value: string;
  tone: "success" | "danger" | "accent";
}) {
  const color =
    tone === "success"
      ? "var(--color-success)"
      : tone === "danger"
        ? "var(--color-danger)"
        : "var(--color-accent)";
  return (
    <Card>
      <CardContent className="p-5">
        <span
          className="inline-flex h-8 w-8 items-center justify-center rounded-[8px] text-sm"
          style={{ background: `${color}1a`, color }}
        >
          {icon}
        </span>
        <p className="mt-3 font-[family-name:var(--font-mono)] text-[10px] uppercase tracking-wide text-[var(--color-ink3)]">
          {label}
        </p>
        <p className="mt-1 text-2xl font-semibold" style={{ color }}>
          {value}
        </p>
      </CardContent>
    </Card>
  );
}
