import Link from "next/link";
import { getProjectVersions, getTenantContext } from "@/lib/context";
import { lerSelecaoDeProjeto } from "@/lib/projeto-selecao";
import { ProjectPicker } from "@/components/app/project-picker";
import { LembrarProjeto, RecuperarProjeto } from "@/components/app/projeto-da-aba";
import { isContaDaEmpresa, saldoDisponivel } from "@/lib/contas-saldo";
import { cadeiaDeSaldo, diasDesdeAtualizacao } from "@/lib/calc/cadeia-caixa";
import { CadeiaDias } from "@/components/app/cadeia-dias";
import { SaldosCaixa } from "@/components/app/saldos-caixa";
import { hojeISO } from "@/lib/despesa-status";
import {
  getBankAccounts,
  getCash,
  getConciliacaoData,
  getDailyClosings,
  getInccRows,
  getPermutas,
  getReembolsos,
  getUnits,
  permToResale,
  reembToCalc,
  toCalcUnit,
} from "@/lib/queries";
import { ConciliacaoReview } from "@/components/app/conciliacao-review";
import {
  calcProjection,
  permutaCashByMonth,
  reembursementsByMonth,
  type MonthlyProjection,
} from "@/lib/calc";
import { isPluggyConfigured as pluggyCfg } from "@/lib/openfinance/pluggy";
import { isAiConfigured } from "@/lib/ai/despesa-extract";
import { can } from "@/lib/permissions";
import type { ConciliacaoData } from "@/lib/queries";
import { brl0, dateBR, dateInRange } from "@/lib/utils";
import { PageHeader } from "@/components/app/page-header";
import { DateRangeFilter } from "@/components/app/date-range-filter";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Table, THead, TH, TR, TD } from "@/components/ui/table";
import { ConciliarToggle } from "@/components/app/conciliar-toggle";
import { ImportExtratoButton } from "@/components/app/import-extrato";
import { CaixaEntryForm } from "@/components/app/caixa-entry-form";
import { VersionMultiSelect } from "@/components/app/version-multiselect";
import {
  VersionCompareTable,
  type CompareRow,
} from "@/components/app/version-compare";
import { resolveCompareVersions } from "@/lib/report-versions";
import { AccessDenied } from "@/components/app/access-denied";

export const dynamic = "force-dynamic";

type Tab = "lancamentos" | "conciliacao" | "previstas";
const TABS: { key: Tab; label: string }[] = [
  { key: "lancamentos", label: "Lançamentos" },
  { key: "conciliacao", label: "Conciliação" },
  { key: "previstas", label: "Previstas" },
];

export default async function CaixaPage({
  searchParams,
}: {
  searchParams: Promise<{
    tab?: string;
    de?: string;
    ate?: string;
    vs?: string;
    proj?: string;
    project?: string;
  }>;
}) {
  // Só a empresa: a obra vem da URL desta tela, nunca de um "projeto ativo"
  // global (Prompt A). Sem obra na URL, a aba reabre a última ou pede a escolha.
  const ctx = await getTenantContext();
  if (!ctx) return null;
  // A página verifica "ver" antes de consultar qualquer dado (Prompt M, 2.2).
  // A guarda do layout não basta: ele renderiza em paralelo com a página e
  // não roda de novo na navegação dentro do app.
  if (!can(ctx.perms, "caixa", "ver")) return <AccessDenied />;

  const sp = await searchParams;
  const aiConfigured = isAiConfigured();
  const tab: Tab = TABS.some((t) => t.key === sp.tab) ? (sp.tab as Tab) : "lancamentos";
  const de = sp.de ?? "";
  const ate = sp.ate ?? "";

  const pickerProjetos = ctx.projects.map((p) => ({ id: p.id, label: p.name }));
  const selecao = lerSelecaoDeProjeto(ctx.projects, sp);
  const escolhido =
    selecao.tipo === "projeto" ? await getProjectVersions(ctx.tenant.id, selecao.projeto.id) : null;
  if (!escolhido || !escolhido.trabalho) {
    return (
      <>
        <PageHeader
          title="Controle de Caixa"
          actions={
            <ProjectPicker projects={pickerProjetos} selected={escolhido?.project.id ?? ""} />
          }
        />
        {escolhido ? (
          // Projeto sem nenhuma versão: nada a mostrar, e nada é gravado em
          // versão de outra obra (antes caía na obra do cookie).
          <Card>
            <CardContent className="p-8 text-center text-[var(--color-ink3)]">
              {escolhido.project.name} não possui versões. Crie a versão Atual em Versões.
            </CardContent>
          </Card>
        ) : (
          <RecuperarProjeto idsPermitidos={ctx.projects.map((p) => p.id)}>
            <Card>
              <CardContent className="p-8 text-center text-[var(--color-ink3)]">
                {ctx.projects.length === 0
                  ? "Nenhum projeto cadastrado. Cadastre a obra em Projetos."
                  : "Selecione um projeto para ver e lançar o caixa."}
              </CardContent>
            </Card>
          </RecuperarProjeto>
        )}
      </>
    );
  }
  const { project, versions: versoesDoProjeto, trabalho } = escolhido;
  const projectPicker = <ProjectPicker projects={pickerProjetos} selected={project.id} />;

  // Versões para comparar: só as DESTE projeto (um `vs` com versão de outra
  // obra, que sobrou na URL ao trocar de obra, é descartado).
  const compareVersions = resolveCompareVersions(sp.vs, versoesDoProjeto, trabalho);
  const multi = compareVersions.length > 1;
  const versionSelect = (
    <VersionMultiSelect
      versions={versoesDoProjeto.map((v) => ({ id: v.id, label: v.label, color: v.color }))}
      selected={compareVersions.map((v) => v.id)}
    />
  );

  // ─────────────────────── Modo comparação (2–3 versões) ───────────────────
  if (multi) {
    const perVersion = await Promise.all(
      compareVersions.map(async (v) => {
        const rows = await getCash(v.id);
        const filtered = de || ate ? rows.filter((c) => dateInRange(c.data, de, ate)) : rows;
        let entradas = 0;
        let saidas = 0;
        for (const c of filtered) {
          const val = Number(c.valor);
          if (val >= 0) entradas += val;
          else saidas += -val;
        }
        return { entradas, saidas };
      }),
    );
    const rows: CompareRow[] = [
      { label: "Entradas (caixa)", values: perVersion.map((p) => p.entradas) },
      { label: "(−) Saídas (caixa)", values: perVersion.map((p) => p.saidas) },
      {
        label: "= Saldo líquido do período",
        emphasis: "final",
        values: perVersion.map((p) => p.entradas - p.saidas),
      },
    ];
    return (
      <>
        <PageHeader
          title="Controle de Caixa"
          subtitle="Comparativo de versões · movimentação real de caixa no período"
          actions={
            <div className="flex flex-wrap items-end gap-3">
              {projectPicker}
              <DateRangeFilter de={de} ate={ate} />
              {versionSelect}
            </div>
          }
        />
        <LembrarProjeto projectId={project.id} />
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
  const [cashAll, contas, conciliacaoData] = await Promise.all([
    getCash(version.id),
    getBankAccounts(ctx.tenant.id),
    getConciliacaoData(ctx.tenant.id, version.id),
  ]);
  // Prompt L, 5.1 — permissão PRÓPRIA de desfazer, distinta de editar o caixa.
  const canDesfazerConc = can(ctx.perms, "conciliacao", "excluir");
  // Filtro de período (item 3): entradas/saídas dentro do intervalo.
  const cash = de || ate ? cashAll.filter((c) => dateInRange(c.data, de, ate)) : cashAll;

  // Exclui contas do tipo "Terceiros" e inativas: não são caixa da empresa.
  const saldoTotal = saldoDisponivel(contas);
  const conciliados = cash.filter((c) => c.rec).length;

  // Prompt L, Parte 1 — a cadeia de saldo: dois saldos por dia (em conta e
  // conciliado), encadeados, partindo do fechamento gravado do dia anterior
  // à janela ou do saldo em conta calculado. A faixa (2 realizados, hoje, 7
  // à frente) é independente do filtro de período da tabela (1.5) — e diz.
  const hoje = hojeISO();
  const fechamentos = (await getDailyClosings(ctx.tenant.id)).filter((f) => !f.projectId).map((f) => ({ dia: f.dia, saldoFinal: Number(f.saldoFinal) }));
  const movimentos = cashAll.map((c) => ({ id: c.id, data: c.data, valor: Number(c.valor), rec: c.rec, cat: c.cat, importado: !!c.importHash, bankAccountId: c.bankAccountId }));
  const cadeia = cadeiaDeSaldo({ movimentos, saldoEmContaAtual: saldoTotal, fechamentos, hojeISO: hoje });
  const hojeNaCadeia = cadeia.dias.find((d) => d.dia === hoje);
  const contasDaEmpresa = contas.filter((c) => isContaDaEmpresa(c));
  const saldosPorConta = contasDaEmpresa.map((c) => {
    const propria = cadeiaDeSaldo({ movimentos: movimentos.filter((m) => m.bankAccountId === c.id), saldoEmContaAtual: Number(c.saldo), fechamentos: [], hojeISO: hoje });
    const atualizadoEm = c.lastSync ? c.lastSync.toISOString() : null;
    return {
      id: c.id,
      nome: `${c.banco}${c.cc ? " · " + c.cc : ""}`,
      emConta: Number(c.saldo),
      conciliado: propria.dias.find((d) => d.dia === hoje)?.conciliado.final ?? Number(c.saldo),
      origem: (c.saldoSource === "auto" ? "auto" : "manual") as "auto" | "manual",
      atualizadoEm,
      diasDesde: diasDesdeAtualizacao(atualizadoEm, hoje),
      conectada: !!c.openFinanceId,
    };
  });

  // Resumo do dia (hoje): entradas, saídas e saldo do dia.
  const movHoje = hojeNaCadeia ?? { entradas: 0, saidas: 0 };
  const saldoHoje = movHoje.entradas - movHoje.saidas;

  return (
    <>
      <PageHeader
        title="Controle de Caixa"
        subtitle="Lançamentos reais + conciliação · role a faixa para ver até uma semana à frente"
        actions={
          <div className="flex flex-wrap items-end gap-3">
            {projectPicker}
            <DateRangeFilter de={de} ate={ate} />
            {versionSelect}
          </div>
        }
      />
      <LembrarProjeto projectId={project.id} />

      {/* Resumo do dia (hoje) */}
      <div className="mb-6 grid grid-cols-1 gap-3 sm:grid-cols-3">
        <Card>
          <CardContent className="p-4">
            <p className="font-[family-name:var(--font-mono)] text-[10px] uppercase tracking-wide text-[var(--color-ink3)]">
              Entradas do dia
            </p>
            <p className="mt-1 text-xl font-semibold text-[var(--color-success)]">
              {brl0(movHoje.entradas)}
            </p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <p className="font-[family-name:var(--font-mono)] text-[10px] uppercase tracking-wide text-[var(--color-ink3)]">
              Saídas do dia
            </p>
            <p className="mt-1 text-xl font-semibold text-[var(--color-danger)]">
              {brl0(movHoje.saidas)}
            </p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <p className="font-[family-name:var(--font-mono)] text-[10px] uppercase tracking-wide text-[var(--color-ink3)]">
              Saldo do dia
            </p>
            <p
              className={`mt-1 text-xl font-semibold ${
                saldoHoje < 0 ? "text-[var(--color-danger)]" : "text-[var(--color-accent)]"
              }`}
            >
              {brl0(saldoHoje)}
            </p>
          </CardContent>
        </Card>
      </div>

      {/* Prompt L, 1.0/1.2 — os dois saldos por conta e no total; importar e Open Finance no topo. */}
      <SaldosCaixa
        contas={saldosPorConta}
        total={{ emConta: saldoTotal, conciliado: hojeNaCadeia?.conciliado.final ?? saldoTotal }}
        importar={
          <ImportExtratoButton
            contas={contas.map((c) => ({ id: c.id, banco: c.banco, cc: c.cc }))}
            aiConfigured={aiConfigured}
            projetos={ctx.projects.map((p) => ({ id: p.id, nome: p.name }))}
            projectId={project.id}
          />
        }
        openFinance={{ configurado: pluggyCfg(), podeConfigurar: can(ctx.perms, "contas", "editar") }}
      />

      {/* Prompt L, 1.4-A — cadeia de saldo com inicial e final, em conta e conciliado. */}
      <CadeiaDias cadeia={cadeia} />

      {/* Abas */}
      <div className="mb-5 flex gap-1 rounded-[8px] bg-[var(--color-surface3)] p-1">
        {TABS.map((t) => (
          <Link
            key={t.key}
            // A obra (?proj=) sobrevive à troca de aba.
            href={`/caixa?tab=${t.key}&proj=${project.id}`}
            className={`rounded-[6px] px-3 py-1.5 text-xs transition-colors ${
              t.key === tab
                ? "bg-white text-[var(--color-ink)] shadow-sm"
                : "text-[var(--color-ink3)] hover:text-[var(--color-ink)]"
            }`}
          >
            {t.label}
          </Link>
        ))}
      </div>

      {tab === "lancamentos" && (
        <Lancamentos cash={cash} contas={contas} projectId={project.id} />
      )}
      {tab === "conciliacao" && (
        <Conciliacao
          cash={cash}
          conciliados={conciliados}
          conciliacaoData={conciliacaoData}
          canDesfazer={canDesfazerConc}
        />
      )}
      {tab === "previstas" && <Previstas tenantId={version.tenantId} versionId={version.id} projectId={project.id} />}
    </>
  );
}

function Lancamentos({
  cash,
  contas,
  projectId,
}: {
  cash: Awaited<ReturnType<typeof getCash>>;
  contas: Awaited<ReturnType<typeof getBankAccounts>>;
  /** obra da tela: os lançamentos vão para a versão de trabalho dela. */
  projectId: string;
}) {
  return (
    <>
      {/* Importar extrato subiu para o topo da tela (Prompt L, 1.0.3). */}
      <CaixaEntryForm
        contas={contas.map((c) => ({ id: c.id, banco: c.banco, cc: c.cc }))}
        projectId={projectId}
      />
      <CashTable cash={cash} withToggle={false} />
    </>
  );
}

function Conciliacao({
  cash,
  conciliados,
  conciliacaoData,
  canDesfazer,
}: {
  cash: Awaited<ReturnType<typeof getCash>>;
  conciliados: number;
  conciliacaoData: ConciliacaoData;
  canDesfazer: boolean;
}) {
  return (
    <>
      <div className="mb-3 flex flex-wrap gap-2">
        <Badge tone="success">{conciliados} conciliados</Badge>
        <Badge tone="warning">{cash.length - conciliados} pendentes</Badge>
        {conciliacaoData.pendentes.length > 0 && (
          <Badge tone="danger">{conciliacaoData.pendentes.length} saídas a conciliar</Badge>
        )}
      </div>

      {/* Revisão com sugestões (grau de compatibilidade) + desfazer/auditoria. */}
      <ConciliacaoReview
        pendentes={conciliacaoData.pendentes}
        pendentesEntrada={conciliacaoData.pendentesEntrada}
        conciliados={conciliacaoData.conciliados}
        canDesfazer={canDesfazer}
      />

      <div className="mt-6">
        <h3 className="mb-2 text-sm font-semibold text-[var(--color-ink)]">
          Todos os lançamentos de caixa
        </h3>
        <CashTable cash={cash} withToggle />
      </div>
    </>
  );
}

async function Previstas({
  tenantId,
  versionId,
  projectId,
}: {
  tenantId: string;
  versionId: string;
  projectId: string;
}) {
  const [unitRows, reembRows, incc, permutas] = await Promise.all([
    getUnits(tenantId, versionId),
    getReembolsos(tenantId, versionId),
    getInccRows(tenantId, projectId),
    getPermutas(tenantId, versionId),
  ]);
  const monthly: MonthlyProjection = {};
  for (const r of unitRows) {
    const p = calcProjection(toCalcUnit(r), incc);
    for (const [mm, v] of Object.entries(p)) monthly[mm] = (monthly[mm] || 0) + v;
  }
  const reemb = reembursementsByMonth(reembToCalc(reembRows));
  const permCash = permutaCashByMonth(permToResale(permutas));
  const all = new Set([
    ...Object.keys(monthly),
    ...Object.keys(reemb),
    ...Object.keys(permCash),
  ]);
  const now = new Date();
  const cur = now.getFullYear() * 12 + now.getMonth();
  const rows = [...all]
    .map((mm) => {
      const [m, y] = mm.split("/").map(Number);
      return {
        mm,
        ord: y * 12 + (m - 1),
        total: (monthly[mm] || 0) + (reemb[mm] || 0) + (permCash[mm] || 0),
      };
    })
    .filter((r) => r.total > 0 && r.ord >= cur)
    .sort((a, b) => a.ord - b.ord)
    .slice(0, 12);

  return (
    <Table>
      <THead>
        <tr>
          <TH>Mês</TH>
          <TH className="text-right">Entradas previstas</TH>
        </tr>
      </THead>
      <tbody>
        {rows.map((r) => (
          <TR key={r.mm}>
            <TD className="font-[family-name:var(--font-mono)] font-medium text-[var(--color-ink)]">
              {r.mm}
            </TD>
            <TD className="text-right font-[family-name:var(--font-mono)] text-[var(--color-success)]">
              {brl0(r.total)}
            </TD>
          </TR>
        ))}
        {rows.length === 0 && (
          <TR>
            <TD colSpan={2} className="py-6 text-center text-[var(--color-ink3)]">
              Sem entradas previstas a partir deste mês.
            </TD>
          </TR>
        )}
      </tbody>
    </Table>
  );
}

const CAT_LABEL: Record<string, string> = {
  ajuste: "Ajuste de caixa",
  despesa_extrato: "Despesa (extrato)",
  receita_extrato: "Receita (extrato)",
  extrato: "Extrato",
};
const catLabel = (c: string | null) => (c ? CAT_LABEL[c] ?? c : "—");

function CashTable({
  cash,
  withToggle,
}: {
  cash: Awaited<ReturnType<typeof getCash>>;
  withToggle: boolean;
}) {
  return (
    <Table>
      <THead>
        <tr>
          <TH>Data</TH>
          <TH>Descrição</TH>
          <TH>Categoria</TH>
          <TH className="text-right">Valor</TH>
          <TH>Conciliação</TH>
        </tr>
      </THead>
      <tbody>
        {cash.map((c) => {
          const v = Number(c.valor);
          return (
          <TR key={c.id}>
            <TD className="font-[family-name:var(--font-mono)]">{dateBR(c.data)}</TD>
            <TD>{c.descricao ?? "—"}</TD>
            <TD>
              <Badge tone={c.cat === "ajuste" ? "info" : "neutral"}>{catLabel(c.cat)}</Badge>
            </TD>
            <TD
              className={`text-right font-[family-name:var(--font-mono)] ${
                v < 0 ? "text-[var(--color-danger)]" : "text-[var(--color-success)]"
              }`}
            >
              {brl0(v)}
            </TD>
            <TD>
              {withToggle ? (
                <div className="flex items-center gap-2">
                  <ConciliarToggle id={c.id} rec={c.rec} />
                  {!c.rec && c.cat === "extrato" && (
                    <Badge tone="danger">divergência</Badge>
                  )}
                  {/* BL-2 / 6.6 — `rec` sem vínculo é estado próprio, não "conciliado". */}
                  {c.rec && c.cat !== "ajuste" && !c.conciliadoDespesaId && !c.conciliadoContaReceberId && (
                    <Badge tone="warning" title="Marcado como conciliado sem registro de com o quê casou. Veja a lista de conferência na Conciliação.">sem vínculo</Badge>
                  )}
                </div>
              ) : (
                <Badge tone={c.rec ? "success" : "warning"}>
                  {c.rec ? "conciliado" : "pendente"}
                </Badge>
              )}
            </TD>
          </TR>
          );
        })}
        {cash.length === 0 && (
          <TR>
            <TD colSpan={5} className="py-6 text-center text-[var(--color-ink3)]">
              Nenhum lançamento de caixa nesta versão.
            </TD>
          </TR>
        )}
      </tbody>
    </Table>
  );
}
