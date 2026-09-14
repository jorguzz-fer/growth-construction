# TELA-caixa — código na íntegra

Coleta do código da tela **Controle de Caixa** (`/caixa`), em `main`
(commit `45f4ce3`). Sem resumo, sem análise.

**Árvore de dependências própria (recursiva):**

```
caixa/page.tsx
├── components/app/page-header.tsx
├── components/app/date-range-filter.tsx
├── components/app/version-multiselect.tsx
├── components/app/version-compare.tsx        (VersionCompareTable)
├── components/app/caixa-entry-form.tsx       — aba Lançamentos
├── components/app/import-extrato.tsx         — importador de extrato
├── components/app/conciliacao-review.tsx     — aba Conciliação
└── components/app/conciliar-toggle.tsx       — aba Conciliação

As abas NÃO são componentes separados: `Lancamentos`, `Conciliacao`,
`Previstas` e `CashTable` são funções dentro do próprio `page.tsx`
(linhas 372–580). Os componentes acima são o que elas montam.

Nenhum dos componentes importa outro componente próprio. As demais
importações são primitivas de UI (card, button, input, date-field, badge,
table), `utils`, e a lib externa `xlsx` (no importador).

queries chamadas:  getCash · getBankAccounts · getConciliacaoData
                   getUnits · getReembolsos · getInccRows · getPermutas
                   + helpers toCalcUnit, reembToCalc, permToResale
actions de caixa:  extractExtratoPdf, addCash, importCash, toggleConciliado,
                   conciliarDespesa, desfazerConciliacao,
                   conciliarContaReceber, criarContaFromExtrato,
                   matchCandidatosMovimento, pairMovimento,
                   criarLancamentoDoExtrato   — 11, todas em actions/caixa.ts
```

> **A página não verifica permissão de "ver".** Só usa `can` para
> `canDesfazerConc` (`page.tsx:138`). Quem a governa é o enforcement central
> do layout, já que `caixa` está em `SCREENS`.

---

## 1. Página

### `src/app/(app)/caixa/page.tsx`

```tsx
import Link from "next/link";
import { getActiveContext } from "@/lib/context";
import { saldoDisponivel } from "@/lib/contas-saldo";
import {
  getBankAccounts,
  getCash,
  getConciliacaoData,
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
  const [cashAll, contas, conciliacaoData] = await Promise.all([
    getCash(version.id),
    getBankAccounts(ctx.tenant.id),
    getConciliacaoData(ctx.tenant.id, version.id),
  ]);
  const canDesfazerConc = can(ctx.perms, "caixa", "excluir");
  // Filtro de período (item 3): entradas/saídas dentro do intervalo.
  const cash = de || ate ? cashAll.filter((c) => dateInRange(c.data, de, ate)) : cashAll;

  // Exclui contas do tipo "Terceiros": são obrigações com sócios/terceiros,
  // não dinheiro disponível da empresa.
  const saldoTotal = saldoDisponivel(contas);
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

      {tab === "lancamentos" && (
        <Lancamentos
          cash={cash}
          contas={contas}
          aiConfigured={aiConfigured}
          projetos={ctx.projects.map((p) => ({ id: p.id, nome: p.name }))}
        />
      )}
      {tab === "conciliacao" && (
        <Conciliacao
          cash={cash}
          conciliados={conciliados}
          conciliacaoData={conciliacaoData}
          canDesfazer={canDesfazerConc}
        />
      )}
      {tab === "previstas" && <Previstas versionId={version.id} projectId={ctx.project.id} />}
    </>
  );
}

function Lancamentos({
  cash,
  contas,
  aiConfigured,
  projetos,
}: {
  cash: Awaited<ReturnType<typeof getCash>>;
  contas: Awaited<ReturnType<typeof getBankAccounts>>;
  aiConfigured: boolean;
  projetos: { id: string; nome: string }[];
}) {
  return (
    <>
      <div className="mb-4">
        <ImportExtratoButton
          contas={contas.map((c) => ({ id: c.id, banco: c.banco, cc: c.cc }))}
          aiConfigured={aiConfigured}
          projetos={projetos}
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
```

---

## 2. Componentes próprios (recursivo)

### `src/components/app/page-header.tsx`

```tsx
import * as React from "react";

export function PageHeader({
  title,
  actions,
}: {
  /** Mantidos por compatibilidade; ocultados por ora para um visual mais clean. */
  eyebrow?: string;
  title: string;
  subtitle?: string;
  actions?: React.ReactNode;
}) {
  return (
    <header className="mb-6 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between sm:gap-4">
      <h1 className="font-[family-name:var(--font-serif)] text-2xl text-[var(--color-ink)]">
        {title}
      </h1>
      {actions && <div className="flex shrink-0 items-center gap-2">{actions}</div>}
    </header>
  );
}
```

### `src/components/app/date-range-filter.tsx`

```tsx
"use client";

import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useState, useTransition } from "react";
import { DateField } from "@/components/ui/date-field";
import { Button } from "@/components/ui/button";
import { dateBR } from "@/lib/utils";

/**
 * Filtro de período (Data inicial / Data final) padrão para todos os reports
 * (exceto DRE). Persiste em `de`/`ate` na URL (formato interno MM/DD/YYYY),
 * preservando os demais parâmetros da tela.
 *
 * O período escolhido NÃO é aplicado automaticamente: o usuário ajusta as datas
 * e confirma numa janela ("Confirmar período"); só após a confirmação o
 * dashboard é recarregado com o intervalo selecionado.
 */
export function DateRangeFilter({ de, ate }: { de: string; ate: string }) {
  const router = useRouter();
  const pathname = usePathname();
  const sp = useSearchParams();
  const [pending, start] = useTransition();

  // Rascunho local: só vira filtro aplicado após confirmação.
  const [localDe, setLocalDe] = useState(de);
  const [localAte, setLocalAte] = useState(ate);
  const [confirming, setConfirming] = useState(false);

  const dirty = localDe !== de || localAte !== ate;

  const apply = (nd: string, na: string) => {
    const params = new URLSearchParams(sp.toString());
    if (nd) params.set("de", nd);
    else params.delete("de");
    if (na) params.set("ate", na);
    else params.delete("ate");
    start(() => router.push(`${pathname}?${params.toString()}`));
  };

  const confirmar = () => {
    setConfirming(false);
    apply(localDe, localAte);
  };

  const limpar = () => {
    setLocalDe("");
    setLocalAte("");
    apply("", "");
  };

  return (
    <div className="flex flex-wrap items-end gap-2">
      <div>
        <label className="mb-1 block font-[family-name:var(--font-mono)] text-[10px] uppercase tracking-wide text-[var(--color-ink3)]">
          Data inicial
        </label>
        <DateField value={localDe} onChange={setLocalDe} className="h-9 w-40" />
      </div>
      <div>
        <label className="mb-1 block font-[family-name:var(--font-mono)] text-[10px] uppercase tracking-wide text-[var(--color-ink3)]">
          Data final
        </label>
        <DateField value={localAte} onChange={setLocalAte} className="h-9 w-40" />
      </div>

      <Button
        size="sm"
        disabled={pending || !dirty}
        onClick={() => setConfirming(true)}
      >
        Confirmar período
      </Button>

      {(de || ate || localDe || localAte) && (
        <Button variant="ghost" size="sm" disabled={pending} onClick={limpar}>
          Limpar período
        </Button>
      )}

      {confirming && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4"
          role="dialog"
          aria-modal="true"
          onClick={() => setConfirming(false)}
        >
          <div
            className="w-full max-w-sm rounded-[12px] bg-white p-5 shadow-xl"
            onClick={(e) => e.stopPropagation()}
          >
            <h3 className="text-sm font-semibold text-[var(--color-ink)]">
              Confirmar período
            </h3>
            <p className="mt-2 text-[13px] text-[var(--color-ink2)]">
              O dashboard será atualizado com o intervalo:
            </p>
            <p className="mt-2 font-[family-name:var(--font-mono)] text-[13px] text-[var(--color-ink)]">
              {localDe ? dateBR(localDe) : "início"} — {localAte ? dateBR(localAte) : "fim"}
            </p>
            <div className="mt-5 flex justify-end gap-2">
              <Button variant="ghost" size="sm" onClick={() => setConfirming(false)}>
                Cancelar
              </Button>
              <Button size="sm" disabled={pending} onClick={confirmar}>
                Confirmar
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
```

### `src/components/app/version-multiselect.tsx`

```tsx
"use client";

import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useTransition } from "react";

export interface VersionOpt {
  id: string;
  label: string;
  color: string;
}

/**
 * Seletor de 1 a 3 versões para comparação nos relatórios. Persiste em `vs`
 * (ids separados por vírgula) na URL, preservando os demais parâmetros.
 */
export function VersionMultiSelect({
  versions,
  selected,
  max = 3,
}: {
  versions: VersionOpt[];
  selected: string[];
  max?: number;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const sp = useSearchParams();
  const [pending, start] = useTransition();

  const toggle = (id: string) => {
    let next: string[];
    if (selected.includes(id)) {
      next = selected.filter((x) => x !== id);
      if (next.length === 0) next = [id]; // mantém pelo menos uma
    } else {
      next = selected.length >= max ? [...selected.slice(1), id] : [...selected, id];
    }
    const params = new URLSearchParams(sp.toString());
    params.set("vs", next.join(","));
    start(() => router.push(`${pathname}?${params.toString()}`));
  };

  return (
    <div className="flex flex-wrap items-center gap-1.5">
      <span className="font-[family-name:var(--font-mono)] text-[10px] uppercase tracking-wide text-[var(--color-ink3)]">
        Versões
      </span>
      {versions.map((v) => {
        const on = selected.includes(v.id);
        return (
          <button
            key={v.id}
            disabled={pending}
            onClick={() => toggle(v.id)}
            className={`flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-[12px] transition-colors ${
              on
                ? "border-[var(--color-accent2)] bg-[var(--color-accent4)] text-[var(--color-ink)]"
                : "border-[var(--color-accent2)]/20 text-[var(--color-ink3)] hover:bg-[var(--color-surface2)]"
            }`}
          >
            <span className="inline-block h-2.5 w-2.5 rounded-full" style={{ background: v.color }} />
            {v.label}
          </button>
        );
      })}
      <span className="text-[11px] text-[var(--color-ink4)]">(até {max})</span>
    </div>
  );
}
```

### `src/components/app/version-compare.tsx`

```tsx
import { brl0 } from "@/lib/utils";
import { Card, CardContent } from "@/components/ui/card";
import { Table, THead, TH, TR, TD } from "@/components/ui/table";

export interface CompareColumn {
  label: string;
  color?: string;
}

export interface CompareRow {
  label: string;
  values: number[];
  /** ênfase visual: linha de subtotal ou total final. */
  emphasis?: "sub" | "final";
}

/**
 * Tabela de comparação de 1–3 versões: primeira coluna = linhas do relatório
 * (fontes/categorias/indicadores), demais colunas = uma por versão selecionada,
 * cada célula com o total daquela linha na versão. Compartilhada por todos os
 * reports para o modo "comparar versões".
 */
export function VersionCompareTable({
  firstColLabel = "Item",
  columns,
  rows,
}: {
  firstColLabel?: string;
  columns: CompareColumn[];
  rows: CompareRow[];
}) {
  return (
    <Card>
      <CardContent className="p-5">
        <div className="tbl-scroll overflow-x-auto">
          <Table>
            <THead>
              <tr>
                <TH>{firstColLabel}</TH>
                {columns.map((c, ci) => (
                  <TH key={ci} className="text-right">
                    <span className="inline-flex items-center gap-1.5">
                      {c.color && (
                        <span
                          className="inline-block h-2.5 w-2.5 rounded-full"
                          style={{ background: c.color }}
                        />
                      )}
                      {c.label}
                    </span>
                  </TH>
                ))}
              </tr>
            </THead>
            <tbody>
              {rows.map((r, ri) => {
                const emph = r.emphasis;
                return (
                  <TR
                    key={ri}
                    className={emph ? "bg-[var(--color-surface2)]" : undefined}
                  >
                    <TD
                      className={
                        emph === "final"
                          ? "font-semibold text-[var(--color-accent)]"
                          : emph === "sub"
                            ? "font-semibold text-[var(--color-ink)]"
                            : "text-[var(--color-ink2)]"
                      }
                    >
                      {r.label}
                    </TD>
                    {r.values.map((v, i) => (
                      <TD
                        key={i}
                        className={`text-right font-[family-name:var(--font-mono)] ${
                          emph ? "font-semibold" : ""
                        } ${
                          v < 0
                            ? "text-[var(--color-danger)]"
                            : emph
                              ? "text-[var(--color-ink)]"
                              : "text-[var(--color-ink2)]"
                        }`}
                      >
                        {v !== 0 ? brl0(v) : "—"}
                      </TD>
                    ))}
                  </TR>
                );
              })}
            </tbody>
          </Table>
        </div>
      </CardContent>
    </Card>
  );
}
```

### `src/components/app/caixa-entry-form.tsx`

Aba **Lançamentos** — o formulário de lançamento manual (receita / despesa / ajuste).

```tsx
"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { addCash } from "@/lib/actions/caixa";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input, Label, Select } from "@/components/ui/input";
import { DateField } from "@/components/ui/date-field";

interface Conta {
  id: string;
  banco: string;
  cc: string | null;
}

type Tipo = "receita" | "despesa" | "ajuste";

const TIPOS: { key: Tipo; label: string; hint: string }[] = [
  {
    key: "receita",
    label: "Receita",
    hint: "Entrada de caixa. Use “Avulsa (extrato)” quando não há contraparte no módulo de Receitas.",
  },
  {
    key: "despesa",
    label: "Despesa (extrato)",
    hint: "Saída que consta no extrato mas não foi encontrada/conciliada no módulo de Despesas.",
  },
  {
    key: "ajuste",
    label: "Ajuste de Caixa",
    hint: "Ajuste manual do saldo, para mais ou para menos (sem contraparte nos módulos).",
  },
];

export function CaixaEntryForm({ contas }: { contas: Conta[] }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);

  const [tipo, setTipo] = useState<Tipo>("receita");
  const [sinal, setSinal] = useState<"mais" | "menos">("mais");
  const [catReceita, setCatReceita] = useState("mensais");
  const [data, setData] = useState("");
  const [descricao, setDescricao] = useState("");
  const [valor, setValor] = useState("");
  const [bankAccountId, setBankAccountId] = useState("");

  const hint = TIPOS.find((t) => t.key === tipo)?.hint ?? "";

  const salvar = () => {
    setError(null);
    const mag = Math.abs(Number(valor) || 0);
    if (mag <= 0) {
      setError("Informe um valor maior que zero.");
      return;
    }
    const fd = new FormData();
    fd.set("tipo", tipo);
    fd.set("data", data);
    fd.set("descricao", descricao);
    fd.set("valor", String(mag));
    fd.set("bankAccountId", bankAccountId);
    if (tipo === "receita") fd.set("cat", catReceita);
    if (tipo === "ajuste") fd.set("sinal", sinal);
    start(async () => {
      try {
        await addCash(fd);
        setData("");
        setDescricao("");
        setValor("");
        router.refresh();
      } catch (e) {
        setError(e instanceof Error ? e.message : "Falha ao lançar.");
      }
    });
  };

  return (
    <Card className="mb-6">
      <CardContent className="p-5">
        {/* Seletor de tipo */}
        <div className="mb-4 flex flex-wrap gap-1 rounded-[8px] bg-[var(--color-surface3)] p-1">
          {TIPOS.map((t) => (
            <button
              key={t.key}
              type="button"
              onClick={() => setTipo(t.key)}
              className={`rounded-[6px] px-3 py-1.5 text-xs transition-colors ${
                tipo === t.key
                  ? "bg-white text-[var(--color-ink)] shadow-sm"
                  : "text-[var(--color-ink3)] hover:text-[var(--color-ink)]"
              }`}
            >
              {t.label}
            </button>
          ))}
        </div>

        <div className="grid grid-cols-2 gap-3 sm:grid-cols-6">
          <div>
            <Label>Data</Label>
            <DateField value={data} onChange={setData} />
          </div>
          <div className="sm:col-span-2">
            <Label>Descrição</Label>
            <Input
              value={descricao}
              onChange={(e) => setDescricao(e.target.value)}
              placeholder={
                tipo === "ajuste"
                  ? "Ex.: Ajuste de saldo / diferença de extrato"
                  : "Ex.: Tarifa bancária / TED recebida"
              }
            />
          </div>

          {tipo === "ajuste" && (
            <div>
              <Label>Sentido</Label>
              <Select value={sinal} onChange={(e) => setSinal(e.target.value as "mais" | "menos")}>
                <option value="mais">Para mais (+)</option>
                <option value="menos">Para menos (−)</option>
              </Select>
            </div>
          )}

          {tipo === "receita" && (
            <div>
              <Label>Categoria</Label>
              <Select value={catReceita} onChange={(e) => setCatReceita(e.target.value)}>
                <option value="mensais">Mensais</option>
                <option value="AS">Ato/Sinal</option>
                <option value="reembolso">Reembolso</option>
                <option value="extrato">Avulsa (extrato)</option>
                <option value="outro">Outro</option>
              </Select>
            </div>
          )}

          <div>
            <Label>Valor {tipo === "despesa" ? "(saída)" : tipo === "ajuste" ? "(módulo)" : "(entrada)"}</Label>
            <Input
              type="number"
              step="0.01"
              min="0"
              value={valor}
              onChange={(e) => setValor(e.target.value)}
              placeholder="0"
            />
          </div>

          <div>
            <Label>Conta (opcional)</Label>
            <Select value={bankAccountId} onChange={(e) => setBankAccountId(e.target.value)}>
              <option value="">—</option>
              {contas.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.banco} · {c.cc || "s/ conta"}
                </option>
              ))}
            </Select>
          </div>

          <div className="flex items-end sm:col-span-6">
            <Button type="button" disabled={pending} onClick={salvar}>
              {pending
                ? "Lançando…"
                : tipo === "ajuste"
                  ? "Lançar ajuste"
                  : "Adicionar lançamento"}
            </Button>
          </div>
        </div>

        <p className="mt-3 text-[11.5px] leading-relaxed text-[var(--color-ink3)]">
          {hint}
          {tipo !== "receita" || catReceita === "extrato"
            ? " O lançamento já entra como conciliado (não há contraparte nos módulos para casar)."
            : ""}
        </p>
        {error && <p className="mt-2 text-sm text-[var(--color-danger)]">{error}</p>}
      </CardContent>
    </Card>
  );
}
```

### `src/components/app/import-extrato.tsx`

O **importador de extrato**, inteiro (817 linhas). Ver seção 10.

```tsx
"use client";

import { useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import * as XLSX from "xlsx";
import {
  importCash,
  extractExtratoPdf,
  matchCandidatosMovimento,
  pairMovimento,
  criarLancamentoDoExtrato,
  type ImportCashRow,
  type CandidatoMatch,
} from "@/lib/actions/caixa";
import { Button } from "@/components/ui/button";
import { Input, Label, Select } from "@/components/ui/input";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { dateBR } from "@/lib/utils";

interface Conta {
  id: string;
  banco: string;
  cc: string | null;
}

const brl = (v: number) =>
  v.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });

// ─────────────────────────── Parsing robusto ───────────────────────────────

/** Converte texto/valor monetário em número, tolerando formatos BR e US. */
function parseMoney(v: unknown): number | null {
  if (v == null || v === "") return null;
  if (typeof v === "number") return Number.isFinite(v) ? v : null;
  let s = String(v).trim();
  if (!s) return null;
  s = s.replace(/r\$/i, "").trim();
  let neg = false;
  if (/^\(.*\)$/.test(s)) {
    neg = true;
    s = s.slice(1, -1);
  }
  if (/^-\s*/.test(s)) {
    neg = true;
    s = s.replace(/^-\s*/, "");
  }
  if (/-\s*$/.test(s)) {
    neg = true;
    s = s.replace(/-\s*$/, "");
  }
  s = s.replace(/\s/g, "");
  if (!/[0-9]/.test(s)) return null;
  const hasComma = s.includes(",");
  const hasDot = s.includes(".");
  let normd: string;
  if (hasComma && hasDot) {
    normd =
      s.lastIndexOf(",") > s.lastIndexOf(".")
        ? s.replace(/\./g, "").replace(",", ".")
        : s.replace(/,/g, "");
  } else if (hasComma) {
    const after = s.length - s.lastIndexOf(",") - 1;
    normd = after <= 2 ? s.replace(",", ".") : s.replace(/,/g, "");
  } else if (hasDot) {
    const dots = (s.match(/\./g) || []).length;
    const after = s.length - s.lastIndexOf(".") - 1;
    normd = dots === 1 && after <= 2 ? s : s.replace(/\./g, "");
  } else {
    normd = s;
  }
  const n = Number(normd);
  if (!Number.isFinite(n)) return null;
  return neg ? -n : n;
}

/** Converte data em texto/Date para o formato interno "MM/DD/YYYY". */
function toInternalDate(v: unknown): string {
  if (v == null || v === "") return "";
  if (v instanceof Date) {
    return `${String(v.getMonth() + 1).padStart(2, "0")}/${String(v.getDate()).padStart(2, "0")}/${v.getFullYear()}`;
  }
  const s = String(v).trim();
  const br = s.match(/^(\d{1,2})[/\-.](\d{1,2})[/\-.](\d{2,4})/);
  if (br) {
    let y = br[3];
    if (y.length === 2) y = "20" + y;
    return `${br[2].padStart(2, "0")}/${br[1].padStart(2, "0")}/${y}`;
  }
  const iso = s.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (iso) return `${iso[2]}/${iso[3]}/${iso[1]}`;
  return "";
}

const norm = (s: string) =>
  s.toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "").trim();

interface PreviewRow {
  incluir: boolean;
  data: string; // interno MM/DD/YYYY
  descricao: string;
  doc: string;
  valor: number;
  tipo: "entrada" | "saida";
}
interface ParseResult {
  rows: PreviewRow[];
  headers: string[];
  reconhecidos: number;
  ignorados: number;
}

/** Localiza o índice de coluna cujo cabeçalho casa com um dos apelidos. */
function findCol(headers: string[], aliases: string[]): number {
  return headers.findIndex((h) => aliases.some((a) => norm(h).includes(a)));
}

function parseSheet(aoa: unknown[][]): ParseResult {
  // Acha a linha de cabeçalho: contém "valor" e uma coluna de data/histórico.
  let headerIdx = -1;
  for (let i = 0; i < Math.min(aoa.length, 15); i++) {
    const cells = (aoa[i] || []).map((c) => norm(String(c ?? "")));
    const temValor = cells.some((c) => c.includes("valor") || c === "amount");
    const temData = cells.some((c) => c.includes("data") || c.includes("date"));
    const temHist = cells.some(
      (c) => c.includes("hist") || c.includes("descri") || c.includes("memo"),
    );
    if (temValor && (temData || temHist)) {
      headerIdx = i;
      break;
    }
  }
  if (headerIdx < 0)
    throw new Error(
      "Não encontrei a linha de cabeçalho do extrato (com colunas de Data e Valor). Verifique se o arquivo é um extrato bancário válido.",
    );

  const headers = (aoa[headerIdx] || []).map((c) => String(c ?? ""));
  const iDataMov = findCol(headers, ["data movimento", "data do movimento"]);
  const iData = iDataMov >= 0 ? iDataMov : findCol(headers, ["data lancamento", "data", "date"]);
  const iDesc = findCol(headers, ["histor", "descri", "memo", "lancamento"]);
  const iDoc = findCol(headers, ["documento", "doc"]);
  const iValor = findCol(headers, ["valor lancamento", "valor", "amount", "credito"]);
  const iNome = findCol(headers, ["nome", "razao", "favorecido"]);

  const faltando: string[] = [];
  if (iData < 0) faltando.push("Data");
  if (iValor < 0) faltando.push("Valor");
  if (faltando.length) {
    throw new Error(
      `Colunas obrigatórias não encontradas: ${faltando.join(", ")}. Cabeçalhos lidos: ${headers
        .filter(Boolean)
        .join(" | ")}.`,
    );
  }

  const rows: PreviewRow[] = [];
  let ignorados = 0;
  for (let i = headerIdx + 1; i < aoa.length; i++) {
    const r = aoa[i] || [];
    const valor = parseMoney(r[iValor]);
    const descRaw = String(r[iDesc] ?? "").trim();
    const nome = iNome >= 0 ? String(r[iNome] ?? "").trim() : "";
    const doc = iDoc >= 0 ? String(r[iDoc] ?? "").trim() : "";
    const isTotalRow = /saldo|total/i.test(descRaw);
    if (valor == null || valor === 0 || isTotalRow) {
      if (descRaw || r.some((c) => String(c ?? "").trim())) ignorados++;
      continue;
    }
    const data = toInternalDate(r[iData]);
    const descricao = [descRaw, nome].filter(Boolean).join(" · ");
    rows.push({
      incluir: true,
      data,
      descricao: descricao || "—",
      doc,
      valor,
      tipo: valor >= 0 ? "entrada" : "saida",
    });
  }
  return { rows, headers: headers.filter(Boolean), reconhecidos: rows.length, ignorados };
}

// ─────────────────────────── Componente ────────────────────────────────────

export function ImportExtratoButton({
  contas,
  aiConfigured = false,
  projetos = [],
}: {
  contas: Conta[];
  aiConfigured?: boolean;
  projetos?: { id: string; nome: string }[];
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  const router = useRouter();
  const [pending, start] = useTransition();
  const [reading, startReading] = useTransition();
  const [msg, setMsg] = useState<string | null>(null);
  const [erro, setErro] = useState<string | null>(null);
  const [bankAccountId, setBankAccountId] = useState("");
  const [saldoFinal, setSaldoFinal] = useState("");
  const [preview, setPreview] = useState<PreviewRow[] | null>(null);
  const [resumo, setResumo] = useState<{ reconhecidos: number; ignorados: number } | null>(null);
  // Pareamento (modal): linha em conciliação, candidatos e estados de carga.
  const [matching, setMatching] = useState<PreviewRow | null>(null);
  const [cands, setCands] = useState<CandidatoMatch[] | null>(null);
  const [loadingCands, startCands] = useTransition();
  const [pairing, startPairing] = useTransition();
  const [modalErro, setModalErro] = useState<string | null>(null);
  // Busca manual dentro do modal de pareamento.
  const [buscaPar, setBuscaPar] = useState("");
  // Modal "Adicionar": cria o lançamento JÁ CONCILIADO (pago/recebido).
  const [adicionando, setAdicionando] = useState<PreviewRow | null>(null);
  const [addProjeto, setAddProjeto] = useState("");
  const [addObs, setAddObs] = useState("");
  const [addErro, setAddErro] = useState<string | null>(null);
  const [addBusy, startAdd] = useTransition();

  const isPdfOrImage = (file: File) =>
    file.type === "application/pdf" || file.type.startsWith("image/");

  async function onFile(file: File) {
    setMsg(null);
    setErro(null);
    setPreview(null);
    // PDF/imagem: leitura por IA no servidor (mesma tela de conferência).
    if (isPdfOrImage(file)) {
      const fd = new FormData();
      fd.set("file", file);
      if (bankAccountId) fd.set("bankAccountId", bankAccountId);
      startReading(async () => {
        try {
          const res = await extractExtratoPdf(fd);
          if (res.error) {
            setErro(res.error);
            return;
          }
          const rows: PreviewRow[] = res.movimentos.map((m) => ({
            incluir: true,
            data: m.data,
            descricao: m.descricao,
            doc: m.doc,
            valor: m.valor,
            tipo: m.valor >= 0 ? "entrada" : "saida",
          }));
          if (rows.length === 0) {
            setErro(
              "Nenhuma movimentação foi reconhecida no PDF. Verifique se o extrato está legível (não protegido/escaneado sem texto).",
            );
            return;
          }
          setPreview(rows);
          setResumo({ reconhecidos: rows.length, ignorados: 0 });
          if (res.saldoFinal != null && !saldoFinal) setSaldoFinal(String(res.saldoFinal));
        } catch (e) {
          setErro(e instanceof Error ? e.message : "Falha ao ler o PDF do extrato.");
        }
      });
      return;
    }
    // XLSX/CSV: parsing local (comportamento existente, inalterado).
    try {
      const wb = XLSX.read(await file.arrayBuffer(), { cellDates: true });
      const ws = wb.Sheets[wb.SheetNames[0]];
      const aoa = XLSX.utils.sheet_to_json<unknown[]>(ws, {
        header: 1,
        raw: false,
        defval: "",
        blankrows: false,
      });
      const res = parseSheet(aoa);
      if (res.rows.length === 0) {
        setErro(
          `Nenhum lançamento com valor foi reconhecido (${res.ignorados} linhas ignoradas). Confira as colunas de Data e Valor do arquivo.`,
        );
        return;
      }
      setPreview(res.rows);
      setResumo({ reconhecidos: res.reconhecidos, ignorados: res.ignorados });
    } catch (e) {
      setErro(e instanceof Error ? e.message : "Falha ao ler o arquivo.");
    }
  }

  const visiveis = preview ?? [];
  const totEntradas = visiveis
    .filter((r) => r.tipo === "entrada")
    .reduce((a, r) => a + r.valor, 0);
  const totSaidas = visiveis
    .filter((r) => r.tipo === "saida")
    .reduce((a, r) => a + Math.abs(r.valor), 0);

  // Remove uma linha da conferência por REFERÊNCIA (robusto a mudanças de índice
  // enquanto o modal de pareamento está aberto).
  const removeRow = (r: PreviewRow) =>
    setPreview((s) => {
      const next = s ? s.filter((x) => x !== r) : s;
      return next && next.length ? next : null;
    });

  function carregarCandidatos(r: PreviewRow, termo: string) {
    startCands(async () => {
      try {
        const res = await matchCandidatosMovimento(
          { data: r.data, descricao: r.descricao, valor: r.valor, doc: r.doc },
          termo,
        );
        setCands(res.candidatos);
      } catch {
        setModalErro("Falha ao buscar candidatos de conciliação.");
        setCands([]);
      }
    });
  }

  function abrirParear(r: PreviewRow) {
    setModalErro(null);
    setCands(null);
    setBuscaPar("");
    setMatching(r);
    carregarCandidatos(r, "");
  }

  /** Abre o cadastro rápido que cria o lançamento JÁ conciliado. */
  function abrirAdicionar(r: PreviewRow) {
    setAddErro(null);
    setAddObs(r.descricao);
    setAddProjeto(projetos[0]?.id ?? "");
    setAdicionando(r);
  }

  function confirmarAdicionar() {
    const r = adicionando;
    if (!r) return;
    if (!addProjeto) {
      setAddErro("Selecione o projeto.");
      return;
    }
    setAddErro(null);
    startAdd(async () => {
      const res = await criarLancamentoDoExtrato({
        mov: { data: r.data, descricao: r.descricao, valor: r.valor, doc: r.doc },
        bankAccountId: bankAccountId || null,
        projectId: addProjeto,
        obs: addObs || null,
      });
      if (res.ok) {
        setAdicionando(null);
        removeRow(r);
        setMsg(
          r.tipo === "saida"
            ? "Despesa criada e já marcada como PAGA (conciliada com o extrato)."
            : "Conta a receber criada e já marcada como RECEBIDA (conciliada com o extrato).",
        );
        router.refresh();
      } else {
        setAddErro(res.error ?? "Falha ao criar o lançamento.");
      }
    });
  }

  function confirmarPar(c: CandidatoMatch) {
    const r = matching;
    if (!r) return;
    setModalErro(null);
    startPairing(async () => {
      const res = await pairMovimento({
        mov: { data: r.data, descricao: r.descricao, valor: r.valor, doc: r.doc },
        bankAccountId: bankAccountId || null,
        alvoId: c.id,
        alvoTipo: c.tipo,
      });
      if (res.ok) {
        setMatching(null);
        setCands(null);
        removeRow(r);
        setMsg(
          `Movimento conciliado com ${c.tipo === "despesa" ? "a despesa" : "a conta a receber"} de ${c.nome}.`,
        );
        router.refresh();
      } else {
        setModalErro(res.error ?? "Falha ao conciliar o movimento.");
      }
    });
  }

  /** Importa as linhas restantes como movimentos de caixa (concilia automático). */
  function importarRestantes() {
    if (!preview || preview.length === 0) return;
    setErro(null);
    const rows: ImportCashRow[] = preview.map((r) => ({
      data: r.data || undefined,
      descricao: r.descricao,
      valor: r.valor,
      doc: r.doc || undefined,
      cat: "extrato",
    }));
    const saldo = parseMoney(saldoFinal);
    start(async () => {
      try {
        const res = await importCash({
          rows,
          bankAccountId: bankAccountId || null,
          saldoFinal: saldo,
        });
        const parts = [`${res.inserted} lançamentos importados`];
        if (res.conciliated > 0) parts.push(`${res.conciliated} conciliados automaticamente`);
        if (res.skipped > 0) parts.push(`${res.skipped} ignorados (já importados)`);
        if (res.saldoUpdated && saldo != null) parts.push(`saldo atualizado para ${brl(saldo)}`);
        setMsg(parts.join(" · ") + ".");
        setPreview(null);
        setResumo(null);
        setSaldoFinal("");
        router.refresh();
      } catch (e) {
        setErro(e instanceof Error ? e.message : "Falha na importação.");
      }
    });
  }

  return (
    <div className="space-y-3">
      <div className="rounded-[10px] border border-[var(--color-accent2)]/12 bg-[var(--color-surface2)] p-4">
        <input
          ref={inputRef}
          type="file"
          accept={
            aiConfigured
              ? ".xlsx,.xls,.csv,application/pdf,image/png,image/jpeg,image/webp"
              : ".xlsx,.xls,.csv,application/pdf"
          }
          hidden
          onChange={(e) => {
            const f = e.target.files?.[0];
            if (f) onFile(f);
            e.target.value = "";
          }}
        />
        <div className="flex flex-col gap-3 sm:flex-row sm:items-end">
          <div className="sm:w-56">
            <Label>Conta corrente do extrato</Label>
            <Select value={bankAccountId} onChange={(e) => setBankAccountId(e.target.value)}>
              <option value="">Selecione a conta…</option>
              {contas.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.banco} · {c.cc || "s/ conta"}
                </option>
              ))}
            </Select>
          </div>
          <div className="sm:w-44">
            <Label>Saldo final (opcional)</Label>
            <Input
              value={saldoFinal}
              onChange={(e) => setSaldoFinal(e.target.value)}
              placeholder="detecta do extrato"
            />
          </div>
          <Button
            variant="outline"
            disabled={pending || reading || !bankAccountId}
            onClick={() => inputRef.current?.click()}
          >
            {reading ? "Lendo PDF…" : "Selecionar arquivo (XLSX/CSV/PDF)"}
          </Button>
        </div>
        <p className="mt-2 text-[11.5px] leading-relaxed text-[var(--color-ink3)]">
          Selecione a conta e o arquivo do extrato (XLSX, CSV ou <strong>PDF</strong>).
          O sistema lê Data, Histórico, Documento e Valor, mostra uma{" "}
          <strong>pré-visualização</strong> para você revisar e escolher o que
          importar, e concilia com as despesas/receitas previstas. Lançamentos já
          importados são ignorados. O PDF original fica armazenado para auditoria.
          {aiConfigured
            ? " Com IA ativa, também lê extratos em imagem e PDFs escaneados."
            : " (Só PDF com texto; escaneados/imagem exigem IA — ative em Config → Diagnóstico de IA.)"}
        </p>
        {!bankAccountId && contas.length === 0 && (
          <p className="mt-1 text-[11.5px] text-[var(--color-warning)]">
            Cadastre uma conta corrente em Contas Correntes para importar o extrato.
          </p>
        )}
        {erro && <p className="mt-2 text-xs text-[var(--color-danger)]">{erro}</p>}
        {msg && <p className="mt-2 text-xs text-[var(--color-success)]">{msg}</p>}
      </div>

      {/* Pré-visualização / triagem: cada linha tem 3 ações (Adicionar / Parear /
          Ignorar). O que sobrar pode ser importado em lote como movimento. */}
      {preview && (
        <Card>
          <CardContent className="p-4">
            <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
              <div className="flex flex-wrap items-center gap-2">
                <h3 className="text-sm font-semibold text-[var(--color-ink)]">
                  Pré-visualização do extrato
                </h3>
                <Badge tone="neutral">{visiveis.length} pendentes</Badge>
                {resumo && resumo.ignorados > 0 && (
                  <Badge tone="warning">{resumo.ignorados} ignorados (saldo/total)</Badge>
                )}
              </div>
              <p className="font-[family-name:var(--font-mono)] text-[11px] text-[var(--color-ink3)]">
                Adicionar = cadastra · Parear = concilia com projeção · Ignorar = descarta
              </p>
            </div>

            <div className="tbl-scroll max-h-[440px] overflow-auto rounded-[8px] border border-[var(--color-accent2)]/12">
              <table className="w-full border-collapse text-[12.5px]">
                <thead className="sticky top-0 z-10 bg-[var(--color-surface2)]">
                  <tr className="text-left font-[family-name:var(--font-mono)] text-[10px] uppercase tracking-wide text-[var(--color-ink3)]">
                    <th className="px-2 py-2">Data</th>
                    <th className="px-2 py-2">Descrição</th>
                    <th className="px-2 py-2">Documento</th>
                    <th className="px-2 py-2 text-right">Valor</th>
                    <th className="px-2 py-2">Tipo</th>
                    <th className="px-2 py-2 text-right">Ações</th>
                  </tr>
                </thead>
                <tbody>
                  {visiveis.map((r, i) => (
                    <tr key={i} className="border-t border-[var(--color-accent2)]/8">
                      <td className="whitespace-nowrap px-2 py-1.5 font-[family-name:var(--font-mono)] text-[var(--color-ink2)]">
                        {r.data ? dateBR(r.data) : "—"}
                      </td>
                      <td className="px-2 py-1.5 text-[var(--color-ink)]">{r.descricao}</td>
                      <td className="px-2 py-1.5 font-[family-name:var(--font-mono)] text-[var(--color-ink3)]">
                        {r.doc || "—"}
                      </td>
                      <td
                        className={`whitespace-nowrap px-2 py-1.5 text-right font-[family-name:var(--font-mono)] ${
                          r.valor < 0 ? "text-[var(--color-danger)]" : "text-[var(--color-success)]"
                        }`}
                      >
                        {brl(r.valor)}
                      </td>
                      <td className="px-2 py-1.5">
                        <Badge tone={r.tipo === "entrada" ? "success" : "danger"}>
                          {r.tipo === "entrada" ? "Entrada" : "Saída"}
                        </Badge>
                      </td>
                      <td className="px-2 py-1.5">
                        <div className="flex items-center justify-end gap-1.5 whitespace-nowrap">
                          <button
                            onClick={() => abrirAdicionar(r)}
                            className="rounded-[6px] bg-[var(--color-accent2)] px-2 py-1 text-[11px] font-medium text-white hover:opacity-90"
                            title={
                              r.tipo === "saida"
                                ? "Cadastrar a despesa já PAGA (conciliada com o extrato)"
                                : "Cadastrar a conta a receber já RECEBIDA (conciliada com o extrato)"
                            }
                          >
                            Adicionar
                          </button>
                          <button
                            onClick={() => abrirParear(r)}
                            className="rounded-[6px] border border-[var(--color-accent2)]/40 px-2 py-1 text-[11px] font-medium text-[var(--color-accent2)] hover:bg-[var(--color-accent4)]"
                            title="Parear com uma despesa/receita já lançada"
                          >
                            Parear
                          </button>
                          <button
                            onClick={() => removeRow(r)}
                            className="rounded-[6px] border border-[var(--color-accent2)]/20 px-2 py-1 text-[11px] text-[var(--color-ink3)] hover:bg-[var(--color-surface2)]"
                            title="Ignorar esta linha"
                          >
                            Ignorar
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))}
                  {visiveis.length === 0 && (
                    <tr>
                      <td colSpan={6} className="px-2 py-6 text-center text-[var(--color-ink4)]">
                        Todas as linhas foram tratadas.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>

            <div className="mt-3 flex flex-wrap items-center justify-between gap-3">
              <p className="text-[12px] text-[var(--color-ink3)]">
                Entradas <strong className="text-[var(--color-success)]">{brl(totEntradas)}</strong> ·
                Saídas <strong className="text-[var(--color-danger)]">{brl(totSaidas)}</strong>
              </p>
              <div className="flex items-center gap-2">
                <Button variant="outline" onClick={() => setPreview(null)} disabled={pending}>
                  Fechar
                </Button>
                <Button
                  variant="outline"
                  onClick={importarRestantes}
                  disabled={pending || visiveis.length === 0}
                  title="Importa as linhas restantes como movimentos de caixa (concilia automaticamente por valor/mês)"
                >
                  {pending ? "Importando…" : `Importar ${visiveis.length} como movimento`}
                </Button>
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Modal de pareamento (Parear): candidatos de conciliação. */}
      {matching && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4"
          onClick={() => {
            if (!pairing) {
              setMatching(null);
              setCands(null);
            }
          }}
        >
          <div
            className="max-h-[85vh] w-full max-w-2xl overflow-auto rounded-[12px] bg-white p-5 shadow-xl"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="mb-1 flex items-start justify-between gap-3">
              <h3 className="text-sm font-semibold text-[var(--color-ink)]">
                Parear movimento com{" "}
                {matching.tipo === "saida" ? "conta a pagar" : "conta a receber"}
              </h3>
              <button
                onClick={() => {
                  if (!pairing) {
                    setMatching(null);
                    setCands(null);
                  }
                }}
                className="text-[var(--color-ink3)] hover:text-[var(--color-ink)]"
              >
                ✕
              </button>
            </div>
            <p className="mb-3 text-[12px] text-[var(--color-ink3)]">
              {matching.data ? dateBR(matching.data) : "—"} · {matching.descricao} ·{" "}
              <strong
                className={
                  matching.valor < 0 ? "text-[var(--color-danger)]" : "text-[var(--color-success)]"
                }
              >
                {brl(matching.valor)}
              </strong>
            </p>

            {/* Busca inteligente entre os lançamentos JÁ LANÇADOS: o usuário
                encontra qualquer despesa/receita, mesmo quando o valor do
                extrato não bate exatamente com o previsto. */}
            <div className="mb-3 flex items-center gap-2 rounded-[8px] border border-[var(--color-accent2)]/20 px-3 py-2">
              <span aria-hidden className="text-[var(--color-ink3)]">🔍</span>
              <input
                value={buscaPar}
                onChange={(e) => {
                  const v = e.target.value;
                  setBuscaPar(v);
                  if (matching) carregarCandidatos(matching, v);
                }}
                placeholder={
                  matching?.tipo === "saida"
                    ? "Buscar despesa lançada por fornecedor, nº do pedido, projeto ou valor…"
                    : "Buscar conta a receber por cliente, descrição, projeto ou valor…"
                }
                className="w-full bg-transparent text-[13px] text-[var(--color-ink)] outline-none placeholder:text-[var(--color-ink4)]"
              />
            </div>

            {loadingCands && (
              <p className="py-6 text-center text-[12px] text-[var(--color-ink3)]">
                Buscando candidatos…
              </p>
            )}

            {!loadingCands && cands && cands.length === 0 && (
              <div className="rounded-[8px] border border-[var(--color-accent2)]/12 bg-[var(--color-surface2)] p-4 text-center">
                <p className="text-[12.5px] text-[var(--color-ink2)]">
                  Nenhuma {matching.tipo === "saida" ? "despesa" : "receita"} lançada compatível
                  (mesmo valor aproximado) foi encontrada.
                </p>
                <p className="mt-1 text-[11.5px] text-[var(--color-ink3)]">
                  Use <strong>Adicionar</strong> para cadastrar, ou{" "}
                  <strong>Ignorar</strong> para descartar.
                </p>
              </div>
            )}

            {!loadingCands && cands && cands.length > 0 && (
              <div className="space-y-2">
                {cands.map((c) => (
                  <div
                    key={c.id}
                    className="flex items-center justify-between gap-3 rounded-[8px] border border-[var(--color-accent2)]/12 p-3"
                  >
                    <div className="min-w-0">
                      <div className="flex items-center gap-2">
                        <Badge tone={grauTone(c.grau)}>{grauLabel(c.grau)}</Badge>
                        <span className="truncate text-[13px] font-medium text-[var(--color-ink)]">
                          {c.nome}
                        </span>
                      </div>
                      <div className="mt-0.5 truncate text-[11.5px] text-[var(--color-ink3)]">
                        {c.descricao}
                        {c.projectName ? ` · ${c.projectName}` : ""}
                        {c.vencimento ? ` · venc. ${dateBR(c.vencimento)}` : ""}
                      </div>
                    </div>
                    <div className="flex items-center gap-3 whitespace-nowrap">
                      <span className="font-[family-name:var(--font-mono)] text-[12.5px] text-[var(--color-ink2)]">
                        {brl(c.valor)}
                      </span>
                      <Button size="sm" onClick={() => confirmarPar(c)} disabled={pairing}>
                        {pairing ? "Conciliando…" : "Conciliar"}
                      </Button>
                    </div>
                  </div>
                ))}
              </div>
            )}

            {modalErro && (
              <p className="mt-3 text-xs text-[var(--color-danger)]">{modalErro}</p>
            )}
          </div>
        </div>
      )}
      {/* Modal ADICIONAR: cria a despesa/conta a receber com os dados do extrato
          e JÁ A DEIXA CONCILIADA (paga/recebida), pois o movimento já ocorreu
          no banco. */}
      {adicionando && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4"
          onClick={() => !addBusy && setAdicionando(null)}
        >
          <div
            className="w-full max-w-lg rounded-[12px] bg-white p-5 shadow-xl"
            onClick={(e) => e.stopPropagation()}
          >
            <h3 className="mb-1 text-sm font-semibold text-[var(--color-ink)]">
              {adicionando.tipo === "saida"
                ? "Nova despesa a partir do extrato"
                : "Nova conta a receber a partir do extrato"}
            </h3>
            <p className="mb-3 text-[12px] text-[var(--color-ink3)]">
              {adicionando.data ? dateBR(adicionando.data) : "—"} ·{" "}
              <strong
                className={
                  adicionando.valor < 0
                    ? "text-[var(--color-danger)]"
                    : "text-[var(--color-success)]"
                }
              >
                {brl(adicionando.valor)}
              </strong>
            </p>

            <div className="space-y-3">
              <div>
                <Label>Projeto (obra)</Label>
                <Select
                  value={addProjeto}
                  onChange={(e) => setAddProjeto(e.target.value)}
                >
                  <option value="">Selecione…</option>
                  {projetos.map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.nome}
                    </option>
                  ))}
                </Select>
              </div>
              <div>
                <Label>Descrição</Label>
                <Input value={addObs} onChange={(e) => setAddObs(e.target.value)} />
              </div>
            </div>

            <p className="mt-3 rounded-[8px] bg-[var(--color-surface2)] px-3 py-2 text-[11.5px] text-[var(--color-ink2)]">
              Como o lançamento foi identificado no extrato, ele será gravado já{" "}
              <strong>
                {adicionando.tipo === "saida" ? "PAGO" : "RECEBIDO"} e conciliado
              </strong>{" "}
              na data do movimento.
            </p>

            {addErro && (
              <p className="mt-2 text-xs text-[var(--color-danger)]">{addErro}</p>
            )}

            <div className="mt-4 flex items-center justify-end gap-2">
              <Button
                variant="outline"
                disabled={addBusy}
                onClick={() => setAdicionando(null)}
              >
                Cancelar
              </Button>
              <Button disabled={addBusy} onClick={confirmarAdicionar}>
                {addBusy
                  ? "Criando…"
                  : adicionando.tipo === "saida"
                    ? "Criar despesa paga"
                    : "Criar receita recebida"}
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

const grauTone = (g: "alta" | "media" | "baixa") =>
  g === "alta" ? "success" : g === "media" ? "warning" : "neutral";
const grauLabel = (g: "alta" | "media" | "baixa") =>
  g === "alta" ? "Alta compatibilidade" : g === "media" ? "Média" : "Baixa";
```

### `src/components/app/conciliacao-review.tsx`

Aba **Conciliação** — a revisão com sugestões. Ver seção 6.

```tsx
"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import {
  conciliarDespesa,
  desfazerConciliacao,
  conciliarContaReceber,
  criarContaFromExtrato,
} from "@/lib/actions/caixa";
import type {
  MovimentoPendente,
  MovimentoPendenteEntrada,
  MovimentoConciliado,
} from "@/lib/queries";
import { brl0, dateBR } from "@/lib/utils";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";

const grauTone = (g: "alta" | "media" | "baixa") =>
  g === "alta" ? "success" : g === "media" ? "warning" : "neutral";
const grauLabel = (g: "alta" | "media" | "baixa") =>
  g === "alta" ? "Alta compatibilidade" : g === "media" ? "Média" : "Baixa";

export function ConciliacaoReview({
  pendentes,
  pendentesEntrada = [],
  conciliados,
  canDesfazer,
}: {
  pendentes: MovimentoPendente[];
  pendentesEntrada?: MovimentoPendenteEntrada[];
  conciliados: MovimentoConciliado[];
  canDesfazer: boolean;
}) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [msg, setMsg] = useState<string | null>(null);
  const [erro, setErro] = useState<string | null>(null);

  const run = (fn: () => Promise<void>, ok: string) => {
    setErro(null);
    setMsg(null);
    start(async () => {
      try {
        await fn();
        setMsg(ok);
        router.refresh();
      } catch (e) {
        setErro(e instanceof Error ? e.message : "Falha na operação.");
      }
    });
  };

  const conciliar = (cashEntryId: string, despesaId: string) =>
    run(() => conciliarDespesa({ cashEntryId, despesaId }), "Movimento conciliado: despesa marcada como paga.");
  const conciliarReceber = (cashEntryId: string, contaReceberId: string) =>
    run(() => conciliarContaReceber({ cashEntryId, contaReceberId }), "Movimento conciliado: conta a receber marcada como recebida.");
  const criarConta = (cashEntryId: string, entrada: boolean) =>
    run(
      () => criarContaFromExtrato(cashEntryId),
      entrada ? "Conta a receber criada a partir do extrato." : "Conta a pagar criada a partir do extrato.",
    );
  const desfazer = (cashEntryId: string) => {
    setErro(null);
    setMsg(null);
    start(async () => {
      try {
        await desfazerConciliacao(cashEntryId);
        setMsg("Conciliação desfeita: despesa voltou para 'A pagar'.");
        router.refresh();
      } catch (e) {
        setErro(e instanceof Error ? e.message : "Falha ao desfazer.");
      }
    });
  };

  return (
    <div className="space-y-4">
      {erro && <p className="text-xs text-[var(--color-danger)]">{erro}</p>}
      {msg && <p className="text-xs text-[var(--color-success)]">{msg}</p>}

      <section className="space-y-2">
        <h3 className="text-sm font-semibold text-[var(--color-ink)]">
          Movimentos do extrato a conciliar{" "}
          <span className="font-normal text-[var(--color-ink3)]">
            ({pendentes.length})
          </span>
        </h3>
        <p className="text-[12px] text-[var(--color-ink3)]">
          Para cada saída do extrato, sugerimos as contas a pagar mais compatíveis
          (o grau é só orientação). Nada é conciliado sem a sua confirmação. Ao
          conciliar, a despesa é marcada como paga na data e no banco do movimento.
        </p>
        {pendentes.length === 0 && (
          <p className="py-6 text-center text-sm text-[var(--color-ink4)]">
            Nenhuma saída do extrato pendente de conciliação.
          </p>
        )}
        {pendentes.map((m) => (
          <Card key={m.cashEntryId}>
            <CardContent className="p-4">
              <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
                <div className="flex flex-wrap items-center gap-2 text-[13px]">
                  <span className="font-[family-name:var(--font-mono)] text-[var(--color-ink3)]">
                    {m.data ? dateBR(m.data) : "—"}
                  </span>
                  <span className="text-[var(--color-ink)]">{m.descricao ?? "—"}</span>
                  {m.doc && (
                    <span className="font-[family-name:var(--font-mono)] text-[11px] text-[var(--color-ink4)]">
                      doc {m.doc}
                    </span>
                  )}
                </div>
                <span className="font-[family-name:var(--font-mono)] text-[13px] font-semibold text-[var(--color-danger)]">
                  −{brl0(Math.abs(m.valor))}
                </span>
              </div>
              {m.sugestoes.length === 0 ? (
                <p className="text-[12px] text-[var(--color-ink4)]">
                  Sem contas a pagar compatíveis. Concilie manualmente em Despesas
                  ou mantenha pendente.
                </p>
              ) : (
                <div className="divide-y divide-[var(--color-accent2)]/8 rounded-[8px] border border-[var(--color-accent2)]/12">
                  {m.sugestoes.map((s) => (
                    <div
                      key={s.despesaId}
                      className="flex flex-wrap items-center gap-2 px-3 py-2"
                    >
                      <Badge tone={grauTone(s.grau)}>{grauLabel(s.grau)}</Badge>
                      <span className="text-[13px] text-[var(--color-ink)]">
                        {s.fornecedor ?? "—"}
                      </span>
                      <span className="text-[12px] text-[var(--color-ink3)]">
                        {s.descricao ?? s.numDoc ?? ""}
                      </span>
                      <span className="font-[family-name:var(--font-mono)] text-[12px] text-[var(--color-ink2)]">
                        {brl0(Math.abs(s.valor))}
                      </span>
                      {s.vencimento && (
                        <span className="font-[family-name:var(--font-mono)] text-[11px] text-[var(--color-ink4)]">
                          venc {dateBR(s.vencimento)}
                        </span>
                      )}
                      <Button
                        size="sm"
                        className="ml-auto"
                        disabled={pending}
                        onClick={() => conciliar(m.cashEntryId, s.despesaId)}
                      >
                        Conciliar
                      </Button>
                    </div>
                  ))}
                </div>
              )}
              <div className="mt-2 flex items-center gap-3">
                <Button
                  size="sm"
                  variant="outline"
                  disabled={pending}
                  onClick={() => criarConta(m.cashEntryId, false)}
                >
                  Criar conta a pagar
                </Button>
                <span className="text-[11px] text-[var(--color-ink4)]">
                  ou deixe pendente para não processar agora.
                </span>
              </div>
            </CardContent>
          </Card>
        ))}
      </section>

      {/* Entradas do extrato → conta a receber (item 6/7) */}
      <section className="space-y-2">
        <h3 className="text-sm font-semibold text-[var(--color-ink)]">
          Entradas do extrato a conciliar{" "}
          <span className="font-normal text-[var(--color-ink3)]">({pendentesEntrada.length})</span>
        </h3>
        <p className="text-[12px] text-[var(--color-ink3)]">
          Para cada entrada, sugerimos as contas a receber compatíveis. Você pode
          vincular a uma conta existente, criar uma nova conta a receber, ou deixar
          pendente. Nada é processado sem confirmação.
        </p>
        {pendentesEntrada.length === 0 && (
          <p className="py-6 text-center text-sm text-[var(--color-ink4)]">
            Nenhuma entrada do extrato pendente.
          </p>
        )}
        {pendentesEntrada.map((m) => (
          <Card key={m.cashEntryId}>
            <CardContent className="p-4">
              <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
                <div className="flex flex-wrap items-center gap-2 text-[13px]">
                  <span className="font-[family-name:var(--font-mono)] text-[var(--color-ink3)]">
                    {m.data ? dateBR(m.data) : "—"}
                  </span>
                  <span className="text-[var(--color-ink)]">{m.descricao ?? "—"}</span>
                </div>
                <span className="font-[family-name:var(--font-mono)] text-[13px] font-semibold text-[var(--color-success)]">
                  +{brl0(Math.abs(m.valor))}
                </span>
              </div>
              {m.sugestoes.length > 0 && (
                <div className="divide-y divide-[var(--color-accent2)]/8 rounded-[8px] border border-[var(--color-accent2)]/12">
                  {m.sugestoes.map((s) => (
                    <div key={s.contaReceberId} className="flex flex-wrap items-center gap-2 px-3 py-2">
                      <Badge tone={grauTone(s.grau)}>{grauLabel(s.grau)}</Badge>
                      <span className="text-[13px] text-[var(--color-ink)]">{s.projectName}</span>
                      <span className="text-[12px] text-[var(--color-ink3)]">{s.descricao ?? ""}</span>
                      <span className="font-[family-name:var(--font-mono)] text-[12px] text-[var(--color-ink2)]">
                        {brl0(Math.abs(s.valor))}
                      </span>
                      {s.vencimento && (
                        <span className="font-[family-name:var(--font-mono)] text-[11px] text-[var(--color-ink4)]">
                          venc {dateBR(s.vencimento)}
                        </span>
                      )}
                      <Button
                        size="sm"
                        className="ml-auto"
                        disabled={pending}
                        onClick={() => conciliarReceber(m.cashEntryId, s.contaReceberId)}
                      >
                        Conciliar
                      </Button>
                    </div>
                  ))}
                </div>
              )}
              <div className="mt-2 flex items-center gap-3">
                <Button
                  size="sm"
                  variant="outline"
                  disabled={pending}
                  onClick={() => criarConta(m.cashEntryId, true)}
                >
                  Criar conta a receber
                </Button>
                <span className="text-[11px] text-[var(--color-ink4)]">
                  ou deixe pendente para não processar agora.
                </span>
              </div>
            </CardContent>
          </Card>
        ))}
      </section>

      {conciliados.length > 0 && (
        <section className="space-y-2">
          <h3 className="text-sm font-semibold text-[var(--color-ink)]">
            Conciliados{" "}
            <span className="font-normal text-[var(--color-ink3)]">
              ({conciliados.length})
            </span>
          </h3>
          <div className="overflow-x-auto rounded-[8px] border border-[var(--color-accent2)]/12">
            <table className="w-full border-collapse text-[12.5px]">
              <thead className="bg-[var(--color-surface2)] text-left font-[family-name:var(--font-mono)] text-[10px] uppercase tracking-wide text-[var(--color-ink3)]">
                <tr>
                  <th className="px-3 py-2">Data</th>
                  <th className="px-3 py-2">Movimento</th>
                  <th className="px-3 py-2">Despesa</th>
                  <th className="px-3 py-2 text-right">Valor</th>
                  <th className="px-3 py-2">Por</th>
                  {canDesfazer && <th className="px-3 py-2 text-right">Ação</th>}
                </tr>
              </thead>
              <tbody>
                {conciliados.map((c) => (
                  <tr key={c.cashEntryId} className="border-t border-[var(--color-accent2)]/8">
                    <td className="whitespace-nowrap px-3 py-1.5 font-[family-name:var(--font-mono)] text-[var(--color-ink3)]">
                      {c.data ? dateBR(c.data) : "—"}
                    </td>
                    <td className="px-3 py-1.5 text-[var(--color-ink)]">{c.descricao ?? "—"}</td>
                    <td className="px-3 py-1.5 text-[var(--color-ink2)]">
                      {c.fornecedor ?? c.despesaNumDoc ?? "—"}
                    </td>
                    <td className="whitespace-nowrap px-3 py-1.5 text-right font-[family-name:var(--font-mono)]">
                      {brl0(Math.abs(c.valor))}
                    </td>
                    <td className="px-3 py-1.5 text-[var(--color-ink4)]">{c.conciliadoPor ?? "—"}</td>
                    {canDesfazer && (
                      <td className="px-3 py-1.5 text-right">
                        <button
                          className="text-[12px] text-[var(--color-danger)] hover:underline disabled:opacity-50"
                          disabled={pending}
                          onClick={() => desfazer(c.cashEntryId)}
                        >
                          Desfazer
                        </button>
                      </td>
                    )}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      )}
    </div>
  );
}
```

### `src/components/app/conciliar-toggle.tsx`

Aba **Conciliação** — o toggle de `rec` na tabela.

```tsx
"use client";

import { useTransition } from "react";
import { toggleConciliado } from "@/lib/actions/caixa";
import { Badge } from "@/components/ui/badge";

export function ConciliarToggle({ id, rec }: { id: string; rec: boolean }) {
  const [pending, start] = useTransition();
  return (
    <button
      disabled={pending}
      onClick={() => start(() => toggleConciliado(id, !rec))}
      className="disabled:opacity-50"
      title="Alternar conciliação"
    >
      <Badge tone={rec ? "success" : "warning"}>
        {pending ? "..." : rec ? "conciliado" : "pendente"}
      </Badge>
    </button>
  );
}
```

---

## 3. Funções de `queries.ts` chamadas


Sete funções e três helpers de conversão. As de versão (`getCash`,
`getUnits`, `getReembolsos`, `getPermutas`) filtram por `version_id`; as de
tenant (`getBankAccounts`, `getConciliacaoData`) por `tenant_id`;
`getInccRows` por `project_id`.

### `src/lib/queries.ts` · linhas 1059–1067

`CashRow` e `getCash` — a leitura principal da tela.

```ts
export type CashRow = typeof schema.cashEntries.$inferSelect;

export async function getCash(versionId: string): Promise<CashRow[]> {
  return db
    .select()
    .from(schema.cashEntries)
    .where(eq(schema.cashEntries.versionId, versionId))
    .orderBy(asc(schema.cashEntries.data));
}
```

### `src/lib/queries.ts` · linhas 219–227

`getBankAccounts`.

```ts
export async function getBankAccounts(
  tenantId: string,
): Promise<BankAccountRow[]> {
  return db
    .select()
    .from(schema.bankAccounts)
    .where(eq(schema.bankAccounts.tenantId, tenantId))
    .orderBy(asc(schema.bankAccounts.banco));
}
```

### `src/lib/queries.ts` · linhas 1576–1625

Os tipos da conciliação, incluindo `ConciliacaoData`.

```ts
export interface ConciliacaoSugestao {
  despesaId: string;
  numDoc: string | null;
  fornecedor: string | null;
  descricao: string | null;
  valor: number;
  vencimento: string | null;
  /** grau de compatibilidade (só orientação — decisão é do usuário). */
  grau: "alta" | "media" | "baixa";
}
export interface MovimentoPendente {
  cashEntryId: string;
  data: string | null;
  descricao: string | null;
  doc: string | null;
  valor: number;
  sugestoes: ConciliacaoSugestao[];
}
export interface SugestaoReceber {
  contaReceberId: string;
  descricao: string | null;
  projectName: string;
  valor: number;
  vencimento: string | null;
  grau: "alta" | "media" | "baixa";
}
export interface MovimentoPendenteEntrada {
  cashEntryId: string;
  data: string | null;
  descricao: string | null;
  doc: string | null;
  valor: number;
  sugestoes: SugestaoReceber[];
}
export interface MovimentoConciliado {
  cashEntryId: string;
  data: string | null;
  descricao: string | null;
  valor: number;
  despesaId: string | null;
  despesaNumDoc: string | null;
  fornecedor: string | null;
  conciliadoPor: string | null;
  conciliadoEm: string | null;
}
export interface ConciliacaoData {
  pendentes: MovimentoPendente[];
  pendentesEntrada: MovimentoPendenteEntrada[];
  conciliados: MovimentoConciliado[];
}
```

### `src/lib/queries.ts` · linhas 1645–1779

`getConciliacaoData` — monta pendentes, pendentesEntrada e conciliados, com as sugestões e o grau de compatibilidade.

```ts
export async function getConciliacaoData(
  tenantId: string,
  versionId: string,
): Promise<ConciliacaoData> {
  const [entries, contas, receber] = await Promise.all([
    db
      .select()
      .from(schema.cashEntries)
      .where(
        and(
          eq(schema.cashEntries.tenantId, tenantId),
          eq(schema.cashEntries.versionId, versionId),
        ),
      ),
    getContasPagar(tenantId),
    getContasReceber(tenantId),
  ]);
  const despById = new Map(contas.map((c) => [c.id, c]));
  const recById = new Map(receber.map((c) => [c.id, c]));
  const abertas = contas.filter((c) => c.status !== "Pago");
  const receberAbertas = receber.filter((c) => c.status !== "Recebido" && c.status !== "Cancelada");

  const pendentes: MovimentoPendente[] = [];
  const rankGrau = { alta: 0, media: 1, baixa: 2 } as const;
  for (const e of entries) {
    if (e.rec || e.conciliadoDespesaId) continue;
    const valor = Number(e.valor);
    if (!valor || valor >= 0) continue; // só saídas do extrato, por ora
    const movCents = Math.round(Math.abs(valor) * 100);
    const movDia = diaSerial(e.data);
    const desc = normStr(e.descricao ?? "");
    const sugestoes: (ConciliacaoSugestao & { _prox: number })[] = [];
    for (const c of abertas) {
      const cCents = Math.round(Math.abs(c.valor) * 100);
      const exato = cCents === movCents;
      const aprox = !exato && Math.abs(cCents - movCents) <= Math.max(50, movCents * 0.02);
      if (!exato && !aprox) continue;
      const vDia = diaSerial(c.vencimento);
      const prox = movDia != null && vDia != null ? Math.abs(vDia - movDia) : 9999;
      const vencida = movDia != null && vDia != null && vDia <= movDia;
      const dataProx = prox <= 7 || vencida;
      const primeiroNome = c.fornecedorNome ? normStr(c.fornecedorNome).split(/\s+/)[0] : "";
      const nomeMatch = primeiroNome.length >= 3 && desc.includes(primeiroNome);
      let grau: "alta" | "media" | "baixa";
      if (exato && (dataProx || nomeMatch)) grau = "alta";
      else if (exato || (aprox && (dataProx || nomeMatch))) grau = "media";
      else grau = "baixa";
      sugestoes.push({
        despesaId: c.id,
        numDoc: c.numDoc,
        fornecedor: c.fornecedorNome,
        descricao: c.descricao,
        valor: c.valor,
        vencimento: c.vencimento,
        grau,
        _prox: prox,
      });
    }
    sugestoes.sort((a, b) => rankGrau[a.grau] - rankGrau[b.grau] || a._prox - b._prox);
    pendentes.push({
      cashEntryId: e.id,
      data: e.data,
      descricao: e.descricao,
      doc: e.doc,
      valor,
      sugestoes: sugestoes.slice(0, 4).map(({ _prox, ...s }) => { void _prox; return s; }),
    });
  }

  // Entradas do extrato (crédito) ainda não conciliadas → sugere contas a receber.
  const pendentesEntrada: MovimentoPendenteEntrada[] = [];
  for (const e of entries) {
    if (e.rec || e.conciliadoDespesaId || e.conciliadoContaReceberId) continue;
    const valor = Number(e.valor);
    if (!valor || valor <= 0) continue; // só entradas
    const movCents = Math.round(Math.abs(valor) * 100);
    const movDia = diaSerial(e.data);
    const desc = normStr(e.descricao ?? "");
    const sugestoes: (SugestaoReceber & { _prox: number })[] = [];
    for (const c of receberAbertas) {
      const saldo = c.valor - c.valorRecebido;
      const cCents = Math.round(Math.abs(saldo || c.valor) * 100);
      const exato = cCents === movCents;
      const aprox = !exato && Math.abs(cCents - movCents) <= Math.max(50, movCents * 0.02);
      if (!exato && !aprox) continue;
      const vDia = diaSerial(c.vencimento);
      const prox = movDia != null && vDia != null ? Math.abs(vDia - movDia) : 9999;
      const dataProx = prox <= 7 || (movDia != null && vDia != null && vDia <= movDia);
      const nomeAlvo = normStr(c.clienteNome ?? c.descricao ?? "").split(/\s+/)[0];
      const nomeMatch = nomeAlvo.length >= 3 && desc.includes(nomeAlvo);
      let grau: "alta" | "media" | "baixa";
      if (exato && (dataProx || nomeMatch)) grau = "alta";
      else if (exato || (aprox && (dataProx || nomeMatch))) grau = "media";
      else grau = "baixa";
      sugestoes.push({
        contaReceberId: c.id,
        descricao: c.descricao ?? c.tipo,
        projectName: c.projectName,
        valor: c.valor,
        vencimento: c.vencimento,
        grau,
        _prox: prox,
      });
    }
    sugestoes.sort((a, b) => rankGrau[a.grau] - rankGrau[b.grau] || a._prox - b._prox);
    pendentesEntrada.push({
      cashEntryId: e.id,
      data: e.data,
      descricao: e.descricao,
      doc: e.doc,
      valor,
      sugestoes: sugestoes.slice(0, 4).map(({ _prox, ...s }) => { void _prox; return s; }),
    });
  }

  const conciliados: MovimentoConciliado[] = entries
    .filter((e) => e.conciliadoDespesaId || e.conciliadoContaReceberId)
    .map((e) => {
      const d = e.conciliadoDespesaId ? despById.get(e.conciliadoDespesaId) : undefined;
      const r = e.conciliadoContaReceberId ? recById.get(e.conciliadoContaReceberId) : undefined;
      return {
        cashEntryId: e.id,
        data: e.data,
        descricao: e.descricao,
        valor: Number(e.valor),
        despesaId: e.conciliadoDespesaId ?? e.conciliadoContaReceberId,
        despesaNumDoc: d?.numDoc ?? (r ? "Conta a receber" : null),
        fornecedor: d?.fornecedorNome ?? r?.clienteNome ?? r?.descricao ?? null,
        conciliadoPor: e.conciliadoPor,
        conciliadoEm: e.conciliadoEm,
      };
    });

  return { pendentes, pendentesEntrada, conciliados };
}
```

### `src/lib/queries.ts` · linhas 85–91

`getUnits` — usada pela aba Previstas.

```ts
export async function getUnits(versionId: string): Promise<UnitRow[]> {
  return db
    .select()
    .from(schema.units)
    .where(eq(schema.units.versionId, versionId))
    .orderBy(asc(schema.units.code));
}
```

### `src/lib/queries.ts` · linhas 134–141

`getReembolsos`.

```ts
export async function getReembolsos(
  versionId: string,
): Promise<ReembolsoRow[]> {
  return db
    .select()
    .from(schema.reembolsos)
    .where(eq(schema.reembolsos.versionId, versionId));
}
```

### `src/lib/queries.ts` · linhas 143–148

`getPermutas`.

```ts
export async function getPermutas(versionId: string): Promise<PermutaRow[]> {
  return db
    .select()
    .from(schema.permutas)
    .where(eq(schema.permutas.versionId, versionId));
}
```

### `src/lib/queries.ts` · linhas 150–157

`getInccRows`.

```ts
export async function getInccRows(projectId: string): Promise<InccRow[]> {
  const rows = await db
    .select()
    .from(schema.inccRates)
    .where(eq(schema.inccRates.projectId, projectId))
    .orderBy(asc(schema.inccRates.ordem));
  return toInccRows(rows);
}
```

### `src/lib/queries.ts` · linhas 34–61

`toCalcUnit`.

```ts
/** Converte uma linha de unidade do banco para o tipo consumido pelos cálculos. */
export function toCalcUnit(row: UnitRow): CalcUnit {
  // Mescla o plano salvo sobre um plano padrão COMPLETO. Assim, planos antigos
  // ou parciais (com algum subobjeto ausente, ex.: sem "S2") não quebram os
  // cálculos (dashboard, projeção, etc.) — os campos faltantes viram defaults.
  const base = stripIdentity(emptyUnit(row.code)) as Record<string, unknown>;
  const stored = (row.paymentPlan ?? {}) as Record<string, unknown>;
  const plan: Record<string, unknown> = { ...base };
  for (const k of Object.keys(base)) {
    const b = base[k];
    const s = stored[k];
    if (b && typeof b === "object" && !Array.isArray(b)) {
      plan[k] = s && typeof s === "object" ? { ...(b as object), ...(s as object) } : b;
    } else if (s !== undefined) {
      plan[k] = s;
    }
  }
  // Preserva chaves extras do plano salvo (flags de nível superior, etc.).
  for (const k of Object.keys(stored)) {
    if (!(k in plan)) plan[k] = stored[k];
  }
  return {
    ...(plan as Omit<CalcUnit, "code" | "status" | "valor">),
    code: row.code,
    status: row.status,
    valor: Number(row.valor),
  };
}
```

### `src/lib/queries.ts` · linhas 161–163

`reembToCalc`.

```ts
export function reembToCalc(rows: ReembolsoRow[]): CalcReembolso[] {
  return rows.map((r) => ({ data: r.data ?? "", valor: Number(r.valor ?? 0) }));
}
```

### `src/lib/queries.ts` · linhas 173–183

`permToResale`.

```ts
/** Mapeia permutas → dados de revenda para os cálculos de caixa/DRE (item 10). */
export function permToResale(rows: PermutaRow[]): CalcPermutaResale[] {
  return rows.map((p) => ({
    valorVenda: Number(p.valorVenda ?? 0),
    dataVenda: p.dataVenda ?? "",
    formaVenda: p.formaVenda ?? "",
    parcelas: Number(p.parcelas ?? 0),
    periodicidade: p.periodicidade ?? "mensal",
    dataPrimParcela: p.dataPrimParcela ?? "",
  }));
}
```

---

## 4. As Server Actions de caixa


Onze, todas em `src/lib/actions/caixa.ts` (1 212 linhas). O arquivo inteiro:

| Action | Linha | Permissão | Sem permissão |
|---|---|---|---|
| `extractExtratoPdf` | 42 | `caixa:criar` | devolve `{ error }` |
| `addCash` | 145 | `caixa:criar` | `return` silencioso |
| `importCash` | 245 | `caixa:criar` | **lança** |
| `toggleConciliado` | 400 | `caixa:editar` | `return` silencioso |
| `conciliarDespesa` | 416 | `caixa:editar` | **lança** |
| `desfazerConciliacao` | 491 | `caixa:excluir` | **lança** |
| `conciliarContaReceber` | 584 | `caixa:editar` | **lança** |
| `criarContaFromExtrato` | 651 | ver arquivo | — |
| `matchCandidatosMovimento` | 799 | ver arquivo | — |
| `pairMovimento` | 943 | `caixa:editar` | devolve `{ ok:false }` |
| `criarLancamentoDoExtrato` | 1042 | ver arquivo | — |

### `src/lib/actions/caixa.ts`

```ts
"use server";

import { and, eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { db, schema } from "@/lib/db";
import { getActiveContext } from "@/lib/context";
import { registroCasa } from "@/lib/busca";
import { can } from "@/lib/permissions";
import { logAudit } from "@/lib/audit";
import {
  getDespesas,
  getUnits,
  toCalcUnit,
  getContasPagar,
  getContasReceber,
} from "@/lib/queries";
import { reserveDespesaNumber } from "@/lib/db/numbering";
import { getAtualVersion } from "@/lib/queries";
import { isR2Configured, putObject } from "@/lib/storage/r2";
import { isAiConfigured } from "@/lib/ai/despesa-extract";
import {
  extractExtratoFromDocument,
  extractExtratoFromText,
  type ExtratoExtraido,
} from "@/lib/ai/extrato-extract";

/** Formatos aceitos na leitura por IA do extrato (PDF/imagens). */
const EXTRATO_AI_MIME = [
  "application/pdf",
  "image/png",
  "image/jpeg",
  "image/webp",
  "image/gif",
] as const;

/**
 * Lê um extrato bancário em PDF (ou imagem) por IA e retorna as movimentações
 * identificadas para conferência na mesma tela de pré-visualização usada pelos
 * formatos XLSX/CSV. O PDF original é armazenado (R2) para consulta/auditoria.
 * A importação só ocorre após o usuário confirmar — nada é gravado aqui.
 */
export async function extractExtratoPdf(
  formData: FormData,
): Promise<ExtratoExtraido & { error?: string }> {
  // IMPORTANTE: em produção o Next.js redige (esconde) a mensagem de qualquer
  // erro LANÇADO por uma Server Action, substituindo por um texto genérico
  // ("An error occurred in the Server Components render…"). Por isso RETORNAMOS
  // os erros em `error` — assim a mensagem real chega ao usuário na tela.
  const empty: ExtratoExtraido = { movimentos: [], saldoFinal: null };
  const ctx = await getActiveContext();
  if (!ctx || !can(ctx.perms, "caixa", "editar")) {
    return { ...empty, error: "Sem permissão para importar extrato." };
  }
  const file = formData.get("file") as File | null;
  if (!file || file.size === 0) return { ...empty, error: "Selecione um arquivo de extrato." };
  // Limite alinhado ao bodySizeLimit das Server Actions (12 MB no next.config):
  // acima disso o Next rejeita o upload antes da action rodar.
  if (file.size > 10 * 1024 * 1024) {
    return { ...empty, error: "Arquivo deve ter até 10 MB. Para extratos maiores, envie XLSX/CSV." };
  }
  const mime = file.type || "";
  if (!(EXTRATO_AI_MIME as readonly string[]).includes(mime)) {
    return { ...empty, error: "Envie um PDF ou imagem (PNG, JPG ou WebP) do extrato." };
  }
  const bytes = new Uint8Array(await file.arrayBuffer());
  // Com IA configurada, usa a leitura por IA (melhor precisão, inclusive imagens).
  // Sem IA, faz leitura de TEXTO do PDF (unpdf) por heurística — o usuário revisa
  // e ajusta na tela de conferência. Imagens sem IA não são suportadas.
  let result: ExtratoExtraido;
  try {
    if (isAiConfigured()) {
      result = await extractExtratoFromDocument(bytes, mime);
    } else if (mime === "application/pdf") {
      result = await extractExtratoFromText(bytes);
    } else {
      return {
        ...empty,
        error:
          "Leitura de imagem exige IA (ANTHROPIC_API_KEY). Para PDF sem IA, envie o PDF com texto; ou use XLSX/CSV.",
      };
    }
  } catch (e) {
    console.error("[extrato] falha ao ler PDF/imagem:", e);
    const detail = e instanceof Error ? e.message : String(e);
    return {
      ...empty,
      error:
        `Falha ao ler o arquivo do extrato (${detail}). ` +
        "Se o PDF for escaneado/imagem (sem texto), ative a leitura por IA em " +
        "Config → Diagnóstico de IA, ou envie o extrato em XLSX/CSV.",
    };
  }
  if (result.movimentos.length === 0) {
    return {
      ...result,
      error:
        "Não identifiquei movimentações no texto do PDF. Ele pode ser escaneado/imagem " +
        "(sem texto) — ative a leitura por IA em Config → Diagnóstico de IA, ou envie XLSX/CSV.",
    };
  }

  // Guarda o arquivo original do extrato para auditoria (quando o R2 existe).
  const bankAccountId = (formData.get("bankAccountId") as string) || null;
  if (isR2Configured()) {
    try {
      const safe = file.name.replace(/[^\w.\-]+/g, "_");
      const key = `tenants/${ctx.tenant.id}/extratos/${Date.now()}_${safe}`;
      await putObject(key, bytes, file.type || "application/octet-stream");
      await db.insert(schema.documents).values({
        tenantId: ctx.tenant.id,
        storageKey: key,
        filename: file.name,
        contentType: file.type || null,
        size: file.size,
        tipo: "Extrato bancário",
        uploadedBy: ctx.userEmail || ctx.userId || null,
      });
    } catch {
      // Falha ao armazenar o original não impede a conferência/importação.
    }
  }

  await logAudit({
    tenantId: ctx.tenant.id,
    userId: ctx.userId,
    action: "extrato.readPdf",
    entity: "cash_entry",
    entityId: bankAccountId ?? "—",
    meta: { arquivo: file.name, movimentos: result.movimentos.length },
  });
  return result;
}

/** "MM/DD/YYYY" | "MM/YYYY" → "MM/YYYY" (para casar por competência). */
function monthKeyFrom(d?: string | null): string | null {
  if (!d) return null;
  const p = d.split("/");
  if (p.length === 3) return `${p[0].padStart(2, "0")}/${p[2]}`;
  if (p.length === 2) return `${p[0].padStart(2, "0")}/${p[1]}`;
  return null;
}

const cents = (v: number) => Math.round(v * 100);

export async function addCash(formData: FormData) {
  const ctx = await getActiveContext();
  if (!ctx || !can(ctx.perms, "caixa", "criar")) return;
  if (ctx.version.locked) throw new Error("Versão congelada.");

  // Tipo de lançamento define o sinal do valor e a categoria:
  //  - receita: entrada (+), categoria escolhida (mensais/AS/…);
  //  - despesa: saída (−), lançamento avulso do extrato sem contraparte;
  //  - ajuste:  ajuste manual de caixa, + ou − conforme "sinal".
  // Entradas de ajuste e avulsas do extrato já nascem conciliadas (não têm
  // contraparte nos módulos de receita/despesa para casar).
  const tipo = ((formData.get("tipo") as string) || "receita").toLowerCase();
  const magnitude = Math.abs(Number(formData.get("valor")) || 0);

  let sign = 1;
  let cat = (formData.get("cat") as string) || "outro";
  let rec = false;
  if (tipo === "despesa") {
    sign = -1;
    cat = "despesa_extrato";
    rec = true;
  } else if (tipo === "ajuste") {
    sign = (formData.get("sinal") as string) === "menos" ? -1 : 1;
    cat = "ajuste";
    rec = true;
  } else if (tipo === "receita" && cat === "extrato") {
    // Receita avulsa do extrato (sem categoria de receita conhecida).
    cat = "receita_extrato";
    rec = true;
  }

  const [row] = await db
    .insert(schema.cashEntries)
    .values({
      versionId: ctx.version.id,
      tenantId: ctx.tenant.id,
      data: (formData.get("data") as string) || null,
      descricao: (formData.get("descricao") as string) || null,
      valor: String(sign * magnitude),
      cat,
      unitCode: (formData.get("unitCode") as string) || null,
      bankAccountId: (formData.get("bankAccountId") as string) || null,
      rec,
    })
    .returning();

  await logAudit({
    tenantId: ctx.tenant.id,
    userId: ctx.userId,
    action: tipo === "ajuste" ? "cash.adjust" : "cash.create",
    entity: "cash_entry",
    entityId: row.id,
    meta: { tipo, cat, valor: row.valor },
  });
  revalidatePath("/caixa");
}

export interface ImportCashRow {
  data?: string;
  descricao?: string;
  valor?: number;
  cat?: string;
  /** nº do documento do extrato (para dedup e exibição). */
  doc?: string;
}

export interface ImportExtratoInput {
  rows: ImportCashRow[];
  /** conta corrente à qual os lançamentos e o saldo final pertencem. */
  bankAccountId?: string | null;
  /** saldo final do extrato — atualiza o saldo da conta se informado. */
  saldoFinal?: number | null;
}

export interface ImportExtratoResult {
  inserted: number;
  conciliated: number;
  saldoUpdated: boolean;
  /** lançamentos ignorados por já terem sido importados antes (dedup). */
  skipped: number;
}

/** Assinatura de dedup de um lançamento do extrato (por conta). */
function importSignature(
  bankAccountId: string | null,
  data: string | null | undefined,
  valor: number,
  doc: string | null | undefined,
): string {
  return `${bankAccountId ?? "-"}|${(data ?? "").trim()}|${cents(valor)}|${(doc ?? "").trim()}`;
}

/**
 * Importa lançamentos de um extrato (XLSX/CSV) para uma conta corrente:
 *  1) atribui cada lançamento à conta informada;
 *  2) tenta casar (conciliar) automaticamente com as despesas previstas
 *     (por valor + mês) e com as receitas previstas das unidades (por valor);
 *  3) atualiza o saldo final da conta, quando informado.
 * Lançamentos sem correspondência ficam pendentes para conciliação manual.
 */
export async function importCash(
  input: ImportExtratoInput,
): Promise<ImportExtratoResult> {
  const ctx = await getActiveContext();
  if (!ctx || !can(ctx.perms, "caixa", "criar")) {
    throw new Error("Sem permissão para importar extrato.");
  }
  if (ctx.version.locked) throw new Error("Versão congelada.");

  const { rows, saldoFinal } = input;
  // Valida a conta (deve pertencer ao tenant).
  const contas = await db
    .select()
    .from(schema.bankAccounts)
    .where(eq(schema.bankAccounts.tenantId, ctx.tenant.id));
  const bankAccountId =
    input.bankAccountId && contas.some((c) => c.id === input.bankAccountId)
      ? input.bankAccountId
      : null;

  // Dedup: ignora lançamentos já importados antes (mesma conta, data, valor e
  // documento). Carrega as assinaturas existentes uma vez.
  const existentes = await db
    .select({ importHash: schema.cashEntries.importHash })
    .from(schema.cashEntries)
    .where(eq(schema.cashEntries.tenantId, ctx.tenant.id));
  const jaImportados = new Set(
    existentes.map((e) => e.importHash).filter((h): h is string => !!h),
  );

  const naoZero = rows.filter((r) => r.valor != null && r.valor !== 0);
  const vistos = new Set<string>();
  let skipped = 0;
  const valid = naoZero.filter((r) => {
    const sig = importSignature(bankAccountId, r.data, Number(r.valor), r.doc);
    if (jaImportados.has(sig) || vistos.has(sig)) {
      skipped++;
      return false;
    }
    vistos.add(sig);
    return true;
  });

  // Pools para conciliação automática.
  const [despesas, units] = await Promise.all([
    getDespesas(ctx.version.id),
    getUnits(ctx.version.id),
  ]);
  // Despesas previstas: chave (centavos|mês) → quantidade disponível.
  const despPool = new Map<string, number>();
  for (const d of despesas) {
    if (d.cancelado) continue;
    const mm = monthKeyFrom(d.competencia) ?? monthKeyFrom(d.vencimento);
    if (!mm) continue;
    const key = `${cents(Math.abs(Number(d.valor)))}|${mm}`;
    despPool.set(key, (despPool.get(key) ?? 0) + 1);
  }
  // Receitas previstas: conjunto de valores de parcela esperados (em centavos).
  const receitaVals = new Set<number>();
  for (const u of units) {
    const c = toCalcUnit(u);
    for (const val of [
      c.AS.val,
      c.S1.val,
      c.S2.val,
      c.S3.val,
      c.Mensais.val,
      c.Semestrais.val,
      c.Anuais.val,
      c.FGTS.val,
      c.Subsidio.val,
      c.Permuta.val,
    ]) {
      if (val && val > 0) receitaVals.add(cents(val));
    }
  }

  let conciliated = 0;
  const toInsert = valid.map((r) => {
    const v = Number(r.valor);
    let rec = false;
    let cat = r.cat || "extrato";
    if (v < 0) {
      // Saída → tenta casar com uma despesa prevista (valor + mês).
      const mm = monthKeyFrom(r.data);
      const key = `${cents(Math.abs(v))}|${mm}`;
      const avail = despPool.get(key) ?? 0;
      if (mm && avail > 0) {
        despPool.set(key, avail - 1);
        rec = true;
        cat = "despesa";
        conciliated++;
      }
    } else if (receitaVals.has(cents(v))) {
      // Entrada → casa com um valor de parcela previsto das unidades.
      rec = true;
      cat = "receita";
      conciliated++;
    }
    return {
      versionId: ctx.version.id,
      tenantId: ctx.tenant.id,
      bankAccountId,
      data: r.data || null,
      descricao: r.descricao || null,
      valor: String(v),
      cat,
      doc: r.doc || null,
      importHash: importSignature(bankAccountId, r.data, v, r.doc),
      rec,
    };
  });

  if (toInsert.length > 0) {
    await db.insert(schema.cashEntries).values(toInsert);
  }

  // Atualiza o saldo final da conta, se informado.
  let saldoUpdated = false;
  if (bankAccountId && saldoFinal != null && Number.isFinite(saldoFinal)) {
    await db
      .update(schema.bankAccounts)
      .set({
        saldo: String(saldoFinal),
        saldoSource: "auto",
        lastSync: new Date(),
      })
      .where(
        and(
          eq(schema.bankAccounts.id, bankAccountId),
          eq(schema.bankAccounts.tenantId, ctx.tenant.id),
        ),
      );
    saldoUpdated = true;
  }

  await logAudit({
    tenantId: ctx.tenant.id,
    userId: ctx.userId,
    action: "cash.import",
    entity: "cash_entry",
    meta: {
      count: toInsert.length,
      conciliated,
      skipped,
      bankAccountId,
      saldoUpdated,
    },
  });
  revalidatePath("/caixa");
  revalidatePath("/contas");
  return { inserted: toInsert.length, conciliated, saldoUpdated, skipped };
}

/** Alterna o estado de conciliação de um lançamento de caixa. */
export async function toggleConciliado(id: string, rec: boolean) {
  const ctx = await getActiveContext();
  if (!ctx || !can(ctx.perms, "caixa", "editar")) return;
  await db
    .update(schema.cashEntries)
    .set({ rec })
    .where(eq(schema.cashEntries.id, id));
  revalidatePath("/caixa");
}

/**
 * Concilia um movimento do extrato com uma conta a pagar (despesa) escolhida
 * pelo usuário: marca a despesa como PAGA (data e banco do movimento), vincula o
 * movimento à despesa e registra a auditoria. Nada é conciliado automaticamente
 * — só por esta ação. Um movimento não pode ser conciliado mais de uma vez.
 */
export async function conciliarDespesa(input: {
  cashEntryId: string;
  despesaId: string;
}): Promise<void> {
  const ctx = await getActiveContext();
  if (!ctx || !can(ctx.perms, "caixa", "editar")) {
    throw new Error("Sem permissão para conciliar.");
  }
  const [mov] = await db
    .select()
    .from(schema.cashEntries)
    .where(
      and(
        eq(schema.cashEntries.id, input.cashEntryId),
        eq(schema.cashEntries.tenantId, ctx.tenant.id),
      ),
    )
    .limit(1);
  if (!mov) throw new Error("Movimento não encontrado.");
  if (mov.rec || mov.conciliadoDespesaId) {
    throw new Error("Este movimento já está conciliado.");
  }
  const [desp] = await db
    .select()
    .from(schema.despesas)
    .where(
      and(
        eq(schema.despesas.id, input.despesaId),
        eq(schema.despesas.tenantId, ctx.tenant.id),
      ),
    )
    .limit(1);
  if (!desp) throw new Error("Despesa não encontrada.");
  if (desp.cancelado) throw new Error("Despesa cancelada.");
  if (desp.status === "Pago") {
    throw new Error("Esta despesa já está paga. Escolha outra ou desfaça o pagamento antes.");
  }

  const agora = new Date().toISOString();
  await db
    .update(schema.despesas)
    .set({
      status: "Pago",
      dataCaixa: mov.data,
      bancoId: mov.bankAccountId ?? desp.bancoId,
    })
    .where(eq(schema.despesas.id, desp.id));
  await db
    .update(schema.cashEntries)
    .set({
      rec: true,
      conciliadoDespesaId: desp.id,
      conciliadoPor: ctx.userEmail || ctx.userId || null,
      conciliadoEm: agora,
    })
    .where(eq(schema.cashEntries.id, mov.id));

  await logAudit({
    tenantId: ctx.tenant.id,
    userId: ctx.userId,
    action: "conciliacao.create",
    entity: "cash_entry",
    entityId: mov.id,
    meta: { despesaId: desp.id, numDoc: desp.numDoc, valor: mov.valor, data: mov.data },
  });
  revalidatePath("/caixa");
  revalidatePath("/despesas");
  revalidatePath("/contaspagar");
}

/**
 * Desfaz uma conciliação (somente usuários autorizados): restaura a despesa para
 * "A pagar" (remove data de pagamento) e libera o movimento. Preserva o registro
 * de auditoria da operação.
 */
export async function desfazerConciliacao(cashEntryId: string): Promise<void> {
  const ctx = await getActiveContext();
  if (!ctx || !can(ctx.perms, "caixa", "excluir")) {
    throw new Error("Sem permissão para desfazer conciliação.");
  }
  const [mov] = await db
    .select()
    .from(schema.cashEntries)
    .where(
      and(
        eq(schema.cashEntries.id, cashEntryId),
        eq(schema.cashEntries.tenantId, ctx.tenant.id),
      ),
    )
    .limit(1);
  if (!mov) throw new Error("Movimento não encontrado.");
  // Entrada conciliada a uma conta a receber: estorna o recebimento.
  if (mov.conciliadoContaReceberId) {
    const [cr] = await db
      .select()
      .from(schema.contasReceber)
      .where(
        and(
          eq(schema.contasReceber.id, mov.conciliadoContaReceberId),
          eq(schema.contasReceber.tenantId, ctx.tenant.id),
        ),
      )
      .limit(1);
    if (cr) {
      const novoReceb = Math.max(0, Number(cr.valorRecebido) - Math.abs(Number(mov.valor)));
      await db
        .update(schema.contasReceber)
        .set({
          valorRecebido: String(novoReceb),
          status: novoReceb <= 0 ? "A receber" : "Parcialmente recebido",
          dataRecebimento: novoReceb <= 0 ? null : cr.dataRecebimento,
        })
        .where(eq(schema.contasReceber.id, cr.id));
    }
    await db
      .update(schema.cashEntries)
      .set({ rec: false, conciliadoContaReceberId: null, conciliadoPor: null, conciliadoEm: null })
      .where(eq(schema.cashEntries.id, mov.id));
    await logAudit({
      tenantId: ctx.tenant.id,
      userId: ctx.userId,
      action: "conciliacao.undo",
      entity: "cash_entry",
      entityId: mov.id,
      meta: { contaReceberId: mov.conciliadoContaReceberId },
    });
    revalidatePath("/caixa");
    revalidatePath("/contasreceber");
    return;
  }
  if (!mov.conciliadoDespesaId) {
    // Nada vinculado: apenas garante o flag desmarcado.
    await db.update(schema.cashEntries).set({ rec: false }).where(eq(schema.cashEntries.id, mov.id));
    revalidatePath("/caixa");
    return;
  }
  await db
    .update(schema.despesas)
    .set({ status: "A pagar", dataCaixa: null })
    .where(
      and(
        eq(schema.despesas.id, mov.conciliadoDespesaId),
        eq(schema.despesas.tenantId, ctx.tenant.id),
      ),
    );
  await db
    .update(schema.cashEntries)
    .set({ rec: false, conciliadoDespesaId: null, conciliadoPor: null, conciliadoEm: null })
    .where(eq(schema.cashEntries.id, mov.id));

  await logAudit({
    tenantId: ctx.tenant.id,
    userId: ctx.userId,
    action: "conciliacao.undo",
    entity: "cash_entry",
    entityId: mov.id,
    meta: { despesaId: mov.conciliadoDespesaId },
  });
  revalidatePath("/caixa");
  revalidatePath("/despesas");
  revalidatePath("/contaspagar");
}

/**
 * Concilia uma ENTRADA do extrato com uma conta a receber existente (item 7):
 * marca a conta como recebida (total/parcial), vincula o movimento e audita.
 * Impede conciliar um movimento já processado (conciliado ou convertido).
 */
export async function conciliarContaReceber(input: {
  cashEntryId: string;
  contaReceberId: string;
}): Promise<void> {
  const ctx = await getActiveContext();
  if (!ctx || !can(ctx.perms, "caixa", "editar")) {
    throw new Error("Sem permissão para conciliar.");
  }
  const [mov] = await db
    .select()
    .from(schema.cashEntries)
    .where(and(eq(schema.cashEntries.id, input.cashEntryId), eq(schema.cashEntries.tenantId, ctx.tenant.id)))
    .limit(1);
  if (!mov) throw new Error("Movimento não encontrado.");
  if (mov.rec || mov.conciliadoDespesaId || mov.conciliadoContaReceberId) {
    throw new Error("Este movimento já está processado.");
  }
  const [cr] = await db
    .select()
    .from(schema.contasReceber)
    .where(and(eq(schema.contasReceber.id, input.contaReceberId), eq(schema.contasReceber.tenantId, ctx.tenant.id)))
    .limit(1);
  if (!cr) throw new Error("Conta a receber não encontrada.");
  if (cr.cancelado || cr.status === "Recebido") {
    throw new Error("Esta conta a receber já está recebida ou cancelada.");
  }
  const valorMov = Math.abs(Number(mov.valor));
  const novoReceb = Number(cr.valorRecebido) + valorMov;
  const total = Number(cr.valor);
  const status = novoReceb + 0.01 >= total ? "Recebido" : "Parcialmente recebido";
  const agora = new Date().toISOString();
  await db
    .update(schema.contasReceber)
    .set({
      valorRecebido: String(novoReceb),
      status,
      dataRecebimento: mov.data,
      bancoId: mov.bankAccountId ?? cr.bancoId,
    })
    .where(eq(schema.contasReceber.id, cr.id));
  await db
    .update(schema.cashEntries)
    .set({
      rec: true,
      conciliadoContaReceberId: cr.id,
      conciliadoPor: ctx.userEmail || ctx.userId || null,
      conciliadoEm: agora,
    })
    .where(eq(schema.cashEntries.id, mov.id));
  await logAudit({
    tenantId: ctx.tenant.id,
    userId: ctx.userId,
    action: "conciliacao.receber",
    entity: "cash_entry",
    entityId: mov.id,
    meta: { contaReceberId: cr.id, valor: valorMov, status },
  });
  revalidatePath("/caixa");
  revalidatePath("/contasreceber");
}

/**
 * Transforma um item do extrato em uma NOVA conta (item 6): saída → conta a
 * pagar (despesa, já paga na data do movimento); entrada → conta a receber (já
 * recebida). Vincula o movimento à conta criada (rastreabilidade) e o marca como
 * processado, impedindo que o mesmo item seja conciliado E convertido.
 */
export async function criarContaFromExtrato(cashEntryId: string): Promise<void> {
  const ctx = await getActiveContext();
  if (!ctx || !can(ctx.perms, "caixa", "editar")) {
    throw new Error("Sem permissão.");
  }
  const [mov] = await db
    .select()
    .from(schema.cashEntries)
    .where(and(eq(schema.cashEntries.id, cashEntryId), eq(schema.cashEntries.tenantId, ctx.tenant.id)))
    .limit(1);
  if (!mov) throw new Error("Movimento não encontrado.");
  if (mov.rec || mov.conciliadoDespesaId || mov.conciliadoContaReceberId) {
    throw new Error("Este movimento já foi processado (conciliado ou convertido).");
  }
  const [ver] = await db
    .select({ projectId: schema.versions.projectId })
    .from(schema.versions)
    .where(eq(schema.versions.id, mov.versionId))
    .limit(1);
  if (!ver) throw new Error("Versão do movimento não encontrada.");
  const valor = Number(mov.valor);
  // Trava contra registros de valor ZERO: antes, um movimento de valor 0 caía
  // no ramo "else" (entrada) e gerava uma conta a receber "Recebido" de valor
  // zero — exatamente o tipo de receita fantasma relatado. Sem justificativa de
  // negócio, um lançamento de valor nulo não deve ser criado automaticamente.
  if (!Number.isFinite(valor) || valor === 0) {
    throw new Error(
      "Movimento de valor zero não gera conta a pagar/receber. Corrija o valor do movimento antes de convertê-lo.",
    );
  }
  const agora = new Date().toISOString();

  if (valor < 0) {
    // Saída → nova conta a pagar (despesa), já paga na data do movimento.
    const numDoc = await reserveDespesaNumber(ctx.tenant.id);
    const [desp] = await db
      .insert(schema.despesas)
      .values({
        versionId: mov.versionId,
        tenantId: ctx.tenant.id,
        numDoc,
        valor: String(Math.abs(valor)),
        status: "Pago",
        vencimento: mov.data,
        dataCaixa: mov.data,
        bancoId: mov.bankAccountId,
        obs: mov.descricao ?? "Convertido do extrato",
      })
      .returning();
    await db
      .update(schema.cashEntries)
      .set({ rec: true, conciliadoDespesaId: desp.id, conciliadoPor: ctx.userEmail || ctx.userId || null, conciliadoEm: agora })
      .where(eq(schema.cashEntries.id, mov.id));
    await logAudit({
      tenantId: ctx.tenant.id,
      userId: ctx.userId,
      action: "extrato.criarContaPagar",
      entity: "despesa",
      entityId: desp.id,
      meta: { cashEntryId: mov.id, valor: desp.valor },
    });
    revalidatePath("/despesas");
    revalidatePath("/contaspagar");
  } else {
    // Entrada → nova conta a receber, já recebida na data do movimento.
    const [cr] = await db
      .insert(schema.contasReceber)
      .values({
        tenantId: ctx.tenant.id,
        projectId: ver.projectId,
        descricao: mov.descricao ?? "Convertido do extrato",
        tipo: "Outros",
        valor: String(valor),
        vencimento: mov.data,
        dataRecebimento: mov.data,
        valorRecebido: String(valor),
        status: "Recebido",
        bancoId: mov.bankAccountId,
        origemCashEntryId: mov.id,
        createdBy: ctx.userEmail || ctx.userId || null,
      })
      .returning();
    await db
      .update(schema.cashEntries)
      .set({ rec: true, conciliadoContaReceberId: cr.id, conciliadoPor: ctx.userEmail || ctx.userId || null, conciliadoEm: agora })
      .where(eq(schema.cashEntries.id, mov.id));
    await logAudit({
      tenantId: ctx.tenant.id,
      userId: ctx.userId,
      action: "extrato.criarContaReceber",
      entity: "conta_receber",
      entityId: cr.id,
      meta: { cashEntryId: mov.id, valor: cr.valor },
    });
    revalidatePath("/contasreceber");
  }
  revalidatePath("/caixa");
}

// ───────── Triagem por linha do extrato (Adicionar / Parear / Ignorar) ─────────
// Cada linha lida do extrato (ainda NÃO importada) pode ser: pareada com uma
// conta a pagar/receber já lançada (conciliação automática), enviada para o
// cadastro de despesa/receita (Adicionar) ou ignorada. Aqui ficam as ações de
// (a) buscar candidatos de conciliação e (b) confirmar o pareamento.

/** Uma linha do extrato em conferência (movimentação bancária ainda não gravada). */
export interface MovimentoTriage {
  /** data "MM/DD/YYYY". */
  data?: string | null;
  descricao?: string | null;
  /** valor com sinal: negativo = saída/despesa, positivo = entrada/receita. */
  valor: number;
  /** nº do documento do extrato. */
  doc?: string | null;
}

export interface CandidatoMatch {
  id: string;
  tipo: "despesa" | "receita";
  /** fornecedor (despesa) ou cliente (receita). */
  nome: string;
  descricao: string;
  projectName: string | null;
  /** valor previsto a pagar/receber. */
  valor: number;
  vencimento: string | null;
  grau: "alta" | "media" | "baixa";
}

const normNome = (s: string) =>
  (s || "").toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "").trim();

/** "MM/DD/YYYY" → nº de dias (para proximidade de datas). null se inválido. */
function dayNum(d?: string | null): number | null {
  if (!d) return null;
  const p = d.split("/");
  if (p.length !== 3) return null;
  const [mm, dd, yy] = p.map((x) => Number(x));
  if (!mm || !dd || !yy) return null;
  return Math.floor(Date.UTC(yy, mm - 1, dd) / 86400000);
}

/**
 * Candidatos de conciliação para UMA linha do extrato (ainda não importada):
 * saída → contas a pagar em aberto; entrada → contas a receber em aberto.
 * Ranqueia dando preferência a valores IGUAIS e a fornecedor/cliente que aparece
 * na descrição; usa proximidade de data como desempate. Retorna os melhores.
 */
export async function matchCandidatosMovimento(
  mov: MovimentoTriage,
  /** termo de busca manual (opcional) — permite achar QUALQUER lançamento. */
  q?: string,
): Promise<{ tipo: "saida" | "entrada"; candidatos: CandidatoMatch[] }> {
  const tipo: "saida" | "entrada" = Number(mov.valor) < 0 ? "saida" : "entrada";
  const ctx = await getActiveContext();
  if (!ctx || !can(ctx.perms, "caixa", "editar")) return { tipo, candidatos: [] };

  const alvoCents = cents(Math.abs(Number(mov.valor) || 0));
  const tol = Math.max(50, Math.round(alvoCents * 0.02)); // 2% ou R$ 0,50
  const descNorm = normNome(mov.descricao ?? "");
  const movDay = dayNum(mov.data);
  const rankGrau = { alta: 0, media: 1, baixa: 2 } as const;
  const busca = (q ?? "").trim();

  /**
   * Avalia um lançamento em aberto como candidato.
   *
   * IMPORTANTE: nenhum candidato é DESCARTADO por diferença de valor. Antes, um
   * lançamento cujo valor diferisse mais de 2% era eliminado, e a tela auxiliar
   * aparecia vazia sempre que o extrato não batia ao centavo — que é o caso
   * comum (juros, desconto, tarifa, pagamento parcial). Agora a diferença apenas
   * REBAIXA o grau de compatibilidade, e o usuário decide.
   */
  function avaliar(
    id: string,
    kind: "despesa" | "receita",
    nome: string | null,
    descricao: string | null,
    projectName: string | null,
    valorPrev: number,
    restante: number,
    vencimento: string | null,
  ): (CandidatoMatch & { _prox: number; _score: number }) | null {
    // Busca manual: quando há termo, ele filtra (busca inteligente por
    // similaridade em nome, descrição, projeto e valor).
    if (
      busca &&
      !registroCasa(busca, [nome, descricao, projectName, vencimento], [valorPrev])
    ) {
      return null;
    }
    const candCents = cents(Math.abs(restante > 0 ? restante : valorPrev));
    const diff = Math.abs(candCents - alvoCents);
    const exato = diff === 0;
    const aprox = diff <= tol;
    const primeiro = normNome(nome ?? "").split(/\s+/)[0] ?? "";
    const nomeMatch = primeiro.length >= 3 && descNorm.includes(primeiro);
    const vd = dayNum(vencimento);
    const prox = movDay != null && vd != null ? Math.abs(movDay - vd) : 9999;
    const dataProx =
      (movDay != null && vd != null && (prox <= 15 || vd <= movDay)) || false;
    let grau: "alta" | "media" | "baixa";
    if (exato && (dataProx || nomeMatch)) grau = "alta";
    else if (exato || (aprox && (dataProx || nomeMatch))) grau = "media";
    else grau = "baixa";
    // Score de ordenação: menor = mais relevante. A diferença de valor pesa,
    // mas não elimina.
    const _score = diff / 100 + (nomeMatch ? -1000 : 0) + Math.min(prox, 365);
    return {
      id,
      tipo: kind,
      nome: nome ?? "—",
      descricao: descricao ?? "—",
      projectName,
      valor: valorPrev,
      vencimento,
      grau,
      _prox: prox,
      _score,
    };
  }

  const out: (CandidatoMatch & { _prox: number; _score: number })[] = [];
  if (tipo === "saida") {
    const contas = await getContasPagar(ctx.tenant.id);
    for (const c of contas) {
      if (c.status === "Pago" || c.status === "Cancelada") continue;
      const cand = avaliar(
        c.id,
        "despesa",
        c.fornecedorNome,
        c.descricao || c.numDoc,
        c.projectName,
        c.valor,
        0,
        c.vencimento,
      );
      if (cand) out.push(cand);
    }
  } else {
    const contas = await getContasReceber(ctx.tenant.id);
    for (const c of contas) {
      if (c.status === "Recebido" || c.status === "Cancelado") continue;
      const restante = Number(c.valor) - Number(c.valorRecebido || 0);
      const cand = avaliar(
        c.id,
        "receita",
        c.clienteNome,
        c.descricao || c.tipo,
        c.projectName,
        c.valor,
        restante,
        c.vencimento,
      );
      if (cand) out.push(cand);
    }
  }

  out.sort((a, b) => {
    const g = rankGrau[a.grau] - rankGrau[b.grau];
    if (g !== 0) return g;
    return a._score - b._score;
  });
  // Limite maior: como nada é descartado por valor, a lista precisa caber os
  // casos em que o usuário procura manualmente.
  const candidatos: CandidatoMatch[] = out.slice(0, 40).map((c) => ({
    id: c.id,
    tipo: c.tipo,
    nome: c.nome,
    descricao: c.descricao,
    projectName: c.projectName,
    valor: c.valor,
    vencimento: c.vencimento,
    grau: c.grau,
  }));
  return { tipo, candidatos };
}

export interface PairMovimentoInput {
  mov: MovimentoTriage;
  bankAccountId?: string | null;
  alvoId: string;
  alvoTipo: "despesa" | "receita";
}

/**
 * Confirma o pareamento de uma linha do extrato com uma conta a pagar/receber:
 * grava a movimentação bancária (cashEntry) e concilia automaticamente com o
 * alvo escolhido (marca a despesa como Paga ou soma o recebimento na conta a
 * receber). Reaproveita um cashEntry pendente de mesma assinatura, se houver.
 * RETORNA o erro (em vez de lançar) para a mensagem chegar à tela em produção.
 */
export async function pairMovimento(
  input: PairMovimentoInput,
): Promise<{ ok: boolean; error?: string }> {
  const ctx = await getActiveContext();
  if (!ctx || !can(ctx.perms, "caixa", "editar")) {
    return { ok: false, error: "Sem permissão para conciliar." };
  }
  if (ctx.version.locked) return { ok: false, error: "Versão congelada." };
  const { mov, alvoId, alvoTipo } = input;
  const valor = Number(mov.valor);
  if (!Number.isFinite(valor) || valor === 0) {
    return { ok: false, error: "Movimento sem valor válido." };
  }
  if (alvoTipo === "despesa" && valor >= 0) {
    return { ok: false, error: "Só é possível parear despesas com saídas do extrato." };
  }
  if (alvoTipo === "receita" && valor <= 0) {
    return { ok: false, error: "Só é possível parear receitas com entradas do extrato." };
  }

  const contas = await db
    .select({ id: schema.bankAccounts.id })
    .from(schema.bankAccounts)
    .where(eq(schema.bankAccounts.tenantId, ctx.tenant.id));
  const bankAccountId =
    input.bankAccountId && contas.some((c) => c.id === input.bankAccountId)
      ? input.bankAccountId
      : null;

  try {
    // Reaproveita um movimento já importado (mesma assinatura) se ainda estiver
    // pendente; senão insere um novo cashEntry para a movimentação bancária.
    const sig = importSignature(bankAccountId, mov.data, valor, mov.doc);
    const existentes = await db
      .select()
      .from(schema.cashEntries)
      .where(
        and(
          eq(schema.cashEntries.tenantId, ctx.tenant.id),
          eq(schema.cashEntries.importHash, sig),
        ),
      );
    if (
      existentes.some(
        (e) => e.rec || e.conciliadoDespesaId || e.conciliadoContaReceberId,
      )
    ) {
      return { ok: false, error: "Este movimento já foi conciliado antes." };
    }
    const pend = existentes[0];
    let cashId: string;
    if (pend) {
      cashId = pend.id;
    } else {
      const [row] = await db
        .insert(schema.cashEntries)
        .values({
          versionId: ctx.version.id,
          tenantId: ctx.tenant.id,
          bankAccountId,
          data: mov.data || null,
          descricao: mov.descricao || null,
          valor: String(valor),
          cat: alvoTipo === "despesa" ? "despesa" : "receita",
          doc: mov.doc || null,
          importHash: sig,
          rec: false,
        })
        .returning();
      cashId = row.id;
    }
    if (alvoTipo === "despesa") {
      await conciliarDespesa({ cashEntryId: cashId, despesaId: alvoId });
    } else {
      await conciliarContaReceber({ cashEntryId: cashId, contaReceberId: alvoId });
    }
    return { ok: true };
  } catch (e) {
    console.error("[extrato] falha ao parear movimento:", e);
    return {
      ok: false,
      error: e instanceof Error ? e.message : "Falha ao conciliar o movimento.",
    };
  }
}

/**
 * "Adicionar" a partir do extrato: cria uma NOVA despesa (saída) ou conta a
 * receber (entrada) com os dados identificados no extrato e JÁ A DEIXA
 * CONCILIADA — paga (despesa) ou recebida (conta a receber).
 *
 * A conciliação é automática porque o lançamento nasce de um movimento que já
 * ocorreu no banco: se está no extrato, o dinheiro já entrou/saiu. Também grava
 * a movimentação de caixa e a vincula ao registro criado, para auditoria.
 *
 * Diferença para `criarContaFromExtrato`: aquela converte um movimento JÁ
 * IMPORTADO; esta recebe a linha do extrato ainda em conferência, junto dos
 * dados que o usuário revisou/completou na tela de cadastro.
 */
export async function criarLancamentoDoExtrato(input: {
  mov: MovimentoTriage;
  bankAccountId?: string | null;
  projectId: string;
  /** despesa (saída) */
  fornecedorId?: string | null;
  contaCef?: string | null;
  categoriaDre?: string | null;
  competencia?: string | null;
  obs?: string | null;
  /** conta a receber (entrada) */
  clienteId?: string | null;
  tipoReceita?: string | null;
}): Promise<{ ok: boolean; error?: string; id?: string }> {
  const ctx = await getActiveContext();
  if (!ctx || !can(ctx.perms, "caixa", "editar")) {
    return { ok: false, error: "Sem permissão." };
  }
  if (ctx.version.locked) return { ok: false, error: "Versão congelada." };

  const valor = Number(input.mov.valor);
  if (!Number.isFinite(valor) || valor === 0) {
    return { ok: false, error: "Movimento sem valor válido." };
  }
  const contas = await db
    .select({ id: schema.bankAccounts.id })
    .from(schema.bankAccounts)
    .where(eq(schema.bankAccounts.tenantId, ctx.tenant.id));
  const bankAccountId =
    input.bankAccountId && contas.some((c) => c.id === input.bankAccountId)
      ? input.bankAccountId
      : null;

  try {
    // Movimentação bancária correspondente (reaproveita se já existir pendente).
    const sig = importSignature(bankAccountId, input.mov.data, valor, input.mov.doc);
    const existentes = await db
      .select()
      .from(schema.cashEntries)
      .where(
        and(
          eq(schema.cashEntries.tenantId, ctx.tenant.id),
          eq(schema.cashEntries.importHash, sig),
        ),
      );
    if (
      existentes.some((e) => e.rec || e.conciliadoDespesaId || e.conciliadoContaReceberId)
    ) {
      return { ok: false, error: "Este movimento já foi conciliado antes." };
    }
    const agora = new Date().toISOString();
    const pend = existentes[0];
    let cashId: string;
    if (pend) {
      cashId = pend.id;
    } else {
      const [row] = await db
        .insert(schema.cashEntries)
        .values({
          versionId: ctx.version.id,
          tenantId: ctx.tenant.id,
          bankAccountId,
          data: input.mov.data || null,
          descricao: input.mov.descricao || null,
          valor: String(valor),
          cat: valor < 0 ? "despesa" : "receita",
          doc: input.mov.doc || null,
          importHash: sig,
          rec: false,
        })
        .returning();
      cashId = row.id;
    }

    if (valor < 0) {
      // ── SAÍDA → nova despesa, já PAGA na data do movimento ────────────────
      const versao = await getAtualVersion(ctx.tenant.id, input.projectId);
      if (!versao) return { ok: false, error: "Versão atual do projeto não encontrada." };
      const numDoc = input.mov.doc?.trim()
        ? input.mov.doc.trim()
        : await reserveDespesaNumber(ctx.tenant.id);
      const [desp] = await db
        .insert(schema.despesas)
        .values({
          versionId: versao.id,
          tenantId: ctx.tenant.id,
          numDoc,
          fornecedorId: input.fornecedorId || null,
          contaCef: input.contaCef || null,
          categoriaDre: (input.categoriaDre as never) || null,
          competencia: input.competencia || monthKeyFrom(input.mov.data),
          vencimento: input.mov.data || null,
          valor: String(Math.abs(valor)),
          // Identificada no extrato ⇒ já paga.
          status: "Pago",
          dataCaixa: input.mov.data || null,
          bancoId: bankAccountId,
          obs: input.obs || input.mov.descricao || null,
        })
        .returning();
      await db
        .update(schema.cashEntries)
        .set({
          rec: true,
          conciliadoDespesaId: desp.id,
          conciliadoPor: ctx.userEmail || ctx.userId || null,
          conciliadoEm: agora,
        })
        .where(eq(schema.cashEntries.id, cashId));
      await logAudit({
        tenantId: ctx.tenant.id,
        userId: ctx.userId,
        action: "extrato.criarDespesaConciliada",
        entity: "despesa",
        entityId: desp.id,
        meta: { cashEntryId: cashId, valor: desp.valor, numDoc },
      });
      revalidatePath("/despesas");
      revalidatePath("/contaspagar");
      revalidatePath("/caixa");
      return { ok: true, id: desp.id };
    }

    // ── ENTRADA → nova conta a receber, já RECEBIDA na data do movimento ────
    const [cr] = await db
      .insert(schema.contasReceber)
      .values({
        tenantId: ctx.tenant.id,
        projectId: input.projectId,
        clienteId: input.clienteId || null,
        descricao: input.obs || input.mov.descricao || "Identificado no extrato",
        tipo: input.tipoReceita || "Outros",
        valor: String(valor),
        vencimento: input.mov.data || null,
        // Identificada no extrato ⇒ já recebida.
        dataRecebimento: input.mov.data || null,
        valorRecebido: String(valor),
        status: "Recebido",
        bancoId: bankAccountId,
        origemCashEntryId: cashId,
        createdBy: ctx.userEmail || ctx.userId || null,
      })
      .returning();
    await db
      .update(schema.cashEntries)
      .set({
        rec: true,
        conciliadoContaReceberId: cr.id,
        conciliadoPor: ctx.userEmail || ctx.userId || null,
        conciliadoEm: agora,
      })
      .where(eq(schema.cashEntries.id, cashId));
    await logAudit({
      tenantId: ctx.tenant.id,
      userId: ctx.userId,
      action: "extrato.criarContaReceberConciliada",
      entity: "conta_receber",
      entityId: cr.id,
      meta: { cashEntryId: cashId, valor: cr.valor },
    });
    revalidatePath("/contasreceber");
    revalidatePath("/caixa");
    return { ok: true, id: cr.id };
  } catch (e) {
    console.error("[extrato] falha ao criar lançamento conciliado:", e);
    return {
      ok: false,
      error: e instanceof Error ? e.message : "Falha ao criar o lançamento.",
    };
  }
}
```

---

## 5. `cash_entry` no schema


**Não há enum.** Como em `stock_movement` e `time_entry`, a coluna que
parece categoria — `cat` — é `text` nullable, sem `CHECK` e sem `pgEnum`.
Os valores usados em código são:

| Valor de `cat` | Quem grava | Onde |
|---|---|---|
| `"ajuste"` | `addCash` (tipo = ajuste) | `caixa.ts:168` |
| `"despesa_extrato"` | `addCash` (tipo = despesa) | `caixa.ts:164` |
| `"receita_extrato"` | `addCash` (receita sem categoria) | `caixa.ts:172` |
| `"despesa"` / `"receita"` | `importCash` ao casar; `pairMovimento` | `caixa.ts:335`, `:341`, `:1006` |
| `"extrato"` | `importCash`, default quando a linha não casa | `caixa.ts:326` |
| `"acerto"` | `concluirAcerto` / `ratearEntreObras` | `actions/acerto.ts` |
| categoria de receita livre | `addCash` (tipo = receita) | `caixa.ts:160` |

A tela só rotula quatro deles (`CAT_LABEL`, `page.tsx:510–515`); qualquer
outro valor é exibido cru.

A conciliação mora em quatro colunas: `rec`, `conciliado_despesa_id`,
`conciliado_conta_receber_id`, `conciliado_por` e `conciliado_em`. Note que
**`conciliado_conta_receber_id` não tem FK** — é `uuid` solto
(`schema.ts:1231`), diferente de `conciliado_despesa_id`, que referencia
`despesa` com `set null`.

### `src/lib/db/schema.ts` · linhas 1201–1235

`cash_entry` inteira.

```ts
// ───────────────────────────── Caixa & INCC ─────────────────────────────

/** Lançamento de caixa (real) por versão, conciliável. Ver docs/SPEC.md §9.4. */
export const cashEntries = pgTable("cash_entry", {
  id: uuid("id").primaryKey().defaultRandom(),
  versionId: uuid("version_id")
    .notNull()
    .references(() => versions.id, { onDelete: "cascade" }),
  tenantId: uuid("tenant_id")
    .notNull()
    .references(() => tenants.id, { onDelete: "cascade" }),
  bankAccountId: uuid("bank_account_id").references(() => bankAccounts.id, {
    onDelete: "set null",
  }),
  data: text("data"),
  descricao: text("descricao"),
  valor: numeric("valor", { precision: 15, scale: 2 }).notNull().default("0"),
  cat: text("cat"),
  unitCode: text("unit_code"),
  /** nº do documento do extrato (quando importado). */
  doc: text("doc"),
  /** assinatura do lançamento importado (dedup do extrato). */
  importHash: text("import_hash"),
  /** conciliado com o extrato? */
  rec: boolean("rec").notNull().default(false),
  /** despesa conciliada a este movimento (para desfazer/histórico da conciliação). */
  conciliadoDespesaId: uuid("conciliado_despesa_id").references(() => despesas.id, {
    onDelete: "set null",
  }),
  /** conta a receber conciliada a este movimento (entradas). */
  conciliadoContaReceberId: uuid("conciliado_conta_receber_id"),
  /** usuário e data/hora da conciliação (auditoria). */
  conciliadoPor: text("conciliado_por"),
  conciliadoEm: text("conciliado_em"),
});
```

---

## 6. A aba "Conciliação"


### 6.1 O que a aba monta

Três coisas (`page.tsx:400–437`): a faixa de contadores
(conciliados / pendentes / saídas a conciliar), o `ConciliacaoReview` com as
sugestões, e a tabela completa de lançamentos com o `ConciliarToggle`.

### 6.2 Como o vínculo é criado hoje — três caminhos

| Caminho | Action | O que grava no vínculo |
|---|---|---|
| Toggle na tabela | `toggleConciliado` | **só `rec`** — nenhum vínculo |
| Botão de conciliar no review | `conciliarDespesa` / `conciliarContaReceber` | `rec`, `conciliado_*_id`, `conciliado_por`, `conciliado_em` |
| Pareamento do extrato | `pairMovimento` → chama as duas acima | idem |
| Importação | `importCash` | **só `rec = true`** — nenhum vínculo |

Isso merece destaque: `toggleConciliado` (`caixa.ts:400–408`) faz um `UPDATE`
de uma coluna e nada mais. Não grava `conciliado_despesa_id`, nem
`conciliado_por`, nem `conciliado_em`, **não verifica permissão de versão
congelada, não valida o tenant no `where`** e não registra auditoria. O mesmo
vale para a conciliação automática do `importCash`, que marca `rec = true` por
coincidência de valor e mês sem guardar com o quê casou.

O caminho completo — com vínculo e trilha — é o `conciliarDespesa`:
marca a despesa como `Pago`, copia `dataCaixa` e `bancoId` do movimento, e só
então grava as quatro colunas no `cash_entry`.

### 6.3 É um-para-um

**Sim, estritamente.** O vínculo é uma coluna única de cada lado:

- `conciliado_despesa_id` — um `uuid`, não um array nem uma tabela de ligação;
- `conciliado_conta_receber_id` — idem.

E há guarda explícita contra reuso: `conciliarDespesa` lança
*"Este movimento já está conciliado"* quando `mov.rec || mov.conciliadoDespesaId`
(`caixa.ts:435–437`), e `pairMovimento` recusa antes disso quando qualquer
movimento de mesma assinatura já foi conciliado (`caixa.ts:985–991`).

Não existe tabela `conciliacao_item` nem nada equivalente. **Um pagamento
único que quita várias despesas não é representável aqui** — esse caso é
justamente o que o módulo Acerto Contábil resolve, por outro caminho.

### 6.4 Não guarda valor

**Não.** Não há coluna de valor conciliado em lugar nenhum do vínculo. O que
existe é o `valor` do próprio `cash_entry` e o `valor` da despesa — dois
números independentes que ninguém compara na hora de conciliar.

`conciliarDespesa` **não verifica se os valores batem**: aceita casar um
movimento de R$ 1.000 com uma despesa de R$ 5.000, marca a despesa inteira
como `Pago` e não registra divergência. As únicas validações são: movimento
existe, despesa existe, despesa não cancelada, despesa não já paga.

Como consequência, **conciliação parcial não é representável**: ou a despesa
vira `Pago` inteira, ou nada acontece.

### `src/lib/actions/caixa.ts` · linhas 399–408

`toggleConciliado` — o caminho que não grava vínculo.

```ts
/** Alterna o estado de conciliação de um lançamento de caixa. */
export async function toggleConciliado(id: string, rec: boolean) {
  const ctx = await getActiveContext();
  if (!ctx || !can(ctx.perms, "caixa", "editar")) return;
  await db
    .update(schema.cashEntries)
    .set({ rec })
    .where(eq(schema.cashEntries.id, id));
  revalidatePath("/caixa");
}
```

### `src/lib/actions/caixa.ts` · linhas 410–484

`conciliarDespesa` — o caminho completo.

```ts
/**
 * Concilia um movimento do extrato com uma conta a pagar (despesa) escolhida
 * pelo usuário: marca a despesa como PAGA (data e banco do movimento), vincula o
 * movimento à despesa e registra a auditoria. Nada é conciliado automaticamente
 * — só por esta ação. Um movimento não pode ser conciliado mais de uma vez.
 */
export async function conciliarDespesa(input: {
  cashEntryId: string;
  despesaId: string;
}): Promise<void> {
  const ctx = await getActiveContext();
  if (!ctx || !can(ctx.perms, "caixa", "editar")) {
    throw new Error("Sem permissão para conciliar.");
  }
  const [mov] = await db
    .select()
    .from(schema.cashEntries)
    .where(
      and(
        eq(schema.cashEntries.id, input.cashEntryId),
        eq(schema.cashEntries.tenantId, ctx.tenant.id),
      ),
    )
    .limit(1);
  if (!mov) throw new Error("Movimento não encontrado.");
  if (mov.rec || mov.conciliadoDespesaId) {
    throw new Error("Este movimento já está conciliado.");
  }
  const [desp] = await db
    .select()
    .from(schema.despesas)
    .where(
      and(
        eq(schema.despesas.id, input.despesaId),
        eq(schema.despesas.tenantId, ctx.tenant.id),
      ),
    )
    .limit(1);
  if (!desp) throw new Error("Despesa não encontrada.");
  if (desp.cancelado) throw new Error("Despesa cancelada.");
  if (desp.status === "Pago") {
    throw new Error("Esta despesa já está paga. Escolha outra ou desfaça o pagamento antes.");
  }

  const agora = new Date().toISOString();
  await db
    .update(schema.despesas)
    .set({
      status: "Pago",
      dataCaixa: mov.data,
      bancoId: mov.bankAccountId ?? desp.bancoId,
    })
    .where(eq(schema.despesas.id, desp.id));
  await db
    .update(schema.cashEntries)
    .set({
      rec: true,
      conciliadoDespesaId: desp.id,
      conciliadoPor: ctx.userEmail || ctx.userId || null,
      conciliadoEm: agora,
    })
    .where(eq(schema.cashEntries.id, mov.id));

  await logAudit({
    tenantId: ctx.tenant.id,
    userId: ctx.userId,
    action: "conciliacao.create",
    entity: "cash_entry",
    entityId: mov.id,
    meta: { despesaId: desp.id, numDoc: desp.numDoc, valor: mov.valor, data: mov.data },
  });
  revalidatePath("/caixa");
  revalidatePath("/despesas");
  revalidatePath("/contaspagar");
}
```

### `src/lib/actions/caixa.ts` · linhas 486–583

`desfazerConciliacao` — o que é revertido.

```ts
/**
 * Desfaz uma conciliação (somente usuários autorizados): restaura a despesa para
 * "A pagar" (remove data de pagamento) e libera o movimento. Preserva o registro
 * de auditoria da operação.
 */
export async function desfazerConciliacao(cashEntryId: string): Promise<void> {
  const ctx = await getActiveContext();
  if (!ctx || !can(ctx.perms, "caixa", "excluir")) {
    throw new Error("Sem permissão para desfazer conciliação.");
  }
  const [mov] = await db
    .select()
    .from(schema.cashEntries)
    .where(
      and(
        eq(schema.cashEntries.id, cashEntryId),
        eq(schema.cashEntries.tenantId, ctx.tenant.id),
      ),
    )
    .limit(1);
  if (!mov) throw new Error("Movimento não encontrado.");
  // Entrada conciliada a uma conta a receber: estorna o recebimento.
  if (mov.conciliadoContaReceberId) {
    const [cr] = await db
      .select()
      .from(schema.contasReceber)
      .where(
        and(
          eq(schema.contasReceber.id, mov.conciliadoContaReceberId),
          eq(schema.contasReceber.tenantId, ctx.tenant.id),
        ),
      )
      .limit(1);
    if (cr) {
      const novoReceb = Math.max(0, Number(cr.valorRecebido) - Math.abs(Number(mov.valor)));
      await db
        .update(schema.contasReceber)
        .set({
          valorRecebido: String(novoReceb),
          status: novoReceb <= 0 ? "A receber" : "Parcialmente recebido",
          dataRecebimento: novoReceb <= 0 ? null : cr.dataRecebimento,
        })
        .where(eq(schema.contasReceber.id, cr.id));
    }
    await db
      .update(schema.cashEntries)
      .set({ rec: false, conciliadoContaReceberId: null, conciliadoPor: null, conciliadoEm: null })
      .where(eq(schema.cashEntries.id, mov.id));
    await logAudit({
      tenantId: ctx.tenant.id,
      userId: ctx.userId,
      action: "conciliacao.undo",
      entity: "cash_entry",
      entityId: mov.id,
      meta: { contaReceberId: mov.conciliadoContaReceberId },
    });
    revalidatePath("/caixa");
    revalidatePath("/contasreceber");
    return;
  }
  if (!mov.conciliadoDespesaId) {
    // Nada vinculado: apenas garante o flag desmarcado.
    await db.update(schema.cashEntries).set({ rec: false }).where(eq(schema.cashEntries.id, mov.id));
    revalidatePath("/caixa");
    return;
  }
  await db
    .update(schema.despesas)
    .set({ status: "A pagar", dataCaixa: null })
    .where(
      and(
        eq(schema.despesas.id, mov.conciliadoDespesaId),
        eq(schema.despesas.tenantId, ctx.tenant.id),
      ),
    );
  await db
    .update(schema.cashEntries)
    .set({ rec: false, conciliadoDespesaId: null, conciliadoPor: null, conciliadoEm: null })
    .where(eq(schema.cashEntries.id, mov.id));

  await logAudit({
    tenantId: ctx.tenant.id,
    userId: ctx.userId,
    action: "conciliacao.undo",
    entity: "cash_entry",
    entityId: mov.id,
    meta: { despesaId: mov.conciliadoDespesaId },
  });
  revalidatePath("/caixa");
  revalidatePath("/despesas");
  revalidatePath("/contaspagar");
}

/**
 * Concilia uma ENTRADA do extrato com uma conta a receber existente (item 7):
 * marca a conta como recebida (total/parcial), vincula o movimento e audita.
 * Impede conciliar um movimento já processado (conciliado ou convertido).
 */
```

### `src/lib/actions/caixa.ts` · linhas 929–1027

`pairMovimento` — o pareamento a partir do extrato.

```ts
export interface PairMovimentoInput {
  mov: MovimentoTriage;
  bankAccountId?: string | null;
  alvoId: string;
  alvoTipo: "despesa" | "receita";
}

/**
 * Confirma o pareamento de uma linha do extrato com uma conta a pagar/receber:
 * grava a movimentação bancária (cashEntry) e concilia automaticamente com o
 * alvo escolhido (marca a despesa como Paga ou soma o recebimento na conta a
 * receber). Reaproveita um cashEntry pendente de mesma assinatura, se houver.
 * RETORNA o erro (em vez de lançar) para a mensagem chegar à tela em produção.
 */
export async function pairMovimento(
  input: PairMovimentoInput,
): Promise<{ ok: boolean; error?: string }> {
  const ctx = await getActiveContext();
  if (!ctx || !can(ctx.perms, "caixa", "editar")) {
    return { ok: false, error: "Sem permissão para conciliar." };
  }
  if (ctx.version.locked) return { ok: false, error: "Versão congelada." };
  const { mov, alvoId, alvoTipo } = input;
  const valor = Number(mov.valor);
  if (!Number.isFinite(valor) || valor === 0) {
    return { ok: false, error: "Movimento sem valor válido." };
  }
  if (alvoTipo === "despesa" && valor >= 0) {
    return { ok: false, error: "Só é possível parear despesas com saídas do extrato." };
  }
  if (alvoTipo === "receita" && valor <= 0) {
    return { ok: false, error: "Só é possível parear receitas com entradas do extrato." };
  }

  const contas = await db
    .select({ id: schema.bankAccounts.id })
    .from(schema.bankAccounts)
    .where(eq(schema.bankAccounts.tenantId, ctx.tenant.id));
  const bankAccountId =
    input.bankAccountId && contas.some((c) => c.id === input.bankAccountId)
      ? input.bankAccountId
      : null;

  try {
    // Reaproveita um movimento já importado (mesma assinatura) se ainda estiver
    // pendente; senão insere um novo cashEntry para a movimentação bancária.
    const sig = importSignature(bankAccountId, mov.data, valor, mov.doc);
    const existentes = await db
      .select()
      .from(schema.cashEntries)
      .where(
        and(
          eq(schema.cashEntries.tenantId, ctx.tenant.id),
          eq(schema.cashEntries.importHash, sig),
        ),
      );
    if (
      existentes.some(
        (e) => e.rec || e.conciliadoDespesaId || e.conciliadoContaReceberId,
      )
    ) {
      return { ok: false, error: "Este movimento já foi conciliado antes." };
    }
    const pend = existentes[0];
    let cashId: string;
    if (pend) {
      cashId = pend.id;
    } else {
      const [row] = await db
        .insert(schema.cashEntries)
        .values({
          versionId: ctx.version.id,
          tenantId: ctx.tenant.id,
          bankAccountId,
          data: mov.data || null,
          descricao: mov.descricao || null,
          valor: String(valor),
          cat: alvoTipo === "despesa" ? "despesa" : "receita",
          doc: mov.doc || null,
          importHash: sig,
          rec: false,
        })
        .returning();
      cashId = row.id;
    }
    if (alvoTipo === "despesa") {
      await conciliarDespesa({ cashEntryId: cashId, despesaId: alvoId });
    } else {
      await conciliarContaReceber({ cashEntryId: cashId, contaReceberId: alvoId });
    }
    return { ok: true };
  } catch (e) {
    console.error("[extrato] falha ao parear movimento:", e);
    return {
      ok: false,
      error: e instanceof Error ? e.message : "Falha ao conciliar o movimento.",
    };
  }
}
```

### `src/app/(app)/caixa/page.tsx` · linhas 400–437

A aba, no `page.tsx`.

```tsx
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
```

---

## 7. Saldo do dia e saldo acumulado


Os dois são calculados no `page.tsx`, em memória. Não há coluna de saldo em
`cash_entry` nem função em `calc/`.

### 7.1 O agrupamento por dia

`cashByDay` (`page.tsx:153–164`) percorre **`cashAll`** — a lista SEM o filtro
de período — e soma, por data de calendário, entradas (`valor >= 0`) e saídas
(`valor < 0`, somadas em módulo).

Repare: é `cashAll`, não `cash`. **Os cartões de dia ignoram o filtro de
período** `de`/`ate` da barra superior; quem o respeita é a tabela de
lançamentos e os contadores da conciliação (`page.tsx:140`).

### 7.2 Saldo do dia

```ts
const saldoDia = mov.entradas - mov.saidas;
```

Por dia da janela (`page.tsx:170`). O card "Saldo do dia" do topo usa a mesma
conta só para hoje (`page.tsx:177–178`).

A janela é fixa: **2 dias passados + hoje + 7 futuros** = 10 cartões
(`DIAS_PASSADOS = 2`, `DIAS_FUTUROS = 7`, linhas 149–150). O rótulo
`Realizado` / `Hoje` / `Projeção` é só comparação de data — não olha `rec`.

### 7.3 Saldo acumulado

```ts
let acumulado = saldoTotal;
// … para cada dia da janela, em ordem:
acumulado += saldoDia;
```

(`page.tsx:165` e `:171`.) O ponto de partida é `saldoTotal =
saldoDisponivel(contas)` (`page.tsx:144`) — a soma dos saldos **gravados hoje**
nas contas correntes, excluindo as do tipo "Terceiros".

Duas características mecânicas disso:

- O acumulado **não parte de zero nem de um saldo histórico**: parte do saldo
  atual das contas e vai somando os deltas diários da janela — **inclusive os
  dos 2 dias passados**, que já ocorreram e portanto já estão refletidos no
  saldo gravado da conta. O primeiro cartão mostra, então, `saldo atual +
  movimento de anteontem`.
- O saldo das contas vem de `bank_account.saldo`, atualizado por `importCash`
  quando o extrato informa saldo final (`caixa.ts:364–378`, marcando
  `saldoSource: "auto"`). Entre importações ele é estático: lançamentos
  manuais em `cash_entry` **não** alteram `bank_account.saldo`.

### `src/app/(app)/caixa/page.tsx` · linhas 139–178

O bloco inteiro: filtro de período, saldo das contas, agrupamento por dia, janela e saldo de hoje.

```tsx
  // Filtro de período (item 3): entradas/saídas dentro do intervalo.
  const cash = de || ate ? cashAll.filter((c) => dateInRange(c.data, de, ate)) : cashAll;

  // Exclui contas do tipo "Terceiros": são obrigações com sócios/terceiros,
  // não dinheiro disponível da empresa.
  const saldoTotal = saldoDisponivel(contas);
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
```

---

## 8. O "Ajuste de Caixa"


### 8.1 O que grava

O ajuste é um dos três `tipo` do `addCash` (`caixa.ts:145–200`). Quando
`tipo === "ajuste"`:

| Campo | Valor |
|---|---|
| `cat` | `"ajuste"` — fixo |
| `valor` | `sign × magnitude`, com `sign = -1` se `sinal === "menos"`, senão `+1` |
| `rec` | **`true`** — nasce conciliado |
| `versionId` | `ctx.version.id` — a versão **ativa do contexto**, não a do seletor da tela |
| `data`, `descricao`, `unitCode`, `bankAccountId` | direto do formulário |

Auditoria: `action: "cash.adjust"` (os outros tipos gravam `"cash.create"`),
com `meta: { tipo, cat, valor }`.

O que **não** grava: nenhuma linha em `despesa`, nenhuma em `conta_receber`,
nenhum vínculo de conciliação. É uma linha solta em `cash_entry`. E não altera
`bank_account.saldo` — o saldo das contas continua o mesmo.

### 8.2 Entra na DRE? **Não.**

A DRE não lê `cash_entry` de forma alguma. Verificado por dois caminhos:

- `grep -i "cashEntries\|cash_entry"` em `src/app/(app)/dre/` → **zero
  ocorrências**;
- o mesmo grep em `src/lib/calc/` → zero (fora de um arquivo de teste).

A DRE é montada a partir de `despesa`, `budget_line`, `unit`, `reembolso`,
`permuta` e `conta_receber`. `cash_entry` é lido por `queries.ts`,
`dashboard/page.tsx`, o worker de Open Finance e as actions que movimentam
caixa — nenhum deles alimenta o resultado.

Ou seja: **o ajuste de caixa move o caixa e não move o resultado.** Ele
aparece nos cartões de dia desta tela e em quem mais leia `cash_entry`, e não
aparece em nenhuma linha da DRE.

### `src/lib/actions/caixa.ts` · linhas 145–200

`addCash` inteiro — os três tipos lado a lado.

```ts
export async function addCash(formData: FormData) {
  const ctx = await getActiveContext();
  if (!ctx || !can(ctx.perms, "caixa", "criar")) return;
  if (ctx.version.locked) throw new Error("Versão congelada.");

  // Tipo de lançamento define o sinal do valor e a categoria:
  //  - receita: entrada (+), categoria escolhida (mensais/AS/…);
  //  - despesa: saída (−), lançamento avulso do extrato sem contraparte;
  //  - ajuste:  ajuste manual de caixa, + ou − conforme "sinal".
  // Entradas de ajuste e avulsas do extrato já nascem conciliadas (não têm
  // contraparte nos módulos de receita/despesa para casar).
  const tipo = ((formData.get("tipo") as string) || "receita").toLowerCase();
  const magnitude = Math.abs(Number(formData.get("valor")) || 0);

  let sign = 1;
  let cat = (formData.get("cat") as string) || "outro";
  let rec = false;
  if (tipo === "despesa") {
    sign = -1;
    cat = "despesa_extrato";
    rec = true;
  } else if (tipo === "ajuste") {
    sign = (formData.get("sinal") as string) === "menos" ? -1 : 1;
    cat = "ajuste";
    rec = true;
  } else if (tipo === "receita" && cat === "extrato") {
    // Receita avulsa do extrato (sem categoria de receita conhecida).
    cat = "receita_extrato";
    rec = true;
  }

  const [row] = await db
    .insert(schema.cashEntries)
    .values({
      versionId: ctx.version.id,
      tenantId: ctx.tenant.id,
      data: (formData.get("data") as string) || null,
      descricao: (formData.get("descricao") as string) || null,
      valor: String(sign * magnitude),
      cat,
      unitCode: (formData.get("unitCode") as string) || null,
      bankAccountId: (formData.get("bankAccountId") as string) || null,
      rec,
    })
    .returning();

  await logAudit({
    tenantId: ctx.tenant.id,
    userId: ctx.userId,
    action: tipo === "ajuste" ? "cash.adjust" : "cash.create",
    entity: "cash_entry",
    entityId: row.id,
    meta: { tipo, cat, valor: row.valor },
  });
  revalidatePath("/caixa");
}
```

### `src/components/app/caixa-entry-form.tsx` · linhas 1–187

O formulário que o alimenta.

```tsx
"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { addCash } from "@/lib/actions/caixa";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input, Label, Select } from "@/components/ui/input";
import { DateField } from "@/components/ui/date-field";

interface Conta {
  id: string;
  banco: string;
  cc: string | null;
}

type Tipo = "receita" | "despesa" | "ajuste";

const TIPOS: { key: Tipo; label: string; hint: string }[] = [
  {
    key: "receita",
    label: "Receita",
    hint: "Entrada de caixa. Use “Avulsa (extrato)” quando não há contraparte no módulo de Receitas.",
  },
  {
    key: "despesa",
    label: "Despesa (extrato)",
    hint: "Saída que consta no extrato mas não foi encontrada/conciliada no módulo de Despesas.",
  },
  {
    key: "ajuste",
    label: "Ajuste de Caixa",
    hint: "Ajuste manual do saldo, para mais ou para menos (sem contraparte nos módulos).",
  },
];

export function CaixaEntryForm({ contas }: { contas: Conta[] }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);

  const [tipo, setTipo] = useState<Tipo>("receita");
  const [sinal, setSinal] = useState<"mais" | "menos">("mais");
  const [catReceita, setCatReceita] = useState("mensais");
  const [data, setData] = useState("");
  const [descricao, setDescricao] = useState("");
  const [valor, setValor] = useState("");
  const [bankAccountId, setBankAccountId] = useState("");

  const hint = TIPOS.find((t) => t.key === tipo)?.hint ?? "";

  const salvar = () => {
    setError(null);
    const mag = Math.abs(Number(valor) || 0);
    if (mag <= 0) {
      setError("Informe um valor maior que zero.");
      return;
    }
    const fd = new FormData();
    fd.set("tipo", tipo);
    fd.set("data", data);
    fd.set("descricao", descricao);
    fd.set("valor", String(mag));
    fd.set("bankAccountId", bankAccountId);
    if (tipo === "receita") fd.set("cat", catReceita);
    if (tipo === "ajuste") fd.set("sinal", sinal);
    start(async () => {
      try {
        await addCash(fd);
        setData("");
        setDescricao("");
        setValor("");
        router.refresh();
      } catch (e) {
        setError(e instanceof Error ? e.message : "Falha ao lançar.");
      }
    });
  };

  return (
    <Card className="mb-6">
      <CardContent className="p-5">
        {/* Seletor de tipo */}
        <div className="mb-4 flex flex-wrap gap-1 rounded-[8px] bg-[var(--color-surface3)] p-1">
          {TIPOS.map((t) => (
            <button
              key={t.key}
              type="button"
              onClick={() => setTipo(t.key)}
              className={`rounded-[6px] px-3 py-1.5 text-xs transition-colors ${
                tipo === t.key
                  ? "bg-white text-[var(--color-ink)] shadow-sm"
                  : "text-[var(--color-ink3)] hover:text-[var(--color-ink)]"
              }`}
            >
              {t.label}
            </button>
          ))}
        </div>

        <div className="grid grid-cols-2 gap-3 sm:grid-cols-6">
          <div>
            <Label>Data</Label>
            <DateField value={data} onChange={setData} />
          </div>
          <div className="sm:col-span-2">
            <Label>Descrição</Label>
            <Input
              value={descricao}
              onChange={(e) => setDescricao(e.target.value)}
              placeholder={
                tipo === "ajuste"
                  ? "Ex.: Ajuste de saldo / diferença de extrato"
                  : "Ex.: Tarifa bancária / TED recebida"
              }
            />
          </div>

          {tipo === "ajuste" && (
            <div>
              <Label>Sentido</Label>
              <Select value={sinal} onChange={(e) => setSinal(e.target.value as "mais" | "menos")}>
                <option value="mais">Para mais (+)</option>
                <option value="menos">Para menos (−)</option>
              </Select>
            </div>
          )}

          {tipo === "receita" && (
            <div>
              <Label>Categoria</Label>
              <Select value={catReceita} onChange={(e) => setCatReceita(e.target.value)}>
                <option value="mensais">Mensais</option>
                <option value="AS">Ato/Sinal</option>
                <option value="reembolso">Reembolso</option>
                <option value="extrato">Avulsa (extrato)</option>
                <option value="outro">Outro</option>
              </Select>
            </div>
          )}

          <div>
            <Label>Valor {tipo === "despesa" ? "(saída)" : tipo === "ajuste" ? "(módulo)" : "(entrada)"}</Label>
            <Input
              type="number"
              step="0.01"
              min="0"
              value={valor}
              onChange={(e) => setValor(e.target.value)}
              placeholder="0"
            />
          </div>

          <div>
            <Label>Conta (opcional)</Label>
            <Select value={bankAccountId} onChange={(e) => setBankAccountId(e.target.value)}>
              <option value="">—</option>
              {contas.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.banco} · {c.cc || "s/ conta"}
                </option>
              ))}
            </Select>
          </div>

          <div className="flex items-end sm:col-span-6">
            <Button type="button" disabled={pending} onClick={salvar}>
              {pending
                ? "Lançando…"
                : tipo === "ajuste"
                  ? "Lançar ajuste"
                  : "Adicionar lançamento"}
            </Button>
          </div>
        </div>

        <p className="mt-3 text-[11.5px] leading-relaxed text-[var(--color-ink3)]">
          {hint}
          {tipo !== "receita" || catReceita === "extrato"
            ? " O lançamento já entra como conciliado (não há contraparte nos módulos para casar)."
            : ""}
        </p>
        {error && <p className="mt-2 text-sm text-[var(--color-danger)]">{error}</p>}
      </CardContent>
    </Card>
  );
}
```

---

## 9. O seletor de versões


O seletor é o `VersionMultiSelect` (`page.tsx:78–83`), que escreve o
`searchParams` `vs`. Ele é resolvido por `resolveCompareVersions(sp.vs,
ctx.versions, ctx.version)` (`page.tsx:76`), e o resultado **bifurca a tela em
dois modos completamente diferentes**.

### 9.1 Uma versão — modo detalhado

`version = compareVersions[0]`. Tudo o que a tela mostra é dessa versão:

| O quê | Escopo |
|---|---|
| `getCash(version.id)` | **da versão selecionada** |
| `getConciliacaoData(ctx.tenant.id, version.id)` | tenant + versão selecionada |
| `getBankAccounts(ctx.tenant.id)` | tenant — **não muda com a versão** |
| aba Previstas | `version.id` (unidades, reembolsos, permutas) + `ctx.project.id` (INCC) |

### 9.2 Duas ou três versões — modo comparação

A tela **inteira é substituída** (`page.tsx:86–129`): sai tudo — cartões de
dia, saldo das contas, abas, conciliação, importador — e entra uma única
tabela de três linhas: Entradas, (−) Saídas, = Saldo líquido do período, uma
coluna por versão. O filtro `de`/`ate` é aplicado; nada mais é mostrado.

### 9.3 A assimetria que vale registrar

As leituras da tela seguem o seletor, mas **as escritas seguem
`ctx.version`** — a versão ativa do contexto, que é outra coisa:

| Action | Versão em que grava | Linha |
|---|---|---|
| `addCash` | `ctx.version.id` | `caixa.ts:179` |
| `importCash` | `ctx.version.id` | `caixa.ts:345` |
| `pairMovimento` | `ctx.version.id` | `caixa.ts:1000` |

As três também travam em `ctx.version.locked`, não na versão exibida. Se o
usuário selecionar no seletor uma versão diferente da ativa, ele **vê** os
lançamentos de uma e **grava** na outra.

### `src/app/(app)/caixa/page.tsx` · linhas 62–137

A resolução do seletor, o modo comparação inteiro e a entrada do modo detalhado.

```tsx
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
  const [cashAll, contas, conciliacaoData] = await Promise.all([
    getCash(version.id),
    getBankAccounts(ctx.tenant.id),
    getConciliacaoData(ctx.tenant.id, version.id),
  ]);
```

---

## 10. A importação de extrato


### 10.1 As três portas de entrada

| Formato | Onde é lido | O que produz |
|---|---|---|
| XLSX / CSV | **no cliente**, com a lib `xlsx` (`import-extrato.tsx:5`) | linhas para a pré-visualização |
| PDF com texto | servidor, `extractExtratoFromText` | idem |
| PDF escaneado / imagem | servidor, `extractExtratoFromDocument` (IA) | idem |

Em todos os casos **nada é gravado na leitura**: as linhas vão para uma tela
de conferência e só o `importCash` (ou o pareamento) grava.

### 10.2 A leitura por IA

`extractExtratoPdf` (`caixa.ts:42–132`) é a action. Ela:

- aceita `application/pdf`, `image/png`, `image/jpeg`, `image/webp`,
  `image/gif` (`EXTRATO_AI_MIME`, `caixa.ts:28–34`);
- **devolve** o erro em vez de lançar — o comentário na linha 45 explica:
  em produção o Next.js redige a mensagem de qualquer erro lançado por Server
  Action;
- guarda o PDF original no R2 quando configurado, para auditoria;
- tenta primeiro o texto embutido e só cai na IA quando não há texto
  aproveitável — ver `extractExtratoFromText` × `extractExtratoFromDocument`
  em `src/lib/ai/extrato-extract.ts`.

### 10.3 A deduplicação

A chave é a **assinatura de importação** (`caixa.ts:227–235`):

```ts
function importSignature(bankAccountId, data, valor, doc): string {
  return `${bankAccountId ?? "-"}|${(data ?? "").trim()}|${cents(valor)}|${(doc ?? "").trim()}`;
}
```

Quatro campos: conta, data, valor em centavos, documento. É gravada na coluna
`cash_entry.import_hash` e comparada em três lugares — `importCash`
(`:279`), `pairMovimento` (`:975`) e `criarLancamentoDoExtrato` (`:1077`).

No `importCash` a dedup roda em duas frentes (`caixa.ts:265–286`):

- contra o **banco**: carrega todos os `import_hash` do tenant numa única
  consulta e monta um `Set`;
- contra o **próprio arquivo**: um `Set` `vistos` evita que duas linhas
  idênticas do mesmo extrato entrem as duas.

As ignoradas são contadas em `skipped` e devolvidas no resultado.

Quatro características mecânicas da chave:

- **Não é hash** — é a concatenação literal dos quatro campos, com `|` como
  separador. Nome de coluna à parte, não há criptografia envolvida.
- **`doc` vazio não invalida a chave.** Dois lançamentos do mesmo dia, mesmo
  valor, mesma conta e sem documento produzem assinaturas idênticas — o
  segundo é descartado como duplicata, mesmo sendo um pagamento real distinto.
- **A descrição não entra.** Duas linhas de mesmo dia e valor com descrições
  diferentes colidem.
- **`bankAccountId` nulo vira `"-"`.** Importar sem escolher conta joga tudo
  num espaço de chaves comum.

### 10.4 A conciliação automática da importação

`importCash` tenta casar cada linha antes de inserir (`caixa.ts:288–356`):

- **saídas** contra um pool de despesas previstas da versão, chaveado por
  `centavos|mês` — o mês vem de `competencia`, com fallback para `vencimento`;
  cada despesa é consumida uma vez (`despPool`);
- **entradas** contra um `Set` de valores de parcela esperados das unidades,
  **só por valor** — sem mês, sem unidade, sem limite de consumo.

Quando casa, grava `rec = true` e `cat = "despesa"` / `"receita"`. Como já
registrado na seção 6, **essa conciliação não guarda vínculo**: ninguém sabe
depois com qual despesa ou parcela a linha casou.

O saldo final do extrato, quando informado, sobrescreve `bank_account.saldo` e
marca `saldoSource: "auto"` (`caixa.ts:362–379`).

### `src/lib/actions/caixa.ts` · linhas 27–143

`EXTRATO_AI_MIME` (28–34), `extractExtratoPdf` (42–132) e os dois helpers que a importação usa: `monthKeyFrom` (135–141) e `cents` (143).

```ts
/** Formatos aceitos na leitura por IA do extrato (PDF/imagens). */
const EXTRATO_AI_MIME = [
  "application/pdf",
  "image/png",
  "image/jpeg",
  "image/webp",
  "image/gif",
] as const;

/**
 * Lê um extrato bancário em PDF (ou imagem) por IA e retorna as movimentações
 * identificadas para conferência na mesma tela de pré-visualização usada pelos
 * formatos XLSX/CSV. O PDF original é armazenado (R2) para consulta/auditoria.
 * A importação só ocorre após o usuário confirmar — nada é gravado aqui.
 */
export async function extractExtratoPdf(
  formData: FormData,
): Promise<ExtratoExtraido & { error?: string }> {
  // IMPORTANTE: em produção o Next.js redige (esconde) a mensagem de qualquer
  // erro LANÇADO por uma Server Action, substituindo por um texto genérico
  // ("An error occurred in the Server Components render…"). Por isso RETORNAMOS
  // os erros em `error` — assim a mensagem real chega ao usuário na tela.
  const empty: ExtratoExtraido = { movimentos: [], saldoFinal: null };
  const ctx = await getActiveContext();
  if (!ctx || !can(ctx.perms, "caixa", "editar")) {
    return { ...empty, error: "Sem permissão para importar extrato." };
  }
  const file = formData.get("file") as File | null;
  if (!file || file.size === 0) return { ...empty, error: "Selecione um arquivo de extrato." };
  // Limite alinhado ao bodySizeLimit das Server Actions (12 MB no next.config):
  // acima disso o Next rejeita o upload antes da action rodar.
  if (file.size > 10 * 1024 * 1024) {
    return { ...empty, error: "Arquivo deve ter até 10 MB. Para extratos maiores, envie XLSX/CSV." };
  }
  const mime = file.type || "";
  if (!(EXTRATO_AI_MIME as readonly string[]).includes(mime)) {
    return { ...empty, error: "Envie um PDF ou imagem (PNG, JPG ou WebP) do extrato." };
  }
  const bytes = new Uint8Array(await file.arrayBuffer());
  // Com IA configurada, usa a leitura por IA (melhor precisão, inclusive imagens).
  // Sem IA, faz leitura de TEXTO do PDF (unpdf) por heurística — o usuário revisa
  // e ajusta na tela de conferência. Imagens sem IA não são suportadas.
  let result: ExtratoExtraido;
  try {
    if (isAiConfigured()) {
      result = await extractExtratoFromDocument(bytes, mime);
    } else if (mime === "application/pdf") {
      result = await extractExtratoFromText(bytes);
    } else {
      return {
        ...empty,
        error:
          "Leitura de imagem exige IA (ANTHROPIC_API_KEY). Para PDF sem IA, envie o PDF com texto; ou use XLSX/CSV.",
      };
    }
  } catch (e) {
    console.error("[extrato] falha ao ler PDF/imagem:", e);
    const detail = e instanceof Error ? e.message : String(e);
    return {
      ...empty,
      error:
        `Falha ao ler o arquivo do extrato (${detail}). ` +
        "Se o PDF for escaneado/imagem (sem texto), ative a leitura por IA em " +
        "Config → Diagnóstico de IA, ou envie o extrato em XLSX/CSV.",
    };
  }
  if (result.movimentos.length === 0) {
    return {
      ...result,
      error:
        "Não identifiquei movimentações no texto do PDF. Ele pode ser escaneado/imagem " +
        "(sem texto) — ative a leitura por IA em Config → Diagnóstico de IA, ou envie XLSX/CSV.",
    };
  }

  // Guarda o arquivo original do extrato para auditoria (quando o R2 existe).
  const bankAccountId = (formData.get("bankAccountId") as string) || null;
  if (isR2Configured()) {
    try {
      const safe = file.name.replace(/[^\w.\-]+/g, "_");
      const key = `tenants/${ctx.tenant.id}/extratos/${Date.now()}_${safe}`;
      await putObject(key, bytes, file.type || "application/octet-stream");
      await db.insert(schema.documents).values({
        tenantId: ctx.tenant.id,
        storageKey: key,
        filename: file.name,
        contentType: file.type || null,
        size: file.size,
        tipo: "Extrato bancário",
        uploadedBy: ctx.userEmail || ctx.userId || null,
      });
    } catch {
      // Falha ao armazenar o original não impede a conferência/importação.
    }
  }

  await logAudit({
    tenantId: ctx.tenant.id,
    userId: ctx.userId,
    action: "extrato.readPdf",
    entity: "cash_entry",
    entityId: bankAccountId ?? "—",
    meta: { arquivo: file.name, movimentos: result.movimentos.length },
  });
  return result;
}

/** "MM/DD/YYYY" | "MM/YYYY" → "MM/YYYY" (para casar por competência). */
function monthKeyFrom(d?: string | null): string | null {
  if (!d) return null;
  const p = d.split("/");
  if (p.length === 3) return `${p[0].padStart(2, "0")}/${p[2]}`;
  if (p.length === 2) return `${p[0].padStart(2, "0")}/${p[1]}`;
  return null;
}

const cents = (v: number) => Math.round(v * 100);
```

### `src/lib/actions/caixa.ts` · linhas 202–244

Os tipos da importação e a `importSignature`.

```ts
export interface ImportCashRow {
  data?: string;
  descricao?: string;
  valor?: number;
  cat?: string;
  /** nº do documento do extrato (para dedup e exibição). */
  doc?: string;
}

export interface ImportExtratoInput {
  rows: ImportCashRow[];
  /** conta corrente à qual os lançamentos e o saldo final pertencem. */
  bankAccountId?: string | null;
  /** saldo final do extrato — atualiza o saldo da conta se informado. */
  saldoFinal?: number | null;
}

export interface ImportExtratoResult {
  inserted: number;
  conciliated: number;
  saldoUpdated: boolean;
  /** lançamentos ignorados por já terem sido importados antes (dedup). */
  skipped: number;
}

/** Assinatura de dedup de um lançamento do extrato (por conta). */
function importSignature(
  bankAccountId: string | null,
  data: string | null | undefined,
  valor: number,
  doc: string | null | undefined,
): string {
  return `${bankAccountId ?? "-"}|${(data ?? "").trim()}|${cents(valor)}|${(doc ?? "").trim()}`;
}

/**
 * Importa lançamentos de um extrato (XLSX/CSV) para uma conta corrente:
 *  1) atribui cada lançamento à conta informada;
 *  2) tenta casar (conciliar) automaticamente com as despesas previstas
 *     (por valor + mês) e com as receitas previstas das unidades (por valor);
 *  3) atualiza o saldo final da conta, quando informado.
 * Lançamentos sem correspondência ficam pendentes para conciliação manual.
 */
```

### `src/lib/actions/caixa.ts` · linhas 237–397

`importCash` inteiro — dedup, conciliação automática, inserção e saldo.

```ts
/**
 * Importa lançamentos de um extrato (XLSX/CSV) para uma conta corrente:
 *  1) atribui cada lançamento à conta informada;
 *  2) tenta casar (conciliar) automaticamente com as despesas previstas
 *     (por valor + mês) e com as receitas previstas das unidades (por valor);
 *  3) atualiza o saldo final da conta, quando informado.
 * Lançamentos sem correspondência ficam pendentes para conciliação manual.
 */
export async function importCash(
  input: ImportExtratoInput,
): Promise<ImportExtratoResult> {
  const ctx = await getActiveContext();
  if (!ctx || !can(ctx.perms, "caixa", "criar")) {
    throw new Error("Sem permissão para importar extrato.");
  }
  if (ctx.version.locked) throw new Error("Versão congelada.");

  const { rows, saldoFinal } = input;
  // Valida a conta (deve pertencer ao tenant).
  const contas = await db
    .select()
    .from(schema.bankAccounts)
    .where(eq(schema.bankAccounts.tenantId, ctx.tenant.id));
  const bankAccountId =
    input.bankAccountId && contas.some((c) => c.id === input.bankAccountId)
      ? input.bankAccountId
      : null;

  // Dedup: ignora lançamentos já importados antes (mesma conta, data, valor e
  // documento). Carrega as assinaturas existentes uma vez.
  const existentes = await db
    .select({ importHash: schema.cashEntries.importHash })
    .from(schema.cashEntries)
    .where(eq(schema.cashEntries.tenantId, ctx.tenant.id));
  const jaImportados = new Set(
    existentes.map((e) => e.importHash).filter((h): h is string => !!h),
  );

  const naoZero = rows.filter((r) => r.valor != null && r.valor !== 0);
  const vistos = new Set<string>();
  let skipped = 0;
  const valid = naoZero.filter((r) => {
    const sig = importSignature(bankAccountId, r.data, Number(r.valor), r.doc);
    if (jaImportados.has(sig) || vistos.has(sig)) {
      skipped++;
      return false;
    }
    vistos.add(sig);
    return true;
  });

  // Pools para conciliação automática.
  const [despesas, units] = await Promise.all([
    getDespesas(ctx.version.id),
    getUnits(ctx.version.id),
  ]);
  // Despesas previstas: chave (centavos|mês) → quantidade disponível.
  const despPool = new Map<string, number>();
  for (const d of despesas) {
    if (d.cancelado) continue;
    const mm = monthKeyFrom(d.competencia) ?? monthKeyFrom(d.vencimento);
    if (!mm) continue;
    const key = `${cents(Math.abs(Number(d.valor)))}|${mm}`;
    despPool.set(key, (despPool.get(key) ?? 0) + 1);
  }
  // Receitas previstas: conjunto de valores de parcela esperados (em centavos).
  const receitaVals = new Set<number>();
  for (const u of units) {
    const c = toCalcUnit(u);
    for (const val of [
      c.AS.val,
      c.S1.val,
      c.S2.val,
      c.S3.val,
      c.Mensais.val,
      c.Semestrais.val,
      c.Anuais.val,
      c.FGTS.val,
      c.Subsidio.val,
      c.Permuta.val,
    ]) {
      if (val && val > 0) receitaVals.add(cents(val));
    }
  }

  let conciliated = 0;
  const toInsert = valid.map((r) => {
    const v = Number(r.valor);
    let rec = false;
    let cat = r.cat || "extrato";
    if (v < 0) {
      // Saída → tenta casar com uma despesa prevista (valor + mês).
      const mm = monthKeyFrom(r.data);
      const key = `${cents(Math.abs(v))}|${mm}`;
      const avail = despPool.get(key) ?? 0;
      if (mm && avail > 0) {
        despPool.set(key, avail - 1);
        rec = true;
        cat = "despesa";
        conciliated++;
      }
    } else if (receitaVals.has(cents(v))) {
      // Entrada → casa com um valor de parcela previsto das unidades.
      rec = true;
      cat = "receita";
      conciliated++;
    }
    return {
      versionId: ctx.version.id,
      tenantId: ctx.tenant.id,
      bankAccountId,
      data: r.data || null,
      descricao: r.descricao || null,
      valor: String(v),
      cat,
      doc: r.doc || null,
      importHash: importSignature(bankAccountId, r.data, v, r.doc),
      rec,
    };
  });

  if (toInsert.length > 0) {
    await db.insert(schema.cashEntries).values(toInsert);
  }

  // Atualiza o saldo final da conta, se informado.
  let saldoUpdated = false;
  if (bankAccountId && saldoFinal != null && Number.isFinite(saldoFinal)) {
    await db
      .update(schema.bankAccounts)
      .set({
        saldo: String(saldoFinal),
        saldoSource: "auto",
        lastSync: new Date(),
      })
      .where(
        and(
          eq(schema.bankAccounts.id, bankAccountId),
          eq(schema.bankAccounts.tenantId, ctx.tenant.id),
        ),
      );
    saldoUpdated = true;
  }

  await logAudit({
    tenantId: ctx.tenant.id,
    userId: ctx.userId,
    action: "cash.import",
    entity: "cash_entry",
    meta: {
      count: toInsert.length,
      conciliated,
      skipped,
      bankAccountId,
      saldoUpdated,
    },
  });
  revalidatePath("/caixa");
  revalidatePath("/contas");
  return { inserted: toInsert.length, conciliated, saldoUpdated, skipped };
}
```

### `src/lib/ai/extrato-extract.ts`

`src/lib/ai/extrato-extract.ts` inteiro — a extração por texto e a extração por IA.

```ts
import "server-only";
import Anthropic from "@anthropic-ai/sdk";
import { aiClient, createMessageWithFallback, isAiConfigured } from "@/lib/ai/client";

/**
 * Leitura de extrato bancário em PDF por IA, para pré-preencher a importação de
 * lançamentos de caixa. Reaproveita a configuração (ANTHROPIC_API_KEY) das
 * demais leituras. Retorna as movimentações identificadas; a decisão final
 * (revisar, editar, escolher o que importar) permanece com o usuário na tela de
 * conferência já existente.
 */

export interface ExtratoMovimento {
  /** data "MM/DD/YYYY" (formato interno). */
  data: string;
  descricao: string;
  doc: string;
  /** valor com sinal: positivo = entrada/crédito, negativo = saída/débito. */
  valor: number;
}

export interface ExtratoExtraido {
  movimentos: ExtratoMovimento[];
  /** saldo final, se identificável (para conferência). */
  saldoFinal: number | null;
}

type ImageMime = "image/png" | "image/jpeg" | "image/webp" | "image/gif";

/** Valor monetário BR em texto → número (sem sinal). Ex.: "1.234,56" → 1234.56. */
function parseBRMoney(s: string): number | null {
  const m = s.replace(/\s/g, "").match(/-?\d{1,3}(?:\.\d{3})*,\d{2}|-?\d+,\d{2}/);
  if (!m) return null;
  const n = Number(m[0].replace(/\./g, "").replace(",", "."));
  return Number.isFinite(n) ? Math.abs(n) : null;
}

/**
 * Extração SEM IA de um extrato em PDF: lê o texto do PDF (unpdf) e identifica,
 * por heurística, linhas com data + valor. É "melhor esforço" — a decisão final
 * fica com o usuário na tela de conferência. Usado quando a IA não está
 * configurada (ANTHROPIC_API_KEY ausente).
 */
export async function extractExtratoFromText(bytes: Uint8Array): Promise<ExtratoExtraido> {
  const { extractText, getDocumentProxy } = await import("unpdf");
  const pdf = await getDocumentProxy(bytes);
  const { text } = await extractText(pdf, { mergePages: true });
  const linhas = String(text)
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter(Boolean);

  const movimentos: ExtratoMovimento[] = [];
  let saldoFinal: number | null = null;
  const dateRe = /(\d{1,2})[/](\d{1,2})[/](\d{2,4})/;
  const moneyGlobal = /-?\d{1,3}(?:\.\d{3})*,\d{2}|-?\d+,\d{2}/g;
  for (const linha of linhas) {
    const dm = linha.match(dateRe);
    const valores = linha.match(moneyGlobal);
    if (!dm || !valores || valores.length === 0) continue;
    const baixa = /^\s*saldo|saldo\s+(?:anterior|final|do dia|disp)/i.test(linha);
    if (baixa) {
      const v = parseBRMoney(valores[valores.length - 1]);
      if (v != null) saldoFinal = /-/.test(valores[valores.length - 1]) ? -v : v;
      continue;
    }
    // Último valor da linha costuma ser saldo; o penúltimo (quando há 2+) tende a
    // ser o valor do lançamento. Com um único valor, usa-o.
    const alvo = valores.length >= 2 ? valores[valores.length - 2] : valores[0];
    const abs = parseBRMoney(alvo);
    if (abs == null || abs === 0) continue;
    // Sinal: marcadores de débito/saída na linha ("-", " D ", "DEBITO", "PAGAMENTO").
    const negativo =
      /-\s*R?\$?\s*\d/.test(alvo) ||
      /\b[dD]\b|d[eé]bito|saíd|saida|pagamento|pgto|tarifa|tar\.|compra|saque/i.test(linha);
    const y = dm[3].length === 2 ? "20" + dm[3] : dm[3];
    const data = `${dm[2].padStart(2, "0")}/${dm[1].padStart(2, "0")}/${y}`;
    const descricao =
      linha
        .replace(dateRe, "")
        .replace(moneyGlobal, "")
        .replace(/\s{2,}/g, " ")
        .trim() || "—";
    movimentos.push({ data, descricao, doc: "", valor: negativo ? -abs : abs });
  }
  return { movimentos, saldoFinal };
}

/** "DD/MM/YYYY" ou "YYYY-MM-DD" → interno "MM/DD/YYYY"; vazio se inválido. */
function toInternal(s: string): string {
  const t = (s || "").trim();
  const br = t.match(/^(\d{1,2})[/\-.](\d{1,2})[/\-.](\d{2,4})/);
  if (br) {
    let y = br[3];
    if (y.length === 2) y = "20" + y;
    return `${br[2].padStart(2, "0")}/${br[1].padStart(2, "0")}/${y}`;
  }
  const iso = t.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (iso) return `${iso[2]}/${iso[3]}/${iso[1]}`;
  return "";
}

export async function extractExtratoFromDocument(
  bytes: Uint8Array,
  mime: string,
): Promise<ExtratoExtraido> {
  if (!isAiConfigured()) {
    throw new Error("Leitura por IA não configurada (defina ANTHROPIC_API_KEY).");
  }
  const client = aiClient();
  const data = Buffer.from(bytes).toString("base64");

  const docBlock: Anthropic.ContentBlockParam =
    mime === "application/pdf"
      ? { type: "document", source: { type: "base64", media_type: "application/pdf", data } }
      : { type: "image", source: { type: "base64", media_type: mime as ImageMime, data } };

  const tool: Anthropic.ToolUnion = {
    name: "extrair_extrato",
    description:
      "Extrai as movimentações (lançamentos) de um extrato bancário. Uma entrada por movimentação; ignore linhas de saldo/total.",
    input_schema: {
      type: "object",
      additionalProperties: false,
      properties: {
        movimentos: {
          type: "array",
          description: "Lista de movimentações do extrato, na ordem em que aparecem.",
          items: {
            type: "object",
            additionalProperties: false,
            properties: {
              data: { type: "string", description: "Data da movimentação (DD/MM/AAAA)." },
              descricao: { type: "string", description: "Descrição/histórico da movimentação." },
              doc: { type: "string", description: "Documento/identificador, se houver. Vazio se não." },
              valor: {
                type: "number",
                description:
                  "Valor com sinal: POSITIVO para crédito/entrada, NEGATIVO para débito/saída.",
              },
            },
            required: ["data", "descricao", "doc", "valor"],
          },
        },
        saldoFinal: {
          type: ["number", "null"],
          description: "Saldo final do extrato, se identificável. null se não houver.",
        },
      },
      required: ["movimentos", "saldoFinal"],
    },
    // Sem `strict: true`: a gramática que a API compila para validar a
    // resposta tem limite de tamanho (400 "compiled grammar is too large" —
    // aconteceu na leitura de despesa). A garantia de formato vem do parse
    // defensivo abaixo, que tolera campo ausente ou de tipo errado.
  };

  const message = await createMessageWithFallback(client, {
    max_tokens: 8192,
    tools: [tool],
    tool_choice: { type: "tool", name: "extrair_extrato" },
    messages: [
      {
        role: "user",
        content: [
          docBlock,
          {
            type: "text",
            text:
              "Extraia TODAS as movimentações deste extrato bancário e chame a ferramenta " +
              "extrair_extrato. Não invente valores; ignore linhas de saldo/total. Use sinal " +
              "negativo para débitos/saídas e positivo para créditos/entradas.",
          },
        ],
      },
    ],
  });

  const block = message.content.find((b) => b.type === "tool_use");
  if (!block || block.type !== "tool_use") {
    throw new Error(
      "Não foi possível ler as movimentações do PDF. Verifique se o arquivo é um extrato legível (não protegido/escaneado sem texto).",
    );
  }
  const input = block.input as { movimentos?: unknown[]; saldoFinal?: unknown };
  const movimentos: ExtratoMovimento[] = Array.isArray(input.movimentos)
    ? input.movimentos
        .map((m) => {
          const o = (m ?? {}) as Record<string, unknown>;
          const valor = Number(o.valor);
          return {
            data: toInternal(String(o.data ?? "")),
            descricao: String(o.descricao ?? "").trim() || "—",
            doc: String(o.doc ?? "").trim(),
            valor: Number.isFinite(valor) ? valor : 0,
          };
        })
        .filter((m) => m.valor !== 0)
    : [];
  const saldo = Number(input.saldoFinal);
  return { movimentos, saldoFinal: Number.isFinite(saldo) ? saldo : null };
}
```
