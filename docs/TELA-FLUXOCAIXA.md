# TELA-FLUXOCAIXA — código na íntegra

Coleta do código da tela **Fluxo de Caixa Mensal** (`/fluxocaixa`), em `main`
(commit `45f4ce3`). Sem resumo, sem análise.

> **Duas funções pedidas não são chamadas por esta tela.** `getReceivables` e
> `getCashByTenant` estão incluídas por pedido explícito, mas o Fluxo não as
> usa: o realizado vem de `getCash(versionId)`, e as entradas previstas vêm de
> `getMonthlyRevenue`. Marquei cada uma.

**Árvore de dependências própria:**

```
fluxocaixa/page.tsx
├── components/app/page-header.tsx
├── components/app/project-picker.tsx
├── components/app/date-range-filter.tsx
├── components/app/version-multiselect.tsx
├── components/app/projecao-controls.tsx   (ProjecaoYearSelect)
└── Kpi                                    — local do page.tsx (414–455)

lib/fluxo-caixa.ts   flowMaps (previsto) · flowMapsRealizado (realizado)
lib/contas-saldo.ts  saldoDisponivel  → o saldo inicial
lib/report-versions  resolveCompareVersions
lib/planning.ts      calendarYearWindows
calc/mes-caixa.ts    vencMonth  — quem decide o mês de cada valor

queries (página):  getBankAccounts · getVersionsDoProjeto · getInccRows
                   sortMonthKey
queries (flowMaps): getMonthlyRevenue · getDespesas · getPermutas
                   getParcelasByVersion · getExpenseRows · permToResale
queries (realizado): getCash
action:            getRestituicoesPendentesByVersion (leitura)
```

---

## 1. A página

### `src/app/(app)/fluxocaixa/page.tsx`

```tsx
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
```

---

## 2. Componentes próprios

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

### `src/components/app/project-picker.tsx`

```tsx
"use client";

import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useTransition } from "react";
import { Select } from "@/components/ui/input";

export interface ProjectOpt {
  id: string;
  label: string;
}

/**
 * Seletor de projeto para telas sem "projeto ativo" (Budget/Forecast). Grava
 * a escolha em `proj` na URL, preservando os demais parâmetros.
 */
export function ProjectPicker({
  projects,
  selected,
  allOption = false,
}: {
  projects: ProjectOpt[];
  selected: string;
  /** inclui a opção "Todos os projetos" (valor "all"). */
  allOption?: boolean;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const sp = useSearchParams();
  const [pending, start] = useTransition();

  return (
    <div className="flex flex-col gap-1">
      <span className="font-[family-name:var(--font-mono)] text-[10px] uppercase tracking-wide text-[var(--color-ink3)]">
        Projeto
      </span>
      <Select
        value={selected}
        disabled={pending}
        onChange={(e) => {
          const params = new URLSearchParams(sp.toString());
          params.set("proj", e.target.value);
          start(() => router.push(`${pathname}?${params.toString()}`));
        }}
        className="h-9 min-w-[220px]"
      >
        {allOption && <option value="all">Todos os projetos / filiais</option>}
        {projects.map((p) => (
          <option key={p.id} value={p.id}>
            {p.label}
          </option>
        ))}
      </Select>
    </div>
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

### `src/components/app/projecao-controls.tsx`

`ProjecaoYearSelect` — o seletor de ano.

```tsx
"use client";

import { useRouter } from "next/navigation";
import { useTransition } from "react";
import { Select } from "@/components/ui/input";
import { Button } from "@/components/ui/button";

export interface YearOption {
  value: number;
  label: string;
}

export function ProjecaoYearSelect({
  years,
  selected,
  basePath = "/projecao",
}: {
  years: YearOption[];
  selected: number;
  basePath?: string;
}) {
  const router = useRouter();
  const [pending, start] = useTransition();
  return (
    <Select
      value={String(selected)}
      disabled={pending}
      onChange={(e) => start(() => router.push(`${basePath}?ano=${e.target.value}`))}
      className="h-9 w-auto"
    >
      {years.map((y) => (
        <option key={y.value} value={y.value}>
          {y.label}
        </option>
      ))}
    </Select>
  );
}

export interface ExportMatrix {
  months: string[];
  rows: { label: string; values: number[]; total: number }[];
}

/** Exporta a matriz completa (todas as colunas de mês + total) como CSV. */
export function ProjecaoExport({
  matrix,
  filename,
}: {
  matrix: ExportMatrix;
  filename: string;
}) {
  const download = () => {
    const esc = (s: string) => `"${s.replace(/"/g, '""')}"`;
    const header = ["Fonte / Unidade", ...matrix.months, "TOTAL"].map(esc).join(";");
    const lines = matrix.rows.map((r) =>
      [esc(r.label), ...r.values.map((v) => String(v)), String(r.total)].join(";"),
    );
    const csv = "﻿" + [header, ...lines].join("\n");
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  };
  return (
    <Button type="button" variant="outline" size="sm" onClick={download}>
      ⬇ Exportar
    </Button>
  );
}
```

---

## 3. `src/lib/fluxo-caixa.ts` inteiro

### `src/lib/fluxo-caixa.ts`

```ts
import {
  getDespesas,
  getExpenseRows,
  getMonthlyRevenue,
  getParcelasByVersion,
  getPermutas,
  getCash,
  permToResale,
} from "@/lib/queries";
import { permutaCashByMonth } from "@/lib/calc";
import { isBudgetVersion } from "@/lib/budget/config";
import { getRestituicoesPendentesByVersion } from "@/lib/actions/restituicoes";
import type { Version } from "@/lib/context";
// `vencMonth` vive em módulo puro para poder ser testada sem puxar banco/sessão.
import { vencMonth } from "@/lib/calc/mes-caixa";

export { vencMonth };

/**
 * Montagem do Fluxo de Caixa mensal.
 *
 * Extraído da página para poder ser VERIFICADO de forma automatizada — é a
 * função que decide o que entra e o que sai em cada mês, por versão.
 *
 * Regras:
 *  - cada versão traz o que foi lançado NELA;
 *  - Budget/Forecast → planejamento (budget_line), por competência;
 *  - Atual → parcelas e despesas lançadas, pelo mês do VENCIMENTO;
 *  - despesas canceladas não geram saída;
 *  - despesas pagas por terceiro não geram saída na competência (a saída
 *    ocorre na restituição).
 */


/** Mapas de entradas e saídas mensais de uma versão (budget-aware). */
export async function flowMaps(
  version: Version,
  projectId: string,
): Promise<{ entradas: Record<string, number>; saidas: Record<string, number> }> {
  const [entradas, despesas, permutas, parcelas] = await Promise.all([
    getMonthlyRevenue(version.id, projectId),
    getDespesas(version.id),
    getPermutas(version.id),
    getParcelasByVersion(version.id),
  ]);

  // Recebimentos da revenda de bens recebidos em permuta (item 10).
  const permCash = permutaCashByMonth(permToResale(permutas));
  for (const [mm, v] of Object.entries(permCash)) {
    entradas[mm] = (entradas[mm] || 0) + v;
  }

  const saidas: Record<string, number> = {};
  if (isBudgetVersion(version.kind)) {
    // Budget/Forecast: saídas do lançamento simplificado (por competência).
    const expenses = await getExpenseRows(version.id);
    for (const e of expenses) {
      const mm = vencMonth(e.competencia);
      if (mm) saidas[mm] = (saidas[mm] || 0) + e.valor;
    }
  } else {
    // Versão detalhada: despesas pagas por terceiro NÃO geram saída na
    // competência — a saída ocorre só na restituição (Fase 4).
    const { despesaIds: terceiroIds, saidasPrevistas: restPrevistas } =
      await getRestituicoesPendentesByVersion(version.id);
    const excluir = new Set(terceiroIds);
    const comParcela = new Set(parcelas.map((p) => p.despesaId));
    // Despesas CANCELADAS não geram saída. Antes só as parcelas canceladas eram
    // puladas, então uma despesa cancelada seguia inflando o fluxo — enquanto
    // sumia de Contas a Pagar, que filtra cancelado.
    const canceladas = new Set(despesas.filter((d) => d.cancelado).map((d) => d.id));
    for (const p of parcelas) {
      if (
        p.status === "Cancelado" ||
        excluir.has(p.despesaId) ||
        canceladas.has(p.despesaId)
      )
        continue;
      const mm = vencMonth(p.vencimento);
      if (mm) saidas[mm] = (saidas[mm] || 0) + Number(p.valorOriginal);
    }
    for (const d of despesas) {
      if (comParcela.has(d.id) || excluir.has(d.id) || d.cancelado) continue;
      const mm = vencMonth(d.vencimento) ?? vencMonth(d.competencia);
      if (mm) saidas[mm] = (saidas[mm] || 0) + Number(d.valor);
    }
    for (const [mm, v] of Object.entries(restPrevistas)) {
      saidas[mm] = (saidas[mm] || 0) + v;
    }
  }
  return { entradas, saidas };
}


/**
 * Fluxo REALIZADO — RG-01.
 *
 * O `flowMaps` acima monta o fluxo PREVISTO: ele projeta pelo VENCIMENTO das
 * parcelas e das despesas, ou seja, mostra o que se espera pagar e receber.
 * Isso é uma previsão, e continua valendo — é o que a empresa usa para se
 * programar.
 *
 * O que faltava era o outro lado da RG-01: o fluxo montado pela **data de
 * liquidação**, isto é, o dinheiro que de fato passou pela conta. É o que esta
 * função devolve, lendo `cash_entry` (os lançamentos do extrato e as baixas
 * conciliadas) pela data em que ocorreram.
 *
 * As duas visões convivem lado a lado e NENHUM número do previsto muda por
 * causa desta função: ela lê uma fonte diferente e não toca em `flowMaps`.
 *
 * Convenção de sinal de `cash_entry`: positivo entra, negativo sai. Aqui as
 * saídas são devolvidas em módulo, para somar na mesma escala do previsto.
 */
export async function flowMapsRealizado(
  versionId: string,
): Promise<{ entradas: Record<string, number>; saidas: Record<string, number> }> {
  const entradas: Record<string, number> = {};
  const saidas: Record<string, number> = {};
  const lancamentos = await getCash(versionId);
  for (const c of lancamentos) {
    // Sem data não há competência de caixa a atribuir — o lançamento existe,
    // mas não entra em nenhum mês (e some-lo do total seria pior do que
    // reportá-lo em mês errado).
    const mm = vencMonth(c.data);
    if (!mm) continue;
    const v = Number(c.valor);
    if (!Number.isFinite(v) || v === 0) continue;
    if (v > 0) entradas[mm] = (entradas[mm] || 0) + v;
    else saidas[mm] = (saidas[mm] || 0) + Math.abs(v);
  }
  return { entradas, saidas };
}
```


E os módulos que ele usa:

### `src/lib/calc/mes-caixa.ts`

`calc/mes-caixa.ts` — `vencMonth`, a função que atribui o mês.

```ts
/**
 * Atribuição do MÊS de um lançamento no fluxo de caixa — RG-01.
 *
 * Vive isolada das queries de propósito: é a função que decide em que mês cada
 * valor cai, tanto no fluxo PREVISTO (que recebe o vencimento) quanto no
 * REALIZADO (que recebe a data de liquidação). Sendo pura, pode ser testada
 * diretamente — `fluxo-caixa.ts` importa banco e sessão e não é testável assim.
 */

/** "MM/DD/YYYY" → "MM/YYYY" (mês do vencimento ou da liquidação). */
export function vencMonth(d: string | null): string | null {
  if (!d) return null;
  const p = d.split("/");
  if (p.length === 3) return `${p[0]}/${p[2]}`;
  if (p.length === 2) return d;
  return null;
}
```

### `src/lib/budget/config.ts` · linhas 29–32

`isBudgetVersion`.

```ts
/** Só Budget e Forecast usam o lançamento simplificado. */
export function isBudgetVersion(kind: string): boolean {
  return kind === "budget" || kind === "forecast";
}
```

### `src/lib/actions/restituicoes.ts` · linhas 901–922

`getRestituicoesPendentesByVersion` — a saída prevista das restituições.

```ts
/** Saldo pendente de restituições por mês previsto (para o fluxo de caixa). */
export async function getRestituicoesPendentesByVersion(
  versionId: string,
): Promise<{ despesaIds: string[]; saidasPrevistas: Record<string, number> }> {
  const rows = await db
    .select({ dt: schema.despesaTerceiros, despesaId: schema.despesas.id })
    .from(schema.despesaTerceiros)
    .innerJoin(schema.despesas, eq(schema.despesaTerceiros.despesaId, schema.despesas.id))
    .where(eq(schema.despesas.versionId, versionId))
    .orderBy(asc(schema.despesaTerceiros.dataPrevistaRestituicao));
  const saidas: Record<string, number> = {};
  const despesaIds: string[] = [];
  for (const r of rows) {
    despesaIds.push(r.despesaId);
    if (r.dt.status === "Cancelado") continue;
    const saldo = Number(r.dt.valorTotal) - Number(r.dt.valorRestituido);
    const p = (r.dt.dataPrevistaRestituicao ?? "").split("/");
    const mm = p.length === 3 ? `${p[0]}/${p[2]}` : null;
    if (mm && saldo > 0) saidas[mm] = (saidas[mm] || 0) + saldo;
  }
  return { despesaIds, saidasPrevistas: saidas };
}
```

---

## 4. As funções de `queries.ts`


### 4.1 Chamadas pela página

### `src/lib/queries.ts` · linhas 219–227

`getBankAccounts` — a origem do saldo inicial.

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

### `src/lib/queries.ts` · linhas 2197–2211

`getVersionsDoProjeto`.

```ts
export async function getVersionsDoProjeto(
  tenantId: string,
  projectId: string,
): Promise<(typeof schema.versions.$inferSelect)[]> {
  return db
    .select()
    .from(schema.versions)
    .where(
      and(
        eq(schema.versions.tenantId, tenantId),
        eq(schema.versions.projectId, projectId),
      ),
    )
    .orderBy(asc(schema.versions.createdAt));
}
```

### `src/lib/queries.ts` · linhas 150–157

`getInccRows` — o eixo de meses.

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

### `src/lib/queries.ts` · linhas 1452–1457

`sortMonthKey`.

```ts
/** Ordena chaves "MM/YYYY" cronologicamente. */
export function sortMonthKey(a: string, b: string): number {
  const [ma, ya] = a.split("/").map(Number);
  const [mb, yb] = b.split("/").map(Number);
  return ya - yb || ma - mb;
}
```


### 4.2 Chamadas por `flowMaps` (previsto)

### `src/lib/queries.ts` · linhas 1100–1176

`getMonthlyRevenue` — **as entradas previstas**.

```ts
/**
 * Receita projetada mês a mês de uma versão.
 *
 * Cada versão respeita o que foi lançado NELA:
 *  - Budget/Forecast → budget_line (planejamento);
 *  - Atual → o que está efetivamente lançado, isto é, as CONTAS A RECEBER
 *    lançadas mais os recebíveis derivados dos planos de pagamento das vendas,
 *    mais os reembolsos. É daí que sai a projeção de receita futura.
 *
 * As duas origens da Atual são complementares, não duplicadas: os recebíveis de
 * venda são derivados do plano da unidade e não são copiados para conta_receber
 * (ver comentário do schema em `contasReceber`).
 */
export async function getMonthlyRevenue(
  versionId: string,
  projectId: string,
): Promise<MonthlyProjection> {
  const kind = await getVersionKind(versionId);
  if (kind === "budget" || kind === "forecast") {
    const lines = await db
      .select({ mes: schema.budgetLines.mes, valor: schema.budgetLines.valor })
      .from(schema.budgetLines)
      .where(
        and(
          eq(schema.budgetLines.versionId, versionId),
          eq(schema.budgetLines.kind, "receita"),
        ),
      );
    const out: MonthlyProjection = {};
    for (const l of lines) out[l.mes] = (out[l.mes] || 0) + Number(l.valor);
    return out;
  }

  const [unitRows, reembRows] = await Promise.all([
    getUnits(versionId),
    getReembolsos(versionId),
  ]);
  const out: MonthlyProjection = {};
  // Receita da versão Atual = recebíveis das vendas (MESMA fonte da tela Contas
  // a Receber: expandUnitReceivables — leitura tolerante do plano, sem depender
  // das flags usar*). Assim DRE e Fluxo batem com os recebíveis exibidos.
  // Agrega por mês do vencimento ("MM/DD/YYYY" → "MM/YYYY").
  for (const r of unitRows) {
    for (const rec of expandUnitReceivables(r.paymentPlan, r.status)) {
      const p = rec.dia.split("/");
      if (p.length !== 3) continue;
      const mk = `${p[0]}/${p[2]}`;
      out[mk] = (out[mk] || 0) + rec.valor;
    }
  }
  const reemb = reembursementsByMonth(reembToCalc(reembRows));
  for (const [mm, v] of Object.entries(reemb)) out[mm] = (out[mm] || 0) + v;

  // CONTAS A RECEBER lançadas do projeto — a projeção de receita futura da
  // versão Atual depende delas. Sem isto, uma receita lançada à mão (fora de um
  // plano de venda) aparecia em Contas a Receber e sumia da DRE, do Fluxo de
  // Caixa e do Dashboard. Agrega pelo mês do vencimento e ignora as canceladas.
  const crRows = await db
    .select({
      valor: schema.contasReceber.valor,
      vencimento: schema.contasReceber.vencimento,
    })
    .from(schema.contasReceber)
    .where(
      and(
        eq(schema.contasReceber.projectId, projectId),
        eq(schema.contasReceber.cancelado, false),
      ),
    );
  for (const c of crRows) {
    const p = (c.vencimento ?? "").split("/");
    if (p.length !== 3) continue;
    const mk = `${p[0]}/${p[2]}`;
    out[mk] = (out[mk] || 0) + Number(c.valor);
  }
  return out;
}
```

### `src/lib/queries.ts` · linhas 238–244

`getDespesas`.

```ts
export async function getDespesas(versionId: string): Promise<DespesaRow[]> {
  return db
    .select()
    .from(schema.despesas)
    .where(eq(schema.despesas.versionId, versionId))
    .orderBy(asc(schema.despesas.competencia));
}
```

### `src/lib/queries.ts` · linhas 997–1019

`getParcelasByVersion` — **a origem principal das saídas previstas**.

```ts
export type ParcelaRow = typeof schema.despesaParcelas.$inferSelect;

/** Parcelas de contas a pagar de uma versão (join com despesa). Fase 2. */
export async function getParcelasByVersion(
  versionId: string,
): Promise<(ParcelaRow & { despesaNumDoc: string | null; contaCef: string | null; categoriaDre: string | null })[]> {
  const rows = await db
    .select({
      p: schema.despesaParcelas,
      numDoc: schema.despesas.numDoc,
      contaCef: schema.despesas.contaCef,
      categoriaDre: schema.despesas.categoriaDre,
    })
    .from(schema.despesaParcelas)
    .innerJoin(schema.despesas, eq(schema.despesaParcelas.despesaId, schema.despesas.id))
    .where(eq(schema.despesas.versionId, versionId));
  return rows.map((r) => ({
    ...r.p,
    despesaNumDoc: r.numDoc,
    contaCef: r.contaCef,
    categoriaDre: r.categoriaDre,
  }));
}
```

### `src/lib/queries.ts` · linhas 961–995

`getExpenseRows` — só no ramo Budget/Forecast.

```ts
/**
 * Despesas normalizadas para os relatórios (DRE/Fluxo). Para Budget/Forecast
 * vêm do lançamento simplificado (budget_line, despesa); para a detalhada, das
 * despesas reais.
 */
export async function getExpenseRows(versionId: string): Promise<ExpenseRow[]> {
  const kind = await getVersionKind(versionId);
  if (kind === "budget" || kind === "forecast") {
    const lines = await db
      .select()
      .from(schema.budgetLines)
      .where(
        and(
          eq(schema.budgetLines.versionId, versionId),
          eq(schema.budgetLines.kind, "despesa"),
        ),
      );
    return lines.map((l) => ({
      contaCef: l.rowKey,
      categoriaDre: l.dreCategory,
      competencia: l.mes,
      valor: Number(l.valor),
    }));
  }
  const d = await getDespesas(versionId);
  // Despesas canceladas (exclusão lógica) não compõem a DRE/relatórios.
  return d
    .filter((x) => !x.cancelado)
    .map((x) => ({
      contaCef: x.contaCef,
      categoriaDre: x.categoriaDre,
      competencia: x.competencia,
      valor: Number(x.valor),
    }));
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


### 4.3 Chamada por `flowMapsRealizado`

### `src/lib/queries.ts` · linhas 1059–1067

`CashRow` e `getCash` — **a origem do realizado**.

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


### 4.4 Pedidas, mas NÃO usadas por esta tela

### `src/lib/queries.ts` · linhas 1069–1078

`getCashByTenant` — usada por `/fechamento`, não pelo Fluxo.

```ts
/** Lançamentos de caixa de todas as versões Atual do tenant (caixa real). */
export async function getCashByTenant(tenantId: string): Promise<CashRow[]> {
  const rows = await db
    .select({ c: schema.cashEntries })
    .from(schema.cashEntries)
    .innerJoin(schema.versions, eq(schema.cashEntries.versionId, schema.versions.id))
    .where(and(eq(schema.cashEntries.tenantId, tenantId), eq(schema.versions.kind, "atual")))
    .orderBy(asc(schema.cashEntries.data));
  return rows.map((r) => r.c);
}
```

### `src/lib/queries.ts` · linhas 406–450

`getReceivables` — usada por `/fechamento` e pelo Dashboard, não pelo Fluxo.

```ts
/**
 * Recebíveis previstos do tenant: expande os planos de pagamento das unidades
 * vendidas (versão Atual de cada obra) em recebíveis datados, com projeto e
 * cliente comprador. Base do painel "Receitas a Receber do Dia".
 */
export async function getReceivables(tenantId: string): Promise<ReceivableRow[]> {
  const rows = await db
    .select({
      u: schema.units,
      projectId: schema.projects.id,
      projectName: schema.projects.name,
      clienteNome: schema.clientes.nomeCompleto,
    })
    .from(schema.units)
    .innerJoin(schema.versions, eq(schema.units.versionId, schema.versions.id))
    .innerJoin(schema.projects, eq(schema.versions.projectId, schema.projects.id))
    .leftJoin(
      schema.clientes,
      and(
        eq(schema.clientes.unitCode, schema.units.code),
        eq(schema.clientes.tenantId, tenantId),
      ),
    )
    .where(and(eq(schema.units.tenantId, tenantId), eq(schema.versions.kind, "atual")));

  const out: ReceivableRow[] = [];
  for (const r of rows) {
    const recs = expandUnitReceivables(r.u.paymentPlan, r.u.status);
    for (let i = 0; i < recs.length; i++) {
      const rec = recs[i];
      out.push({
        refId: `${r.u.id}:${i}`,
        dia: rec.dia,
        valor: rec.valor,
        descricao: `${r.u.code} — ${rec.label}`,
        unitCode: r.u.code,
        projectId: r.projectId,
        projectName: r.projectName,
        clienteNome: r.clienteNome,
        status: "A receber",
      });
    }
  }
  return out;
}
```

---

## 5. De `src/lib/calc/` e demais libs

### `src/lib/calc/projection.ts` · linhas 277–310

`permutaCashByMonth`.

```ts
/**
 * Recebimentos FINANCEIROS da revenda de bens recebidos em permuta, por mês.
 * À vista: 1 recebimento na data da venda. Parcelada: N parcelas iguais a
 * partir da 1ª, na periodicidade informada. Escambo NÃO gera caixa (sem
 * entrada financeira). Alimenta Fluxo de Caixa e Caixa (previstas).
 */
export function permutaCashByMonth(
  rows: readonly CalcPermutaResale[],
): MonthlyProjection {
  const out: MonthlyProjection = {};
  const add = (mm: string, v: number) => {
    if (v > 0) out[mm] = (out[mm] || 0) + v;
  };
  for (const r of rows) {
    const forma = (r.formaVenda || "").toLowerCase();
    if (!r.valorVenda || r.valorVenda <= 0) continue;
    if (forma === "escambo") continue; // sem entrada financeira
    if (forma === "parcelada" && r.parcelas > 0) {
      const d = parseDate(r.dataPrimParcela) ?? parseDate(r.dataVenda);
      if (!d) continue;
      const step = STEP[(r.periodicidade || "mensal").toLowerCase()] ?? 1;
      const parc = Math.round((r.valorVenda / r.parcelas) * 100) / 100;
      for (let i = 0; i < r.parcelas; i++) {
        const dt = addMonths(d.mo, d.yr, i * step);
        add(monthKey(dt.mo, dt.yr), parc);
      }
    } else {
      // à vista (ou forma não informada): recebimento único na data da venda.
      const d = parseDate(r.dataVenda) ?? parseDate(r.dataPrimParcela);
      if (d) add(monthKey(d.mo, d.yr), r.valorVenda);
    }
  }
  return out;
}
```

### `src/lib/contas-saldo.ts`

`lib/contas-saldo.ts` inteiro — `saldoDisponivel`, o saldo inicial.

```ts
/**
 * Saldo disponível da EMPRESA a partir das contas correntes.
 *
 * Contas do tipo "Terceiros" representam o quanto a empresa DEVE a um sócio,
 * mestre de obra ou funcionário que pagou despesas do próprio bolso. Isso é
 * obrigação, não dinheiro em caixa — por isso essas contas nunca entram no
 * saldo disponível consolidado.
 */
export const TIPO_CONTA_TERCEIROS = "Terceiros";

export interface ContaComSaldo {
  tipo: string;
  saldo: string | number;
}

/** Uma conta representa dinheiro disponível da empresa? */
export function isContaDaEmpresa(conta: { tipo: string }): boolean {
  return conta.tipo !== TIPO_CONTA_TERCEIROS;
}

/** Saldo disponível da empresa (exclui contas de terceiros). */
export function saldoDisponivel(contas: ContaComSaldo[]): number {
  return contas
    .filter(isContaDaEmpresa)
    .reduce((a, c) => a + (Number(c.saldo) || 0), 0);
}

/** Total devido a terceiros (soma das contas do tipo "Terceiros"). */
export function saldoDevidoTerceiros(contas: ContaComSaldo[]): number {
  return contas
    .filter((c) => !isContaDaEmpresa(c))
    .reduce((a, c) => a + (Number(c.saldo) || 0), 0);
}
```

### `src/lib/report-versions.ts`

`lib/report-versions.ts` inteiro — `resolveCompareVersions`.

```ts
import type { Version } from "@/lib/context";

/**
 * Resolve as versões selecionadas para comparação a partir do parâmetro `vs`
 * (ids separados por vírgula). Sem seleção, usa a versão ativa. Limita a `max`.
 */
export function resolveCompareVersions(
  vs: string | undefined,
  versions: Version[],
  active: Version,
  max = 3,
): Version[] {
  const ids = (vs ?? "").split(",").filter(Boolean);
  const sel = ids.length ? versions.filter((v) => ids.includes(v.id)) : [active];
  return (sel.length ? sel : [active]).slice(0, max);
}
```

### `src/lib/planning.ts` · linhas 65–89

`calendarYearWindows`.

```ts
/**
 * Recortes por ANO-CALENDÁRIO para os seletores de período dos relatórios:
 * 2025, 2026, 2027… do ano mais antigo com dados (ou o ano atual) até o ano
 * atual + `fwd` (padrão 5). Cada opção traz os 12 meses "MM/YYYY" do ano.
 */
export function calendarYearWindows(
  months: string[],
  currentYear: number,
  fwd: number = 5,
): { value: string; label: string; months: string[] }[] {
  const dataYears = months
    .map((m) => Number(m.split("/")[1]))
    .filter((y) => Number.isFinite(y) && y > 0);
  const start = Math.min(currentYear, ...(dataYears.length ? dataYears : [currentYear]));
  const end = Math.max(currentYear + fwd, ...(dataYears.length ? dataYears : [currentYear]));
  const out: { value: string; label: string; months: string[] }[] = [];
  for (let y = start; y <= end; y++) {
    out.push({
      value: String(y),
      label: String(y),
      months: Array.from({ length: 12 }, (_, i) => `${String(i + 1).padStart(2, "0")}/${y}`),
    });
  }
  return out;
}
```

---

## 6. Server Actions


A tela é **somente leitura** — não tem nenhuma action própria, e não grava
nada. A única action que entra no caminho é de leitura:
`getRestituicoesPendentesByVersion`, já colada na seção 3.

Não há `revalidatePath("/fluxocaixa")` disparado por ela mesma. As **dez**
chamadas que invalidam esta rota, em nove arquivos:

| Arquivo:linha | Contexto |
|---|---|
| `actions/despesas.ts:731` | `cancelarDespesa` |
| `actions/despesas.ts:823` | `pagarDespesa` |
| `actions/pagamentos.ts:117` | registro de pagamento |
| `actions/receitas.ts:53` | ação de reembolso |
| `actions/budget.ts:85` | gravação do Budget/Forecast |
| `actions/planning.ts:127` | gravação do planejamento |
| `actions/acerto.ts:349` | `concluirAcerto` |
| `actions/restituicoes.ts:481` | cancelamento de restituição |
| `actions/restituicao-lote.ts:314` | `confirmarRestituicaoLote` |
| `actions/recebimento-terceiro.ts:365` | `registrarRepasse` |

Como na DRE, **`addDespesa`, `updateDespesa` e `deleteDespesa` não estão na
lista** — e são elas que gravam `vencimento` e `valor`, os insumos das saídas
previstas. Também faltam as actions de `despesa_parcela`.

---

## 7. As tabelas envolvidas

### `src/lib/db/schema.ts` · linhas 956–998

`despesa_parcela` — a fonte principal das saídas previstas.

```ts
/** Parcela de uma despesa (conta a pagar). Fase 2. */
export const despesaParcelas = pgTable(
  "despesa_parcela",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    tenantId: uuid("tenant_id")
      .notNull()
      .references(() => tenants.id, { onDelete: "cascade" }),
    despesaId: uuid("despesa_id")
      .notNull()
      .references(() => despesas.id, { onDelete: "cascade" }),
    numeroParcela: integer("numero_parcela").notNull(),
    vencimento: text("vencimento"),
    valorOriginal: numeric("valor_original", { precision: 15, scale: 2 }).notNull().default("0"),
    valorPago: numeric("valor_pago", { precision: 15, scale: 2 }).notNull().default("0"),
    multa: numeric("multa", { precision: 15, scale: 2 }).notNull().default("0"),
    juros: numeric("juros", { precision: 15, scale: 2 }).notNull().default("0"),
    desconto: numeric("desconto", { precision: 15, scale: 2 }).notNull().default("0"),
    outrosAcrescimos: numeric("outros_acrescimos", { precision: 15, scale: 2 }).notNull().default("0"),
    dataPagamento: text("data_pagamento"),
    formaPagamento: text("forma_pagamento"),
    bankAccountId: uuid("bank_account_id").references(() => bankAccounts.id, {
      onDelete: "set null",
    }),
    /** Pendente | Pago | Pago parcialmente | Vencido | Renegociado | Cancelado */
    /** Pendente | Pago | Pago parcialmente | Vencido | Renegociado | Cancelado.
     *  Para CHEQUE o ciclo é próprio: Pendente | Compensado | Devolvido |
     *  Cancelado — "Pago" esconderia a devolução, que é o evento que importa. */
    status: text("status").notNull().default("Pendente"),
    obs: text("obs"),
    // ── Cheque POR PARCELA (item 2.5) ──────────────────────────────────────
    // Antes os dados do cheque viviam no cabeçalho da despesa, ou seja, um
    // cheque para a compra inteira. Talão real tem numeração salteada e cada
    // parcela é um cheque diferente — por isso estes campos são da PARCELA.
    numeroCheque: text("numero_cheque"),
    emitenteCheque: text("emitente_cheque"),
    dataEmissaoCheque: text("data_emissao_cheque"),
    /** data acordada de apresentação do cheque pré-datado ("bom para"). */
    dataBomPara: text("data_bom_para"),
    createdAt: timestamp("created_at", { mode: "date" }).notNull().defaultNow(),
  },
  (t) => [unique("despesa_parcela_uq").on(t.despesaId, t.numeroParcela)],
);
```

### `src/lib/db/schema.ts` · linhas 563–616

`despesa`.

```ts
/** Lançamento de despesa por versão (competência + dupla classificação). §8.1 */
export const despesas = pgTable("despesa", {
  id: uuid("id").primaryKey().defaultRandom(),
  versionId: uuid("version_id")
    .notNull()
    .references(() => versions.id, { onDelete: "cascade" }),
  tenantId: uuid("tenant_id")
    .notNull()
    .references(() => tenants.id, { onDelete: "cascade" }),
  /** nº de documento interno (ex.: BMV-2026-001682). */
  numDoc: text("num_doc"),
  fornecedorId: uuid("fornecedor_id").references(() => stakeholders.id, {
    onDelete: "set null",
  }),
  bancoId: uuid("banco_id").references(() => bankAccounts.id, {
    onDelete: "set null",
  }),
  /** subitem CEF/plano de contas (ex.: "1.1"). */
  contaCef: text("conta_cef"),
  categoriaDre: dreCategoryEnum("categoria_dre"),
  competencia: text("competencia"),
  vencimento: text("vencimento"),
  dataCaixa: text("data_caixa"),
  valor: numeric("valor", { precision: 15, scale: 2 }).notNull().default("0"),
  status: text("status"),
  obs: text("obs"),
  // ── Fase 2: forma e condição de pagamento ──
  formaPagamento: text("forma_pagamento"),
  formaPagamentoDesc: text("forma_pagamento_desc"),
  condicaoPagamento: text("condicao_pagamento"),
  qtdParcelas: integer("qtd_parcelas"),
  dataEmissao: text("data_emissao"),
  // boleto
  boletoLinhaDigitavel: text("boleto_linha_digitavel"),
  boletoCodigoBarras: text("boleto_codigo_barras"),
  boletoBanco: text("boleto_banco"),
  // cheque
  chequeNumero: text("cheque_numero"),
  chequeBanco: text("cheque_banco"),
  chequeAg: text("cheque_ag"),
  chequeConta: text("cheque_conta"),
  chequeEmitente: text("cheque_emitente"),
  chequeDataEmissao: text("cheque_data_emissao"),
  chequeDataCompensacao: text("cheque_data_compensacao"),
  chequeStatus: text("cheque_status"),
  /** Fase 4: despesa paga por terceiro (não gera saída de caixa na competência). */
  pagoPorTerceiro: boolean("pago_por_terceiro").notNull().default(false),
  /** Cancelamento lógico: mantém histórico, sai de saldos/relatórios. */
  cancelado: boolean("cancelado").notNull().default(false),
  canceladoEm: text("cancelado_em"),
  canceladoPor: text("cancelado_por"),
  motivoCancelamento: text("motivo_cancelamento"),
  createdAt: timestamp("created_at", { mode: "date" }).notNull().defaultNow(),
});
```

### `src/lib/db/schema.ts` · linhas 1201–1235

`cash_entry` — a fonte do realizado. Note a coluna `rec`.

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

### `src/lib/db/schema.ts` · linhas 514–531

`bank_account` — a fonte do saldo inicial.

```ts
/** Conta bancária do tenant, com campos preparados para Open Finance. §3 */
export const bankAccounts = pgTable("bank_account", {
  id: uuid("id").primaryKey().defaultRandom(),
  tenantId: uuid("tenant_id")
    .notNull()
    .references(() => tenants.id, { onDelete: "cascade" }),
  banco: text("banco").notNull(),
  ag: text("ag"),
  op: text("op"),
  cc: text("cc"),
  tipo: bankAccountTypeEnum("tipo").notNull().default("Construtora"),
  /** saldo atual da conta — rastreado (Open Finance/extrato) ou manual. */
  saldo: numeric("saldo", { precision: 15, scale: 2 }).notNull().default("0"),
  /** como o saldo é atualizado: "manual" ou "auto" (Open Finance/extrato). */
  saldoSource: text("saldo_source").notNull().default("manual"),
  openFinanceId: text("open_finance_id"),
  lastSync: timestamp("last_sync", { mode: "date" }),
});
```

### `src/lib/db/schema.ts` · linhas 620–660

`despesa_terceiro` — a saída prevista das restituições.

```ts
 * reconhecida 1× na DRE (competência); esta tabela registra a OBRIGAÇÃO da
 * empresa com quem desembolsou. A saída de caixa ocorre só nas restituições.
 */
export const despesaTerceiros = pgTable("despesa_terceiro", {
  id: uuid("id").primaryKey().defaultRandom(),
  tenantId: uuid("tenant_id")
    .notNull()
    .references(() => tenants.id, { onDelete: "cascade" }),
  despesaId: uuid("despesa_id")
    .notNull()
    .references(() => despesas.id, { onDelete: "cascade" }),
  /** quem desembolsou o dinheiro (consultora/sócio/funcionário/empresa). */
  pagadorTerceiroId: uuid("pagador_terceiro_id").references(() => stakeholders.id, {
    onDelete: "set null",
  }),
  /** empresa/projeto responsável pela obrigação. */
  empresaResponsavelId: uuid("empresa_responsavel_id").references(() => projects.id, {
    onDelete: "set null",
  }),
  valorTotal: numeric("valor_total", { precision: 15, scale: 2 }).notNull().default("0"),
  valorRestituido: numeric("valor_restituido", { precision: 15, scale: 2 }).notNull().default("0"),
  dataPagamentoOriginal: text("data_pagamento_original"),
  dataPrevistaRestituicao: text("data_prevista_restituicao"),
  /**
   * Aguardando restituição | Parcialmente restituído | Restituído | Cancelado
   *
   * "Aguardando restituição" é o valor histórico e continua sendo gravado —
   * nenhum registro antigo é reclassificado. Na interface ele é exibido como
   * "Pendente" (ver `rotuloStatusObrigacao`), que é o vocabulário pedido.
   */
  status: text("status").notNull().default("Aguardando restituição"),
  obs: text("obs"),
  /**
   * Chave de idempotência (§16): duas submissões do MESMO fato (duplo clique,
   * reenvio de formulário, refresh) colidem aqui em vez de criar duas
   * obrigações. Nulo nos registros anteriores à trava — por isso o índice é
   * parcial (WHERE NOT NULL).
   */
  idempotencyKey: text("idempotency_key"),
  createdAt: timestamp("created_at", { mode: "date" }).notNull().defaultNow(),
});
```

---

## 8. As perguntas


### (a) O "Saldo acumulado" acumula o quê?


**Previsto puro. Sua conta está confirmada.**

A expressão exata (`page.tsx:170–176`):

```ts
// Saldo acumulado corre desde o saldo inicial ao longo de todo o horizonte.
let acumulado = saldoInicial;
const acumMap: Record<string, number> = {};
for (const mm of axis) {
  acumulado += (entradas[mm] || 0) - (saidas[mm] || 0);
  acumMap[mm] = acumulado;
}
```

`entradas` e `saidas` vêm de `fluxos[0]` (`page.tsx:126`), que é o retorno de
`flowMaps` — **o mapa PREVISTO**. O objeto `realizado` existe na página
(`page.tsx:122`) e alimenta só as duas colunas "Realizado ↑" e "Realizado ↓"
(`page.tsx:355–366`). **Ele não entra no acumulado em ponto nenhum.**

Três detalhes do laço:

- **Corre sobre `axis`, não sobre `yearMonths`** — o acumulado atravessa todo
  o horizonte, inclusive meses fora do período exibido. A linha do ano
  selecionado mostra o acumulado que já veio de trás.
- **Não há `Math.max(0, …)`** — o acumulado pode ficar negativo.
- A célula é `brl0(l.saldo)` (`page.tsx:368`), sem condicional.

Portanto `344.707 − 5.076 = 339.631` é exatamente o que o código faz: saldo
acumulado anterior menos a saída **prevista** do mês, sem nenhum realizado no
meio.

### `src/app/(app)/fluxocaixa/page.tsx` · linhas 166–190

O laço do acumulado e os totais.

```tsx
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
```

### (b) De onde vem o saldo inicial


**De `bank_account.saldo`.** Não de `cash_entry`, não de `daily_closing`, não
de `carry_over`.

O código é uma linha (`page.tsx:128–130`):

```ts
// Saldo inicial = soma dos saldos das contas correntes.
// Saldo inicial = só contas da empresa (contas "Terceiros" são obrigações).
const saldoInicial = saldoDisponivel(contas);
```

onde `contas = await getBankAccounts(ctx.tenant.id)` (`page.tsx:117`) e
`saldoDisponivel` (`contas-saldo.ts:22–26`) soma `Number(c.saldo)` de todas as
contas **exceto** as de tipo `"Terceiros"`.

| Candidato | É a origem? | Por quê |
|---|---|---|
| `bank_account.saldo` | **SIM** | `getBankAccounts` → `saldoDisponivel` |
| `cash_entry` anterior ao período | não | `getCash` só alimenta o realizado, por mês |
| `daily_closing` | não | a tela não importa `getDailyClosings` |
| `carry_over` | não | tabela sem nenhuma leitura no repositório |

**Sobre os 8.707 da OBRA 28:** o saldo inicial é do **tenant inteiro** —
`getBankAccounts(ctx.tenant.id)`, sem filtro de projeto. Ele é o mesmo número
qualquer que seja o projeto ou a versão selecionada. Se as entradas previstas
do período somam 336.000 e o acumulado começa em 344.707, a diferença de
8.707 é o saldo das contas correntes da empresa — não algo do projeto.

Nota: `bank_account.saldo` é estático entre importações. Ele só muda quando
`importCash` recebe um saldo final de extrato (`caixa.ts:364–378`);
lançamentos manuais em `cash_entry` **não** o alteram.

### `src/app/(app)/fluxocaixa/page.tsx` · linhas 112–131

Onde as contas são buscadas e o saldo inicial calculado.

```tsx
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
```

### `src/lib/contas-saldo.ts` · linhas 21–26

`saldoDisponivel`.

```ts
/** Saldo disponível da empresa (exclui contas de terceiros). */
export function saldoDisponivel(contas: ContaComSaldo[]): number {
  return contas
    .filter(isContaDaEmpresa)
    .reduce((a, c) => a + (Number(c.saldo) || 0), 0);
}
```

### (c) As origens do previsto de ENTRADAS


São **duas** no código do `flowMaps` — e a primeira delas se subdivide em três
dentro de `getMonthlyRevenue`.

```ts
const [entradas, despesas, permutas, parcelas] = await Promise.all([
  getMonthlyRevenue(version.id, projectId),
  …
]);
const permCash = permutaCashByMonth(permToResale(permutas));
for (const [mm, v] of Object.entries(permCash)) {
  entradas[mm] = (entradas[mm] || 0) + v;
}
```

(`fluxo-caixa.ts:40–51`.) Uma a uma:

| # | Origem | Entra? | Tabela | Coluna de data | Formato |
|---|---|---|---|---|---|
| 1 | `expandUnitReceivables` das unidades vendidas | **SIM** | `unit.payment_plan` (JSON) | `rec.dia`, derivada do plano | `"MM/DD/YYYY"` |
| 2 | `conta_receber` não cancelada | **SIM** | `conta_receber` | **`vencimento`** | `"MM/DD/YYYY"` |
| 3 | `reembolso` | **SIM** | `reembolso` | **`data`** | `"MM/DD/YYYY"` |
| 4 | `permutaCashByMonth` | **SIM** | `permuta` | `data_venda` / `data_prim_parcela` | `"MM/DD/YYYY"` |
| 5 | `budget_line` kind = receita | **SIM, no lugar de 1–3** | `budget_line` | **`mes`** | `"MM/YYYY"` |

As origens 1–3 são o ramo **Atual** de `getMonthlyRevenue`
(`queries.ts:1133–1174`); a 5 é o ramo **Budget/Forecast** (`queries.ts:1118–1131`),
que faz `return` antes das outras. A origem 4 é somada **fora** de
`getMonthlyRevenue`, no próprio `flowMaps`, e vale para qualquer kind.

Respondendo item a item: **`expandUnitReceivables` entra** (via origem 1);
**`conta_receber` entra** (origem 2); **`reembolso` entra** (origem 3);
**`permutaCashByMonth` entra** (origem 4).

Três observações factuais:

- **O previsto de entradas não filtra o que já foi recebido.** Não há
  verificação de `conta_receber.valor_recebido` nem de status. Um recebível já
  liquidado continua no previsto, no mês do vencimento — e reaparece no
  realizado, no mês da liquidação.
- A origem 4 usa `permutaCashByMonth`, **não** `permutaRevenueByMonth`. A
  diferença: a de receita inclui escambo na data do escambo (só DRE); a de
  caixa não.
- Todas as datas viram mês por fatia de string, não por parse de calendário.

### `src/lib/calc/projection.ts` · linhas 277–310

`permutaCashByMonth` — a origem 4.

```ts
/**
 * Recebimentos FINANCEIROS da revenda de bens recebidos em permuta, por mês.
 * À vista: 1 recebimento na data da venda. Parcelada: N parcelas iguais a
 * partir da 1ª, na periodicidade informada. Escambo NÃO gera caixa (sem
 * entrada financeira). Alimenta Fluxo de Caixa e Caixa (previstas).
 */
export function permutaCashByMonth(
  rows: readonly CalcPermutaResale[],
): MonthlyProjection {
  const out: MonthlyProjection = {};
  const add = (mm: string, v: number) => {
    if (v > 0) out[mm] = (out[mm] || 0) + v;
  };
  for (const r of rows) {
    const forma = (r.formaVenda || "").toLowerCase();
    if (!r.valorVenda || r.valorVenda <= 0) continue;
    if (forma === "escambo") continue; // sem entrada financeira
    if (forma === "parcelada" && r.parcelas > 0) {
      const d = parseDate(r.dataPrimParcela) ?? parseDate(r.dataVenda);
      if (!d) continue;
      const step = STEP[(r.periodicidade || "mensal").toLowerCase()] ?? 1;
      const parc = Math.round((r.valorVenda / r.parcelas) * 100) / 100;
      for (let i = 0; i < r.parcelas; i++) {
        const dt = addMonths(d.mo, d.yr, i * step);
        add(monthKey(dt.mo, dt.yr), parc);
      }
    } else {
      // à vista (ou forma não informada): recebimento único na data da venda.
      const d = parseDate(r.dataVenda) ?? parseDate(r.dataPrimParcela);
      if (d) add(monthKey(d.mo, d.yr), r.valorVenda);
    }
  }
  return out;
}
```

### (d) A coluna de data das SAÍDAS previstas


**As duas, em ordem de precedência: `despesa_parcela.vencimento` primeiro,
`despesa.vencimento` como caminho alternativo.**

O código são dois laços (`fluxo-caixa.ts:72–86`):

```ts
for (const p of parcelas) {
  if (p.status === "Cancelado" || excluir.has(p.despesaId) || canceladas.has(p.despesaId))
    continue;
  const mm = vencMonth(p.vencimento);
  if (mm) saidas[mm] = (saidas[mm] || 0) + Number(p.valorOriginal);
}
for (const d of despesas) {
  if (comParcela.has(d.id) || excluir.has(d.id) || d.cancelado) continue;
  const mm = vencMonth(d.vencimento) ?? vencMonth(d.competencia);
  if (mm) saidas[mm] = (saidas[mm] || 0) + Number(d.valor);
}
```

| Caso | Coluna de data | Valor somado |
|---|---|---|
| Despesa **com** parcela | `despesa_parcela.vencimento` | `parcela.valor_original` |
| Despesa **sem** parcela | `despesa.vencimento`, com fallback para `despesa.competencia` | `despesa.valor` |
| Restituição pendente | `despesa_terceiro.data_prevista_restituicao` | saldo a restituir |
| Ramo Budget/Forecast | `budget_line.mes` | `valor` |

O `comParcela` (linha 67) é o que impede dupla contagem: despesa que tem
parcela é pulada no segundo laço.

**O `where` e o `order by` exatos das duas consultas:**

```ts
// getParcelasByVersion — queries.ts:1003–1012
db.select({ p: schema.despesaParcelas, numDoc: …, contaCef: …, categoriaDre: … })
  .from(schema.despesaParcelas)
  .innerJoin(schema.despesas, eq(schema.despesaParcelas.despesaId, schema.despesas.id))
  .where(eq(schema.despesas.versionId, versionId));
// ↑ sem orderBy, sem tenant

// getDespesas — queries.ts:239–243
db.select()
  .from(schema.despesas)
  .where(eq(schema.despesas.versionId, versionId))
  .orderBy(asc(schema.despesas.competencia));
```

`getParcelasByVersion` **não tem `orderBy` nenhum**; o `where` é uma condição
só, sobre `despesa.version_id` (via join), **sem `tenant_id`**. `getDespesas`
ordena por `competencia`, coluna `text` — ver (o).

### `src/lib/queries.ts` · linhas 997–1019

`getParcelasByVersion`.

```ts
export type ParcelaRow = typeof schema.despesaParcelas.$inferSelect;

/** Parcelas de contas a pagar de uma versão (join com despesa). Fase 2. */
export async function getParcelasByVersion(
  versionId: string,
): Promise<(ParcelaRow & { despesaNumDoc: string | null; contaCef: string | null; categoriaDre: string | null })[]> {
  const rows = await db
    .select({
      p: schema.despesaParcelas,
      numDoc: schema.despesas.numDoc,
      contaCef: schema.despesas.contaCef,
      categoriaDre: schema.despesas.categoriaDre,
    })
    .from(schema.despesaParcelas)
    .innerJoin(schema.despesas, eq(schema.despesaParcelas.despesaId, schema.despesas.id))
    .where(eq(schema.despesas.versionId, versionId));
  return rows.map((r) => ({
    ...r.p,
    despesaNumDoc: r.numDoc,
    contaCef: r.contaCef,
    categoriaDre: r.categoriaDre,
  }));
}
```

### `src/lib/fluxo-caixa.ts` · linhas 61–91

O ramo detalhado do `flowMaps` — os dois laços e as três exclusões.

```ts
  } else {
    // Versão detalhada: despesas pagas por terceiro NÃO geram saída na
    // competência — a saída ocorre só na restituição (Fase 4).
    const { despesaIds: terceiroIds, saidasPrevistas: restPrevistas } =
      await getRestituicoesPendentesByVersion(version.id);
    const excluir = new Set(terceiroIds);
    const comParcela = new Set(parcelas.map((p) => p.despesaId));
    // Despesas CANCELADAS não geram saída. Antes só as parcelas canceladas eram
    // puladas, então uma despesa cancelada seguia inflando o fluxo — enquanto
    // sumia de Contas a Pagar, que filtra cancelado.
    const canceladas = new Set(despesas.filter((d) => d.cancelado).map((d) => d.id));
    for (const p of parcelas) {
      if (
        p.status === "Cancelado" ||
        excluir.has(p.despesaId) ||
        canceladas.has(p.despesaId)
      )
        continue;
      const mm = vencMonth(p.vencimento);
      if (mm) saidas[mm] = (saidas[mm] || 0) + Number(p.valorOriginal);
    }
    for (const d of despesas) {
      if (comParcela.has(d.id) || excluir.has(d.id) || d.cancelado) continue;
      const mm = vencMonth(d.vencimento) ?? vencMonth(d.competencia);
      if (mm) saidas[mm] = (saidas[mm] || 0) + Number(d.valor);
    }
    for (const [mm, v] of Object.entries(restPrevistas)) {
      saidas[mm] = (saidas[mm] || 0) + v;
    }
  }
  return { entradas, saidas };
```

### (e) O REALIZADO


**Vem de `cash_entry`. NÃO filtra a coluna `rec`.**

A consulta é `getCash(versionId)` (`queries.ts:1061–1067`):

```ts
export async function getCash(versionId: string): Promise<CashRow[]> {
  return db
    .select()
    .from(schema.cashEntries)
    .where(eq(schema.cashEntries.versionId, versionId))
    .orderBy(asc(schema.cashEntries.data));
}
```

Uma condição só: `version_id`. **Sem `tenant_id`, sem `rec`, sem data.**

E o consumo (`fluxo-caixa.ts:119–130`):

```ts
const lancamentos = await getCash(versionId);
for (const c of lancamentos) {
  const mm = vencMonth(c.data);
  if (!mm) continue;
  const v = Number(c.valor);
  if (!Number.isFinite(v) || v === 0) continue;
  if (v > 0) entradas[mm] = (entradas[mm] || 0) + v;
  else saidas[mm] = (saidas[mm] || 0) + Math.abs(v);
}
```

O campo `rec` **não é lido em lugar nenhum** de `flowMapsRealizado`. Os únicos
descartes são: lançamento sem data (`!mm`), valor não finito e valor zero. O
sinal decide o lado; saídas voltam em módulo.

Consequência: **um lançamento de caixa não conciliado entra no realizado**
igual a um conciliado. A coluna de data é `cash_entry.data`, que é a data do
lançamento/extrato — não a data de conciliação (`conciliado_em`).

### `src/lib/fluxo-caixa.ts` · linhas 95–132

`flowMapsRealizado` inteira, com o comentário que explica a separação previsto × realizado.

```ts
/**
 * Fluxo REALIZADO — RG-01.
 *
 * O `flowMaps` acima monta o fluxo PREVISTO: ele projeta pelo VENCIMENTO das
 * parcelas e das despesas, ou seja, mostra o que se espera pagar e receber.
 * Isso é uma previsão, e continua valendo — é o que a empresa usa para se
 * programar.
 *
 * O que faltava era o outro lado da RG-01: o fluxo montado pela **data de
 * liquidação**, isto é, o dinheiro que de fato passou pela conta. É o que esta
 * função devolve, lendo `cash_entry` (os lançamentos do extrato e as baixas
 * conciliadas) pela data em que ocorreram.
 *
 * As duas visões convivem lado a lado e NENHUM número do previsto muda por
 * causa desta função: ela lê uma fonte diferente e não toca em `flowMaps`.
 *
 * Convenção de sinal de `cash_entry`: positivo entra, negativo sai. Aqui as
 * saídas são devolvidas em módulo, para somar na mesma escala do previsto.
 */
export async function flowMapsRealizado(
  versionId: string,
): Promise<{ entradas: Record<string, number>; saidas: Record<string, number> }> {
  const entradas: Record<string, number> = {};
  const saidas: Record<string, number> = {};
  const lancamentos = await getCash(versionId);
  for (const c of lancamentos) {
    // Sem data não há competência de caixa a atribuir — o lançamento existe,
    // mas não entra em nenhum mês (e some-lo do total seria pior do que
    // reportá-lo em mês errado).
    const mm = vencMonth(c.data);
    if (!mm) continue;
    const v = Number(c.valor);
    if (!Number.isFinite(v) || v === 0) continue;
    if (v > 0) entradas[mm] = (entradas[mm] || 0) + v;
    else saidas[mm] = (saidas[mm] || 0) + Math.abs(v);
  }
  return { entradas, saidas };
}
```

### (f) Despesa já paga aparece nas duas colunas?


**Sim — e isso é deliberado, documentado no comentário do próprio módulo.**

`flowMaps` **não verifica status de pagamento em ponto nenhum**. Os três
filtros do laço de parcelas (`fluxo-caixa.ts:73–78`) são: `p.status ===
"Cancelado"`, despesa paga por terceiro, e despesa cancelada. **`"Pago"` não
é filtrado.** Uma parcela liquidada continua no previsto, no mês do seu
vencimento.

Ao mesmo tempo, a baixa dessa despesa gerou um `cash_entry` — e
`flowMapsRealizado` a conta no mês da liquidação.

O comentário das linhas 98–109 registra a intenção:

> *"O `flowMaps` acima monta o fluxo PREVISTO: ele projeta pelo VENCIMENTO das
> parcelas e das despesas… As duas visões convivem lado a lado e NENHUM número
> do previsto muda por causa desta função."*

**E o card "Total saídas"? Soma só uma — a prevista.**

```ts
const totS = linhas.reduce((a, l) => a + l.s, 0);
```

(`page.tsx:188`), onde `l.s = saidas[mm] || 0` (`page.tsx:180`) e `saidas` é
`fluxos[0].saidas` — o previsto. **O objeto `realizado` não entra em nenhum
dos três cards.** Ele aparece apenas nas duas colunas da tabela.

O mesmo vale para a linha TOTAL da tabela (`page.tsx:384–400`): soma
`f.entradas`/`f.saidas` por versão, sem tocar no realizado. **A tabela não tem
linha de total para as colunas de realizado.**

### (g) Os três cards


**"todo o horizonte"** é `horizonteE`/`horizonteS` — a soma de **todos os
meses** dos mapas, não só do período exibido (`page.tsx:183–186`):

```ts
// Totais de TODO o horizonte (não só do ano selecionado) — assim o usuário vê
// de imediato que o restante do dinheiro está em outros anos, e em quais.
const horizonteE = Object.values(entradas).reduce((a, v) => a + v, 0);
const horizonteS = Object.values(saidas).reduce((a, v) => a + v, 0);
```

O *hint* só aparece **quando o número difere do total do período**
(`horizonteE !== totE`). Se o período exibido já contém tudo, o hint some.

**"movimento em 2026, 2027"** é `anosComMovimento.join(", ")`
(`page.tsx:288`), calculado em `page.tsx:151–158`: os anos distintos das
chaves de `entradas`/`saidas` cujo valor não é zero. O hint só aparece quando
há **mais de um** ano com movimento (`anosComMovimento.length > 1`).

Os três cards, na íntegra:

### `src/app/(app)/fluxocaixa/page.tsx` · linhas 257–293

Os três `Kpi` do modo de versão única.

```tsx
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
```

### `src/app/(app)/fluxocaixa/page.tsx` · linhas 183–190

De onde saem `horizonteE`, `horizonteS`, `totE` e `totS`.

```tsx
  // Totais de TODO o horizonte (não só do ano selecionado) — assim o usuário vê
  // de imediato que o restante do dinheiro está em outros anos, e em quais.
  const horizonteE = Object.values(entradas).reduce((a, v) => a + v, 0);
  const horizonteS = Object.values(saidas).reduce((a, v) => a + v, 0);
  const totE = linhas.reduce((a, l) => a + l.e, 0);
  const totS = linhas.reduce((a, l) => a + l.s, 0);
  const saldoAcumFinal = linhas.length ? linhas[linhas.length - 1].saldo : saldoInicial;
```

### `src/app/(app)/fluxocaixa/page.tsx` · linhas 151–164

`anosComMovimento` e o ano padrão.

```tsx
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
```

### `src/app/(app)/fluxocaixa/page.tsx` · linhas 414–455

O componente `Kpi`, local da página.

```tsx
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
```

### (h) Os dois controles de período


**São dois parâmetros distintos, e o intervalo de datas vence.**

| Controle | Componente | Parâmetro |
|---|---|---|
| Data inicial / final | `DateRangeFilter` | `?de=` e `?ate=` |
| Seletor de ano | `ProjecaoYearSelect` | `?ano=` |

A resolução (`page.tsx:165–168`):

```ts
// Com período informado, o intervalo de datas tem prioridade sobre o ano.
const yearMonths = hasRange
  ? axis.filter((mm) => monthInRange(mm, de, ate))
  : years.find((y) => y.value === selectedYear)?.months ?? [];
```

com `hasRange = !!(de || ate)` (`page.tsx:35`) — **basta UM dos dois campos
preenchido** para o ano ser ignorado.

E não é só prioridade: **o seletor de ano some da tela** quando há intervalo
(`page.tsx:204`):

```tsx
{!hasRange && years.length > 1 && (
  <ProjecaoYearSelect years={years} selected={selectedYear} basePath="/fluxocaixa" />
)}
```

Ou seja, os dois nunca ficam ativos ao mesmo tempo na interface — mas o `?ano=`
continua na URL e volta a valer assim que o intervalo é limpo.

Detalhe do filtro: `monthInRange(mm, de, ate)` recebe `mm` em `"MM/YYYY"` e
`de`/`ate` em `"MM/DD/YYYY"` (o formato do `DateField`). Funciona porque `ym`
aceita 2 ou 3 partes e **descarta o dia** — o recorte é por mês inteiro, não
por dia.

### `src/app/(app)/fluxocaixa/page.tsx` · linhas 139–168

As janelas de ano, o ano padrão e a resolução do período.

```tsx
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
```

### (i) Mês sem movimento


O JSX das três células (`page.tsx:338–354`):

```tsx
<TD className="… text-[var(--color-success)]">
  {e > 0 ? brl0(e) : "—"}
</TD>
<TD className="… text-[var(--color-danger)]">
  {sa > 0 ? brl0(sa) : "—"}
</TD>
<TD className="… font-medium text-[var(--color-success)]">
  {brl0(e - sa)}
</TD>
```

**O que distingue as duas:** Entradas e Saídas têm o teste `> 0` antes de
formatar; "Saldo do mês" **não tem teste nenhum** — é `brl0(e - sa)`
incondicional, e `brl0(0)` é `R$ 0`.

| Célula | Expressão | Mês vazio |
|---|---|---|
| Entradas | `e > 0 ? brl0(e) : "—"` | `—` |
| Saídas | `sa > 0 ? brl0(sa) : "—"` | `—` |
| Saldo do mês | `brl0(e - sa)` | **`R$ 0`** |
| Realizado ↑ | `(realizado.entradas[l.mm] \|\| 0) > 0 ? … : "—"` | `—` |
| Realizado ↓ | `(realizado.saidas[l.mm] \|\| 0) > 0 ? … : "—"` | `—` |
| Saldo acumulado | `brl0(l.saldo)` | valor herdado do mês anterior |

O teste é `> 0`, não `!== 0`: um mês cujas entradas somem exatamente zero
**por compensação** (o que `flowMaps` não produz, porque só soma positivos)
exibiria `—` também. E um valor negativo em `entradas` — que o código não
gera — cairia no `—` igualmente.

Quando **nenhuma** linha existe no período, a tabela mostra uma linha única
com *"Sem movimentação neste período."* (`page.tsx:372–380`).

### `src/app/(app)/fluxocaixa/page.tsx` · linhas 332–405

O corpo da tabela inteiro — as células e a linha TOTAL.

```tsx
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
```

### (j) Existe cálculo de desvio previsto × realizado?


**Não.** Não há coluna, card, nem variável que subtraia realizado de previsto.

Busca por `desvio`, `diferenca`/`diferença`, `variacao` e `gap` no `page.tsx`
e em `fluxo-caixa.ts`: nenhuma ocorrência relacionada.

**O único cálculo de diferença da tela é entre VERSÕES**, não entre previsto e
realizado (`page.tsx:220–223`):

```ts
const ref =
  yearMonths.reduce((a, m) => a + (fluxos[0].entradas[m] || 0), 0) -
  yearMonths.reduce((a, m) => a + (fluxos[0].saidas[m] || 0), 0);
const dif = saldo - ref;
```

Esse `dif` só existe no modo de comparação de versões, e compara o saldo de
cada versão com o da **primeira** (referência). No modo de versão única ele
nem é calculado.

As colunas "Realizado ↑" e "Realizado ↓" ficam lado a lado com as previstas e
**a conta fica para o olho do leitor** — nada no código as confronta.

### (k) Como a tela resolve projeto e versão


**Projeto** (`page.tsx:40–42`):

```ts
const isAll = sp.proj === "all";
const project =
  ctx.projects.find((p) => p.id === sp.proj) ?? ctx.project ?? ctx.projects[0];
```

**Três fallbacks encadeados:** `?proj=` → `ctx.project` → `ctx.projects[0]`.
O `ctx.projects[0]` é o fallback que a DRE **não** tem.

**Versão** (`page.tsx:44–51`):

```ts
const versoesProj = await getVersionsDoProjeto(ctx.tenant.id, project.id);
const versoes = versoesProj.length > 0 ? versoesProj : ctx.versions;
const atualVersion = versoes.find((v) => v.kind === "atual") ?? versoes[0] ?? ctx.version;
const compareVersions = resolveCompareVersions(sp.vs, versoes, atualVersion);
```

**Quatro fallbacks:** `kind === "atual"` → primeira versão da lista →
`ctx.version`; e a própria lista cai em `ctx.versions` se o projeto não
tiver versões.

| Pergunta | Resposta |
|---|---|
| Lê `version.kind`? | **sim** — `find(v => v.kind === "atual")` (`page.tsx:50`, `:75`, `:96`) e `isBudgetVersion(version.kind)` (`fluxo-caixa.ts:54`) |
| Lê `version.status`? | **não** — nenhuma ocorrência |
| Cascata como a `versionIdOfKind` da DRE? | **parecida, mas em memória** — a DRE consulta o banco por projeto; aqui `getVersionsDoProjeto` já traz a lista e o `find` roda em JS |
| Cookie? | não diretamente — só via `getActiveContext` |

**Diferença importante em relação à DRE:** aqui a versão vem sempre de
`getVersionsDoProjeto`, que **tem `tenant_id` no where**. A consulta inline da
DRE (`versionIdOfKind`) não tem.

No modo `?proj=all`, a resolução se repete **por projeto**
(`page.tsx:71–87` e `:90–106`): para cada um, `getVersionsDoProjeto` e
`find(kind === "atual") ?? vs[0]`. Projeto sem versão devolve mapas vazios.

### `src/app/(app)/fluxocaixa/page.tsx` · linhas 36–64

A resolução de projeto e versões.

```tsx

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
```

### `src/app/(app)/fluxocaixa/page.tsx` · linhas 66–106

Os dois consolidadores — N+1 de `getVersionsDoProjeto` por projeto.

```tsx
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
```

### (l) O seletor permite mais de uma versão?


**Sim — até três**, por `resolveCompareVersions(sp.vs, versoes, atualVersion)`
com `max = 3` (`report-versions.ts:11`).

**O que muda com duas versões:**

| Elemento | 1 versão | 2–3 versões |
|---|---|---|
| Cards do topo | três `Kpi` (Entradas / Saídas / Saldo) | **um card por versão**, com a diferença vs a primeira |
| Cabeçalho da tabela | uma linha | **duas linhas** — a primeira agrupa 3 colunas por versão (`colSpan={3}`) |
| Colunas por versão | Entradas · Saídas · Saldo do mês | as mesmas, **repetidas por versão** |
| Colunas de Realizado | 2 | **2, sempre** — só de `compareVersions[0]` |
| Saldo acumulado | 1 coluna | **1 coluna**, só de `fluxos[0]` |
| Subtítulo | "por data de vencimento/pagamento" | "Comparando versões mês a mês" |

Dois pontos que saem da tabela acima:

- **O realizado é só da primeira versão.** `flowMapsRealizado(compareVersions[0].id)`
  (`page.tsx:122`) — comparar três versões mostra três pares de colunas
  previstas contra **um único** par de realizado.
- **O saldo acumulado também é só da primeira.** `acumMap` é montado de
  `entradas`/`saidas`, que são `fluxos[0]` (`page.tsx:126`). A coluna final não
  se repete por versão.

No modo `?proj=all`, o seletor de versões **desaparece**
(`versionSelect = isAll ? null : …`, `page.tsx:59`) e a tabela volta a uma
coluna, com `versoesTabela = [atualVersion]` (`page.tsx:111`).

### `src/app/(app)/fluxocaixa/page.tsx` · linhas 212–256

Os cards do modo comparação, com o cálculo da diferença.

```tsx
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
```

### `src/app/(app)/fluxocaixa/page.tsx` · linhas 295–331

O cabeçalho de duas linhas.

```tsx
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
```

### `src/lib/report-versions.ts`

`resolveCompareVersions`.

```ts
import type { Version } from "@/lib/context";

/**
 * Resolve as versões selecionadas para comparação a partir do parâmetro `vs`
 * (ids separados por vírgula). Sem seleção, usa a versão ativa. Limita a `max`.
 */
export function resolveCompareVersions(
  vs: string | undefined,
  versions: Version[],
  active: Version,
  max = 3,
): Version[] {
  const ids = (vs ?? "").split(",").filter(Boolean);
  const sel = ids.length ? versions.filter((v) => ids.includes(v.id)) : [active];
  return (sel.length ? sel : [active]).slice(0, max);
}
```

### (m) `can(ctx.perms, "fluxocaixa", "ver")`?


**A página não chama `can` nenhuma vez** — não importa `can` nem
`AccessDenied`. O guard inteiro são duas linhas (`page.tsx:29–30`):

```tsx
const ctx = await getActiveContext();
if (!ctx) return null;
```

**Mas `"fluxocaixa"` ESTÁ em `SCREENS`** (`permissions.ts:43`), então o
enforcement central do layout cobre a rota: `screenIdOfPath("/fluxocaixa")`
devolve `"fluxocaixa"` e `layout.tsx:94–95` aplica a checagem no servidor,
antes de a página renderizar.

É o mesmo padrão da DRE e do Dashboard. `"fluxocaixa"` também está na lista
`CONTADOR_VE` (`permissions.ts:86`), o subconjunto que o perfil contador
enxerga em modo leitura.

### `src/lib/permissions.ts` · linhas 41–46

`fluxocaixa` em `SCREENS`.

```ts
  { id: "balancodia", label: "Balanço do Dia", modulo: "Reports" },
  { id: "dre", label: "DRE", modulo: "Reports" },
  { id: "fluxocaixa", label: "Fluxo de Caixa", modulo: "Reports" },
  { id: "medicao", label: "Medição de Obra", modulo: "Reports" },
  { id: "resumo", label: "Resumo Executivo", modulo: "Reports" },
  { id: "unidades", label: "Unidades / Dados de Venda", modulo: "Receitas" },
```

### `src/lib/permissions.ts` · linhas 83–93

`CONTADOR_VE` — inclui `fluxocaixa`.

```ts
/** Telas que o perfil "contador" (somente leitura) enxerga. */
const CONTADOR_VE = new Set([
  "dre",
  "fluxocaixa",
  "medicao",
  "resumo",
  "consolidado",
  "planocontas",
  "despesas",
  "acoes",
]);
```

### `src/app/(app)/layout.tsx` · linhas 92–95

O enforcement central.

```tsx
  // Enforcement central de "Ver": mapeia a rota atual para a tela governada.
  const pathname = (await headers()).get("x-pathname");
  const screenId = screenIdOfPath(pathname);
  const denied = screenId ? !can(ctx.perms, screenId, "ver") : false;
```

### (n) `tenant_id` no where, linha a linha


| # | Função | Linha | Tabela | Tenant no WHERE? | O que há no WHERE |
|---|---|---|---|---|---|
| 1 | `getBankAccounts` | `queries.ts:225` | `bank_account` | **SIM** | `eq(bankAccounts.tenantId, tenantId)` |
| 2 | `getVersionsDoProjeto` | `queries.ts:2204–2209` | `version` | **SIM** | `tenantId` + `projectId` |
| 3 | `getInccRows` | `queries.ts:154` | `incc_rate` | **NÃO** | só `eq(inccRates.projectId, projectId)` |
| 4 | `getMonthlyRevenue` (budget) | `queries.ts:1122–1127` | `budget_line` | **NÃO** | `version_id` + `kind` |
| 5 | `getMonthlyRevenue` → `getUnits` | `queries.ts:89` | `unit` | **NÃO** | só `version_id` |
| 6 | `getMonthlyRevenue` → `getReembolsos` | `queries.ts:140` | `reembolso` | **NÃO** | só `version_id` |
| 7 | `getMonthlyRevenue` | `queries.ts:1163–1168` | `conta_receber` | **NÃO** | `project_id` + `cancelado` |
| 8 | `getDespesas` | `queries.ts:242` | `despesa` | **NÃO** | só `version_id` |
| 9 | `getParcelasByVersion` | `queries.ts:1012` | `despesa_parcela` | **NÃO** | só `despesas.versionId` (via join) |
| 10 | `getPermutas` | `queries.ts:147` | `permuta` | **NÃO** | só `version_id` |
| 11 | `getExpenseRows` (budget) | `queries.ts:972–977` | `budget_line` | **NÃO** | `version_id` + `kind` |
| 12 | `getCash` | `queries.ts:1065` | `cash_entry` | **NÃO** | só `version_id` |
| 13 | `getRestituicoesPendentesByVersion` | `restituicoes.ts:909` | `despesa_terceiro` | **NÃO** | só `despesas.versionId` (via join) |

**2 de 13 têm `tenant_id` no WHERE; 11 não têm.** Nas 11, o isolamento é
indireto — por `version_id` (9 casos) ou `project_id` (2 casos), UUIDs que
vêm de um contexto já filtrado por tenant. Como no Dashboard, **não há caso em
que o tenant seja aplicado só em JavaScript depois**.

O que **é** filtrado em memória: o mês (`monthInRange`, `page.tsx:167`), o
período dos totais (`yearMonths.reduce`) e as três exclusões do `flowMaps`
(cancelado, parcela existente, pago por terceiro).

### (o) `BETWEEN` e `ORDER BY` sobre coluna `text` de data


**`BETWEEN` não existe** — nem `gte`/`lte` do Drizzle, em nenhuma das 13
consultas. Todo recorte de período é JavaScript, via `monthInRange`
(`page.tsx:167`).

**`ORDER BY` sobre coluna `text` de data: existem três, todos no caminho desta
tela.**

| Linha | Expressão | Coluna | Tipo | Formato |
|---|---|---|---|---|
| `queries.ts:243` | `asc(despesas.competencia)` | `competencia` | `text` | `"MM/YYYY"` |
| `queries.ts:1066` | `asc(cashEntries.data)` | `data` | `text` | `"MM/DD/YYYY"` |
| `restituicoes.ts:910` | `asc(despesaTerceiros.dataPrevistaRestituicao)` | `data_prevista_restituicao` | `text` | `"MM/DD/YYYY"` |

Diferente do Dashboard — onde nenhum `ORDER BY` de data estava no caminho —
aqui os três estão. Registro o que a ordenação lexicográfica faz: `"01/2026"`
vem antes de `"12/2025"`, e `"01/15/2026"` antes de `"12/31/2025"`.

**Efeito no resultado: nenhum.** Os três consumidores agregam por chave de
mês em `Record<string, number>` e depois ordenam em JavaScript por
`sortMonthKey` (`page.tsx:138`), que faz o parse correto. A ordem do SQL é
descartada antes de virar número.

### `src/lib/queries.ts` · linhas 1452–1457

`sortMonthKey` — a ordenação que de fato vale.

```ts
/** Ordena chaves "MM/YYYY" cronologicamente. */
export function sortMonthKey(a: string, b: string): number {
  const [ma, ya] = a.split("/").map(Number);
  const [mb, yb] = b.split("/").map(Number);
  return ya - yb || ma - mb;
}
```

### (p) Exportação ou impressão?


**Não existe nenhuma das duas.**

Busca no `page.tsx` por `PrintButton`, `print`, `csv` e `xlsx`: zero
ocorrências. As únicas linhas com `export` são as declarações de módulo
(`export const dynamic`, `export default async function FluxoCaixaPage`,
`function Kpi`). Não há rota de API, action de exportação nem botão.

A pergunta seguinte — *"de onde ela tira os números?"* — fica sem objeto. O
único caminho para os números da tela é `flowMaps` + `flowMapsRealizado`,
chamados dentro do próprio `page.tsx`.

Para referência: o `PrintButton` existe no repositório e tem **um único uso em
todo o app** — `/medicao` (`medicao/page.tsx:80`). A lib `xlsx` aparece só no
importador de extrato (`import-extrato.tsx:5`), e é de leitura.
