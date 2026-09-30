import { eq } from "drizzle-orm";
import { db, schema } from "@/lib/db";
import { getTenantContext, type Version } from "@/lib/context";
import { somarResumos, type Summary } from "@/lib/dashboard-resumo";
import {
  TODOS_OS_PROJETOS,
  lerEscopoDeRelatorio,
  projetosDoEscopo,
  rotuloDoEscopo,
} from "@/lib/projeto-selecao";
import { LembrarProjeto, RecuperarProjeto } from "@/components/app/projeto-da-aba";
import {
  getMonthlyRevenue,
  getUnits,
  getIndicadoresObra,
  getIndicadoresObraConsolidado,
  getStatusProjeto,
  getVersionsDoProjeto,
  getContasPagar,
  getReceivables,
} from "@/lib/queries";
import { parseDate } from "@/lib/calc";
import { brlk, monthInRange, dateInRange } from "@/lib/utils";
import { PageHeader } from "@/components/app/page-header";
import { ProjectPicker } from "@/components/app/project-picker";
import { Card, CardContent } from "@/components/ui/card";
import { IndicadoresObraPanel, StatusProjetoPanel } from "@/components/app/indicadores-obra";
import { VersionMultiSelect } from "@/components/app/version-multiselect";
import { DateRangeFilter } from "@/components/app/date-range-filter";
import { can } from "@/lib/permissions";
import { AccessDenied } from "@/components/app/access-denied";

export const dynamic = "force-dynamic";


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

const TIPOS_CONSOLIDADOS = ["budget", "forecast", "atual"] as const;

export default async function DashboardPage({
  searchParams,
}: {
  searchParams: Promise<{ vs?: string; de?: string; ate?: string; proj?: string; project?: string }>;
}) {
  const ctx = await getTenantContext();
  if (!ctx) return null;
  // A página verifica "ver" antes de consultar qualquer dado (Prompt M, 2.2).
  // A guarda do layout não basta: ele renderiza em paralelo com a página e
  // não roda de novo na navegação dentro do app.
  if (!can(ctx.perms, "dashboard", "ver")) return <AccessDenied />;

  const sp = await searchParams;
  const de = sp.de ?? "";
  const ate = sp.ate ?? "";
  // Obra ou escopo vêm da URL (Prompt A, 18). Sem nada: a obra lembrada pela
  // aba; sem memória, "Todos" (B12). Nunca a obra do cookie — que antes
  // fornecia os 4 KPIs do topo no modo "Todos" (Prompt AA, 2.2).
  const escopo = lerEscopoDeRelatorio(ctx.projects, sp);
  if (escopo.tipo === "nenhum") {
    return (
      <RecuperarProjeto
        idsPermitidos={ctx.projects.map((p) => p.id)}
        semMemoria={TODOS_OS_PROJETOS}
      />
    );
  }
  const isAll = escopo.tipo !== "projeto";
  const project = escopo.tipo === "projeto" ? escopo.projeto : null;
  const doEscopo = escopo.tipo === "projeto" ? null : projetosDoEscopo(ctx.projects, escopo.tipo);
  const projetosDaTela = project ? [project] : doEscopo!.projetos;
  const idsDaTela = new Set(projetosDaTela.map((p) => p.id));

  // Uma obra: as versões DELA, selecionáveis. Escopo: uma coluna por TIPO de
  // versão, somando as obras do escopo (decisão de 30/09).
  const versoes = project ? await getVersionsDoProjeto(ctx.tenant.id, project.id) : [];
  const wanted = (sp.vs ?? "").split(",").filter(Boolean);
  const validWanted = versoes.filter((v) => wanted.includes(v.id)).slice(0, 3);
  const selected = validWanted.length > 0 ? validWanted : versoes.slice(0, 3);

  let summaries: Summary[];
  if (project) {
    summaries = await Promise.all(selected.map((v) => versionSummary(project.id, v, de, ate)));
  } else {
    const versoesPorObra = await Promise.all(
      projetosDaTela.map(async (p) => ({ p, vs: await getVersionsDoProjeto(ctx.tenant.id, p.id) })),
    );
    const colunas = await Promise.all(
      TIPOS_CONSOLIDADOS.map(async (kind) => {
        const resumos = await Promise.all(
          versoesPorObra.flatMap(({ p, vs }) => {
            // A mais antiga do tipo, como nas demais telas.
            const v = vs.find((x) => x.kind === kind);
            return v ? [versionSummary(p.id, v, de, ate)] : [];
          }),
        );
        return somarResumos(kind, resumos);
      }),
    );
    summaries = colunas.filter((c): c is Summary => c !== null);
  }

  const indicadores = isAll
    ? await getIndicadoresObraConsolidado(
        ctx.tenant.id,
        projetosDaTela.map((p) => p.id),
      )
    : await getIndicadoresObra(ctx.tenant.id, project!.id);
  const statusProjeto = await getStatusProjeto(
    ctx.tenant.id,
    projetosDaTela.map((p) => p.id),
  );

  // ── Versão "Atual — caixa real": dados reais ────────────────────────────
  // Budget/Forecast permanecem estritamente em suas seções. A versão Atual
  // reflete o caixa real do período: (a) fechamentos já realizados (entradas
  // conciliadas), (b) recebíveis das unidades vendidas ainda não recebidos
  // (entradas projetadas) e (c) despesas lançadas ainda não pagas (saídas
  // projetadas / contas a pagar).
  const hasRangeDash = !!(de || ate);
  const realReceb = (await getReceivables(ctx.tenant.id)).filter(
    (r) =>
      idsDaTela.has(r.projectId) &&
      (!hasRangeDash || dateInRange(r.dia, de, ate)),
  );
  const totalReceb = realReceb.reduce((a, r) => a + r.valor, 0);

  // Contas a pagar (despesas não pagas) do projeto, com vencimento no período.
  const contasPagarProj = (await getContasPagar(ctx.tenant.id)).filter(
    (c) =>
      idsDaTela.has(c.projectId) &&
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
        eyebrow={
          project
            ? `${project.name} · ${ctx.tenant.name}`
            : `${rotuloDoEscopo(escopo.tipo as "todos" | "ativos" | "finalizados")} · ${ctx.tenant.name}`
        }
        title="Dashboard"
        subtitle={
          project
            ? "Visão geral do projeto — independente da versão ativa"
            : `Visão geral consolidada — ${projetosDaTela.length} projeto(s) somado(s), por tipo de versão`
        }
        actions={
          <div className="flex flex-wrap items-end gap-3">
            <ProjectPicker
              projects={ctx.projects.map((p) => ({ id: p.id, label: p.name }))}
              selected={
                project ? project.id : escopo.tipo === "todos" ? TODOS_OS_PROJETOS : escopo.tipo
              }
              allOption
              scopeOptions
            />
            <DateRangeFilter de={de} ate={ate} />
            {project && (
              <VersionMultiSelect
                versions={versoes.map((v) => ({ id: v.id, label: v.label, color: v.color }))}
                selected={selected.map((v) => v.id)}
              />
            )}
          </div>
        }
      />
      {project && <LembrarProjeto projectId={project.id} />}
      {doEscopo && doEscopo.semSituacao > 0 && (
        <p className="mb-4 rounded-[8px] bg-[var(--color-surface3)] px-3 py-2 text-[13px] text-[var(--color-ink2)]">
          {doEscopo.semSituacao} obra(s) sem status ficaram fora deste filtro. Classifique-as
          como Ativo ou Finalizado em Projetos.
        </p>
      )}
      {doEscopo && projetosDaTela.length === 0 ? (
        <Card>
          <CardContent className="p-8 text-center text-[var(--color-ink3)]">
            Nenhuma obra classificada como{" "}
            {escopo.tipo === "ativos" ? "Ativo" : "Finalizado"}. Classifique as obras em
            Projetos.
          </CardContent>
        </Card>
      ) : (
      <>

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

      {/* Indicadores físico-financeiros da obra (BDI, evolução, liberação). */}
      <StatusProjetoPanel st={statusProjeto} />
      <IndicadoresObraPanel ind={indicadores} />
      </>
      )}
    </>
  );
}
