# TELA-simulador — código na íntegra

Coleta do código da tela **Simulador de Unidade** (`/simulador`), em `main`
(commit `45f4ce3`). Sem resumo, sem análise.

**Árvore de dependências própria:**

```
simulador/page.tsx
├── components/app/page-header.tsx
└── components/app/simulator-form.tsx
    (não importa nenhum outro componente de components/app/)

query chamada:      getInccRows
server actions:     NENHUMA — ver seção 4
matemática:         lib/calc/simulator.ts · lib/calc/incc.ts
```

Ficam de fora os primitivos de `components/ui/` (`card`, `input`, `badge`,
`table`) e `@/lib/context`, `@/lib/utils`.

---

## 1. Página

### `src/app/(app)/simulador/page.tsx`

```tsx
import { getActiveContext } from "@/lib/context";
import { getInccRows } from "@/lib/queries";
import { PageHeader } from "@/components/app/page-header";
import { SimulatorForm } from "@/components/app/simulator-form";

export const dynamic = "force-dynamic";

export default async function SimuladorPage() {
  const ctx = await getActiveContext();
  if (!ctx) return null;
  const incc = await getInccRows(ctx.project.id);

  return (
    <>
      <PageHeader
        eyebrow={ctx.project.name}
        title="Simulador de Unidade"
        subtitle="SAC / PRICE / SBPE · fluxo de 36 meses com correção INCC"
      />
      <SimulatorForm incc={incc} />
    </>
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

### `src/components/app/simulator-form.tsx`

Único componente próprio de peso da tela. Não importa nenhum outro de `components/app/`.

```tsx
"use client";

import { useMemo, useState } from "react";
import { simulate, type FinancingType, type InccRow } from "@/lib/calc";
import { brl0 } from "@/lib/utils";
import { Card, CardContent } from "@/components/ui/card";
import { Input, Label, Select } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Table, THead, TH, TR, TD } from "@/components/ui/table";

const num = (v: string) => (v === "" ? 0 : Number(v));

export function SimulatorForm({ incc }: { incc: InccRow[] }) {
  const [tipo, setTipo] = useState<FinancingType>("SAC");
  const [valorImovel, setValorImovel] = useState("537027");
  const [entrada, setEntrada] = useState("30000");
  const [s1, setS1] = useState("3000");
  const [s2, setS2] = useState("3000");
  const [s3, setS3] = useState("3000");
  const [anual1, setAnual1] = useState("13000");
  const [anual2, setAnual2] = useState("91000");
  const [mensais, setMensais] = useState("90");
  const [fgts, setFgts] = useState("0");
  const [subsidio, setSubsidio] = useState("0");
  const [financiamento, setFinanciamento] = useState("0");
  const [renda, setRenda] = useState("16000");
  const [dataInicio, setDataInicio] = useState("2026-06-20");

  const result = useMemo(
    () =>
      simulate(
        {
          tipo,
          valorImovel: num(valorImovel),
          entrada: num(entrada),
          s1: num(s1),
          s2: num(s2),
          s3: num(s3),
          anual1: num(anual1),
          anual2: num(anual2),
          mensais: num(mensais),
          fgts: num(fgts),
          subsidio: num(subsidio),
          financiamento: num(financiamento),
          renda: num(renda),
          dataInicio,
        },
        incc,
      ),
    [
      tipo,
      valorImovel,
      entrada,
      s1,
      s2,
      s3,
      anual1,
      anual2,
      mensais,
      fgts,
      subsidio,
      financiamento,
      renda,
      dataInicio,
      incc,
    ],
  );

  const fields: [string, string, (v: string) => void][] = [
    ["Valor do imóvel", valorImovel, setValorImovel],
    ["Entrada", entrada, setEntrada],
    ["Sinal 1", s1, setS1],
    ["Sinal 2", s2, setS2],
    ["Sinal 3", s3, setS3],
    ["Anual 1 (mês 12)", anual1, setAnual1],
    ["Anual 2 (mês 24)", anual2, setAnual2],
    ["Nº de mensais", mensais, setMensais],
    ["FGTS", fgts, setFgts],
    ["Subsídio", subsidio, setSubsidio],
    ["Financiamento", financiamento, setFinanciamento],
    ["Renda mensal", renda, setRenda],
  ];

  return (
    <div className="grid gap-6 lg:grid-cols-[320px_1fr]">
      {/* Entradas */}
      <Card>
        <CardContent className="space-y-3 p-5">
          <div>
            <Label>Tipo de financiamento</Label>
            <Select
              value={tipo}
              onChange={(e) => setTipo(e.target.value as FinancingType)}
            >
              <option value="SAC">SAC</option>
              <option value="PRICE">PRICE</option>
              <option value="SBPE">SBPE</option>
            </Select>
          </div>
          <div>
            <Label>Data de início</Label>
            <Input
              type="date"
              value={dataInicio}
              onChange={(e) => setDataInicio(e.target.value)}
            />
          </div>
          {fields.map(([label, value, set]) => (
            <div key={label}>
              <Label>{label}</Label>
              <Input
                type="number"
                value={value}
                onChange={(e) => set(e.target.value)}
              />
            </div>
          ))}
        </CardContent>
      </Card>

      {/* Resultados */}
      <div className="space-y-4">
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          <Kpi label="Total entrada" value={brl0(result.totalEntrada)} />
          <Kpi label="Saldo a financiar" value={brl0(result.saldoMensal)} />
          <Kpi label="Parcela base" value={brl0(result.parcMensal)} />
          <Kpi
            label="% entrada"
            value={`${result.pctEntrada.toFixed(1)}%`}
          />
        </div>

        <div className="flex items-center gap-2 text-sm">
          <span className="text-[var(--color-ink3)]">
            Comprometimento de renda (limite 30% = {brl0(result.maxParcela)}):
          </span>
          <Badge tone={result.dentroLimite ? "success" : "danger"}>
            {result.dentroLimite ? "dentro do limite" : "acima do limite"}
          </Badge>
        </div>

        <Table>
          <THead>
            <tr>
              <TH>#</TH>
              <TH>Mês</TH>
              <TH className="text-right">Obra %</TH>
              <TH className="text-right">INCC %</TH>
              <TH className="text-right">Parcela</TH>
              <TH className="text-right">Especial</TH>
              <TH className="text-right">Total</TH>
            </tr>
          </THead>
          <tbody>
            {result.meses.map((m) => (
              <TR key={m.n}>
                <TD className="font-[family-name:var(--font-mono)]">{m.n}</TD>
                <TD className="font-[family-name:var(--font-mono)]">{m.mm}</TD>
                <TD className="text-right font-[family-name:var(--font-mono)] text-[var(--color-ink3)]">
                  {m.evolucao.toFixed(0)}%
                </TD>
                <TD className="text-right font-[family-name:var(--font-mono)] text-[var(--color-ink3)]">
                  {m.inccAc.toFixed(2)}%
                </TD>
                <TD className="text-right font-[family-name:var(--font-mono)]">
                  {brl0(m.parcTotal)}
                </TD>
                <TD className="text-right font-[family-name:var(--font-mono)]">
                  {m.especial > 0 ? brl0(m.especial) : "—"}
                </TD>
                <TD className="text-right font-[family-name:var(--font-mono)] font-medium text-[var(--color-ink)]">
                  {brl0(m.total)}
                </TD>
              </TR>
            ))}
          </tbody>
        </Table>
      </div>
    </div>
  );
}

function Kpi({ label, value }: { label: string; value: string }) {
  return (
    <Card>
      <CardContent className="p-4">
        <p className="font-[family-name:var(--font-mono)] text-[10px] uppercase tracking-wide text-[var(--color-ink3)]">
          {label}
        </p>
        <p className="mt-1 text-lg font-semibold text-[var(--color-ink)]">
          {value}
        </p>
      </CardContent>
    </Card>
  );
}
```

---

## 3. Funções de `src/lib/queries.ts`

A página chama uma só: `getInccRows`. Ela usa o helper `toInccRows`, também
de `queries.ts`, que converte a linha do banco no `InccRow` que a matemática
consome — por isso os dois vão aqui.

### `src/lib/queries.ts` · linhas 72–81

`toInccRows` — helper de conversão.

```ts
export function toInccRows(
  rows: (typeof schema.inccRates.$inferSelect)[],
): InccRow[] {
  return rows.map((r) => ({
    m: r.mes,
    mo: Number(r.monthly),
    ac: Number(r.accumulated),
    projected: r.projected,
  }));
}
```

### `src/lib/queries.ts` · linhas 150–157

`getInccRows` — a única query da página.

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

---

## 4. Server Actions

**Nenhuma. A tela não dispara nenhuma Server Action.**

Verificado nos dois arquivos da árvore:

- `src/app/(app)/simulador/page.tsx` não importa nada de `@/lib/actions/`.
- `src/components/app/simulator-form.tsx` não importa nada de `@/lib/actions/`.

A tela é inteiramente de leitura e cálculo no cliente: o formulário mantém
os campos em `useState`, chama `simulate()` dentro de um `useMemo`
(`simulator-form.tsx`, linha 31) e renderiza. Nada é enviado ao servidor.

---

## 5. A matemática do simulador

Vive em dois arquivos, ambos puros e sem I/O.

| O quê | Arquivo | Onde |
|---|---|---|
| SAC | `src/lib/calc/simulator.ts` | ramo `tipo === "SAC"` |
| PRICE | `src/lib/calc/simulator.ts` | ramo `tipo === "PRICE"` |
| SBPE | `src/lib/calc/simulator.ts` | é o ramo `else` de `parcTotal` — usa `parcComIncc` |
| Correção pelo INCC | `src/lib/calc/simulator.ts` + `src/lib/calc/incc.ts` | `parcComIncc` chama `getIncc()` |
| Evolução de obra | `src/lib/calc/simulator.ts` | `evolucao` — ver seção 6 |
| Comprometimento de renda | `src/lib/calc/simulator.ts` | `maxParcela` e `dentroLimite` — ver seção 7 |

Três constantes governam o fluxo, declaradas no topo de `simulator.ts`:
`MESES_FLUXO = 36`, `TAXA_MENSAL = 0.01` (1% a.m., com o comentário
*"juros simplificado"* no cálculo do SAC) e `INCC_FROM_INSTALLMENT = 4`
(a correção começa na 5ª parcela, pois o índice é comparado com `i >= 4`).

### `src/lib/calc/simulator.ts`

```ts
import { getIncc } from "./incc";
import type { InccRow } from "./types";

export type FinancingType = "SAC" | "PRICE" | "SBPE";

export interface SimulatorInput {
  tipo: FinancingType;
  valorImovel: number;
  entrada: number;
  s1: number;
  s2: number;
  s3: number;
  anual1: number;
  anual2: number;
  /** nº de parcelas mensais */
  mensais: number;
  fgts: number;
  subsidio: number;
  financiamento: number;
  renda: number;
  /** data ISO "YYYY-MM-DD" */
  dataInicio: string;
}

export interface SimulatorMonth {
  /** 1..36 */
  n: number;
  /** "MM/YYYY" */
  mm: string;
  /** evolução de obra acumulada (%) */
  evolucao: number;
  /** INCC acumulado do mês (%) */
  inccAc: number;
  parcBase: number;
  parcComIncc: number;
  parcTotal: number;
  especial: number;
  total: number;
}

export interface SimulatorResult {
  totalEntrada: number;
  saldoMensal: number;
  parcMensal: number;
  pctEntrada: number;
  /** limite de 30% de comprometimento de renda */
  maxParcela: number;
  /** parcela mensal cabe no limite de 30%? */
  dentroLimite: boolean;
  meses: SimulatorMonth[];
}

const MESES_FLUXO = 36; // evolução de obra linear em 36 meses
const TAXA_MENSAL = 0.01; // 1% a.m.
const INCC_FROM_INSTALLMENT = 4; // a partir da 5ª parcela

/**
 * Simulação de financiamento de uma unidade (SAC / PRICE / SBPE), portada de
 * `pgSimulador()` do protótipo. Gera o fluxo de 36 meses com evolução de obra
 * linear e correção INCC a partir da 5ª parcela. Ver docs/SPEC.md §7.2.
 */
export function simulate(
  input: SimulatorInput,
  incc: readonly InccRow[] = [],
): SimulatorResult {
  const {
    tipo,
    valorImovel,
    entrada,
    s1,
    s2,
    s3,
    anual1,
    anual2,
    mensais,
    fgts,
    subsidio,
    financiamento,
    renda,
    dataInicio,
  } = input;

  const totalEntrada =
    entrada + s1 + s2 + s3 + anual1 + anual2 + fgts + subsidio + financiamento;
  const saldoMensal = Math.max(0, valorImovel - totalEntrada);
  const parcMensal = mensais > 0 ? saldoMensal / mensais : 0;
  const pctEntrada = valorImovel > 0 ? (totalEntrada / valorImovel) * 100 : 0;
  const maxParcela = renda * 0.3;

  const start = new Date(dataInicio);
  const meses: SimulatorMonth[] = [];

  for (let i = 0; i < MESES_FLUXO; i++) {
    const d = new Date(start);
    d.setMonth(d.getMonth() + i);
    const mm = String(d.getMonth() + 1).padStart(2, "0") + "/" + d.getFullYear();
    const inccAc = getIncc(incc, mm);
    const evolucao = Math.min(100, (i + 1) * (100 / MESES_FLUXO));

    const parcBase = parcMensal;
    const parcComIncc =
      i >= INCC_FROM_INSTALLMENT ? parcBase * (1 + inccAc / 100) : parcBase;

    let parcSAC = 0;
    let parcPRICE = 0;
    if (tipo === "SAC") {
      const amort = mensais > 0 ? saldoMensal / mensais : 0;
      const saldoAtual = saldoMensal - amort * i;
      parcSAC = saldoAtual * TAXA_MENSAL + amort; // juros simplificado 1% a.m.
    } else if (tipo === "PRICE") {
      parcPRICE =
        mensais > 0
          ? (saldoMensal *
              (TAXA_MENSAL * Math.pow(1 + TAXA_MENSAL, mensais))) /
            (Math.pow(1 + TAXA_MENSAL, mensais) - 1)
          : 0;
    }

    let especial = 0;
    if (i === 0) especial = entrada;
    else if (i === 1) especial = s1;
    else if (i === 2) especial = s2;
    else if (i === 3) especial = s3;
    else if (i === 11) especial = anual1;
    else if (i === 23) especial = anual2;

    const parcTotal =
      tipo === "SAC" ? parcSAC : tipo === "PRICE" ? parcPRICE : parcComIncc;

    meses.push({
      n: i + 1,
      mm,
      evolucao,
      inccAc,
      parcBase,
      parcComIncc,
      parcTotal,
      especial,
      total: parcTotal + especial,
    });
  }

  return {
    totalEntrada,
    saldoMensal,
    parcMensal,
    pctEntrada,
    maxParcela,
    dentroLimite: parcMensal <= maxParcela,
    meses,
  };
}
```

### `src/lib/calc/incc.ts`

`getIncc` é a função que o simulador consome. `recalcIncc` e `projectIncc` são usadas pela tela Parâmetros / INCC, não por esta.

```ts
import type { InccRow } from "./types";

/**
 * Recalcula o acumulado encadeado a partir das variações mensais (`mo`).
 * Espelha `recalcINCC()` do protótipo: o primeiro mês usa a própria variação;
 * os seguintes compõem `(1+ac/100)*(1+mo/100)`. Retorna uma NOVA lista
 * (função pura) — não muta a entrada.
 */
export function recalcIncc(rows: readonly InccRow[]): InccRow[] {
  let acc = 0;
  return rows.map((row, i) => {
    acc =
      i === 0
        ? row.mo
        : Math.round(((1 + acc / 100) * (1 + row.mo / 100) * 100 - 100) * 1000) /
          1000;
    return { ...row, ac: acc };
  });
}

/** Retorna o acumulado de um mês ("MM/YYYY"), ou 0 se ausente. */
export function getIncc(rows: readonly InccRow[], month: string): number {
  const row = rows.find((r) => r.m === month);
  return row ? row.ac : 0;
}

/**
 * Preenche as variações mensais dos meses projetados (`projected === true`) com
 * a média móvel das últimas 12 variações (oficiais ou já projetadas), na ordem
 * cronológica. Meses oficiais (índice real) nunca são alterados. Depois
 * recalcula o acumulado encadeado de toda a série. Função pura.
 */
export function projectIncc(rows: readonly InccRow[]): InccRow[] {
  const out: InccRow[] = rows.map((r) => ({ ...r }));
  for (let i = 0; i < out.length; i++) {
    if (!out[i].projected) continue;
    const window = out.slice(Math.max(0, i - 12), i);
    if (window.length === 0) continue; // sem histórico → mantém valor atual
    const avg = window.reduce((a, r) => a + r.mo, 0) / window.length;
    out[i].mo = Math.round(avg * 1000) / 1000;
  }
  return recalcIncc(out);
}
```

---

## 6. De onde vem o percentual de evolução de obra

**É gerado pela própria função, linearmente. Não vem de nenhuma tabela,
consulta ou medição real da obra.**

A linha que o produz, em `src/lib/calc/simulator.ts`:

```ts
const evolucao = Math.min(100, (i + 1) * (100 / MESES_FLUXO));
```

Com `MESES_FLUXO = 36`, o valor é `(i+1) × 2,777…%`: 2,78% no mês 1, 50% no
mês 18, 100% no mês 36. O comentário da constante declara isso —
*"evolução de obra linear em 36 meses"*.

A tabela da tela exibe esse número em `simulator-form.tsx`, linha 160:

```tsx
{m.evolucao.toFixed(0)}%
```

Não há ligação com a tabela `medicao`, nem com `medicao_servico`, nem com o
`pctBdi`/`parcelaReferencia` do projeto. O percentual do simulador e o avanço
físico-financeiro medido na tela **Medição de Obra** são grandezas
independentes no código.

---

## 7. De onde vem a renda usada no comprometimento

**É digitada pelo usuário no próprio formulário. Não vem do cadastro do
cliente nem de nenhuma tabela.**

| Etapa | Arquivo | Linha | Trecho |
|---|---|---|---|
| Estado inicial | `src/components/app/simulator-form.tsx` | 26 | `const [renda, setRenda] = useState("16000");` |
| Campo na tela | `src/components/app/simulator-form.tsx` | 81 | `["Renda mensal", renda, setRenda]` |
| Entra na simulação | `src/components/app/simulator-form.tsx` | 45 | `renda: num(renda),` |
| Vira o limite | `src/lib/calc/simulator.ts` | — | `const maxParcela = renda * 0.3;` |
| Vira o veredito | `src/lib/calc/simulator.ts` | — | `dentroLimite: parcMensal <= maxParcela` |
| Exibição | `src/components/app/simulator-form.tsx` | 135 | `Comprometimento de renda (limite 30% = {brl0(result.maxParcela)})` |

O valor inicial `"16000"` é um default do componente, não um dado do tenant.
A tabela `cliente` tem campos de renda no cadastro, mas **nenhum deles é lido
por esta tela**: o simulador não recebe `clienteId` nem consulta `cliente`.

O limite de 30% está fixo no código (`renda * 0.3`), sem parâmetro de projeto
ou de tenant que o altere.

---

## 8. O que persiste uma simulação

**Nada. Nenhum ponto do repositório lê, grava ou converte resultado de
simulação.**

O levantamento, item a item:

| Verificação | Resultado |
|---|---|
| Quem chama `simulate()` | um único ponto de produção: `simulator-form.tsx:31`, dentro de um `useMemo`. Os demais são o arquivo de teste `simulator.test.ts` |
| Tabela ou coluna de simulação no schema | nenhuma |
| Migração que crie algo de simulação | nenhuma |
| Server Action que grave simulação | nenhuma |
| Referência a `paymentPlan` no simulador | nenhuma, nem em `simulator-form.tsx` nem em `simulator.ts` |

Não existe caminho — nem por botão, nem por action, nem por rota — que
transforme uma simulação em plano de pagamento de unidade. O plano de
pagamento é montado separadamente no formulário de unidade
(`unit-form.tsx`, coletado em `docs/TELA-unidades.md`) e gravado no JSONB
`unit.payment_plan` por `saveUnit`. As duas coisas não se tocam no código.

A busca por `simul` nos arquivos de `src/lib/actions/` devolve três
ocorrências — em `restituicoes.ts`, `restituicao-lote.ts` e
`recebimento-terceiro.ts` — todas a palavra “simultânea(o)” em comentários
sobre `SELECT ... FOR UPDATE`. Nenhuma tem relação com o simulador.
