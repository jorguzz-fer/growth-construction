# TELA-budget — código na íntegra

Coleta do código que compõe a tela **Lançamento Budget** (`/budget`), em
`main` (commit `45f4ce3`). Sem resumo, sem comentário, sem análise.

Fora do escopo desta coleta, por serem genéricos ou de terceiros:
`@/components/ui/card`, `button` e `input`, `@/lib/context`,
`@/lib/permissions`, `@/lib/planning` (tipos), `@/lib/utils`, e as
bibliotecas `react`, `next/navigation`, `next/link`, `xlsx` e `drizzle-orm`.
`@/components/ui/money-input` está incluído por pedido explícito (seção 6).

**Árvore de dependências própria da tela:**

```
budget/page.tsx
├── components/app/access-denied.tsx
│   └── components/app/page-header.tsx
└── components/app/budget-planning-screen.tsx
    (não importa nenhum outro componente de components/app/)

query chamada pela página:  getBudgetPlanning
server actions disparadas:  saveBudgetPlanning        (actions/planning.ts)
                            setVersionStatus          (actions/planning.ts)
                            createForecastFromBudget  (actions/planning.ts)
                            duplicateForecast         (actions/planning.ts)
```

Duas observações de fato sobre o que foi pedido no item 4, para o recorte
ficar explícito:

- **Salvar receitas** e **Salvar despesas** são a MESMA Server Action:
  `saveBudgetPlanning(versionId, bloco, accounts)`, com
  `bloco: "receita" | "despesa"`. O rótulo do botão muda conforme o bloco
  (`budget-planning-screen.tsx`, linha 628); a action é uma só.
- **Exportar planilha** e **Importar planilha** NÃO são Server Actions.
  Acontecem inteiramente no cliente, dentro de `budget-planning-screen.tsx`
  (`exportar`, linha 484; `importar`, linha 514), usando a biblioteca `xlsx`
  e o helper `baixarXlsx` de `src/lib/download.ts`. A importação apenas
  preenche a grade em memória; a gravação só ocorre quando o usuário clica
  em Salvar, que aí sim chama `saveBudgetPlanning`. Por isso `lib/download.ts`
  vai junto na seção 4, marcado como o que de fato executa a exportação.

---

## 1. Página

### `src/app/(app)/budget/page.tsx`

```tsx
import { getActiveContext } from "@/lib/context";
import { can } from "@/lib/permissions";
import { getBudgetPlanning } from "@/lib/queries";
import { AccessDenied } from "@/components/app/access-denied";
import { BudgetPlanningScreen } from "@/components/app/budget-planning-screen";

export const dynamic = "force-dynamic";

export default async function BudgetPage({
  searchParams,
}: {
  searchParams: Promise<{ proj?: string; v?: string }>;
}) {
  const ctx = await getActiveContext();
  if (!ctx) return null;
  if (!can(ctx.perms, "budget", "ver")) return <AccessDenied />;
  const sp = await searchParams;

  // Inclui obras e matriz/filiais (office). Offices não têm cronograma → o
  // período do Budget/Forecast é o ano atual + 5 anos (definido no servidor).
  const alvos = ctx.projects;
  const projId =
    alvos.find((p) => p.id === sp.proj)?.id ??
    alvos.find((p) => p.id === ctx.project.id)?.id ??
    alvos[0]?.id ??
    ctx.project.id;
  const data = await getBudgetPlanning(ctx.tenant.id, projId, "budget", sp.v ?? null);
  const projects = alvos.map((p) => ({
    id: p.id,
    label: p.kind === "office" ? `${p.name} · Matriz/Filial` : p.name,
  }));
  return (
    <BudgetPlanningScreen
      data={data}
      kind="budget"
      projects={projects}
      canEdit={can(ctx.perms, "budget", "editar")}
    />
  );
}
```

---

## 2. Componentes próprios, recursivamente

### `src/components/app/access-denied.tsx`

```tsx
import { PageHeader } from "@/components/app/page-header";
import { Card, CardContent } from "@/components/ui/card";

export function AccessDenied() {
  return (
    <>
      <PageHeader title="Acesso negado" />
      <Card>
        <CardContent className="flex flex-col items-center gap-2 p-12 text-center">
          <span className="font-[family-name:var(--font-mono)] text-[10px] uppercase tracking-[0.2em] text-[var(--color-ink4)]">
            Sem permissão
          </span>
          <p className="text-sm text-[var(--color-ink3)]">
            Você não tem permissão de <strong>Ver</strong> esta tela. Fale com um
            administrador em Gestão de Acessos.
          </p>
        </CardContent>
      </Card>
    </>
  );
}
```

### `src/components/app/page-header.tsx`

Importado por `access-denied.tsx`.

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

### `src/components/app/budget-planning-screen.tsx`

```tsx
"use client";

import { Fragment, useMemo, useRef, useState, useTransition } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import Link from "next/link";
import * as XLSX from "xlsx";
import { baixarXlsx } from "@/lib/download";
import {
  saveBudgetPlanning,
  setVersionStatus,
  createForecastFromBudget,
  duplicateForecast,
  type PlanningAccountInput,
} from "@/lib/actions/planning";
import type { BudgetPlanningData, PlanningAccountRow } from "@/lib/planning";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input, Select } from "@/components/ui/input";
import { MoneyInput } from "@/components/ui/money-input";
import { brl0 } from "@/lib/utils";

interface RowState {
  rowKey: string;
  label: string;
  dreCategory: string | null;
  total: string;
  pct: Record<string, string>;
  ativo: boolean;
  fromChart: boolean;
}

function toRowState(r: PlanningAccountRow, months: string[]): RowState {
  const pct: Record<string, string> = {};
  for (const m of months) pct[m] = r.pct[m] != null ? String(r.pct[m]) : "";
  return {
    rowKey: r.rowKey,
    label: r.label,
    dreCategory: r.dreCategory,
    total: r.total ? String(r.total) : "",
    pct,
    ativo: r.ativo,
    fromChart: r.fromChart,
  };
}

const num = (s: string) => Number(s) || 0;
const monthLabel = (mk: string) => mk; // "MM/YYYY" já é o formato de exibição

export function BudgetPlanningScreen({
  data,
  kind,
  projects,
  canEdit,
  budgetVersions = [],
  canCreateForecast = false,
}: {
  data: BudgetPlanningData;
  kind: "budget" | "forecast";
  projects: { id: string; label: string }[];
  canEdit: boolean;
  budgetVersions?: { id: string; label: string }[];
  canCreateForecast?: boolean;
}) {
  const router = useRouter();
  const sp = useSearchParams();
  const months = data.months;
  const titulo = kind === "budget" ? "Lançamento Budget" : "Lançamento Forecast";
  // No Forecast, o total de cada conta é herdado do Budget (somente leitura);
  // só a redistribuição mensal (%) é editável.
  const totalReadOnly = kind === "forecast";

  const go = (patch: Record<string, string>) => {
    const params = new URLSearchParams(sp.toString());
    for (const [k, v] of Object.entries(patch)) {
      if (v) params.set(k, v);
      else params.delete(k);
    }
    router.push(`/${kind}?${params.toString()}`);
  };

  if (!data.hasPeriod) {
    return (
      <>
        <TopBar
          titulo={titulo}
          data={data}
          projects={projects}
          onProj={(id) => go({ proj: id, v: "" })}
          onVersion={(id) => go({ v: id })}
          canEdit={canEdit}
        />
        <Card>
          <CardContent className="p-6 text-center">
            <p className="text-[14px] text-[var(--color-ink)]">
              O período de planejamento deste projeto não está definido.
            </p>
            <p className="mt-1 text-[12.5px] text-[var(--color-ink3)]">
              Informe o <strong>Mês inicial</strong> e o <strong>Mês final</strong> no
              cadastro do projeto para habilitar o Budget e o Forecast.
            </p>
            <Link
              // Leva direto ao projeto em questão, já filtrado no seletor —
              // sem isso o usuário caía na lista inteira e tinha de procurar.
              href={`/projeto?proj=${data.project.id}`}
              className="mt-3 inline-block rounded-[8px] bg-[var(--color-accent2)] px-4 py-2 text-[13px] font-medium text-white hover:opacity-90"
            >
              Ir para o cadastro do projeto
            </Link>
          </CardContent>
        </Card>
      </>
    );
  }

  return (
    <>
      <TopBar
        titulo={titulo}
        data={data}
        projects={projects}
        onProj={(id) => go({ proj: id, v: "" })}
        onVersion={(id) => go({ v: id })}
        canEdit={canEdit}
      />
      {kind === "forecast" && (
        <ForecastToolbar
          projectId={data.project.id}
          budgetVersions={budgetVersions}
          canCreate={canCreateForecast}
          currentForecastId={data.versionId}
          onCreated={(id) => go({ v: id })}
          onCompare={() => go({ cmp: "1" })}
        />
      )}
      {kind === "forecast" && !data.versionId ? null : (
        <>
          <Bloco
            key={`rec-${data.versionId}`}
            titulo="Receitas por projeto"
            primeiraCol="Receita total do projeto"
            rows={data.receitas}
            months={months}
            versionId={data.versionId}
            bloco="receita"
            canEdit={canEdit && !isLocked(data)}
            totalReadOnly={totalReadOnly}
          />
          <div className="h-5" />
          <Bloco
            key={`desp-${data.versionId}`}
            titulo="Despesas por grupo · projeto/filial"
            primeiraCol="Orçamento total do projeto"
            rows={data.despesas}
            months={months}
            versionId={data.versionId}
            bloco="despesa"
            canEdit={canEdit && !isLocked(data)}
            totalReadOnly={totalReadOnly}
          />
        </>
      )}
    </>
  );
}

function ForecastToolbar({
  projectId,
  budgetVersions,
  canCreate,
  currentForecastId,
  onCreated,
  onCompare,
}: {
  projectId: string;
  budgetVersions: { id: string; label: string }[];
  canCreate: boolean;
  currentForecastId: string | null;
  onCreated: (id: string) => void;
  onCompare: () => void;
}) {
  const [baseId, setBaseId] = useState(budgetVersions[0]?.id ?? "");
  const [nome, setNome] = useState("");
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);

  if (budgetVersions.length === 0) {
    return (
      <Card className="mb-5">
        <CardContent className="p-4 text-[13px] text-[var(--color-ink3)]">
          Este projeto ainda não possui um Budget disponível para criação do Forecast.
        </CardContent>
      </Card>
    );
  }

  const criar = () => {
    if (!canCreate || !baseId) return;
    setError(null);
    start(async () => {
      try {
        const id = await createForecastFromBudget(projectId, baseId, nome);
        setNome("");
        onCreated(id);
      } catch (e) {
        setError(e instanceof Error ? e.message : "Falha ao criar Forecast.");
      }
    });
  };
  const duplicar = () => {
    if (!canCreate || !currentForecastId) return;
    setError(null);
    start(async () => {
      try {
        const id = await duplicateForecast(currentForecastId, nome);
        setNome("");
        onCreated(id);
      } catch (e) {
        setError(e instanceof Error ? e.message : "Falha ao duplicar Forecast.");
      }
    });
  };

  return (
    <Card className="mb-5">
      <CardContent className="flex flex-wrap items-end gap-3 p-4">
        <div>
          <div className="mb-0.5 text-[10px] uppercase tracking-wide text-[var(--color-ink3)]">
            Novo Forecast a partir do Budget
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <Select
              value={baseId}
              onChange={(e) => setBaseId(e.target.value)}
              className="h-9 w-auto"
              disabled={!canCreate || pending}
            >
              {budgetVersions.map((v) => (
                <option key={v.id} value={v.id}>
                  Base: {v.label}
                </option>
              ))}
            </Select>
            <Input
              value={nome}
              onChange={(e) => setNome(e.target.value)}
              placeholder="Nome do Forecast (ex.: Revisão 01)"
              className="h-9 w-56"
              disabled={!canCreate || pending}
            />
            <Button type="button" disabled={!canCreate || pending || !baseId} onClick={criar}>
              Criar Forecast
            </Button>
            {currentForecastId && (
              <Button
                type="button"
                variant="outline"
                disabled={!canCreate || pending}
                onClick={duplicar}
              >
                Duplicar atual
              </Button>
            )}
            {currentForecastId && (
              <Button type="button" variant="outline" disabled={pending} onClick={onCompare}>
                Comparar com Budget
              </Button>
            )}
          </div>
        </div>
        {error && <span className="text-[12px] text-[var(--color-danger)]">{error}</span>}
      </CardContent>
    </Card>
  );
}

function isLocked(data: BudgetPlanningData): boolean {
  return data.versions.find((v) => v.id === data.versionId)?.locked ?? false;
}

function TopBar({
  titulo,
  data,
  projects,
  onProj,
  onVersion,
  canEdit,
}: {
  titulo: string;
  data: BudgetPlanningData;
  projects: { id: string; label: string }[];
  onProj: (id: string) => void;
  onVersion: (id: string) => void;
  canEdit: boolean;
}) {
  const [pending, start] = useTransition();
  const version = data.versions.find((v) => v.id === data.versionId) ?? null;
  const periodo =
    data.project.mesInicial && data.project.mesFinal
      ? `${data.project.mesInicial} a ${data.project.mesFinal}`
      : "não definido";

  // Indicadores (usam os totais por conta).
  const somaTotais = (rows: PlanningAccountRow[]) => rows.reduce((a, r) => a + r.total, 0);
  const receitas = somaTotais(data.receitas);
  const despesas = somaTotais(data.despesas);
  const resultado = receitas - despesas;

  return (
    <>
      <div className="mb-4 flex flex-wrap items-center gap-3">
        <h1 className="font-[family-name:var(--font-serif)] text-2xl text-[var(--color-ink)]">
          {titulo}
        </h1>
        <Select
          value={data.project.id}
          onChange={(e) => onProj(e.target.value)}
          className="h-9 w-auto"
        >
          {projects.map((p) => (
            <option key={p.id} value={p.id}>
              {p.label}
            </option>
          ))}
        </Select>
        <Select
          value={data.versionId ?? ""}
          onChange={(e) => onVersion(e.target.value)}
          className="h-9 w-auto"
          disabled={data.versions.length === 0}
        >
          {data.versions.length === 0 && <option value="">— sem versão —</option>}
          {data.versions.map((v) => (
            <option key={v.id} value={v.id}>
              {v.label}
            </option>
          ))}
        </Select>
        <span
          className="rounded-[6px] bg-[var(--color-surface3)] px-2.5 py-1 text-[12px] text-[var(--color-ink2)]"
          title="Período definido no cadastro do projeto"
        >
          Período do projeto: {periodo}
        </span>
        <span className="rounded-[6px] bg-[var(--color-accent2)]/15 px-2.5 py-1 text-[12px] text-[var(--color-accent2)]">
          {data.months.length} meses
        </span>
        {version && (
          <Select
            value={version.status}
            onChange={(e) =>
              start(async () => {
                try {
                  await setVersionStatus(version.id, e.target.value);
                  window.location.reload();
                } catch {
                  /* ignora */
                }
              })
            }
            disabled={!canEdit || pending}
            className="h-9 w-auto"
            title="Status da versão"
          >
            <option>Rascunho</option>
            <option>Concluído</option>
            <option>Aprovado</option>
          </Select>
        )}
      </div>
      <p className="mb-4 text-[11px] text-[var(--color-ink3)]">
        Período definido no cadastro do projeto (somente leitura aqui).
      </p>

      <div className="mb-6 grid grid-cols-2 gap-3 sm:grid-cols-4">
        <Indicador titulo="Receitas" valor={receitas} tom="var(--color-accent2)" />
        <Indicador titulo="Despesas" valor={despesas} tom="var(--color-danger)" />
        <Indicador
          titulo="Resultado"
          valor={resultado}
          tom={resultado >= 0 ? "var(--color-success)" : "var(--color-danger)"}
        />
        <Indicador titulo="Recursos próprios" valor={data.project.recursosProprios} tom="var(--color-accent)" />
      </div>
    </>
  );
}

function Indicador({ titulo, valor, tom }: { titulo: string; valor: number; tom: string }) {
  return (
    <Card>
      <CardContent className="p-4">
        <div className="text-[12px] text-[var(--color-ink3)]">{titulo}</div>
        <div className="mt-1 font-[family-name:var(--font-mono)] text-[18px] font-semibold" style={{ color: tom }}>
          {brl0(valor)}
        </div>
      </CardContent>
    </Card>
  );
}

function Bloco({
  titulo,
  primeiraCol,
  rows: initialRows,
  months,
  versionId,
  bloco,
  canEdit,
  totalReadOnly = false,
}: {
  titulo: string;
  primeiraCol: string;
  rows: PlanningAccountRow[];
  months: string[];
  versionId: string | null;
  bloco: "receita" | "despesa";
  canEdit: boolean;
  totalReadOnly?: boolean;
}) {
  const [rows, setRows] = useState<RowState[]>(() =>
    initialRows.map((r) => toRowState(r, months)),
  );
  const [saving, start] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [ok, setOk] = useState(false);
  const [importMsg, setImportMsg] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  const setTotal = (i: number, v: string) =>
    setRows((s) => s.map((r, j) => (j === i ? { ...r, total: v } : r)));
  const setPct = (i: number, mes: string, v: string) =>
    setRows((s) =>
      s.map((r, j) => (j === i ? { ...r, pct: { ...r.pct, [mes]: v } } : r)),
    );

  // Cálculos por linha e totais do bloco.
  const calc = useMemo(() => {
    const perRow = rows.map((r) => {
      const total = num(r.total);
      let somaPct = 0;
      const valorMes: Record<string, number> = {};
      for (const m of months) {
        const p = num(r.pct[m]);
        somaPct += p;
        valorMes[m] = Math.round(total * p) / 100;
      }
      const somaValor = months.reduce((a, m) => a + valorMes[m], 0);
      return { total, somaPct, valorMes, saldo: total - somaValor };
    });
    const totalGeral = perRow.reduce((a, r) => a + r.total, 0);
    const valorMesTotal: Record<string, number> = {};
    for (const m of months)
      valorMesTotal[m] = perRow.reduce((a, r) => a + r.valorMes[m], 0);
    const distribuido = months.reduce((a, m) => a + valorMesTotal[m], 0);
    return {
      perRow,
      totalGeral,
      valorMesTotal,
      pctDistribuido: totalGeral > 0 ? (distribuido / totalGeral) * 100 : 0,
      saldoGeral: totalGeral - distribuido,
    };
  }, [rows, months]);

  const salvar = () => {
    if (!versionId) return;
    setError(null);
    setOk(false);
    const payload: PlanningAccountInput[] = rows.map((r) => ({
      rowKey: r.rowKey,
      dreCategory: r.dreCategory,
      total: num(r.total),
      months: months.map((m) => ({ mes: m, pct: num(r.pct[m]) })),
    }));
    start(async () => {
      try {
        await saveBudgetPlanning(versionId, bloco, payload);
        setOk(true);
      } catch (e) {
        setError(e instanceof Error ? e.message : "Falha ao salvar.");
      }
    });
  };

  const exportar = () => {
    const header = [
      "Conta",
      "Nome",
      "Total",
      ...months.flatMap((m) => [`${m} %`, `${m} R$`]),
      "Total %",
      "Saldo",
    ];
    const aoa: (string | number)[][] = [header];
    rows.forEach((r, i) => {
      const rc = calc.perRow[i];
      aoa.push([
        r.rowKey,
        r.label,
        num(r.total),
        ...months.flatMap((m) => [num(r.pct[m]), rc.valorMes[m]]),
        rc.somaPct,
        rc.saldo,
      ]);
    });
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(
      wb,
      XLSX.utils.aoa_to_sheet(aoa),
      bloco === "receita" ? "Receitas" : "Despesas",
    );
    baixarXlsx(wb, `${bloco}_${versionId ?? "versao"}.xlsx`);
  };

  const importar = async (file: File) => {
    setImportMsg(null);
    setError(null);
    try {
      const buf = await file.arrayBuffer();
      const wb = XLSX.read(buf, { type: "array" });
      const ws = wb.Sheets[wb.SheetNames[0]];
      const aoa = XLSX.utils.sheet_to_json(ws, { header: 1 }) as unknown[][];
      if (aoa.length < 2) {
        setImportMsg("Planilha vazia ou sem linhas de dados.");
        return;
      }
      const header = (aoa[0] ?? []).map((h) => String(h ?? "").trim());
      const idxConta = header.findIndex((h) => /^conta$/i.test(h));
      const idxTotal = header.findIndex((h) => /^total$/i.test(h));
      if (idxConta < 0) {
        setImportMsg('Coluna "Conta" não encontrada no cabeçalho.');
        return;
      }
      const monthCols: { mes: string; col: number }[] = [];
      header.forEach((h, c) => {
        const m = h.match(/^(\d{1,2}\/\d{4})\s*%$/);
        if (m) monthCols.push({ mes: m[1].padStart(7, "0"), col: c });
      });
      const monthSet = new Set(months);
      const byKey = new Map(rows.map((r, i) => [r.rowKey, i] as const));
      const next = rows.map((r) => ({ ...r, pct: { ...r.pct } }));
      let matched = 0;
      let ignored = 0;
      const fora = new Set<string>();
      for (let i = 1; i < aoa.length; i++) {
        const row = aoa[i];
        if (!row) continue;
        const code = String(row[idxConta] ?? "").trim();
        if (!code) continue;
        const ri = byKey.get(code);
        if (ri == null) {
          ignored++;
          continue;
        }
        if (idxTotal >= 0 && row[idxTotal] != null && row[idxTotal] !== "") {
          next[ri].total = String(Number(row[idxTotal]) || 0);
        }
        for (const mc of monthCols) {
          if (!monthSet.has(mc.mes)) {
            fora.add(mc.mes);
            continue;
          }
          const v = row[mc.col];
          next[ri].pct[mc.mes] = v == null || v === "" ? "" : String(Number(v) || 0);
        }
        matched++;
      }
      setRows(next);
      const parts = [`${matched} conta(s) atualizada(s)`];
      if (ignored) parts.push(`${ignored} ignorada(s) (código não está no Plano de Contas)`);
      if (fora.size) parts.push(`meses fora do período ignorados: ${[...fora].join(", ")}`);
      setImportMsg(parts.join(" · ") + ". Revise a prévia e clique em Salvar.");
    } catch {
      setImportMsg("Não foi possível ler a planilha.");
    } finally {
      if (fileRef.current) fileRef.current.value = "";
    }
  };

  const pctTone = (soma: number) =>
    Math.abs(soma - 100) < 0.01
      ? "var(--color-success)"
      : soma > 100
        ? "var(--color-danger)"
        : "var(--color-warning)";
  const algumAcima = calc.perRow.some((r) => r.somaPct > 100.01);

  return (
    <Card>
      <CardContent className="p-0">
        <div className="flex flex-wrap items-center justify-between gap-2 border-b border-[var(--color-accent2)]/12 p-4">
          <div>
            <h2 className="text-[15px] font-semibold text-[var(--color-ink)]">{titulo}</h2>
            <p className="mt-0.5 text-[11.5px] text-[var(--color-ink3)]">
              Informe o total e o percentual de cada mês. O valor mensal é calculado
              automaticamente; a soma por conta não pode ultrapassar 100%.
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            {error && <span className="text-[12px] text-[var(--color-danger)]">{error}</span>}
            {ok && !error && <span className="text-[12px] text-[var(--color-success)]">Salvo ✓</span>}
            <Button type="button" variant="outline" onClick={exportar}>
              Exportar planilha
            </Button>
            {canEdit && (
              <>
                <input
                  ref={fileRef}
                  type="file"
                  accept=".xlsx,.xls"
                  className="hidden"
                  onChange={(e) => {
                    const f = e.target.files?.[0];
                    if (f) void importar(f);
                  }}
                />
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => fileRef.current?.click()}
                >
                  Importar planilha
                </Button>
                <Button
                  type="button"
                  disabled={saving || algumAcima || !versionId}
                  onClick={salvar}
                >
                  {saving ? "Salvando…" : bloco === "receita" ? "Salvar receitas" : "Salvar despesas"}
                </Button>
              </>
            )}
          </div>
        </div>
        {importMsg && (
          <p className="border-b border-[var(--color-accent2)]/12 bg-[var(--color-accent)]/8 px-4 py-2 text-[12px] text-[var(--color-ink2)]">
            {importMsg}
          </p>
        )}

        <div className="max-h-[70vh] overflow-auto">
          <table className="w-full border-collapse text-sm">
            <thead className="sticky top-0 z-20 bg-[var(--color-surface2)]">
              <tr>
                <th className="sticky left-0 z-30 min-w-[220px] bg-[var(--color-surface2)] px-3 py-2 text-left font-[family-name:var(--font-mono)] text-[10px] uppercase tracking-wide text-[var(--color-ink3)]">
                  Plano de Contas
                </th>
                <th className="sticky left-[220px] z-30 min-w-[130px] bg-[var(--color-surface2)] px-3 py-2 text-right font-[family-name:var(--font-mono)] text-[10px] uppercase tracking-wide text-[var(--color-ink3)]">
                  {primeiraCol}
                </th>
                {months.map((m) => (
                  <th
                    key={m}
                    colSpan={2}
                    className="border-l border-[var(--color-accent2)]/10 px-3 py-2 text-center font-[family-name:var(--font-mono)] text-[10px] uppercase tracking-wide text-[var(--color-ink3)]"
                  >
                    {monthLabel(m)}
                  </th>
                ))}
                <th className="border-l border-[var(--color-accent2)]/10 px-3 py-2 text-right font-[family-name:var(--font-mono)] text-[10px] uppercase tracking-wide text-[var(--color-ink3)]">
                  Total %
                </th>
                <th className="px-3 py-2 text-right font-[family-name:var(--font-mono)] text-[10px] uppercase tracking-wide text-[var(--color-ink3)]">
                  Saldo
                </th>
              </tr>
              <tr>
                <th className="sticky left-0 z-30 bg-[var(--color-surface2)]" />
                <th className="sticky left-[220px] z-30 bg-[var(--color-surface2)]" />
                {months.map((m) => (
                  <Fragment key={m}>
                    <th className="border-l border-[var(--color-accent2)]/10 px-2 py-1 text-center text-[9px] text-[var(--color-ink4)]">%</th>
                    <th className="px-2 py-1 text-right text-[9px] text-[var(--color-ink4)]">Valor (R$)</th>
                  </Fragment>
                ))}
                <th />
                <th />
              </tr>
            </thead>
            <tbody>
              {rows.map((r, i) => {
                const rc = calc.perRow[i];
                return (
                  <tr key={r.rowKey} className={`border-b border-[var(--color-accent2)]/8 ${r.ativo ? "" : "opacity-70"}`}>
                    <td className="sticky left-0 z-10 min-w-[220px] bg-white px-3 py-1.5 text-[var(--color-ink)]">
                      {r.label}
                      {!r.fromChart && (
                        <span className="ml-1 rounded bg-[var(--color-ink4)]/15 px-1 text-[9px] text-[var(--color-ink3)]">legado</span>
                      )}
                    </td>
                    <td className="sticky left-[220px] z-10 bg-white px-2 py-1">
                      {canEdit && !totalReadOnly ? (
                        <MoneyInput value={r.total} onChange={(v) => setTotal(i, v)} className="h-8 w-[120px] text-right text-xs" />
                      ) : (
                        <div
                          className="text-right font-[family-name:var(--font-mono)] text-xs"
                          title={totalReadOnly ? "Total herdado do Budget (somente leitura)" : undefined}
                        >
                          {brl0(rc.total)}
                        </div>
                      )}
                    </td>
                    {months.map((m) => (
                      <Fragment key={m}>
                        <td className="border-l border-[var(--color-accent2)]/10 px-1 py-1">
                          {canEdit ? (
                            <Input
                              type="number"
                              min={0}
                              max={100}
                              step="0.01"
                              value={r.pct[m] ?? ""}
                              onChange={(e) => setPct(i, m, e.target.value)}
                              className="h-8 w-[62px] text-right text-xs"
                            />
                          ) : (
                            <div className="text-right text-xs text-[var(--color-ink2)]">{r.pct[m] || "0"}%</div>
                          )}
                        </td>
                        <td className="bg-[var(--color-surface2)]/40 px-2 py-1 text-right font-[family-name:var(--font-mono)] text-xs text-[var(--color-ink2)]">
                          {brl0(rc.valorMes[m])}
                        </td>
                      </Fragment>
                    ))}
                    <td className="border-l border-[var(--color-accent2)]/10 px-2 py-1 text-right">
                      <span
                        className="rounded px-1.5 py-0.5 font-[family-name:var(--font-mono)] text-[11px]"
                        style={{ color: pctTone(rc.somaPct), background: `${pctTone(rc.somaPct)}18` }}
                      >
                        {rc.somaPct.toFixed(rc.somaPct % 1 ? 2 : 0)}%
                      </span>
                    </td>
                    <td className={`px-3 py-1 text-right font-[family-name:var(--font-mono)] text-xs ${Math.abs(rc.saldo) < 0.005 ? "text-[var(--color-ink3)]" : "text-[var(--color-warning)]"}`}>
                      {brl0(rc.saldo)}
                    </td>
                  </tr>
                );
              })}
              {rows.length === 0 && (
                <tr>
                  <td colSpan={4 + months.length * 2} className="px-3 py-6 text-center">
                    {/* Estado vazio ACIONÁVEL: sem isto a tela virava um beco sem
                        saída — nenhuma linha para lançar e nenhuma indicação do
                        que fazer para destravar. */}
                    <p className="text-[var(--color-ink2)]">
                      Nenhuma conta de {bloco === "receita" ? "receita" : "despesa"} ativa
                      no Plano de Contas.
                    </p>
                    <p className="mt-1 text-[12px] text-[var(--color-ink3)]">
                      As linhas desta tabela vêm dos grupos do Plano de Contas. Para
                      destravar o lançamento, marque ao menos uma conta como{" "}
                      <strong>{bloco === "receita" ? "receita" : "despesa"}</strong> e{" "}
                      <strong>ativa</strong>.
                    </p>
                    <Link
                      href="/planocontas"
                      className="mt-2 inline-block rounded-[6px] border border-[var(--color-accent2)]/40 px-3 py-1.5 text-[12px] font-medium text-[var(--color-accent2)] hover:bg-[var(--color-accent4)]"
                    >
                      Abrir Plano de Contas
                    </Link>
                  </td>
                </tr>
              )}
              {/* Totais do bloco */}
              <tr className="border-t-2 border-[var(--color-accent2)]/20 bg-[var(--color-surface2)] font-semibold">
                <td className="sticky left-0 z-10 bg-[var(--color-surface2)] px-3 py-2 text-[var(--color-ink)]">
                  {bloco === "receita" ? "Total receitas" : "Total despesas"}
                </td>
                <td className="sticky left-[220px] z-10 bg-[var(--color-surface2)] px-3 py-2 text-right font-[family-name:var(--font-mono)]">
                  {brl0(calc.totalGeral)}
                </td>
                {months.map((m) => (
                  <Fragment key={m}>
                    <td className="border-l border-[var(--color-accent2)]/10 px-2 py-2 text-center text-[var(--color-ink4)]">–</td>
                    <td className="px-2 py-2 text-right font-[family-name:var(--font-mono)]">{brl0(calc.valorMesTotal[m])}</td>
                  </Fragment>
                ))}
                <td className="border-l border-[var(--color-accent2)]/10 px-2 py-2 text-right font-[family-name:var(--font-mono)]">
                  {calc.pctDistribuido.toFixed(0)}%
                </td>
                <td className="px-3 py-2 text-right font-[family-name:var(--font-mono)]">{brl0(calc.saldoGeral)}</td>
              </tr>
            </tbody>
          </table>
        </div>
      </CardContent>
    </Card>
  );
}
```

---

## 3. Funções de `src/lib/queries.ts` chamadas pela página

A página chama uma só: `getBudgetPlanning`.

### `src/lib/queries.ts` · linhas 733–922

```ts
/**
 * Carga da tela de planejamento (Budget/Forecast) no modelo total + %, para um
 * PROJETO e uma VERSÃO específicos. As linhas são os GRUPOS do Plano de Contas
 * separados por natureza (receita/despesa); grupos inativos e chaves legadas
 * (ex.: "Receita"/"Outras Receitas") que já tenham dados aparecem como linhas
 * legadas para preservar o histórico. As colunas vêm do período do projeto.
 */
export async function getBudgetPlanning(
  tenantId: string,
  projectId: string,
  kind: "budget" | "forecast",
  wantedVersionId?: string | null,
): Promise<import("./planning").BudgetPlanningData> {
  const { projectPeriodMonths, monthKeyOfInternalDate } = await import("./planning");
  const { defaultDreCategory } = await import("./budget/config");

  const [project] = await db
    .select()
    .from(schema.projects)
    .where(and(eq(schema.projects.id, projectId), eq(schema.projects.tenantId, tenantId)))
    .limit(1);

  const versionRows = project
    ? await db
        .select()
        .from(schema.versions)
        .where(and(eq(schema.versions.projectId, projectId), eq(schema.versions.kind, kind)))
        .orderBy(asc(schema.versions.createdAt))
    : [];
  const versions = versionRows.map((v) => ({
    id: v.id,
    label: v.label,
    kind: v.kind,
    status: v.status,
    isDefault: v.isDefault,
    locked: v.locked,
    sourceVersionId: v.sourceVersionId,
  }));
  const selected =
    versions.find((v) => v.id === wantedVersionId) ??
    versions.find((v) => v.isDefault) ??
    versions[0] ??
    null;

  // Período: obras usam as DATAS de início/fim do cadastro. Matriz/filiais
  // (kind "office") não têm cronograma → usam o ano atual + 5 anos à frente.
  let startMk = monthKeyOfInternalDate(project?.startDate);
  let endMk = monthKeyOfInternalDate(project?.endDate);
  if (project?.kind === "office") {
    const cy = new Date().getFullYear();
    startMk = `01/${cy}`;
    endMk = `12/${cy + 5}`;
  }
  const months = project ? projectPeriodMonths(startMk, endMk) : [];

  const emptyData: import("./planning").BudgetPlanningData = {
    project: {
      id: projectId,
      name: project?.name ?? "",
      mesInicial: startMk,
      mesFinal: endMk,
      recursosProprios: Number(project?.recursosProprios ?? 0) || 0,
    },
    hasPeriod: months.length > 0,
    months,
    versions,
    versionId: selected?.id ?? null,
    receitas: [],
    despesas: [],
  };
  if (!project || !selected) return emptyData;

  // Grupos do Plano de Contas (natureza derivada dos subitens; ativo = algum ativo).
  const accounts = await getChartAccounts(tenantId);
  interface Grp {
    groupCode: string;
    groupName: string;
    kind: "cef" | "complementar";
    natureza: "receita" | "despesa";
    ativo: boolean;
  }
  const grpMap = new Map<string, Grp>();
  for (const a of accounts) {
    const g = grpMap.get(a.groupCode);
    const nat = a.natureza === "receita" ? "receita" : "despesa";
    if (!g) {
      grpMap.set(a.groupCode, {
        groupCode: a.groupCode,
        groupName: a.groupName,
        kind: a.kind,
        natureza: nat,
        ativo: a.ativo ?? true,
      });
    } else {
      if (a.ativo) g.ativo = true;
      // A natureza do grupo é derivada dos subitens pela MESMA regra do "ativo":
      // basta UM subitem de receita para o grupo ser de receita
      // (ver naturezaDoGrupo em src/lib/natureza-grupo.ts).
      //
      // Antes, a natureza era fixada pela primeira subconta encontrada e nunca
      // reavaliada. Como a coluna `natureza` tem default "despesa", um grupo
      // cuja primeira subconta ainda estivesse no default era classificado como
      // despesa inteiro e desaparecia do bloco de receitas do Budget/Forecast —
      // deixando a tela sem nenhuma linha para lançar ("Nenhuma conta de receita
      // ativa no Plano de Contas"), ou seja, o lançamento travado.
      g.natureza = naturezaDoGrupo([{ natureza: g.natureza }, { natureza: nat }]);
    }
  }
  const grupos = [...grpMap.values()];

  // Totais por conta (budget_account) e pct por mês (budget_line) da versão.
  const [accRows, lineRows] = await Promise.all([
    db
      .select()
      .from(schema.budgetAccounts)
      .where(eq(schema.budgetAccounts.versionId, selected.id)),
    db
      .select()
      .from(schema.budgetLines)
      .where(eq(schema.budgetLines.versionId, selected.id)),
  ]);
  const totalOf = new Map<string, number>(); // `${kind}|${rowKey}` -> total
  const dreOf = new Map<string, string | null>();
  for (const a of accRows) {
    totalOf.set(`${a.kind}|${a.rowKey}`, Number(a.total));
    dreOf.set(`${a.kind}|${a.rowKey}`, a.dreCategory);
  }
  const pctOf = new Map<string, Record<string, number>>(); // key -> {mes: pct}
  for (const l of lineRows) {
    const key = `${l.kind}|${l.rowKey}`;
    const bag = pctOf.get(key) ?? {};
    bag[l.mes] = l.pct != null ? Number(l.pct) : 0;
    pctOf.set(key, bag);
  }

  const build = (nat: "receita" | "despesa"): import("./planning").PlanningAccountRow[] => {
    const rows: import("./planning").PlanningAccountRow[] = [];
    const seen = new Set<string>();
    const ativos = grupos.filter((x) => x.ativo);
    let daNatureza = ativos.filter((x) => x.natureza === nat);
    // O Plano de Contas é ÚNICO e vale para todos os projetos. A coluna
    // `natureza` tem default "despesa", então em geral nenhuma conta está
    // marcada como receita — e o bloco de receitas do Budget/Forecast ficava
    // sem nenhuma linha para lançar.
    //
    // Quando não há nenhum grupo marcado como receita, usam-se os grupos que já
    // existem no Plano de Contas, em vez de exigir a criação de contas novas.
    // Se o usuário marcar contas como receita no Plano de Contas, essa marcação
    // passa a valer e só elas aparecem aqui.
    if (nat === "receita" && daNatureza.length === 0) {
      daNatureza = ativos;
    }
    // Grupos ativos da natureza (fonte oficial das linhas).
    for (const g of daNatureza) {
      const key = `${nat}|${g.groupCode}`;
      seen.add(g.groupCode);
      rows.push({
        rowKey: g.groupCode,
        label: g.groupName,
        dreCategory:
          nat === "receita" ? "Receita" : dreOf.get(key) ?? defaultDreCategory(g.kind),
        total: totalOf.get(key) ?? 0,
        pct: pctOf.get(key) ?? {},
        ativo: true,
        fromChart: true,
      });
    }
    // Linhas legadas: chaves com dados que não correspondem a um grupo ativo.
    for (const a of accRows.filter((x) => x.kind === nat)) {
      if (seen.has(a.rowKey)) continue;
      seen.add(a.rowKey);
      rows.push({
        rowKey: a.rowKey,
        label: a.rowKey,
        dreCategory: a.dreCategory ?? (nat === "receita" ? "Receita" : null),
        total: Number(a.total),
        pct: pctOf.get(`${nat}|${a.rowKey}`) ?? {},
        ativo: false,
        fromChart: false,
      });
    }
    return rows;
  };

  return {
    ...emptyData,
    receitas: build("receita"),
    despesas: build("despesa"),
  };
}
```

---

## 4. Server Actions disparadas pela tela

As quatro actions usadas vivem todas em `src/lib/actions/planning.ts`, que vai
inteiro. Em seguida, `src/lib/download.ts` — que não é Server Action, mas é o
que executa a exportação da planilha.

### `src/lib/actions/planning.ts`

```ts
"use server";

import { and, eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { db, schema } from "@/lib/db";
import { getActiveContext } from "@/lib/context";
import { can } from "@/lib/permissions";
import { logAudit } from "@/lib/audit";
import { monthValue } from "@/lib/planning";

export interface PlanningAccountInput {
  rowKey: string;
  dreCategory: string | null;
  total: number;
  months: { mes: string; pct: number }[];
}

/** Screen id de permissão conforme o tipo da versão. */
function screenOf(kind: string): "budget" | "forecast" | null {
  return kind === "budget" ? "budget" : kind === "forecast" ? "forecast" : null;
}

/**
 * Grava um bloco (receitas OU despesas) de uma versão de Budget/Forecast no
 * modelo total + %. Substitui (delete + insert transacional) as contas e os
 * percentuais mensais daquele tipo, na versão informada. O valor mensal é
 * derivado: valor = total × pct / 100. NÃO toca no bloco oposto nem em outras
 * versões — preserva o isolamento entre versões/projetos.
 */
export async function saveBudgetPlanning(
  versionId: string,
  bloco: "receita" | "despesa",
  accounts: PlanningAccountInput[],
) {
  const ctx = await getActiveContext();
  if (!ctx) throw new Error("Sessão inválida.");

  const [version] = await db
    .select()
    .from(schema.versions)
    .where(and(eq(schema.versions.id, versionId), eq(schema.versions.tenantId, ctx.tenant.id)))
    .limit(1);
  if (!version) throw new Error("Versão não encontrada.");
  const screen = screenOf(version.kind);
  if (!screen || !can(ctx.perms, screen, "editar")) {
    throw new Error("Sem permissão para editar esta versão.");
  }
  if (version.locked) throw new Error("Versão congelada — edição bloqueada.");
  if (version.kind !== "budget" && version.kind !== "forecast") {
    throw new Error("Só é possível planejar versões de Budget ou Forecast.");
  }

  // Validação: sem percentuais negativos; soma por conta não pode ultrapassar 100%.
  for (const a of accounts) {
    let soma = 0;
    for (const m of a.months) {
      const p = Number(m.pct) || 0;
      if (p < 0) throw new Error(`Percentual negativo em "${a.rowKey}".`);
      soma += p;
    }
    if (soma > 100.01) {
      throw new Error(
        `A distribuição mensal de "${a.rowKey}" não pode ultrapassar 100% do total.`,
      );
    }
  }

  await db.transaction(async (tx) => {
    await tx
      .delete(schema.budgetAccounts)
      .where(
        and(
          eq(schema.budgetAccounts.versionId, versionId),
          eq(schema.budgetAccounts.kind, bloco),
        ),
      );
    await tx
      .delete(schema.budgetLines)
      .where(
        and(eq(schema.budgetLines.versionId, versionId), eq(schema.budgetLines.kind, bloco)),
      );

    const accVals = accounts
      .filter((a) => Number(a.total) !== 0 || a.months.some((m) => (Number(m.pct) || 0) !== 0))
      .map((a) => ({
        tenantId: ctx.tenant.id,
        versionId,
        kind: bloco,
        rowKey: a.rowKey,
        dreCategory: a.dreCategory,
        total: String(Number(a.total) || 0),
      }));
    if (accVals.length > 0) await tx.insert(schema.budgetAccounts).values(accVals);

    const lineVals: (typeof schema.budgetLines.$inferInsert)[] = [];
    for (const a of accounts) {
      const total = Number(a.total) || 0;
      for (const m of a.months) {
        const pct = Number(m.pct) || 0;
        if (pct === 0) continue;
        lineVals.push({
          tenantId: ctx.tenant.id,
          versionId,
          kind: bloco,
          rowKey: a.rowKey,
          dreCategory: a.dreCategory,
          mes: m.mes,
          valor: String(monthValue(total, pct)),
          pct: String(pct),
        });
      }
    }
    if (lineVals.length > 0) await tx.insert(schema.budgetLines).values(lineVals);
  });

  await logAudit({
    tenantId: ctx.tenant.id,
    userId: ctx.userId,
    action: "budget.planning.save",
    entity: "version",
    entityId: versionId,
    meta: { bloco, contas: accounts.length },
  });
  revalidatePath("/budget");
  revalidatePath("/forecast");
  revalidatePath("/dre");
  revalidatePath("/fluxocaixa");
}

const FORECAST_COLORS = [
  "#10b981", "#0ea5e9", "#8b5cf6", "#f59e0b", "#ec4899", "#14b8a6", "#6366f1", "#f43f5e",
];
const MAX_FORECASTS = 12;

/** Copia budget_account + budget_line de uma versão de origem para a nova versão. */
async function copyPlanningData(
  tx: Parameters<Parameters<typeof db.transaction>[0]>[0],
  tenantId: string,
  fromVersionId: string,
  toVersionId: string,
) {
  const [accs, lines] = await Promise.all([
    tx.select().from(schema.budgetAccounts).where(eq(schema.budgetAccounts.versionId, fromVersionId)),
    tx.select().from(schema.budgetLines).where(eq(schema.budgetLines.versionId, fromVersionId)),
  ]);
  if (accs.length > 0) {
    await tx.insert(schema.budgetAccounts).values(
      accs.map((a) => ({
        tenantId,
        versionId: toVersionId,
        kind: a.kind,
        rowKey: a.rowKey,
        dreCategory: a.dreCategory,
        total: a.total,
      })),
    );
  }
  if (lines.length > 0) {
    await tx.insert(schema.budgetLines).values(
      lines.map((l) => ({
        tenantId,
        versionId: toVersionId,
        kind: l.kind,
        rowKey: l.rowKey,
        dreCategory: l.dreCategory,
        mes: l.mes,
        valor: l.valor,
        pct: l.pct,
      })),
    );
  }
}

/**
 * Cria uma versão de Forecast como SNAPSHOT independente a partir de uma versão
 * de Budget do mesmo projeto: copia contas, totais, percentuais e valores, e
 * registra a origem (source_version_id) apenas para rastreabilidade/comparação.
 * O Forecast não fica sincronizado com o Budget depois de criado.
 */
export async function createForecastFromBudget(
  projectId: string,
  budgetVersionId: string,
  label: string,
): Promise<string> {
  const ctx = await getActiveContext();
  if (!ctx || !can(ctx.perms, "forecast", "criar")) {
    throw new Error("Sem permissão para criar Forecast.");
  }
  if (!ctx.projects.some((p) => p.id === projectId)) {
    throw new Error("Projeto inválido.");
  }
  const [budget] = await db
    .select()
    .from(schema.versions)
    .where(
      and(
        eq(schema.versions.id, budgetVersionId),
        eq(schema.versions.tenantId, ctx.tenant.id),
        eq(schema.versions.projectId, projectId),
        eq(schema.versions.kind, "budget"),
      ),
    )
    .limit(1);
  if (!budget) throw new Error("Versão de Budget de origem não encontrada.");

  const existing = await db
    .select({ id: schema.versions.id })
    .from(schema.versions)
    .where(
      and(eq(schema.versions.projectId, projectId), eq(schema.versions.kind, "forecast")),
    );
  if (existing.length >= MAX_FORECASTS) {
    throw new Error(`Limite de ${MAX_FORECASTS} versões de Forecast por projeto atingido.`);
  }
  const clean = (label || "").trim() || "Forecast";
  const key = `forecast-${crypto.randomUUID().slice(0, 8)}`;
  const color = FORECAST_COLORS[existing.length % FORECAST_COLORS.length];

  const newId = await db.transaction(async (tx) => {
    const [v] = await tx
      .insert(schema.versions)
      .values({
        projectId,
        tenantId: ctx.tenant.id,
        key,
        kind: "forecast",
        label: clean,
        color,
        isDefault: false,
        locked: false,
        status: "Rascunho",
        sourceVersionId: budgetVersionId,
      })
      .returning();
    await copyPlanningData(tx, ctx.tenant.id, budgetVersionId, v.id);
    return v.id;
  });

  await logAudit({
    tenantId: ctx.tenant.id,
    userId: ctx.userId,
    action: "forecast.createFromBudget",
    entity: "version",
    entityId: newId,
    meta: { projectId, budgetVersionId, label: clean },
  });
  revalidatePath("/forecast");
  return newId;
}

/** Duplica uma versão de Forecast em uma nova versão independente. */
export async function duplicateForecast(
  forecastVersionId: string,
  label: string,
): Promise<string> {
  const ctx = await getActiveContext();
  if (!ctx || !can(ctx.perms, "forecast", "criar")) {
    throw new Error("Sem permissão para duplicar Forecast.");
  }
  const [src] = await db
    .select()
    .from(schema.versions)
    .where(
      and(
        eq(schema.versions.id, forecastVersionId),
        eq(schema.versions.tenantId, ctx.tenant.id),
        eq(schema.versions.kind, "forecast"),
      ),
    )
    .limit(1);
  if (!src) throw new Error("Forecast de origem não encontrado.");

  const existing = await db
    .select({ id: schema.versions.id })
    .from(schema.versions)
    .where(
      and(eq(schema.versions.projectId, src.projectId), eq(schema.versions.kind, "forecast")),
    );
  if (existing.length >= MAX_FORECASTS) {
    throw new Error(`Limite de ${MAX_FORECASTS} versões de Forecast por projeto atingido.`);
  }
  const clean = (label || "").trim() || `${src.label} (cópia)`;
  const key = `forecast-${crypto.randomUUID().slice(0, 8)}`;
  const color = FORECAST_COLORS[existing.length % FORECAST_COLORS.length];

  const newId = await db.transaction(async (tx) => {
    const [v] = await tx
      .insert(schema.versions)
      .values({
        projectId: src.projectId,
        tenantId: ctx.tenant.id,
        key,
        kind: "forecast",
        label: clean,
        color,
        isDefault: false,
        locked: false,
        status: "Rascunho",
        sourceVersionId: src.sourceVersionId,
      })
      .returning();
    await copyPlanningData(tx, ctx.tenant.id, src.id, v.id);
    return v.id;
  });

  await logAudit({
    tenantId: ctx.tenant.id,
    userId: ctx.userId,
    action: "forecast.duplicate",
    entity: "version",
    entityId: newId,
    meta: { from: forecastVersionId, label: clean },
  });
  revalidatePath("/forecast");
  return newId;
}

/** Atualiza o status do workflow da versão (Rascunho/Concluído/Aprovado). */
export async function setVersionStatus(versionId: string, status: string) {
  const ctx = await getActiveContext();
  if (!ctx) throw new Error("Sessão inválida.");
  const allowed = ["Rascunho", "Concluído", "Aprovado"];
  if (!allowed.includes(status)) throw new Error("Status inválido.");
  const [version] = await db
    .select()
    .from(schema.versions)
    .where(and(eq(schema.versions.id, versionId), eq(schema.versions.tenantId, ctx.tenant.id)))
    .limit(1);
  if (!version) return;
  const screen = screenOf(version.kind);
  if (!screen || !can(ctx.perms, screen, "editar")) {
    throw new Error("Sem permissão.");
  }
  await db
    .update(schema.versions)
    .set({ status })
    .where(eq(schema.versions.id, versionId));
  await logAudit({
    tenantId: ctx.tenant.id,
    userId: ctx.userId,
    action: "version.status",
    entity: "version",
    entityId: versionId,
    meta: { status },
  });
  revalidatePath("/budget");
  revalidatePath("/forecast");
}
```

### `src/lib/download.ts`

Não é Server Action. `baixarXlsx` é chamado por `exportar()` em `budget-planning-screen.tsx`.

```ts
import * as XLSX from "xlsx";

/**
 * Dispara o download de um arquivo no browser de forma confiável: gera um
 * object URL, anexa um <a> ao DOM, clica e só então (com atraso) revoga o URL.
 * Revogar imediatamente após o clique cancela o download em alguns navegadores.
 */
export function baixarBlob(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.style.display = "none";
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1500);
}

/** Escreve um workbook XLSX e baixa (sem depender de XLSX.writeFile/fs). */
export function baixarXlsx(wb: XLSX.WorkBook, filename: string): void {
  const buf = XLSX.write(wb, { type: "array", bookType: "xlsx" }) as ArrayBuffer;
  baixarBlob(
    new Blob([buf], {
      type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    }),
    filename,
  );
}
```

---

## 5. Tabelas no schema

### Tabela `budget_line`

### `src/lib/db/schema.ts` · linhas 1351–1385

```ts
/**
 * Lançamento simplificado mensal das versões Budget/Forecast. Uma linha por
 * (versão, tipo, chave da linha, mês). Receita: chave = fonte consolidada
 * (Mensais, Semestrais, …, Reembolso). Despesa: chave = grupo do plano de
 * contas (CEF), associado a uma categoria da DRE. A versão "atual" continua
 * usando o lançamento detalhado (unidades/despesas).
 */
export const budgetLines = pgTable(
  "budget_line",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    tenantId: uuid("tenant_id")
      .notNull()
      .references(() => tenants.id, { onDelete: "cascade" }),
    versionId: uuid("version_id")
      .notNull()
      .references(() => versions.id, { onDelete: "cascade" }),
    /** "receita" | "despesa" */
    kind: text("kind").notNull(),
    /** fonte de receita OU código do grupo CEF (despesa). */
    rowKey: text("row_key").notNull(),
    /** categoria DRE associada (para despesa; "Receita" para receita). */
    dreCategory: text("dre_category"),
    /** "MM/YYYY". */
    mes: text("mes").notNull(),
    valor: numeric("valor", { precision: 15, scale: 2 }).notNull().default("0"),
    /**
     * Percentual do mês sobre o total da conta (modelo total + %). O `valor` é
     * recalculado = total × pct / 100. NULL em lançamentos antigos que ainda não
     * migraram (a migração faz o backfill a partir do valor/total).
     */
    pct: numeric("pct", { precision: 7, scale: 4 }),
  },
  (t) => [unique("budget_line_uq").on(t.versionId, t.kind, t.rowKey, t.mes)],
);
```

### Tabela `budget_account`

### `src/lib/db/schema.ts` · linhas 1387–1412

```ts
/**
 * Total planejado por conta em uma versão (modelo total + %). O valor mensal em
 * `budget_line` é derivado deste total pelo percentual do mês. Uma linha por
 * (versão, tipo, conta). Ver docs/SPEC (Planejamento §7–8).
 */
export const budgetAccounts = pgTable(
  "budget_account",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    tenantId: uuid("tenant_id")
      .notNull()
      .references(() => tenants.id, { onDelete: "cascade" }),
    versionId: uuid("version_id")
      .notNull()
      .references(() => versions.id, { onDelete: "cascade" }),
    /** "receita" | "despesa". */
    kind: text("kind").notNull(),
    /** identidade da linha: código da conta do Plano de Contas (ou chave legada). */
    rowKey: text("row_key").notNull(),
    /** categoria DRE associada. */
    dreCategory: text("dre_category"),
    /** total planejado da conta no projeto (base para o rateio mensal por %). */
    total: numeric("total", { precision: 15, scale: 2 }).notNull().default("0"),
  },
  (t) => [unique("budget_account_uq").on(t.versionId, t.kind, t.rowKey)],
);
```

### Tabela `chart_account`

### `src/lib/db/schema.ts` · linhas 533–561

```ts
/**
 * Subitem do plano de contas (dupla classificação CEF/complementar). Registro
 * por tenant, derivado de PLANO_CONTAS. Ver docs/SPEC.md §8.3.
 */
export const chartAccounts = pgTable(
  "chart_account",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    tenantId: uuid("tenant_id")
      .notNull()
      .references(() => tenants.id, { onDelete: "cascade" }),
    /** código do subitem (ex.: "1.1", "T.3"). */
    code: text("code").notNull(),
    name: text("name").notNull(),
    /** código do grupo pai (ex.: "1", "T"). */
    groupCode: text("group_code").notNull(),
    groupName: text("group_name").notNull(),
    kind: accountKindEnum("kind").notNull(),
    /**
     * Natureza da conta no planejamento: "receita" ou "despesa". Define em qual
     * bloco (Receitas/Despesas) do Budget/Forecast a conta aparece. Padrão
     * "despesa" (o plano de contas existente é orientado a despesa).
     */
    natureza: text("natureza").notNull().default("despesa"),
    /** Conta ativa: inativas não aparecem em novos lançamentos, mas ficam no histórico. */
    ativo: boolean("ativo").notNull().default(true),
  },
  (c) => [unique("chart_account_tenant_code_uq").on(c.tenantId, c.code)],
);
```

---

## 6. `MoneyInput`

### `src/components/ui/money-input.tsx`

```tsx
"use client";

import { useEffect, useState } from "react";
import { cn } from "@/lib/utils";

/**
 * Formata centavos (inteiro) no padrão brasileiro: 100050 → "1.000,50".
 * Sempre com duas casas decimais.
 */
function fmtCents(cents: number): string {
  const neg = cents < 0;
  const abs = Math.abs(Math.trunc(cents));
  const s = String(abs).padStart(3, "0");
  const int = s.slice(0, -2);
  const dec = s.slice(-2);
  const intFmt = int.replace(/\B(?=(\d{3})+(?!\d))/g, ".");
  return (neg ? "-" : "") + intFmt + "," + dec;
}

/** Valor canônico (reais) → centavos inteiros. "1000.5" → 100050. */
function valueToCents(v: string | number): number {
  const n =
    typeof v === "number" ? v : parseFloat(String(v).replace(/\s/g, "").replace(",", "."));
  if (!isFinite(n) || n === 0) return 0;
  return Math.round(n * 100);
}

const toDisplay = (v: string | number): string =>
  v === "" || v === null || v === undefined ? "" : fmtCents(valueToCents(v));

/**
 * Campo monetário com formatação automática no padrão BR enquanto o usuário
 * digita (estilo "acumulador de centavos"): digitar 100000 exibe 1.000,00.
 * O `onChange` emite o valor canônico em reais (ponto decimal, ex.: "1000").
 */
export function MoneyInput({
  value,
  onChange,
  disabled,
  placeholder = "0,00",
  className,
  name,
  "aria-label": ariaLabel,
}: {
  value: string | number;
  onChange: (v: string) => void;
  disabled?: boolean;
  placeholder?: string;
  className?: string;
  name?: string;
  "aria-label"?: string;
}) {
  const [text, setText] = useState(() => toDisplay(value));

  // Sincroniza a exibição quando o valor muda por fora (import, IA, reset).
  useEffect(() => {
    setText(toDisplay(value));
  }, [value]);

  const handle = (raw: string) => {
    const digitsOnly = raw.replace(/\D/g, "");
    if (digitsOnly === "") {
      setText("");
      onChange("");
      return;
    }
    const cents = Number(digitsOnly);
    setText(fmtCents(cents));
    onChange(String(cents / 100));
  };

  return (
    <>
      {name && (
        <input
          type="hidden"
          name={name}
          value={value === "" || value === null || value === undefined ? "" : String(value)}
        />
      )}
      <input
        type="text"
        inputMode="numeric"
        aria-label={ariaLabel}
        disabled={disabled}
        value={text}
        placeholder={placeholder}
        onChange={(e) => handle(e.target.value)}
        className={cn(
          "h-9 w-full rounded-[8px] border border-[var(--color-accent2)]/20 bg-white px-3 text-right text-sm text-[var(--color-ink)] outline-none transition-colors placeholder:text-[var(--color-ink4)] focus:border-[var(--color-accent2)] focus:ring-2 focus:ring-[var(--color-accent2)]/20 disabled:opacity-60",
          className,
        )}
      />
    </>
  );
}
```

