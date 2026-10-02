import { getProjectVersions, getTenantContext } from "@/lib/context";
import { avisoNoSeletor, entraNosRelatorios } from "@/lib/situacao-versao";
import { chaveLigada } from "@/lib/chaves-tenant";
import { lerSelecaoDeProjeto } from "@/lib/projeto-selecao";
import { PedirProjeto } from "@/components/app/pedir-projeto";
import { ProjectPicker } from "@/components/app/project-picker";
import { LembrarProjeto } from "@/components/app/projeto-da-aba";
import {
  getBudgetLines,
  getContasPagar,
  getContasReceber,
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
import Link from "next/link";
import { and, asc, count, eq, isNull, or } from "drizzle-orm";
import { db, schema } from "@/lib/db";
import {
  BLOCOS_PENDENTES,
  STATUS_DE_UNIDADE,
  alertaDeDesvio,
  alertaDeVencidos,
  blocoAtencao,
  blocoExposicao,
  blocoVendas,
  custoAteOMes,
  parametrosDeAlerta,
  temPlanoDePagamento,
  textoDosLimites,
} from "@/lib/resumo-blocos";
import { versionInputsByMonth } from "@/lib/dre-inputs";
import { ehVersaoAtual, pendenteDaConta } from "@/lib/contas-pagar-regras";
import { estaVencida } from "@/lib/despesa-status";
import { analisarResumo } from "@/lib/resumo-analise";
import { AssistenteResumo } from "@/components/app/assistente-resumo";
import { TEXTO_DA_BASE, indicadoresDoResumo, type IndicadorDoResumo } from "@/lib/resumo-tela";
import { rotuloDaVersao } from "@/lib/dashboard-tela";
import { brl0, dateBR, monthInRange, ymd } from "@/lib/utils";
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
import { can } from "@/lib/permissions";
import { AccessDenied } from "@/components/app/access-denied";

export const dynamic = "force-dynamic";

/** Indicadores gerais (valores contratados) de uma versão. */
async function versionIndicadores(
  version: Version,
  definicaoNova = false,
): Promise<IndicadorDoResumo[]> {
  const [unitRows, permRows, reembRows] = await Promise.all([
    getUnits(version.tenantId, version.id),
    getPermutas(version.tenantId, version.id),
    getReembolsos(version.tenantId, version.id),
  ]);
  const totals = calcTotals(
    unitRows.map(toCalcUnit),
    permToCalc(permRows),
    liberacoesComStatus(reembRows),
    { definicaoNova },
  );
  return indicadoresDoResumo({ totals, unidades: unitRows, permutas: permRows, liberacoes: reembRows.length, definicaoNova });
}

/** As liberações com o status, que `calcTotals` só lê com a chave (2.7). */
function liberacoesComStatus(rows: Parameters<typeof reembToCalc>[0]) {
  return reembToCalc(rows).map((r, i) => ({ ...r, status: rows[i].status ?? null }));
}

export default async function ResumoPage({
  searchParams,
}: {
  searchParams: Promise<{ de?: string; ate?: string; vs?: string; proj?: string; project?: string }>;
}) {
  const ctx = await getTenantContext();
  if (!ctx) return null;
  // A página verifica "ver" antes de consultar qualquer dado (Prompt M, 2.2).
  // A guarda do layout não basta: ele renderiza em paralelo com a página e
  // não roda de novo na navegação dentro do app.
  if (!can(ctx.perms, "resumo", "ver")) return <AccessDenied />;
  // Prompt H (BH-3): selo no seletor quando a regra está ligada na empresa.
  const rascunhoFora = await chaveLigada(ctx.tenant.id, "rascunho_fora_dos_relatorios");
  // Prompt AE, seção 6 — a definição nova do Resumo (nasce desligada).
  const resumoNovo = await chaveLigada(ctx.tenant.id, "resumo_definicao_nova");

  // A obra vem da URL desta tela (Prompt A); sem ela, a aba reabre a última
  // escolhida ou a tela pede a escolha — nunca a obra do cookie. Relatório de
  // UMA obra: não há "Todos" aqui (B12 vale para os consolidáveis).
  const spObra = await searchParams;
  const selecaoObra = lerSelecaoDeProjeto(ctx.projects, spObra);
  const escolhido =
    selecaoObra.tipo === "projeto"
      ? await getProjectVersions(ctx.tenant.id, selecaoObra.projeto.id)
      : null;
  if (!escolhido?.trabalho) {
    return <PedirProjeto titulo="Resumo Executivo" projetos={ctx.projects} oQue="ver o resumo executivo" />;
  }
  const { project: obra, versions: versoesDaObra, trabalho: versaoTrabalho } = escolhido;
  const projectPicker = (
    <>
      <ProjectPicker
        projects={ctx.projects.map((p) => ({ id: p.id, label: p.name }))}
        selected={obra.id}
      />
      <LembrarProjeto projectId={obra.id} />
    </>
  );

  const sp = await searchParams;
  const de = sp.de ?? "";
  const ate = sp.ate ?? "";
  const hasRange = !!(de || ate);

  const compareVersions = resolveCompareVersions(sp.vs, versoesDaObra, versaoTrabalho);
  const multi = compareVersions.length > 1;
  // Prompt AE, 3.5: a tela diz quando NÃO está na Atual — valores de
  // planejamento não são "valores contratados".
  const temAtual = versoesDaObra.some((v) => v.kind === "atual");
  const foraDaAtual = compareVersions.filter((v) => v.kind !== "atual");
  const avisoDaVersao =
    foraDaAtual.length === 0
      ? null
      : !temAtual
        ? `${obra.name} não tem versão Atual: a tela mostra ${foraDaAtual.map((v) => `${rotuloDaVersao(v).titulo} “${v.label}”`).join(", ")}, que é planejamento, não o contratado.`
        : `${foraDaAtual.map((v) => `${rotuloDaVersao(v).titulo} “${v.label}”`).join(", ")}: valores de planejamento, não o contratado da Atual.`;
  const aviso = avisoDaVersao ? (
    <p className="mb-4 rounded-[8px] bg-[var(--color-warning)]/10 px-3 py-2 text-[12.5px] text-[var(--color-ink2)]" role="status" data-aviso-versao>
      {avisoDaVersao}
    </p>
  ) : null;
  const versionSelect = (
    <VersionMultiSelect
      versions={versoesDaObra.map((v) => {
        const r = rotuloDaVersao(v);
        return { id: v.id, label: `${r.titulo} · ${v.label}`, color: v.color, aviso: avisoNoSeletor(v, rascunhoFora), marca: r.copia ? "cópia" : null };
      })}
      selected={compareVersions.map((v) => v.id)}
      noLimite="avisar"
    />
  );

  // ─────────────────────── Modo comparação (2–3 versões) ───────────────────
  if (multi) {
    const perVersion = await Promise.all(compareVersions.map((v) => versionIndicadores(v, resumoNovo)));
    const labels = perVersion[0].map((i) => i.label);
    const rows: CompareRow[] = labels.map((label, ri) => ({
      label,
      values: perVersion.map((ind) => ind[ri]?.value ?? 0),
    }));
    return (
      <>
        <PageHeader
          title="Resumo Executivo"
          subtitle="Comparativo de versões · indicadores gerais"
          actions={
            <div className="flex flex-wrap items-end gap-3">
              {projectPicker}
              {/* 4.2 — o período não tem efeito na comparação: o filtro sai daqui. */}
            </div>
          }
        />
        <div className="mb-4">{versionSelect}</div>
        {aviso}
        <p className="mb-3 text-[12px] text-[var(--color-ink3)]" data-criterios>
          O VGV conta {TEXTO_DA_BASE.todas_unidades}; Sinais, Mensais, Semestrais, Anuais, FGTS e Subsídio contam {TEXTO_DA_BASE.vendidas};
          valores nominais, sem INCC. O período não se aplica à comparação.
        </p>
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
    getUnits(version.tenantId, version.id),
    getPermutas(version.tenantId, version.id),
    getReembolsos(version.tenantId, version.id),
    getMonthlyRevenue(version.id, obra.id),
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
    liberacoesComStatus(reembRows),
    { definicaoNova: resumoNovo },
  );
  // Desligada: a soma de três filtros, como antes (2.3 entra pelo bloco Vendas, com a chave).
  const totalUnidades = totals.vend + totals.res + totals.disp;

  const indicadores = indicadoresDoResumo({ totals, unidades: unitRows, permutas: permRows, liberacoes: reembRows.length, definicaoNova: resumoNovo });

  // ── Prompt AE, Parte 1 (chave): os blocos por pergunta ────────────────────
  const blocos = resumoNovo
    ? await montarBlocos({
        ctx,
        obra,
        version,
        temAtual,
        unitRows,
        permRows,
        totals,
        de,
        ate,
        rascunhoFora,
      })
    : null;

  // Prompt AE, Parte 5 — o assistente lê os números já montados acima.
  const analise = analisarResumo({
    obra: obra.name,
    versao: `${rotuloDaVersao(version).titulo} “${version.label}”`,
    definicaoNova: resumoNovo,
    indicadores,
    unidades: { total: unitRows.length, vendidas: totals.vend },
    vendas: blocos?.vendas ?? null,
    exposicao: blocos?.exposicao ?? null,
    atencao: blocos?.atencao ?? null,
    recorte: [obra.id, version.id, de, ate, resumoNovo ? "nova" : "hoje"].join("|"),
    fmt: brl0,
  });

  return (
    <>
      <PageHeader
        eyebrow={`${obra.name} · Versão ${version.label}`}
        title="Resumo Executivo"
        subtitle="Indicadores gerais calculados dinamicamente"
        actions={
          <div className="flex flex-wrap items-end gap-3">
            {projectPicker}
            <DateRangeFilter de={de} ate={ate} />
          </div>
        }
      />
      <div className="mb-4">{versionSelect}</div>

      <div className="flex flex-col gap-6 min-[1180px]:flex-row min-[1180px]:items-start">
      <div className="min-w-0 flex-1">
      {aviso}
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

      {/* 4.1 (chave): os blocos por pergunta substituem a tabela por fonte de recurso. */}
      {blocos ? (
        <BlocosDoResumo b={blocos} />
      ) : (
      <div className="grid gap-6 lg:grid-cols-[1fr_360px]">
        {/* Indicadores gerais */}
        <Card>
          <CardContent className="p-5">
            <h2 className="text-sm font-semibold text-[var(--color-ink)]">
              Indicadores Gerais
            </h2>
            <p className="mb-4 text-[11px] text-[var(--color-ink3)]">
              Valores acumulados da versão, não variam por período.{" "}
              {/* 4.3 — só aponta para o cartão de período quando ele existe. */}
              {hasRange
                ? "O recorte por data afeta só os recebimentos previstos acima."
                : "Para ver os recebimentos de um período, informe as datas acima."}{" "}
              Valores nominais, sem INCC. O VGV conta {TEXTO_DA_BASE.todas_unidades}; Sinais a Subsídio contam{" "}
              {TEXTO_DA_BASE.vendidas}.
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
                    <TD className="text-[var(--color-ink2)]" title={`Base: ${TEXTO_DA_BASE[i.base]}`}>{i.label}</TD>
                    <TD
                      className={`text-right font-[family-name:var(--font-mono)] font-medium ${
                        i.value > 0
                          ? "text-[var(--color-accent2)]"
                          : "text-[var(--color-ink4)]"
                      }`}
                      title={i.vazio ? `Sem registro na base (${TEXTO_DA_BASE[i.base]})` : undefined}
                    >
                      {/* 4.4 — sem nada de onde somar é "—"; zero de fato é R$ 0. */}
                      {i.vazio ? "—" : brl0(i.value)}
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
                {/* 2.8 — o selo fala desta tela: o financiamento é projetado em outras (Projeção, DRE, Fluxo). */}
                <Badge tone="neutral">não entra nos totais desta tela</Badge>
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
      )}
      </div>
      <AssistenteResumo usuario={ctx.userId ?? "anon"} analise={analise} />
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

type Blocos = Awaited<ReturnType<typeof montarBlocos>>;

/** Lê o que os blocos precisam — com tenant explícito e a permissão de cada tela de origem (5.4). */
async function montarBlocos(o: {
  ctx: NonNullable<Awaited<ReturnType<typeof getTenantContext>>>;
  obra: { id: string; name: string };
  version: Version;
  temAtual: boolean;
  unitRows: Awaited<ReturnType<typeof getUnits>>;
  permRows: Awaited<ReturnType<typeof getPermutas>>;
  totals: ReturnType<typeof calcTotals>;
  de: string;
  ate: string;
  rascunhoFora: boolean;
}) {
  const { ctx, obra } = o;
  const d = new Date();
  const hojeBR = `${d.getMonth() + 1}/${d.getDate()}/${d.getFullYear()}`;
  const mesAtual = `${String(d.getMonth() + 1).padStart(2, "0")}/${d.getFullYear()}`;
  const hoje = ymd(hojeBR);
  const vencida = (v: string | null) => ymd(v) != null && hoje != null && (ymd(v) as number) < hoje;
  const unidades = o.unitRows.map((u) => ({
    status: u.status,
    valor: Number(u.valor),
    mesVenda: u.mesVenda,
    temPlano: temPlanoDePagamento(u.paymentPlan),
  }));
  const [receber, pagar, semClassificacao, custo] = await Promise.all([
    can(ctx.perms, "contasreceber", "ver")
      ? getContasReceber(ctx.tenant.id, obra.id).then((cs) =>
          cs
            .filter((c) => !/cancel/i.test(c.status))
            .map((c) => ({ saldo: Math.max(0, c.valor - c.valorRecebido), vencida: vencida(c.vencimento), vencimento: c.vencimento })),
        )
      : Promise.resolve(null),
    can(ctx.perms, "contaspagar", "ver")
      ? getContasPagar(ctx.tenant.id).then((cs) =>
          cs
            .filter((c) => c.projectId === obra.id && ehVersaoAtual(c.versionKind))
            .map((c) => ({ saldo: pendenteDaConta(c), vencida: estaVencida(c) })),
        )
      : Promise.resolve(null),
    can(ctx.perms, "despesas", "ver") && o.version.kind === "atual"
      ? db
          .select({ n: count() })
          .from(schema.despesas)
          .where(
            and(
              eq(schema.despesas.tenantId, ctx.tenant.id),
              eq(schema.despesas.versionId, o.version.id),
              eq(schema.despesas.cancelado, false),
              or(isNull(schema.despesas.categoriaDre), isNull(schema.despesas.competencia), eq(schema.despesas.competencia, "")),
            ),
          )
          .then((r) => Number(r[0]?.n ?? 0))
      : Promise.resolve(null),
    // BAE-1: custo só para quem vê Despesas (20.); o Orçamento é o do card
    // Orçado x Realizado e, com a chave do rascunho, só se estiver Aprovado.
    can(ctx.perms, "despesas", "ver") && o.temAtual ? custoOrcadoRealizado(ctx.tenant.id, obra.id, mesAtual, o.rascunhoFora) : Promise.resolve(null),
  ]);
  const parametros = parametrosDeAlerta(ctx.tenant);
  const porValor = [
    custo ? alertaDeDesvio({ obra: obra.name, projectId: obra.id, ...custo, ate: mesAtual }, parametros) : null,
    receber ? alertaDeVencidos({ obra: obra.name, projectId: obra.id, contas: receber, hoje: hojeBR }, parametros) : null,
  ].filter((x) => x != null);
  return {
    vendas: blocoVendas(unidades, o.de, o.ate),
    exposicao: blocoExposicao({
      receber,
      pagar,
      totals: o.totals,
      permutas: o.permRows.map((p) => ({ status: p.status, estimado: Number(p.estimado ?? 0) })),
    }),
    atencao: [...blocoAtencao({ obra: obra.name, projectId: obra.id, temAtual: o.temAtual, unidades, despesasSemClassificacao: semClassificacao }), ...porValor],
    obraId: obra.id,
    parametros,
  };
}

/**
 * BAE-1 — custo Realizado (Atual) e Orçado até `mes`, pela MESMA leitura da
 * DRE (`versionInputsByMonth`, seguindo a chave da DRE). `orcado` null = sem
 * Orçamento que conte nos relatórios.
 */
async function custoOrcadoRealizado(tenantId: string, projectId: string, mes: string, rascunhoFora: boolean) {
  const versoes = await db
    .select({ id: schema.versions.id, kind: schema.versions.kind, isDefault: schema.versions.isDefault, status: schema.versions.status })
    .from(schema.versions)
    .where(and(eq(schema.versions.tenantId, tenantId), eq(schema.versions.projectId, projectId)))
    .orderBy(asc(schema.versions.createdAt));
  const budgets = versoes.filter((v) => v.kind === "budget");
  const padrao = budgets.find((v) => v.isDefault) ?? budgets[0] ?? null;
  const budget = padrao && entraNosRelatorios(padrao, rascunhoFora) ? padrao : null;
  const atual = versoes.find((v) => v.kind === "atual") ?? null;
  if (!atual) return null;
  const linhasDoOrcamento = budget ? await getBudgetLines(budget.id) : [];
  const definicaoNova = await chaveLigada(tenantId, "dre_definicao_nova");
  const [porMesOrcado, porMesAtual] = await Promise.all([
    budget ? versionInputsByMonth(tenantId, budget.id, projectId, { definicaoNova }) : Promise.resolve(null),
    versionInputsByMonth(tenantId, atual.id, projectId, { definicaoNova }),
  ]);
  const temOrcamento = !!porMesOrcado && linhasDoOrcamento.length > 0;
  return {
    orcado: temOrcamento ? custoAteOMes(porMesOrcado, mes) : null,
    semOrcamento: temOrcamento ? undefined : padrao && !budget ? ("fora_dos_relatorios" as const) : ("sem_lancamento" as const),
    realizado: custoAteOMes(porMesAtual, mes),
  };
}

function Bloco({ titulo, regime, href, children }: { titulo: string; regime: string; href?: string; children: React.ReactNode }) {
  return (
    <Card>
      <CardContent className="p-5">
        <div className="mb-3 flex items-baseline justify-between gap-2">
          <h2 className="text-sm font-semibold text-[var(--color-ink)]">{titulo}</h2>
          {href && (
            <Link href={href} className="text-[11px] text-[var(--color-accent2)] hover:underline">
              detalhar →
            </Link>
          )}
        </div>
        <p className="-mt-2 mb-3 text-[11px] text-[var(--color-ink3)]">{regime}</p>
        {children}
      </CardContent>
    </Card>
  );
}

function Linha({ rotulo, valor, dica }: { rotulo: string; valor: string; dica?: string }) {
  return (
    <div className="flex items-baseline justify-between gap-3 py-0.5" title={dica}>
      <dt className="text-[13px] text-[var(--color-ink2)]">{rotulo}</dt>
      <dd className="font-[family-name:var(--font-mono)] text-[13px] font-medium text-[var(--color-ink)]">{valor}</dd>
    </div>
  );
}

/** Prompt AE, Parte 1 — os blocos prontos e os pendentes, com o motivo escrito. */
function BlocosDoResumo({ b }: { b: Blocos }) {
  const v = b.vendas;
  const e = b.exposicao;
  const q = `?proj=${b.obraId}`;
  const vsoTexto =
    v.vso.estado === "ok"
      ? `${v.vso.pct.toLocaleString("pt-BR", { maximumFractionDigits: 1 })}% (${v.vso.vendidasNoPeriodo} de ${v.vso.ofertaNoInicio})`
      : "—";
  const vsoDica =
    v.vso.estado === "sem_periodo"
      ? "informe o período para calcular"
      : v.vso.estado === "sem_data"
        ? `${v.vso.vendidasSemData} vendida(s) sem data de venda: não calculável`
        : v.vso.estado === "sem_oferta"
          ? "nenhuma unidade em oferta no início do período"
          : "vendidas no período ÷ oferta no início do período";
  return (
    <div className="mb-6 space-y-4" data-blocos-resumo>
      <div className="grid gap-4 lg:grid-cols-3">
        <Bloco titulo="Vendas" regime="Valores contratados · cadastro das unidades da versão" href={`/unidades${q}`}>
          <dl>
            <Linha rotulo="VGV total" valor={brl0(v.vgvTotal)} dica="todas as unidades, em qualquer status" />
            <Linha rotulo="VGV vendido" valor={brl0(v.vgvVendido)} dica="só as unidades Vendidas" />
            <Linha rotulo="VSO do período" valor={vsoTexto} dica={vsoDica} />
            {STATUS_DE_UNIDADE.map((s) => (
              <Linha key={s} rotulo={s === "Disponivel" ? "Disponíveis" : s === "Reservado" ? "Reservadas" : s === "Vendido" ? "Vendidas" : "Permutadas"} valor={String(v.porStatus[s])} />
            ))}
            <Linha rotulo="Total de unidades" valor={String(v.total)} />
          </dl>
          {v.vso.estado !== "ok" && <p className="mt-1 text-[11px] text-[var(--color-ink3)]">VSO: {vsoDica}.</p>}
        </Bloco>
        <Bloco titulo="Exposição" regime="Saldos em aberto, não o valor cheio. A receber e a pagar são as contas da obra (versão Atual), qualquer que seja a versão escolhida; financiamento e permuta, da versão.">
          <dl>
            {e.aReceber ? (
              <Linha rotulo="A receber em aberto" valor={`${brl0(e.aReceber.porVencer + e.aReceber.vencido)}`} dica={`${brl0(e.aReceber.vencido)} já vencido · ${e.aReceber.contas} conta(s)`} />
            ) : (
              <Linha rotulo="A receber em aberto" valor="—" dica="sua permissão não alcança Contas a Receber" />
            )}
            {e.aPagar ? (
              <Linha rotulo="A pagar em aberto (saldo das parcelas)" valor={`${brl0(e.aPagar.porVencer + e.aPagar.vencido)}`} dica={`${brl0(e.aPagar.vencido)} já vencido · ${e.aPagar.contas} conta(s)`} />
            ) : (
              <Linha rotulo="A pagar em aberto" valor="—" dica="sua permissão não alcança Contas a Pagar" />
            )}
            <Linha rotulo="Financiamento aprovado" valor={brl0(e.financiamento.aprovado)} dica="soma do financiamento das unidades vendidas" />
            <Linha rotulo="Financiamento liberado" valor={brl0(e.financiamento.liberado)} dica="Liberações de Obra da versão" />
            <Linha rotulo="Permuta em estoque" valor={brl0(e.permutaEmEstoque)} dica="recebida e ainda não vendida, pelo valor de entrada" />
          </dl>
          <p className="mt-1 text-[11px] text-[var(--color-ink3)]">
            {e.aReceber ? `Vencido a receber: ${brl0(e.aReceber.vencido)}. ` : ""}
            {e.aPagar ? `Vencido a pagar: ${brl0(e.aPagar.vencido)}.` : ""}
          </p>
        </Bloco>
        <Bloco titulo="Atenção" regime={textoDosLimites(b.parametros)}>
          {b.atencao.length === 0 ? (
            <p className="text-[12.5px] text-[var(--color-ink2)]">Nenhuma exceção nesta obra.</p>
          ) : (
            <ul className="space-y-1.5 text-[12.5px] text-[var(--color-ink2)]">
              {b.atencao.map((a) => (
                <li key={a.texto}>
                  {a.texto}{" "}
                  <Link href={a.href} className="text-[var(--color-accent2)] hover:underline">
                    resolver →
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </Bloco>
      </div>
      <div className="grid gap-4 lg:grid-cols-3" data-blocos-pendentes>
        {(["resultado", "caixa", "comparativo"] as const).map((k) => (
          <div key={k} className="rounded-[12px] border border-dashed border-[var(--color-line)] bg-[var(--color-surface2)] px-4 py-3 text-[12px] text-[var(--color-ink2)]">
            {BLOCOS_PENDENTES[k]}
          </div>
        ))}
      </div>
      <p className="text-[11px] text-[var(--color-ink3)]">{BLOCOS_PENDENTES.execucao}</p>
    </div>
  );
}
