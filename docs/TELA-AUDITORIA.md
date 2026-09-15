# Tela — Log de Auditoria (`/acoes`)

Coleta de código, sem análise. Cada arquivo aparece com o caminho como
cabeçalho. Trechos parciais trazem a faixa de linhas no título do bloco.

Base: branch `claude/contexto-revisao`.

---

## 1. A página

### `src/app/(app)/acoes/page.tsx`

```tsx
import { getActiveContext } from "@/lib/context";
import { getAuditLog, getMembers } from "@/lib/queries";
import { PageHeader } from "@/components/app/page-header";
import { Badge } from "@/components/ui/badge";
import { Table, THead, TH, TR, TD } from "@/components/ui/table";

export const dynamic = "force-dynamic";

/** Renderiza o meta de auditoria; destaca alterações campo a campo (de → para). */
function renderMeta(meta: unknown) {
  if (!meta || typeof meta !== "object") return meta ? String(meta) : "—";
  const m = meta as Record<string, unknown>;
  const changes = m.changes as Record<string, { de: unknown; para: unknown }> | undefined;
  if (changes && Object.keys(changes).length > 0) {
    return (
      <div className="space-y-0.5">
        {Object.entries(changes).map(([k, v]) => (
          <div key={k}>
            <span className="text-[var(--color-ink2)]">{k}</span>:{" "}
            <span className="text-[var(--color-danger)]">{String(v.de ?? "—")}</span>
            {" → "}
            <span className="text-[var(--color-success)]">{String(v.para ?? "—")}</span>
          </div>
        ))}
      </div>
    );
  }
  return <span className="break-words">{JSON.stringify(meta)}</span>;
}

export default async function AcoesPage() {
  const ctx = await getActiveContext();
  if (!ctx) return null;

  const [audit, members] = await Promise.all([
    getAuditLog(ctx.tenant.id, 200),
    getMembers(ctx.tenant.id),
  ]);
  const nameById = new Map(members.map((m) => [m.userId, m.name ?? m.email]));

  return (
    <>
      <PageHeader
        title="Log de Auditoria"
        subtitle={`${audit.length} eventos recentes · quem alterou o quê`}
      />
      <Table>
        <THead>
          <tr>
            <TH>Quando</TH>
            <TH>Usuário</TH>
            <TH>Ação</TH>
            <TH>Entidade</TH>
            <TH>Detalhes</TH>
          </tr>
        </THead>
        <tbody>
          {audit.map((a) => (
            <TR key={a.id}>
              <TD className="whitespace-nowrap font-[family-name:var(--font-mono)] text-[var(--color-ink3)]">
                {a.createdAt.toLocaleString("pt-BR")}
              </TD>
              <TD>{a.userId ? nameById.get(a.userId) ?? "—" : "sistema"}</TD>
              <TD>
                <Badge tone="accent">{a.action}</Badge>
              </TD>
              <TD className="font-[family-name:var(--font-mono)]">
                {a.entity}
                {a.entityId ? ` · ${a.entityId.slice(0, 8)}` : ""}
              </TD>
              <TD className="max-w-[360px] font-[family-name:var(--font-mono)] text-[11px] text-[var(--color-ink3)]">
                {renderMeta(a.meta)}
              </TD>
            </TR>
          ))}
          {audit.length === 0 && (
            <TR>
              <TD colSpan={5} className="py-6 text-center text-[var(--color-ink3)]">
                Sem eventos de auditoria ainda.
              </TD>
            </TR>
          )}
        </tbody>
      </Table>
    </>
  );
}
```

---

## 2. Componentes próprios que a página importa (recursivamente)

```
src/app/(app)/acoes/page.tsx
├── @/lib/context                → getActiveContext
├── @/lib/queries                → getAuditLog, getMembers            (seção 5)
├── @/components/app/page-header → PageHeader
├── @/components/ui/badge        → Badge
└── @/components/ui/table        → Table, THead, TH, TR, TD
```

É a árvore mais rasa das telas coletadas até aqui: **nenhum componente
`"use client"`**, nenhum formulário, nenhuma Server Action. A página é um
Server Component que lê e imprime. A única lógica própria é a função local
`renderMeta` (`acoes/page.tsx:10–29`), que não é exportada.

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

### `src/components/ui/badge.tsx`

```tsx
import * as React from "react";
import { cva, type VariantProps } from "class-variance-authority";
import { cn } from "@/lib/utils";

const badgeVariants = cva(
  "inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-medium font-[family-name:var(--font-mono)]",
  {
    variants: {
      tone: {
        neutral: "bg-[var(--color-surface3)] text-[var(--color-ink2)]",
        accent: "bg-[var(--color-accent4)] text-[var(--color-accent)]",
        success: "bg-[#d1fae5] text-[#065f46]",
        warning: "bg-[#fef3c7] text-[#92400e]",
        danger: "bg-[#fee2e2] text-[#991b1b]",
        info: "bg-[#dbeafe] text-[#1e40af]",
      },
    },
    defaultVariants: { tone: "neutral" },
  },
);

export interface BadgeProps
  extends React.HTMLAttributes<HTMLSpanElement>,
    VariantProps<typeof badgeVariants> {}

export function Badge({ className, tone, ...props }: BadgeProps) {
  return <span className={cn(badgeVariants({ tone }), className)} {...props} />;
}

/** Mapeia o status de unidade para o tom do badge. */
export function unitStatusTone(
  status: string,
): "success" | "warning" | "neutral" {
  if (status === "Vendido") return "success";
  if (status === "Reservado") return "warning";
  return "neutral";
}
```

### `src/components/ui/table.tsx`

```tsx
import * as React from "react";
import { cn } from "@/lib/utils";

export function Table({
  className,
  wrapperClassName,
  ...props
}: React.TableHTMLAttributes<HTMLTableElement> & {
  /**
   * Classes extras no contêiner de rolagem (ex.: `max-h-[70vh]` para limitar a
   * altura e manter a barra de rolagem horizontal sempre visível, em vez de só
   * no fim da página).
   */
  wrapperClassName?: string;
}) {
  return (
    <div
      className={cn(
        "tbl-scroll w-full overflow-auto rounded-[12px] border border-[var(--color-accent2)]/12 bg-white",
        wrapperClassName,
      )}
    >
      <table className={cn("w-full border-collapse text-sm", className)} {...props} />
    </div>
  );
}

export function THead({
  className,
  ...props
}: React.HTMLAttributes<HTMLTableSectionElement>) {
  return (
    <thead
      className={cn(
        "border-b border-[var(--color-accent2)]/12 bg-[var(--color-surface2)]",
        className,
      )}
      {...props}
    />
  );
}

export function TH({
  className,
  ...props
}: React.ThHTMLAttributes<HTMLTableCellElement>) {
  return (
    <th
      className={cn(
        "px-3 py-2.5 text-left font-[family-name:var(--font-mono)] text-[10px] font-medium uppercase tracking-wide text-[var(--color-ink3)]",
        className,
      )}
      {...props}
    />
  );
}

export function TR({
  className,
  ...props
}: React.HTMLAttributes<HTMLTableRowElement>) {
  return (
    <tr
      className={cn(
        "border-b border-[var(--color-accent2)]/8 last:border-0 hover:bg-[var(--color-surface2)]/60",
        className,
      )}
      {...props}
    />
  );
}

export function TD({
  className,
  ...props
}: React.TdHTMLAttributes<HTMLTableCellElement>) {
  return (
    <td className={cn("px-3 py-2.5 text-[var(--color-ink2)]", className)} {...props} />
  );
}
```

---

## 3. `src/lib/audit.ts` e `src/lib/audit-diff.ts` inteiros

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

### `src/lib/audit-diff.ts`

```ts
/**
 * Diff campo a campo para a trilha de auditoria — RG-09.
 *
 * A regra exige que toda alteração em documento com efeito contábil registre
 * `usuario`, `timestamp`, `campo`, `valor_anterior` e `valor_novo`. Usuário e
 * timestamp já são colunas de `audit_log`; o que faltava era o par
 * anterior/novo POR CAMPO — sem ele, o log diz que alguém editou uma despesa,
 * mas não o que mudou, que é justamente o que a conferência precisa.
 *
 * O diff vai dentro de `meta` (JSONB) em vez de virar colunas novas: uma
 * alteração mexe em vários campos de uma vez, e uma linha de log por campo
 * multiplicaria o volume do log sem ganho de leitura. Além disso não exige
 * migração numa tabela em produção.
 *
 * Módulo puro e sem dependência de banco, para poder ser testado direto.
 */

/** Uma alteração de campo: valor anterior e valor novo. */
export interface MudancaCampo {
  de: unknown;
  para: unknown;
}

export type DiffAuditoria = Record<string, MudancaCampo>;

/**
 * Normaliza um valor para comparação.
 *
 * `undefined`, `null` e string vazia representam a mesma coisa no banco
 * (coluna nula) e não podem ser reportados como alteração. Datas viram ISO e
 * valores numéricos em `numeric` chegam como string do Postgres ("100.00"),
 * então comparar `"100.00"` com `100` daria falso positivo — ambos viram
 * número quando a string é numérica.
 */
function normalizar(v: unknown): unknown {
  if (v === undefined || v === null || v === "") return null;
  if (v instanceof Date) return v.toISOString();
  if (typeof v === "string") {
    const t = v.trim();
    if (t === "") return null;
    // "100.00" e 100 são o mesmo valor gravado — não é alteração.
    if (/^-?\d+(\.\d+)?$/.test(t)) return Number(t);
    return t;
  }
  return v;
}

/** Dois valores representam a mesma coisa gravada? */
export function mesmoValor(a: unknown, b: unknown): boolean {
  const na = normalizar(a);
  const nb = normalizar(b);
  if (na === nb) return true;
  if (typeof na === "object" && typeof nb === "object" && na && nb) {
    return JSON.stringify(na) === JSON.stringify(nb);
  }
  return false;
}

/**
 * Compara o registro ANTES com o patch que está sendo aplicado e devolve só os
 * campos que realmente mudaram.
 *
 * Percorre as chaves do PATCH, não as do registro: um `set` parcial não deve
 * reportar como alterados os campos que ele nem toca. Devolve `{}` quando nada
 * mudou de fato — o chamador pode usar isso para não gravar log vazio.
 */
export function diffAudit(
  antes: Record<string, unknown> | null | undefined,
  patch: Record<string, unknown>,
): DiffAuditoria {
  const out: DiffAuditoria = {};
  const base = antes ?? {};
  for (const campo of Object.keys(patch)) {
    const de = base[campo];
    const para = patch[campo];
    if (mesmoValor(de, para)) continue;
    out[campo] = { de: normalizar(de), para: normalizar(para) };
  }
  return out;
}

/** Houve alteração real? */
export function houveMudanca(diff: DiffAuditoria): boolean {
  return Object.keys(diff).length > 0;
}
```

### `src/lib/audit-diff.test.ts`

```ts
import { describe, it, expect } from "vitest";
import { diffAudit, houveMudanca, mesmoValor } from "./audit-diff";

describe("mesmoValor", () => {
  it("nulo, indefinido e string vazia são o mesmo valor gravado", () => {
    expect(mesmoValor(null, undefined)).toBe(true);
    expect(mesmoValor(null, "")).toBe(true);
    expect(mesmoValor("", "   ")).toBe(true);
  });

  it('"100.00" e 100 são o mesmo valor — numeric do Postgres chega como string', () => {
    expect(mesmoValor("100.00", 100)).toBe(true);
    expect(mesmoValor("1234.56", 1234.56)).toBe(true);
    expect(mesmoValor("100.00", 100.01)).toBe(false);
  });

  it("ignora espaços em volta de texto", () => {
    expect(mesmoValor(" Custo Fixo ", "Custo Fixo")).toBe(true);
  });

  it("distingue valores realmente diferentes", () => {
    expect(mesmoValor("A pagar", "Pago")).toBe(false);
    expect(mesmoValor(null, "Pago")).toBe(false);
  });
});

describe("diffAudit", () => {
  const antes = {
    valor: "1000.00",
    status: "A pagar",
    competencia: "08/2026",
    obs: null,
    numDoc: "PED-000119",
  };

  it("registra só os campos que mudaram, com de/para", () => {
    const d = diffAudit(antes, { status: "Pago", valor: "1000.00" });
    expect(d).toEqual({ status: { de: "A pagar", para: "Pago" } });
  });

  it("não reporta campos que o patch nem toca", () => {
    const d = diffAudit(antes, { obs: "conferido" });
    expect(Object.keys(d)).toEqual(["obs"]);
    expect(d.obs).toEqual({ de: null, para: "conferido" });
  });

  it("mudança de valor monetário aparece como número nos dois lados", () => {
    const d = diffAudit(antes, { valor: "1500.00" });
    expect(d.valor).toEqual({ de: 1000, para: 1500 });
  });

  it("patch idêntico ao estado atual não gera nenhum registro", () => {
    const d = diffAudit(antes, { status: "A pagar", competencia: "08/2026" });
    expect(d).toEqual({});
    expect(houveMudanca(d)).toBe(false);
  });

  it("limpar um campo (para nulo) é registrado", () => {
    const d = diffAudit({ ...antes, obs: "algo" }, { obs: null });
    expect(d.obs).toEqual({ de: "algo", para: null });
  });

  it("preencher um campo antes vazio é registrado", () => {
    const d = diffAudit(antes, { obs: "nota chegou" });
    expect(d.obs).toEqual({ de: null, para: "nota chegou" });
  });

  it("registro anterior ausente trata tudo como preenchimento novo", () => {
    const d = diffAudit(null, { valor: "50.00" });
    expect(d.valor).toEqual({ de: null, para: 50 });
  });

  it("houveMudanca reflete o diff", () => {
    expect(houveMudanca(diffAudit(antes, { status: "Pago" }))).toBe(true);
    expect(houveMudanca({})).toBe(false);
  });
});
```

---

## 4. A tabela `audit_log` no schema

### `src/lib/db/schema.ts:1300–1320`

```ts
// ─────────────────────────────── Auditoria ──────────────────────────────

/**
 * Log de auditoria: registra quem alterou o quê (ver docs/SPEC.md §12.7).
 * Append-only; preenchido pela camada de Server Actions.
 */
export const auditLog = pgTable("audit_log", {
  id: uuid("id").primaryKey().defaultRandom(),
  tenantId: uuid("tenant_id")
    .notNull()
    .references(() => tenants.id, { onDelete: "cascade" }),
  userId: text("user_id").references(() => users.id, { onDelete: "set null" }),
  /** ação executada, ex.: "despesa.create". */
  action: text("action").notNull(),
  /** entidade afetada, ex.: "despesa". */
  entity: text("entity").notNull(),
  entityId: text("entity_id"),
  /** detalhes (diff/resumo) em JSON. */
  meta: jsonb("meta"),
  createdAt: timestamp("created_at", { mode: "date" }).notNull().defaultNow(),
});
```

`pgTable("audit_log", {...})` é chamada com **um único argumento** — sem o
segundo parâmetro `(t) => [...]`, portanto sem índices nem constraints
compostas declarados.

Conferido em `src/lib/db/migrations/meta/0038_snapshot.json`:

```
TABLE public.audit_log
  colunas: id, tenant_id, user_id, action, entity, entity_id, meta, created_at
  indexes: {}
  uniqueConstraints: {}
  compositePrimaryKeys: {}
  FK ['tenant_id'] -> tenant ['id'] ON DELETE cascade
  FK ['user_id']   -> user   ['id'] ON DELETE set null
```

**Zero índices.** A única estrutura de acesso é a primary key em `id`
(`uuid`, `defaultRandom`). A consulta da tela filtra por `tenant_id` e ordena
por `created_at DESC` (seção 5) — nenhuma das duas colunas é indexada.

Colunas, uma a uma:

| Coluna | Tipo | Nulável | Observação |
|---|---|---|---|
| `id` | `uuid` PK | não | `defaultRandom()` |
| `tenant_id` | `uuid` FK → `tenant` | **não** | `ON DELETE cascade` — apagar o tenant apaga o log |
| `user_id` | `text` FK → `user` | sim | `ON DELETE set null` — apagar o usuário anonimiza o evento |
| `action` | `text` | **não** | ex.: `"despesa.create"` |
| `entity` | `text` | **não** | ex.: `"despesa"` |
| `entity_id` | `text` | sim | **sem FK** — string solta |
| `meta` | `jsonb` | sim | detalhes livres |
| `created_at` | `timestamp` | não | `defaultNow()` |

---

## 5. A função de consulta que alimenta a tela

### `src/lib/queries.ts:1560–1572`

```ts
export type AuditRow = typeof schema.auditLog.$inferSelect;

export async function getAuditLog(
  tenantId: string,
  limit = 20,
): Promise<AuditRow[]> {
  return db
    .select()
    .from(schema.auditLog)
    .where(eq(schema.auditLog.tenantId, tenantId))
    .orderBy(desc(schema.auditLog.createdAt))
    .limit(limit);
}
```

A tela também usa `getMembers`, para traduzir `user_id` em nome:

### `src/lib/queries.ts:1461–1491`

```ts
export interface MemberRow {
  userId: string;
  name: string | null;
  email: string | null;
  role: string;
  permissions: import("@/lib/permissions").PermMatrix | null;
  mfaEnabled: boolean;
  /** já definiu senha? (senão, ainda não consegue logar). */
  hasPassword: boolean;
}

export async function getMembers(tenantId: string): Promise<MemberRow[]> {
  const rows = await db
    .select({
      userId: schema.memberships.userId,
      name: schema.users.name,
      email: schema.users.email,
      role: schema.memberships.role,
      permissions: schema.memberships.permissions,
      mfaEnabled: schema.users.mfaEnabled,
      passwordHash: schema.users.passwordHash,
    })
    .from(schema.memberships)
    .innerJoin(schema.users, eq(schema.users.id, schema.memberships.userId))
    .where(eq(schema.memberships.tenantId, tenantId))
    .orderBy(asc(schema.memberships.createdAt));
  return rows.map(({ passwordHash, ...m }) => ({
    ...m,
    hasPassword: Boolean(passwordHash),
  }));
}
```

---

## 6. Perguntas

### a) Por que `"changes":{}` aparece? Quais campos `diffAudit` compara em `updateDespesa`?

`diffAudit` inteira está colada na seção 3. O ponto que produz o `{}`
(`audit-diff.ts:67–80`):

```ts
export function diffAudit(
  antes: Record<string, unknown> | null | undefined,
  patch: Record<string, unknown>,
): DiffAuditoria {
  const out: DiffAuditoria = {};
  const base = antes ?? {};
  for (const campo of Object.keys(patch)) {
    const de = base[campo];
    const para = patch[campo];
    if (mesmoValor(de, para)) continue;
    out[campo] = { de: normalizar(de), para: normalizar(para) };
  }
  return out;
}
```

Ela percorre as chaves do **patch**, não as do registro, e pula tudo que
`mesmoValor` considerar igual. Quando o formulário reenvia os mesmos valores,
todas as chaves são puladas e o retorno é `{}` — um objeto vazio, que a action
grava assim mesmo.

O que a tela faz com isso (`acoes/page.tsx:14`):

```tsx
  if (changes && Object.keys(changes).length > 0) {
```

Com `{}` a condição é falsa, então cai no `return` seguinte
(`acoes/page.tsx:28`) e a coluna Detalhes imprime o JSON cru:
`{"changes":{}}`. É exatamente o texto que aparece na tela.

**Quais campos `diffAudit` compara em `updateDespesa`:** os que estiverem em
`set`, e `set` é montado campo a campo a partir de `DespesaPatch`
(`despesas.ts:615–641`):

```ts
  const set: Partial<typeof schema.despesas.$inferInsert> = {};
  if (patch.fornecedorId !== undefined) set.fornecedorId = patch.fornecedorId || null;
  if (patch.bancoId !== undefined) set.bancoId = patch.bancoId || null;
  if (patch.contaCef !== undefined) set.contaCef = patch.contaCef || null;
  if (patch.categoriaDre !== undefined) {
    // Item 1.3 / RG-01 — nem na edição uma despesa pode passar para conta de
    // natureza credora.
    const erro = validarCategoriaDespesa(patch.categoriaDre);
    if (erro) throw new Error(erro);
    set.categoriaDre = patch.categoriaDre as CategoriaDRE;
  }
  // RG-06 — o PED é imutável depois de criado. Renumerar um documento já
  // emitido quebraria a conferência com a contabilidade e com os anexos que o
  // referenciam. Um número enviado igual ao atual é ignorado em silêncio (o
  // formulário pode reenviá-lo); diferente, é recusado.
  if (patch.numDoc !== undefined && (patch.numDoc?.trim() || null) !== existing.numDoc) {
    throw new Error(
      "O nº do pedido (PED) é numeração interna e não pode ser alterado. Para corrigir o número da nota, use o campo de documento fiscal.",
    );
  }
  if (patch.competencia !== undefined) set.competencia = patch.competencia || null;
  if (patch.vencimento !== undefined) set.vencimento = patch.vencimento || null;
  if (patch.valor !== undefined) set.valor = patch.valor.trim() || "0";
  if (patch.status !== undefined) set.status = patch.status || null;
  if (patch.obs !== undefined) set.obs = patch.obs || null;
  if (patch.formaPagamento !== undefined) set.formaPagamento = patch.formaPagamento || null;
  if (Object.keys(set).length === 0) return;

  // Auditoria campo a campo (RG-09): valor anterior × novo. O helper normaliza
  // nulo/vazio e numeric-como-string, senão reeditar sem mudar nada registraria
  // "alterações" que não houve.
  const changes = diffAudit(
    existing as unknown as Record<string, unknown>,
    set as Record<string, unknown>,
  );
```

São **10 colunas** no máximo: `fornecedorId`, `bancoId`, `contaCef`,
`categoriaDre`, `competencia`, `vencimento`, `valor`, `status`, `obs`,
`formaPagamento`.

`numDoc` é o 11º campo de `DespesaPatch`, mas **nunca entra em `set`** — a
linha 630 apenas o compara com o valor existente e lança erro se for diferente
(RG-06, o PED é imutável). Logo, ele jamais pode aparecer em `changes`.

**Colunas de `despesa` que ficam de fora da comparação.** A tabela tem 36
colunas (`schema.ts:564–616`); 10 são comparadas, 26 não:

| Coluna | Linha | Por quê fica de fora |
|---|---|---|
| `id`, `version_id`, `tenant_id` | 565, 566, 569 | identidade/escopo — não editáveis por esta action |
| `num_doc` | 573 | validado e recusado, nunca gravado (RG-06) |
| `data_caixa` | 585 | alterada por `pagarDespesa` e pelas actions de caixa |
| `forma_pagamento_desc` | 591 | não está em `DespesaPatch` |
| `condicao_pagamento` | 592 | idem |
| `qtd_parcelas` | 593 | idem |
| `data_emissao` | 594 | idem |
| `boleto_linha_digitavel`, `boleto_codigo_barras`, `boleto_banco` | 596–598 | idem |
| `cheque_numero`, `cheque_banco`, `cheque_ag`, `cheque_conta`, `cheque_emitente`, `cheque_data_emissao`, `cheque_data_compensacao`, `cheque_status` | 600–607 | idem — 8 colunas |
| `pago_por_terceiro` | 609 | gravada só no `addDespesa` |
| `cancelado`, `cancelado_em`, `cancelado_por`, `motivo_cancelamento` | 611–614 | gravadas por `cancelarDespesa` |
| `created_at` | 615 | imutável |

Ou seja: **editar boleto, cheque, condição de pagamento ou data de emissão de
uma despesa não passa por `updateDespesa`** e, portanto, não gera diff nesta
action. Quem mexe em cheque e boleto por parcela é outra estrutura
(`despesa_parcela`); quem mexe em `data_caixa` é `pagarDespesa` e as actions de
conciliação, cada uma com seu próprio `meta`.

Vale registrar o outro caminho de normalização que evita falso positivo
(`audit-diff.ts:35–46`): `null`, `undefined` e `""` viram a mesma coisa, `Date`
vira ISO e string numérica vira número — é o que impede `"100.00"` × `100`
de aparecer como alteração num campo `numeric`.

### b) `updateDespesa` grava log mesmo quando nada mudou?

**Grava.** A única guarda é contra patch **vazio**, não contra patch
**inalterado** (`despesas.ts:641`):

```ts
  if (Object.keys(set).length === 0) return;
```

`set` só fica vazio se o chamador não enviar nenhuma das 10 chaves. O
formulário de despesa envia o patch completo, então `set` tem 10 chaves mesmo
quando o usuário não tocou em nada — a condição passa, o `update` roda
(gravando os mesmos valores) e o `logAudit` é chamado com
`meta: { changes: {} }`.

Não existe em `updateDespesa` nenhum `if (houveMudanca(changes))`. E isso
apesar de `audit-diff.ts` **exportar** exatamente esse helper
(`audit-diff.ts:82–85`):

```ts
/** Houve alteração real? */
export function houveMudanca(diff: DiffAuditoria): boolean {
  return Object.keys(diff).length > 0;
}
```

Grep de `houveMudanca` em todo o `src/`: aparece **só** na sua definição e no
arquivo de teste. **Nenhuma action o usa.** O docstring de `diffAudit` chega a
sugerir o uso — *"Devolve `{}` quando nada mudou de fato — o chamador pode usar
isso para não gravar log vazio"* (`audit-diff.ts:64–65`) — e nenhum chamador
usa.

Comparando as três actions que gravam `changes`:

| Action | Guarda contra diff vazio? | Arquivo:linha |
|---|---|---|
| `despesa.update` | **não** | `despesas.ts:641` só checa patch vazio |
| `cliente.update` | **não** — monta `changes` com loop próprio, sem guarda | `clientes.ts:167–182` |
| `tenant.fiscal` | **não** | `empresa.ts:119–139` |

### c) `despesa.create` e `despesa.pagaPorSocio` no mesmo segundo

**São dois eventos por desenho, disparados no mesmo `addDespesa`.** O caminho
completo (`despesas.ts:489–529`):

```ts
  await logAudit({
    tenantId: ctx.tenant.id,
    userId: ctx.userId,
    action: "despesa.create",
    entity: "despesa",
    entityId: row.id,
    meta: { valor: row.valor, contaCef: row.contaCef },
  });

  // Despesa paga por sócio: registra a obrigação empresa↔sócio (reusa a infra de
  // "pago por terceiro"). Reembolsável → obrigação PENDENTE (o caixa só se move
  // no reembolso, feito na tela de Restituições). Sem reembolso → obrigação já
  // QUITADA (saldo 0), sem movimento de caixa e sem duplicar despesa na DRE.
  if (pagoPorSocioId) {
    await db.insert(schema.despesaTerceiros).values({
      tenantId: ctx.tenant.id,
      despesaId: row.id,
      pagadorTerceiroId: pagoPorSocioId,
      empresaResponsavelId: projectId,
      valorTotal: row.valor,
      valorRestituido: socioReembolsavel ? "0" : row.valor,
      dataPagamentoOriginal: socioDataPagamento,
      status: socioReembolsavel ? "Aguardando restituição" : "Sem reembolso",
      obs: socioReembolsavel
        ? "Despesa paga por sócio — a reembolsar"
        : "Despesa paga por sócio — sem reembolso",
    });
    await logAudit({
      tenantId: ctx.tenant.id,
      userId: ctx.userId,
      action: "despesa.pagaPorSocio",
      entity: "despesa",
      entityId: row.id,
      meta: {
        socioId: pagoPorSocioId,
        valor: row.valor,
        reembolsavel: socioReembolsavel,
        dataPagamento: socioDataPagamento,
      },
    });
  }
```

A sequência dentro de uma única chamada:

1. `despesa.create` (linhas 489–496) — sempre. `meta: { valor, contaCef }`.
2. **Se** `pagoPorSocioId` estiver preenchido (linha 502): insere a linha em
   `despesa_terceiro` (503–515) e grava `despesa.pagaPorSocio` (516–528), com
   `meta: { socioId, valor, reembolsavel, dataPagamento }`.

Os dois têm `entity: "despesa"` e o **mesmo `entityId`** (`row.id`), o que faz
as duas linhas aparecerem coladas na tela, com o mesmo timestamp ao segundo.

A razão de serem dois está no comentário acima do bloco
(`despesas.ts:498–501`): o segundo evento não registra a despesa, registra a
**obrigação empresa↔sócio** criada em `despesa_terceiro` — um fato contábil
distinto, com valor, reembolsabilidade e data de pagamento próprios, que o
`meta` de `despesa.create` não carrega.

Há um terceiro evento possível no mesmo `addDespesa`: `despesa.recorrente`
(`despesas.ts:545`), quando o lançamento é replicado em N meses. Então uma
única submissão do formulário pode produzir **três** linhas no log com o mesmo
`entityId`.

### d) O `meta` guarda `numDoc` em quais actions? Por que `cancel` guarda e `update` não?

Grep de `numDoc` dentro de blocos `meta:` — **10 actions** o guardam:

| Action | Arquivo:linha | `meta` |
|---|---|---|
| `acerto.create` | `acerto.ts:332` | `{ numDoc: out.numDoc, valorTransferido, totalVinculado, diferenca, despesas }` |
| `acerto.estorno` | `acerto.ts:454` | `{ numDoc: acerto.numDoc, motivo }` |
| `acerto.rateio` | `acerto.ts:622` | `{ numDoc: out.numDoc, valorTotal, obras, rateio }` |
| `conciliacao.create` | `caixa.ts:473` | `{ despesaId, numDoc: desp.numDoc, valor, data }` |
| `extrato.criarDespesaConciliada` | `caixa.ts:1151` | `{ cashEntryId, valor, numDoc }` |
| `despesa.delete` | `despesas.ts:678` | `{ valor: existing.valor, numDoc: existing.numDoc }` |
| `despesa.cancel` | `despesas.ts:719` | `{ motivo, valor: existing.valor, numDoc: existing.numDoc }` |
| `despesa.reclassificar` | `diagnostico.ts:155` | `{ changes, origem, numDoc: d.numDoc }` |
| `restituicao.lote` | `restituicao-lote.ts:297` | `{ numDoc: out.numDoc, terceiroId, valor, pedsAbatidos, criterio }` |
| `compensacao.create` | `restituicao-lote.ts:492` | `{ numDoc: out.numDoc, valor, saldoRestituirAntes, saldoRepassarAntes }` |

E **não** guardam: `despesa.create` (`meta: { valor, contaCef }`),
`despesa.update` (`meta: { changes }`), `despesa.pay`
(`meta: { valorPago, juros, multa, desconto, dataPagamento }`),
`despesa.pagaPorSocio`, `despesa.recorrente`, `ponto.gerar_conta`.

**Por que `cancel` guarda e `update` não — o mecanismo, lido no código:**

- `cancelarDespesa` e `deleteDespesa` fazem um `select` da linha inteira antes
  de agir (`despesas.ts:699–704` e `:668–675`) e montam o `meta` **à mão**, com
  campos escolhidos de `existing` — daí `{valor, numDoc}`. No caso do
  `delete`, isso é a única coisa que resta: a linha some do banco e o `numDoc`
  do log vira o único vestígio do número emitido.
- `updateDespesa` também faz o `select` (`despesas.ts:605–611`), mas **não usa
  `existing` para montar o `meta`** — delega tudo a `diffAudit(existing, set)`
  e grava `meta: { changes }` e nada mais. Como `numDoc` nunca entra em `set`
  (item (a)), ele não pode sair no diff, e ninguém o acrescentou por fora.

O resultado prático é que uma linha `despesa.update` no log traz `entity_id`
(o UUID) mas **não** o PED — para saber de qual pedido se trata é preciso
cruzar o UUID com a tabela. `despesa.cancel` e `despesa.delete`, na mesma tela,
mostram o PED direto.

### e) Como a coluna ENTIDADE é montada?

**`entity` + `entityId` cru, truncado.** Não há join
(`acoes/page.tsx:67–70`):

```tsx
              <TD className="font-[family-name:var(--font-mono)]">
                {a.entity}
                {a.entityId ? ` · ${a.entityId.slice(0, 8)}` : ""}
              </TD>
```

`a.entity` é a string gravada pela action (`"despesa"`, `"membership"`,
`"chart_account"`…) e `a.entityId` é o UUID, **cortado nos 8 primeiros
caracteres**. Nenhuma consulta resolve esse id para nome, código ou PED.

A coluna `entity_id` é `text` **sem foreign key** (`schema.ts:1316`), então não
há nem como o banco garantir que ela aponte para algo existente — e, quando a
linha referida é apagada (`despesa.delete`, `unit.delete`…), o id fica
apontando para o nada.

A única coluna da tela que **é** resolvida é Usuário
(`acoes/page.tsx:39` e `:63`):

```tsx
  const nameById = new Map(members.map((m) => [m.userId, m.name ?? m.email]));
```


```tsx
              <TD>{a.userId ? nameById.get(a.userId) ?? "—" : "sistema"}</TD>
```

Um `Map` construído a partir de `getMembers` traduz `user_id` → nome (ou
e-mail). `user_id` nulo vira a string `"sistema"`; um `user_id` que não esteja
mais entre os membros do tenant vira `"—"` — foi removido, e o log perde o
nome mesmo com o id ainda gravado.

### f) UUIDs no `meta` (`socioId` e outros): há onde resolvê-los para nome?

**Não. Em lugar nenhum.** A `renderMeta` (`acoes/page.tsx:10–29`) trata o
`meta` de duas formas, e nenhuma delas consulta o banco:

1. Se houver `changes` com pelo menos uma chave, imprime
   `campo: de → para` — com `String(v.de)` / `String(v.para)`, ou seja, o UUID
   cru quando o campo for uma FK (`fornecedorId`, `bancoId`…).
2. Caso contrário, `JSON.stringify(meta)` — o objeto inteiro, como está.

A página inteira faz **duas** consultas (`acoes/page.tsx:35–38`): `getAuditLog`
e `getMembers`. A segunda existe só para a coluna Usuário. Não há
`getStakeholders`, `getProjects`, `getUnits` nem nada que pudesse resolver os
ids do `meta`.

Os UUIDs que aparecem crus na tela, levantados do inventário de metas:

| Campo no `meta` | Action | Aponta para |
|---|---|---|
| `socioId` | `despesa.pagaPorSocio` | `stakeholder` |
| `despesaId` | `conciliacao.create`, `conciliacao.undo`, `despesaTerceiro.create`, `documentoFiscal.*` | `despesa` |
| `cashEntryId` | `extrato.criarDespesaConciliada`, `extrato.criarContaPagar`, `restituicao.create` | `cash_entry` |
| `contaReceberId` | `conciliacao.receber`, `conciliacao.undo`, `recebimentoTerceiro.create` | `conta_receber` |
| `terceiroId` | `restituicao.lote` | `stakeholder` |
| `despesaTerceiroId` | `restituicao.create`, `restituicao.cancel` | `despesa_terceiro` |
| `bankAccountId` | `cash.import` | `bank_account` |
| `projectId` | `contaReceber.create`, `incc.update`, `incc.project`, `medicao.create`, `forecast.createFromBudget` | `project` |
| `parcelaId` | `pagamento.create` | `despesa_parcela` |
| `documentId` | `document.unlink` | `document` |
| `recebimentoTerceiroId` | `repasse.create` | `recebimento_terceiro` |
| `budgetVersionId`, `from` | `forecast.createFromBudget`, `forecast.duplicate`, `budget.importFromBudget` | `version` |
| `fornecedorId`, `bancoId` (dentro de `changes`) | `despesa.update` | `stakeholder`, `bank_account` |

Algumas actions gravam o **nome** em vez do id, e essas ficam legíveis:
`project.create` (`{name}`), `project.delete` (`{name: target.name}`),
`cliente.create` (`{nome, unitCode}`), `version.duplicate`
(`{from: source.label, label}`), `version.delete` (`{label: target.label}`),
`stakeholder.create` (`{nome, papeis}`), `estoque.item.create` (`{nome}`),
`ponto.gerar_conta` (`{funcionario, dias, valor}`). É decisão action a action,
sem padrão.

### g) A tela tem paginação? Quantas linhas carrega?

**Não tem paginação.** Uma consulta, um `limit` fixo, sem `offset`, sem cursor,
sem botão de "carregar mais", sem `searchParams`.

A chamada (`acoes/page.tsx:35–38`):

```tsx
  const [audit, members] = await Promise.all([
    getAuditLog(ctx.tenant.id, 200),
    getMembers(ctx.tenant.id),
  ]);
```

E a query (`queries.ts:1562–1572`, colada inteira na seção 5):

```ts
export async function getAuditLog(
  tenantId: string,
  limit = 20,
): Promise<AuditRow[]> {
  return db
    .select()
    .from(schema.auditLog)
    .where(eq(schema.auditLog.tenantId, tenantId))
    .orderBy(desc(schema.auditLog.createdAt))
    .limit(limit);
}
```

| Item | Valor |
|---|---|
| `limit` passado pela tela | **200** (`acoes/page.tsx:36`) |
| `limit` default da função | 20 — não usado aqui |
| `order by` | `created_at` **DESC** |
| `offset` | nenhum |
| Índice usado | nenhum — `audit_log` não tem índice (seção 4) |

O subtítulo diz `${audit.length} eventos recentes` (`acoes/page.tsx:45`), ou
seja, mostra quantos vieram (no máximo 200), **não** quantos existem. Passados
os 200 mais recentes, os eventos anteriores ficam inacessíveis pela interface —
só por consulta direta ao banco. Em um tenant ativo, 200 eventos podem cobrir
poucos dias.

`getAuditLog` é chamada em um único lugar do repositório: esta página.

### h) Existe filtro por usuário, período, entidade ou ação?

**Não existe nenhum filtro.** Confirmado por inspeção da página inteira (colada
na seção 1):

- não há `searchParams` na assinatura de `AcoesPage` (`acoes/page.tsx:31`) —
  compare com `/despesas` e `/caixa`, que os recebem;
- não há nenhum `<form>`, `<select>`, `<input>` ou componente de filtro;
- não há `DateRangeFilter` nem qualquer import de filtro;
- `getAuditLog` aceita exatamente dois parâmetros, `tenantId` e `limit`
  (`queries.ts:1562–1565`) — não há por onde passar critério;
- a página não tem componente `"use client"`, logo não há filtragem no
  navegador tampouco.

O que existe de "busca" é o `Ctrl+F` do navegador sobre as 200 linhas
renderizadas. Não há ordenação alternativa, agrupamento nem exportação —
`/acoes` não tem botão de download, e o log **não entra** no Backup (item (k)).

### i) Inventário completo das actions que gravam em banco

Método: para cada arquivo com `"use server"` (35 arquivos), separei as funções
de topo e marquei as que contêm `db.insert` / `db.update` / `db.delete` (ou o
equivalente com `tx`) e as que chamam `logAudit`. Arquivos de teste excluídos.

**Resultado: 104 funções gravam em banco. 87 chamam `logAudit`; 17 não.**
Há ainda 7 funções que chamam `logAudit` delegando a escrita a um helper
interno — contabilizadas como "logam" na coluna do helper.

Total de chamadas `logAudit` no sistema: **100**.

#### As 17 que gravam e NÃO registram auditoria

| Arquivo:linha | Função | O que grava |
|---|---|---|
| `account.ts:22` | `changePassword` | troca a própria senha (`user.password_hash`) |
| `account.ts:51` | `getOrCreateMfaSetup` | grava `mfa_secret` e zera `mfa_enabled` |
| `account.ts:71` | `confirmMfa` | ativa `mfa_enabled` |
| `account.ts:84` | `disableMfa` | desliga MFA e apaga o segredo |
| `budget.ts:89` | `replaceLines` *(interna)* | delete+insert de `budget_line` — o chamador loga |
| `budget.ts:154` | `replaceReceitaRowKey` *(interna)* | idem — o chamador loga |
| `caixa.ts:400` | `toggleConciliado` | marca/desmarca o flag `rec` de um movimento |
| `caixa.ts:943` | `pairMovimento` | pareia dois movimentos do extrato |
| `despesas.ts:223` | `addBankAccount` | cria conta bancária |
| `empresa.ts:143` | `renameTenant` | troca a razão social do tenant |
| `estoque.ts:87` | `deleteStockItem` | **apaga** item de estoque |
| `incc.ts:18` | `persistIncc` *(interna)* | grava as taxas — os dois chamadores logam |
| `incc.ts:42` | `saveIncc` | grava taxas de INCC |
| `planning.ts:136` | `copyPlanningData` *(interna)* | copia planejamento — os chamadores logam |
| `receitas.ts:10` | `addReembolso` | cria reembolso |
| `receitas.ts:30` | `addPermuta` | cria permuta |
| `versions.ts:218` | `setDefaultVersion` | muda a versão default do projeto |

Descontando as **4 internas** cujos chamadores exportados registram
(`replaceLines`, `replaceReceitaRowKey`, `persistIncc`, `copyPlanningData`),
sobram **13 operações exportadas que alteram o banco sem deixar rastro**. As
que mais pesam: `deleteStockItem` (exclusão física), `renameTenant` (a razão
social é o que vai no corpo da nota fiscal), os quatro fluxos de senha/MFA de
`account.ts`, e `addReembolso`/`addPermuta` (lançamentos de receita).

#### As 87 que gravam e registram — por arquivo

| Arquivo | Função | Linha | `action` gravada |
|---|---|---|---|
| `acerto.ts` | `concluirAcerto` | 154 | `acerto.create` |
| `acerto.ts` | `estornarAcerto` | 381 | `acerto.estorno` |
| `acerto.ts` | `ratearEntreObras` | 490 | `acerto.rateio` |
| `budget.ts` | `saveBudgetLines` | 120 | `budget.save` |
| `budget.ts` | `saveBudgetReceita` | 221 | `budget.saveReceita` |
| `budget.ts` | `importFromBudget` | 294 | `budget.importFromBudget` |
| `budget.ts` | `importBudgetXlsx` | 385 | `budget.import` |
| `budget.ts` | `saveBudgetDespesaLinhas` | 464 | `budget.saveDespesaLinhas` |
| `budget.ts` | `replicateFromAtual` | 543 | `budget.replicateFromAtual` |
| `caixa.ts` | `extractExtratoPdf` | 42 | `extrato.readPdf` |
| `caixa.ts` | `addCash` | 145 | *(dinâmica)* |
| `caixa.ts` | `importCash` | 245 | `cash.import` |
| `caixa.ts` | `conciliarDespesa` | 416 | `conciliacao.create` |
| `caixa.ts` | `desfazerConciliacao` | 491 | `conciliacao.undo` |
| `caixa.ts` | `conciliarContaReceber` | 584 | `conciliacao.receber` |
| `caixa.ts` | `criarContaFromExtrato` | 651 | `extrato.criarContaPagar`, `extrato.criarContaReceber` |
| `caixa.ts` | `criarLancamentoDoExtrato` | 1042 | `extrato.criarContaReceberConciliada`, `extrato.criarDespesaConciliada` |
| `clientes.ts` | `addCliente` | 115 | `cliente.create` |
| `clientes.ts` | `updateCliente` | 143 | `cliente.update` |
| `clientes.ts` | `deleteCliente` | 187 | `cliente.delete` |
| `clientes.ts` | `uploadClienteDoc` | 211 | `cliente.doc.upload` |
| `contas-receber.ts` | `createContaReceber` | 29 | `contaReceber.create` |
| `contas-receber.ts` | `updateContaReceber` | 77 | `contaReceber.update` |
| `contas-receber.ts` | `cancelarContaReceber` | 122 | `contaReceber.cancel` |
| `contas.ts` | `addConta` | 16 | `conta.create` |
| `contas.ts` | `updateConta` | 44 | `conta.update` |
| `contas.ts` | `deleteConta` | 94 | `conta.delete` |
| `despesas.ts` | `addStakeholder` | 36 | `stakeholder.create` |
| `despesas.ts` | `updateStakeholder` | 104 | `stakeholder.update` |
| `despesas.ts` | `setStakeholderAtivo` | 136 | *(dinâmica)* |
| `despesas.ts` | `deleteStakeholder` | 159 | `stakeholder.delete` |
| `despesas.ts` | `addDespesa` | 286 | `despesa.create`, `despesa.pagaPorSocio`, `despesa.recorrente` |
| `despesas.ts` | `updateDespesa` | 599 | `despesa.update` |
| `despesas.ts` | `deleteDespesa` | 664 | `despesa.delete` |
| `despesas.ts` | `cancelarDespesa` | 694 | `despesa.cancel` |
| `despesas.ts` | `pagarDespesa` | 751 | `despesa.pay` |
| `despesas.ts` | `uploadDespesaDoc` | 926 | `document.upload` |
| `despesas.ts` | `addDespesaDocs` | 974 | `document.upload` |
| `despesas.ts` | `deleteDespesaDoc` | 1058 | `document.unlink` |
| `diagnostico.ts` | `reclassificarDespesas` | 117 | `despesa.reclassificar` |
| `documento-fiscal.ts` | `salvarDocumentoFiscal` | 140 | *(dinâmica)* |
| `empresa.ts` | `uploadLogo` | 23 | `tenant.logo` |
| `empresa.ts` | `salvarDadosFiscais` | 70 | `tenant.fiscal` |
| `estoque.ts` | `addStockItem` | 20 | `estoque.item.create` |
| `estoque.ts` | `addStockMovement` | 46 | `estoque.mov.create` |
| `fechamento.ts` | `closeDia` | 46 | `caixa.fechamento` |
| `incc.ts` | `updateInccMonth` | 72 | `incc.update` |
| `incc.ts` | `projectFutureIncc` | 105 | `incc.project` |
| `medicao.ts` | `addMedicao` | 16 | `medicao.create` |
| `medicao.ts` | `updateMedicao` | 62 | `medicao.update` |
| `medicao.ts` | `deleteMedicao` | 91 | `medicao.delete` |
| `numeracao.ts` | `updateDespesaSequence` | 56 | `numeracao.update` |
| `pagamentos.ts` | `registrarPagamento` | 30 | `pagamento.create` |
| `planning.ts` | `saveBudgetPlanning` | 30 | `budget.planning.save` |
| `planning.ts` | `createForecastFromBudget` | 180 | `forecast.createFromBudget` |
| `planning.ts` | `duplicateForecast` | 252 | `forecast.duplicate` |
| `planning.ts` | `setVersionStatus` | 319 | `version.status` |
| `planocontas.ts` | `addChartGroup` | 35 | `chart.group.create` |
| `planocontas.ts` | `addChartItem` | 79 | `chart.item.create` |
| `planocontas.ts` | `updateChartItem` | 119 | `chart.item.update` |
| `planocontas.ts` | `setChartAccountAtivo` | 162 | *(dinâmica)* |
| `planocontas.ts` | `deleteChartItem` | 185 | `chart.item.delete` |
| `planocontas.ts` | `renameChartGroup` | 207 | `chart.group.update` |
| `planocontas.ts` | `deleteChartGroup` | 241 | `chart.group.delete` |
| `ponto.ts` | `updateObraLocation` | 30 | `obra.location.update` |
| `ponto.ts` | `registrarPonto` | 83 | `ponto.registrar` |
| `ponto.ts` | `gerarContaPagarPonto` | 167 | `ponto.gerar_conta` |
| `projects.ts` | `createProject` | 65 | `project.create` |
| `projects.ts` | `updateProject` | 150 | `project.update` |
| `projects.ts` | `deleteProject` | 220 | `project.delete` |
| `projects.ts` | `uploadProjetoDoc` | 255 | `projeto.doc.upload` |
| `projects.ts` | `deleteProjetoDoc` | 297 | `projeto.doc.delete` |
| `recebimento-terceiro.ts` | `registrarRecebimentoTerceiro` | 101 | `recebimentoTerceiro.create` |
| `recebimento-terceiro.ts` | `registrarRepasse` | 240 | `repasse.create` |
| `restituicao-lote.ts` | `confirmarRestituicaoLote` | 165 | `restituicao.lote` |
| `restituicao-lote.ts` | `compensarSaldos` | 359 | `compensacao.create` |
| `restituicoes.ts` | `criarDespesaTerceiro` | 130 | `despesaTerceiro.create` |
| `restituicoes.ts` | `registrarRestituicao` | 353 | `restituicao.create` |
| `restituicoes.ts` | `cancelarRestituicao` | 503 | `restituicao.cancel` |
| `tenants.ts` | `createTenantAccount` | 14 | `tenant.create` |
| `units.ts` | `saveUnit` | 31 | `unit.create`, `unit.update` |
| `units.ts` | `importUnits` | 103 | `unit.import` |
| `units.ts` | `deleteUnit` | 141 | `unit.delete` |
| `users.ts` | `invite` | 37 | `membership.invite` |
| `users.ts` | `setMemberPermissions` | 107 | `membership.permissions` |
| `users.ts` | `changeRole` | 133 | `membership.role` |
| `users.ts` | `updateMemberName` | 179 | `user.rename` |
| `users.ts` | `resetMemberPassword` | 206 | `user.password_reset` |
| `users.ts` | `removeMember` | 249 | `membership.remove` |
| `version-io.ts` | `importVersionData` | 25 | `version.import` |
| `versions.ts` | `duplicateVersion` | 18 | `version.duplicate` |
| `versions.ts` | `updateVersion` | 181 | `version.update` |
| `versions.ts` | `toggleVersionLock` | 203 | `version.lock` |
| `versions.ts` | `deleteVersion` | 234 | `version.delete` |

Quatro `action` são montadas em tempo de execução, por isso aparecem como
*(dinâmica)* acima:

| Arquivo:linha | Expressão |
|---|---|
| `caixa.ts:194` | `tipo === "ajuste" ? "cash.adjust" : "cash.create"` |
| `despesas.ts:148` | `ativo ? "stakeholder.reactivate" : "stakeholder.deactivate"` |
| `documento-fiscal.ts:210` | `existente ? "documentoFiscal.update" : "documentoFiscal.create"` |
| `planocontas.ts:177` | `ativo ? "chart.item.activate" : "chart.item.deactivate"` |

#### Escritores de banco fora das Server Actions

Nenhum deles registra auditoria:

| Arquivo | O que grava | `logAudit`? |
|---|---|---|
| `src/lib/tenant/provision.ts` | cria tenant, usuário owner, membership, projeto e versões | **não** |
| `src/lib/db/numbering.ts` | `number_sequence` (reserva de PED) | **não** |
| `src/lib/db/seed.ts` | carga de demonstração | **não** |
| `src/workers/sync-openfinance.ts` | sincronização de extrato | **não** |
| `src/lib/audit.ts` | o próprio `audit_log` | é o destino |

`provisionTenant` é chamado por `createTenantAccount` (`tenants.ts:14`), que
**loga** `tenant.create` — mas o log é gravado no tenant recém-criado, não em
outro. `reserveDespesaNumber` consome números de PED sem nenhum registro: a
sequência avança e o buraco não aparece em lugar nenhum.

### j) O `meta` é JSONB íntegro? Há mascaramento?

**É gravado íntegro, e não há mascaramento algum.** `logAudit` faz um cast e
insere (`audit.ts:15–22`):

```ts
  await db.insert(schema.auditLog).values({
    tenantId: entry.tenantId,
    userId: entry.userId ?? null,
    action: entry.action,
    entity: entry.entity,
    entityId: entry.entityId ?? null,
    meta: (entry.meta ?? null) as object | null,
  });
```

Não há lista de campos sensíveis, não há `redact`, `mask`, `omit` ou
`sanitize` — grep dessas palavras em `audit.ts`, `audit-diff.ts` e
`acoes/page.tsx` não devolve nada. `diffAudit` também não filtra: percorre
todas as chaves do patch (`audit-diff.ts:73`).

Respondendo campo a campo:

**Senha: não entra, em nenhuma forma.** `resetMemberPassword`
(`users.ts:233–239`) chama `logAudit` **sem `meta`** — nem a senha em claro nem
o hash. `changePassword` (`account.ts:22–36`) não chama `logAudit` de jeito
nenhum. Grep por `senha|password|hash` dentro de blocos `meta:` em todas as
actions: **zero ocorrências**.

**Token: não entra.** Nenhum `meta` carrega credencial. O token do provedor
fiscal vive só em variável de ambiente, e `focus.ts:19` declara *"nada de token
em log"*. Nenhuma action de `/empresa` ou fiscal grava token.

**Documento e renda: ENTRAM, em claro.** É o caso de `cliente.update`
(`clientes.ts:167–182`), que monta o `changes` com um loop próprio sobre
**todas** as chaves de `readCliente` — 34 campos:

```ts
  // Auditoria campo a campo: valor anterior × novo.
  const changes: Record<string, { de: unknown; para: unknown }> = {};
  if (antes) {
    for (const k of Object.keys(novo)) {
      const de = (antes as Record<string, unknown>)[k];
      const para = (novo as Record<string, unknown>)[k];
      if (String(de ?? "") !== String(para ?? "")) changes[k] = { de: de ?? null, para: para ?? null };
    }
  }
  await logAudit({
    tenantId: ctx.tenant.id,
    userId: ctx.userId,
    action: "cliente.update",
    entity: "cliente",
    entityId: id,
    meta: { changes },
  });
```

E os campos que esse loop percorre (`clientes.ts:46–85`):

```ts
function readCliente(fd: FormData) {
  return {
    unitCode: s(fd, "unitCode"),
    statusContrato: s(fd, "statusContrato"),
    nomeCompleto: s(fd, "nomeCompleto") ?? "Sem nome",
    cpfCnpj: s(fd, "cpfCnpj"),
    nascimento: s(fd, "nascimento"),
    nacionalidade: s(fd, "nacionalidade"),
    estadoCivil: s(fd, "estadoCivil"),
    endereco: s(fd, "endereco"),
    cidadeEstado: s(fd, "cidadeEstado"),
    cep: s(fd, "cep"),
    emailPrincipal: s(fd, "emailPrincipal"),
    emailSecundario: s(fd, "emailSecundario"),
    celular: s(fd, "celular"),
    telefone: s(fd, "telefone"),
    bancoFinanc: s(fd, "bancoFinanc"),
    rendaBruta: num(fd, "rendaBruta"),
    rendaLiquida: num(fd, "rendaLiquida"),
    comprometimento: s(fd, "comprometimento"),
    possuiFgts: s(fd, "possuiFgts"),
    saldoFgts: num(fd, "saldoFgts"),
    scoreCredito: int(fd, "scoreCredito"),
    restricoes: s(fd, "restricoes"),
    morarOuInvestir: s(fd, "morarOuInvestir"),
    ramoAtividade: s(fd, "ramoAtividade"),
    cargoFuncao: s(fd, "cargoFuncao"),
    areaAtuacao: s(fd, "areaAtuacao"),
    empresa: s(fd, "empresa"),
    regimeTrabalho: s(fd, "regimeTrabalho"),
    localTrabalho: s(fd, "localTrabalho"),
    tempoEmpresa: s(fd, "tempoEmpresa"),
    possuiImovel: s(fd, "possuiImovel"),
    motivacaoCompra: s(fd, "motivacaoCompra"),
    comoConheceu: s(fd, "comoConheceu"),
    indicadoPor: s(fd, "indicadoPor"),
    interesse: int(fd, "interesse"),
    obsEstrategicas: s(fd, "obsEstrategicas"),
  };
}
```

Portanto, editar um cliente grava no `audit_log` o antes e o depois de:
**`cpfCnpj`**, **`rendaBruta`**, **`rendaLiquida`**, **`saldoFgts`**,
**`scoreCredito`**, **`restricoes`**, `nascimento`, `endereco`, `cep`,
`emailPrincipal`, `emailSecundario`, `celular`, `telefone`, `empresa`,
`cargoFuncao`, `comprometimento` — tudo em texto claro no JSONB, visível na
coluna Detalhes de `/acoes` para quem tiver `acoes:ver`.

Note que a permissão de ver o log (`acoes`) é **independente** da de ver
clientes (`clientes`): o perfil `contador` enxerga `/acoes` mas **não** enxerga
`/clientes` (item (l)) — e ainda assim vê CPF, renda e score na coluna
Detalhes.

Outros dados pessoais que chegam ao `meta` por caminhos próprios:
`stakeholder.create` grava `{nome, papeis}` e `stakeholder.update` grava
`{papeis}` (`despesas.ts:89`, `:124`) — sem o documento do fornecedor;
`membership.invite` grava `{email, role}` (`users.ts:86`);
`ponto.registrar` grava `{tipo, data, hora, distancia, dentroRaio}`
(`ponto.ts:144`) — distância do funcionário ao raio da obra, sem coordenada.

Doze das cem chamadas gravam **sem `meta`**: `cliente.delete`,
`contaReceber.cancel`, `conta.create`, `conta.delete`,
`stakeholder.deactivate`/`reactivate`, `stakeholder.delete`, `medicao.delete`,
`chart.item.activate`/`deactivate`, `chart.item.delete`,
`projeto.doc.delete`, `unit.delete` e `user.password_reset`. Nessas, o log diz
que algo aconteceu e com qual `entity_id`, mas não o quê — e para as exclusões,
o registro apagado já não pode ser consultado.

### k) Há retenção, expurgo ou arquivamento? O Backup o inclui?

**Não há retenção nem expurgo, e o Backup NÃO inclui o log.**

**Expurgo:** grep de `delete(schema.auditLog)` e de `DELETE FROM ... audit` em
todo o `src/`: **zero ocorrências**. A tabela é declarada append-only
(`schema.ts:1303–1304`) e nada a poda. A única forma de o log encolher é o
`ON DELETE cascade` de `tenant_id` — apagar o tenant leva o log junto.

**Retenção:** não há coluna de expiração, job agendado, cron ou worker que
toque em `audit_log`. O único worker do projeto é
`src/workers/sync-openfinance.ts`, que não a referencia.

**Backup & Arquivamento:** a função que monta o pacote é `buildSemesterZip`
(`src/lib/backup.ts:165`). O que ela carrega
(`backup.ts:174–179`):

```ts
  const [despesas, receber, caixa, documentos] = await Promise.all([
    getDespesasByTenant(tenantId),
    getContasReceber(tenantId),
    getCashByTenant(tenantId),
    getDocuments(tenantId),
  ]);

  const despRows = despesas.filter((d) => monthSet.has(d.competencia ?? ""));
  const recRows = receber.filter((r) =>
    internalDateInSemester(r.vencimento ?? r.dataRecebimento, info),
  );
  const cxRows = caixa.filter((c) => internalDateInSemester(c.data, info));
  const docRows = documentos.filter(
    (doc) => semKeyOfDate(doc.uploadedAt ?? null) === key,
  );
```

Quatro fontes: **despesas, contas a receber, caixa e documentos**. `audit_log`
não aparece — grep de `auditLog` em `src/lib/backup.ts` e em
`src/app/(app)/backup/` não devolve nada.

Consequência: o ZIP semestral que a empresa arquiva para a contabilidade
**não leva a trilha de auditoria**. Se o log for perdido — por queda do banco,
por restore de um dump antigo ou pelo cascade de um tenant —, não há cópia em
lugar nenhum. E como não há paginação nem exportação na tela (itens (g) e
(h)), também não há saída manual.

### l) Qual permissão governa? Está em `SCREENS`? Em `CONTADOR_VE`?

**Está nas duas listas.**

`SCREENS` (`permissions.ts:67`):

```ts
  { id: "acoes", label: "Log de Auditoria", modulo: "Config" },
```

`CONTADOR_VE` (`permissions.ts:83–93`) — a lista das 8 telas que o perfil
somente-leitura enxerga:

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

`"acoes"` é o último item (linha 92). É a **única tela do módulo `Config` que
o `contador` enxerga** — as outras oito de Config caem em `NONE`
(`permissions.ts:106–108`).

Permissões efetivas por papel, para `acoes`:

| Papel | `ver` | Por quê |
|---|---|---|
| `owner`, `admin` | ✅ | `FULL` em tudo (`permissions.ts:99–100`) |
| `membro` | ❌ | módulo `Config` → `NONE` (`:101–102`) |
| `engenheiro` | ❌ | só `medicaolanc` (`:103–105`) |
| `contador` | ✅ | está em `CONTADOR_VE` (`:108`) |

**Onde a permissão é aplicada:** só no enforcement central do layout
(`layout.tsx:92–95`), porque `"acoes"` está em `SCREEN_IDS` e
`screenIdOfPath("/acoes")` devolve `"acoes"`. **A página não repete a
checagem** — grep de `can(` em `acoes/page.tsx` não devolve nenhuma linha.
Não há action nesta tela, então não há verificação de servidor além do layout.

Das quatro ações da matriz, só `ver` é consultada para `acoes`: `criar`,
`editar` e `excluir` não são lidas por nenhum código — coerente com uma tabela
append-only sem interface de escrita.

### m) Há `tenant_id` no `where` da consulta?

**Sim** (`queries.ts:1566–1571`):

```ts
  return db
    .select()
    .from(schema.auditLog)
    .where(eq(schema.auditLog.tenantId, tenantId))
    .orderBy(desc(schema.auditLog.createdAt))
    .limit(limit);
```

O `tenantId` vem de `ctx.tenant.id` (`acoes/page.tsx:36`), resolvido pela
sessão → usuário → membership em `getActiveContext` — nunca do cliente. A
segunda consulta da página, `getMembers`, também filtra por tenant
(`queries.ts:1485`).

Do lado da escrita, `logAudit` recebe `tenantId` como parâmetro
(`audit.ts:8`) e o grava direto (`audit.ts:17`). Varri as 100 chamadas: **todas
passam `tenantId: ctx.tenant.id`** (ou o equivalente do contexto local, como
`tId` em `version-io.ts:108` e `res.tenantId` em `tenants.ts:35`). Nenhuma aceita o
tenant vindo do formulário.

A coluna é `NOT NULL` com FK para `tenant` (`schema.ts:1308–1310`), então o
banco recusaria uma linha sem tenant. O isolamento é consistente — mas note que
`audit_log` **não tem índice em `tenant_id`** (seção 4): o filtro é correto,
porém percorre a tabela inteira e depois ordena por `created_at`, também sem
índice.
