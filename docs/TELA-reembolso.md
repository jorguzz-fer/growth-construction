# TELA-reembolso — código na íntegra

Coleta do código das duas telas de **Reembolso** — `/reembolso` e
`/reembolso/novo` — em `main` (commit `45f4ce3`). Sem resumo, sem análise.

**Árvore de dependências própria:**

```
reembolso/page.tsx
└── components/app/page-header.tsx

reembolso/novo/page.tsx
└── components/app/page-header.tsx        (o mesmo)

query chamada:   getReembolsos
server action:   addReembolso  (actions/receitas.ts)
```

`page-header.tsx` é o único componente próprio das duas páginas. Ficam de
fora os primitivos de `components/ui/` e `@/lib/context`, `@/lib/permissions`,
`@/lib/utils`.

---

## 1. Páginas

### `src/app/(app)/reembolso/page.tsx`

Listagem.

```tsx
import Link from "next/link";
import { getActiveContext } from "@/lib/context";
import { getReembolsos } from "@/lib/queries";
import { can } from "@/lib/permissions";
import { brl0, dateBR } from "@/lib/utils";
import { PageHeader } from "@/components/app/page-header";
import { Badge } from "@/components/ui/badge";
import { buttonVariants } from "@/components/ui/button";
import { Table, THead, TH, TR, TD } from "@/components/ui/table";

export const dynamic = "force-dynamic";

/** Normaliza status legado ("received") para o rótulo em português. */
function statusLabel(status: string | null): string {
  if (!status) return "Recebido";
  return status.toLowerCase() === "received" ? "Recebido" : status;
}

export default async function ReembolsoPage() {
  const ctx = await getActiveContext();
  if (!ctx) return null;
  const rows = await getReembolsos(ctx.version.id);
  const total = rows.reduce((a, r) => a + Number(r.valor ?? 0), 0);
  const canCriar = can(ctx.perms, "reembolso", "criar");

  return (
    <>
      <PageHeader
        title="Reembolso"
        subtitle="Aba própria — Data REAL + SERIAL automático"
        actions={
          canCriar ? (
            <Link href="/reembolso/novo" className={buttonVariants({ size: "sm" })}>
              + Novo Reembolso
            </Link>
          ) : undefined
        }
      />

      <p className="mb-4 text-sm text-[var(--color-ink3)]">
        Total:{" "}
        <strong className="text-[var(--color-success)]">{brl0(total)}</strong> ·{" "}
        {rows.length} lançamento(s)
      </p>

      <div className="mb-6 flex items-start gap-2 rounded-[10px] border border-[var(--color-accent2)]/12 bg-[var(--color-accent4)] px-4 py-3 text-[13px] leading-relaxed text-[var(--color-ink2)]">
        <span aria-hidden className="mt-px">
          ⓘ
        </span>
        <p>
          A data deve ser uma <strong>DATA REAL</strong>. O <strong>SERIAL</strong>{" "}
          é calculado automaticamente via{" "}
          <code className="font-[family-name:var(--font-mono)]">INT(Data)</code>. A
          Projeção usa <strong>SUMIFS</strong> comparando col SERIAL com seriais de
          cada mês.
        </p>
      </div>

      <Table>
        <THead>
          <tr>
            <TH>Data (DD/MM/AAAA)</TH>
            <TH>Origem</TH>
            <TH className="text-right">Valor R$</TH>
            <TH>Porcentagem %</TH>
            <TH>Observações</TH>
            <TH className="text-right">Serial (auto)</TH>
            <TH>Status</TH>
          </tr>
        </THead>
        <tbody>
          {rows.length === 0 ? (
            <TR>
              <TD colSpan={7} className="py-8 text-center text-[var(--color-ink4)]">
                Nenhum reembolso lançado nesta versão.
              </TD>
            </TR>
          ) : (
            rows.map((r) => (
              <TR key={r.id}>
                <TD className="font-[family-name:var(--font-mono)]">
                  {dateBR(r.data)}
                </TD>
                <TD>{r.origem ?? "—"}</TD>
                <TD className="text-right font-[family-name:var(--font-mono)] font-semibold text-[var(--color-success)]">
                  {brl0(Number(r.valor ?? 0))}
                </TD>
                <TD>{r.pct || "—"}</TD>
                <TD>{r.obs || "—"}</TD>
                <TD className="text-right font-[family-name:var(--font-mono)] text-[var(--color-ink3)]">
                  {r.serial ?? "—"}
                </TD>
                <TD>
                  <Badge tone="success">✓ {statusLabel(r.status)}</Badge>
                </TD>
              </TR>
            ))
          )}
        </tbody>
      </Table>
    </>
  );
}
```

### `src/app/(app)/reembolso/novo/page.tsx`

Cadastro. O `<form action={addReembolso}>` é o único disparo de Server Action das duas telas.

```tsx
import { getActiveContext } from "@/lib/context";
import { can } from "@/lib/permissions";
import { addReembolso } from "@/lib/actions/receitas";
import { PageHeader } from "@/components/app/page-header";
import { Card, CardContent } from "@/components/ui/card";
import { Button, buttonVariants } from "@/components/ui/button";
import { Input, Label } from "@/components/ui/input";
import { DateField } from "@/components/ui/date-field";

export const dynamic = "force-dynamic";

export default async function NovoReembolsoPage() {
  const ctx = await getActiveContext();
  if (!ctx) return null;
  if (!can(ctx.perms, "reembolso", "criar")) {
    return (
      <p className="text-sm text-[var(--color-warning)]">
        Sem permissão para criar reembolsos.
      </p>
    );
  }

  return (
    <>
      <PageHeader
        eyebrow={ctx.version.label}
        title="Novo Reembolso"
        subtitle="A data deve ser uma DATA REAL — o SERIAL é calculado automaticamente via INT(Data)."
      />

      <Card>
        <CardContent className="p-5">
          <form
            action={addReembolso}
            className="grid grid-cols-1 gap-4 sm:grid-cols-2"
          >
            <div>
              <Label>Data</Label>
              <DateField name="data" required />
            </div>
            <div>
              <Label>Origem</Label>
              <Input name="origem" placeholder="Origem X" />
            </div>
            <div>
              <Label>Valor (R$)</Label>
              <Input name="valor" type="number" step="0.01" placeholder="0" />
            </div>
            <div>
              <Label>Porcentagem %</Label>
              <Input name="pct" placeholder="" />
            </div>
            <div className="sm:col-span-2">
              <Label>Observações</Label>
              <Input name="obs" placeholder="" />
            </div>
            <div className="flex items-center gap-2 sm:col-span-2">
              <Button type="submit">Salvar reembolso</Button>
              <a href="/reembolso" className={buttonVariants({ variant: "ghost" })}>
                Cancelar
              </a>
            </div>
          </form>
        </CardContent>
      </Card>
    </>
  );
}
```

---

## 2. Componentes próprios

### `src/components/app/page-header.tsx`

Único componente próprio; nenhuma das duas páginas importa outro de `components/app/`.

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

---

## 3. Funções de `src/lib/queries.ts`

A listagem chama `getReembolsos`. `/reembolso/novo` não chama nenhuma.
`reembToCalc` vai junto por ser o conversor que leva a linha do banco ao
formato que os cálculos consomem — é onde o `serial` some (seção 6).

### `src/lib/queries.ts` · linhas 134–141

`getReembolsos` — filtra por versão.

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

### `src/lib/queries.ts` · linhas 161–163

`reembToCalc` — mantém só `data` e `valor`.

```ts
export function reembToCalc(rows: ReembolsoRow[]): CalcReembolso[] {
  return rows.map((r) => ({ data: r.data ?? "", valor: Number(r.valor ?? 0) }));
}
```

---

## 4. Server Actions de reembolso

**Só existe uma ação de usuário: `addReembolso`.** Não há action de editar
nem de excluir reembolso em nenhum lugar do repositório.

Fora dela, dois outros pontos escrevem a tabela — ambos de cópia/importação
de versão, não de edição pelo usuário:

| Arquivo | Linha | O que faz |
|---|---|---|
| `src/lib/actions/versions.ts` | 100 | INSERT ao duplicar uma versão — copia os reembolsos da origem |
| `src/lib/actions/version-io.ts` | 62–63 | DELETE + INSERT ao importar a planilha da versão |

### `src/lib/actions/receitas.ts` · linhas 10–28

`addReembolso` — grava `serial` calculado e `status` fixo em `"Recebido"`.

```ts
export async function addReembolso(formData: FormData) {
  const ctx = await getActiveContext();
  if (!ctx || !can(ctx.perms, "reembolso", "criar")) return;
  const data = (formData.get("data") as string) || null;
  await db.insert(schema.reembolsos).values({
    versionId: ctx.version.id,
    tenantId: ctx.tenant.id,
    data,
    origem: (formData.get("origem") as string) || null,
    valor: (formData.get("valor") as string) || "0",
    pct: (formData.get("pct") as string) || null,
    obs: (formData.get("obs") as string) || null,
    // SERIAL = INT(Data): calculado automaticamente a partir da data real.
    serial: excelSerial(data),
    status: "Recebido",
  });
  revalidatePath("/reembolso");
  redirect("/reembolso");
}
```

---

## 5. Tabela `reembolso` no schema

**A tabela não usa nenhum `pgEnum`.** `status` é `text`, `pct` é `text` e
`serial` é `integer` — todos nuláveis.

### `src/lib/db/schema.ts` · linhas 462–479

```ts
/** Reembolsos da versão. Ver docs/SPEC.md §3 e §7.3. */
export const reembolsos = pgTable("reembolso", {
  id: uuid("id").primaryKey().defaultRandom(),
  versionId: uuid("version_id")
    .notNull()
    .references(() => versions.id, { onDelete: "cascade" }),
  tenantId: uuid("tenant_id")
    .notNull()
    .references(() => tenants.id, { onDelete: "cascade" }),
  /** data REAL "MM/DD/YYYY". */
  data: text("data"),
  origem: text("origem"),
  valor: numeric("valor", { precision: 15, scale: 2 }),
  pct: text("pct"),
  obs: text("obs"),
  serial: integer("serial"),
  status: text("status"),
});
```

---

## 6. A coluna SERIAL

### O que é no banco

`serial: integer("serial")` — inteiro nulável (`schema.ts:477`). Não é
`SERIAL` do Postgres (sequência autoincremento); é uma coluna comum que
guarda o **serial de data do Excel**.

### Como é calculada

Por `excelSerial(data)` em `addReembolso` (`receitas.ts:23`). A função
converte `"MM/DD/YYYY"` em dias desde 1899-12-30 — a época do Excel:

### `src/lib/utils.ts` · linhas 144–159

`excelSerial` — a única produtora do valor.

```ts
/**
 * Número de série da data no padrão de planilha — INT(Data): dias desde
 * 1899-12-30 (mesma convenção do Excel/Sheets). Aceita "MM/DD/YYYY" (formato
 * usado no protótipo). Retorna null quando a data é inválida.
 */
export function excelSerial(dateStr: string | null | undefined): number | null {
  if (!dateStr) return null;
  const m = dateStr.trim().match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
  if (!m) return null;
  const month = Number(m[1]);
  const day = Number(m[2]);
  const year = Number(m[3]);
  if (month < 1 || month > 12 || day < 1 || day > 31) return null;
  const ms = Date.UTC(year, month - 1, day) - Date.UTC(1899, 11, 30);
  return Math.round(ms / 86_400_000);
}
```

### Quem lê

| Arquivo | Linha | Uso |
|---|---|---|
| `src/app/(app)/reembolso/page.tsx` | 91 | exibe na coluna “Serial (auto)” |
| `src/app/(app)/versao/export/route.ts` | 55 | leva para o `.xlsx` da versão |
| `src/lib/xlsx/growth-template.ts` | 167 | escreve na planilha |
| `src/lib/xlsx/growth-template.ts` | 317 | lê de volta na importação |
| `src/lib/actions/versions.ts` | 109 | copia ao duplicar versão |
| `src/lib/actions/version-io.ts` | 67 | copia na importação |

### O que NÃO lê

**Nenhum cálculo usa o `serial`.** O aviso na própria tela diz que *“a
Projeção usa SUMIFS comparando col SERIAL com seriais de cada mês”* — isso
descreve a planilha de origem, não este código.

A prova está em três pontos encadeados:

### `src/lib/calc/types.ts` · linhas 91–96

1. O tipo que os cálculos recebem tem só `data` e `valor` — não tem `serial`.

```ts
/** Reembolso (subconjunto usado nos cálculos). */
export interface CalcReembolso {
  /** "MM/DD/YYYY" */
  data: string;
  valor: number;
}
```

2. O conversor `reembToCalc` (seção 3) descarta tudo menos esses dois campos.

### `src/lib/calc/projection.ts` · linhas 336–351

3. A agregação mensal parte de `r.data` (split em `/`, chave `MM/YYYY`), nunca do serial.

```ts
/** Agrega reembolsos por mês ("MM/YYYY"). Espelha `rembByMonth()`. */
export function reembursementsByMonth(
  reembolsos: readonly CalcReembolso[],
): MonthlyProjection {
  const m: MonthlyProjection = {};
  reembolsos.forEach((r) => {
    if (r.data && r.valor > 0) {
      const p = r.data.split("/");
      if (p.length === 3) {
        const k = p[0] + "/" + p[2];
        m[k] = (m[k] || 0) + r.valor;
      }
    }
  });
  return m;
}
```

---

## 7. A coluna PORCENTAGEM (`pct`)

### O que é

`pct: text("pct")` — **coluna de texto livre**, nulável (`schema.ts:475`).
Não é `numeric`. O campo do formulário é um `<Input name="pct">` sem `type`,
ou seja, texto comum, sem máscara, sem validação e sem faixa.

### Percentual de qual base

**O código não define base nenhuma.** Não há no repositório nenhuma operação
que relacione `pct` a `valor`, ao VGV, ao valor da unidade ou a qualquer
outro montante.

### Onde é usada em cálculo

**Em lugar nenhum.** As duas únicas leituras do campo são de transporte:

| Arquivo | Linha | Uso |
|---|---|---|
| `src/app/(app)/reembolso/page.tsx` | 88 | exibe na coluna “Porcentagem %”, como veio: `{r.pct \|\| "—"}` |
| `src/lib/xlsx/growth-template.ts` | 167 | escreve na planilha exportada |

`reembToCalc` não a repassa, `CalcReembolso` não a declara e
`reembursementsByMonth` e `calcTotals` não a mencionam. O reembolso entra
nos totais pelo `valor`, sempre integral — a porcentagem nunca o pondera.

---

## 8. Todo ponto que lê reembolso

### Projeção e Consolidado

Os dois usam o mesmo par de funções e somam o reembolso **como uma linha
própria, fora das fontes das unidades**, integrando o TOTAL.

| Tela | Arquivo | Linha | O que faz |
|---|---|---|---|
| Projeção | `src/app/(app)/projecao/page.tsx` | 118 | `getReembolsos(version.id)` |
| Projeção | `src/app/(app)/projecao/page.tsx` | 149 | `reembursementsByMonth(reembToCalc(reembRows))` |
| Projeção | `src/app/(app)/projecao/page.tsx` | 179 | linha “Reembolso” da tabela mensal, com total próprio |
| Projeção | `src/app/(app)/projecao/page.tsx` | 82 | linha “Reembolso” no comparativo de versões |
| Consolidado | `src/app/(app)/consolidado/page.tsx` | 79 | linha “Reembolso” no comparativo |
| Consolidado | `src/app/(app)/consolidado/page.tsx` | 164 | `{ label: "Reembolso", map: reembMonth }` entra em `rowMaps` |

**Como entra no total.** No comparativo do Consolidado a soma é explícita
(`consolidado/page.tsx`, linha 87 em diante):

```ts
{
  label: "TOTAL",
  emphasis: "final" as const,
  values: perVersion.map(
    (rv) =>
      PROJECTION_SOURCES.reduce((a, s) => a + sumFiltered(rv.sources[s]), 0) +
      sumFiltered(rv.reemb),
  ),
},
```

Na tabela mensal, o reembolso é uma linha a mais em `rowMaps` e o `totalRow`
soma todas as linhas — incluindo a dele. O subtítulo da tela declara isso:
*“Reembolso incluído no TOTAL”*.

### Demais leitores

| Arquivo | Linha | Contexto |
|---|---|---|
| `src/app/(app)/caixa/page.tsx` | 448, 457 | agrega reembolso por mês no Controle de Caixa |
| `src/app/(app)/resumo/page.tsx` | 36, 119 | linha “Reembolso (aba própria)” do Resumo Executivo |
| `src/app/(app)/versao/page.tsx` | 60 | contagem de reembolsos da versão |
| `src/app/(app)/versao/export/route.ts` | 30, 49 | exportação `.xlsx` |
| `src/app/(app)/layout.tsx` | 58–60 | contagem para o badge do menu |
| `src/lib/queries.ts` | 1135, 1150 | `getMonthlyRevenue` — receita mensal da versão |
| `src/lib/queries.ts` | 1438, 1447 | comparação Budget × Forecast |
| `src/lib/actions/budget.ts` | 552, 566 | importação do realizado para o Budget |
| `src/lib/actions/versions.ts` | 95–98 | leitura ao duplicar versão |

### Como entra no total de receita da versão

`calcTotals` soma o `valor` de **todos** os reembolsos, sem filtro de status
nem de data:

### `src/lib/calc/projection.ts` · linhas 353–413

A linha do reembolso é `const reemb = reembolsos.reduce((a, r) => a + (r.valor || 0), 0);`.

```ts
/**
 * Agrega os totais de receita de uma versão (VGV, sinais, mensais, semestrais,
 * anuais, FGTS, subsídio, permuta recebida/vendida, reembolsos, banco e
 * contagem por status). Espelha `calcTotals()`, recebendo as coleções da
 * versão ao invés de ler estado global.
 */
export function calcTotals(
  units: readonly CalcUnit[],
  permutas: readonly CalcPermuta[],
  reembolsos: readonly CalcReembolso[],
): VersionTotals {
  let sinais = 0,
    mens = 0,
    sem = 0,
    anu = 0,
    fgts = 0,
    sub = 0,
    permRec = 0,
    permVend = 0,
    banco = 0;

  units.forEach((u) => {
    if (u.status !== "Vendido") return;
    sinais +=
      (u.AS.val || 0) * (u.AS.n || 1) +
      (u.S1.val || 0) +
      (u.S2.val || 0) +
      (u.S3.val || 0);
    mens += (u.Mensais.val || 0) * (u.Mensais.n || 0);
    sem += (u.Semestrais.val || 0) * (u.Semestrais.n || 0);
    anu += (u.Anuais.val || 0) * (u.Anuais.n || 0);
    fgts += u.FGTS.val || 0;
    sub += u.Subsidio.val || 0;
    banco += u.Banco.valFinanc || 0;
  });

  permutas.forEach((p) => {
    permRec += p.estimado || 0;
    if (p.status === "Vendido") permVend += p.valorVenda || 0;
  });

  const reemb = reembolsos.reduce((a, r) => a + (r.valor || 0), 0);
  const vgv = units.reduce((a, u) => a + u.valor, 0);

  return {
    vgv,
    sinais,
    mens,
    sem,
    anu,
    fgts,
    sub,
    permRec,
    permVend,
    reemb,
    banco,
    disp: units.filter((u) => u.status === "Disponivel").length,
    res: units.filter((u) => u.status === "Reservado").length,
    vend: units.filter((u) => u.status === "Vendido").length,
  };
}
```

---

## 9. De onde vem o STATUS da listagem

**É gravado fixo no código, nunca escolhido pelo usuário.** Não há campo de
status no formulário de cadastro.

| Origem | Arquivo | Linha | Valor gravado |
|---|---|---|---|
| Cadastro pela tela | `src/lib/actions/receitas.ts` | 24 | `status: "Recebido"` |
| Importação de planilha | `src/lib/actions/version-io.ts` | 67 | `status: "received"` |
| Duplicação de versão | `src/lib/actions/versions.ts` | 110 | `status: r.status` — copia o status da origem |

Os dois caminhos gravam grafias diferentes — `"Recebido"` em português pela
tela e `"received"` em inglês pela importação. A listagem reconcilia as duas
com um normalizador local, declarado no topo de `reembolso/page.tsx`:

```ts
/** Normaliza status legado ("received") para o rótulo em português. */
function statusLabel(status: string | null): string {
  if (!status) return "Recebido";
  return status.toLowerCase() === "received" ? "Recebido" : status;
}
```

E o badge é renderizado sempre com o mesmo tom e o mesmo ícone
(`reembolso/page.tsx`, linha 94), independentemente do valor:

```tsx
<Badge tone="success">✓ {statusLabel(r.status)}</Badge>
```

Ou seja: todo reembolso aparece como “✓ Recebido” em verde. `null` também cai
nesse rótulo, pelo primeiro `if`. Nenhuma consulta filtra por `status` de
reembolso, e `calcTotals` soma todos sem olhar o campo.
