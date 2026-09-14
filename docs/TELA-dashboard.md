# TELA-dashboard — código na íntegra

Coleta do código da tela **Dashboard** (`/dashboard`), em `main`
(commit `45f4ce3`). Sem resumo, sem análise.

**Árvore de dependências própria (recursiva):**

```
dashboard/page.tsx
├── components/app/page-header.tsx
├── components/app/project-picker.tsx
├── components/app/date-range-filter.tsx
├── components/app/version-multiselect.tsx
└── components/app/indicadores-obra.tsx
    ├── KPI                  — cartão genérico (auxiliar)
    ├── IndicadoresObraPanel — aquisição, BDI, evolução
    └── StatusProjetoPanel   — status atual, margem e produtividade

Nenhum importa outro componente próprio. `access-denied.tsx` NÃO é importado
(ver seção 8). As demais importações são primitivas de UI (card, badge),
`utils` e `calc`.

queries chamadas:  getMonthlyRevenue · getUnits · getIndicadoresObra
                   getIndicadoresObraConsolidado · getStatusProjeto
                   getVersionsDoProjeto · getContasPagar · getReceivables
consulta inline:   cash_entry por versão (page.tsx:50–53)
actions:           NENHUMA — a tela é somente leitura
```

---

## 1. Página

### `src/app/(app)/dashboard/page.tsx`

```tsx
import { eq } from "drizzle-orm";
import { db, schema } from "@/lib/db";
import { getActiveContext, type Version } from "@/lib/context";
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

export const dynamic = "force-dynamic";


interface Summary {
  version: Version;
  vgv: number;
  realizado: number;
  receitaProj: number;
  aReceber: number;
  /** contas a pagar não pagas no período (só faz sentido na versão Atual). */
  aPagar: number;
  monthly: Record<string, number>;
  /** entradas realizadas (fechamentos de caixa) por mês "MM/YYYY". */
  realizadoMonthly: Record<string, number>;
}

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


export default async function DashboardPage({
  searchParams,
}: {
  searchParams: Promise<{ vs?: string; de?: string; ate?: string; proj?: string }>;
}) {
  const ctx = await getActiveContext();
  if (!ctx) return null;

  const sp = await searchParams;
  const de = sp.de ?? "";
  const ate = sp.ate ?? "";
  // Projeto vem do seletor (?proj=), não do "projeto ativo" da sessão — assim o
  // filtro do topo realmente troca a obra exibida. "all" consolida a empresa.
  const isAll = sp.proj === "all";
  const project =
    ctx.projects.find((p) => p.id === sp.proj) ?? ctx.project ?? ctx.projects[0];

  // As versões exibidas são as DO PROJETO selecionado (ctx.versions são as do
  // projeto ativo da sessão, que pode ser outro).
  const versoesProjeto = await getVersionsDoProjeto(ctx.tenant.id, project.id);
  const versoes = versoesProjeto.length > 0 ? versoesProjeto : ctx.versions;

  const wanted = (sp.vs ?? "").split(",").filter(Boolean);
  const validWanted = versoes.filter((v) => wanted.includes(v.id)).slice(0, 3);
  const selected = validWanted.length > 0 ? validWanted : versoes.slice(0, 3);

  const summaries = await Promise.all(
    selected.map((v) => versionSummary(project.id, v, de, ate)),
  );

  const indicadores = isAll
    ? await getIndicadoresObraConsolidado(
        ctx.tenant.id,
        ctx.projects.map((p) => p.id),
      )
    : await getIndicadoresObra(ctx.tenant.id, project.id);
  const statusProjeto = await getStatusProjeto(
    ctx.tenant.id,
    isAll ? ctx.projects.map((p) => p.id) : [project.id],
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
      (isAll || r.projectId === project.id) &&
      (!hasRangeDash || dateInRange(r.dia, de, ate)),
  );
  const totalReceb = realReceb.reduce((a, r) => a + r.valor, 0);

  // Contas a pagar (despesas não pagas) do projeto, com vencimento no período.
  const contasPagarProj = (await getContasPagar(ctx.tenant.id)).filter(
    (c) =>
      (isAll || c.projectId === project.id) &&
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
          isAll
            ? `Todos os projetos · ${ctx.tenant.name}`
            : `${project.name} · ${ctx.tenant.name}`
        }
        title="Dashboard"
        subtitle={
          isAll
            ? "Visão geral da empresa — matriz e filiais consolidados"
            : "Visão geral do projeto — independente da versão ativa"
        }
        actions={
          <div className="flex flex-wrap items-end gap-3">
            <ProjectPicker
              projects={ctx.projects.map((p) => ({ id: p.id, label: p.name }))}
              selected={isAll ? "all" : project.id}
              allOption
            />
            <DateRangeFilter de={de} ate={ate} />
            <VersionMultiSelect
              versions={versoes.map((v) => ({ id: v.id, label: v.label, color: v.color }))}
              selected={selected.map((v) => v.id)}
            />
          </div>
        }
      />

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

### `src/components/app/indicadores-obra.tsx`

Arquivo único com `KPI`, `IndicadoresObraPanel` e `StatusProjetoPanel`.

```tsx
import type { IndicadoresObra, StatusProjeto } from "@/lib/queries";
import { brl0 } from "@/lib/utils";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";

const pct = (v: number) =>
  `${v.toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}%`;

/** Um indicador. `hint` explica a origem do número quando ela não é óbvia. */
function KPI({
  label,
  value,
  hint,
  tone = "normal",
}: {
  label: string;
  value: string;
  hint?: string;
  tone?: "normal" | "good" | "warn" | "muted";
}) {
  const cor =
    tone === "good"
      ? "text-[var(--color-success)]"
      : tone === "warn"
        ? "text-[var(--color-warning)]"
        : tone === "muted"
          ? "text-[var(--color-ink4)]"
          : "text-[var(--color-ink)]";
  return (
    <Card>
      <CardContent className="p-4">
        <p className="font-[family-name:var(--font-mono)] text-[10px] uppercase tracking-wide text-[var(--color-ink3)]">
          {label}
        </p>
        <p className={`mt-1 font-[family-name:var(--font-mono)] text-[18px] font-semibold ${cor}`}>
          {value}
        </p>
        {hint && <p className="mt-0.5 text-[11px] text-[var(--color-ink4)]">{hint}</p>}
      </CardContent>
    </Card>
  );
}

/**
 * Painel de indicadores físico-financeiros da obra: aquisição/financiamento,
 * custo com BDI, evolução física e liberação do financiamento.
 *
 * Os números saem do cadastro do projeto (CUB, metragem, valores financiados,
 * %BDI) e das medições por serviço. Quando esses dados ainda não existem, o
 * painel diz o que falta em vez de exibir valor inventado.
 */
export function IndicadoresObraPanel({ ind }: { ind: IndicadoresObra }) {
  return (
    <div className="mt-6 space-y-4">
      {/* Aquisição e financiamento */}
      <div>
        <h2 className="mb-2 text-sm font-semibold text-[var(--color-ink)]">
          Aquisição e financiamento
        </h2>
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <KPI label="Financiado — construção" value={brl0(ind.financiamentoConstrucao)} />
          <KPI label="Financiado — terreno" value={brl0(ind.financiamentoTerreno)} />
          <KPI label="Total da aquisição" value={brl0(ind.totalAquisicao)} />
          <KPI
            label="Saldo de financiamento"
            value={brl0(ind.saldoFinanciamento)}
            hint="ainda não liberado"
            tone={ind.saldoFinanciamento > 0 ? "normal" : "muted"}
          />
        </div>
      </div>

      {/* Custo da obra e BDI */}
      <div>
        <h2 className="mb-2 text-sm font-semibold text-[var(--color-ink)]">
          Custo da obra e BDI
          {ind.tipoExecutor && (
            <span className="ml-2 font-normal text-[var(--color-ink3)]">
              · executor: {ind.tipoExecutor}
            </span>
          )}
        </h2>
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <KPI
            label="Custo total dos serviços"
            value={brl0(ind.custoTotalServicos)}
            hint={`${ind.qtdServicos} serviço(s)`}
          />
          <KPI
            label="BDI"
            value={ind.pctBdi > 0 ? pct(ind.pctBdi) : "—"}
            hint={ind.pctBdi > 0 ? undefined : "informe no cadastro do projeto"}
            tone={ind.pctBdi > 0 ? "normal" : "muted"}
          />
          <KPI label="Valor do BDI" value={brl0(ind.valorBdi)} />
          <KPI label="Custo total com BDI" value={brl0(ind.custoTotalComBdi)} />
        </div>
      </div>

      {/* Evolução física e liberação */}
      <div>
        <h2 className="mb-2 flex items-center gap-2 text-sm font-semibold text-[var(--color-ink)]">
          Evolução da obra e liberação
          {!ind.temMedicao && (
            <Badge tone="warning">sem medição lançada</Badge>
          )}
        </h2>
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <KPI
            label="Evolução física acumulada"
            value={ind.temMedicao ? pct(ind.evolucaoAcumulada) : "—"}
            tone={ind.temMedicao ? "good" : "muted"}
          />
          <KPI
            label="Evolução do mês"
            value={ind.temMedicao ? pct(ind.evolucaoMes) : "—"}
            tone={ind.temMedicao ? "normal" : "muted"}
          />
          <KPI
            label="Liberação do mês"
            value={ind.temMedicao ? brl0(ind.liberacaoMes) : "—"}
            tone={ind.temMedicao ? "normal" : "muted"}
          />
          <KPI
            label="Liberação acumulada"
            value={brl0(ind.liberacaoAcumulada)}
            hint={`${pct(ind.pctRecebido * 100)} do financiado`}
          />
          <KPI
            label="Custo estimado do mês"
            value={ind.temMedicao ? brl0(ind.custoEstimadoMes) : "—"}
            hint="CUB × metragem × evolução"
            tone={ind.temMedicao ? "normal" : "muted"}
          />
          <KPI
            label="Geração de caixa do mês"
            value={ind.temMedicao ? brl0(ind.geracaoCaixaMes) : "—"}
            hint="liberação − custo estimado"
            tone={
              !ind.temMedicao ? "muted" : ind.geracaoCaixaMes >= 0 ? "good" : "warn"
            }
          />
          <KPI
            label="Custo referencial"
            value={brl0(ind.custoReferencial)}
            hint={
              ind.cub > 0
                ? `CUB ${brl0(ind.cub)} × ${ind.metragem} m²`
                : "informe CUB e metragem"
            }
            tone={ind.cub > 0 ? "normal" : "muted"}
          />
          <KPI
            label="Serviços fora dos limites"
            value={String(ind.servicosForaDosLimites)}
            hint="incidência fora da faixa aceitável"
            tone={ind.servicosForaDosLimites > 0 ? "warn" : "good"}
          />
        </div>
      </div>
    </div>
  );
}

/**
 * Status atual do projeto: quanto já entrou frente ao previsto no cadastro,
 * quanto já foi gasto frente ao planejado no Budget, margem de contribuição e
 * indicadores por metro quadrado.
 *
 * Definições de negócio confirmadas com o cliente:
 *   MC  = Receita − Custo Variável − Despesa Variável
 *   %MC = MC ÷ Receita Total do Projeto (valor global do cadastro)
 */
export function StatusProjetoPanel({ st }: { st: StatusProjeto }) {
  return (
    <div className="mt-6 space-y-4">
      <div>
        <h2 className="mb-2 text-sm font-semibold text-[var(--color-ink)]">
          Status atual
        </h2>
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <KPI
            label="Recebido"
            value={brl0(st.recebido)}
            hint={`de ${brl0(st.receitaPrevista)} previstos`}
          />
          <KPI
            label="% recebido"
            value={st.receitaPrevista > 0 ? pct(st.pctRecebido * 100) : "—"}
            hint="sobre a receita do cadastro"
            tone={st.receitaPrevista > 0 ? "good" : "muted"}
          />
          <KPI
            label="Executado"
            value={brl0(st.executado)}
            hint={`de ${brl0(st.despesaPrevista)} no Budget`}
          />
          <KPI
            label="% executado"
            value={st.despesaPrevista > 0 ? pct(st.pctExecutado * 100) : "—"}
            hint="sobre a despesa planejada"
            tone={
              st.despesaPrevista === 0
                ? "muted"
                : st.pctExecutado > 1
                  ? "warn"
                  : "normal"
            }
          />
        </div>
      </div>

      <div>
        <h2 className="mb-2 text-sm font-semibold text-[var(--color-ink)]">
          Margem e produtividade
        </h2>
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <KPI
            label="Margem de contribuição"
            value={brl0(st.margemContribuicao)}
            hint="receita − custo var. − despesa var."
            tone={st.margemContribuicao >= 0 ? "good" : "warn"}
          />
          <KPI
            label="% margem de contribuição"
            value={st.receitaPrevista > 0 ? pct(st.pctMargem * 100) : "—"}
            hint="sobre a receita total do projeto"
            tone={
              st.receitaPrevista === 0
                ? "muted"
                : st.pctMargem >= 0
                  ? "good"
                  : "warn"
            }
          />
          <KPI
            label="Custo por m²"
            value={st.metragem > 0 ? brl0(st.custoPorM2) : "—"}
            hint={st.metragem > 0 ? `${st.metragem} m²` : "informe a metragem"}
            tone={st.metragem > 0 ? "normal" : "muted"}
          />
          <KPI
            label="Receita por m²"
            value={st.metragem > 0 ? brl0(st.receitaPorM2) : "—"}
            hint={st.metragem > 0 ? `${st.metragem} m²` : "informe a metragem"}
            tone={st.metragem > 0 ? "normal" : "muted"}
          />
        </div>
      </div>
    </div>
  );
}
```

---

## 3. Funções de `queries.ts` chamadas


Oito. Além delas, a página faz **uma consulta inline** a `cash_entry`
(`page.tsx:50–53`), dentro de `versionSummary`.

### `src/lib/queries.ts` · linhas 1885–1980

`getIndicadoresObra` — pedido explicitamente, na íntegra.

```ts
export async function getIndicadoresObra(
  tenantId: string,
  projectId: string,
): Promise<IndicadoresObra> {
  const [proj] = await db
    .select()
    .from(schema.projects)
    .where(and(eq(schema.projects.id, projectId), eq(schema.projects.tenantId, tenantId)))
    .limit(1);

  const servicoRows = proj
    ? await db
        .select()
        .from(schema.servicos)
        .where(eq(schema.servicos.projectId, projectId))
        .orderBy(asc(schema.servicos.ordem))
    : [];
  const servicoIds = servicoRows.map((s) => s.id);
  const medRows =
    servicoIds.length > 0
      ? await db
          .select()
          .from(schema.medicaoServicos)
          .where(eq(schema.medicaoServicos.tenantId, tenantId))
      : [];

  const num = (v: unknown) => Number(v) || 0;
  const financiamentoConstrucao = num(proj?.financiamentoConstrucao);
  const financiamentoTerreno = num(proj?.financiamentoTerreno);
  const cub = num(proj?.cub);
  const metragem = num(proj?.metragem);
  const pctBdi = num(proj?.pctBdi);
  const pctTaxa = num(proj?.pctTaxaLiberacao);
  const parcelaReferencia = num(proj?.parcelaReferencia);

  const servicos = servicoRows.map((s) => ({
    id: s.id,
    nome: s.nome,
    custoProposto: num(s.custoProposto),
    limiteMin: s.limiteMin == null ? null : num(s.limiteMin),
    limiteMax: s.limiteMax == null ? null : num(s.limiteMax),
  }));

  const incid = calcIncidencias(servicos);
  const bdi = calcBdi(servicos, pctBdi);
  const custoRef = custoReferencial(cub, metragem);

  const medicoes = medRows
    .filter((m) => servicoIds.includes(m.servicoId))
    .map((m) => ({
      servicoId: m.servicoId,
      competencia: m.competencia,
      pctExecutadoAcum: num(m.pctExecutadoAcum),
    }));
  const evolucao = calcEvolucao(servicos, medicoes);
  const provis = calcProvisionamento(evolucao, {
    financiamentoConstrucao,
    financiamentoTerreno,
    custoReferencial: custoRef,
    parcelaReferencia,
    pctTaxa,
  });
  const ultimo = provis[provis.length - 1];
  const ultimaEvol = evolucao[evolucao.length - 1];

  return {
    financiamentoConstrucao,
    financiamentoTerreno,
    totalAquisicao: financiamentoConstrucao + financiamentoTerreno,
    cub,
    metragem,
    custoReferencial: custoRef,
    parcelaReferencia,
    pctBdi,
    pctTaxa,
    tipoExecutor: proj?.tipoExecutor ?? null,
    custoTotalServicos: bdi.custoTotalServicos,
    valorBdi: bdi.valorBdi,
    custoTotalComBdi: bdi.custoTotalComBdi,
    servicosForaDosLimites: incid.filter(
      (s) => s.status === "Abaixo do mínimo" || s.status === "Acima do máximo",
    ).length,
    qtdServicos: servicos.length,
    evolucaoAcumulada: ultimaEvol?.acumulado ?? 0,
    evolucaoMes: ultimaEvol?.variacao ?? 0,
    liberacaoMes: ultimo?.liberacao ?? 0,
    liberacaoAcumulada: ultimo?.liberacaoAcumulada ?? financiamentoTerreno,
    saldoFinanciamento:
      ultimo?.saldoFinanciamento ?? financiamentoConstrucao,
    custoEstimadoMes: ultimo?.custoEstimado ?? 0,
    geracaoCaixaMes: ultimo?.caixa ?? 0,
    pctRecebido: ultimo?.pctRecebido ?? 0,
    temMedicao: evolucao.length > 0,
    temParametros: financiamentoConstrucao > 0 || cub > 0 || pctBdi > 0,
  };
}
```

### `src/lib/queries.ts` · linhas 1992–2046

`getIndicadoresObraConsolidado` — pedido explicitamente, na íntegra.

```ts
export async function getIndicadoresObraConsolidado(
  tenantId: string,
  projectIds: string[],
): Promise<IndicadoresObra> {
  const todos = await Promise.all(
    projectIds.map((id) => getIndicadoresObra(tenantId, id)),
  );
  const soma = (f: (i: IndicadoresObra) => number) =>
    todos.reduce((a, i) => a + f(i), 0);

  const custoTotalServicos = soma((i) => i.custoTotalServicos);
  const valorBdi = soma((i) => i.valorBdi);
  const totalAquisicao = soma((i) => i.totalAquisicao);
  const liberacaoAcumulada = soma((i) => i.liberacaoAcumulada);

  // Média ponderada pelo custo dos serviços; sem base, cai para média simples.
  const ponderada = (f: (i: IndicadoresObra) => number) => {
    const base = custoTotalServicos;
    if (base > 0) {
      return todos.reduce((a, i) => a + f(i) * i.custoTotalServicos, 0) / base;
    }
    const comDados = todos.filter((i) => i.temMedicao);
    if (comDados.length === 0) return 0;
    return comDados.reduce((a, i) => a + f(i), 0) / comDados.length;
  };

  return {
    financiamentoConstrucao: soma((i) => i.financiamentoConstrucao),
    financiamentoTerreno: soma((i) => i.financiamentoTerreno),
    totalAquisicao,
    // CUB e metragem não se somam entre obras — não têm leitura consolidada.
    cub: 0,
    metragem: soma((i) => i.metragem),
    custoReferencial: soma((i) => i.custoReferencial),
    parcelaReferencia: soma((i) => i.parcelaReferencia),
    pctBdi: custoTotalServicos > 0 ? (valorBdi / custoTotalServicos) * 100 : 0,
    pctTaxa: 0,
    tipoExecutor: null,
    custoTotalServicos,
    valorBdi,
    custoTotalComBdi: soma((i) => i.custoTotalComBdi),
    servicosForaDosLimites: soma((i) => i.servicosForaDosLimites),
    qtdServicos: soma((i) => i.qtdServicos),
    evolucaoAcumulada: ponderada((i) => i.evolucaoAcumulada),
    evolucaoMes: ponderada((i) => i.evolucaoMes),
    liberacaoMes: soma((i) => i.liberacaoMes),
    liberacaoAcumulada,
    saldoFinanciamento: soma((i) => i.saldoFinanciamento),
    custoEstimadoMes: soma((i) => i.custoEstimadoMes),
    geracaoCaixaMes: soma((i) => i.geracaoCaixaMes),
    pctRecebido: totalAquisicao > 0 ? liberacaoAcumulada / totalAquisicao : 0,
    temMedicao: todos.some((i) => i.temMedicao),
    temParametros: todos.some((i) => i.temParametros),
  };
}
```

### `src/lib/queries.ts` · linhas 2085–2194

`getStatusProjeto`.

```ts
export async function getStatusProjeto(
  tenantId: string,
  projectIds: string[],
): Promise<StatusProjeto> {
  if (projectIds.length === 0) {
    return {
      receitaPrevista: 0, recebido: 0, pctRecebido: 0,
      despesaPrevista: 0, executado: 0, pctExecutado: 0,
      margemContribuicao: 0, pctMargem: 0,
      receitaAtual: 0, custoVariavel: 0, despesaVariavel: 0,
      metragem: 0, custoPorM2: 0, receitaPorM2: 0,
    };
  }

  const [projs, versoes] = await Promise.all([
    db.select().from(schema.projects).where(eq(schema.projects.tenantId, tenantId)),
    db.select().from(schema.versions).where(eq(schema.versions.tenantId, tenantId)),
  ]);
  const doProjeto = <T extends { projectId: string }>(xs: T[]) =>
    xs.filter((x) => projectIds.includes(x.projectId));

  const num = (v: unknown) => Number(v) || 0;

  // Receita prevista = valor global de venda informado no cadastro do projeto.
  const receitaPrevista = projs
    .filter((p) => projectIds.includes(p.id))
    .reduce((a, p) => a + num(p.valorConstrucao) + num(p.valorTerreno), 0);

  const versoesProj = doProjeto(versoes);
  const idsAtual = versoesProj.filter((v) => v.kind === "atual").map((v) => v.id);
  const idsBudget = versoesProj.filter((v) => v.kind === "budget").map((v) => v.id);
  const todosIds = versoesProj.map((v) => v.id);

  const [cashRows, despRows, budgetRows] = await Promise.all([
    todosIds.length
      ? db.select({ valor: schema.cashEntries.valor, versionId: schema.cashEntries.versionId })
          .from(schema.cashEntries)
          .where(eq(schema.cashEntries.tenantId, tenantId))
      : Promise.resolve([]),
    db.select({
        valor: schema.despesas.valor,
        categoriaDre: schema.despesas.categoriaDre,
        cancelado: schema.despesas.cancelado,
        versionId: schema.despesas.versionId,
      })
      .from(schema.despesas)
      .where(eq(schema.despesas.tenantId, tenantId)),
    db.select({ valor: schema.budgetLines.valor, versionId: schema.budgetLines.versionId })
      .from(schema.budgetLines)
      .where(and(eq(schema.budgetLines.tenantId, tenantId), eq(schema.budgetLines.kind, "despesa")))
      .catch(() => []),
  ]);

  // Recebido = entradas de caixa das versões do projeto.
  const recebido = cashRows
    .filter((c) => todosIds.includes(c.versionId) && num(c.valor) > 0)
    .reduce((a, c) => a + num(c.valor), 0);

  // Despesa prevista = planejamento da versão Budget.
  const despesaPrevista = budgetRows
    .filter((b) => idsBudget.includes(b.versionId))
    .reduce((a, b) => a + num(b.valor), 0);

  // Executado = despesas lançadas na versão Atual, exceto canceladas.
  const daAtual = despRows.filter(
    (d) => idsAtual.includes(d.versionId) && !d.cancelado,
  );
  const executado = daAtual.reduce((a, d) => a + num(d.valor), 0);
  const porCat = (cat: string) =>
    daAtual.filter((d) => d.categoriaDre === cat).reduce((a, d) => a + num(d.valor), 0);
  const custoVariavel = porCat("Custo Variável");
  const despesaVariavel = porCat("Despesa Variável");

  // Receita realizada da versão Atual (mesma fonte da DRE).
  let receitaAtual = 0;
  for (const pid of projectIds) {
    const vid = versoesProj.find((v) => v.projectId === pid && v.kind === "atual")?.id;
    if (!vid) continue;
    const mensal = await getMonthlyRevenue(vid, pid);
    receitaAtual += Object.values(mensal).reduce((a, v) => a + v, 0);
  }

  // Definição de negócio confirmada pelo cliente:
  // Margem de Contribuição = Receita − Custo Variável − Despesa Variável.
  const margemContribuicao = receitaAtual - custoVariavel - despesaVariavel;
  const razao = (n: number, d: number) => (d > 0 ? n / d : 0);

  // Metragem total dos projetos selecionados (cadastro do projeto).
  const metragem = projs
    .filter((p) => projectIds.includes(p.id))
    .reduce((a, p) => a + num(p.metragem), 0);

  return {
    receitaPrevista,
    recebido,
    pctRecebido: razao(recebido, receitaPrevista),
    despesaPrevista,
    executado,
    pctExecutado: razao(executado, despesaPrevista),
    margemContribuicao,
    // %MC = MC ÷ Receita Total do Projeto (cadastro).
    pctMargem: razao(margemContribuicao, receitaPrevista),
    receitaAtual,
    custoVariavel,
    despesaVariavel,
    metragem,
    custoPorM2: razao(executado, metragem),
    receitaPorM2: razao(receitaAtual, metragem),
  };
}
```

### `src/lib/queries.ts` · linhas 1113–1176

`getMonthlyRevenue`.

```ts
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

### `src/lib/queries.ts` · linhas 85–91

`getUnits`.

```ts
export async function getUnits(versionId: string): Promise<UnitRow[]> {
  return db
    .select()
    .from(schema.units)
    .where(eq(schema.units.versionId, versionId))
    .orderBy(asc(schema.units.code));
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

### `src/lib/queries.ts` · linhas 353–392

`getContasPagar`.

```ts
export async function getContasPagar(tenantId: string): Promise<ContaPagarRow[]> {
  const rows = await db
    .select({
      d: schema.despesas,
      fornecedorNome: schema.stakeholders.nome,
      projectId: schema.projects.id,
      projectName: schema.projects.name,
      clienteId: schema.projects.clienteId,
      clienteNome: schema.clientes.nomeCompleto,
    })
    .from(schema.despesas)
    .innerJoin(schema.versions, eq(schema.despesas.versionId, schema.versions.id))
    .innerJoin(schema.projects, eq(schema.versions.projectId, schema.projects.id))
    .leftJoin(schema.stakeholders, eq(schema.despesas.fornecedorId, schema.stakeholders.id))
    .leftJoin(schema.clientes, eq(schema.projects.clienteId, schema.clientes.id))
    .where(
      and(
        eq(schema.despesas.tenantId, tenantId),
        eq(schema.despesas.cancelado, false),
      ),
    );
  return rows.map((r) => ({
    id: r.d.id,
    numDoc: r.d.numDoc,
    fornecedorNome: r.fornecedorNome,
    descricao: r.d.obs ?? r.d.numDoc,
    categoriaDre: r.d.categoriaDre,
    contaCef: r.d.contaCef,
    valor: Number(r.d.valor),
    vencimento: r.d.vencimento,
    competencia: r.d.competencia,
    dataPagamento: r.d.dataCaixa,
    formaPagamento: r.d.formaPagamento,
    status: r.d.status,
    projectId: r.projectId,
    projectName: r.projectName,
    clienteId: r.clienteId,
    clienteNome: r.clienteNome,
  }));
}
```

### `src/lib/queries.ts` · linhas 411–450

`getReceivables`.

```ts
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


E os módulos de cálculo que `getIndicadoresObra` usa:

### `src/lib/calc/medicao-bdi.ts`

`src/lib/calc/medicao-bdi.ts` inteiro — incidências, BDI, evolução física, provisionamento e custo referencial.

```ts
/**
 * Medição de obra, BDI e provisionamento de liberação.
 *
 * Todas as fórmulas foram derivadas da planilha de referência do cliente e
 * conferidas contra os números dela — ver docs/BDI-PROVISIONAMENTO.md, que
 * traz a validação número a número.
 *
 * Funções PURAS: nenhum valor é fixado em código. Percentuais de BDI, taxas,
 * CUB, metragem e valores financiados vêm sempre do cadastro do projeto.
 */

export interface ServicoOrcado {
  id: string;
  nome: string;
  /** custo proposto do serviço (R$). */
  custoProposto: number;
  /** faixa aceitável de incidência (%), opcional. */
  limiteMin?: number | null;
  limiteMax?: number | null;
}

export type StatusIncidencia = "OK" | "Abaixo do mínimo" | "Acima do máximo" | "—";

export interface ServicoCalculado extends ServicoOrcado {
  /** custo do serviço ÷ custo total dos serviços × 100. */
  incidencia: number;
  status: StatusIncidencia;
}

/** Custo total dos serviços do projeto. */
export function custoTotalServicos(servicos: ServicoOrcado[]): number {
  return servicos.reduce((a, s) => a + (Number(s.custoProposto) || 0), 0);
}

/**
 * Incidência de cada serviço no orçamento e status frente aos limites.
 * `status` só é avaliado quando há limites cadastrados.
 */
export function calcIncidencias(servicos: ServicoOrcado[]): ServicoCalculado[] {
  const total = custoTotalServicos(servicos);
  return servicos.map((s) => {
    const incidencia = total > 0 ? ((Number(s.custoProposto) || 0) / total) * 100 : 0;
    const min = s.limiteMin == null ? null : Number(s.limiteMin);
    const max = s.limiteMax == null ? null : Number(s.limiteMax);
    let status: StatusIncidencia = "—";
    if (min != null || max != null) {
      if (min != null && incidencia < min) status = "Abaixo do mínimo";
      else if (max != null && incidencia > max) status = "Acima do máximo";
      else status = "OK";
    }
    return { ...s, incidencia, status };
  });
}

export interface BdiResultado {
  custoTotalServicos: number;
  pctBdi: number;
  valorBdi: number;
  custoTotalComBdi: number;
}

/**
 * BDI sobre o custo total dos serviços.
 *
 *   valor do BDI      = custo total dos serviços × %BDI
 *   custo total c/BDI = custo total dos serviços + valor do BDI
 *
 * O `pctBdi` é sempre um parâmetro do projeto — a alíquota varia conforme o
 * tipo de executor da obra e NÃO é presumida aqui.
 */
export function calcBdi(servicos: ServicoOrcado[], pctBdi: number): BdiResultado {
  const custo = custoTotalServicos(servicos);
  const pct = Number(pctBdi) || 0;
  const valorBdi = custo * (pct / 100);
  return {
    custoTotalServicos: custo,
    pctBdi: pct,
    valorBdi,
    custoTotalComBdi: custo + valorBdi,
  };
}

/** Ordena competências "MM/YYYY" cronologicamente. */
export function sortCompetencias(ms: string[]): string[] {
  return [...ms].sort((a, b) => {
    const [ma, ya] = a.split("/");
    const [mb, yb] = b.split("/");
    return (
      Number(ya) - Number(yb) || Number(ma) - Number(mb)
    );
  });
}

export interface MedicaoServicoInput {
  servicoId: string;
  competencia: string;
  /** % executado ACUMULADO do serviço ao fim da competência (0..100). */
  pctExecutadoAcum: number;
}

export interface EvolucaoMes {
  competencia: string;
  /** execução acumulada da OBRA (%) ao fim do mês. */
  acumulado: number;
  /** variação do mês = acumulado atual − acumulado anterior. */
  variacao: number;
}

/**
 * Evolução física da obra mês a mês.
 *
 *   execução acumulada do serviço = incidência × %executado do serviço
 *   acumulado da obra             = Σ execuções acumuladas dos serviços
 *   variação mensal               = acumulado atual − acumulado anterior
 *
 * O %executado de um serviço é "carregado" para os meses seguintes enquanto não
 * houver nova medição — o acumulado nunca regride sozinho por falta de
 * lançamento no mês.
 */
export function calcEvolucao(
  servicos: ServicoOrcado[],
  medicoes: MedicaoServicoInput[],
): EvolucaoMes[] {
  const incid = new Map(calcIncidencias(servicos).map((s) => [s.id, s.incidencia]));
  const competencias = sortCompetencias([
    ...new Set(medicoes.map((m) => m.competencia)),
  ]);

  // Último % executado conhecido de cada serviço (carregado mês a mês).
  const ultimoPct = new Map<string, number>();
  const out: EvolucaoMes[] = [];
  let anterior = 0;

  for (const comp of competencias) {
    for (const m of medicoes.filter((x) => x.competencia === comp)) {
      ultimoPct.set(m.servicoId, Number(m.pctExecutadoAcum) || 0);
    }
    let acumulado = 0;
    for (const [servicoId, pct] of ultimoPct) {
      acumulado += ((incid.get(servicoId) ?? 0) * pct) / 100;
    }
    out.push({ competencia: comp, acumulado, variacao: acumulado - anterior });
    anterior = acumulado;
  }
  return out;
}

export interface ParamsProvisionamento {
  /** valor financiado destinado à CONSTRUÇÃO. */
  financiamentoConstrucao: number;
  /** valor financiado do TERRENO (entra no acumulado, sem custo de obra). */
  financiamentoTerreno: number;
  /** custo referencial da obra = CUB × metragem. */
  custoReferencial: number;
  /** parcela de referência do caixa (base do E.V.O). */
  parcelaReferencia: number;
  /** % de taxas incidentes sobre a liberação do mês (ex.: 1,5). */
  pctTaxa: number;
}

export interface LinhaProvisionamento {
  competencia: string;
  /** variação física do mês (%). */
  obraMes: number;
  liberacao: number;
  custoEstimado: number;
  /** geração de caixa/margem = liberação − custo estimado. */
  caixa: number;
  liberacaoAcumulada: number;
  /** liberação acumulada ÷ total financiado (0..1). */
  pctRecebido: number;
  evo: number;
  taxa: number;
  soma: number;
  /** saldo de financiamento ainda disponível. */
  saldoFinanciamento: number;
}

/**
 * Quadro mensal de liberação/provisionamento (docs/BDI-PROVISIONAMENTO.md §5):
 *
 *   liberação do mês  = variação mensal × financiamento da construção
 *   custo estimado    = variação mensal × custo referencial (CUB × metragem)
 *   geração de caixa  = liberação − custo estimado
 *   % recebido        = liberação acumulada ÷ (financ. construção + terreno)
 *   E.V.O             = parcela de referência × % recebido
 *   taxa              = %taxa × liberação do mês
 *
 * A liberação do TERRENO entra no acumulado inicial (não tem variação de obra
 * nem custo associados).
 */
export function calcProvisionamento(
  evolucao: EvolucaoMes[],
  p: ParamsProvisionamento,
): LinhaProvisionamento[] {
  const totalFinanciado =
    (Number(p.financiamentoConstrucao) || 0) + (Number(p.financiamentoTerreno) || 0);
  // O terreno já liberado compõe o acumulado desde o início.
  let acumulado = Number(p.financiamentoTerreno) || 0;

  return evolucao.map((e) => {
    const fracao = e.variacao / 100;
    const liberacao = fracao * (Number(p.financiamentoConstrucao) || 0);
    const custoEstimado = fracao * (Number(p.custoReferencial) || 0);
    acumulado += liberacao;
    const pctRecebido = totalFinanciado > 0 ? acumulado / totalFinanciado : 0;
    const evo = (Number(p.parcelaReferencia) || 0) * pctRecebido;
    const taxa = liberacao * ((Number(p.pctTaxa) || 0) / 100);
    return {
      competencia: e.competencia,
      obraMes: e.variacao,
      liberacao,
      custoEstimado,
      caixa: liberacao - custoEstimado,
      liberacaoAcumulada: acumulado,
      pctRecebido,
      evo,
      taxa,
      soma: evo + taxa,
      saldoFinanciamento: totalFinanciado - acumulado,
    };
  });
}

/** Custo referencial da obra = CUB × metragem. */
export function custoReferencial(cub: number, metragem: number): number {
  return (Number(cub) || 0) * (Number(metragem) || 0);
}
```

---

## 4. Onde vive cada número exibido


### 4.1 Os quatro KPIs do topo (um valor por versão selecionada)

Definidos em `page.tsx:173–183`, alimentados por `versionSummary`
(`page.tsx:40–84`). **O valor de cada um muda conforme o `kind` da versão** —
ver 4.2.

| KPI | Fórmula | Onde |
|---|---|---|
| VGV total | `Σ unit.valor` da versão | `page.tsx:76` |
| Realizado acum. | `Σ cash_entry.valor > 0` da versão, no período | `page.tsx:63–66` |
| A receber | `max(0, receitaProj − realizado)` | `page.tsx:79` |
| A pagar | `0` — sobrescrito só na versão Atual | `page.tsx:80` e `:170` |

### 4.2 A sobrescrita da versão Atual

O bloco `page.tsx:160–171` **substitui** três campos, e só para versões com
`kind === "atual"`:

| Campo | Valor na Atual | Valor nas demais versões |
|---|---|---|
| `receitaProj` | `realizado + totalReceb` | `Σ getMonthlyRevenue` |
| `aReceber` | `totalReceb` — recebíveis não recebidos | `max(0, receitaProj − realizado)` |
| `aPagar` | `totalPagar` — despesas não pagas | `0`, exibido como `"—"` |
| `monthly` | realizado + recebíveis projetados | `getMonthlyRevenue` filtrado |

`totalReceb` e `totalPagar` vêm de consultas **de tenant**, filtradas por
projeto em memória (`page.tsx:135–150`) — não por versão.

### 4.3 Painel "Status atual" e "Margem e produtividade"

Tudo de `getStatusProjeto` (`queries.ts:2085`). Os percentuais passam por um
helper único, `razao` (`queries.ts:2170`).

| Indicador | Fórmula | Onde |
|---|---|---|
| Recebido | entradas de caixa das versões do projeto | `queries.ts:2138` |
| % recebido | `razao(recebido, receitaPrevista)` | `queries.ts:2180` |
| Executado | despesas da versão Atual, exceto canceladas | `queries.ts:2148` |
| % executado | `razao(executado, despesaPrevista)` | `queries.ts:2183` |
| Margem de contribuição | `receitaAtual − custoVariavel − despesaVariavel` | `queries.ts:2169` |
| % margem | `razao(margemContribuicao, receitaPrevista)` | `queries.ts:2186` |
| Custo por m² | `razao(executado, metragem)` | `queries.ts:2191` |
| Receita por m² | `razao(receitaAtual, metragem)` | `queries.ts:2192` |

`receitaPrevista` é o **valor global de venda do cadastro do projeto**
(`queries.ts:2108`), não a soma das unidades; `despesaPrevista` é o
planejamento da versão **Budget** (`queries.ts:2143`).

### 4.4 Painel de indicadores da obra

Tudo de `getIndicadoresObra`, que compõe quatro funções de
`calc/medicao-bdi.ts`:

| Indicador | De onde sai |
|---|---|
| Financiado construção / terreno / total | colunas do `project` |
| Custo total dos serviços | `custoTotalServicos(servicos)` — soma de `servico.custo_proposto` |
| BDI, Valor do BDI, Custo com BDI | `calcBdi(servicos, project.pct_bdi)` |
| Serviços fora dos limites | `calcIncidencias` — conta status fora da faixa |
| Evolução física acumulada / do mês | `calcEvolucao(servicos, medicoes)` — última linha |
| Liberação mês / acumulada, saldo, custo estimado, geração de caixa, % recebido | `calcProvisionamento(evolucao, params)` — última linha |
| Custo referencial | `custoReferencial(cub, metragem)` = CUB × metragem |

Como registrado no `docs/TELA-medicao.md`, as tabelas `servico` e
`medicao_servico` **não têm escrita em lugar nenhum do repositório** — só
leitura. Na prática `servicoRows` volta vazio e todos os indicadores desta
seção ficam em zero, com `temMedicao: false`.

### `src/app/(app)/dashboard/page.tsx` · linhas 39–84

`versionSummary` — a origem dos quatro KPIs.

```tsx
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
```

### `src/app/(app)/dashboard/page.tsx` · linhas 128–183

A sobrescrita da versão Atual e a definição dos KPIs.

```tsx
  // ── Versão "Atual — caixa real": dados reais ────────────────────────────
  // Budget/Forecast permanecem estritamente em suas seções. A versão Atual
  // reflete o caixa real do período: (a) fechamentos já realizados (entradas
  // conciliadas), (b) recebíveis das unidades vendidas ainda não recebidos
  // (entradas projetadas) e (c) despesas lançadas ainda não pagas (saídas
  // projetadas / contas a pagar).
  const hasRangeDash = !!(de || ate);
  const realReceb = (await getReceivables(ctx.tenant.id)).filter(
    (r) =>
      (isAll || r.projectId === project.id) &&
      (!hasRangeDash || dateInRange(r.dia, de, ate)),
  );
  const totalReceb = realReceb.reduce((a, r) => a + r.valor, 0);

  // Contas a pagar (despesas não pagas) do projeto, com vencimento no período.
  const contasPagarProj = (await getContasPagar(ctx.tenant.id)).filter(
    (c) =>
      (isAll || c.projectId === project.id) &&
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
```

---

## 5. Como o seletor de versões afeta cada indicador


O seletor é o `VersionMultiSelect` (`page.tsx:207–210`), que escreve `vs` no
`searchParams`. **Aqui o comportamento é diferente do `/caixa`:** não há modo
comparação separado — as versões selecionadas viram **colunas dentro de cada
cartão de KPI** (`page.tsx:224–239`).

### 5.1 A resolução

```ts
const wanted = (sp.vs ?? "").split(",").filter(Boolean);
const validWanted = versoes.filter((v) => wanted.includes(v.id)).slice(0, 3);
const selected = validWanted.length > 0 ? validWanted : versoes.slice(0, 3);
```

(`page.tsx:109–111`.) Máximo de 3; sem seleção válida, cai nas **três
primeiras versões do projeto**. Note que `versoes` vem de
`getVersionsDoProjeto(tenant, project.id)` — as versões do projeto do
**seletor de projeto**, não as de `ctx.versions` (que são do projeto ativo da
sessão). O comentário nas linhas 104–105 registra isso.

### 5.2 O efeito, indicador a indicador

| Indicador | Segue o seletor de versões? |
|---|---|
| VGV total | **sim** — `getUnits(version.id)` |
| Realizado acum. | **sim** — `cash_entry` filtrado por `version_id` |
| A receber | **sim**, indiretamente; na Atual vira `totalReceb`, que é de tenant |
| A pagar | **só existe na Atual**; nas demais exibe `"—"` |
| Painel Status atual (8 KPIs) | **não** — `getStatusProjeto` recebe só `tenantId` e `projectIds` |
| Painel Indicadores da obra (16 KPIs) | **não** — `getIndicadoresObra` recebe só `tenantId` e `projectId` |

Ou seja: dos 28 cartões da tela (4 KPIs do topo + 8 do Status atual + 16 dos
Indicadores da obra), **só os 4 do topo respondem ao seletor de versões.** Os
dois painéis inferiores são invariantes — trocar de versão não muda nenhum
valor neles.

Dentro de `getStatusProjeto`, cada componente já tem sua versão fixada em
código: `despesaPrevista` sai da **Budget**, `executado` e `receitaAtual` da
**Atual** (`queries.ts:2143`, `:2148`, `:2158`).

### 5.3 O seletor de projeto

Separado, e com mais alcance. `?proj=all` (`page.tsx:100`) troca
`getIndicadoresObra` por `getIndicadoresObraConsolidado` sobre
`ctx.projects.map(p => p.id)`, e faz `getStatusProjeto` receber todos os ids.
Os KPIs do topo, porém, **continuam sendo de um projeto só** — `project.id`,
resolvido em `page.tsx:101–102`, que no modo `all` cai no `ctx.project`.

### `src/app/(app)/dashboard/page.tsx` · linhas 95–127

A resolução de projeto e versões.

```tsx
  const sp = await searchParams;
  const de = sp.de ?? "";
  const ate = sp.ate ?? "";
  // Projeto vem do seletor (?proj=), não do "projeto ativo" da sessão — assim o
  // filtro do topo realmente troca a obra exibida. "all" consolida a empresa.
  const isAll = sp.proj === "all";
  const project =
    ctx.projects.find((p) => p.id === sp.proj) ?? ctx.project ?? ctx.projects[0];

  // As versões exibidas são as DO PROJETO selecionado (ctx.versions são as do
  // projeto ativo da sessão, que pode ser outro).
  const versoesProjeto = await getVersionsDoProjeto(ctx.tenant.id, project.id);
  const versoes = versoesProjeto.length > 0 ? versoesProjeto : ctx.versions;

  const wanted = (sp.vs ?? "").split(",").filter(Boolean);
  const validWanted = versoes.filter((v) => wanted.includes(v.id)).slice(0, 3);
  const selected = validWanted.length > 0 ? validWanted : versoes.slice(0, 3);

  const summaries = await Promise.all(
    selected.map((v) => versionSummary(project.id, v, de, ate)),
  );

  const indicadores = isAll
    ? await getIndicadoresObraConsolidado(
        ctx.tenant.id,
        ctx.projects.map((p) => p.id),
      )
    : await getIndicadoresObra(ctx.tenant.id, project.id);
  const statusProjeto = await getStatusProjeto(
    ctx.tenant.id,
    isAll ? ctx.projects.map((p) => p.id) : [project.id],
  );
```

### `src/app/(app)/dashboard/page.tsx` · linhas 215–248

Como as versões viram colunas nos cartões.

```tsx
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
```

---

## 6. O que cada card faz sem dado


Três comportamentos distintos convivem na tela.

### 6.1 KPIs do topo — sempre número, nunca traço

`brlk(0)` é formatado normalmente. Um projeto sem unidades exibe VGV como
valor zero, não como vazio. **A única exceção é "A pagar"**, que devolve a
string `"—"` quando a versão não é a Atual (`page.tsx:181`) — e isso não é
ausência de dado, é inaplicabilidade.

### 6.2 Painel Status atual — traço guardado pelo denominador

Os quatro percentuais checam o denominador **na camada de exibição**, não no
cálculo:

| Card | Condição para exibir | Sem dado |
|---|---|---|
| Recebido | sempre | `brl0(0)` |
| % recebido | `st.receitaPrevista > 0` | `"—"` + tom `muted` |
| Executado | sempre | `brl0(0)` |
| % executado | `st.despesaPrevista > 0` | `"—"` + tom `muted` |
| Margem de contribuição | sempre | `brl0(0)` |
| % margem | `st.receitaPrevista > 0` | `"—"` + tom `muted` |
| Custo por m² | `st.metragem > 0` | `"—"` + hint *"informe a metragem"* |
| Receita por m² | `st.metragem > 0` | `"—"` + hint *"informe a metragem"* |

Há ainda um curto-circuito antes: quando não há projeto, `getStatusProjeto`
devolve o objeto inteiro zerado (`queries.ts:2091–2093`).

### 6.3 Painel Indicadores da obra — estado próprio, com aviso

É o único que tem **estado de "sem dado" declarado**: o badge
`sem medição lançada` ao lado do título, quando `!ind.temMedicao`
(`indicadores-obra.tsx:104–106`).

| Card | Condição | Sem dado |
|---|---|---|
| Financiado construção / terreno / total | sempre | `brl0(0)` |
| Saldo de financiamento | sempre | `brl0(0)`, tom `muted` se `<= 0` |
| Custo total dos serviços | sempre | `brl0(0)` + hint `0 serviço(s)` |
| BDI | `ind.pctBdi > 0` | `"—"` + hint *"informe no cadastro do projeto"* |
| Valor do BDI / Custo com BDI | sempre | `brl0(0)` |
| Evolução acumulada / do mês | `ind.temMedicao` | `"—"` + tom `muted` |
| Liberação do mês | `ind.temMedicao` | `"—"` |
| **Liberação acumulada** | **sempre** | `brl0(0)` + hint `0,00% do financiado` |
| Custo estimado do mês | `ind.temMedicao` | `"—"` |
| Geração de caixa do mês | `ind.temMedicao` | `"—"` |
| Custo referencial | `ind.cub > 0` no hint | valor `brl0(0)`, hint *"informe CUB e metragem"* |
| Serviços fora dos limites | sempre | `"0"` + tom `good` |

Dois cartões desse painel exibem número mesmo sem medição: **Liberação
acumulada** (que inclui o financiamento do terreno já liberado,
`medicao-bdi.ts:199`) e **Custo referencial** (CUB × metragem, independente de
medição).

### `src/components/app/indicadores-obra.tsx` · linhas 6–42

O `pct` e o `KPI`, com os quatro tons.

```tsx
const pct = (v: number) =>
  `${v.toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}%`;

/** Um indicador. `hint` explica a origem do número quando ela não é óbvia. */
function KPI({
  label,
  value,
  hint,
  tone = "normal",
}: {
  label: string;
  value: string;
  hint?: string;
  tone?: "normal" | "good" | "warn" | "muted";
}) {
  const cor =
    tone === "good"
      ? "text-[var(--color-success)]"
      : tone === "warn"
        ? "text-[var(--color-warning)]"
        : tone === "muted"
          ? "text-[var(--color-ink4)]"
          : "text-[var(--color-ink)]";
  return (
    <Card>
      <CardContent className="p-4">
        <p className="font-[family-name:var(--font-mono)] text-[10px] uppercase tracking-wide text-[var(--color-ink3)]">
          {label}
        </p>
        <p className={`mt-1 font-[family-name:var(--font-mono)] text-[18px] font-semibold ${cor}`}>
          {value}
        </p>
        {hint && <p className="mt-0.5 text-[11px] text-[var(--color-ink4)]">{hint}</p>}
      </CardContent>
    </Card>
  );
}
```

### `src/components/app/indicadores-obra.tsx` · linhas 100–162

O painel com o badge de "sem medição lançada".

```tsx
      {/* Evolução física e liberação */}
      <div>
        <h2 className="mb-2 flex items-center gap-2 text-sm font-semibold text-[var(--color-ink)]">
          Evolução da obra e liberação
          {!ind.temMedicao && (
            <Badge tone="warning">sem medição lançada</Badge>
          )}
        </h2>
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <KPI
            label="Evolução física acumulada"
            value={ind.temMedicao ? pct(ind.evolucaoAcumulada) : "—"}
            tone={ind.temMedicao ? "good" : "muted"}
          />
          <KPI
            label="Evolução do mês"
            value={ind.temMedicao ? pct(ind.evolucaoMes) : "—"}
            tone={ind.temMedicao ? "normal" : "muted"}
          />
          <KPI
            label="Liberação do mês"
            value={ind.temMedicao ? brl0(ind.liberacaoMes) : "—"}
            tone={ind.temMedicao ? "normal" : "muted"}
          />
          <KPI
            label="Liberação acumulada"
            value={brl0(ind.liberacaoAcumulada)}
            hint={`${pct(ind.pctRecebido * 100)} do financiado`}
          />
          <KPI
            label="Custo estimado do mês"
            value={ind.temMedicao ? brl0(ind.custoEstimadoMes) : "—"}
            hint="CUB × metragem × evolução"
            tone={ind.temMedicao ? "normal" : "muted"}
          />
          <KPI
            label="Geração de caixa do mês"
            value={ind.temMedicao ? brl0(ind.geracaoCaixaMes) : "—"}
            hint="liberação − custo estimado"
            tone={
              !ind.temMedicao ? "muted" : ind.geracaoCaixaMes >= 0 ? "good" : "warn"
            }
          />
          <KPI
            label="Custo referencial"
            value={brl0(ind.custoReferencial)}
            hint={
              ind.cub > 0
                ? `CUB ${brl0(ind.cub)} × ${ind.metragem} m²`
                : "informe CUB e metragem"
            }
            tone={ind.cub > 0 ? "normal" : "muted"}
          />
          <KPI
            label="Serviços fora dos limites"
            value={String(ind.servicosForaDosLimites)}
            hint="incidência fora da faixa aceitável"
            tone={ind.servicosForaDosLimites > 0 ? "warn" : "good"}
          />
        </div>
      </div>
    </div>
  );
```

### `src/components/app/indicadores-obra.tsx` · linhas 174–252

O painel Status atual, com os guards de denominador.

```tsx
export function StatusProjetoPanel({ st }: { st: StatusProjeto }) {
  return (
    <div className="mt-6 space-y-4">
      <div>
        <h2 className="mb-2 text-sm font-semibold text-[var(--color-ink)]">
          Status atual
        </h2>
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <KPI
            label="Recebido"
            value={brl0(st.recebido)}
            hint={`de ${brl0(st.receitaPrevista)} previstos`}
          />
          <KPI
            label="% recebido"
            value={st.receitaPrevista > 0 ? pct(st.pctRecebido * 100) : "—"}
            hint="sobre a receita do cadastro"
            tone={st.receitaPrevista > 0 ? "good" : "muted"}
          />
          <KPI
            label="Executado"
            value={brl0(st.executado)}
            hint={`de ${brl0(st.despesaPrevista)} no Budget`}
          />
          <KPI
            label="% executado"
            value={st.despesaPrevista > 0 ? pct(st.pctExecutado * 100) : "—"}
            hint="sobre a despesa planejada"
            tone={
              st.despesaPrevista === 0
                ? "muted"
                : st.pctExecutado > 1
                  ? "warn"
                  : "normal"
            }
          />
        </div>
      </div>

      <div>
        <h2 className="mb-2 text-sm font-semibold text-[var(--color-ink)]">
          Margem e produtividade
        </h2>
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <KPI
            label="Margem de contribuição"
            value={brl0(st.margemContribuicao)}
            hint="receita − custo var. − despesa var."
            tone={st.margemContribuicao >= 0 ? "good" : "warn"}
          />
          <KPI
            label="% margem de contribuição"
            value={st.receitaPrevista > 0 ? pct(st.pctMargem * 100) : "—"}
            hint="sobre a receita total do projeto"
            tone={
              st.receitaPrevista === 0
                ? "muted"
                : st.pctMargem >= 0
                  ? "good"
                  : "warn"
            }
          />
          <KPI
            label="Custo por m²"
            value={st.metragem > 0 ? brl0(st.custoPorM2) : "—"}
            hint={st.metragem > 0 ? `${st.metragem} m²` : "informe a metragem"}
            tone={st.metragem > 0 ? "normal" : "muted"}
          />
          <KPI
            label="Receita por m²"
            value={st.metragem > 0 ? brl0(st.receitaPorM2) : "—"}
            hint={st.metragem > 0 ? `${st.metragem} m²` : "informe a metragem"}
            tone={st.metragem > 0 ? "normal" : "muted"}
          />
        </div>
      </div>
    </div>
  );
}
```

---

## 7. Divisão por valor que pode ser zero


**Toda divisão por variável no caminho do dashboard é guardada.** Não
encontrei nenhuma exposta. O levantamento completo:

| Arquivo:linha | Expressão | Guarda |
|---|---|---|
| `queries.ts:2170` | `razao = (n, d) => d > 0 ? n / d : 0` | **sim** — helper único usado nos 4 percentuais e nos 2 por m² |
| `queries.ts:2011` | `… / base` no `ponderada` | **sim** — dentro de `if (base > 0)` |
| `queries.ts:2015` | `… / comDados.length` | **sim** — `if (comDados.length === 0) return 0` antes |
| `queries.ts:2027` | `(valorBdi / custoTotalServicos) * 100` | **sim** — `custoTotalServicos > 0 ? … : 0` |
| `queries.ts:2042` | `liberacaoAcumulada / totalAquisicao` | **sim** — `totalAquisicao > 0 ? … : 0` |
| `medicao-bdi.ts:42` | `custoProposto / total` | **sim** — `total > 0 ? … : 0` |
| `medicao-bdi.ts:206` | `acumulado / totalFinanciado` | **sim** — `totalFinanciado > 0 ? … : 0` |

As demais divisões do caminho são pelo **literal `100`** e portanto seguras:
`medicao-bdi.ts:74` (`pct / 100`), `:140` (`… * pct) / 100`), `:202`
(`e.variacao / 100`) e `:208` (`pctTaxa / 100`).

Vale registrar o que o guard faz quando dispara: **devolve `0`, não `null`**.
Um `% recebido` de `0` pode significar "nada recebido" ou "receita prevista
não cadastrada" — quem distingue os dois casos é a camada de exibição, que
checa o denominador de novo antes de renderizar (seção 6.2). Nos cartões que
**não** fazem essa segunda checagem — como "Liberação acumulada", cujo hint
usa `pct(ind.pctRecebido * 100)` sem guard — o zero é exibido como
`0,00% do financiado`.

### `src/lib/queries.ts` · linhas 2166–2194

O helper `razao` e todos os seus usos.

```ts

  // Definição de negócio confirmada pelo cliente:
  // Margem de Contribuição = Receita − Custo Variável − Despesa Variável.
  const margemContribuicao = receitaAtual - custoVariavel - despesaVariavel;
  const razao = (n: number, d: number) => (d > 0 ? n / d : 0);

  // Metragem total dos projetos selecionados (cadastro do projeto).
  const metragem = projs
    .filter((p) => projectIds.includes(p.id))
    .reduce((a, p) => a + num(p.metragem), 0);

  return {
    receitaPrevista,
    recebido,
    pctRecebido: razao(recebido, receitaPrevista),
    despesaPrevista,
    executado,
    pctExecutado: razao(executado, despesaPrevista),
    margemContribuicao,
    // %MC = MC ÷ Receita Total do Projeto (cadastro).
    pctMargem: razao(margemContribuicao, receitaPrevista),
    receitaAtual,
    custoVariavel,
    despesaVariavel,
    metragem,
    custoPorM2: razao(executado, metragem),
    receitaPorM2: razao(receitaAtual, metragem),
  };
}
```

### `src/lib/calc/medicao-bdi.ts` · linhas 192–228

`calcProvisionamento` e `custoReferencial` — o guard de `totalFinanciado`.

```ts
export function calcProvisionamento(
  evolucao: EvolucaoMes[],
  p: ParamsProvisionamento,
): LinhaProvisionamento[] {
  const totalFinanciado =
    (Number(p.financiamentoConstrucao) || 0) + (Number(p.financiamentoTerreno) || 0);
  // O terreno já liberado compõe o acumulado desde o início.
  let acumulado = Number(p.financiamentoTerreno) || 0;

  return evolucao.map((e) => {
    const fracao = e.variacao / 100;
    const liberacao = fracao * (Number(p.financiamentoConstrucao) || 0);
    const custoEstimado = fracao * (Number(p.custoReferencial) || 0);
    acumulado += liberacao;
    const pctRecebido = totalFinanciado > 0 ? acumulado / totalFinanciado : 0;
    const evo = (Number(p.parcelaReferencia) || 0) * pctRecebido;
    const taxa = liberacao * ((Number(p.pctTaxa) || 0) / 100);
    return {
      competencia: e.competencia,
      obraMes: e.variacao,
      liberacao,
      custoEstimado,
      caixa: liberacao - custoEstimado,
      liberacaoAcumulada: acumulado,
      pctRecebido,
      evo,
      taxa,
      soma: evo + taxa,
      saldoFinanciamento: totalFinanciado - acumulado,
    };
  });
}

/** Custo referencial da obra = CUB × metragem. */
export function custoReferencial(cub: number, metragem: number): number {
  return (Number(cub) || 0) * (Number(metragem) || 0);
}
```

---

## 8. A tela verifica `can(ctx.perms, "dashboard", "ver")`?


**Não. A página não chama `can` uma única vez.**

O guard inteiro do `page.tsx` são duas linhas (`page.tsx:92–93`):

```tsx
const ctx = await getActiveContext();
if (!ctx) return null;
```

Não importa `can` nem `AccessDenied` — os dois estão ausentes da lista de
imports (`page.tsx:1–21`).

### 8.1 Mas aqui o enforcement central funciona

Diferente de `/acerto` e `/diagnostico/*`, **`dashboard` está em `SCREENS`**
(`permissions.ts:36`). Então `screenIdOfPath("/dashboard")` devolve
`"dashboard"`, e o layout aplica a checagem (`layout.tsx:94–95`):

```tsx
const screenId = screenIdOfPath(pathname);
const denied = screenId ? !can(ctx.perms, screenId, "ver") : false;
```

Quem não tem `dashboard:ver` é barrado pelo layout antes de a página
renderizar. A ausência de checagem no `page.tsx` não abre a tela — só
concentra a responsabilidade em uma camada só.

### 8.2 O que isso implica

| Camada | Verifica? |
|---|---|
| `layout.tsx` (enforcement central) | **sim** — `dashboard` está em `SCREENS` |
| `page.tsx` | não — só `if (!ctx) return null` |
| `sidebar.tsx` | sim — item sem `perm` cai em `can(perms, "dashboard", "ver")` |
| Queries chamadas | **não** — nenhuma das oito checa permissão |

As oito queries não têm guard próprio porque são funções de `queries.ts`, que
recebem ids e não consultam contexto. Comparar com `getDespesasSuspeitas`
(action) ou `getSocios`, que é query e também não checa. O padrão do
repositório é: quem checa permissão é a página ou a action, não a query.

### `src/app/(app)/dashboard/page.tsx` · linhas 87–102

O guard inteiro da página.

```tsx
export default async function DashboardPage({
  searchParams,
}: {
  searchParams: Promise<{ vs?: string; de?: string; ate?: string; proj?: string }>;
}) {
  const ctx = await getActiveContext();
  if (!ctx) return null;

  const sp = await searchParams;
  const de = sp.de ?? "";
  const ate = sp.ate ?? "";
  // Projeto vem do seletor (?proj=), não do "projeto ativo" da sessão — assim o
  // filtro do topo realmente troca a obra exibida. "all" consolida a empresa.
  const isAll = sp.proj === "all";
  const project =
    ctx.projects.find((p) => p.id === sp.proj) ?? ctx.project ?? ctx.projects[0];
```

### `src/lib/permissions.ts` · linhas 34–40

`dashboard` na lista `SCREENS`.

```ts
/** Todas as telas governadas (rota → tela). `perfil` é pessoal e não entra aqui. */
export const SCREENS: Screen[] = [
  { id: "dashboard", label: "Dashboard", modulo: "Reports" },
  { id: "projecao", label: "Projeção de Receitas", modulo: "Reports" },
  { id: "consolidado", label: "Consolidado", modulo: "Reports" },
  { id: "caixa", label: "Controle de Caixa", modulo: "Conciliação de Caixa" },
  { id: "fechamento", label: "Fechamento de Caixa", modulo: "Conciliação de Caixa" },
```

### `src/app/(app)/layout.tsx` · linhas 92–95

O enforcement central que cobre esta rota.

```tsx
  // Enforcement central de "Ver": mapeia a rota atual para a tela governada.
  const pathname = (await headers()).get("x-pathname");
  const screenId = screenIdOfPath(pathname);
  const denied = screenId ? !can(ctx.perms, screenId, "ver") : false;
```
