import { Fragment } from "react";
import { getActiveContext } from "@/lib/context";
import { saldoDisponivel } from "@/lib/contas-saldo";
import { flowMaps, flowMapsRealizado } from "@/lib/fluxo-caixa";
import {
  getBankAccounts,
  getVersionsDoProjeto,
  getInccRows,
  sortMonthKey,
} from "@/lib/queries";
import { brl0, brlk, monthInRange } from "@/lib/utils";
import { calendarYearWindows } from "@/lib/planning";
import { PageHeader } from "@/components/app/page-header";
import { Card, CardContent } from "@/components/ui/card";
import { Table, THead, TH, TR, TD } from "@/components/ui/table";
import { ProjecaoYearSelect } from "@/components/app/projecao-controls";
import { DateRangeFilter } from "@/components/app/date-range-filter";
import { VersionMultiSelect } from "@/components/app/version-multiselect";
import { ProjectPicker } from "@/components/app/project-picker";
import { resolveCompareVersions } from "@/lib/report-versions";

export const dynamic = "force-dynamic";

export default async function FluxoCaixaPage({
  searchParams,
}: {
  searchParams: Promise<{ ano?: string; de?: string; ate?: string; vs?: string; proj?: string }>;
}) {
  const ctx = await getActiveContext();
  if (!ctx) return null;

  const sp = await searchParams;
  const de = sp.de ?? "";
  const ate = sp.ate ?? "";
  const hasRange = !!(de || ate);

  // Projeto vem do seletor (?proj=), não do "projeto ativo" da sessão. Sem isto
  // a tela mostrava apenas o projeto ativo, e os recebíveis das demais obras
  // simplesmente não apareciam. "all" consolida todos os projetos da empresa.
  const isAll = sp.proj === "all";
  const project =
    ctx.projects.find((p) => p.id === sp.proj) ?? ctx.project ?? ctx.projects[0];

  // Versões DO PROJETO selecionado (ctx.versions são as do projeto ativo).
  const versoesProj = await getVersionsDoProjeto(ctx.tenant.id, project.id);
  const versoes = versoesProj.length > 0 ? versoesProj : ctx.versions;

  // Por padrão, o Fluxo abre na versão ATUAL (dados reais); o usuário pode
  // selecionar/comparar outras versões pelo seletor.
  const atualVersion = versoes.find((v) => v.kind === "atual") ?? versoes[0] ?? ctx.version;
  const compareVersions = resolveCompareVersions(sp.vs, versoes, atualVersion);
  const projectSelect = (
    <ProjectPicker
      projects={ctx.projects.map((p) => ({ id: p.id, label: p.name }))}
      selected={isAll ? "all" : project.id}
      allOption
    />
  );
  const versionSelect = isAll ? null : (
    <VersionMultiSelect
      versions={versoes.map((v) => ({ id: v.id, label: v.label, color: v.color }))}
      selected={compareVersions.map((v) => v.id)}
    />
  );

  /**
   * Fluxo consolidado da empresa: soma os mapas de entradas/saídas da versão
   * ATUAL de cada projeto. Sem isto, "Todos os projetos" mostraria apenas a obra
   * ativa.
   */
  async function flowMapsConsolidado() {
    const porProjeto = await Promise.all(
      ctx!.projects.map(async (p) => {
        const vs = await getVersionsDoProjeto(ctx!.tenant.id, p.id);
        const atual = vs.find((v) => v.kind === "atual") ?? vs[0];
        if (!atual) return { entradas: {}, saidas: {} };
        return flowMaps(atual, p.id);
      }),
    );
    const entradas: Record<string, number> = {};
    const saidas: Record<string, number> = {};
    for (const m of porProjeto) {
      for (const [mm, v] of Object.entries(m.entradas)) entradas[mm] = (entradas[mm] || 0) + v;
      for (const [mm, v] of Object.entries(m.saidas)) saidas[mm] = (saidas[mm] || 0) + v;
    }
    return { entradas, saidas };
  }

  /** Realizado somado de todas as obras, para a visão consolidada. */
  async function flowMapsRealizadoConsolidado() {
    const entradas: Record<string, number> = {};
    const saidas: Record<string, number> = {};
    const porProjeto = await Promise.all(
      ctx!.projects.map(async (p) => {
        const vs = await getVersionsDoProjeto(ctx!.tenant.id, p.id);
        const atual = vs.find((v) => v.kind === "atual") ?? vs[0];
        if (!atual) return { entradas: {}, saidas: {} };
        return flowMapsRealizado(atual.id);
      }),
    );
    for (const m of porProjeto) {
      for (const [mm, v] of Object.entries(m.entradas)) entradas[mm] = (entradas[mm] || 0) + v;
      for (const [mm, v] of Object.entries(m.saidas)) saidas[mm] = (saidas[mm] || 0) + v;
    }
    return { entradas, saidas };
  }

  // ── Fluxo mensal, com UMA COLUNA POR VERSÃO ──────────────────────────────
  // A comparação acontece dentro da própria tabela de fechamentos mensais: o
  // usuário nunca troca de tela para comparar versões.
  const versoesTabela = isAll ? [atualVersion] : compareVersions;
  const [fluxos, incc, contas, realizado] = await Promise.all([
    isAll
      ? flowMapsConsolidado().then((m) => [m])
      : Promise.all(compareVersions.map((v) => flowMaps(v, project.id))),
    getInccRows(project.id),
    getBankAccounts(ctx.tenant.id),
    // RG-01 — o fluxo acima é PREVISTO (montado pelo vencimento). Este é o
    // REALIZADO, montado pela data de liquidação: o dinheiro que de fato passou
    // pela conta. São visões distintas da mesma realidade e aparecem lado a
    // lado; nenhum número do previsto muda por causa disto.
    isAll ? flowMapsRealizadoConsolidado() : flowMapsRealizado(compareVersions[0].id),
  ]);
  // A primeira versão selecionada é a de referência (entradas/saídas/saldo
  // acumulado dos cartões do topo).
  const { entradas, saidas } = fluxos[0];

  // Saldo inicial = soma dos saldos das contas correntes.
  // Saldo inicial = só contas da empresa (contas "Terceiros" são obrigações).
  const saldoInicial = saldoDisponivel(contas);

  // Eixo = INCC + meses com movimentação (âncora nos dados reais).
  const axis = [
    ...new Set([
      ...incc.map((r) => r.m),
      ...fluxos.flatMap((f) => [...Object.keys(f.entradas), ...Object.keys(f.saidas)]),
    ]),
  ].sort(sortMonthKey);
  // Recortes por ano-calendário (2025, 2026, … até o ano atual + 5).
  const years = calendarYearWindows(axis, new Date().getFullYear()).map((y) => ({
    value: Number(y.value),
    label: y.label,
    months: y.months,
  }));
  const curYear = new Date().getFullYear();
  // Ano padrão: o ano atual SÓ se ele tiver movimentação. O seletor mostra um
  // ano por vez, e o horizonte vai até o ano atual + 5 — então abrir sempre no
  // ano corrente fazia parecer que os recebíveis "não apareciam", quando na
  // verdade estavam nos anos seguintes. Sem movimento no ano atual, abre no
  // primeiro ano que tem.
  const anosComMovimento = [
    ...new Set(
      [...Object.keys(entradas), ...Object.keys(saidas)]
        .filter((m) => (entradas[m] ?? 0) !== 0 || (saidas[m] ?? 0) !== 0)
        .map((m) => Number(m.split("/")[1]))
        .filter((y) => Number.isFinite(y)),
    ),
  ].sort((a, b) => a - b);
  const anoPadrao = anosComMovimento.includes(curYear)
    ? curYear
    : anosComMovimento[0] ?? curYear;
  const selectedYear = years.some((y) => y.value === Number(sp.ano))
    ? Number(sp.ano)
    : anoPadrao;
  // Com período informado, o intervalo de datas tem prioridade sobre o ano.
  const yearMonths = hasRange
    ? axis.filter((mm) => monthInRange(mm, de, ate))
    : years.find((y) => y.value === selectedYear)?.months ?? [];

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
  // Totais de TODO o horizonte (não só do ano selecionado) — assim o usuário vê
  // de imediato que o restante do dinheiro está em outros anos, e em quais.
  const horizonteE = Object.values(entradas).reduce((a, v) => a + v, 0);
  const horizonteS = Object.values(saidas).reduce((a, v) => a + v, 0);
  const totE = linhas.reduce((a, l) => a + l.e, 0);
  const totS = linhas.reduce((a, l) => a + l.s, 0);
  const saldoAcumFinal = linhas.length ? linhas[linhas.length - 1].saldo : saldoInicial;

  return (
    <>
      <PageHeader
        title="Fluxo de Caixa Mensal"
        subtitle={
          versoesTabela.length > 1
            ? "Comparando versões mês a mês · por data de vencimento/pagamento"
            : "Por data de vencimento/pagamento · saldo acumulado"
        }
        actions={
          <div className="flex flex-wrap items-end gap-3">
            {projectSelect}
            <DateRangeFilter de={de} ate={ate} />
            {!hasRange && years.length > 1 && (
              <ProjecaoYearSelect years={years} selected={selectedYear} basePath="/fluxocaixa" />
            )}
            {versionSelect}
          </div>
        }
      />

      {versoesTabela.length > 1 ? (
        // Comparando versões: um cartão de saldo por versão, com a diferença
        // em relação à primeira (referência) — sem trocar de tela.
        <div className="mb-6 grid grid-cols-1 gap-4 sm:grid-cols-3">
          {fluxos.map((f, i) => {
            const te = yearMonths.reduce((a, m) => a + (f.entradas[m] || 0), 0);
            const ts = yearMonths.reduce((a, m) => a + (f.saidas[m] || 0), 0);
            const saldo = te - ts;
            const ref =
              yearMonths.reduce((a, m) => a + (fluxos[0].entradas[m] || 0), 0) -
              yearMonths.reduce((a, m) => a + (fluxos[0].saidas[m] || 0), 0);
            const dif = saldo - ref;
            return (
              <Card key={versoesTabela[i]?.id ?? i}>
                <CardContent className="p-5">
                  <p className="flex items-center gap-1.5 font-[family-name:var(--font-mono)] text-[10px] uppercase tracking-wide text-[var(--color-ink3)]">
                    <span
                      className="inline-block h-2 w-2 rounded-full"
                      style={{ backgroundColor: versoesTabela[i]?.color }}
                    />
                    {versoesTabela[i]?.label}
                  </p>
                  <p className="mt-1 font-[family-name:var(--font-mono)] text-[22px] font-semibold text-[var(--color-accent)]">
                    {brlk(saldo)}
                  </p>
                  <p className="mt-0.5 text-[11px] text-[var(--color-ink4)]">
                    {brlk(te)} entradas · {brlk(ts)} saídas
                    {i > 0 && (
                      <span
                        className={
                          dif >= 0
                            ? " text-[var(--color-success)]"
                            : " text-[var(--color-danger)]"
                        }
                      >
                        {" "}· {dif >= 0 ? "+" : "−"}
                        {brlk(Math.abs(dif))} vs {versoesTabela[0]?.label}
                      </span>
                    )}
                  </p>
                </CardContent>
              </Card>
            );
          })}
        </div>
      ) : (
        <div className="mb-6 grid grid-cols-1 gap-4 sm:grid-cols-3">
          <Kpi
            icon="↓"
            label="Total entradas"
            value={brlk(totE)}
            tone="success"
            hint={
              horizonteE !== totE
                ? `${brlk(horizonteE)} em todo o horizonte`
                : undefined
            }
          />
          <Kpi
            icon="↑"
            label="Total saídas"
            value={brlk(totS)}
            tone="danger"
            hint={
              horizonteS !== totS
                ? `${brlk(horizonteS)} em todo o horizonte`
                : undefined
            }
          />
          <Kpi
            icon="⚖"
            label="Saldo do período"
            value={brlk(totE - totS)}
            tone="accent"
            hint={
              anosComMovimento.length > 1
                ? `movimento em ${anosComMovimento.join(", ")}`
                : undefined
            }
          />
        </div>
      )}

      <Card>
        <CardContent className="p-0">
          <Table>
            <THead>
              {versoesTabela.length > 1 && (
                <tr>
                  <TH />
                  {versoesTabela.map((v) => (
                    <TH key={v.id} colSpan={3} className="text-center">
                      <span className="inline-flex items-center gap-1.5">
                        <span
                          className="inline-block h-2 w-2 rounded-full"
                          style={{ backgroundColor: v.color }}
                        />
                        {v.label}
                      </span>
                    </TH>
                  ))}
                  <TH />
                </tr>
              )}
              <tr>
                <TH>Mês</TH>
                {versoesTabela.map((v) => (
                  <Fragment key={v.id}>
                    <TH className="text-right">Entradas</TH>
                    <TH className="text-right">Saídas</TH>
                    <TH className="text-right">Saldo do mês</TH>
                  </Fragment>
                ))}
                {/* RG-01 — realizado por data de liquidação, ao lado do
                    previsto por vencimento. */}
                <TH className="text-right">Realizado ↑</TH>
                <TH className="text-right">Realizado ↓</TH>
                <TH className="text-right">Saldo acumulado</TH>
              </tr>
            </THead>
            <tbody>
              {linhas.map((l) => (
                <TR key={l.mm}>
                  <TD className="font-[family-name:var(--font-mono)] font-medium text-[var(--color-ink)]">
                    {l.mm}
                  </TD>
                  {fluxos.map((f, i) => {
                    const e = f.entradas[l.mm] || 0;
                    const sa = f.saidas[l.mm] || 0;
                    return (
                      <Fragment key={versoesTabela[i]?.id ?? i}>
                        <TD className="text-right font-[family-name:var(--font-mono)] text-[var(--color-success)]">
                          {e > 0 ? brl0(e) : "—"}
                        </TD>
                        <TD className="text-right font-[family-name:var(--font-mono)] text-[var(--color-danger)]">
                          {sa > 0 ? brl0(sa) : "—"}
                        </TD>
                        <TD className="text-right font-[family-name:var(--font-mono)] font-medium text-[var(--color-success)]">
                          {brl0(e - sa)}
                        </TD>
                      </Fragment>
                    );
                  })}
                  <TD
                    className="text-right font-[family-name:var(--font-mono)] text-[var(--color-success)]"
                    title="Entradas efetivamente liquidadas neste mês (extrato/caixa)"
                  >
                    {(realizado.entradas[l.mm] || 0) > 0 ? brl0(realizado.entradas[l.mm]) : "—"}
                  </TD>
                  <TD
                    className="text-right font-[family-name:var(--font-mono)] text-[var(--color-danger)]"
                    title="Saídas efetivamente liquidadas neste mês (extrato/caixa)"
                  >
                    {(realizado.saidas[l.mm] || 0) > 0 ? brl0(realizado.saidas[l.mm]) : "—"}
                  </TD>
                  <TD className="text-right font-[family-name:var(--font-mono)] font-semibold text-[var(--color-accent)]">
                    {brl0(l.saldo)}
                  </TD>
                </TR>
              ))}
              {linhas.length === 0 ? (
                <TR>
                  <TD
                    colSpan={2 + versoesTabela.length * 3}
                    className="py-8 text-center text-[var(--color-ink4)]"
                  >
                    Sem movimentação neste período.
                  </TD>
                </TR>
              ) : (
                <TR className="bg-[var(--color-surface2)]">
                  <TD className="font-semibold text-[var(--color-ink)]">TOTAL</TD>
                  {fluxos.map((f, i) => {
                    const te = yearMonths.reduce((a, m) => a + (f.entradas[m] || 0), 0);
                    const ts = yearMonths.reduce((a, m) => a + (f.saidas[m] || 0), 0);
                    return (
                      <Fragment key={versoesTabela[i]?.id ?? i}>
                        <TD className="text-right font-[family-name:var(--font-mono)] font-semibold text-[var(--color-success)]">
                          {brl0(te)}
                        </TD>
                        <TD className="text-right font-[family-name:var(--font-mono)] font-semibold text-[var(--color-danger)]">
                          {brl0(ts)}
                        </TD>
                        <TD className="text-right font-[family-name:var(--font-mono)] font-semibold text-[var(--color-success)]">
                          {brl0(te - ts)}
                        </TD>
                      </Fragment>
                    );
                  })}
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
  hint,
}: {
  icon: string;
  label: string;
  value: string;
  tone: "success" | "danger" | "accent";
  /** Contexto abaixo do número (ex.: total de todo o horizonte). */
  hint?: string;
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
        {hint && (
          <p className="mt-0.5 text-[11px] text-[var(--color-ink4)]">{hint}</p>
        )}
      </CardContent>
    </Card>
  );
}
