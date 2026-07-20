import Link from "next/link";
import { getActiveContext } from "@/lib/context";
import {
  getBankAccounts,
  getCash,
  getInccRows,
  getPermutas,
  getReembolsos,
  getUnits,
  permToResale,
  reembToCalc,
  toCalcUnit,
} from "@/lib/queries";
import {
  calcProjection,
  permutaCashByMonth,
  reembursementsByMonth,
  type MonthlyProjection,
} from "@/lib/calc";
import { isPluggyConfigured as pluggyCfg } from "@/lib/openfinance/pluggy";
import { isAiConfigured } from "@/lib/ai/despesa-extract";
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

export const dynamic = "force-dynamic";

const DOW = ["Dom", "Seg", "Ter", "Qua", "Qui", "Sex", "Sáb"];

type Tab = "lancamentos" | "conciliacao" | "previstas";
const TABS: { key: Tab; label: string }[] = [
  { key: "lancamentos", label: "Lançamentos" },
  { key: "conciliacao", label: "Conciliação" },
  { key: "previstas", label: "Previstas" },
];

const parseData = (d: string | null): Date | null => {
  if (!d) return null;
  const p = d.split("/");
  if (p.length !== 3) return null;
  const dt = new Date(Number(p[2]), Number(p[0]) - 1, Number(p[1]));
  return isNaN(dt.getTime()) ? null : dt;
};

export default async function CaixaPage({
  searchParams,
}: {
  searchParams: Promise<{ tab?: string; de?: string; ate?: string; vs?: string }>;
}) {
  const ctx = await getActiveContext();
  if (!ctx) return null;

  const sp = await searchParams;
  const aiConfigured = isAiConfigured();
  const tab: Tab = TABS.some((t) => t.key === sp.tab) ? (sp.tab as Tab) : "lancamentos";
  const de = sp.de ?? "";
  const ate = sp.ate ?? "";

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
  const [cashAll, contas] = await Promise.all([
    getCash(version.id),
    getBankAccounts(ctx.tenant.id),
  ]);
  // Filtro de período (item 3): entradas/saídas dentro do intervalo.
  const cash = de || ate ? cashAll.filter((c) => dateInRange(c.data, de, ate)) : cashAll;

  const saldoTotal = contas.reduce((a, c) => a + Number(c.saldo), 0);
  const conciliados = cash.filter((c) => c.rec).length;

  // Janela de caixa: 2 dias realizados, hoje e 7 de projeção (uma semana à
  // frente). A faixa rola horizontalmente para visualizar os dias futuros.
  const DIAS_PASSADOS = 2;
  const DIAS_FUTUROS = 7;
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const cashByDay = new Map<number, { entradas: number; saidas: number }>();
  for (const c of cashAll) {
    const dt = parseData(c.data);
    if (!dt) continue;
    dt.setHours(0, 0, 0, 0);
    const key = dt.getTime();
    const cur = cashByDay.get(key) ?? { entradas: 0, saidas: 0 };
    const v = Number(c.valor);
    if (v >= 0) cur.entradas += v;
    else cur.saidas += -v;
    cashByDay.set(key, cur);
  }
  let acumulado = saldoTotal;
  const dias = Array.from({ length: DIAS_PASSADOS + 1 + DIAS_FUTUROS }, (_, i) => {
    const d = new Date(today);
    d.setDate(d.getDate() - DIAS_PASSADOS + i);
    const mov = cashByDay.get(d.getTime()) ?? { entradas: 0, saidas: 0 };
    const saldoDia = mov.entradas - mov.saidas;
    acumulado += saldoDia;
    const rel = d < today ? "Realizado" : d.getTime() === today.getTime() ? "Hoje" : "Projeção";
    return { d, ...mov, saldoDia, acumulado, rel };
  });

  // Resumo do dia (hoje): entradas, saídas e saldo do dia.
  const movHoje = cashByDay.get(today.getTime()) ?? { entradas: 0, saidas: 0 };
  const saldoHoje = movHoje.entradas - movHoje.saidas;

  return (
    <>
      <PageHeader
        title="Controle de Caixa"
        subtitle="Lançamentos reais + conciliação · role a faixa para ver até uma semana à frente"
        actions={
          <div className="flex flex-wrap items-end gap-3">
            <DateRangeFilter de={de} ate={ate} />
            <Badge tone={pluggyCfg() ? "success" : "neutral"}>
              Open Finance {pluggyCfg() ? "ativo" : "não configurado"}
            </Badge>
            {versionSelect}
          </div>
        }
      />

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

      {/* Saldo das contas correntes */}
      <Card className="mb-6">
        <CardContent className="p-5">
          <div className="mb-3 flex items-center justify-between">
            <h2 className="text-sm font-semibold text-[var(--color-ink)]">
              Saldo das contas correntes
            </h2>
            <Link
              href="/contas"
              className="text-[11px] text-[var(--color-accent2)] hover:underline"
            >
              gerenciar contas
            </Link>
          </div>
          <div className="flex flex-wrap gap-3">
            {contas.map((c) => (
              <div
                key={c.id}
                className="rounded-[10px] border border-[var(--color-accent2)]/12 bg-[var(--color-surface2)] px-4 py-2.5"
              >
                <div className="text-[11px] text-[var(--color-ink3)]">
                  {c.banco} · {c.cc || "—"}{" "}
                  <span className="text-[var(--color-ink4)]">
                    ({c.saldoSource === "auto" ? "auto" : "manual"})
                  </span>
                </div>
                <div className="font-[family-name:var(--font-mono)] text-lg font-semibold text-[var(--color-ink)]">
                  {brl0(Number(c.saldo))}
                </div>
              </div>
            ))}
            <div className="ml-auto rounded-[10px] bg-[var(--color-accent)] px-4 py-2.5 text-white">
              <div className="text-[11px] opacity-80">Saldo total</div>
              <div className="font-[family-name:var(--font-mono)] text-lg font-semibold">
                {brl0(saldoTotal)}
              </div>
            </div>
          </div>
          {contas.length === 0 && (
            <p className="text-[13px] text-[var(--color-ink4)]">
              Nenhuma conta cadastrada — cadastre em{" "}
              <Link href="/contas" className="text-[var(--color-accent2)] hover:underline">
                Contas Correntes
              </Link>
              .
            </p>
          )}
        </CardContent>
      </Card>

      {/* Janela de caixa — role para a direita para ver a semana à frente */}
      <div className="mb-6 -mx-1 overflow-x-auto pb-1">
        <div className="flex gap-3 px-1">
        {dias.map((x, i) => (
          <Card
            key={i}
            className={`w-40 shrink-0 ${
              x.rel === "Hoje" ? "ring-2 ring-[var(--color-accent2)]" : ""
            }`}
          >
            <CardContent className="p-4">
              <div
                className={`font-[family-name:var(--font-mono)] text-[9px] uppercase tracking-wide ${
                  x.rel === "Realizado"
                    ? "text-[var(--color-ink4)]"
                    : x.rel === "Hoje"
                      ? "text-[var(--color-accent)]"
                      : "text-[var(--color-warning)]"
                }`}
              >
                {x.rel}
              </div>
              <div className="text-sm font-semibold text-[var(--color-ink)]">
                {DOW[x.d.getDay()]}
              </div>
              <div className="font-[family-name:var(--font-mono)] text-[11px] text-[var(--color-ink3)]">
                {String(x.d.getDate()).padStart(2, "0")}/{String(x.d.getMonth() + 1).padStart(2, "0")}
              </div>
              <div className="mt-2 text-[11px] text-[var(--color-success)]">
                ↓ Entradas {x.entradas > 0 ? brl0(x.entradas) : "—"}
              </div>
              <div className="text-[11px] text-[var(--color-danger)]">
                ↑ Saídas {x.saidas > 0 ? brl0(x.saidas) : "—"}
              </div>
              <div className="mt-2 border-t border-[var(--color-accent2)]/8 pt-1.5 text-[10px] text-[var(--color-ink3)]">
                Saldo do dia
              </div>
              <div className="font-[family-name:var(--font-mono)] text-sm font-semibold text-[var(--color-ink)]">
                {brl0(x.saldoDia)}
              </div>
              <div className="mt-1 text-[10px] text-[var(--color-ink3)]">Saldo acumulado</div>
              <div className="font-[family-name:var(--font-mono)] text-[12px] text-[var(--color-ink2)]">
                {brl0(x.acumulado)}
              </div>
            </CardContent>
          </Card>
        ))}
        </div>
      </div>

      {/* Abas */}
      <div className="mb-5 flex gap-1 rounded-[8px] bg-[var(--color-surface3)] p-1">
        {TABS.map((t) => (
          <Link
            key={t.key}
            href={`/caixa?tab=${t.key}`}
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

      {tab === "lancamentos" && <Lancamentos cash={cash} contas={contas} aiConfigured={aiConfigured} />}
      {tab === "conciliacao" && <Conciliacao cash={cash} conciliados={conciliados} />}
      {tab === "previstas" && <Previstas versionId={version.id} projectId={ctx.project.id} />}
    </>
  );
}

function Lancamentos({
  cash,
  contas,
  aiConfigured,
}: {
  cash: Awaited<ReturnType<typeof getCash>>;
  contas: Awaited<ReturnType<typeof getBankAccounts>>;
  aiConfigured: boolean;
}) {
  return (
    <>
      <div className="mb-4">
        <ImportExtratoButton
          contas={contas.map((c) => ({ id: c.id, banco: c.banco, cc: c.cc }))}
          aiConfigured={aiConfigured}
        />
      </div>
      <CaixaEntryForm
        contas={contas.map((c) => ({ id: c.id, banco: c.banco, cc: c.cc }))}
      />
      <CashTable cash={cash} withToggle={false} />
    </>
  );
}

function Conciliacao({
  cash,
  conciliados,
}: {
  cash: Awaited<ReturnType<typeof getCash>>;
  conciliados: number;
}) {
  // Divergências: movimentos importados do extrato que não casaram
  // automaticamente com contas a pagar/receber (ficam pendentes).
  const divergencias = cash.filter((c) => !c.rec && c.cat === "extrato").length;
  return (
    <>
      <div className="mb-3 flex flex-wrap gap-2">
        <Badge tone="success">{conciliados} conciliados</Badge>
        <Badge tone="warning">{cash.length - conciliados} pendentes</Badge>
        {divergencias > 0 && (
          <Badge tone="danger">{divergencias} divergências do extrato</Badge>
        )}
      </div>
      {divergencias > 0 && (
        <p className="mb-3 text-[12px] text-[var(--color-ink3)]">
          Divergências são lançamentos do extrato importado sem correspondência
          automática nos módulos de Despesas/Receitas — concilie manualmente
          marcando a caixa ao lado.
        </p>
      )}
      <CashTable cash={cash} withToggle />
    </>
  );
}

async function Previstas({
  versionId,
  projectId,
}: {
  versionId: string;
  projectId: string;
}) {
  const [unitRows, reembRows, incc, permutas] = await Promise.all([
    getUnits(versionId),
    getReembolsos(versionId),
    getInccRows(projectId),
    getPermutas(versionId),
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
