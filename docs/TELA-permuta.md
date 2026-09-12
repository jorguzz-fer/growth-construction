# TELA-permuta — código na íntegra

Coleta do código das duas telas de **Permuta** — `/permuta` e
`/permuta/novo` — em `main` (commit `45f4ce3`). Sem resumo, sem análise.

**Árvore de dependências própria:**

```
permuta/page.tsx
└── components/app/page-header.tsx

permuta/novo/page.tsx
└── components/app/page-header.tsx        (o mesmo)

queries chamadas:  getPermutas · getUnits · getClientes
server action:     addPermuta  (actions/receitas.ts)
```

> **Item 6 — o código que atualizaria o `payment_plan` NÃO EXISTE.**
>
> As duas telas afirmam que ele existe. `/permuta/page.tsx`, linhas 131–132:
> *“**VENDIDO** gera receita na Projeção e atualiza automaticamente o campo
> Permuta em Dados_de_Venda.”* E `/permuta/novo/page.tsx`, linha 38, repete a
> promessa. Nenhum código a cumpre — ver seção 6.

Ficam de fora os primitivos de `components/ui/` (`badge`, `button`, `card`,
`date-field`, `input`, `table`) e `@/lib/calc/constants`, `@/lib/context`,
`@/lib/permissions`, `@/lib/utils`.

---

## 1. Páginas

### `src/app/(app)/permuta/page.tsx`

Inventário de ativos recebidos em permuta.

```tsx
import Link from "next/link";
import { getActiveContext } from "@/lib/context";
import { getPermutas } from "@/lib/queries";
import { can } from "@/lib/permissions";
import { brl0, dateBR } from "@/lib/utils";
import { PageHeader } from "@/components/app/page-header";
import { Badge, type BadgeProps } from "@/components/ui/badge";
import { buttonVariants } from "@/components/ui/button";
import { Table, THead, TH, TR, TD } from "@/components/ui/table";

export const dynamic = "force-dynamic";

/** Tom do badge por tipo de ativo (ex.: Carro azul, Imóvel verde). */
function tipoTone(tipo: string | null): BadgeProps["tone"] {
  switch ((tipo ?? "").toLowerCase()) {
    case "carro":
      return "info";
    case "imovel":
    case "imóvel":
      return "success";
    default:
      return "accent";
  }
}

export default async function PermutaPage() {
  const ctx = await getActiveContext();
  if (!ctx) return null;
  const rows = await getPermutas(ctx.version.id);
  const estimado = rows.reduce((a, p) => a + Number(p.estimado ?? 0), 0);
  const projetada = rows
    .filter((p) => p.status === "Vendido")
    .reduce((a, p) => a + Number(p.valorVenda ?? 0), 0);
  const canCriar = can(ctx.perms, "permuta", "criar");

  return (
    <>
      <PageHeader
        title="Inventário de Permuta"
        subtitle="Ativos recebidos como permuta"
        actions={
          canCriar ? (
            <Link href="/permuta/novo" className={buttonVariants({ size: "sm" })}>
              + Novo Ativo
            </Link>
          ) : undefined
        }
      />

      <p className="mb-6 text-sm text-[var(--color-ink3)]">
        Estimado: <strong className="text-[var(--color-ink)]">{brl0(estimado)}</strong>{" "}
        · Receita projetada:{" "}
        <strong className="text-[var(--color-success)]">{brl0(projetada)}</strong>
      </p>

      <Table>
        <THead>
          <tr>
            <TH className="text-right">#</TH>
            <TH>Unidade</TH>
            <TH>Cliente</TH>
            <TH>Dt.receb.</TH>
            <TH>Tipo</TH>
            <TH>Descricao</TH>
            <TH className="text-right">Val.est.</TH>
            <TH>Status</TH>
            <TH>Dt.venda</TH>
            <TH className="text-right">Val.venda</TH>
            <TH>Tipo perm.</TH>
            <TH>Obs.</TH>
          </tr>
        </THead>
        <tbody>
          {rows.length === 0 ? (
            <TR>
              <TD colSpan={12} className="py-8 text-center text-[var(--color-ink4)]">
                Nenhum ativo de permuta nesta versão.
              </TD>
            </TR>
          ) : (
            rows.map((p, i) => {
              const sold = p.status === "Vendido";
              return (
                <TR key={p.id}>
                  <TD className="text-right font-[family-name:var(--font-mono)] text-[var(--color-ink4)]">
                    {i + 1}
                  </TD>
                  <TD className="font-medium text-[var(--color-ink)]">
                    {p.unitCode ?? "—"}
                  </TD>
                  <TD>{p.cliente || "—"}</TD>
                  <TD className="font-[family-name:var(--font-mono)]">
                    {dateBR(p.dataRecebimento)}
                  </TD>
                  <TD>
                    {p.tipo ? <Badge tone={tipoTone(p.tipo)}>{p.tipo}</Badge> : "—"}
                  </TD>
                  <TD>{p.descricao || "—"}</TD>
                  <TD className="text-right font-[family-name:var(--font-mono)]">
                    {brl0(Number(p.estimado ?? 0))}
                  </TD>
                  <TD>
                    <Badge tone={sold ? "success" : "neutral"}>
                      {p.status ?? "—"}
                    </Badge>
                  </TD>
                  <TD className="font-[family-name:var(--font-mono)]">
                    {dateBR(p.dataVenda)}
                  </TD>
                  <TD
                    className={`text-right font-[family-name:var(--font-mono)] ${
                      sold ? "font-semibold text-[var(--color-success)]" : ""
                    }`}
                  >
                    {sold ? brl0(Number(p.valorVenda ?? 0)) : "—"}
                  </TD>
                  <TD>{p.tipoPermuta || "—"}</TD>
                  <TD>{p.obs || "—"}</TD>
                </TR>
              );
            })
          )}
        </tbody>
      </Table>

      <div className="mt-6 flex items-start gap-2 rounded-[10px] bg-[#d1fae5] px-4 py-3 text-[13px] leading-relaxed text-[#065f46]">
        <span aria-hidden className="mt-px">
          ⓘ
        </span>
        <p>
          <strong>VENDIDO</strong> gera receita na Projeção e atualiza
          automaticamente o campo Permuta em Dados_de_Venda.
        </p>
      </div>
    </>
  );
}
```

### `src/app/(app)/permuta/novo/page.tsx`

Cadastro. O `<form action={addPermuta}>` é o único disparo de Server Action das duas telas.

```tsx
import { getActiveContext } from "@/lib/context";
import { can } from "@/lib/permissions";
import { addPermuta } from "@/lib/actions/receitas";
import { getUnits, getClientes } from "@/lib/queries";
import { TIPOS_PERMUTA } from "@/lib/calc/constants";
import { PageHeader } from "@/components/app/page-header";
import { Card, CardContent } from "@/components/ui/card";
import { Button, buttonVariants } from "@/components/ui/button";
import { Input, Label, Select } from "@/components/ui/input";
import { DateField } from "@/components/ui/date-field";

export const dynamic = "force-dynamic";

export default async function NovoAtivoPermutaPage() {
  const ctx = await getActiveContext();
  if (!ctx) return null;
  if (!can(ctx.perms, "permuta", "criar")) {
    return (
      <p className="text-sm text-[var(--color-warning)]">
        Sem permissão para criar ativos de permuta.
      </p>
    );
  }

  const [units, clientes] = await Promise.all([
    getUnits(ctx.version.id),
    getClientes(ctx.tenant.id),
  ]);
  const unitCodes = [...new Set(units.map((u) => u.code))].sort((a, b) =>
    a.localeCompare(b, undefined, { numeric: true }),
  );

  return (
    <>
      <PageHeader
        eyebrow={ctx.version.label}
        title="Novo Ativo de Permuta"
        subtitle="VENDIDO gera receita na Projeção e atualiza o campo Permuta em Dados_de_Venda."
      />

      <Card>
        <CardContent className="p-5">
          <form
            action={addPermuta}
            className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3"
          >
            <div>
              <Label>Unidade vendida de referência</Label>
              <Select name="unitCode" defaultValue="">
                <option value="">— selecione —</option>
                {unitCodes.map((c) => (
                  <option key={c} value={c}>
                    {c}
                  </option>
                ))}
              </Select>
            </div>
            <div>
              <Label>Cliente</Label>
              <Select name="cliente" defaultValue="">
                <option value="">— selecione —</option>
                {clientes.map((c) => (
                  <option key={c.id} value={c.nomeCompleto}>
                    {c.nomeCompleto}
                  </option>
                ))}
              </Select>
            </div>
            <div>
              <Label>Data recebimento</Label>
              <DateField name="dataRecebimento" />
            </div>
            <div>
              <Label>Tipo do bem / serviço</Label>
              <Select name="tipo" defaultValue="Imóvel">
                {TIPOS_PERMUTA.map((t) => (
                  <option key={t} value={t}>
                    {t}
                  </option>
                ))}
              </Select>
            </div>
            <div className="lg:col-span-2">
              <Label>Descrição</Label>
              <Input name="descricao" placeholder="" />
            </div>
            <div>
              <Label>Valor estimado (R$)</Label>
              <Input name="estimado" type="number" step="0.01" placeholder="0" />
            </div>
            <div>
              <Label>Status</Label>
              <Select name="status" defaultValue="Disponivel">
                <option>Disponivel</option>
                <option>Vendido</option>
              </Select>
            </div>
            <div>
              <Label>Data venda / escambo</Label>
              <DateField name="dataVenda" />
            </div>
            <div>
              <Label>Valor venda (R$)</Label>
              <Input name="valorVenda" type="number" step="0.01" placeholder="0" />
            </div>
            <div>
              <Label>Forma da revenda do bem</Label>
              <Select name="formaVenda" defaultValue="avista">
                <option value="avista">Venda à vista</option>
                <option value="parcelada">Venda parcelada</option>
                <option value="escambo">Escambo (sem entrada financeira)</option>
              </Select>
            </div>
            <div>
              <Label>Parcelas (se parcelada)</Label>
              <Input name="parcelas" type="number" min="1" placeholder="Ex.: 12" />
            </div>
            <div>
              <Label>Periodicidade</Label>
              <Select name="periodicidade" defaultValue="mensal">
                <option value="mensal">Mensal</option>
                <option value="semestral">Semestral</option>
                <option value="anual">Anual</option>
              </Select>
            </div>
            <div>
              <Label>Vencimento da 1ª parcela</Label>
              <DateField name="dataPrimParcela" />
            </div>
            <div>
              <Label>Tipo permuta</Label>
              <Input name="tipoPermuta" placeholder="" />
            </div>
            <div className="lg:col-span-2">
              <Label>Observações</Label>
              <Input name="obs" placeholder="" />
            </div>
            <div className="flex items-center gap-2 sm:col-span-2 lg:col-span-3">
              <Button type="submit">Salvar ativo</Button>
              <a href="/permuta" className={buttonVariants({ variant: "ghost" })}>
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

| Função | Linhas | Chamada por |
|---|---|---|
| `getPermutas` | 143–148 | `/permuta` |
| `getUnits` | 85–91 | `/permuta/novo` |
| `getClientes` | 1082–1088 | `/permuta/novo` |

### `src/lib/queries.ts` · linhas 143–148

`getPermutas` — `select()` sem projeção, filtrando só por versão.

```ts
export async function getPermutas(versionId: string): Promise<PermutaRow[]> {
  return db
    .select()
    .from(schema.permutas)
    .where(eq(schema.permutas.versionId, versionId));
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

### `src/lib/queries.ts` · linhas 1082–1088

`getClientes`.

```ts
export async function getClientes(tenantId: string): Promise<ClienteRow[]> {
  return db
    .select()
    .from(schema.clientes)
    .where(eq(schema.clientes.tenantId, tenantId))
    .orderBy(asc(schema.clientes.nomeCompleto));
}
```

---

## 4. Server Actions de permuta

**Só existe uma: `addPermuta`.** Não há action de editar nem de excluir
permuta em nenhum lugar do repositório.

Fora dela, dois pontos escrevem a tabela, ambos de cópia/importação de versão:

| Arquivo | Linha | O que faz |
|---|---|---|
| `src/lib/actions/versions.ts` | 75 | INSERT ao duplicar versão |
| `src/lib/actions/version-io.ts` | 74–75 | DELETE + INSERT ao importar planilha |

### `src/lib/actions/receitas.ts` · linhas 30–57

`addPermuta` — grava 17 campos e revalida `/permuta`, `/fluxocaixa`, `/dre` e `/caixa`.

```ts
export async function addPermuta(formData: FormData) {
  const ctx = await getActiveContext();
  if (!ctx || !can(ctx.perms, "permuta", "criar")) return;
  await db.insert(schema.permutas).values({
    versionId: ctx.version.id,
    tenantId: ctx.tenant.id,
    unitCode: (formData.get("unitCode") as string) || null,
    cliente: (formData.get("cliente") as string) || null,
    dataRecebimento: (formData.get("dataRecebimento") as string) || null,
    tipo: (formData.get("tipo") as string) || null,
    descricao: (formData.get("descricao") as string) || null,
    estimado: (formData.get("estimado") as string) || "0",
    status: (formData.get("status") as string) || "Disponivel",
    dataVenda: (formData.get("dataVenda") as string) || null,
    valorVenda: (formData.get("valorVenda") as string) || "0",
    tipoPermuta: (formData.get("tipoPermuta") as string) || null,
    formaVenda: (formData.get("formaVenda") as string) || null,
    parcelas: formData.get("parcelas") ? Number(formData.get("parcelas")) : null,
    periodicidade: (formData.get("periodicidade") as string) || null,
    dataPrimParcela: (formData.get("dataPrimParcela") as string) || null,
    obs: (formData.get("obs") as string) || null,
  });
  revalidatePath("/permuta");
  revalidatePath("/fluxocaixa");
  revalidatePath("/dre");
  revalidatePath("/caixa");
  redirect("/permuta");
}
```

---

## 5. `permToResale`, `permutaRevenueByMonth` e `CalcPermuta`

Existem **dois** conversores de permuta, com tipos diferentes. Vale os dois
lado a lado porque só um deles carrega data:

| | `permToCalc` → `CalcPermuta` | `permToResale` → `CalcPermutaResale` |
|---|---|---|
| Campos | `estimado`, `status`, `valorVenda` | `valorVenda`, `dataVenda`, `formaVenda`, `parcelas`, `periodicidade`, `dataPrimParcela` |
| Carrega data? | **não** | sim — duas |
| Alimenta | `calcTotals` → `permRec`/`permVend` | `permutaRevenueByMonth` (DRE) e `permutaCashByMonth` (Fluxo/Caixa) |

### `src/lib/queries.ts` · linhas 173–183

`permToResale` — o conversor que a DRE usa.

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

### `src/lib/calc/projection.ts` · linhas 265–273

`CalcPermutaResale` — vive em `projection.ts`, não em `types.ts`.

```ts
/** Revenda de um bem recebido em permuta (item 10). */
export interface CalcPermutaResale {
  valorVenda: number;
  dataVenda: string; // "MM/DD/YYYY"
  formaVenda: string; // "avista" | "parcelada" | "escambo"
  parcelas: number;
  periodicidade: string; // "mensal" | "semestral" | "anual"
  dataPrimParcela: string; // "MM/DD/YYYY"
}
```

### `src/lib/calc/projection.ts` · linhas 312–334

`permutaRevenueByMonth` — receita contábil para a DRE. Resolve sozinha só o escambo; o resto delega a `permutaCashByMonth`.

```ts
/**
 * Receita CONTÁBIL da revenda de permuta para a DRE, por mês. Igual ao caixa
 * para à vista/parcelada; para ESCAMBO, contabiliza o valor na data do escambo
 * (data da venda), sem gerar caixa.
 */
export function permutaRevenueByMonth(
  rows: readonly CalcPermutaResale[],
): MonthlyProjection {
  const out: MonthlyProjection = {};
  const add = (mm: string, v: number) => {
    if (v > 0) out[mm] = (out[mm] || 0) + v;
  };
  const cash = permutaCashByMonth(rows);
  for (const [mm, v] of Object.entries(cash)) add(mm, v);
  // Escambo: só DRE, na data do escambo.
  for (const r of rows) {
    if ((r.formaVenda || "").toLowerCase() !== "escambo") continue;
    if (!r.valorVenda || r.valorVenda <= 0) continue;
    const d = parseDate(r.dataVenda) ?? parseDate(r.dataPrimParcela);
    if (d) add(monthKey(d.mo, d.yr), r.valorVenda);
  }
  return out;
}
```

### `src/lib/calc/projection.ts` · linhas 277–310

`permutaCashByMonth` — chamada pela função acima; incluída porque sem ela o cálculo fica incompleto.

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

### `src/lib/queries.ts` · linhas 165–171

`permToCalc` — o outro conversor, o que alimenta `calcTotals`.

```ts
export function permToCalc(rows: PermutaRow[]): CalcPermuta[] {
  return rows.map((p) => ({
    estimado: Number(p.estimado ?? 0),
    status: p.status ?? "",
    valorVenda: Number(p.valorVenda ?? 0),
  }));
}
```

### `src/lib/calc/types.ts` · linhas 98–103

`CalcPermuta`.

```ts
/** Permuta (subconjunto usado nos agregados). */
export interface CalcPermuta {
  estimado: number;
  status: string;
  valorVenda: number;
}
```

---

## 6. O código que atualiza a linha Permuta do `payment_plan`

**Não existe. Nenhum código do repositório escreve a linha `Permuta` do
`payment_plan` em resposta a uma permuta virar VENDIDO.**

As duas telas afirmam o contrário:

| Arquivo | Linha | Texto |
|---|---|---|
| `src/app/(app)/permuta/page.tsx` | 131–132 | “**VENDIDO** gera receita na Projeção e atualiza automaticamente o campo Permuta em Dados_de_Venda.” |
| `src/app/(app)/permuta/novo/page.tsx` | 38 | “VENDIDO gera receita na Projeção e atualiza o campo Permuta em Dados_de_Venda.” |

### O levantamento que sustenta a afirmação

| Verificação | Resultado |
|---|---|
| `addPermuta` toca `schema.units` ou `paymentPlan`? | **não** — zero ocorrências no corpo da função |
| Existe UPDATE de `schema.permutas`? | **não** — só três INSERT e um DELETE, nenhum UPDATE |
| Quem escreve `paymentPlan`? | seis pontos, nenhum ligado a permuta — ver tabela abaixo |

Todos os pontos que gravam `paymentPlan` no repositório:

| Arquivo | Linha | Origem do valor | Tem a ver com permuta? |
|---|---|---|---|
| `src/lib/actions/units.ts` | 54 | `input.plan` — o formulário de unidade, em `saveUnit` | não |
| `src/lib/actions/units.ts` | 127 | `emptyPlan()` — plano vazio, em `importUnits` | não |
| `src/lib/actions/versions.ts` | 64 | cópia da versão de origem | não |
| `src/lib/actions/version-io.ts` | 55 | planilha importada | não |
| `src/lib/db/seed.ts` | 197, 209 | seed | não |

A única escrita da linha `Permuta` do plano é **manual**, pelo formulário de
unidade — `src/components/app/unit-form.tsx`, linhas 247–250: campos
`desc`, `val`, `dataPrev` e a flag `usarFinanc`, digitados pelo usuário.
Nenhum deles é preenchido a partir da tabela `permuta`.

### O que de fato acontece quando o status é VENDIDO

A metade da promessa que **é** cumprida — a receita — acontece por dois
caminhos, ambos lendo a tabela `permuta` diretamente, sem passar pelo
`payment_plan`:

| Onde | Como |
|---|---|
| DRE, Fluxo de Caixa, Caixa | `permutaRevenueByMonth` / `permutaCashByMonth` usam `valorVenda`, `dataVenda`, `formaVenda` — a checagem é por `formaVenda`, não por `status` |
| Resumo Executivo | `calcTotals` acumula `permVend += p.valorVenda` quando `p.status === "Vendido"` |

Ou seja: o `status` da PERMUTA é lido em **um** único lugar do repositório —
a linha 391 de `projection.ts`, dentro de `calcTotals`. (A linha 411 do mesmo
arquivo também compara com `"Vendido"`, mas ali o status é o da UNIDADE, para
contar quantas foram vendidas.) E nada é gravado em lugar nenhum.

---

## 7. Tabela `permuta` no schema

**A tabela não usa nenhum `pgEnum`.** `status`, `tipo`, `tipoPermuta`,
`formaVenda` e `periodicidade` são todos `text`.

### `src/lib/db/schema.ts` · linhas 431–460

```ts
/** Inventário de ativos recebidos em permuta. Ver docs/SPEC.md §3 e §7.4. */
export const permutas = pgTable("permuta", {
  id: uuid("id").primaryKey().defaultRandom(),
  versionId: uuid("version_id")
    .notNull()
    .references(() => versions.id, { onDelete: "cascade" }),
  tenantId: uuid("tenant_id")
    .notNull()
    .references(() => tenants.id, { onDelete: "cascade" }),
  /** código da unidade vinculada (ex.: "BLA 401"). */
  unitCode: text("unit_code"),
  cliente: text("cliente"),
  dataRecebimento: text("data_recebimento"),
  tipo: text("tipo"),
  descricao: text("descricao"),
  estimado: numeric("estimado", { precision: 15, scale: 2 }),
  status: text("status"),
  dataVenda: text("data_venda"),
  valorVenda: numeric("valor_venda", { precision: 15, scale: 2 }),
  tipoPermuta: text("tipo_permuta"),
  /** revenda do bem recebido: "avista" | "parcelada" | "escambo". */
  formaVenda: text("forma_venda"),
  /** nº de parcelas (revenda parcelada). */
  parcelas: integer("parcelas"),
  /** periodicidade das parcelas: "mensal" | "semestral" | "anual". */
  periodicidade: text("periodicidade"),
  /** vencimento da 1ª parcela "MM/DD/YYYY". */
  dataPrimParcela: text("data_prim_parcela"),
  obs: text("obs"),
});
```

---

## 8. Consumidores de `permRec` e `permVend`

Quatro pontos, todos em `src/app/(app)/resumo/page.tsx`. Nenhum outro no
repositório.

| Arquivo | Linha | Trecho | O que faz com o valor |
|---|---|---|---|
| `src/app/(app)/resumo/page.tsx` | 55 | `{ label: "Permuta Recebido (estimado)", value: totals.permRec },` | entrada da lista de indicadores da versão, em `versionIndicadores` (linha 30) — alimenta o comparativo entre versões |
| `src/app/(app)/resumo/page.tsx` | 56 | `{ label: "Permuta Vendidos (rec. projetada)", value: totals.permVend },` | idem, entrada seguinte |
| `src/app/(app)/resumo/page.tsx` | 157 | `{ label: "Permuta Recebido (estimado)", value: totals.permRec },` | entrada do array `indicadores` de `ResumoPage` (linha 63) — visão de versão única, renderizada na linha 217 |
| `src/app/(app)/resumo/page.tsx` | 158 | `{ label: "Permuta Vendidos (rec. projetada)", value: totals.permVend },` | idem, entrada seguinte |

Nenhum dos quatro faz conta com o número: rotula e põe num array.

### Onde os valores nascem

Em `src/lib/calc/projection.ts`, dentro de `calcTotals` — declaração nas
linhas 370–371, acumulação nas 390–391, retorno nas 405–406:

```ts
permutas.forEach((p) => {
  permRec += p.estimado || 0;
  if (p.status === "Vendido") permVend += p.valorVenda || 0;
});
```

`permRec` soma `estimado` de todas as permutas; `permVend` soma `valorVenda`
só das com `status === "Vendido"`. Ambos chegam por `permToCalc`, que não
carrega data — por isso são valores contratados acumulados, sem recorte de
período, como diz o subtítulo da tela na linha 97: *“Comparativo de versões ·
indicadores gerais (valores contratados)”*.

Os campos estão declarados em `VersionTotals`, `src/lib/calc/types.ts`,
linhas 117–118.
