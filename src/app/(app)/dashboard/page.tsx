import Link from "next/link";
import { eq } from "drizzle-orm";
import { db, schema } from "@/lib/db";
import { getActiveContext, type Version } from "@/lib/context";
import {
  getMonthlyRevenue,
  getUnits,
  getPermutas,
  getReembolsos,
  getContasPagar,
  getReceivables,
  permToCalc,
  reembToCalc,
  toCalcUnit,
} from "@/lib/queries";
import { calcTotals, parseDate } from "@/lib/calc";
import { brlk, brl0, monthInRange, dateInRange, dateBR } from "@/lib/utils";
import { PageHeader } from "@/components/app/page-header";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { buttonVariants } from "@/components/ui/button";
import { BarChart, DoughnutChart, CHART_COLORS } from "@/components/app/charts";
import { VersionMultiSelect } from "@/components/app/version-multiselect";
import { DateRangeFilter } from "@/components/app/date-range-filter";

export const dynamic = "force-dynamic";

const MESES = ["jan", "fev", "mar", "abr", "mai", "jun", "jul", "ago", "set", "out", "nov", "dez"];

interface Summary {
  version: Version;
  vgv: number;
  realizado: number;
  receitaProj: number;
  aReceber: number;
  /** contas a pagar não pagas no período (só faz sentido na versão Atual). */
  aPagar: number;
  monthly: Record<string, number>;
  /** entradas realizadas (fechamentos de caixa) por mês "MM/YYYY". */
  realizadoMonthly: Record<string, number>;
}

/** Indicadores agregados de uma versão (para os KPIs e o comparativo). */
async function versionSummary(
  projectId: string,
  version: Version,
  de: string,
  ate: string,
): Promise<Summary> {
  const hasRange = !!(de || ate);
  const [unitRows, revenueAll, cashRows] = await Promise.all([
    getUnits(version.id),
    getMonthlyRevenue(version.id, projectId),
    db
      .select({ valor: schema.cashEntries.valor, data: schema.cashEntries.data })
      .from(schema.cashEntries)
      .where(eq(schema.cashEntries.versionId, version.id)),
  ]);
  // Filtro de período (item 3): receita por mês e realizado por data.
  const revenue = hasRange
    ? Object.fromEntries(
        Object.entries(revenueAll).filter(([mm]) => monthInRange(mm, de, ate)),
      )
    : revenueAll;
  const receitaProj = Object.values(revenue).reduce((a, b) => a + b, 0);
  // Entradas realizadas (fechamentos de caixa) no período, por data e por mês.
  const realizadoRows = cashRows.filter(
    (c) => Number(c.valor) > 0 && (!hasRange || dateInRange(c.data, de, ate)),
  );
  const realizado = realizadoRows.reduce((a, c) => a + Number(c.valor), 0);
  const realizadoMonthly: Record<string, number> = {};
  for (const c of realizadoRows) {
    const d = parseDate(c.data);
    if (!d) continue;
    const key = `${String(d.mo).padStart(2, "0")}/${d.yr}`;
    realizadoMonthly[key] = (realizadoMonthly[key] || 0) + Number(c.valor);
  }
  return {
    version,
    vgv: unitRows.reduce((a, u) => a + Number(u.valor), 0),
    realizado,
    receitaProj,
    aReceber: Math.max(0, receitaProj - realizado),
    aPagar: 0,
    monthly: revenue,
    realizadoMonthly,
  };
}

interface Venc {
  ord: number;
  dateLabel: string;
  unitCode: string;
  label: string;
  value: number;
  overdue: boolean;
  /** "receber" (entrada) ou "pagar" (saída/contas a pagar). */
  tipo: "receber" | "pagar";
}

export default async function DashboardPage({
  searchParams,
}: {
  searchParams: Promise<{ vs?: string; de?: string; ate?: string }>;
}) {
  const ctx = await getActiveContext();
  if (!ctx) return null;

  const sp = await searchParams;
  const de = sp.de ?? "";
  const ate = sp.ate ?? "";
  const wanted = (sp.vs ?? "").split(",").filter(Boolean);
  const validWanted = ctx.versions.filter((v) => wanted.includes(v.id)).slice(0, 3);
  const selected = validWanted.length > 0 ? validWanted : ctx.versions.slice(0, 3);

  const summaries = await Promise.all(
    selected.map((v) => versionSummary(ctx.project.id, v, de, ate)),
  );

  // ── Versão "Atual — caixa real": dados reais ────────────────────────────
  // Budget/Forecast permanecem estritamente em suas seções. A versão Atual
  // reflete o caixa real do período: (a) fechamentos já realizados (entradas
  // conciliadas), (b) recebíveis das unidades vendidas ainda não recebidos
  // (entradas projetadas) e (c) despesas lançadas ainda não pagas (saídas
  // projetadas / contas a pagar).
  const hasRangeDash = !!(de || ate);
  const realReceb = (await getReceivables(ctx.tenant.id)).filter(
    (r) => r.projectId === ctx.project.id && (!hasRangeDash || dateInRange(r.dia, de, ate)),
  );
  const totalReceb = realReceb.reduce((a, r) => a + r.valor, 0);

  // Contas a pagar (despesas não pagas) do projeto, com vencimento no período.
  const contasPagarProj = (await getContasPagar(ctx.tenant.id)).filter(
    (c) =>
      c.projectId === ctx.project.id &&
      c.status !== "Pago" &&
      !!c.vencimento &&
      (!hasRangeDash || dateInRange(c.vencimento, de, ate)),
  );
  const totalPagar = contasPagarProj.reduce((a, c) => a + c.valor, 0);

  // Recebíveis por mês (entradas projetadas) — compõem o comparativo do Atual.
  const recebByMonth: Record<string, number> = {};
  for (const r of realReceb) {
    const d = parseDate(r.dia);
    if (!d) continue;
    const key = `${String(d.mo).padStart(2, "0")}/${d.yr}`;
    recebByMonth[key] = (recebByMonth[key] || 0) + r.valor;
  }
  for (const s of summaries) {
    if (s.version.kind !== "atual") continue;
    // Comparativo mensal = entradas realizadas (fechamentos) + recebíveis projetados.
    const monthly: Record<string, number> = { ...s.realizadoMonthly };
    for (const [mm, v] of Object.entries(recebByMonth)) {
      monthly[mm] = (monthly[mm] || 0) + v;
    }
    s.monthly = monthly;
    s.receitaProj = s.realizado + totalReceb;
    s.aReceber = totalReceb; // recebíveis ainda não recebidos
    s.aPagar = totalPagar; // despesas ainda não pagas
  }

  // Ano do comparativo: o que concentra mais receita projetada nas versões.
  const yearTotals = new Map<number, number>();
  for (const s of summaries) {
    for (const [mm, val] of Object.entries(s.monthly)) {
      const y = Number(mm.split("/")[1]);
      if (y) yearTotals.set(y, (yearTotals.get(y) || 0) + val);
    }
  }
  const year =
    [...yearTotals.entries()].sort((a, b) => b[1] - a[1])[0]?.[0] ??
    new Date().getFullYear();

  // Fontes de receita + próximos vencimentos: da versão primária (1ª selecionada).
  const primary = selected[0];
  const [primUnits, primPerm, primReemb] = await Promise.all([
    getUnits(primary.id),
    getPermutas(primary.id),
    getReembolsos(primary.id),
  ]);
  const totals = calcTotals(
    primUnits.map(toCalcUnit),
    permToCalc(primPerm),
    reembToCalc(primReemb),
  );
  const fontes = [
    { label: "Sinais / Atos", value: totals.sinais },
    { label: "Mensais", value: totals.mens },
    { label: "Semestrais", value: totals.sem },
    { label: "Anuais", value: totals.anu },
    { label: "FGTS", value: totals.fgts },
    { label: "Subsídio", value: totals.sub },
    { label: "Permuta", value: totals.permRec },
    { label: "Financiamento", value: totals.banco },
  ].filter((f) => f.value > 0);

  const now = new Date();
  const todayOrd = now.getFullYear() * 12 + now.getMonth();

  // Próximos vencimentos = recebíveis das unidades (entrada) + contas a pagar
  // reais do projeto (saída). Quando há período selecionado, mostra todos os
  // vencimentos do intervalo; sem período, mostra os próximos (a partir de ~3
  // meses atrás). Datas sempre no padrão brasileiro DD/MM/AAAA.
  const pagarVenc: Venc[] = contasPagarProj.map((c) => {
    const d = parseDate(c.vencimento as string);
    const ord = d ? d.yr * 12 + (d.mo - 1) : todayOrd;
    return {
      ord,
      dateLabel: dateBR(c.vencimento),
      unitCode: c.fornecedorNome ?? c.numDoc ?? "Conta a pagar",
      label: c.descricao ?? c.numDoc ?? "Conta a pagar",
      value: c.valor,
      overdue: ord < todayOrd,
      tipo: "pagar",
    };
  });
  // Recebíveis reais (entrada) — independentes da versão, refletindo as vendas.
  const receberVenc: Venc[] = realReceb.map((r) => {
    const d = parseDate(r.dia);
    const ord = d ? d.yr * 12 + (d.mo - 1) : todayOrd;
    return {
      ord,
      dateLabel: dateBR(r.dia),
      unitCode: r.unitCode,
      label: r.descricao,
      value: r.valor,
      overdue: ord < todayOrd,
      tipo: "receber",
    };
  });
  const vencimentos = [...receberVenc, ...pagarVenc]
    .filter((v) => (hasRangeDash ? true : v.ord >= todayOrd - 3))
    .sort((a, b) => a.ord - b.ord)
    .slice(0, hasRangeDash ? 60 : 10);

  const kpis = [
    { icon: "🏢", label: "VGV total", get: (s: Summary) => brlk(s.vgv) },
    { icon: "↗", label: "Realizado acum.", get: (s: Summary) => brlk(s.realizado) },
    { icon: "⏱", label: "A receber", get: (s: Summary) => brlk(s.aReceber) },
    {
      icon: "⬇",
      label: "A pagar",
      // Contas a pagar são exclusivas da versão Atual (caixa real).
      get: (s: Summary) => (s.version.kind === "atual" ? brlk(s.aPagar) : "—"),
    },
  ];

  return (
    <>
      <PageHeader
        eyebrow={`${ctx.project.name} · ${ctx.tenant.name}`}
        title="Dashboard"
        subtitle="Visão geral do projeto — independente da versão ativa"
        actions={
          <div className="flex flex-wrap items-end gap-3">
            <DateRangeFilter de={de} ate={ate} />
            <VersionMultiSelect
              versions={ctx.versions.map((v) => ({ id: v.id, label: v.label, color: v.color }))}
              selected={selected.map((v) => v.id)}
            />
          </div>
        }
      />

      {/* KPIs por versão */}
      <section className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {kpis.map((k) => (
          <Card key={k.label}>
            <CardContent className="p-5">
              <p className="flex items-center gap-2 font-[family-name:var(--font-mono)] text-[10px] uppercase tracking-wide text-[var(--color-ink3)]">
                <span aria-hidden>{k.icon}</span> {k.label}
              </p>
              <div className="mt-3 flex flex-wrap gap-x-6 gap-y-2">
                {summaries.map((s) => (
                  <div key={s.version.id}>
                    <div
                      className="font-[family-name:var(--font-mono)] text-[10px]"
                      style={{ color: s.version.color }}
                    >
                      {s.version.label}
                    </div>
                    <div
                      className="text-lg font-semibold"
                      style={{ color: s.version.color }}
                    >
                      {k.get(s)}
                    </div>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        ))}
      </section>

      {/* Comparativo mensal por versão */}
      <Card className="mt-6">
        <CardContent className="p-5">
          <div className="mb-3 flex items-center justify-between">
            <h2 className="text-sm font-semibold text-[var(--color-ink)]">
              Comparativo de versões — {year}
            </h2>
            <Link href="/rolling" className={buttonVariants({ variant: "outline", size: "sm" })}>
              ⟳ Rolling
            </Link>
          </div>
          <BarChart
            height={320}
            currency
            data={{
              labels: MESES,
              datasets: summaries.map((s) => ({
                label: s.version.label,
                data: Array.from(
                  { length: 12 },
                  (_, i) => s.monthly[`${String(i + 1).padStart(2, "0")}/${year}`] || 0,
                ),
                backgroundColor: s.version.color,
                borderRadius: 4,
              })),
            }}
          />
        </CardContent>
      </Card>

      {/* Fontes de receita + próximos vencimentos */}
      <section className="mt-6 grid gap-4 lg:grid-cols-2">
        <Card>
          <CardContent className="p-5">
            <h2 className="mb-3 text-sm font-semibold text-[var(--color-ink)]">
              Fontes de receita
              <span className="ml-2 font-normal text-[var(--color-ink3)]">
                · {primary.label}
              </span>
            </h2>
            {fontes.length ? (
              <DoughnutChart
                data={{
                  labels: fontes.map((f) => f.label),
                  datasets: [
                    {
                      data: fontes.map((f) => f.value),
                      backgroundColor: Object.values(CHART_COLORS),
                      borderWidth: 0,
                    },
                  ],
                }}
              />
            ) : (
              <p className="py-10 text-center text-sm text-[var(--color-ink4)]">
                Sem receita contratada nesta versão.
              </p>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardContent className="p-5">
            <div className="mb-3 flex items-center justify-between">
              <h2 className="text-sm font-semibold text-[var(--color-ink)]">
                Próximos vencimentos
              </h2>
              <Link href="/caixa" className={buttonVariants({ variant: "outline", size: "sm" })}>
                ver caixa
              </Link>
            </div>
            {vencimentos.length ? (
              <ul className="divide-y divide-[var(--color-accent2)]/8">
                {vencimentos.map((v, i) => (
                  <li key={i} className="flex items-center gap-3 py-2.5">
                    <span className="w-24 font-[family-name:var(--font-mono)] text-[12px] text-[var(--color-ink3)]">
                      {v.dateLabel}
                    </span>
                    <span className="flex-1 text-[13px] text-[var(--color-ink2)]">
                      {v.unitCode} — {v.label}
                    </span>
                    <Badge tone={v.tipo === "pagar" ? "warning" : "success"}>
                      {v.tipo === "pagar" ? "a pagar" : "a receber"}
                    </Badge>
                    <span
                      className={`font-[family-name:var(--font-mono)] text-[13px] font-semibold ${
                        v.tipo === "pagar"
                          ? "text-[var(--color-danger)]"
                          : "text-[var(--color-success)]"
                      }`}
                    >
                      {v.tipo === "pagar" ? "−" : "+"}{brl0(v.value)}
                    </span>
                    {v.overdue && <Badge tone="danger">Atraso</Badge>}
                  </li>
                ))}
              </ul>
            ) : (
              <p className="py-10 text-center text-sm text-[var(--color-ink4)]">
                Sem vencimentos próximos nesta versão.
              </p>
            )}
          </CardContent>
        </Card>
      </section>
    </>
  );
}
