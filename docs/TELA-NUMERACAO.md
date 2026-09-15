# Tela — Numeração de Despesas (`/numeracao`)

Coleta de código, sem análise. Cada arquivo aparece com o caminho como
cabeçalho. Trechos parciais trazem a faixa de linhas no título do bloco.

Base: branch `claude/contexto-revisao`.

---

## 1. A página

### `src/app/(app)/numeracao/page.tsx`

```tsx
import { getActiveContext } from "@/lib/context";
import { can } from "@/lib/permissions";
import { getDespesaSequence } from "@/lib/actions/numeracao";
import { PageHeader } from "@/components/app/page-header";
import { AccessDenied } from "@/components/app/access-denied";
import { NumeracaoForm } from "@/components/app/numeracao-form";

export const dynamic = "force-dynamic";

export default async function NumeracaoPage() {
  const ctx = await getActiveContext();
  if (!ctx) return null;
  if (!can(ctx.perms, "numeracao", "ver")) return <AccessDenied />;

  const seq = await getDespesaSequence(ctx.tenant.id);

  return (
    <>
      <PageHeader
        eyebrow={ctx.tenant.name}
        title="Numeração de Despesas"
        subtitle="Sequência automática dos lançamentos — prefixo, dígitos e próximo número."
      />
      <NumeracaoForm initial={seq} canEdit={can(ctx.perms, "numeracao", "editar")} />
    </>
  );
}
```

---

## 2. Componentes próprios que a página importa (recursivamente)

Árvore de imports da página:

```
src/app/(app)/numeracao/page.tsx
├── @/lib/context            → getActiveContext
├── @/lib/permissions        → can
├── @/lib/actions/numeracao  → getDespesaSequence            (seção 3)
├── @/components/app/page-header    → PageHeader
├── @/components/app/access-denied  → AccessDenied
└── @/components/app/numeracao-form → NumeracaoForm
    ├── @/lib/actions/numeracao → updateDespesaSequence, SequenceConfig  (seção 3)
    ├── @/components/ui/card    → Card, CardContent
    ├── @/components/ui/button  → Button
    └── @/components/ui/input   → Input, Label
```

Não há mais nenhum componente próprio abaixo desses — `Card`, `Button`,
`Input` e `Label` são primitivos de `components/ui` e não importam nada do
app.

### `src/components/app/numeracao-form.tsx`

```tsx
"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import {
  updateDespesaSequence,
  type SequenceConfig,
} from "@/lib/actions/numeracao";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input, Label } from "@/components/ui/input";

function preview(c: SequenceConfig): string {
  const num = String(Math.max(1, c.nextNumber || 1)).padStart(
    Math.min(12, Math.max(1, c.digits || 6)),
    "0",
  );
  return c.usePrefix && c.prefix ? `${c.prefix}-${num}` : num;
}

export function NumeracaoForm({
  initial,
  canEdit,
}: {
  initial: SequenceConfig;
  canEdit: boolean;
}) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [c, setC] = useState<SequenceConfig>(initial);

  const salvar = () => {
    setError(null);
    setSaved(false);
    start(async () => {
      try {
        await updateDespesaSequence(c);
        setSaved(true);
        router.refresh();
      } catch (e) {
        setError(e instanceof Error ? e.message : "Falha ao salvar.");
      }
    });
  };

  return (
    <Card className="max-w-xl">
      <CardContent className="space-y-4 p-5">
        <div className="flex items-center gap-2">
          <input
            id="usePrefix"
            type="checkbox"
            checked={c.usePrefix}
            disabled={!canEdit || pending}
            onChange={(e) => setC({ ...c, usePrefix: e.target.checked })}
          />
          <label htmlFor="usePrefix" className="text-[13px] text-[var(--color-ink2)]">
            Usar prefixo
          </label>
        </div>

        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
          <div>
            <Label>Prefixo</Label>
            <Input
              value={c.prefix}
              disabled={!canEdit || pending || !c.usePrefix}
              onChange={(e) => setC({ ...c, prefix: e.target.value })}
              placeholder="PED"
            />
          </div>
          <div>
            <Label>Próximo número</Label>
            <Input
              type="number"
              min={1}
              value={c.nextNumber}
              disabled={!canEdit || pending}
              onChange={(e) => setC({ ...c, nextNumber: Number(e.target.value) || 1 })}
            />
          </div>
          <div>
            <Label>Qtd. de dígitos</Label>
            <Input
              type="number"
              min={1}
              max={12}
              value={c.digits}
              disabled={!canEdit || pending}
              onChange={(e) => setC({ ...c, digits: Number(e.target.value) || 6 })}
            />
          </div>
        </div>

        <div className="flex items-center gap-2">
          <input
            id="active"
            type="checkbox"
            checked={c.active}
            disabled={!canEdit || pending}
            onChange={(e) => setC({ ...c, active: e.target.checked })}
          />
          <label htmlFor="active" className="text-[13px] text-[var(--color-ink2)]">
            Numeração automática ativa
          </label>
        </div>

        <div className="rounded-[10px] bg-[var(--color-surface2)] px-4 py-3">
          <div className="font-[family-name:var(--font-mono)] text-[10px] uppercase tracking-wide text-[var(--color-ink3)]">
            Exemplo do próximo número
          </div>
          <div className="mt-1 font-[family-name:var(--font-mono)] text-xl font-semibold text-[var(--color-accent)]">
            {preview(c)}
          </div>
        </div>

        <p className="text-[12px] leading-relaxed text-[var(--color-ink3)]">
          O número é reservado atomicamente no banco a cada nova despesa —
          nunca duplica nem reutiliza números excluídos. Ajuste o “próximo
          número” para alinhar com a numeração histórica da empresa.
        </p>

        {canEdit && (
          <div className="flex items-center gap-3">
            <Button onClick={salvar} disabled={pending}>
              {pending ? "Salvando…" : "Salvar configuração"}
            </Button>
            {saved && !pending && (
              <span className="text-sm text-[var(--color-success)]">Salvo.</span>
            )}
          </div>
        )}
        {error && <p className="text-sm text-[var(--color-danger)]">{error}</p>}
      </CardContent>
    </Card>
  );
}
```

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

### `src/components/ui/card.tsx`

```tsx
import * as React from "react";
import { cn } from "@/lib/utils";

function Card({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      className={cn(
        "rounded-[12px] border border-[var(--color-accent2)]/12 bg-[var(--color-surface)] shadow-[0_1px_3px_rgba(55,48,163,.08)]",
        className,
      )}
      {...props}
    />
  );
}

function CardHeader({
  className,
  ...props
}: React.HTMLAttributes<HTMLDivElement>) {
  return <div className={cn("flex flex-col gap-1 p-5", className)} {...props} />;
}

function CardTitle({
  className,
  ...props
}: React.HTMLAttributes<HTMLHeadingElement>) {
  return (
    <h3
      className={cn(
        "text-base font-semibold leading-none text-[var(--color-ink)]",
        className,
      )}
      {...props}
    />
  );
}

function CardDescription({
  className,
  ...props
}: React.HTMLAttributes<HTMLParagraphElement>) {
  return (
    <p
      className={cn("text-sm text-[var(--color-ink3)]", className)}
      {...props}
    />
  );
}

function CardContent({
  className,
  ...props
}: React.HTMLAttributes<HTMLDivElement>) {
  return <div className={cn("p-5 pt-0", className)} {...props} />;
}

export { Card, CardHeader, CardTitle, CardDescription, CardContent };
```

### `src/components/ui/button.tsx`

```tsx
import * as React from "react";
import { cva, type VariantProps } from "class-variance-authority";
import { cn } from "@/lib/utils";

const buttonVariants = cva(
  "inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-[8px] text-sm font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-accent2)] disabled:pointer-events-none disabled:opacity-50 [&_svg]:size-4 [&_svg]:shrink-0",
  {
    variants: {
      variant: {
        default:
          "bg-[var(--color-accent)] text-white hover:bg-[var(--color-accent2)]",
        outline:
          "border border-[var(--color-accent2)]/20 bg-[var(--color-surface)] text-[var(--color-ink)] hover:bg-[var(--color-surface3)]",
        ghost:
          "text-[var(--color-ink2)] hover:bg-[var(--color-surface3)] hover:text-[var(--color-ink)]",
      },
      size: {
        default: "h-9 px-4 py-2",
        sm: "h-8 px-3 text-xs",
        lg: "h-11 px-6",
      },
    },
    defaultVariants: {
      variant: "default",
      size: "default",
    },
  },
);

export interface ButtonProps
  extends React.ButtonHTMLAttributes<HTMLButtonElement>,
    VariantProps<typeof buttonVariants> {}

const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant, size, ...props }, ref) => (
    <button
      ref={ref}
      className={cn(buttonVariants({ variant, size, className }))}
      {...props}
    />
  ),
);
Button.displayName = "Button";

export { Button, buttonVariants };
```

### `src/components/ui/input.tsx`

```tsx
import * as React from "react";
import { cn } from "@/lib/utils";

export const Input = React.forwardRef<
  HTMLInputElement,
  React.InputHTMLAttributes<HTMLInputElement>
>(({ className, ...props }, ref) => (
  <input
    ref={ref}
    className={cn(
      "h-9 w-full rounded-[8px] border border-[var(--color-accent2)]/20 bg-white px-3 text-sm text-[var(--color-ink)] outline-none transition-colors placeholder:text-[var(--color-ink4)] focus:border-[var(--color-accent2)] focus:ring-2 focus:ring-[var(--color-accent2)]/20",
      className,
    )}
    {...props}
  />
));
Input.displayName = "Input";

export const Select = React.forwardRef<
  HTMLSelectElement,
  React.SelectHTMLAttributes<HTMLSelectElement>
>(({ className, children, ...props }, ref) => (
  <select
    ref={ref}
    className={cn(
      "h-9 w-full rounded-[8px] border border-[var(--color-accent2)]/20 bg-white px-3 text-sm text-[var(--color-ink)] outline-none transition-colors focus:border-[var(--color-accent2)] focus:ring-2 focus:ring-[var(--color-accent2)]/20",
      className,
    )}
    {...props}
  >
    {children}
  </select>
));
Select.displayName = "Select";

export function Label({
  className,
  ...props
}: React.LabelHTMLAttributes<HTMLLabelElement>) {
  return (
    <label
      className={cn(
        "mb-1 block font-[family-name:var(--font-mono)] text-[10px] uppercase tracking-wide text-[var(--color-ink3)]",
        className,
      )}
      {...props}
    />
  );
}
```

---

## 3. Server Actions da tela, na íntegra

### `src/lib/actions/numeracao.ts`

```ts
"use server";

import { and, eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { db, schema } from "@/lib/db";
import { getActiveContext } from "@/lib/context";
import { can } from "@/lib/permissions";
import { logAudit } from "@/lib/audit";
import { reserveDespesaNumber } from "@/lib/db/numbering";

export type SequenceConfig = {
  prefix: string;
  usePrefix: boolean;
  digits: number;
  nextNumber: number;
  active: boolean;
};

/** Lê (garantindo a existência) a configuração de numeração de Despesas. */
export async function getDespesaSequence(
  tenantId: string,
): Promise<SequenceConfig> {
  const [seq] = await db
    .select()
    .from(schema.numberSequences)
    .where(
      and(
        eq(schema.numberSequences.tenantId, tenantId),
        eq(schema.numberSequences.entity, "despesa"),
      ),
    )
    .limit(1);
  if (seq) {
    return {
      prefix: seq.prefix,
      usePrefix: seq.usePrefix,
      digits: seq.digits,
      nextNumber: seq.nextNumber,
      active: seq.active,
    };
  }
  // Ainda não inicializada: semeia a partir do maior número existente sem consumir.
  const rows = await db
    .select({ n: schema.despesas.numDoc })
    .from(schema.despesas)
    .where(eq(schema.despesas.tenantId, tenantId));
  let max = 0;
  for (const r of rows) {
    const m = r.n?.match(/(\d+)\s*$/);
    if (m) max = Math.max(max, parseInt(m[1], 10));
  }
  return { prefix: "PED", usePrefix: true, digits: 6, nextNumber: max + 1, active: true };
}

/** Atualiza a configuração da sequência (somente quem pode editar a tela). */
export async function updateDespesaSequence(patch: SequenceConfig) {
  const ctx = await getActiveContext();
  if (!ctx || !can(ctx.perms, "numeracao", "editar")) {
    throw new Error("Sem permissão para configurar a numeração.");
  }
  const prefix = (patch.prefix || "").trim().slice(0, 12);
  const digits = Math.min(12, Math.max(1, Math.trunc(patch.digits) || 6));
  const nextNumber = Math.max(1, Math.trunc(patch.nextNumber) || 1);
  const before = await getDespesaSequence(ctx.tenant.id);

  await db
    .insert(schema.numberSequences)
    .values({
      tenantId: ctx.tenant.id,
      entity: "despesa",
      prefix,
      usePrefix: !!patch.usePrefix,
      digits,
      nextNumber,
      active: !!patch.active,
      updatedAt: new Date(),
    })
    .onConflictDoUpdate({
      target: [schema.numberSequences.tenantId, schema.numberSequences.entity],
      set: {
        prefix,
        usePrefix: !!patch.usePrefix,
        digits,
        nextNumber,
        active: !!patch.active,
        updatedAt: new Date(),
      },
    });

  await logAudit({
    tenantId: ctx.tenant.id,
    userId: ctx.userId,
    action: "numeracao.update",
    entity: "number_sequence",
    meta: { before, after: { prefix, usePrefix: !!patch.usePrefix, digits, nextNumber, active: !!patch.active } },
  });
  revalidatePath("/numeracao");
  revalidatePath("/despesas");
}

/** Reserva (consome) o próximo número — usado por outras actions. */
export { reserveDespesaNumber };
```

Apoio usado pela action (`logAudit`):

### `src/lib/audit.ts`

```ts
import { db, schema } from "@/lib/db";

/**
 * Registra uma entrada no log de auditoria (append-only). Chamado pelas Server
 * Actions após mutações. Ver docs/SPEC.md §12.7.
 */
export async function logAudit(entry: {
  tenantId: string;
  userId: string | null;
  action: string;
  entity: string;
  entityId?: string | null;
  meta?: unknown;
}): Promise<void> {
  await db.insert(schema.auditLog).values({
    tenantId: entry.tenantId,
    userId: entry.userId ?? null,
    action: entry.action,
    entity: entry.entity,
    entityId: entry.entityId ?? null,
    meta: (entry.meta ?? null) as object | null,
  });
}
```

---

## 4. A função que gera o próximo número, e todos os caminhos que a chamam

### `src/lib/db/numbering.ts` — arquivo inteiro

```ts
import { and, eq, sql } from "drizzle-orm";
import { db, schema } from "@/lib/db";

/** Maior sufixo numérico já usado em `despesa.numDoc` (semente da sequência). */
async function maxExistingDespesaNumber(tenantId: string): Promise<number> {
  const rows = await db
    .select({ n: schema.despesas.numDoc })
    .from(schema.despesas)
    .where(eq(schema.despesas.tenantId, tenantId));
  let max = 0;
  for (const r of rows) {
    const m = r.n?.match(/(\d+)\s*$/);
    if (m) max = Math.max(max, parseInt(m[1], 10));
  }
  return max;
}

/**
 * Reserva o próximo número da sequência de Despesas de forma ATÔMICA no banco.
 * A linha da sequência é criada (semeada pelo maior número existente) na
 * primeira vez; a reserva usa `UPDATE ... RETURNING` (statement único) dentro
 * de uma transação, então dois lançamentos simultâneos recebem números
 * distintos — nunca duplicados, nunca reutilizando números excluídos.
 */
export async function reserveDespesaNumber(tenantId: string): Promise<string> {
  return db.transaction(async (tx) => {
    const [seq] = await tx
      .select()
      .from(schema.numberSequences)
      .where(
        and(
          eq(schema.numberSequences.tenantId, tenantId),
          eq(schema.numberSequences.entity, "despesa"),
        ),
      )
      .limit(1);

    if (!seq) {
      const start = (await maxExistingDespesaNumber(tenantId)) + 1;
      await tx
        .insert(schema.numberSequences)
        .values({ tenantId, entity: "despesa", nextNumber: start })
        .onConflictDoNothing();
    }

    const [updated] = await tx
      .update(schema.numberSequences)
      .set({
        nextNumber: sql`${schema.numberSequences.nextNumber} + 1`,
        updatedAt: new Date(),
      })
      .where(
        and(
          eq(schema.numberSequences.tenantId, tenantId),
          eq(schema.numberSequences.entity, "despesa"),
        ),
      )
      .returning();

    const used = updated.nextNumber - 1;
    const num = String(used).padStart(updated.digits, "0");
    return updated.usePrefix && updated.prefix ? `${updated.prefix}-${num}` : num;
  });
}

/** Formata um preview do próximo número sem reservar (para a tela de config). */
export function previewNumber(
  prefix: string,
  usePrefix: boolean,
  digits: number,
  next: number,
): string {
  const num = String(next).padStart(digits, "0");
  return usePrefix && prefix ? `${prefix}-${num}` : num;
}
```

### Onde `reserveDespesaNumber` é chamada

Grep completo no repositório (`grep -rn "reserveDespesaNumber" src/`), fora do
próprio `numbering.ts` e do seu teste:

| # | Arquivo:linha | Função que chama | Dentro de transação do chamador? | O número vai para |
|---|---|---|---|---|
| 1 | `src/lib/actions/despesas.ts:326` | `addDespesa` (lançamento manual) | Não — `db.insert` solto na linha 372 | `despesa.num_doc` |
| 2 | `src/lib/actions/despesas.ts:537` | `addDespesa` → réplicas recorrentes | Não | `despesa.num_doc` (1 por réplica) |
| 3 | `src/lib/actions/restituicoes.ts:227` | `criarDespesaTerceiro` (modo "despesa nova") | Sim — dentro de `tx` | `despesa.num_doc` |
| 4 | `src/lib/actions/restituicao-lote.ts:245` | restituição em lote | Sim — dentro de `tx` | só texto no `obs` da restituição |
| 5 | `src/lib/actions/restituicao-lote.ts:432` | compensação | Sim — dentro de `tx` | `compensacao.num_doc` |
| 6 | `src/lib/actions/acerto.ts:218` | `criarAcerto` | Sim — dentro de `tx` | `acerto.num_doc` |
| 7 | `src/lib/actions/acerto.ts:276` | `criarAcerto` → despesa da diferença | Sim — dentro de `tx` | `despesa.num_doc` |
| 8 | `src/lib/actions/acerto.ts:524` | rateio entre obras | Sim — dentro de `tx` | `acerto.num_doc` |
| 9 | `src/lib/actions/acerto.ts:551` | rateio entre obras → 1 PED por obra | Sim — dentro de `tx` | `despesa.num_doc` |
| 10 | `src/lib/actions/ponto.ts:195` | apuração de diárias | Não | `despesa.num_doc` |
| 11 | `src/lib/actions/caixa.ts:685` | converter movimento do extrato em despesa | Não | `despesa.num_doc` |
| 12 | `src/lib/actions/caixa.ts:1122` | conciliação → despesa (só se o extrato **não** trouxer `doc`) | Não | `despesa.num_doc` |

Além disso, `src/lib/actions/numeracao.ts:102` apenas **reexporta** a função
(`export { reserveDespesaNumber };`) — não a chama.

Sobre os nomes citados no pedido:

- **`addDespesa`** — sim, itens 1 e 2 acima.
- **`criarDespesaTerceiro`** — sim, item 3; ela vive em
  `src/lib/actions/restituicoes.ts`, não em `despesas.ts`.
- **`acerto`** — sim, quatro chamadas (itens 6 a 9).
- **`ponto`** — sim, item 10.
- **`estoque`** — **não**. Nenhuma action de estoque reserva número; o estoque
  apenas *lê* despesas já numeradas (`src/app/(app)/estoque/page.tsx:80`).
- **`importVersionData`** — **não**. A importação apaga as despesas da versão e
  reinsere **sem `numDoc`** (ver o trecho abaixo). As despesas importadas ficam
  com `num_doc = NULL`.

#### `src/lib/actions/version-io.ts:86–95` — a importação não numera

```ts
    if (parsed.despesas.length) {
      await tx.delete(schema.despesas).where(eq(schema.despesas.versionId, vId));
      await tx.insert(schema.despesas).values(
        parsed.despesas.map((d) => ({
          versionId: vId, tenantId: tId, contaCef: d.contaCef, categoriaDre: "Custo Variável" as const,
          competencia: d.competencia, vencimento: d.vencimento, valor: String(d.valor), status: "A pagar",
        })),
      );
      result.despesas = parsed.despesas.length;
    }
```

#### `src/lib/actions/despesas.ts:323–375` — chamada 1 (lançamento manual)

```ts
  // RG-06 — o PED é numeração interna: sempre reservado aqui, no servidor,
  // dentro da transação. Nunca vem do formulário, nem para owner/admin. O
  // número da nota tem campo próprio (bloco Documento Fiscal).
  const numDoc = await reserveDespesaNumber(ctx.tenant.id);
  const s = (k: string) => (formData.get(k) as string) || null;
  // Despesa paga por sócio (Seção 3): a despesa é reconhecida normalmente na DRE
  // e no projeto, mas NÃO gera saída de caixa da empresa. A obrigação com o
  // sócio é registrada em despesa_terceiro; o caixa só se move no reembolso
  // (restituição). Se não houver reembolso, a obrigação já nasce quitada.
  const pagoPorSocioId = s("pagoPorSocioId");
  const socioReembolsavel = !!formData.get("socioReembolsavel");
  const socioDataPagamento = s("socioDataPagamento");
  const core = {
    versionId: version.id,
    tenantId: ctx.tenant.id,
    fornecedorId: s("fornecedorId"),
    bancoId: s("bancoId"),
    contaCef: s("contaCef"),
    categoriaDre: (formData.get("categoriaDre") as CategoriaDRE) || null,
    competencia: s("competencia"),
    vencimento: pagoPorSocioId ? socioDataPagamento : s("vencimento"),
    // Modo bottom-up: quando o total chega vazio e há parcelas, `valorNum` já é
    // a soma delas. O PED carrega SEMPRE o custo total da compra; o
    // fracionamento vive nas parcelas (item 2.3).
    valor: String(valorNum),
    // Descrição/observação da compra — campo PRÓPRIO, separado do nº do pedido
    // (numDoc). O objeto da compra não deve ser guardado no número do pedido.
    obs: s("obs"),
    status: pagoPorSocioId ? "Pago" : s("status") || "A pagar",
    // Não gera saída de caixa da empresa no momento do cadastro.
    pagoPorTerceiro: !!pagoPorSocioId,
    // Fase 2 — forma/condição de pagamento
    formaPagamento: s("formaPagamento"),
    formaPagamentoDesc: s("formaPagamentoDesc"),
    condicaoPagamento: s("condicaoPagamento"),
    qtdParcelas: formData.get("qtdParcelas") ? Number(formData.get("qtdParcelas")) : null,
    dataEmissao: s("dataEmissao"),
    boletoLinhaDigitavel: s("boletoLinhaDigitavel"),
    boletoCodigoBarras: s("boletoCodigoBarras"),
    boletoBanco: s("boletoBanco"),
    chequeNumero: s("chequeNumero"),
    chequeBanco: s("chequeBanco"),
    chequeAg: s("chequeAg"),
    chequeConta: s("chequeConta"),
    chequeEmitente: s("chequeEmitente"),
    chequeDataEmissao: s("chequeDataEmissao"),
    chequeDataCompensacao: s("chequeDataCompensacao"),
    chequeStatus: s("chequeStatus"),
  };
  const [row] = await db
    .insert(schema.despesas)
    .values({ ...core, numDoc })
    .returning();
```

#### `src/lib/actions/despesas.ts:531–544` — chamada 2 (recorrência)

```ts
  // Despesa recorrente: replica o lançamento nos próximos meses (competência e
  // vencimento avançam 1 mês a cada repetição). Cada réplica recebe seu próprio
  // número automático; parcelas/anexo ficam só no lançamento original.
  if (formData.get("recorrente")) {
    const meses = Math.min(60, Math.max(2, Number(formData.get("recorrenciaMeses")) || 0));
    for (let i = 1; i < meses; i++) {
      const numDocRec = await reserveDespesaNumber(ctx.tenant.id);
      await db.insert(schema.despesas).values({
        ...core,
        numDoc: numDocRec,
        competencia: addMonthsCompetencia(core.competencia, i),
        vencimento: addMonthsDate(core.vencimento, i),
      });
    }
```

#### `src/lib/actions/restituicoes.ts:218–247` — chamada 3

```ts
        // ── Modo despesa nova ─────────────────────────────────────────────
        // Item 4.6 / RG-01 — a despesa criada aqui é despesa como qualquer
        // outra: não pode nascer classificada em conta de natureza credora.
        const erroCat = validarCategoriaDespesa(formData.get("categoriaDre") as string);
        if (erroCat) throw new Error(erroCat);
        const valor = (formData.get("valor") as string) || "0";
        if (!Number.isFinite(Number(valor)) || Number(valor) <= 0) {
          throw new Error("Informe um valor maior que zero para a despesa paga por terceiro.");
        }
        const numDoc = await reserveDespesaNumber(ctx.tenant.id);
        const [nova] = await tx
          .insert(schema.despesas)
          .values({
            versionId: ctx.version.id,
            tenantId: ctx.tenant.id,
            numDoc,
            fornecedorId: s("fornecedorId"),
            contaCef: s("contaCef"),
            categoriaDre: (formData.get("categoriaDre") as CategoriaDRE) || null,
            competencia: s("competencia"),
            vencimento: dataPagamentoOriginal,
            valor,
            status: "Pago",
            obs,
            pagoPorTerceiro: true,
          })
          .returning();
        despesaAlvo = nova;
        valorObrigacao = valor;
      }
```

#### `src/lib/actions/restituicao-lote.ts:243–258` — chamada 4

```ts
      // Documento próprio da restituição (item 4.2) — é o que vai à
      // contabilidade como comprovação da saída de caixa.
      const numDoc = await reserveDespesaNumber(ctx.tenant.id);

      // A restituição é ancorada na PRIMEIRA obrigação abatida (a tabela exige
      // um vínculo); os demais PEDs entram por `restituicao_item`.
      const [rest] = await tx
        .insert(schema.restituicoes)
        .values({
          tenantId: ctx.tenant.id,
          despesaTerceiroId: resultado.abatimentos[0].id,
          valor: String(resultado.totalAbatido),
          dataRestituicao: input.dataRestituicao || null,
          bankAccountId: input.bankAccountId || null,
          comprovante: input.comprovante || null,
          obs: `${input.obs ?? ""}${input.obs ? " · " : ""}Restituição em lote ${numDoc}`,
```

#### `src/lib/actions/restituicao-lote.ts:425–444` — chamada 5

```ts
      const valor = valorCompensavel({ saldoARestituir, saldoARepassar });
      if (valor <= 0) {
        throw new Error(
          "Não há o que compensar: é preciso haver saldo nos DOIS lados (a restituir e a repassar).",
        );
      }

      const numDoc = await reserveDespesaNumber(ctx.tenant.id);
      const [comp] = await tx
        .insert(schema.compensacoes)
        .values({
          tenantId: ctx.tenant.id,
          numDoc,
          terceiroId: input.terceiroId,
          valor: String(valor),
          data: input.data || null,
          saldoRestituirAntes: String(saldoARestituir),
          saldoRepassarAntes: String(saldoARepassar),
          obs: input.obs || null,
          idempotencyKey: idem,
```

#### `src/lib/actions/acerto.ts:217–232` — chamada 6

```ts

      const numDoc = await reserveDespesaNumber(ctx.tenant.id);
      const [acerto] = await tx
        .insert(schema.acertos)
        .values({
          tenantId: ctx.tenant.id,
          numDoc,
          dataPagamento: input.dataPagamento || null,
          bankAccountId: input.bankAccountId || null,
          valorTransferido: String(valorTransferido),
          formaPagamento: input.formaPagamento || null,
          favorecidoId: input.favorecidoId || null,
          diferencaValor: String(diferenca.valor),
          diferencaTipo: diferenca.tipo,
          obs: input.obs || null,
          idempotencyKey: idem,
```

#### `src/lib/actions/acerto.ts:273–295` — chamada 7 (despesa da diferença)

```ts
        const compet = (input.dataPagamento || "").split("/");
        const competencia =
          compet.length === 3 ? `${compet[0]}/${compet[2]}` : projetoDaDiferenca.competencia;
        const numDif = await reserveDespesaNumber(ctx.tenant.id);
        const [despDif] = await tx
          .insert(schema.despesas)
          .values({
            versionId: versaoDif.id,
            tenantId: ctx.tenant.id,
            numDoc: numDif,
            fornecedorId: input.favorecidoId || null,
            contaCef:
              diferenca.tipo === "JUROS"
                ? CONTAS_CONTROLADORIA.jurosMora
                : CONTAS_CONTROLADORIA.descontosObtidos,
            // Sempre "Despesas Financeiras": mesmo o desconto obtido entra como
            // valor NEGATIVO nesta categoria, para não abrir uma categoria de
            // receita num lançamento de despesa (RG-01).
            categoriaDre: (input.categoriaDiferenca as CategoriaDRE) ?? "Despesas Financeiras",
            competencia,
            vencimento: input.dataPagamento || null,
            dataCaixa: input.dataPagamento || null,
            valor:
```

#### `src/lib/actions/acerto.ts:522–567` — chamadas 8 e 9 (rateio entre obras)

```ts
  try {
    const out = await db.transaction(async (tx) => {
      const numDoc = await reserveDespesaNumber(ctx.tenant.id);
      const [acerto] = await tx
        .insert(schema.acertos)
        .values({
          tenantId: ctx.tenant.id,
          numDoc,
          dataPagamento: input.dataPagamento || null,
          bankAccountId: input.bankAccountId || null,
          valorTransferido: String(valorTotal),
          favorecidoId: input.prestadorId || null,
          diferencaValor: "0",
          diferencaTipo: "NENHUMA",
          obs: input.descricao || null,
          idempotencyKey: idem,
          usuarioId: ctx.userId,
        })
        .returning();

      let versaoPrimeira: string | null = null;
      for (const linha of rateio) {
        const versao = await getAtualVersion(ctx.tenant.id, linha.projectId);
        if (!versao) {
          throw new Error(
            "Uma das obras do rateio não tem versão Atual — crie-a antes de ratear.",
          );
        }
        versaoPrimeira ??= versao.id;
        const numObra = await reserveDespesaNumber(ctx.tenant.id);
        const [desp] = await tx
          .insert(schema.despesas)
          .values({
            versionId: versao.id,
            tenantId: ctx.tenant.id,
            numDoc: numObra,
            fornecedorId: input.prestadorId || null,
            contaCef: input.contaCef || null,
            categoriaDre: (input.categoriaDre as CategoriaDRE) ?? "Custo Variável",
            competencia: input.competencia || null,
            vencimento: input.dataPagamento || null,
            dataCaixa: input.dataPagamento || null,
            valor: String(linha.valor),
            status: "Pago",
            obs: `${input.descricao ?? "Rateio de mão de obra"} — acerto ${numDoc}`,
            // A saída de caixa é do ACERTO, uma só. Marcar aqui evitaria que a
```

#### `src/lib/actions/ponto.ts:190–208` — chamada 10

```ts
  // Dias distintos trabalhados (entrada conta como dia).
  const dias = new Set(alvo.filter((e) => e.tipo === "entrada").map((e) => e.data));
  if (dias.size === 0) throw new Error("Nenhum dia elegível para apuração (já apurados ou sem entrada).");
  const valor = dias.size * (input.valorDiaria || 0);

  const numDoc = await reserveDespesaNumber(ctx.tenant.id);
  const [row] = await db
    .insert(schema.despesas)
    .values({
      versionId: version.id,
      tenantId: ctx.tenant.id,
      numDoc,
      competencia: input.competencia || null,
      valor: String(valor),
      status: "A pagar",
      categoriaDre: "Custo Variável",
      obs: `Mão de obra (ponto) · ${input.funcionario} · ${dias.size} dia(s)`,
    })
    .returning();
```

#### `src/lib/actions/caixa.ts:683–699` — chamada 11

```ts
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
```

#### `src/lib/actions/caixa.ts:1116–1131` — chamada 12 (condicional)

```ts
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
```

---

## 5. Schema: `number_sequence` e `despesa.num_doc`

### `src/lib/db/schema.ts:1324–1347` — tabela `number_sequence`

```ts
/**
 * Sequência numérica configurável por tenant/entidade (ex.: numeração das
 * Despesas). O próximo número é reservado de forma atômica no banco
 * (UPDATE ... RETURNING dentro de transação), evitando duplicidade sob
 * concorrência. `nextNumber` é semeado a partir do maior número já existente.
 */
export const numberSequences = pgTable(
  "number_sequence",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    tenantId: uuid("tenant_id")
      .notNull()
      .references(() => tenants.id, { onDelete: "cascade" }),
    /** entidade numerada, ex.: "despesa". */
    entity: text("entity").notNull().default("despesa"),
    prefix: text("prefix").notNull().default("PED"),
    usePrefix: boolean("use_prefix").notNull().default(true),
    digits: integer("digits").notNull().default(6),
    nextNumber: bigint("next_number", { mode: "number" }).notNull().default(1),
    active: boolean("active").notNull().default(true),
    updatedAt: timestamp("updated_at", { mode: "date" }).notNull().defaultNow(),
  },
  (t) => [unique("number_sequence_tenant_entity_uq").on(t.tenantId, t.entity)],
);
```

### `src/lib/db/schema.ts:564–588` — cabeçalho da tabela `despesa` (onde vive `num_doc`)

```ts
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
```

E o fechamento da mesma tabela — note que `pgTable("despesa", {...})` é
chamada **com um único argumento**: não há o segundo parâmetro `(t) => [...]`
onde ficariam índices e constraints compostas.

### `src/lib/db/schema.ts:610–616` — fim da tabela `despesa`

```ts
  /** Cancelamento lógico: mantém histórico, sai de saldos/relatórios. */
  cancelado: boolean("cancelado").notNull().default(false),
  canceladoEm: text("cancelado_em"),
  canceladoPor: text("cancelado_por"),
  motivoCancelamento: text("motivo_cancelamento"),
  createdAt: timestamp("created_at", { mode: "date" }).notNull().defaultNow(),
});
```

Para comparação, uma tabela que **tem** constraint composta no mesmo arquivo
(`despesa_parcela`, `src/lib/db/schema.ts:995–998`) termina assim:

```ts
    createdAt: timestamp("created_at", { mode: "date" }).notNull().defaultNow(),
  },
  (t) => [unique("despesa_parcela_uq").on(t.despesaId, t.numeroParcela)],
);
```

### Migrações

`num_doc` entrou na tabela `despesa` numa única migração, como coluna `text`
nullable, sem índice e sem constraint:

#### `src/lib/db/migrations/0004_sparkling_roughhouse.sql:1`

```sql
ALTER TABLE "despesa" ADD COLUMN "num_doc" text;--> statement-breakpoint
```

Grep de `num_doc` em todos os `.sql` de migração devolve só três linhas — a
acima e as duas colunas homônimas criadas em `0037` (tabelas `acerto` e
`compensacao`):

```
src/lib/db/migrations/0004_sparkling_roughhouse.sql:1:ALTER TABLE "despesa" ADD COLUMN "num_doc" text;--> statement-breakpoint
src/lib/db/migrations/0037_acerto_restituicao_lote.sql:23:	"num_doc" text,
src/lib/db/migrations/0037_acerto_restituicao_lote.sql:46:	"num_doc" text,
```

#### `src/lib/db/migrations/0012_condemned_shiver_man.sql:1–14` — criação de `number_sequence`

```sql
CREATE TABLE "number_sequence" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"entity" text DEFAULT 'despesa' NOT NULL,
	"prefix" text DEFAULT 'PED' NOT NULL,
	"use_prefix" boolean DEFAULT true NOT NULL,
	"digits" integer DEFAULT 6 NOT NULL,
	"next_number" bigint DEFAULT 1 NOT NULL,
	"active" boolean DEFAULT true NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "number_sequence_tenant_entity_uq" UNIQUE("tenant_id","entity")
);
--> statement-breakpoint
ALTER TABLE "number_sequence" ADD CONSTRAINT "number_sequence_tenant_id_tenant_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenant"("id") ON DELETE cascade ON UPDATE no action;
```

### Índices e constraints, conferidos no snapshot mais recente

Valores extraídos de `src/lib/db/migrations/meta/0038_snapshot.json` (as duas
tabelas, reformatadas para leitura):

```
TABLE public.despesa
indexes: {}
uniqueConstraints: {}
compositePrimaryKeys: {}

TABLE public.number_sequence
indexes: {}
uniqueConstraints: {
 "number_sequence_tenant_entity_uq": {
  "name": "number_sequence_tenant_entity_uq",
  "nullsNotDistinct": false,
  "columns": ["tenant_id", "entity"]
 }
}
```

Ou seja: a tabela `despesa` tem **apenas** a primary key em `id` e as foreign
keys — **zero índices** e **zero unique constraints**, em nenhuma coluna,
inclusive `num_doc`.

### O teste da numeração

#### `src/lib/db/numbering.test.ts`

```ts
import { describe, it, expect } from "vitest";
import { eq } from "drizzle-orm";
import { previewNumber, reserveDespesaNumber } from "./numbering";

describe("previewNumber (formatação)", () => {
  it("aplica prefixo e dígitos", () => {
    expect(previewNumber("PED", true, 6, 1258)).toBe("PED-001258");
  });
  it("sem prefixo", () => {
    expect(previewNumber("PED", false, 6, 1258)).toBe("001258");
  });
  it("respeita a quantidade de dígitos", () => {
    expect(previewNumber("", true, 4, 7)).toBe("0007");
  });
});

// Integração com o banco: roda apenas quando DATABASE_URL está definido.
const HAS_DB = !!process.env.DATABASE_URL;

describe.skipIf(!HAS_DB)("reserveDespesaNumber (integração / concorrência)", () => {
  it("gera números únicos sob concorrência a partir do ponto definido", async () => {
    const { db, schema } = await import("./index");
    const [t] = await db
      .insert(schema.tenants)
      .values({ name: "tenant-numbering-test" })
      .returning();
    try {
      await db.insert(schema.numberSequences).values({
        tenantId: t.id,
        entity: "despesa",
        prefix: "PED",
        digits: 6,
        nextNumber: 1000,
      });
      // 25 reservas simultâneas
      const results = await Promise.all(
        Array.from({ length: 25 }, () => reserveDespesaNumber(t.id)),
      );
      // todos distintos (nenhum duplicado)
      expect(new Set(results).size).toBe(25);
      // começa exatamente no ponto configurado
      expect(results).toContain("PED-001000");
      // sequência contígua 1000..1024
      const nums = results.map((r) => Number(r.split("-")[1])).sort((a, b) => a - b);
      expect(nums[0]).toBe(1000);
      expect(nums[nums.length - 1]).toBe(1024);
    } finally {
      await db.delete(schema.tenants).where(eq(schema.tenants.id, t.id));
    }
  });

  it("semeia a sequência a partir do maior número já existente", async () => {
    const { db, schema } = await import("./index");
    const [t] = await db
      .insert(schema.tenants)
      .values({ name: "tenant-numbering-seed" })
      .returning();
    try {
      // cria projeto+versão mínima para lançar despesas com numDoc
      const [p] = await db
        .insert(schema.projects)
        .values({ tenantId: t.id, name: "P" })
        .returning();
      const [v] = await db
        .insert(schema.versions)
        .values({ projectId: p.id, tenantId: t.id, key: "atual", kind: "atual", label: "Atual", color: "#000" })
        .returning();
      await db.insert(schema.despesas).values([
        { versionId: v.id, tenantId: t.id, numDoc: "PED-000500", valor: "10" },
        { versionId: v.id, tenantId: t.id, numDoc: "BMV-2026-000842", valor: "10" },
      ]);
      // primeira reserva deve continuar após 842 (o maior sufixo)
      const first = await reserveDespesaNumber(t.id);
      expect(Number(first.split("-").pop())).toBe(843);
    } finally {
      await db.delete(schema.tenants).where(eq(schema.tenants.id, t.id));
    }
  });
});
```

---

## 6. Perguntas

### a) A reserva é atômica? É `UPDATE ... RETURNING`, `SELECT` + `UPDATE` ou `SELECT MAX`? Há `FOR UPDATE`? Há transação envolvendo a criação da despesa?

A função inteira está colada na seção 4 (`src/lib/db/numbering.ts`). Resumo
literal do que ela faz, em ordem:

1. Abre `db.transaction`.
2. `SELECT ... LIMIT 1` na linha da sequência — **sem** `FOR UPDATE`
   (`numbering.ts:27–36`).
3. Se a linha não existe: calcula a semente com um varredura em memória sobre
   `despesa.num_doc` (`maxExistingDespesaNumber`, `numbering.ts:5–16` — é um
   `SELECT` de todas as linhas + regex em JS, **não** um `SELECT MAX` no
   banco), e insere com `.onConflictDoNothing()` (`numbering.ts:38–44`).
4. Reserva com **`UPDATE ... SET next_number = next_number + 1 ... RETURNING`**
   — statement único (`numbering.ts:46–58`).
5. Devolve `updated.nextNumber - 1` formatado.

Então: **a reserva em si é `UPDATE ... RETURNING`, statement único, atômica.**
O incremento é feito pelo próprio banco (`sql\`${...nextNumber} + 1\``), não
lido-e-reescrito pela aplicação, e o `UPDATE` toma lock de linha implícito. Não
há `FOR UPDATE` porque, para o incremento, ele não é necessário — o `SELECT` do
passo 2 serve só para decidir se precisa semear.

O trecho exato que garante a serialização:

```ts
    const [updated] = await tx
      .update(schema.numberSequences)
      .set({
        nextNumber: sql`${schema.numberSequences.nextNumber} + 1`,
        updatedAt: new Date(),
      })
      .where(
        and(
          eq(schema.numberSequences.tenantId, tenantId),
          eq(schema.numberSequences.entity, "despesa"),
        ),
      )
      .returning();
```

**Sobre a transação envolvendo a criação da despesa: não há.**

`reserveDespesaNumber` abre a **sua própria** transação, sempre contra o pool
`db` — nunca recebe um `tx` de fora. Consequências, por caminho:

- Em `addDespesa`, o número é reservado na linha `despesas.ts:326` e a despesa
  é inserida na linha `despesas.ts:372` com `db.insert(...)` — **fora de
  qualquer transação**. O comentário logo acima da chamada
  (`despesas.ts:323–325`) diz *"sempre reservado aqui, no servidor, dentro da
  transação"*, e o comentário do formulário (`despesa-form.tsx:622–623`) diz
  *"o PED é reservado no servidor, na transação de gravação"* — **não existe
  transação nesse caminho**. Se o `insert` da despesa falhar, o número já foi
  consumido e vira buraco na sequência.
- Nos caminhos que **estão** dentro de uma transação do chamador (acerto,
  restituições, compensação), a chamada é feita de dentro do callback, mas
  usando `db` e não `tx` — ou seja, roda numa **conexão e transação
  separadas**. Se a transação externa fizer rollback, a reserva do número
  **permanece** (commitada na sua própria transação) e o número também vira
  buraco.

Em nenhum dos 12 caminhos o número e a linha da despesa são gravados na mesma
transação.

### b) Existe `UNIQUE` em `despesa.num_doc`, em qualquer combinação de colunas?

**Não.** Ver a seção 5: a definição `pgTable("despesa", {...})` é chamada com um
único argumento (sem o array de constraints), a migração `0004` cria a coluna
como `text` nullable simples, e o snapshot `0038` mostra
`indexes: {}` / `uniqueConstraints: {}` / `compositePrimaryKeys: {}` para
`public.despesa`.

Não há unique nem em `num_doc` sozinho, nem em `(tenant_id, num_doc)`, nem em
nenhuma outra combinação. A unicidade depende inteiramente da sequência —
nada no banco impede duas linhas com o mesmo `num_doc`.

### c) O que acontece se dois lançamentos ocorrerem no mesmo instante?

Os dois recebem números distintos, **desde que a linha da sequência já exista**.
O que garante isso é o `UPDATE ... RETURNING` colado no item (a): o Postgres
serializa os dois `UPDATE` na mesma linha, cada um lê o valor já incrementado
pelo outro e devolve o seu próprio `RETURNING`.

O teste `numbering.test.ts:21–50` dispara 25 reservas simultâneas e afirma
`new Set(results).size === 25` e sequência contígua 1000..1024. Ele só roda com
`DATABASE_URL` definido (`describe.skipIf(!HAS_DB)`, linha 20).

Duas ressalvas visíveis no código:

1. **Na primeiríssima reserva de um tenant** (linha da sequência ainda não
   existe), dois lançamentos simultâneos podem passar juntos pelo `SELECT` do
   passo 2 e tentar inserir; o `.onConflictDoNothing()` (`numbering.ts:43`)
   impede o erro, mas quem perdeu a corrida **não relê a linha** — segue direto
   para o `UPDATE`, que opera sobre a linha vencedora. Isso não duplica número:
   os dois ainda acabam no mesmo `UPDATE ... RETURNING` serializado.
2. **A serialização é da sequência, não da despesa.** Como o número é commitado
   numa transação própria (item a), concorrência garante *números distintos*,
   mas não garante *sequência sem buracos*.

### d) Quando a semente do contador é calculada?

**No primeiro uso, e apenas uma vez** — não na criação do tenant, não a cada
chamada.

- Em `reserveDespesaNumber`, o `if (!seq)` (`numbering.ts:38`) só dispara
  `maxExistingDespesaNumber` quando a linha de `number_sequence` não existe.
  A partir da primeira reserva a linha existe e o cálculo nunca mais roda.
- Em `getDespesaSequence` (`numeracao.ts:42–52`), quando a linha não existe a
  tela mostra `max + 1` **sem gravar nada e sem consumir** — é só um preview.
  Cada abertura da tela recalcula esse máximo enquanto a linha não existir.
- Não há nenhuma criação de `number_sequence` no seed nem no cadastro de
  tenant: grep de `numberSequences` no repositório devolve apenas
  `actions/numeracao.ts`, `db/numbering.ts` e `db/numbering.test.ts`.

A semente é o maior sufixo numérico de qualquer `num_doc` do tenant, extraído
por regex em JavaScript (`/(\d+)\s*$/`) sobre **todas** as despesas do tenant
carregadas em memória — por isso `BMV-2026-000842` semeia 843, como afirma o
teste `numbering.test.ts:52–78`.

### e) O campo "Próximo número" aceita valor menor que o último emitido?

**Aceita.** A validação inteira da action é:

```ts
  const prefix = (patch.prefix || "").trim().slice(0, 12);
  const digits = Math.min(12, Math.max(1, Math.trunc(patch.digits) || 6));
  const nextNumber = Math.max(1, Math.trunc(patch.nextNumber) || 1);
```

(`src/lib/actions/numeracao.ts:61–63`)

São três clamps de forma: prefixo truncado em 12 caracteres, dígitos entre 1 e
12, e `nextNumber` com piso 1. **Não há nenhuma verificação contra o maior
`num_doc` já gravado** — nem na action, nem no formulário (o `<Input>` só tem
`min={1}`, `numeracao-form.tsx:76–82`). Salvar `nextNumber = 1` num tenant que
já emitiu até `PED-001682` é aceito, e as próximas despesas reemitem números
já usados — sem colidir com nada, já que não existe `UNIQUE` (item b).

### f) O que "Numeração automática ativa" desligado faz?

**Nada.** A flag é gravada e nunca lida no lançamento.

Onde `active` aparece no repositório inteiro:

| Arquivo:linha | O que faz |
|---|---|
| `src/lib/db/schema.ts:1343` | declaração da coluna, `default(true)` |
| `src/lib/actions/numeracao.ts:39` | devolve `seq.active` para a tela |
| `src/lib/actions/numeracao.ts:52` | default `active: true` no preview |
| `src/lib/actions/numeracao.ts:75`, `:85` | grava o valor (insert / onConflictDoUpdate) |
| `src/lib/actions/numeracao.ts:95` | vai para o `meta` do `logAudit` |
| `src/components/app/numeracao-form.tsx:99–107` | o checkbox da tela |

`reserveDespesaNumber` lê da linha retornada apenas `nextNumber`, `digits`,
`usePrefix` e `prefix`:

```ts
    const used = updated.nextNumber - 1;
    const num = String(used).padStart(updated.digits, "0");
    return updated.usePrefix && updated.prefix ? `${updated.prefix}-${num}` : num;
```

(`src/lib/db/numbering.ts:60–62`)

Nenhum dos 12 caminhos de lançamento consulta `active`. Com a flag desligada, o
próximo lançamento recebe número exatamente como antes.

### g) Trocar o prefixo faz o quê com a sequência?

**O contador continua de onde estava.** O prefixo é só formatação aplicada na
saída, na última linha da reserva (trecho citado em (f)): o valor numérico vem
de `next_number`, que o `updateDespesaSequence` só altera se o campo "Próximo
número" for alterado junto.

- O contador **não zera** ao trocar o prefixo.
- O contador **não é por prefixo**: a chave única é `(tenant_id, entity)` — ver
  item (h). Trocar de `PED` para `BMV` e voltar para `PED` não restaura nem
  bifurca nada; existe um único contador.

Consequência direta: se o prefixo mudar sem mexer no "Próximo número", a
numeração histórica continua, e `PED-001200` e `BMV-001201` são números
consecutivos da mesma sequência.

Vale notar que a semente de um tenant novo (item d) ignora o prefixo por
construção — a regex `/(\d+)\s*$/` pega só o sufixo numérico, seja qual for o
texto antes dele.

### h) `number_sequence` é por tenant, por projeto ou por versão?

**Por tenant e entidade.** A chave única:

```ts
  (t) => [unique("number_sequence_tenant_entity_uq").on(t.tenantId, t.entity)],
```

(`src/lib/db/schema.ts:1346`; no SQL, `0012_condemned_shiver_man.sql:11`)

A tabela **não tem** coluna `project_id` nem `version_id`. `entity` é sempre
`"despesa"` em todo o código (`numbering.ts:33`, `:42`, `:55`;
`numeracao.ts:29`, `:70`, `:79`).

Portanto: um único contador por empresa, compartilhado por **todas as obras** e
**todas as versões**. Os PEDs de SIGNATURE SUARÃO e de qualquer outra obra do
mesmo tenant saem da mesma sequência, intercalados.

### i) Despesa excluída ou cancelada libera o número?

**Não, em nenhum dos dois casos.** Nenhuma das duas funções toca
`number_sequence` — grep de `numberSequences` confirma que só `numeracao.ts`,
`numbering.ts` e o teste referenciam a tabela.

#### `src/lib/actions/despesas.ts:663–687` — `deleteDespesa`

```ts
/** Exclui uma despesa já lançada (documentos vinculados caem em cascata). */
export async function deleteDespesa(id: string) {
  const ctx = await getActiveContext();
  if (!ctx || !can(ctx.perms, "despesas", "excluir")) return;

  const [existing] = await db
    .select()
    .from(schema.despesas)
    .where(
      and(eq(schema.despesas.id, id), eq(schema.despesas.tenantId, ctx.tenant.id)),
    )
    .limit(1);
  if (!existing) return;

  await db.delete(schema.despesas).where(eq(schema.despesas.id, id));
  await logAudit({
    tenantId: ctx.tenant.id,
    userId: ctx.userId,
    action: "despesa.delete",
    entity: "despesa",
    entityId: id,
    meta: { valor: existing.valor, numDoc: existing.numDoc },
  });
  revalidatePath("/despesas");
}
```

A linha é apagada fisicamente (`despesas.ts:677`). O `num_doc` some junto com
ela — sobrevive apenas no `meta` do log de auditoria
(`meta: { valor, numDoc }`, `despesas.ts:684`). O contador não recua, e o
número **nunca** será reemitido enquanto ninguém editar "Próximo número" à mão.

#### `src/lib/actions/despesas.ts:689–732` — `cancelarDespesa`

```ts
/**
 * Cancelamento lógico de uma despesa: preserva o histórico para auditoria, mas
 * a remove de saldos, relatórios, fluxo de caixa e contas a pagar. Preferível
 * à exclusão física.
 */
export async function cancelarDespesa(id: string, motivo: string) {
  const ctx = await getActiveContext();
  if (!ctx || !can(ctx.perms, "despesas", "excluir")) {
    throw new Error("Sem permissão para cancelar despesas.");
  }
  const [existing] = await db
    .select()
    .from(schema.despesas)
    .where(and(eq(schema.despesas.id, id), eq(schema.despesas.tenantId, ctx.tenant.id)))
    .limit(1);
  if (!existing) throw new Error("Despesa não encontrada.");
  if (existing.cancelado) return;

  const hoje = new Date();
  const canceladoEm = `${String(hoje.getMonth() + 1).padStart(2, "0")}/${String(hoje.getDate()).padStart(2, "0")}/${hoje.getFullYear()}`;
  await db
    .update(schema.despesas)
    .set({
      cancelado: true,
      canceladoEm,
      canceladoPor: ctx.userEmail || ctx.userId || null,
      motivoCancelamento: motivo?.trim() || null,
      status: "Cancelada",
    })
    .where(eq(schema.despesas.id, id));
  await logAudit({
    tenantId: ctx.tenant.id,
    userId: ctx.userId,
    action: "despesa.cancel",
    entity: "despesa",
    entityId: id,
    meta: { motivo: motivo?.trim() || null, valor: existing.valor, numDoc: existing.numDoc },
  });
  revalidatePath("/despesas");
  revalidatePath("/contaspagar");
  revalidatePath("/caixa");
  revalidatePath("/dre");
  revalidatePath("/fluxocaixa");
}
```

No cancelamento o `num_doc` é **preservado intacto** — o `set` (linhas 711–717)
mexe só em `cancelado`, `canceladoEm`, `canceladoPor`, `motivoCancelamento` e
`status`. A linha continua no banco com o número, e o contador segue adiante.

O docstring da própria `reserveDespesaNumber` afirma isso explicitamente:
*"nunca duplicados, nunca reutilizando números excluídos"*
(`src/lib/db/numbering.ts:18–24`).

### j) Qual permissão governa a tela? Está em `SCREENS`? A action verifica no servidor?

**Sim, está em `SCREENS`**, e é governada tanto centralmente quanto na página e
na action.

#### `src/lib/permissions.ts:71`

```ts
  { id: "numeracao", label: "Numeração de Despesas", modulo: "Config" },
```

Três camadas:

1. **Enforcement central** — `src/app/(app)/layout.tsx:92–95` mapeia a rota
   para a tela e nega o "Ver":

```tsx
  // Enforcement central de "Ver": mapeia a rota atual para a tela governada.
  const pathname = (await headers()).get("x-pathname");
  const screenId = screenIdOfPath(pathname);
  const denied = screenId ? !can(ctx.perms, screenId, "ver") : false;
```

   Como `"numeracao"` está em `SCREEN_IDS`, `screenIdOfPath("/numeracao")`
   devolve `"numeracao"` (`permissions.ts:138–142`) e a rota é coberta — ao
   contrário de `/acerto` e `/diagnostico`, cujos ids não estão na lista.

2. **Na página** — `numeracao/page.tsx:13` repete o `can(..., "numeracao", "ver")`
   e devolve `<AccessDenied />`; `:24` passa
   `canEdit={can(ctx.perms, "numeracao", "editar")}` ao formulário (que só
   desabilita os campos e esconde o botão).

3. **Na action, no servidor** — `src/lib/actions/numeracao.ts:57–60`:

```ts
  const ctx = await getActiveContext();
  if (!ctx || !can(ctx.perms, "numeracao", "editar")) {
    throw new Error("Sem permissão para configurar a numeração.");
  }
```

   Essa é a barreira real: mesmo forjando a chamada da Server Action sem passar
   pela tela, sem `numeracao:editar` ela lança.

Ponto para registro: **`getDespesaSequence` não verifica permissão nenhuma** —
recebe `tenantId` por argumento e lê a linha (`numeracao.ts:20–53`). Como ela é
exportada de um arquivo `"use server"`, é uma Server Action invocável
diretamente, com o `tenantId` escolhido por quem chama. O que ela devolve é a
configuração de numeração (prefixo, dígitos, próximo número) — não dados
financeiros — mas a leitura não é barrada nem por permissão nem por tenant.

Perfis padrão (`permissions.ts:96–112`): `owner` e `admin` têm `FULL`;
`membro` recebe `NONE` porque o módulo é `Config`; `engenheiro` recebe `NONE`
(só `medicaolanc`); `contador` recebe `NONE` porque `"numeracao"` não está em
`CONTADOR_VE` (`permissions.ts:84–93`). Ou seja, na prática só owner/admin — ou
quem receber override explícito — enxerga a tela.

### k) A alteração grava `logAudit` com valor anterior e novo?

**Sim.** `src/lib/actions/numeracao.ts:64` lê o estado anterior **antes** do
`upsert`, e o `logAudit` das linhas 90–96 grava os dois lados:

```ts
  await logAudit({
    tenantId: ctx.tenant.id,
    userId: ctx.userId,
    action: "numeracao.update",
    entity: "number_sequence",
    meta: { before, after: { prefix, usePrefix: !!patch.usePrefix, digits, nextNumber, active: !!patch.active } },
  });
```

`before` vem de `getDespesaSequence` e traz os cinco campos
(`prefix`, `usePrefix`, `digits`, `nextNumber`, `active`); `after` traz os
mesmos cinco já normalizados. `action = "numeracao.update"`,
`entity = "number_sequence"`, **sem `entityId`**. O `logAudit` grava o `meta`
como JSON (`src/lib/audit.ts:15–22`).

---

## 7. As consultas SQL

**Não foi possível rodar.** Este ambiente de sessão não tem `DATABASE_URL`
definido (`echo "$DATABASE_URL"` devolve vazio), então não há como abrir conexão
com o banco de produção daqui. Não vou inventar números.

Seguem as três consultas, somente leitura, prontas para rodar. Todas assumem que
você substitui `:tenant_id` pelo UUID do tenant (ou remove o filtro, se quiser
varrer tudo).

### 7.1 — Números repetidos

```sql
SELECT num_doc,
       COUNT(*)                                   AS ocorrencias,
       SUM(CASE WHEN cancelado THEN 1 ELSE 0 END) AS canceladas,
       MIN(created_at)                            AS primeiro_lancamento,
       MAX(created_at)                            AS ultimo_lancamento
  FROM despesa
 WHERE tenant_id = :tenant_id
   AND num_doc IS NOT NULL
 GROUP BY num_doc
HAVING COUNT(*) > 1
 ORDER BY COUNT(*) DESC, num_doc;
```

Detalhamento linha a linha dos repetidos, para inspeção:

```sql
SELECT d.num_doc, d.id, d.competencia, d.vencimento, d.valor,
       d.status, d.cancelado, d.created_at, p.name AS obra
  FROM despesa d
  JOIN version v ON v.id = d.version_id
  JOIN project p ON p.id = v.project_id
 WHERE d.tenant_id = :tenant_id
   AND d.num_doc IN (
        SELECT num_doc FROM despesa
         WHERE tenant_id = :tenant_id AND num_doc IS NOT NULL
         GROUP BY num_doc HAVING COUNT(*) > 1)
 ORDER BY d.num_doc, d.created_at;
```

### 7.2 — O contador contra a realidade

```sql
WITH maior AS (
  SELECT MAX((regexp_match(num_doc, '(\d+)\s*$'))[1]::bigint) AS maior_emitido,
         COUNT(*)                                             AS despesas_numeradas
    FROM despesa
   WHERE tenant_id = :tenant_id
     AND num_doc ~ '\d+\s*$'
)
SELECT s.prefix,
       s.use_prefix,
       s.digits,
       s.next_number                     AS proximo_configurado,
       s.active,
       s.updated_at,
       m.maior_emitido,
       m.despesas_numeradas,
       s.next_number - 1 - m.maior_emitido AS folga
  FROM number_sequence s
 CROSS JOIN maior m
 WHERE s.tenant_id = :tenant_id
   AND s.entity = 'despesa';
```

Leitura do resultado: `folga = 0` significa contador alinhado (o próximo número
é exatamente o seguinte ao maior já emitido). `folga < 0` significa que o
contador está **atrás** da realidade — os próximos lançamentos vão reemitir
números já usados. `folga > 0` significa buracos na sequência (números
reservados e perdidos, ver item a).

Se a consulta não devolver nenhuma linha, a linha de `number_sequence` ainda não
existe para esse tenant — nunca houve reserva nem configuração salva.

Os outros dois consumidores da sequência gravam em tabelas próprias; para ver o
quadro completo do contador:

```sql
SELECT 'despesa' AS tabela, num_doc FROM despesa      WHERE tenant_id = :tenant_id AND num_doc IS NOT NULL
UNION ALL
SELECT 'acerto',            num_doc FROM acerto       WHERE tenant_id = :tenant_id AND num_doc IS NOT NULL
UNION ALL
SELECT 'compensacao',       num_doc FROM compensacao  WHERE tenant_id = :tenant_id AND num_doc IS NOT NULL
 ORDER BY 2;
```

### 7.3 — Despesas sem número

```sql
SELECT p.name       AS obra,
       v.label      AS versao,
       d.competencia,
       COUNT(*)     AS despesas_sem_numero,
       SUM(d.valor) AS valor_total
  FROM despesa d
  JOIN version v ON v.id = d.version_id
  JOIN project p ON p.id = v.project_id
 WHERE d.tenant_id = :tenant_id
   AND (d.num_doc IS NULL OR btrim(d.num_doc) = '')
 GROUP BY p.name, v.label, d.competencia
 ORDER BY p.name, v.label, d.competencia;
```

Total e recorte por cancelamento:

```sql
SELECT COUNT(*) FILTER (WHERE num_doc IS NULL OR btrim(num_doc) = '')  AS sem_numero,
       COUNT(*) FILTER (WHERE num_doc IS NOT NULL
                          AND btrim(num_doc) <> ''
                          AND num_doc !~ '\d+\s*$')                  AS numero_sem_sufixo_numerico,
       COUNT(*)                                                       AS total_despesas
  FROM despesa
 WHERE tenant_id = :tenant_id;
```

A segunda coluna importa porque a semente do contador (item d) **ignora**
qualquer `num_doc` que não termine em dígitos.

Origem provável das despesas sem número, para referência ao ler o resultado:
`importVersionData` (`src/lib/actions/version-io.ts:86–95`) insere despesas
importadas **sem** `numDoc`, e a coluna é nullable desde a migração `0004`.
