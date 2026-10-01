import { Fragment } from "react";
import { getTenantContext } from "@/lib/context";
import { avisoNoSeletor } from "@/lib/situacao-versao";
import { chaveLigada } from "@/lib/chaves-tenant";
import {
  TODOS_OS_PROJETOS,
  lerEscopoDeRelatorio,
  projetosDoEscopo,
  rotuloDoEscopo,
} from "@/lib/projeto-selecao";
import { LembrarProjeto, RecuperarProjeto } from "@/components/app/projeto-da-aba";
import { saldoDisponivel } from "@/lib/contas-saldo";
import { flowMaps, flowMapsRealizado } from "@/lib/fluxo-caixa";
import { TEXTO_ESTADO, eixoDoFluxo, linhasDoFluxo, mesCorrente, partidaDaObra, totalDoDesvio } from "@/lib/fluxo-tela";
import {
  getBankAccounts,
  getVersionsDoProjeto,
  getInccRows,
  sortMonthKey,
} from "@/lib/queries";
import { brl0, brlk, monthInRange, pct1 } from "@/lib/utils";
import { calendarYearWindows } from "@/lib/planning";
import { PageHeader } from "@/components/app/page-header";
import { Card, CardContent } from "@/components/ui/card";
import { Table, THead, TH, TR, TD } from "@/components/ui/table";
import { ProjecaoYearSelect } from "@/components/app/projecao-controls";
import { DateRangeFilter } from "@/components/app/date-range-filter";
import { VersionMultiSelect } from "@/components/app/version-multiselect";
import { ProjectPicker } from "@/components/app/project-picker";
import { resolveCompareVersions } from "@/lib/report-versions";
import { can } from "@/lib/permissions";
import { AccessDenied } from "@/components/app/access-denied";

export const dynamic = "force-dynamic";

export default async function FluxoCaixaPage({
  searchParams,
}: {
  searchParams: Promise<{
    ano?: string;
    de?: string;
    ate?: string;
    vs?: string;
    proj?: string;
    project?: string;
  }>;
}) {
  const ctx = await getTenantContext();
  if (!ctx) return null;
  // A página verifica "ver" antes de consultar qualquer dado (Prompt M, 2.2).
  // A guarda do layout não basta: ele renderiza em paralelo com a página e
  // não roda de novo na navegação dentro do app.
  if (!can(ctx.perms, "fluxocaixa", "ver")) return <AccessDenied />;
  // Prompt H (BH-3): selo no seletor quando a regra está ligada na empresa.
  const rascunhoFora = await chaveLigada(ctx.tenant.id, "rascunho_fora_dos_relatorios");
  // Prompt AD, 8.1 — a definição nova do Fluxo (nasce desligada).
  const fluxoNovo = await chaveLigada(ctx.tenant.id, "fluxo_definicao_nova");

  const sp = await searchParams;
  const de = sp.de ?? "";
  const ate = sp.ate ?? "";
  const hasRange = !!(de || ate);

  // Obra ou escopo vêm da URL (Prompt A, 19). Sem nada: a obra lembrada pela
  // aba; sem memória, "Todos" (B12). Nunca a obra do cookie — que antes
  // também decidia o eixo de meses e as versões do modo "Todos".
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
  const projetosConsolidados = doEscopo?.projetos ?? [];

  // Versões DA OBRA escolhida (vazio no modo consolidado).
  const versoes = project ? await getVersionsDoProjeto(ctx.tenant.id, project.id) : [];

  // Por padrão, o Fluxo abre na versão ATUAL (dados reais); o usuário pode
  // selecionar/comparar outras versões pelo seletor.
  // Prompt AD, 1.3: com a chave, a Atual nunca é substituída — sem ela não há
  // realizado nem acumulado. A versão de referência das colunas de previsto
  // continua podendo ser outra.
  const atualReal = versoes.find((v) => v.kind === "atual") ?? null;
  const atualVersion = atualReal ?? versoes[0] ?? null;
  const semAtual = fluxoNovo && !!project && !atualReal;
  const compareVersions = atualVersion ? resolveCompareVersions(sp.vs, versoes, atualVersion) : [];
  const projectSelect = (
    <ProjectPicker
      projects={ctx.projects.map((p) => ({ id: p.id, label: p.name }))}
      selected={
        project ? project.id : escopo.tipo === "todos" ? TODOS_OS_PROJETOS : escopo.tipo
      }
      allOption
      scopeOptions
    />
  );
  // Escopo sem nenhuma obra (ex.: nenhuma classificada como Finalizado):
  // estado vazio, nunca um fluxo zerado.
  if (doEscopo && projetosConsolidados.length === 0) {
    return (
      <>
        <PageHeader
          title="Fluxo de Caixa Mensal"
          actions={<div className="flex flex-wrap items-end gap-3">{projectSelect}</div>}
        />
        <Card>
          <CardContent className="p-8 text-center text-[var(--color-ink3)]">
            Nenhuma obra classificada como {escopo.tipo === "ativos" ? "Ativo" : "Finalizado"}.
            Classifique as obras em Projetos.
          </CardContent>
        </Card>
      </>
    );
  }
  // Obra sem nenhuma versão: nada a somar — e nada é lido de outra obra
  // (antes caía nas versões da obra do cookie).
  if (project && !atualVersion) {
    return (
      <>
        <PageHeader
          title="Fluxo de Caixa Mensal"
          actions={<div className="flex flex-wrap items-end gap-3">{projectSelect}</div>}
        />
        <LembrarProjeto projectId={project.id} />
        <Card>
          <CardContent className="p-8 text-center text-[var(--color-ink3)]">
            {project.name} não possui versões.
          </CardContent>
        </Card>
      </>
    );
  }
  const versionSelect = isAll ? null : (
    <VersionMultiSelect
      versions={versoes.map((v) => ({ id: v.id, label: v.label, color: v.color, aviso: avisoNoSeletor(v, rascunhoFora) }))}
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
      projetosConsolidados.map(async (p) => {
        const vs = await getVersionsDoProjeto(ctx!.tenant.id, p.id);
        const atual = vs.find((v) => v.kind === "atual") ?? (fluxoNovo ? undefined : vs[0]);
        if (!atual) return { entradas: {}, saidas: {} };
        return flowMaps(atual, p.id, { definicaoNova: fluxoNovo });
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
    const semData = { qtd: 0, valor: 0 };
    const porProjeto = await Promise.all(
      projetosConsolidados.map(async (p) => {
        const vs = await getVersionsDoProjeto(ctx!.tenant.id, p.id);
        const atual = vs.find((v) => v.kind === "atual") ?? (fluxoNovo ? undefined : vs[0]);
        if (!atual) return { entradas: {}, saidas: {}, semData: { qtd: 0, valor: 0 } };
        return flowMapsRealizado(atual.id);
      }),
    );
    for (const m of porProjeto) {
      for (const [mm, v] of Object.entries(m.entradas)) entradas[mm] = (entradas[mm] || 0) + v;
      for (const [mm, v] of Object.entries(m.saidas)) saidas[mm] = (saidas[mm] || 0) + v;
      semData.qtd += m.semData.qtd;
      semData.valor += m.semData.valor;
    }
    return { entradas, saidas, semData };
  }

  // ── Fluxo mensal, com UMA COLUNA POR VERSÃO ──────────────────────────────
  // A comparação acontece dentro da própria tabela de fechamentos mensais: o
  // usuário nunca troca de tela para comparar versões.
  // Consolidado: uma coluna "Atual" (a de cada obra, somadas), como antes.
  const versoesTabela: { id: string; label: string; color: string }[] = isAll
    ? [{ id: "consolidado", label: "Atual", color: "#16a34a" }]
    : compareVersions;
  const [fluxos, incc, contas, realizado] = await Promise.all([
    isAll
      ? flowMapsConsolidado().then((m) => [m])
      : Promise.all(compareVersions.map((v) => flowMaps(v, project!.id, { definicaoNova: fluxoNovo }))),
    // Eixo de meses: INCC da obra; no consolidado, a união das obras do escopo
    // (antes: a da obra do cookie). Só acrescenta meses sem movimento — nenhum
    // total muda, porque o saldo corre sobre todos os meses com movimento.
    project
      ? getInccRows(ctx.tenant.id, project.id)
      : Promise.all(projetosConsolidados.map((p) => getInccRows(ctx.tenant.id, p.id))).then((r) => r.flat()),
    getBankAccounts(ctx.tenant.id),
    // RG-01 — o fluxo acima é PREVISTO (montado pelo vencimento). Este é o
    // REALIZADO, montado pela data de liquidação: o dinheiro que de fato passou
    // pela conta. São visões distintas da mesma realidade e aparecem lado a
    // lado; nenhum número do previsto muda por causa disto.
    // 1.1 (chave ligada): o realizado é SEMPRE da Atual, qualquer que seja a
    // ordem da seleção; sem Atual, nenhum realizado.
    isAll
      ? flowMapsRealizadoConsolidado()
      : fluxoNovo
        ? atualReal
          ? flowMapsRealizado(atualReal.id)
          : Promise.resolve({ entradas: {} as Record<string, number>, saidas: {} as Record<string, number>, semData: { qtd: 0, valor: 0 } })
        : flowMapsRealizado(compareVersions[0].id),
  ]);
  // A primeira versão selecionada é a de referência (entradas/saídas/saldo
  // acumulado dos cartões do topo).
  const { entradas, saidas } = fluxos[0];

  // Saldo inicial = só contas da empresa (contas "Terceiros" são obrigações).
  // BAD-1 (chave ligada): com UMA obra, o partida é o caixa da Atual antes do
  // primeiro mês — o fluxo da obra; Empresa toda segue pelas contas.
  const saldoDasContas = saldoDisponivel(contas);

  // Eixo = INCC + meses com movimentação (âncora nos dados reais). Prompt AD,
  // 3.1: entram também os meses do REALIZADO — pagamento em mês sem previsão
  // tinha linha nenhuma onde aparecer. Nenhum total muda: nesses meses o
  // previsto é zero e o acumulado não se mexe.
  const axis = eixoDoFluxo(incc.map((r) => r.m), fluxos, realizado).sort(sortMonthKey);
  const partidaPelaObra = fluxoNovo && !!project;
  const saldoInicial = partidaPelaObra ? partidaDaObra(axis, realizado) : saldoDasContas;
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

  // Saldo acumulado corre desde o saldo inicial ao longo de todo o horizonte,
  // pelo previsto (como antes). Linhas e desvio vêm do módulo puro, que o
  // assistente também lê (Prompt AD, 4.2).
  // 2.1 (chave ligada): mês fechado entra no acumulado pelo realizado.
  const linhas = linhasDoFluxo(axis, yearMonths, { entradas, saidas }, realizado, saldoInicial, fluxoNovo ? { mesAtual: mesCorrente() } : {});
  const desvioTotal = totalDoDesvio(linhas);
  const totRealE = linhas.reduce((a, l) => a + l.realE, 0);
  const totRealS = linhas.reduce((a, l) => a + l.realS, 0);
  const versaoDoRealizado = isAll
    ? "da Atual de cada obra"
    : fluxoNovo
      ? `da versão Atual${atualReal ? ` (“${atualReal.label}”)` : ""}, qualquer que seja a seleção`
      : `da versão “${compareVersions[0].label}”`;
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
      {project && <LembrarProjeto projectId={project.id} />}
      {doEscopo && (
        <p className="mb-4 text-[13px] text-[var(--color-ink3)]">
          {rotuloDoEscopo(escopo.tipo as "todos" | "ativos" | "finalizados")} ·{" "}
          {projetosConsolidados.length} projeto(s) somado(s)
          {doEscopo.semSituacao > 0 &&
            ` · ${doEscopo.semSituacao} obra(s) sem status ficaram fora — classifique-as em Projetos`}
        </p>
      )}

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
            hint={`entradas − saídas previstas do período, sem o saldo inicial${
              anosComMovimento.length > 1 ? ` · movimento em ${anosComMovimento.join(", ")}` : ""
            }`}
          />
        </div>
      )}

      {/* Prompt AD, 2.2 e BAD-1 — cada número declara a sua base. */}
      <div className="mb-3 space-y-0.5 text-[12px] text-[var(--color-ink3)]" data-bases>
        {semAtual && (
          <p className="rounded-[8px] bg-[var(--color-warning)]/10 px-3 py-2 text-[var(--color-ink2)]" role="status">
            {project?.name} não tem versão Atual: sem realizado, sem desvio e sem saldo acumulado. Nenhuma outra versão é usada no lugar.
          </p>
        )}
        <p>
          <strong className="text-[var(--color-ink2)]">Saldo acumulado</strong>{" "}
          {partidaPelaObra ? (
            <>parte de {brl0(saldoInicial)} — o caixa realizado da Atual antes do primeiro mês, ou seja, o fluxo da obra, não o saldo das contas da empresa</>
          ) : (
            <>parte do saldo inicial de {brl0(saldoInicial)} — a soma das contas correntes da empresa (todas as obras), não o caixa da obra</>
          )}{" "}
          — e corre {fluxoNovo ? <>pelo <strong>realizado</strong> nos meses fechados e pelo <strong>previsto</strong> do mês corrente em diante</> : "pelo previsto"}.
        </p>
        <p>
          <strong className="text-[var(--color-ink2)]">Realizado</strong>: lançamentos de caixa {versaoDoRealizado}, pela data de
          liquidação, conciliados ou não. <strong className="text-[var(--color-ink2)]">Desvio</strong> = saldo realizado − saldo previsto
          {versoesTabela.length > 1 ? ` de ${versoesTabela[0]?.label}` : ""} do mês; só onde há os dois lados.
        </p>
      </div>
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
                  <TH colSpan={5} />
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
                {!semAtual && (
                  <>
                    <TH className="text-right">Realizado ↑</TH>
                    <TH className="text-right">Realizado ↓</TH>
                    {/* Prompt AD, Parte 5 — o desvio entra na tela. */}
                    <TH className="text-right">Desvio</TH>
                    <TH className="text-right">Desvio %</TH>
                    <TH className="text-right">Saldo acumulado</TH>
                  </>
                )}
              </tr>
            </THead>
            <tbody>
              {linhas.map((l, li) => (
                <Fragment key={l.mm}>
                {/* 2.1/3.2 (chave ligada) — a fronteira entre o que já aconteceu e a projeção. */}
                {li > 0 && linhas[li - 1].fechado && !l.fechado && (
                  <tr data-fronteira>
                    <td colSpan={6 + versoesTabela.length * 3} className="border-y-2 border-[var(--color-accent2)]/40 bg-[var(--color-accent4)] px-3 py-1 text-center text-[11px] text-[var(--color-ink2)]">
                      acima: meses fechados (o acumulado segue o realizado) · abaixo: projeção (o acumulado segue o previsto)
                    </td>
                  </tr>
                )}
                <TR>
                  <TD className="font-[family-name:var(--font-mono)] font-medium text-[var(--color-ink)]">
                    {l.mm}
                  </TD>
                  {fluxos.map((f, i) => {
                    const e = f.entradas[l.mm] || 0;
                    const sa = f.saidas[l.mm] || 0;
                    return (
                      <Fragment key={versoesTabela[i]?.id ?? i}>
                        <TD className={`text-right font-[family-name:var(--font-mono)] text-[var(--color-success)] ${l.fechado ? "opacity-50" : ""}`} title={l.fechado ? "Previsto de mês já fechado: referência — o número principal é o realizado" : undefined}>
                          {e > 0 ? brl0(e) : "—"}
                        </TD>
                        <TD className={`text-right font-[family-name:var(--font-mono)] text-[var(--color-danger)] ${l.fechado ? "opacity-50" : ""}`}>
                          {sa > 0 ? brl0(sa) : "—"}
                        </TD>
                        <TD className="text-right font-[family-name:var(--font-mono)] font-medium text-[var(--color-success)]">
                          {/* 3.4 — mês vazio não é R$ 0. */}
                          {e === 0 && sa === 0 ? "—" : brl0(e - sa)}
                        </TD>
                      </Fragment>
                    );
                  })}
                  {!semAtual && (
                    <>
                  <TD
                    className={`text-right font-[family-name:var(--font-mono)] text-[var(--color-success)] ${l.fechado ? "font-semibold" : ""}`}
                    title="Entradas efetivamente liquidadas neste mês (extrato/caixa)"
                  >
                    {(realizado.entradas[l.mm] || 0) > 0 ? brl0(realizado.entradas[l.mm]) : "—"}
                  </TD>
                  <TD
                    className={`text-right font-[family-name:var(--font-mono)] text-[var(--color-danger)] ${l.fechado ? "font-semibold" : ""}`}
                    title="Saídas efetivamente liquidadas neste mês (extrato/caixa)"
                  >
                    {(realizado.saidas[l.mm] || 0) > 0 ? brl0(realizado.saidas[l.mm]) : "—"}
                  </TD>
                  <TD
                    className={`text-right font-[family-name:var(--font-mono)] ${
                      l.desvio.valor == null ? "text-[var(--color-ink4)]" : l.desvio.valor < 0 ? "text-[var(--color-danger)]" : "text-[var(--color-success)]"
                    }`}
                    data-desvio={l.desvio.estado}
                  >
                    {l.desvio.valor == null ? TEXTO_ESTADO[l.desvio.estado] : `${l.desvio.valor > 0 ? "+" : ""}${brl0(l.desvio.valor)}`}
                  </TD>
                  <TD className="text-right font-[family-name:var(--font-mono)] text-[var(--color-ink3)]">
                    {l.desvio.pct == null ? "—" : `${l.desvio.pct > 0 ? "+" : ""}${pct1(l.desvio.pct)}`}
                  </TD>
                  <TD className="text-right font-[family-name:var(--font-mono)] font-semibold text-[var(--color-accent)]">
                    {brl0(l.saldo)}
                  </TD>
                    </>
                  )}
                </TR>
                </Fragment>
              ))}
              {linhas.length === 0 ? (
                <TR>
                  <TD
                    colSpan={6 + versoesTabela.length * 3}
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
                  {!semAtual && (
                    <>
                  {/* Antes, o total não tinha as colunas de realizado e desalinhava. */}
                  <TD className="text-right font-[family-name:var(--font-mono)] font-semibold text-[var(--color-success)]">
                    {brl0(totRealE)}
                  </TD>
                  <TD className="text-right font-[family-name:var(--font-mono)] font-semibold text-[var(--color-danger)]">
                    {brl0(totRealS)}
                  </TD>
                  <TD
                    className="text-right font-[family-name:var(--font-mono)] font-semibold"
                    title={`Soma dos ${desvioTotal.mesesComparados} mês(es) com os dois lados; ${desvioTotal.soPrevisto} só com previsto e ${desvioTotal.soRealizado} só com realizado ficam fora.`}
                    data-desvio-total
                  >
                    {desvioTotal.mesesComparados === 0 ? "—" : `${desvioTotal.valor > 0 ? "+" : ""}${brl0(desvioTotal.valor)}`}
                  </TD>
                  <TD className="text-right font-[family-name:var(--font-mono)] font-semibold text-[var(--color-ink3)]">
                    {desvioTotal.pct == null ? "—" : `${desvioTotal.pct > 0 ? "+" : ""}${pct1(desvioTotal.pct)}`}
                  </TD>
                  <TD className="text-right font-[family-name:var(--font-mono)] font-semibold text-[var(--color-accent)]">
                    {brl0(saldoAcumFinal)}
                  </TD>
                    </>
                  )}
                </TR>
              )}
            </tbody>
          </Table>
        </CardContent>
      </Card>
      {/* 3.3 — caixa sem data: contado e mostrado fora da tabela. */}
      {realizado.semData.qtd > 0 && (
        <p className="mt-3 rounded-[8px] border border-[var(--color-warning)]/40 bg-[var(--color-warning)]/5 px-3 py-2 text-[12px] text-[var(--color-ink2)]" data-sem-data>
          {realizado.semData.qtd} lançamento(s) de caixa sem data, somando {brl0(realizado.semData.valor)}, não entram em nenhum mês
          do realizado. Corrija a data no Caixa para que apareçam.
        </p>
      )}
      {desvioTotal.mesesComparados > 0 && (desvioTotal.soPrevisto > 0 || desvioTotal.soRealizado > 0) && (
        <p className="mt-2 text-[11.5px] text-[var(--color-ink3)]">
          Desvio do período: soma dos {desvioTotal.mesesComparados} mês(es) com previsto e realizado. {desvioTotal.soPrevisto} mês(es) só com
          previsto e {desvioTotal.soRealizado} só com realizado não entram na soma.
        </p>
      )}
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
