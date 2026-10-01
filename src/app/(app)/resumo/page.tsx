import { getProjectVersions, getTenantContext } from "@/lib/context";
import { avisoNoSeletor } from "@/lib/situacao-versao";
import { chaveLigada } from "@/lib/chaves-tenant";
import { lerSelecaoDeProjeto } from "@/lib/projeto-selecao";
import { PedirProjeto } from "@/components/app/pedir-projeto";
import { ProjectPicker } from "@/components/app/project-picker";
import { LembrarProjeto } from "@/components/app/projeto-da-aba";
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
import { TEXTO_DA_BASE, indicadoresDoResumo, type IndicadorDoResumo } from "@/lib/resumo-tela";
import { rotuloDaVersao } from "@/lib/dashboard-tela";
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
import { can } from "@/lib/permissions";
import { AccessDenied } from "@/components/app/access-denied";

export const dynamic = "force-dynamic";

/** Indicadores gerais (valores contratados) de uma versão. */
async function versionIndicadores(
  version: Version,
): Promise<IndicadorDoResumo[]> {
  const [unitRows, permRows, reembRows] = await Promise.all([
    getUnits(version.tenantId, version.id),
    getPermutas(version.tenantId, version.id),
    getReembolsos(version.tenantId, version.id),
  ]);
  const totals = calcTotals(
    unitRows.map(toCalcUnit),
    permToCalc(permRows),
    reembToCalc(reembRows),
  );
  return indicadoresDoResumo({ totals, unidades: unitRows, permutas: permRows, liberacoes: reembRows.length });
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
    reembToCalc(reembRows),
  );
  const totalUnidades = totals.vend + totals.res + totals.disp;

  const indicadores = indicadoresDoResumo({ totals, unidades: unitRows, permutas: permRows, liberacoes: reembRows.length });

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
