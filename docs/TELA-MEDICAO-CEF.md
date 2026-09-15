# TELA-MEDICAO-CEF — código na íntegra

Coleta do código da tela **Medição de Obra — Relatório CEF** (`/medicao`), em
`main` (commit `45f4ce3`). Sem resumo, sem análise.

> **Duas premissas do pedido não se confirmam. Registro antes:**
>
> 1. **Não existe layout de impressão.** O `PrintButton` tem 11 linhas e chama
>    `window.print()`. Não há `@media print` em nenhum CSS do projeto, nem
>    componente de cabeçalho para impressão. Ver (f).
> 2. **A tela não usa `medicao-bdi.ts`.** Esse módulo serve o Dashboard, por
>    `getIndicadoresObra`. Incluo-o na íntegra por pedido explícito, marcado
>    como não pertencente a esta tela. Ver (i).

**Árvore de dependências própria (recursiva):**

```
medicao/page.tsx
├── components/app/page-header.tsx
├── components/app/print-button.tsx        (11 linhas — window.print())
└── components/app/date-range-filter.tsx

Nenhum importa outro componente próprio. As demais importações são
primitivas de UI (table) e libs (calc/constants, utils, context).

queries chamadas:  getBudgetLines · getMedicoes   — só duas
actions:           NENHUMA — a tela é somente leitura
```

---

## 1. A página

### `src/app/(app)/medicao/page.tsx`

```tsx
import { getActiveContext } from "@/lib/context";
import { getBudgetLines, getMedicoes } from "@/lib/queries";
import { PLANO_CONTAS, PCT_REF_CEF } from "@/lib/calc/constants";
import { brl0, monthInRange } from "@/lib/utils";
import { PageHeader } from "@/components/app/page-header";
import { PrintButton } from "@/components/app/print-button";
import { DateRangeFilter } from "@/components/app/date-range-filter";
import { Table, THead, TH, TR, TD } from "@/components/ui/table";

export const dynamic = "force-dynamic";

export default async function MedicaoPage({
  searchParams,
}: {
  searchParams: Promise<{ de?: string; ate?: string }>;
}) {
  const ctx = await getActiveContext();
  if (!ctx) return null;

  const sp = await searchParams;
  const de = sp.de ?? "";
  const ate = sp.ate ?? "";
  const hasRange = !!(de || ate);
  const inRange = (mm: string | null) => !hasRange || monthInRange(mm, de, ate);

  // Fontes dos dados:
  //  - Orçado  → lançamento simplificado da versão Budget (despesas por grupo CEF).
  //  - Realizado → lançamento de medição da versão Atual (medições por grupo).
  const budgetV = ctx.versions.find((v) => v.kind === "budget");
  const atualV =
    ctx.versions.find((v) => v.kind === "atual") ??
    ctx.versions.find((v) => v.isDefault) ??
    ctx.version;

  const [budgetLines, medicoes] = await Promise.all([
    budgetV ? getBudgetLines(budgetV.id) : Promise.resolve([]),
    getMedicoes(atualV.id),
  ]);

  // Orçado por grupo de obra (prefixo antes do primeiro ponto do rowKey/CEF).
  // Vem exclusivamente do lançamento do Budget: se o grupo estiver zerado no
  // Budget, o orçado aqui também é zero (sem estimativa de referência).
  const orcadoPorGrupo = new Map<string, number>();
  for (const l of budgetLines) {
    if (l.kind !== "despesa" || !inRange(l.mes)) continue;
    const grp = (l.rowKey ?? "").split(".")[0];
    orcadoPorGrupo.set(grp, (orcadoPorGrupo.get(grp) || 0) + Number(l.valor));
  }

  // Realizado por grupo de obra a partir das medições lançadas (versão Atual).
  const realizadoPorGrupo = new Map<string, number>();
  for (const m of medicoes) {
    if (!inRange(m.competencia)) continue;
    realizadoPorGrupo.set(
      m.grupoCode,
      (realizadoPorGrupo.get(m.grupoCode) || 0) + Number(m.valor),
    );
  }

  const rows = PLANO_CONTAS.obra.map((g, i) => {
    // Orçado estritamente do Budget: grupo sem lançamento no Budget → zero.
    const orcado = orcadoPorGrupo.get(g.id) || 0;
    const realizado = realizadoPorGrupo.get(g.id) || 0;
    const pctFisico = orcado > 0 ? Math.min((realizado / orcado) * 100, 100) : 0;
    return { g, pctRef: PCT_REF_CEF[i], orcado, realizado, pctFisico };
  });
  const totOrc = rows.reduce((a, r) => a + r.orcado, 0);
  const totReal = rows.reduce((a, r) => a + r.realizado, 0);
  const totPct = totOrc > 0 ? (totReal / totOrc) * 100 : 0;

  return (
    <>
      <PageHeader
        eyebrow={`${ctx.project.name} · Orçado ${budgetV?.label ?? "Budget"} · Realizado ${atualV.label}`}
        title="Medição de Obra — Relatório CEF"
        subtitle="Orçado: lançamento do Budget · Realizado: lançamento de medição (versão Atual)"
        actions={
          <div className="flex flex-wrap items-end gap-3">
            <DateRangeFilter de={de} ate={ate} />
            <PrintButton label="Imprimir Relatório" />
          </div>
        }
      />

      <Table>
        <THead>
          <tr>
            <TH>Grupo de Despesa (CEF)</TH>
            <TH className="text-right">% Ref. CEF</TH>
            <TH className="text-right">Orçado</TH>
            <TH className="text-right">Realizado</TH>
            <TH className="text-right">% Físico</TH>
          </tr>
        </THead>
        <tbody>
          {rows.map((r) => (
            <TR key={r.g.id}>
              <TD className="font-medium text-[var(--color-ink)]">
                <span className="font-[family-name:var(--font-mono)] text-[var(--color-accent)]">
                  {r.g.id}
                </span>{" "}
                {r.g.nome}
              </TD>
              <TD className="text-right font-[family-name:var(--font-mono)] text-[var(--color-ink3)]">
                {r.pctRef.toFixed(2)}%
              </TD>
              <TD className="text-right font-[family-name:var(--font-mono)]">
                {r.orcado > 0 ? brl0(r.orcado) : "—"}
              </TD>
              <TD className="text-right font-[family-name:var(--font-mono)]">
                {r.realizado > 0 ? brl0(r.realizado) : "—"}
              </TD>
              <TD className="text-right font-[family-name:var(--font-mono)] font-medium text-[var(--color-ink)]">
                {r.pctFisico.toFixed(1)}%
              </TD>
            </TR>
          ))}
          <TR>
            <TD className="font-semibold text-[var(--color-ink)]">Total</TD>
            <TD className="text-right font-[family-name:var(--font-mono)]">
              100%
            </TD>
            <TD className="text-right font-[family-name:var(--font-mono)] font-semibold">
              {brl0(totOrc)}
            </TD>
            <TD className="text-right font-[family-name:var(--font-mono)] font-semibold">
              {brl0(totReal)}
            </TD>
            <TD className="text-right font-[family-name:var(--font-mono)] font-semibold">
              {totPct.toFixed(1)}%
            </TD>
          </TR>
        </tbody>
      </Table>

      <p className="mt-4 text-xs text-[var(--color-ink3)]">
        <strong>Orçado</strong> importado do lançamento simplificado da versão{" "}
        <strong>Budget</strong> (despesas por grupo do plano de contas).{" "}
        <strong>Realizado</strong> importado do{" "}
        <strong>Lançamento de Medição</strong> da versão <strong>Atual</strong>.
        Use <strong>Imprimir Relatório</strong> para gerar a versão formatada
        (FRE / Cronograma CEF).
      </p>
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

### `src/components/app/print-button.tsx`

`PrintButton` inteiro — **as onze linhas**. Ver (f).

```tsx
"use client";

import { Button } from "@/components/ui/button";

export function PrintButton({ label = "Imprimir" }: { label?: string }) {
  return (
    <Button variant="outline" onClick={() => window.print()}>
      {label}
    </Button>
  );
}
```

### `src/components/app/date-range-filter.tsx`

`DateRangeFilter` — os campos Data inicial / Data final.

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

---

## 3. As funções de `queries.ts`


São **duas**, e só duas.

### `src/lib/queries.ts` · linhas 725–731

`getBudgetLines` — **a origem do orçado**.

```ts
/** Lançamentos simplificados (Budget/Forecast) de uma versão. */
export async function getBudgetLines(versionId: string): Promise<BudgetLineRow[]> {
  return db
    .select()
    .from(schema.budgetLines)
    .where(eq(schema.budgetLines.versionId, versionId));
}
```

### `src/lib/queries.ts` · linhas 1090–1098

`MedicaoRow` e `getMedicoes` — **a origem do realizado**.

```ts
export type MedicaoRow = typeof schema.medicoes.$inferSelect;

export async function getMedicoes(versionId: string): Promise<MedicaoRow[]> {
  return db
    .select()
    .from(schema.medicoes)
    .where(eq(schema.medicoes.versionId, versionId))
    .orderBy(asc(schema.medicoes.competencia), asc(schema.medicoes.grupoCode));
}
```

---

## 4. `src/lib/calc/medicao-bdi.ts` inteiro


> **Este módulo NÃO é usado por `/medicao`.** A tela não o importa
> (`page.tsx:1–8`). Ele é consumido por `getIndicadoresObra`
> (`queries.ts:1928–1946`), que alimenta o painel de indicadores do
> **Dashboard**. Colo na íntegra por pedido explícito.

### `src/lib/calc/medicao-bdi.ts`

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

## 5. `PCT_REF_CEF` e `PLANO_CONTAS.obra`

### `src/lib/calc/constants.ts` · linhas 309–315

`PCT_REF_CEF` — a constante inteira, com o comentário.

```ts
/**
 * Percentuais de referência CEF por grupo de obra (alinhados a PLANO_CONTAS.obra,
 * grupos 1..10). Usados na Medição de Obra para o orçado. Ver docs/SPEC.md §9.7.
 */
export const PCT_REF_CEF = [
  11.79, 5.74, 32.21, 16.05, 1.09, 14.75, 0.33, 17.23, 0.46, 0.01,
];
```

### `src/lib/calc/constants.ts` · linhas 20–130

`PLANO_CONTAS.obra` — os dez grupos e seus subitens.

```ts
export const PLANO_CONTAS: {
  obra: ChartGroup[];
  complementar: ChartGroup[];
} = {
  obra: [
    {
      id: "1",
      nome: "Serviços Preliminares Gerais",
      sub: [
        { id: "1.1", nome: "Serviços técnicos (projetos, sondagem, licenças)" },
        { id: "1.2", nome: "Instalações e canteiros" },
        { id: "1.3", nome: "Ligações provisórias" },
        { id: "1.4", nome: "Manutenção canteiro/consumo" },
        { id: "1.5", nome: "Transportes máquinas e equipamentos" },
        { id: "1.6", nome: "Controle tecnológico" },
        { id: "1.7", nome: "Gestão de resíduos" },
        { id: "1.8", nome: "Gestão da qualidade" },
        { id: "1.9", nome: "Equipamentos de proteção coletivos" },
        { id: "1.10", nome: "Administração local (engenheiros, mestres)" },
      ],
    },
    {
      id: "2",
      nome: "Fundações e Contenções",
      sub: [
        { id: "2.1", nome: "Fundações" },
        { id: "2.2", nome: "Contenções/arrimos especiais" },
      ],
    },
    {
      id: "3",
      nome: "Supraestrutura",
      sub: [
        { id: "3.1", nome: "Estrutura de concreto" },
        { id: "3.2", nome: "Estrutura metálica" },
        { id: "3.3", nome: "Pré-moldados" },
      ],
    },
    {
      id: "4",
      nome: "Paredes e Painéis",
      sub: [
        { id: "4.1", nome: "Alvenaria/fechamentos" },
        { id: "4.2", nome: "Esquadrias metálicas" },
        { id: "4.3", nome: "Esquadrias de madeira" },
        { id: "4.4", nome: "Vidros/esquadrias especiais" },
      ],
    },
    {
      id: "5",
      nome: "Cobertura e Proteções",
      sub: [
        { id: "5.1", nome: "Telhados" },
        { id: "5.2", nome: "Impermeabilizações" },
      ],
    },
    {
      id: "6",
      nome: "Revestimentos",
      sub: [
        { id: "6.1", nome: "Revestimentos internos" },
        { id: "6.2", nome: "Azulejos" },
        { id: "6.3", nome: "Revestimentos externos" },
        { id: "6.4", nome: "Forros" },
        { id: "6.5", nome: "Pinturas" },
      ],
    },
    {
      id: "7",
      nome: "Pavimentação",
      sub: [
        { id: "7.1", nome: "Cerâmica" },
        { id: "7.2", nome: "Cimentados" },
        { id: "7.3", nome: "Rodapés, soleiras, peitoris" },
      ],
    },
    {
      id: "8",
      nome: "Instalações",
      sub: [
        { id: "8.1", nome: "Elétricas/telefônicas" },
        { id: "8.2", nome: "Hidráulicas/gás/incêndio" },
        { id: "8.3", nome: "Sanitárias/pluvial" },
        { id: "8.4", nome: "Aparelhos, metais e bancadas" },
        { id: "8.5", nome: "Elevadores/bombas" },
        { id: "8.6", nome: "Lógica/automação" },
      ],
    },
    {
      id: "9",
      nome: "Complementações",
      sub: [
        { id: "9.1", nome: "Calafete/limpeza" },
        { id: "9.2", nome: "Ligações definitivas" },
        { id: "9.3", nome: "Outros acabamentos" },
      ],
    },
    {
      id: "10",
      nome: "Infraestrutura e Urbanização",
      sub: [
        { id: "10.1", nome: "Terraplenagem" },
        { id: "10.2", nome: "Água potável" },
        { id: "10.3", nome: "Esgoto sanitário" },
        { id: "10.4", nome: "Drenagem pluvial" },
        { id: "10.5", nome: "Pavimentação externa" },
        { id: "10.6", nome: "Energia e iluminação" },
        { id: "10.7", nome: "Paisagismo e ambientação" },
      ],
    },
  ],
```

---

## 6. As tabelas envolvidas

### `src/lib/db/schema.ts` · linhas 1130–1146

`medicao` — a fonte do realizado.

```ts
export const medicoes = pgTable("medicao", {
  id: uuid("id").primaryKey().defaultRandom(),
  versionId: uuid("version_id")
    .notNull()
    .references(() => versions.id, { onDelete: "cascade" }),
  tenantId: uuid("tenant_id")
    .notNull()
    .references(() => tenants.id, { onDelete: "cascade" }),
  /** "MM/YYYY". */
  competencia: text("competencia").notNull(),
  /** código do grupo CEF (ex.: "1", "3"). */
  grupoCode: text("grupo_code").notNull(),
  grupoName: text("grupo_name").notNull(),
  valor: numeric("valor", { precision: 15, scale: 2 }).notNull().default("0"),
  obs: text("obs"),
  createdAt: timestamp("created_at", { mode: "date" }).notNull().defaultNow(),
});
```

### `src/lib/db/schema.ts` · linhas 1352–1385

`budget_line` — a fonte do orçado.

```ts
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

### `src/lib/db/schema.ts` · linhas 1073–1128

`servico` e `medicao_servico` — **não lidas por esta tela** (ver (i)).

```ts
/**
 * Medição de obra lançada pelo engenheiro, por competência (MM/YYYY) e grupo
 * de obra (CEF). A soma das medições alimenta o Custo Variável da DRE.
 */
/**
 * Catálogo de SERVIÇOS do projeto (orçamento de obra). Cada serviço tem um
 * custo proposto; a incidência é derivada (custo ÷ custo total dos serviços) e
 * os limites mínimo/máximo permitem sinalizar quando a incidência está fora da
 * faixa aceitável. Ver docs/BDI-PROVISIONAMENTO.md §2.
 *
 * Tabela NOVA e independente: não altera nem substitui `medicao`, que continua
 * válida e em uso (Custo Variável da DRE).
 */
export const servicos = pgTable("servico", {
  id: uuid("id").primaryKey().defaultRandom(),
  tenantId: uuid("tenant_id")
    .notNull()
    .references(() => tenants.id, { onDelete: "cascade" }),
  projectId: uuid("project_id")
    .notNull()
    .references(() => projects.id, { onDelete: "cascade" }),
  /** ordem de exibição (1..N), como na planilha de referência. */
  ordem: integer("ordem").notNull().default(0),
  nome: text("nome").notNull(),
  custoProposto: numeric("custo_proposto", { precision: 15, scale: 2 })
    .notNull()
    .default("0"),
  /** faixa aceitável de incidência (%), opcional. */
  limiteMin: numeric("limite_min", { precision: 8, scale: 4 }),
  limiteMax: numeric("limite_max", { precision: 8, scale: 4 }),
  createdAt: timestamp("created_at", { mode: "date" }).notNull().defaultNow(),
});

/**
 * Medição de um serviço numa competência: o usuário informa APENAS o percentual
 * EXECUTADO ACUMULADO do serviço ao final do mês. A variação mensal e o valor
 * medido são derivados pelo sistema (nunca digitados) — ver
 * docs/BDI-PROVISIONAMENTO.md §4.
 */
export const medicaoServicos = pgTable("medicao_servico", {
  id: uuid("id").primaryKey().defaultRandom(),
  tenantId: uuid("tenant_id")
    .notNull()
    .references(() => tenants.id, { onDelete: "cascade" }),
  servicoId: uuid("servico_id")
    .notNull()
    .references(() => servicos.id, { onDelete: "cascade" }),
  /** "MM/YYYY". */
  competencia: text("competencia").notNull(),
  /** % executado ACUMULADO do serviço até o fim desta competência (0..100). */
  pctExecutadoAcum: numeric("pct_executado_acum", { precision: 8, scale: 4 })
    .notNull()
    .default("0"),
  obs: text("obs"),
  createdAt: timestamp("created_at", { mode: "date" }).notNull().defaultNow(),
});
```

---

## 7. As perguntas


### (a) `PCT_REF_CEF` é constante do sistema ou vem da obra?


**É uma constante única do sistema, hardcoded, sem nenhuma ligação com a
obra.**

```ts
/**
 * Percentuais de referência CEF por grupo de obra (alinhados a PLANO_CONTAS.obra,
 * grupos 1..10). Usados na Medição de Obra para o orçado. Ver docs/SPEC.md §9.7.
 */
export const PCT_REF_CEF = [
  11.79, 5.74, 32.21, 16.05, 1.09, 14.75, 0.33, 17.23, 0.46, 0.01,
];
```

(`constants.ts:309–315`.) É um array de dez números soltos, **posicional**: a
tela lê `PCT_REF_CEF[i]` onde `i` é o índice do grupo em `PLANO_CONTAS.obra`
(`page.tsx:65`). Não há chave, não há id de grupo — o vínculo é a ordem.

**Onde é usado:** dois lugares no repositório inteiro — a declaração e o
`page.tsx` da medição (import na linha 3, uso na linha 65). Nada mais.

**De onde os números vieram: o código não diz.** O comentário aponta para
`docs/SPEC.md §9.7`, mas a seção referida tem duas linhas e não menciona os
percentuais nem sua origem:

### `docs/SPEC.md` · linhas 261–262

A seção da SPEC que o comentário cita.

```md
### 9.7 Medição de Obra (imprimível CEF)
- Evolução por **grupo CEF**: orçado vs. realizado. Layout **imprimível** (`window.print()`) + exportar PDF — para envio à Caixa Econômica Federal (formulário FRE / Cronograma CEF).
```


O contexto imediato no arquivo é a única pista: a constante logo acima é
`CUSTO_EDIFICACOES_REF = 46789988.9`, rotulada *"(SIGNATURE SUARÃO)"*
(`constants.ts:306–307`) — o empreendimento-piloto. Os dez percentuais somam
**99,66**, não 100.

**Caminho para cadastrar a PLS de cada projeto: não existe.**

| Verificação | Resultado |
|---|---|
| Coluna em `project` para percentuais CEF | **não existe** — há `pct_bdi` e `pct_taxa_liberacao`, que são outra coisa |
| Tabela própria de PLS/percentuais de referência | **não existe** |
| Busca por `PLS` em `src/` e `docs/` | **zero ocorrências** |
| Tela, formulário ou action que grave esses percentuais | **nenhuma** |
| `PCT_REF_CEF` recebe parâmetro ou override | **não** — é `const` de módulo, lida direto |

Ou seja: **todos os projetos do sistema usam os mesmos dez percentuais**, e a
única forma de mudá-los é editar `constants.ts` e fazer deploy.

### `src/app/(app)/medicao/page.tsx` · linhas 60–66

O uso posicional — `PCT_REF_CEF[i]` indexado pela ordem do grupo.

```tsx
  const rows = PLANO_CONTAS.obra.map((g, i) => {
    // Orçado estritamente do Budget: grupo sem lançamento no Budget → zero.
    const orcado = orcadoPorGrupo.get(g.id) || 0;
    const realizado = realizadoPorGrupo.get(g.id) || 0;
    const pctFisico = orcado > 0 ? Math.min((realizado / orcado) * 100, 100) : 0;
    return { g, pctRef: PCT_REF_CEF[i], orcado, realizado, pctFisico };
  });
```

### (b) Como a tela resolve projeto e versão Budget


O trecho inteiro (`page.tsx:26–38`):

```ts
// Fontes dos dados:
//  - Orçado  → lançamento simplificado da versão Budget (despesas por grupo CEF).
//  - Realizado → lançamento de medição da versão Atual (medições por grupo).
const budgetV = ctx.versions.find((v) => v.kind === "budget");
const atualV =
  ctx.versions.find((v) => v.kind === "atual") ??
  ctx.versions.find((v) => v.isDefault) ??
  ctx.version;

const [budgetLines, medicoes] = await Promise.all([
  budgetV ? getBudgetLines(budgetV.id) : Promise.resolve([]),
  getMedicoes(atualV.id),
]);
```

**Projeto: não há resolução nenhuma.** A tela **não tem seletor de projeto** —
nem `ProjectPicker`, nem `?proj=`. Ela usa implicitamente o projeto ativo da
sessão, porque `ctx.versions` são as versões dele. O nome exibido é
`ctx.project.name` (`page.tsx:74`).

| Fallback de projeto | Existe? |
|---|---|
| `?proj=` | **não** |
| `ctx.project` | **sim**, implícito — é a única fonte |
| `ctx.projects[0]` | **não** |
| cookie | só indiretamente, via `getActiveContext` |

**Versão Budget: `find(v => v.kind === "budget")`, sem fallback.** Se o
projeto não tiver versão Budget, `budgetV` é `undefined` e a tela passa
`Promise.resolve([])` — **o orçado inteiro vira zero, em silêncio**. Não há
aviso na interface.

**Versão Atual (do realizado): três fallbacks** — `kind === "atual"` →
`isDefault` → `ctx.version`.

**Se houver dois orçamentos no projeto: entra o primeiro que o `find`
encontrar.** `Array.prototype.find` devolve o primeiro elemento que satisfaz o
predicado, na ordem de `ctx.versions`. Não há desempate por `isDefault`, por
`createdAt`, por `status` nem por seletor — e a tela não informa qual foi
escolhida (o rótulo mostra `budgetV?.label`, `page.tsx:74`, mas sem indicar
que havia outra).

A ordem de `ctx.versions` vem de `getActiveContext`; não é decidida aqui.

### `src/app/(app)/medicao/page.tsx` · linhas 12–38

O guard, a resolução de versões e as duas consultas.

```tsx
export default async function MedicaoPage({
  searchParams,
}: {
  searchParams: Promise<{ de?: string; ate?: string }>;
}) {
  const ctx = await getActiveContext();
  if (!ctx) return null;

  const sp = await searchParams;
  const de = sp.de ?? "";
  const ate = sp.ate ?? "";
  const hasRange = !!(de || ate);
  const inRange = (mm: string | null) => !hasRange || monthInRange(mm, de, ate);

  // Fontes dos dados:
  //  - Orçado  → lançamento simplificado da versão Budget (despesas por grupo CEF).
  //  - Realizado → lançamento de medição da versão Atual (medições por grupo).
  const budgetV = ctx.versions.find((v) => v.kind === "budget");
  const atualV =
    ctx.versions.find((v) => v.kind === "atual") ??
    ctx.versions.find((v) => v.isDefault) ??
    ctx.version;

  const [budgetLines, medicoes] = await Promise.all([
    budgetV ? getBudgetLines(budgetV.id) : Promise.resolve([]),
    getMedicoes(atualV.id),
  ]);
```

### (c) O realizado — tabela e coluna de data


**Tabela `medicao`. A coluna de data é `competencia` (`"MM/YYYY"`).**

A consulta (`queries.ts:1092–1098`):

```ts
export async function getMedicoes(versionId: string): Promise<MedicaoRow[]> {
  return db
    .select()
    .from(schema.medicoes)
    .where(eq(schema.medicoes.versionId, versionId))
    .orderBy(asc(schema.medicoes.competencia), asc(schema.medicoes.grupoCode));
}
```

Um `where` de uma condição — `version_id`. **Sem `tenant_id`**, sem filtro de
data, sem `limit`.

E o consumo (`page.tsx:50–58`):

```ts
const realizadoPorGrupo = new Map<string, number>();
for (const m of medicoes) {
  if (!inRange(m.competencia)) continue;
  realizadoPorGrupo.set(
    m.grupoCode,
    (realizadoPorGrupo.get(m.grupoCode) || 0) + Number(m.valor),
  );
}
```

A coluna de agregação é **`grupo_code`**, e a de data é **`competencia`**,
filtrada por `inRange` — que é `monthInRange` (`page.tsx:24`). A tabela
`medicao` **não tem coluna `data`**: as suas colunas de tempo são
`competencia` (`text`, `"MM/YYYY"`) e `created_at` (`timestamp`), e esta
última não é lida.

### `src/lib/db/schema.ts` · linhas 1130–1146

`medicao` — todas as colunas.

```ts
export const medicoes = pgTable("medicao", {
  id: uuid("id").primaryKey().defaultRandom(),
  versionId: uuid("version_id")
    .notNull()
    .references(() => versions.id, { onDelete: "cascade" }),
  tenantId: uuid("tenant_id")
    .notNull()
    .references(() => tenants.id, { onDelete: "cascade" }),
  /** "MM/YYYY". */
  competencia: text("competencia").notNull(),
  /** código do grupo CEF (ex.: "1", "3"). */
  grupoCode: text("grupo_code").notNull(),
  grupoName: text("grupo_name").notNull(),
  valor: numeric("valor", { precision: 15, scale: 2 }).notNull().default("0"),
  obs: text("obs"),
  createdAt: timestamp("created_at", { mode: "date" }).notNull().defaultNow(),
});
```

### `src/app/(app)/medicao/page.tsx` · linhas 40–58

A agregação do orçado e do realizado, lado a lado.

```tsx
  // Orçado por grupo de obra (prefixo antes do primeiro ponto do rowKey/CEF).
  // Vem exclusivamente do lançamento do Budget: se o grupo estiver zerado no
  // Budget, o orçado aqui também é zero (sem estimativa de referência).
  const orcadoPorGrupo = new Map<string, number>();
  for (const l of budgetLines) {
    if (l.kind !== "despesa" || !inRange(l.mes)) continue;
    const grp = (l.rowKey ?? "").split(".")[0];
    orcadoPorGrupo.set(grp, (orcadoPorGrupo.get(grp) || 0) + Number(l.valor));
  }

  // Realizado por grupo de obra a partir das medições lançadas (versão Atual).
  const realizadoPorGrupo = new Map<string, number>();
  for (const m of medicoes) {
    if (!inRange(m.competencia)) continue;
    realizadoPorGrupo.set(
      m.grupoCode,
      (realizadoPorGrupo.get(m.grupoCode) || 0) + Number(m.valor),
    );
  }
```

### (d) O que Data inicial / Data final filtram


**Recortam os DOIS — orçado e realizado — pela mesma função, mas por colunas
diferentes.**

O filtro é montado uma vez (`page.tsx:20–24`):

```ts
const de = sp.de ?? "";
const ate = sp.ate ?? "";
const hasRange = !!(de || ate);
const inRange = (mm: string | null) => !hasRange || monthInRange(mm, de, ate);
```

e aplicado nos dois laços:

| Lado | Linha | Coluna filtrada | Formato |
|---|---|---|---|
| Orçado | `page.tsx:45` | `budget_line.mes` | `"MM/YYYY"` |
| Realizado | `page.tsx:53` | `medicao.competencia` | `"MM/YYYY"` |

Três pontos que saem desse desenho:

- **`hasRange` liga o filtro com UM campo só.** `!!(de || ate)` — preencher
  apenas a data inicial já recorta os dois lados.
- **O recorte é por mês, não por dia.** `monthInRange` usa `ym`, que aceita
  `"MM/DD/YYYY"` (o que o `DateField` emite) e **descarta o dia**
  (`utils.ts:102–113`). Escolher 15/03 ou 31/03 dá o mesmo resultado.
- **Linha sem competência é EXCLUÍDA quando há recorte.** `monthInRange(null,
  …)` devolve `false` se houver qualquer limite. Sem recorte, `inRange`
  curto-circuita em `!hasRange` e tudo entra.

Sobre o relatório CEF ser acumulado por natureza: o código **não trata isso**.
Não há modo "acumulado" nem opção de ignorar o período — o mesmo filtro corta
os dois lados sempre que houver data preenchida.

### `src/app/(app)/medicao/page.tsx` · linhas 18–38

A montagem do `inRange`.

```tsx
  if (!ctx) return null;

  const sp = await searchParams;
  const de = sp.de ?? "";
  const ate = sp.ate ?? "";
  const hasRange = !!(de || ate);
  const inRange = (mm: string | null) => !hasRange || monthInRange(mm, de, ate);

  // Fontes dos dados:
  //  - Orçado  → lançamento simplificado da versão Budget (despesas por grupo CEF).
  //  - Realizado → lançamento de medição da versão Atual (medições por grupo).
  const budgetV = ctx.versions.find((v) => v.kind === "budget");
  const atualV =
    ctx.versions.find((v) => v.kind === "atual") ??
    ctx.versions.find((v) => v.isDefault) ??
    ctx.version;

  const [budgetLines, medicoes] = await Promise.all([
    budgetV ? getBudgetLines(budgetV.id) : Promise.resolve([]),
    getMedicoes(atualV.id),
  ]);
```

### `src/lib/utils.ts` · linhas 130–142

`monthInRange`.

```ts
/** Verdadeiro se o MÊS "MM/YYYY" está no intervalo [de, ate] (por competência). */
export function monthInRange(
  mes: string | null | undefined,
  de: string,
  ate: string,
): boolean {
  const v = ym(mes);
  const lo = ym(de);
  const hi = ym(ate);
  if (lo != null && (v == null || v < lo)) return false;
  if (hi != null && (v == null || v > hi)) return false;
  return true;
}
```

### (e) O JSX das células e da linha Total


### `src/app/(app)/medicao/page.tsx` · linhas 95–133

O corpo da tabela — as quatro células de dados e a linha Total.

```tsx
        <tbody>
          {rows.map((r) => (
            <TR key={r.g.id}>
              <TD className="font-medium text-[var(--color-ink)]">
                <span className="font-[family-name:var(--font-mono)] text-[var(--color-accent)]">
                  {r.g.id}
                </span>{" "}
                {r.g.nome}
              </TD>
              <TD className="text-right font-[family-name:var(--font-mono)] text-[var(--color-ink3)]">
                {r.pctRef.toFixed(2)}%
              </TD>
              <TD className="text-right font-[family-name:var(--font-mono)]">
                {r.orcado > 0 ? brl0(r.orcado) : "—"}
              </TD>
              <TD className="text-right font-[family-name:var(--font-mono)]">
                {r.realizado > 0 ? brl0(r.realizado) : "—"}
              </TD>
              <TD className="text-right font-[family-name:var(--font-mono)] font-medium text-[var(--color-ink)]">
                {r.pctFisico.toFixed(1)}%
              </TD>
            </TR>
          ))}
          <TR>
            <TD className="font-semibold text-[var(--color-ink)]">Total</TD>
            <TD className="text-right font-[family-name:var(--font-mono)]">
              100%
            </TD>
            <TD className="text-right font-[family-name:var(--font-mono)] font-semibold">
              {brl0(totOrc)}
            </TD>
            <TD className="text-right font-[family-name:var(--font-mono)] font-semibold">
              {brl0(totReal)}
            </TD>
            <TD className="text-right font-[family-name:var(--font-mono)] font-semibold">
              {totPct.toFixed(1)}%
            </TD>
          </TR>
        </tbody>
```


**Por que a mesma ausência vira três coisas diferentes:**

| Célula | Expressão | Ausência |
|---|---|---|
| % Ref. CEF | `{r.pctRef.toFixed(2)}%` | não se aplica — vem da constante |
| Orçado | `{r.orcado > 0 ? brl0(r.orcado) : "—"}` | **`—`** |
| Realizado | `{r.realizado > 0 ? brl0(r.realizado) : "—"}` | **`—`** |
| % Físico | `{r.pctFisico.toFixed(1)}%` | **`0.0%`** |
| Total — Orçado | `{brl0(totOrc)}` | **`R$ 0`** |
| Total — Realizado | `{brl0(totReal)}` | **`R$ 0`** |
| Total — % Físico | `{totPct.toFixed(1)}%` | `0.0%` |

São **três tratamentos distintos** para o mesmo zero:

1. **Células de valor das linhas** têm guarda `> 0` e caem em `"—"`.
2. **A célula de % Físico não tem guarda** — `pctFisico` já foi calculado como
   `0` quando `orcado <= 0` (`page.tsx:64`), e `toFixed(1)` o imprime como
   `0.0%`.
3. **As células da linha Total não têm guarda** — `brl0(0)` é `R$ 0`.

Duas observações de formatação:

- O `%` das linhas usa `toFixed(1)` e o de referência `toFixed(2)` — **ponto
  decimal, não vírgula**. É o único lugar da tela que não passa por `brl0`, e
  por isso foge da formatação pt-BR do resto do app.
- A coluna `% Ref. CEF` da linha Total é a string literal `"100%"`
  (`page.tsx:120–122`), não a soma dos percentuais — que dá **99,66**.

### (f) O que o "Imprimir Relatório" gera


**Chama `window.print()`. Só isso.**

### `src/components/app/print-button.tsx`

O componente inteiro — onze linhas.

```tsx
"use client";

import { Button } from "@/components/ui/button";

export function PrintButton({ label = "Imprimir" }: { label?: string }) {
  return (
    <Button variant="outline" onClick={() => window.print()}>
      {label}
    </Button>
  );
}
```


**Não existe layout de impressão.** Verificado em quatro frentes:

| Verificação | Resultado |
|---|---|
| `@media print` em qualquer `.css` | **zero ocorrências** |
| `print` em `src/app/globals.css` | **zero ocorrências** |
| Variante Tailwind `print:` no repositório | **uma**, em `balanco-dia-table.tsx:83` (`print:hidden`) — outra tela |
| Componente ou rota de layout para impressão | **não existe** |

O único arquivo CSS do projeto é `src/app/globals.css`, e ele não tem nada de
impressão. O que o navegador imprime é **a página como está na tela** — com
menu lateral, cabeçalho do app e o próprio botão "Imprimir Relatório".

**Os números impressos vêm da mesma consulta?** Sim, por construção: não há
segunda consulta nem rota alternativa. `window.print()` imprime o DOM já
renderizado — são literalmente os mesmos nós.

**Cabeçalho com dados da obra, CNPJ, contrato, responsável técnico: não
existe.** O que a tela tem é o `PageHeader` (`page.tsx:73–83`):

### `src/app/(app)/medicao/page.tsx` · linhas 71–84

O cabeçalho da tela — tudo o que sairia impresso como identificação.

```tsx
  return (
    <>
      <PageHeader
        eyebrow={`${ctx.project.name} · Orçado ${budgetV?.label ?? "Budget"} · Realizado ${atualV.label}`}
        title="Medição de Obra — Relatório CEF"
        subtitle="Orçado: lançamento do Budget · Realizado: lançamento de medição (versão Atual)"
        actions={
          <div className="flex flex-wrap items-end gap-3">
            <DateRangeFilter de={de} ate={ate} />
            <PrintButton label="Imprimir Relatório" />
          </div>
        }
      />
```


| Campo do formulário CEF | Está na tela? | Onde estaria no banco |
|---|---|---|
| Nome da obra | **sim** — `ctx.project.name` no `eyebrow` | `project.name` |
| CNPJ | **não** | `tenant.cnpj` |
| Nº do contrato / matrícula CNO-CEI | **não** | `project.codigo_obra` |
| Responsável técnico / ART | **não** | `project.art` |
| Município da obra | **não** | `project.municipio_obra`, `uf_obra` |
| Período de medição | parcial — só no `subtitle`, sem as datas | — |
| Assinaturas | **não** | — |

As colunas existem no schema (`schema.ts:289–296`), mas **a tela não as lê**:
`page.tsx` não importa `getActiveContext().tenant.cnpj` nem toca em
`codigo_obra`, `art`, `municipio_obra`.

A SPEC descreve a intenção — *"Layout imprimível (`window.print()`) + exportar
PDF — para envio à Caixa Econômica Federal (formulário FRE / Cronograma
CEF)"* (`SPEC.md:262`) — e o texto de rodapé da tela repete
(`page.tsx:136–143`). O `window.print()` está implementado; o layout e a
exportação para PDF, não.

### `src/app/(app)/medicao/page.tsx` · linhas 134–144

O rodapé que menciona o FRE / Cronograma CEF.

```tsx
      </Table>

      <p className="mt-4 text-xs text-[var(--color-ink3)]">
        <strong>Orçado</strong> importado do lançamento simplificado da versão{" "}
        <strong>Budget</strong> (despesas por grupo do plano de contas).{" "}
        <strong>Realizado</strong> importado do{" "}
        <strong>Lançamento de Medição</strong> da versão <strong>Atual</strong>.
        Use <strong>Imprimir Relatório</strong> para gerar a versão formatada
        (FRE / Cronograma CEF).
      </p>
    </>
```

### (g) Permissão


**A tela NÃO chama `can`.** O guard inteiro são duas linhas
(`page.tsx:17–18`):

```tsx
const ctx = await getActiveContext();
if (!ctx) return null;
```

Não importa `can` nem `AccessDenied`.

| Pergunta | Resposta |
|---|---|
| Chama `can(ctx.perms, "medicao", "ver")`? | **não** |
| `"medicao"` está em `SCREENS`? | **sim** — `permissions.ts:44` |
| Está em `CONTADOR_VE`? | **sim** — `permissions.ts:87` |

Como `"medicao"` está em `SCREENS`, o enforcement central do layout cobre a
rota (`layout.tsx:94–95`), **no servidor**, antes de a página renderizar.

Note a distinção de ids: `medicao` (este relatório, módulo Reports) e
`medicaolanc` (a tela de lançamento, módulo Despesas, `permissions.ts:51`)
são telas governadas **separadamente**. Um contador vê `medicao` e não vê
`medicaolanc`.

### `src/lib/permissions.ts` · linhas 41–46

`medicao` em `SCREENS`.

```ts
  { id: "balancodia", label: "Balanço do Dia", modulo: "Reports" },
  { id: "dre", label: "DRE", modulo: "Reports" },
  { id: "fluxocaixa", label: "Fluxo de Caixa", modulo: "Reports" },
  { id: "medicao", label: "Medição de Obra", modulo: "Reports" },
  { id: "resumo", label: "Resumo Executivo", modulo: "Reports" },
  { id: "unidades", label: "Unidades / Dados de Venda", modulo: "Receitas" },
```

### `src/lib/permissions.ts` · linhas 83–93

`CONTADOR_VE` — inclui `medicao`.

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

### (h) `tenant_id` no where, linha a linha


São **duas** consultas, e **nenhuma** tem `tenant_id`.

| # | Função | Linha | Tabela | Tenant no WHERE? | O que há no WHERE |
|---|---|---|---|---|---|
| 1 | `getBudgetLines` | `queries.ts:730` | `budget_line` | **NÃO** | `eq(budgetLines.versionId, versionId)` |
| 2 | `getMedicoes` | `queries.ts:1096` | `medicao` | **NÃO** | `eq(medicoes.versionId, versionId)` |

Nas duas, o isolamento é indireto: `version_id` é UUID e vem de
`ctx.versions`, que `getActiveContext` já resolveu dentro do tenant. **Não há
filtro de tenant aplicado depois em JavaScript** — a garantia é só pelo id.

As duas tabelas **têm** a coluna `tenant_id` no schema
(`budget_line`, `medicao`) — ela simplesmente não é usada nestas consultas.

A página não faz nenhuma consulta inline: não importa `db` nem `schema`
(`page.tsx:1–8`).

### `src/lib/queries.ts` · linhas 725–731

`getBudgetLines`.

```ts
/** Lançamentos simplificados (Budget/Forecast) de uma versão. */
export async function getBudgetLines(versionId: string): Promise<BudgetLineRow[]> {
  return db
    .select()
    .from(schema.budgetLines)
    .where(eq(schema.budgetLines.versionId, versionId));
}
```

### `src/lib/queries.ts` · linhas 1092–1098

`getMedicoes`.

```ts
export async function getMedicoes(versionId: string): Promise<MedicaoRow[]> {
  return db
    .select()
    .from(schema.medicoes)
    .where(eq(schema.medicoes.versionId, versionId))
    .orderBy(asc(schema.medicoes.competencia), asc(schema.medicoes.grupoCode));
}
```

### (i) A tela lê `version.status`, `medicao_servico` ou `servico`?


**Nenhum dos três.**

| Objeto | A tela lê? | Quem lê |
|---|---|---|
| `version.status` | **não** | só `getProjectVersionsByKind` (`queries.ts:711`), que esta tela não chama |
| `version.kind` | **sim** | `page.tsx:29` e `:31` — `find(v => v.kind === …)` |
| `version.isDefault` | **sim** | `page.tsx:32` — fallback |
| `servico` | **não** | `getIndicadoresObra` (`queries.ts:1898–1900`) → Dashboard |
| `medicao_servico` | **não** | `getIndicadoresObra` (`queries.ts:1906–1908`) → Dashboard |

Esta é a distinção que vale registrar: **há duas medições no sistema, em
tabelas independentes.**

| | `medicao` (esta tela) | `medicao_servico` (Dashboard) |
|---|---|---|
| Granularidade | grupo CEF | serviço |
| O usuário informa | um **valor em R$** | um **% executado acumulado** |
| Escopo | `version_id` | `tenant_id` + `servico_id` → `project_id` |
| Quem grava | `addMedicao` / `updateMedicao` / `deleteMedicao` | **ninguém** |
| Quem lê | `getMedicoes` → `/medicao` e `/medicaolanc` | `getIndicadoresObra` → Dashboard |

O próprio schema registra a independência (`schema.ts:1083–1084`): *"Tabela
NOVA e independente: não altera nem substitui `medicao`, que continua válida e
em uso"*. E como `medicao_servico` não tem escrita em lugar nenhum do
repositório, os indicadores de evolução física do Dashboard ficam zerados —
enquanto esta tela mostra o realizado normalmente.

### `src/lib/db/schema.ts` · linhas 1073–1128

Os comentários e as duas tabelas do outro modelo de medição.

```ts
/**
 * Medição de obra lançada pelo engenheiro, por competência (MM/YYYY) e grupo
 * de obra (CEF). A soma das medições alimenta o Custo Variável da DRE.
 */
/**
 * Catálogo de SERVIÇOS do projeto (orçamento de obra). Cada serviço tem um
 * custo proposto; a incidência é derivada (custo ÷ custo total dos serviços) e
 * os limites mínimo/máximo permitem sinalizar quando a incidência está fora da
 * faixa aceitável. Ver docs/BDI-PROVISIONAMENTO.md §2.
 *
 * Tabela NOVA e independente: não altera nem substitui `medicao`, que continua
 * válida e em uso (Custo Variável da DRE).
 */
export const servicos = pgTable("servico", {
  id: uuid("id").primaryKey().defaultRandom(),
  tenantId: uuid("tenant_id")
    .notNull()
    .references(() => tenants.id, { onDelete: "cascade" }),
  projectId: uuid("project_id")
    .notNull()
    .references(() => projects.id, { onDelete: "cascade" }),
  /** ordem de exibição (1..N), como na planilha de referência. */
  ordem: integer("ordem").notNull().default(0),
  nome: text("nome").notNull(),
  custoProposto: numeric("custo_proposto", { precision: 15, scale: 2 })
    .notNull()
    .default("0"),
  /** faixa aceitável de incidência (%), opcional. */
  limiteMin: numeric("limite_min", { precision: 8, scale: 4 }),
  limiteMax: numeric("limite_max", { precision: 8, scale: 4 }),
  createdAt: timestamp("created_at", { mode: "date" }).notNull().defaultNow(),
});

/**
 * Medição de um serviço numa competência: o usuário informa APENAS o percentual
 * EXECUTADO ACUMULADO do serviço ao final do mês. A variação mensal e o valor
 * medido são derivados pelo sistema (nunca digitados) — ver
 * docs/BDI-PROVISIONAMENTO.md §4.
 */
export const medicaoServicos = pgTable("medicao_servico", {
  id: uuid("id").primaryKey().defaultRandom(),
  tenantId: uuid("tenant_id")
    .notNull()
    .references(() => tenants.id, { onDelete: "cascade" }),
  servicoId: uuid("servico_id")
    .notNull()
    .references(() => servicos.id, { onDelete: "cascade" }),
  /** "MM/YYYY". */
  competencia: text("competencia").notNull(),
  /** % executado ACUMULADO do serviço até o fim desta competência (0..100). */
  pctExecutadoAcum: numeric("pct_executado_acum", { precision: 8, scale: 4 })
    .notNull()
    .default("0"),
  obs: text("obs"),
  createdAt: timestamp("created_at", { mode: "date" }).notNull().defaultNow(),
});
```

### (j) O `Math.min` das linhas e a sua ausência no total


**As duas expressões, lado a lado:**

```ts
// Linha (page.tsx:64)
const pctFisico = orcado > 0 ? Math.min((realizado / orcado) * 100, 100) : 0;

// Total (page.tsx:69)
const totPct = totOrc > 0 ? (totReal / totOrc) * 100 : 0;
```

A linha tem `Math.min(…, 100)`; o total **não tem**. As duas têm o mesmo
guard de denominador (`> 0 ? … : 0`).

**Consequências mecânicas:**

- Um grupo com realizado acima do orçado exibe **100,0%** — o excesso é
  invisível na linha.
- A linha Total **pode passar de 100%**, porque soma os valores brutos
  (`totOrc`/`totReal`, `page.tsx:67–68`) e divide sem teto.
- Por isso **o Total não é a soma nem a média dos percentuais das linhas**:
  é uma razão independente, calculada sobre os totais. Um grupo estourado que
  aparece como 100% na linha continua puxando o Total para cima.
- Grupo com `orcado = 0` e realizado positivo exibe **0,0%**, não 100% —
  o guard do denominador vem antes do `Math.min`.

**Por que o total não o tem: o código não diz.** Não há comentário nas linhas
64 ou 69, nem em nenhum lugar do arquivo, explicando a assimetria. Registro o
que está escrito, sem inferir intenção.

### `src/app/(app)/medicao/page.tsx` · linhas 59–70

As duas expressões no contexto — o `map` das linhas e os três totais.

```tsx

  const rows = PLANO_CONTAS.obra.map((g, i) => {
    // Orçado estritamente do Budget: grupo sem lançamento no Budget → zero.
    const orcado = orcadoPorGrupo.get(g.id) || 0;
    const realizado = realizadoPorGrupo.get(g.id) || 0;
    const pctFisico = orcado > 0 ? Math.min((realizado / orcado) * 100, 100) : 0;
    return { g, pctRef: PCT_REF_CEF[i], orcado, realizado, pctFisico };
  });
  const totOrc = rows.reduce((a, r) => a + r.orcado, 0);
  const totReal = rows.reduce((a, r) => a + r.realizado, 0);
  const totPct = totOrc > 0 ? (totReal / totOrc) * 100 : 0;
```
