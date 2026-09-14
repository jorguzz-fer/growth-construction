# TELA-fechamento — código na íntegra

Coleta do código da tela **Fechamento de Caixa** (`/fechamento`), em `main`
(commit `45f4ce3`). Sem resumo, sem análise.

**Árvore de dependências própria (recursiva):**

```
fechamento/page.tsx
├── components/app/page-header.tsx
├── components/app/access-denied.tsx
│   └── components/app/page-header.tsx        (já listado)
└── components/app/fechamento-panel.tsx
    ├── FechamentoPanel   — a tela inteira
    └── Resumo            — cartão de indicador (auxiliar, mesmo arquivo)

Nenhum importa outro componente próprio. As demais importações são
primitivas de UI (card, button, badge, input, date-field, table), `utils` e
`lib/contas-saldo`.

queries chamadas:  getContasPagar · getReceivables · getCashByTenant
                   getBankAccounts
actions:           closeDia — a ÚNICA de fechamento no repositório
```

---

## 1. Página

### `src/app/(app)/fechamento/page.tsx`

```tsx
import { getActiveContext } from "@/lib/context";
import { saldoDisponivel } from "@/lib/contas-saldo";
import {
  getContasPagar,
  getReceivables,
  getCashByTenant,
  getBankAccounts,
} from "@/lib/queries";
import { can } from "@/lib/permissions";
import { PageHeader } from "@/components/app/page-header";
import { AccessDenied } from "@/components/app/access-denied";
import { FechamentoPanel } from "@/components/app/fechamento-panel";

export const dynamic = "force-dynamic";

export default async function FechamentoPage() {
  const ctx = await getActiveContext();
  if (!ctx) return null;
  if (!can(ctx.perms, "fechamento", "ver")) return <AccessDenied />;

  const [contasPagar, receivables, cash, contas] = await Promise.all([
    getContasPagar(ctx.tenant.id),
    getReceivables(ctx.tenant.id),
    getCashByTenant(ctx.tenant.id),
    getBankAccounts(ctx.tenant.id),
  ]);
  const saldoContas = saldoDisponivel(contas);

  const now = new Date();
  const hojeInternal = `${String(now.getMonth() + 1).padStart(2, "0")}/${String(
    now.getDate(),
  ).padStart(2, "0")}/${now.getFullYear()}`;

  return (
    <>
      <PageHeader
        eyebrow={ctx.tenant.name}
        title="Fechamento de Caixa"
        subtitle="Contas a pagar do dia × receitas a receber do dia — pendências não liquidadas passam para o dia seguinte."
      />
      <FechamentoPanel
        contasPagar={contasPagar}
        receivables={receivables}
        cash={cash.map((c) => ({ data: c.data, valor: Number(c.valor) }))}
        saldoContas={saldoContas}
        hojeInternal={hojeInternal}
        canClose={can(ctx.perms, "fechamento", "criar")}
      />
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

### `src/components/app/access-denied.tsx`

Importa `page-header.tsx`, já listado acima.

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

### `src/components/app/fechamento-panel.tsx`

Arquivo único, com `FechamentoPanel` e o auxiliar `Resumo`.

```tsx
"use client";

import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import type { ContaPagarRow, ReceivableRow } from "@/lib/queries";
import { closeDia } from "@/lib/actions/fechamento";
import { brl0, dateBR } from "@/lib/utils";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input, Label } from "@/components/ui/input";
import { DateField } from "@/components/ui/date-field";
import { Table, THead, TH, TR, TD } from "@/components/ui/table";

function toISO(d: string | null): string {
  if (!d) return "";
  const p = d.split("/");
  return p.length === 3 ? `${p[2]}-${p[0].padStart(2, "0")}-${p[1].padStart(2, "0")}` : "";
}

export interface FechamentoPanelProps {
  contasPagar: ContaPagarRow[];
  receivables: ReceivableRow[];
  cash: { data: string | null; valor: number }[];
  saldoContas: number;
  hojeInternal: string; // "MM/DD/YYYY"
  canClose: boolean;
}

export function FechamentoPanel({
  contasPagar,
  receivables,
  cash,
  saldoContas,
  hojeInternal,
  canClose,
}: FechamentoPanelProps) {
  const router = useRouter();
  const [dia, setDia] = useState(hojeInternal);
  const [divergencias, setDivergencias] = useState("0");
  const [obs, setObs] = useState("");
  const [pending, start] = useTransition();
  const [msg, setMsg] = useState<string | null>(null);

  const diaISO = toISO(dia);

  // Somente o dia assinalado para fechamento: contas a pagar com vencimento no
  // dia (ainda não pagas) e recebíveis previstos para o dia. As pendências não
  // liquidadas são transferidas para o dia seguinte ao fechar (closeDia).
  const contasDia = useMemo(
    () =>
      contasPagar.filter((c) => {
        if (c.status === "Pago") return false;
        const iso = toISO(c.vencimento);
        return !!diaISO && iso === diaISO;
      }),
    [contasPagar, diaISO],
  );
  const receberDia = useMemo(
    () =>
      receivables.filter((r) => {
        const iso = toISO(r.dia);
        return !!diaISO && iso === diaISO;
      }),
    [receivables, diaISO],
  );

  const totalPagar = contasDia.reduce((a, c) => a + c.valor, 0);
  const totalReceber = receberDia.reduce((a, r) => a + r.valor, 0);

  // Entradas/saídas reais do dia (caixa) + saldo.
  const { entradas, saidas } = useMemo(() => {
    let e = 0, s = 0;
    for (const c of cash) {
      if (toISO(c.data) !== diaISO) continue;
      if (c.valor >= 0) e += c.valor;
      else s += -c.valor;
    }
    return { entradas: e, saidas: s };
  }, [cash, diaISO]);
  const saldoFinal = saldoContas + entradas - saidas;

  const fechar = () => {
    setMsg(null);
    const pendentes = [
      ...contasDia.map((c) => ({
        tipo: "pagar" as const,
        refId: c.id,
        descricao: `${c.fornecedorNome ?? ""} · ${c.descricao ?? ""}`.trim(),
        valor: c.valor,
        vencimento: c.vencimento,
      })),
      ...receberDia.map((r) => ({
        tipo: "receber" as const,
        refId: r.refId,
        descricao: r.descricao,
        valor: r.valor,
        vencimento: r.dia,
      })),
    ];
    start(async () => {
      try {
        await closeDia({
          dia,
          projectId: null,
          saldoInicial: saldoContas,
          totalEntradas: entradas,
          totalSaidas: saidas,
          divergencias: Number(divergencias) || 0,
          obs,
          pendentes,
        });
        setMsg("Dia fechado. Pendências transferidas para o dia seguinte.");
        router.refresh();
      } catch (e) {
        setMsg(e instanceof Error ? e.message : "Falha ao fechar o dia.");
      }
    });
  };

  return (
    <div className="space-y-5">
      {/* Controles + resumo do fechamento */}
      <Card>
        <CardContent className="grid grid-cols-2 gap-4 p-5 sm:grid-cols-4 lg:grid-cols-6">
          <div>
            <Label>Dia do fechamento</Label>
            <DateField value={dia} onChange={setDia} />
          </div>
          <Resumo label="Saldo inicial" value={brl0(saldoContas)} />
          <Resumo label="Entradas do dia" value={brl0(entradas)} tone="pos" />
          <Resumo label="Saídas do dia" value={brl0(saidas)} tone="neg" />
          <Resumo label="Saldo final" value={brl0(saldoFinal)} tone="accent" />
          <div>
            <Label>Divergências</Label>
            <Input
              type="number"
              step="0.01"
              value={divergencias}
              onChange={(e) => setDivergencias(e.target.value)}
            />
          </div>
        </CardContent>
      </Card>

      {/* Dois painéis */}
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        {/* Esquerda: Contas a Pagar do Dia */}
        <Card>
          <CardContent className="p-4">
            <div className="mb-3 flex items-center justify-between">
              <h2 className="text-sm font-semibold text-[var(--color-ink)]">
                Contas a Pagar do Dia
              </h2>
              <Badge tone="warning">{brl0(totalPagar)}</Badge>
            </div>
            <div className="tbl-scroll overflow-x-auto">
              <Table>
                <THead>
                  <tr>
                    <TH>Fornecedor</TH>
                    <TH>Descrição</TH>
                    <TH className="text-right">Valor</TH>
                    <TH>Vencimento</TH>
                    <TH>Forma</TH>
                    <TH>Status</TH>
                  </tr>
                </THead>
                <tbody>
                  {contasDia.map((c) => (
                    <TR key={c.id}>
                      <TD className="whitespace-nowrap font-medium text-[var(--color-ink)]">{c.fornecedorNome ?? "—"}</TD>
                      <TD className="max-w-[160px] truncate">{c.descricao ?? "—"}</TD>
                      <TD className="text-right font-[family-name:var(--font-mono)]">{brl0(c.valor)}</TD>
                      <TD className="font-[family-name:var(--font-mono)] text-[var(--color-ink2)]">{c.vencimento ? dateBR(c.vencimento) : "—"}</TD>
                      <TD>{c.formaPagamento ?? "—"}</TD>
                      <TD><Badge tone="warning">{c.status ?? "—"}</Badge></TD>
                    </TR>
                  ))}
                  {contasDia.length === 0 && (
                    <TR><TD colSpan={6} className="py-6 text-center text-[var(--color-ink4)]">Sem contas a pagar pendentes.</TD></TR>
                  )}
                </tbody>
              </Table>
            </div>
          </CardContent>
        </Card>

        {/* Direita: Receitas a Receber do Dia */}
        <Card>
          <CardContent className="p-4">
            <div className="mb-3 flex items-center justify-between">
              <h2 className="text-sm font-semibold text-[var(--color-ink)]">
                Receitas a Receber do Dia
              </h2>
              <Badge tone="success">{brl0(totalReceber)}</Badge>
            </div>
            <div className="tbl-scroll overflow-x-auto">
              <Table>
                <THead>
                  <tr>
                    <TH>Cliente</TH>
                    <TH>Projeto</TH>
                    <TH>Descrição</TH>
                    <TH className="text-right">Valor</TH>
                    <TH>Previsto</TH>
                    <TH>Status</TH>
                  </tr>
                </THead>
                <tbody>
                  {receberDia.map((r) => (
                    <TR key={r.refId}>
                      <TD className="whitespace-nowrap text-[var(--color-ink2)]">{r.clienteNome ?? "—"}</TD>
                      <TD className="whitespace-nowrap">{r.projectName}</TD>
                      <TD className="max-w-[160px] truncate">{r.descricao}</TD>
                      <TD className="text-right font-[family-name:var(--font-mono)]">{brl0(r.valor)}</TD>
                      <TD className="font-[family-name:var(--font-mono)] text-[var(--color-ink2)]">{dateBR(r.dia)}</TD>
                      <TD><Badge tone="neutral">{r.status}</Badge></TD>
                    </TR>
                  ))}
                  {receberDia.length === 0 && (
                    <TR><TD colSpan={6} className="py-6 text-center text-[var(--color-ink4)]">Sem receitas a receber previstas.</TD></TR>
                  )}
                </tbody>
              </Table>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Fechar o dia */}
      {canClose && (
        <Card>
          <CardContent className="flex flex-wrap items-end gap-3 p-5">
            <div className="flex-1">
              <Label>Observação do fechamento</Label>
              <Input value={obs} onChange={(e) => setObs(e.target.value)} placeholder="Opcional" />
            </div>
            {msg && <span className="text-xs text-[var(--color-ink3)]">{msg}</span>}
            <Button onClick={fechar} disabled={pending}>
              {pending ? "Fechando…" : "Fechar o dia"}
            </Button>
          </CardContent>
        </Card>
      )}
    </div>
  );
}

function Resumo({ label, value, tone }: { label: string; value: string; tone?: "pos" | "neg" | "accent" }) {
  const color =
    tone === "pos" ? "var(--color-success)" : tone === "neg" ? "var(--color-danger)" : tone === "accent" ? "var(--color-accent)" : "var(--color-ink)";
  return (
    <div>
      <p className="font-[family-name:var(--font-mono)] text-[10px] uppercase tracking-wide text-[var(--color-ink3)]">{label}</p>
      <p className="mt-1 text-lg font-semibold" style={{ color }}>{value}</p>
    </div>
  );
}
```

---

## 3. Funções de `queries.ts` chamadas pela página


Quatro, no `Promise.all` das linhas 21–26. **Todas filtram por `tenant_id`,
nenhuma por versão nem por projeto** — o fechamento é consolidado do tenant.

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

### `src/lib/queries.ts` · linhas 1069–1078

`getCashByTenant` — note o `innerJoin` com `version.kind = "atual"`: só o caixa das versões Atual entra.

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


A página ainda usa `saldoDisponivel`, que não está em `queries.ts`:

### `src/lib/contas-saldo.ts`

`src/lib/contas-saldo.ts` inteiro — a origem do "Saldo inicial" (seção 6).

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

---

## 4. As Server Actions de fechamento


É **uma só**: `closeDia`. O arquivo inteiro tem 115 linhas. Não existe action
de reabertura, correção ou exclusão de fechamento.

### `src/lib/actions/fechamento.ts`

```ts
"use server";

import { eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { db, schema } from "@/lib/db";
import { getActiveContext } from "@/lib/context";
import { can } from "@/lib/permissions";
import { logAudit } from "@/lib/audit";

export interface PendenteInput {
  tipo: "pagar" | "receber";
  refId: string;
  descricao: string;
  valor: number;
  vencimento: string | null;
}

export interface CloseDiaInput {
  /** dia do fechamento, "MM/DD/YYYY". */
  dia: string;
  projectId?: string | null;
  saldoInicial: number;
  totalEntradas: number;
  totalSaidas: number;
  divergencias: number;
  obs?: string;
  /** contas a pagar/receber ainda pendentes → transferidas para o dia seguinte. */
  pendentes: PendenteInput[];
}

/** Próximo dia de uma data "MM/DD/YYYY". */
function nextDayBR(dia: string): string {
  const p = dia.split("/");
  if (p.length !== 3) return dia;
  const d = new Date(Number(p[2]), Number(p[0]) - 1, Number(p[1]) + 1);
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  const dd = String(d.getDate()).padStart(2, "0");
  return `${mm}/${dd}/${d.getFullYear()}`;
}

/**
 * Registra o fechamento operacional de um dia (Balanço do Dia) e transfere as
 * pendências (contas a pagar/receber não liquidadas) para o dia seguinte,
 * mantendo histórico de auditoria.
 */
export async function closeDia(input: CloseDiaInput): Promise<void> {
  const ctx = await getActiveContext();
  if (!ctx || !can(ctx.perms, "fechamento", "criar")) {
    throw new Error("Sem permissão para fechar o caixa.");
  }
  const saldoFinal =
    Number(input.saldoInicial) + Number(input.totalEntradas) - Number(input.totalSaidas);

  const [me] = ctx.userId
    ? await db
        .select({ name: schema.users.name, email: schema.users.email })
        .from(schema.users)
        .where(eq(schema.users.id, ctx.userId))
        .limit(1)
    : [];
  const responsavelNome = me?.name || me?.email || ctx.userEmail || "—";
  const toDia = nextDayBR(input.dia);

  await db.transaction(async (tx) => {
    const [closing] = await tx
      .insert(schema.dailyClosings)
      .values({
        tenantId: ctx.tenant.id,
        projectId: input.projectId ?? null,
        dia: input.dia,
        saldoInicial: String(input.saldoInicial),
        totalEntradas: String(input.totalEntradas),
        totalSaidas: String(input.totalSaidas),
        saldoFinal: String(saldoFinal),
        divergencias: String(input.divergencias),
        responsavelId: ctx.userId,
        responsavelNome,
        obs: input.obs || null,
      })
      .returning();

    if (input.pendentes.length) {
      await tx.insert(schema.carryOvers).values(
        input.pendentes.map((p) => ({
          tenantId: ctx.tenant.id,
          closingId: closing.id,
          tipo: p.tipo,
          refId: p.refId,
          descricao: p.descricao,
          valor: String(p.valor),
          vencimento: p.vencimento,
          fromDia: input.dia,
          toDia,
        })),
      );
    }
  });

  await logAudit({
    tenantId: ctx.tenant.id,
    userId: ctx.userId,
    action: "caixa.fechamento",
    entity: "daily_closing",
    entityId: input.dia,
    meta: {
      dia: input.dia,
      saldoFinal,
      pendentes: input.pendentes.length,
      transferidasPara: toDia,
    },
  });

  revalidatePath("/fechamento");
  revalidatePath("/balancodia");
}
```

---

## 5. `daily_closing` e `carry_over` no schema


As duas nasceram na mesma migração, `0018_fechamento_balanco_carryover.sql`,
que **não cria índice nem constraint `UNIQUE`** em nenhuma das duas.

Como em `cash_entry` e `stock_movement`, **não há enum**: `carry_over.tipo` é
`text` `notNull` com `"pagar" | "receber"` apenas no comentário
(`schema.ts:1455`).

### `src/lib/db/schema.ts` · linhas 1414–1440

`daily_closing`.

```ts
/**
 * Fechamento operacional diário (Balanço do Dia). Persiste o resultado do
 * fechamento de caixa de um dia (por obra ou consolidado).
 */
export const dailyClosings = pgTable("daily_closing", {
  id: uuid("id").primaryKey().defaultRandom(),
  tenantId: uuid("tenant_id")
    .notNull()
    .references(() => tenants.id, { onDelete: "cascade" }),
  /** obra do fechamento; NULL = consolidado (todas as obras). */
  projectId: uuid("project_id").references(() => projects.id, {
    onDelete: "set null",
  }),
  /** dia do fechamento, "MM/DD/YYYY". */
  dia: text("dia").notNull(),
  saldoInicial: numeric("saldo_inicial", { precision: 15, scale: 2 }).notNull().default("0"),
  totalEntradas: numeric("total_entradas", { precision: 15, scale: 2 }).notNull().default("0"),
  totalSaidas: numeric("total_saidas", { precision: 15, scale: 2 }).notNull().default("0"),
  saldoFinal: numeric("saldo_final", { precision: 15, scale: 2 }).notNull().default("0"),
  divergencias: numeric("divergencias", { precision: 15, scale: 2 }).notNull().default("0"),
  responsavelId: text("responsavel_id").references(() => users.id, {
    onDelete: "set null",
  }),
  responsavelNome: text("responsavel_nome"),
  obs: text("obs"),
  closedAt: timestamp("closed_at", { mode: "date" }).notNull().defaultNow(),
});
```

### `src/lib/db/schema.ts` · linhas 1442–1465

`carry_over`.

```ts
/**
 * Histórico de transferências de pendências entre fechamentos (auditoria).
 * Cada conta a pagar/receber não liquidada no fechamento é registrada como
 * transferida para o dia seguinte.
 */
export const carryOvers = pgTable("carry_over", {
  id: uuid("id").primaryKey().defaultRandom(),
  tenantId: uuid("tenant_id")
    .notNull()
    .references(() => tenants.id, { onDelete: "cascade" }),
  closingId: uuid("closing_id").references(() => dailyClosings.id, {
    onDelete: "cascade",
  }),
  /** "pagar" | "receber" */
  tipo: text("tipo").notNull(),
  /** id da despesa ou chave do recebível. */
  refId: text("ref_id"),
  descricao: text("descricao"),
  valor: numeric("valor", { precision: 15, scale: 2 }).notNull().default("0"),
  vencimento: text("vencimento"),
  fromDia: text("from_dia").notNull(),
  toDia: text("to_dia").notNull(),
  createdAt: timestamp("created_at", { mode: "date" }).notNull().defaultNow(),
});
```

---

## 6. De onde vem o "Saldo inicial"


Da soma dos saldos **atuais das contas correntes** — não do fechamento
anterior.

A cadeia completa:

```
bank_account.saldo        ← coluna do banco, atualizada por importCash
  → getBankAccounts(ctx.tenant.id)        page.tsx:25
  → saldoDisponivel(contas)               page.tsx:27
       filtra fora as contas tipo "Terceiros"  (contas-saldo.ts:22–26)
  → prop saldoContas                      page.tsx:45
  → <Resumo label="Saldo inicial">        fechamento-panel.tsx:130
  → closeDia({ saldoInicial: saldoContas })  fechamento-panel.tsx:106
```

Três consequências que saem direto dessa cadeia:

- **Não é o `saldo_final` do dia anterior.** Nenhuma consulta lê
  `daily_closing` para montar esta tela — a página não importa
  `getDailyClosings`. Não há encadeamento entre fechamentos.
- **Não depende do dia selecionado.** O campo "Dia do fechamento" é estado
  local (`fechamento-panel.tsx:39`) e filtra as listas e as entradas/saídas,
  mas o Saldo inicial continua sendo o saldo de hoje das contas. Fechar um dia
  retroativo grava o saldo de hoje como saldo inicial daquele dia.
- **Exclui contas do tipo "Terceiros"**, por decisão documentada em
  `contas-saldo.ts:1–8`: são obrigações com sócios, não caixa disponível.

O **Saldo final** exibido é `saldoContas + entradas − saidas`
(`fechamento-panel.tsx:81`), e o servidor recalcula a mesma conta antes de
gravar (`fechamento.ts:51–52`) — não confia no número do cliente.

### `src/app/(app)/fechamento/page.tsx` · linhas 21–32

A origem, no `page.tsx`.

```tsx
  const [contasPagar, receivables, cash, contas] = await Promise.all([
    getContasPagar(ctx.tenant.id),
    getReceivables(ctx.tenant.id),
    getCashByTenant(ctx.tenant.id),
    getBankAccounts(ctx.tenant.id),
  ]);
  const saldoContas = saldoDisponivel(contas);

  const now = new Date();
  const hojeInternal = `${String(now.getMonth() + 1).padStart(2, "0")}/${String(
    now.getDate(),
  ).padStart(2, "0")}/${now.getFullYear()}`;
```

### `src/components/app/fechamento-panel.tsx` · linhas 71–82

Entradas, saídas e saldo final, no cliente.

```tsx
  // Entradas/saídas reais do dia (caixa) + saldo.
  const { entradas, saidas } = useMemo(() => {
    let e = 0, s = 0;
    for (const c of cash) {
      if (toISO(c.data) !== diaISO) continue;
      if (c.valor >= 0) e += c.valor;
      else s += -c.valor;
    }
    return { entradas: e, saidas: s };
  }, [cash, diaISO]);
  const saldoFinal = saldoContas + entradas - saidas;
```

---

## 7. O que "Fechar o dia" grava — e se trava alterações


### 7.1 O que grava

Uma transação com dois inserts (`fechamento.ts:64–97`):

**`daily_closing`** — uma linha:

| Campo | Valor |
|---|---|
| `dia` | o dia selecionado, `"MM/DD/YYYY"` |
| `projectId` | **sempre `null`** — o cliente envia `projectId: null` fixo (`fechamento-panel.tsx:105`), embora a action aceite o campo |
| `saldoInicial` | `saldoContas` (seção 6) |
| `totalEntradas` / `totalSaidas` | o caixa do dia, calculado no cliente |
| `saldoFinal` | **recalculado no servidor**: `saldoInicial + entradas − saidas` |
| `divergencias` | o número digitado (seção 8) |
| `responsavelId` / `responsavelNome` | do contexto, com busca do nome em `user` |
| `obs` | texto livre |
| `closedAt` | `defaultNow()` do Postgres |

**`carry_over`** — uma linha por pendência, só se houver
(`fechamento.ts:82–96`). As pendências são montadas no cliente
(`fechamento-panel.tsx:85–100`): as contas a pagar do dia ainda não pagas e
**todos** os recebíveis previstos para o dia. Cada linha guarda `tipo`,
`refId`, `descricao`, `valor`, `vencimento`, `fromDia` e `toDia` (o dia
seguinte, via `nextDayBR`).

Auditoria: `action: "caixa.fechamento"`, `entity: "daily_closing"`, com
`entityId` = **o dia**, não o id da linha.

### 7.2 Impede alteração posterior? **Não.**

O fechamento é um **registro**, não uma trava. Verificado em três frentes:

| Onde uma trava poderia existir | O que há |
|---|---|
| Coluna de bloqueio em `cash_entry` ou `despesa` | nenhuma é tocada por `closeDia` |
| Checagem de `daily_closing` nas actions de caixa/despesa | **nenhuma** — `dailyClosings` só aparece em `fechamento.ts` (insert) e em `queries.ts` (leitura) |
| `UNIQUE` em `(tenant, dia)` | não existe na migração 0018 |

Consequências:

- Lançamentos do dia fechado continuam podendo ser criados, editados,
  conciliados e excluídos normalmente — `addCash`, `importCash`,
  `toggleConciliado`, `conciliarDespesa` etc. não consultam `daily_closing`.
- **O mesmo dia pode ser fechado várias vezes**, gerando linhas duplicadas em
  `daily_closing` e novos `carry_over` a cada vez. Não há checagem de
  existência antes do insert, nem constraint no banco.
- Quem trava lançamento é outra coisa: `ctx.version.locked`, verificado nas
  actions de caixa. O fechamento não mexe nisso.

### 7.3 As pendências "transferidas"

A mensagem exibida é *"Dia fechado. Pendências transferidas para o dia
seguinte."* (`fechamento-panel.tsx:113`). O que acontece de fato é apenas o
insert em `carry_over`: **nenhuma despesa tem o vencimento alterado, nenhum
recebível é remarcado.** A "transferência" é o registro histórico, e — como
mostra a seção 10 — esse registro nunca é lido de volta.

### `src/lib/actions/fechamento.ts` · linhas 41–115

`closeDia` inteira.

```ts
/**
 * Registra o fechamento operacional de um dia (Balanço do Dia) e transfere as
 * pendências (contas a pagar/receber não liquidadas) para o dia seguinte,
 * mantendo histórico de auditoria.
 */
export async function closeDia(input: CloseDiaInput): Promise<void> {
  const ctx = await getActiveContext();
  if (!ctx || !can(ctx.perms, "fechamento", "criar")) {
    throw new Error("Sem permissão para fechar o caixa.");
  }
  const saldoFinal =
    Number(input.saldoInicial) + Number(input.totalEntradas) - Number(input.totalSaidas);

  const [me] = ctx.userId
    ? await db
        .select({ name: schema.users.name, email: schema.users.email })
        .from(schema.users)
        .where(eq(schema.users.id, ctx.userId))
        .limit(1)
    : [];
  const responsavelNome = me?.name || me?.email || ctx.userEmail || "—";
  const toDia = nextDayBR(input.dia);

  await db.transaction(async (tx) => {
    const [closing] = await tx
      .insert(schema.dailyClosings)
      .values({
        tenantId: ctx.tenant.id,
        projectId: input.projectId ?? null,
        dia: input.dia,
        saldoInicial: String(input.saldoInicial),
        totalEntradas: String(input.totalEntradas),
        totalSaidas: String(input.totalSaidas),
        saldoFinal: String(saldoFinal),
        divergencias: String(input.divergencias),
        responsavelId: ctx.userId,
        responsavelNome,
        obs: input.obs || null,
      })
      .returning();

    if (input.pendentes.length) {
      await tx.insert(schema.carryOvers).values(
        input.pendentes.map((p) => ({
          tenantId: ctx.tenant.id,
          closingId: closing.id,
          tipo: p.tipo,
          refId: p.refId,
          descricao: p.descricao,
          valor: String(p.valor),
          vencimento: p.vencimento,
          fromDia: input.dia,
          toDia,
        })),
      );
    }
  });

  await logAudit({
    tenantId: ctx.tenant.id,
    userId: ctx.userId,
    action: "caixa.fechamento",
    entity: "daily_closing",
    entityId: input.dia,
    meta: {
      dia: input.dia,
      saldoFinal,
      pendentes: input.pendentes.length,
      transferidasPara: toDia,
    },
  });

  revalidatePath("/fechamento");
  revalidatePath("/balancodia");
}
```

### `src/components/app/fechamento-panel.tsx` · linhas 83–119

A montagem das pendências e a chamada, no cliente.

```tsx
  const fechar = () => {
    setMsg(null);
    const pendentes = [
      ...contasDia.map((c) => ({
        tipo: "pagar" as const,
        refId: c.id,
        descricao: `${c.fornecedorNome ?? ""} · ${c.descricao ?? ""}`.trim(),
        valor: c.valor,
        vencimento: c.vencimento,
      })),
      ...receberDia.map((r) => ({
        tipo: "receber" as const,
        refId: r.refId,
        descricao: r.descricao,
        valor: r.valor,
        vencimento: r.dia,
      })),
    ];
    start(async () => {
      try {
        await closeDia({
          dia,
          projectId: null,
          saldoInicial: saldoContas,
          totalEntradas: entradas,
          totalSaidas: saidas,
          divergencias: Number(divergencias) || 0,
          obs,
          pendentes,
        });
        setMsg("Dia fechado. Pendências transferidas para o dia seguinte.");
        router.refresh();
      } catch (e) {
        setMsg(e instanceof Error ? e.message : "Falha ao fechar o dia.");
      }
    });
  };
```

---

## 8. O que alimenta "Divergências"


**Só digitação.** Nada no repositório calcula esse número.

É um `useState("0")` (`fechamento-panel.tsx:40`) ligado a um `<Input
type="number">` (`:136–141`), enviado como
`divergencias: Number(divergencias) || 0` (`:109`) e gravado cru pela action
em `daily_closing.divergencias` (`fechamento.ts:75`).

O que **não** existe:

- nenhuma comparação entre o saldo calculado e o saldo real das contas;
- nenhum uso do campo em validação — o botão não é bloqueado por valor nenhum;
- nenhuma leitura do campo fora da listagem do Balanço do Dia;
- nenhum valor sugerido: o campo nasce em `"0"` e só muda se a pessoa digitar.

Vale notar que os dados para calcular uma divergência estão todos na tela —
`saldoFinal` calculado e `saldoContas` das contas — mas o código não faz a
conta em lugar nenhum.

### `src/components/app/fechamento-panel.tsx` · linhas 38–44

O estado inicial.

```tsx
  const router = useRouter();
  const [dia, setDia] = useState(hojeInternal);
  const [divergencias, setDivergencias] = useState("0");
  const [obs, setObs] = useState("");
  const [pending, start] = useTransition();
  const [msg, setMsg] = useState<string | null>(null);
```

### `src/components/app/fechamento-panel.tsx` · linhas 124–144

O campo na interface, ao lado dos indicadores calculados.

```tsx
      <Card>
        <CardContent className="grid grid-cols-2 gap-4 p-5 sm:grid-cols-4 lg:grid-cols-6">
          <div>
            <Label>Dia do fechamento</Label>
            <DateField value={dia} onChange={setDia} />
          </div>
          <Resumo label="Saldo inicial" value={brl0(saldoContas)} />
          <Resumo label="Entradas do dia" value={brl0(entradas)} tone="pos" />
          <Resumo label="Saídas do dia" value={brl0(saidas)} tone="neg" />
          <Resumo label="Saldo final" value={brl0(saldoFinal)} tone="accent" />
          <div>
            <Label>Divergências</Label>
            <Input
              type="number"
              step="0.01"
              value={divergencias}
              onChange={(e) => setDivergencias(e.target.value)}
            />
          </div>
        </CardContent>
      </Card>
```

---

## 9. Quem lê `daily_closing` fora desta tela


**Um lugar só:** a tela **Balanço do Dia** (`/balancodia`), via
`getDailyClosings` (`queries.ts:458`).

| Arquivo:linha | Operação |
|---|---|
| `src/lib/actions/fechamento.ts:66` | **INSERT** (único) |
| `src/lib/queries.ts:458–475` | **SELECT** (único) — `getDailyClosings` |
| `src/app/(app)/balancodia/page.tsx:20` | chama `getDailyClosings` |

`getDailyClosings` traz os fechamentos do tenant, mais recentes primeiro, com
`leftJoin` em `project` e `cliente` para o nome. Nenhum relatório — DRE, fluxo
de caixa, consolidado, dashboard — lê a tabela. Nenhuma action de caixa ou
despesa a consulta.

### `src/lib/queries.ts` · linhas 452–475

`DailyClosingRow` e `getDailyClosings` — a única leitura.

```ts
export type DailyClosingRow = typeof schema.dailyClosings.$inferSelect & {
  projectName: string | null;
  clienteNome: string | null;
};

/** Fechamentos diários (Balanço do Dia) do tenant, mais recentes primeiro. */
export async function getDailyClosings(tenantId: string): Promise<DailyClosingRow[]> {
  const rows = await db
    .select({
      c: schema.dailyClosings,
      projectName: schema.projects.name,
      clienteNome: schema.clientes.nomeCompleto,
    })
    .from(schema.dailyClosings)
    .leftJoin(schema.projects, eq(schema.dailyClosings.projectId, schema.projects.id))
    .leftJoin(schema.clientes, eq(schema.projects.clienteId, schema.clientes.id))
    .where(eq(schema.dailyClosings.tenantId, tenantId))
    .orderBy(desc(schema.dailyClosings.closedAt));
  return rows.map((r) => ({
    ...r.c,
    projectName: r.projectName,
    clienteNome: r.clienteNome,
  }));
}
```

### `src/app/(app)/balancodia/page.tsx`

A tela que a consome, inteira.

```tsx
import { getActiveContext } from "@/lib/context";
import { getDailyClosings } from "@/lib/queries";
import { can } from "@/lib/permissions";
import { PageHeader } from "@/components/app/page-header";
import { AccessDenied } from "@/components/app/access-denied";
import { BalancoDiaTable } from "@/components/app/balanco-dia-table";

export const dynamic = "force-dynamic";

function fmtDateTime(d: Date): string {
  const p = (n: number) => String(n).padStart(2, "0");
  return `${p(d.getDate())}/${p(d.getMonth() + 1)}/${d.getFullYear()} ${p(d.getHours())}:${p(d.getMinutes())}`;
}

export default async function BalancoDiaPage() {
  const ctx = await getActiveContext();
  if (!ctx) return null;
  if (!can(ctx.perms, "balancodia", "ver")) return <AccessDenied />;

  const closings = await getDailyClosings(ctx.tenant.id);

  return (
    <>
      <PageHeader
        eyebrow={ctx.tenant.name}
        title="Balanço do Dia"
        subtitle="Fechamentos operacionais diários — filtre por período, obra e cliente; imprima ou exporte."
      />
      <BalancoDiaTable
        rows={closings.map((c) => ({
          id: c.id,
          dia: c.dia,
          saldoInicial: Number(c.saldoInicial),
          totalEntradas: Number(c.totalEntradas),
          totalSaidas: Number(c.totalSaidas),
          saldoFinal: Number(c.saldoFinal),
          divergencias: Number(c.divergencias),
          responsavelNome: c.responsavelNome,
          projectName: c.projectName,
          clienteNome: c.clienteNome,
          fechadoEm: fmtDateTime(c.closedAt),
        }))}
      />
    </>
  );
}
```

---

## 10. Existe algum uso de `carry_over` no repositório?


**Existe uma escrita e nenhuma leitura.**

Busca por `carryOver` / `carry_over` / `carryOvers` em todo o repositório
(`.ts`, `.tsx`, `.sql`, fora de `node_modules` e `.next`) devolve **cinco**
ocorrências, e só uma é código de aplicação:

```
src/lib/actions/fechamento.ts:83   await tx.insert(schema.carryOvers)...   ← INSERT
src/lib/db/schema.ts:1447           definição da tabela
src/lib/db/migrations/0018_…:1      CREATE TABLE "carry_over"
src/lib/db/migrations/0018_…:31     FK tenant_id
src/lib/db/migrations/0018_…:32     FK closing_id
```

Ou seja:

- **zero `SELECT`** — nenhuma query, nenhuma action, nenhum componente, nenhum
  script lê a tabela;
- não há função em `queries.ts` para ela, nem tipo `CarryOverRow`;
- o Balanço do Dia lê `daily_closing` mas **não** faz join com `carry_over`;
- a coluna `toDia`, que aponta o dia de destino da pendência, nunca é
  consultada por nada.

O comentário do schema descreve a tabela como *"Histórico de transferências de
pendências entre fechamentos (auditoria)"* (`schema.ts:1442–1446`). Ela cumpre
isso no sentido de gravar o fato; o dado fica no banco e não é exibido nem
consumido por nenhuma tela do app.

### `src/lib/actions/fechamento.ts` · linhas 82–96

A única escrita em `carry_over`, em toda a base.

```ts
    if (input.pendentes.length) {
      await tx.insert(schema.carryOvers).values(
        input.pendentes.map((p) => ({
          tenantId: ctx.tenant.id,
          closingId: closing.id,
          tipo: p.tipo,
          refId: p.refId,
          descricao: p.descricao,
          valor: String(p.valor),
          vencimento: p.vencimento,
          fromDia: input.dia,
          toDia,
        })),
      );
    }
```
