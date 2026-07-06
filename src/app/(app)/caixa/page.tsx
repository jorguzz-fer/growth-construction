import Link from "next/link";
import { getActiveContext } from "@/lib/context";
import {
  getBankAccounts,
  getCash,
  getInccRows,
  getReembolsos,
  getUnits,
  reembToCalc,
  toCalcUnit,
} from "@/lib/queries";
import {
  calcProjection,
  reembursementsByMonth,
  type MonthlyProjection,
} from "@/lib/calc";
import { isPluggyConfigured as pluggyCfg } from "@/lib/openfinance/pluggy";
import { brl0, dateBR } from "@/lib/utils";
import { PageHeader } from "@/components/app/page-header";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Table, THead, TH, TR, TD } from "@/components/ui/table";
import { ConciliarToggle } from "@/components/app/conciliar-toggle";
import { ImportExtratoButton } from "@/components/app/import-extrato";
import { CaixaEntryForm } from "@/components/app/caixa-entry-form";

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
  searchParams: Promise<{ tab?: string }>;
}) {
  const ctx = await getActiveContext();
  if (!ctx) return null;

  const sp = await searchParams;
  const tab: Tab = TABS.some((t) => t.key === sp.tab) ? (sp.tab as Tab) : "lancamentos";

  const [cash, contas] = await Promise.all([
    getCash(ctx.version.id),
    getBankAccounts(ctx.tenant.id),
  ]);

  const saldoTotal = contas.reduce((a, c) => a + Number(c.saldo), 0);
  const conciliados = cash.filter((c) => c.rec).length;

  // Janela móvel de 7 dias: 2 dias realizados, hoje, 4 de projeção.
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const cashByDay = new Map<number, { entradas: number; saidas: number }>();
  for (const c of cash) {
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
  const dias = Array.from({ length: 7 }, (_, i) => {
    const d = new Date(today);
    d.setDate(d.getDate() - 2 + i);
    const mov = cashByDay.get(d.getTime()) ?? { entradas: 0, saidas: 0 };
    const saldoDia = mov.entradas - mov.saidas;
    acumulado += saldoDia;
    const rel = d < today ? "Realizado" : d.getTime() === today.getTime() ? "Hoje" : "Projeção";
    return { d, ...mov, saldoDia, acumulado, rel };
  });

  return (
    <>
      <PageHeader
        title="Controle de Caixa"
        subtitle="Lançamentos reais + conciliação · janela móvel de 7 dias"
        actions={
          <Badge tone={pluggyCfg() ? "success" : "neutral"}>
            Open Finance {pluggyCfg() ? "ativo" : "não configurado"}
          </Badge>
        }
      />

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

      {/* Janela de 7 dias */}
      <div className="mb-6 grid grid-cols-2 gap-3 sm:grid-cols-4 lg:grid-cols-7">
        {dias.map((x, i) => (
          <Card
            key={i}
            className={x.rel === "Hoje" ? "ring-2 ring-[var(--color-accent2)]" : undefined}
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

      {tab === "lancamentos" && <Lancamentos cash={cash} contas={contas} />}
      {tab === "conciliacao" && <Conciliacao cash={cash} conciliados={conciliados} />}
      {tab === "previstas" && <Previstas ctx={ctx} />}
    </>
  );
}

function Lancamentos({
  cash,
  contas,
}: {
  cash: Awaited<ReturnType<typeof getCash>>;
  contas: Awaited<ReturnType<typeof getBankAccounts>>;
}) {
  return (
    <>
      <div className="mb-4">
        <ImportExtratoButton
          contas={contas.map((c) => ({ id: c.id, banco: c.banco, cc: c.cc }))}
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
  return (
    <>
      <div className="mb-3 flex gap-2">
        <Badge tone="success">{conciliados} conciliados</Badge>
        <Badge tone="warning">{cash.length - conciliados} pendentes</Badge>
      </div>
      <CashTable cash={cash} withToggle />
    </>
  );
}

async function Previstas({
  ctx,
}: {
  ctx: NonNullable<Awaited<ReturnType<typeof getActiveContext>>>;
}) {
  const [unitRows, reembRows, incc] = await Promise.all([
    getUnits(ctx.version.id),
    getReembolsos(ctx.version.id),
    getInccRows(ctx.project.id),
  ]);
  const monthly: MonthlyProjection = {};
  for (const r of unitRows) {
    const p = calcProjection(toCalcUnit(r), incc);
    for (const [mm, v] of Object.entries(p)) monthly[mm] = (monthly[mm] || 0) + v;
  }
  const reemb = reembursementsByMonth(reembToCalc(reembRows));
  const all = new Set([...Object.keys(monthly), ...Object.keys(reemb)]);
  const now = new Date();
  const cur = now.getFullYear() * 12 + now.getMonth();
  const rows = [...all]
    .map((mm) => {
      const [m, y] = mm.split("/").map(Number);
      return { mm, ord: y * 12 + (m - 1), total: (monthly[mm] || 0) + (reemb[mm] || 0) };
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
                <ConciliarToggle id={c.id} rec={c.rec} />
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
