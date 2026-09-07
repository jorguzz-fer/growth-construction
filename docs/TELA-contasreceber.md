# TELA-contasreceber — código na íntegra

Coleta do código da tela **Contas a Receber** (`/contasreceber`), em `main`
(commit `45f4ce3`). Sem resumo, sem análise.

> **Item 4 — a baixa/confirmação de recebimento NÃO existe em `main`.**
>
> A funcionalidade foi escrita e está na PR #73, branch
> `claude/baixa-contas-receber` (commit `f30fcfb`), **ainda não mesclada**.
> Em `main` a tela não tem botão de baixa: `src/lib/calc/baixa-receber.ts` e
> `src/components/app/baixa-receber.tsx` não existem, e
> `src/lib/actions/contas-receber.ts` exporta apenas três actions —
> `createContaReceber`, `updateContaReceber` e `cancelarContaReceber`.
>
> O que existe hoje em `main` para marcar uma conta como recebida é a
> conciliação vinda do Caixa Diário (`conciliarContaReceber`, em
> `src/lib/actions/caixa.ts`), que atualiza `valor_recebido`, `status` e
> `data_recebimento` da conta. Ela é disparada pela tela `/caixa`, não por
> esta — por isso está fora desta coleta.

**Árvore de dependências própria:**

```
contasreceber/page.tsx
├── components/app/page-header.tsx
├── components/app/access-denied.tsx
│   └── components/app/page-header.tsx        (já listado)
├── components/app/project-picker.tsx
├── components/app/receita-search.tsx
└── components/app/contas-receber-manager.tsx
    └── components/app/sortable-th.tsx

queries chamadas:  getContasReceber · getClientes · getBankAccounts
                   getReceivables · getUnitCodesByTenant  (em TELA-unidades.md)
server actions:    createContaReceber · updateContaReceber · cancelarContaReceber
                   (todas em actions/contas-receber.ts)
```

Ficam de fora os primitivos de `components/ui/` (`badge`, `button`, `card`,
`date-field`, `input`, `money-input`, `table`) e `@/lib/busca`,
`@/lib/context`, `@/lib/permissions`, `@/lib/tabela-ordenacao`, `@/lib/utils`.

---

## 1. Página

### `src/app/(app)/contasreceber/page.tsx`

```tsx
import { getActiveContext } from "@/lib/context";
import {
  getContasReceber,
  getReceivables,
  getClientes,
  getBankAccounts,
  getUnitCodesByTenant,
} from "@/lib/queries";
import { can } from "@/lib/permissions";
import { PageHeader } from "@/components/app/page-header";
import { AccessDenied } from "@/components/app/access-denied";
import { ContasReceberManager } from "@/components/app/contas-receber-manager";
import { ReceitaSearch, type ReceitaBuscavel } from "@/components/app/receita-search";
import { ProjectPicker } from "@/components/app/project-picker";

export const dynamic = "force-dynamic";

export default async function ContasReceberPage({
  searchParams,
}: {
  searchParams: Promise<{ proj?: string }>;
}) {
  const ctx = await getActiveContext();
  if (!ctx) return null;
  if (!can(ctx.perms, "contasreceber", "ver")) return <AccessDenied />;

  const sp = await searchParams;

  const [contasAll, receivablesAll, clientes, bancos, unidades] = await Promise.all([
    getContasReceber(ctx.tenant.id),
    getReceivables(ctx.tenant.id),
    getClientes(ctx.tenant.id),
    getBankAccounts(ctx.tenant.id),
    getUnitCodesByTenant(ctx.tenant.id),
  ]);

  // Filtro por projeto (?proj=): "all" mostra todos. As DUAS listagens — contas
  // lançadas e recebíveis das vendas — respeitam o projeto escolhido.
  const isAll = !sp.proj || sp.proj === "all";
  const projSel = isAll
    ? null
    : (ctx.projects.find((p) => p.id === sp.proj) ?? null);
  const contas = projSel ? contasAll.filter((c) => c.projectId === projSel.id) : contasAll;
  const receivables = projSel
    ? receivablesAll.filter((r) => r.projectId === projSel.id)
    : receivablesAll;

  // Lista unificada para a busca (contas lançadas + recebíveis das vendas).
  const receitasBuscaveis: ReceitaBuscavel[] = [
    ...contas.map((c) => ({
      id: c.id,
      origem: "conta" as const,
      descricao: c.descricao,
      clienteNome: c.clienteNome,
      projectName: c.projectName,
      unitCode: c.unitCode,
      tipo: c.tipo,
      valor: Number(c.valor),
      vencimento: c.vencimento,
      status: c.status,
    })),
    ...receivables.map((r) => ({
      id: r.refId,
      origem: "recebivel" as const,
      descricao: r.descricao,
      clienteNome: r.clienteNome,
      projectName: r.projectName,
      unitCode: r.unitCode,
      tipo: null,
      valor: r.valor,
      vencimento: r.dia,
      status: r.status,
    })),
  ];

  return (
    <>
      <PageHeader
        eyebrow={projSel ? `${projSel.name} · ${ctx.tenant.name}` : `Todos os projetos · ${ctx.tenant.name}`}
        title="Contas a Receber"
        actions={
          <ProjectPicker
            projects={ctx.projects.map((p) => ({ id: p.id, label: p.name }))}
            selected={projSel ? projSel.id : "all"}
            allOption
          />
        }
        subtitle="Recebíveis das vendas (Unidades) e contas a receber lançadas manualmente — vinculadas a um projeto."
      />
      {/* Busca de receitas: cobre as duas origens da tela — contas a receber
          lançadas e recebíveis derivados dos planos de venda. */}
      <div className="mb-3">
        <ReceitaSearch rows={receitasBuscaveis} />
      </div>

      <ContasReceberManager
        projetos={ctx.projects.map((p) => ({ id: p.id, nome: p.name }))}
        clientes={clientes.map((c) => ({ id: c.id, nome: c.nomeCompleto }))}
        bancos={bancos.map((b) => ({ id: b.id, nome: `${b.banco}${b.cc ? " · " + b.cc : ""}` }))}
        unidades={unidades}
        contas={contas}
        unitReceb={receivables.map((r) => ({
          unitCode: r.unitCode,
          projectName: r.projectName,
          clienteNome: r.clienteNome,
          descricao: r.descricao,
          dia: r.dia,
          valor: r.valor,
        }))}
        canCriar={can(ctx.perms, "contasreceber", "criar")}
        canEditar={can(ctx.perms, "contasreceber", "editar")}
        canExcluir={can(ctx.perms, "contasreceber", "excluir")}
      />
    </>
  );
}
```

---

## 2. Componentes de `components/app/`

| Componente | Importado por |
|---|---|
| `page-header` | a página e `access-denied` |
| `access-denied` | a página |
| `project-picker` | a página |
| `receita-search` | a página |
| `contas-receber-manager` | a página |
| `sortable-th` | `contas-receber-manager` |

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

### `src/components/app/receita-search.tsx`

```tsx
"use client";

import { useMemo, useRef, useState } from "react";
import { brl0, dateBR } from "@/lib/utils";
import { Badge } from "@/components/ui/badge";
import { registroCasa } from "@/lib/busca";

/** Uma receita pesquisável — serve tanto para conta a receber quanto recebível. */
export interface ReceitaBuscavel {
  id: string;
  /** "conta" = conta a receber lançada; "recebivel" = derivado do plano de venda. */
  origem: "conta" | "recebivel";
  descricao: string | null;
  clienteNome: string | null;
  projectName: string | null;
  unitCode: string | null;
  tipo: string | null;
  valor: number;
  /** vencimento/previsto "MM/DD/YYYY". */
  vencimento: string | null;
  status: string | null;
}

/**
 * Busca de receitas em Contas a Receber. Mesmo motor da busca de despesas:
 * casa por similaridade em vários campos (cliente, descrição, unidade, projeto,
 * tipo, status e valor), aceita vários termos em qualquer ordem e filtra a cada
 * caractere digitado.
 *
 * Cobre as DUAS origens da tela: as contas a receber lançadas e os recebíveis
 * derivados dos planos de pagamento das vendas.
 */
export function ReceitaSearch({ rows }: { rows: ReceitaBuscavel[] }) {
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState("");
  const inputRef = useRef<HTMLInputElement>(null);

  const resultados = useMemo(() => {
    if (!q.trim()) return [];
    return rows
      .filter((r) =>
        registroCasa(
          q,
          [
            r.descricao,
            r.clienteNome,
            r.projectName,
            r.unitCode,
            r.tipo,
            r.status,
            r.vencimento,
          ],
          [r.valor],
        ),
      )
      .slice(0, 60);
  }, [q, rows]);

  const total = resultados.reduce((a, r) => a + r.valor, 0);
  const abrir = () => {
    setOpen(true);
    setTimeout(() => inputRef.current?.focus(), 30);
  };
  const fechar = () => {
    setOpen(false);
    setQ("");
  };

  return (
    <>
      <div className="relative w-full">
        <span
          aria-hidden
          className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-[var(--color-ink3)]"
        >
          🔍
        </span>
        <input
          readOnly
          onFocus={abrir}
          onClick={abrir}
          placeholder="Buscar receita por cliente, unidade, descrição, projeto ou valor…"
          className="w-full cursor-pointer rounded-[8px] border border-[var(--color-accent2)]/25 bg-white py-2 pl-9 pr-3 text-[13px] text-[var(--color-ink2)] placeholder:text-[var(--color-ink4)] hover:bg-[var(--color-surface2)] focus:border-[var(--color-accent2)] focus:outline-none"
        />
      </div>

      {open && (
        <div
          className="fixed inset-0 z-50 flex items-start justify-center bg-black/40 p-4 pt-[8vh]"
          onClick={fechar}
        >
          <div
            className="w-full max-w-2xl overflow-hidden rounded-[12px] bg-white shadow-xl"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center gap-2 border-b border-[var(--color-accent2)]/12 px-4 py-3">
              <span aria-hidden className="text-[var(--color-ink3)]">🔍</span>
              <input
                ref={inputRef}
                value={q}
                onChange={(e) => setQ(e.target.value)}
                onKeyDown={(e) => e.key === "Escape" && fechar()}
                placeholder="Cliente, unidade, descrição, projeto, tipo ou valor…"
                className="w-full bg-transparent text-[14px] text-[var(--color-ink)] outline-none placeholder:text-[var(--color-ink4)]"
              />
              <button
                onClick={fechar}
                className="text-[var(--color-ink3)] hover:text-[var(--color-ink)]"
                aria-label="Fechar"
              >
                ✕
              </button>
            </div>

            <div className="max-h-[60vh] overflow-auto">
              {q.trim().length === 0 ? (
                <p className="px-4 py-8 text-center text-[12.5px] text-[var(--color-ink3)]">
                  Digite para buscar entre {rows.length} receitas (contas lançadas e
                  recebíveis das vendas).
                </p>
              ) : resultados.length === 0 ? (
                <p className="px-4 py-8 text-center text-[12.5px] text-[var(--color-ink3)]">
                  Nenhuma receita encontrada para “{q}”.
                </p>
              ) : (
                <ul className="divide-y divide-[var(--color-accent2)]/8">
                  {resultados.map((r) => (
                    <li
                      key={`${r.origem}-${r.id}`}
                      className="flex items-center gap-3 px-4 py-2.5"
                    >
                      <Badge tone={r.origem === "conta" ? "accent" : "neutral"}>
                        {r.origem === "conta" ? "Conta" : "Venda"}
                      </Badge>
                      <span className="min-w-0 flex-1 truncate text-[13px] text-[var(--color-ink)]">
                        {r.clienteNome ?? "—"}
                        {r.unitCode ? (
                          <span className="text-[var(--color-ink3)]"> · {r.unitCode}</span>
                        ) : null}
                        {r.descricao ? (
                          <span className="text-[var(--color-ink3)]"> · {r.descricao}</span>
                        ) : null}
                      </span>
                      {r.status && <Badge tone="neutral">{r.status}</Badge>}
                      <span className="w-24 shrink-0 text-right font-[family-name:var(--font-mono)] text-[12.5px] text-[var(--color-success)]">
                        {brl0(r.valor)}
                      </span>
                      <span className="w-20 shrink-0 text-right font-[family-name:var(--font-mono)] text-[11px] text-[var(--color-ink4)]">
                        {r.vencimento ? dateBR(r.vencimento) : "—"}
                      </span>
                    </li>
                  ))}
                </ul>
              )}
            </div>

            {resultados.length > 0 && (
              <div className="border-t border-[var(--color-accent2)]/12 px-4 py-2 text-[11px] text-[var(--color-ink3)]">
                {resultados.length} resultado(s) · total {brl0(total)}
              </div>
            )}
          </div>
        </div>
      )}
    </>
  );
}
```

### `src/components/app/contas-receber-manager.tsx`

```tsx
"use client";

import { useMemo, useState } from "react";
import {
  createContaReceber,
  updateContaReceber,
  cancelarContaReceber,
} from "@/lib/actions/contas-receber";

/** Tipos de receita (definido no client — não pode vir de módulo "use server"). */
const TIPOS_RECEITA = ["Sinal", "Parcela mensal", "Outros", "Outras Receitas"] as const;
import type { ContaReceberRow } from "@/lib/queries";
import { brl0, dateBR } from "@/lib/utils";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input, Label, Select } from "@/components/ui/input";
import { MoneyInput } from "@/components/ui/money-input";
import { DateField } from "@/components/ui/date-field";
import { Badge } from "@/components/ui/badge";
import { Table, THead, TH, TR, TD } from "@/components/ui/table";
import { SortTH, useOrdenacaoTabela } from "@/components/app/sortable-th";
import type { ColunaOrdenavel } from "@/lib/tabela-ordenacao";

interface Opt {
  id: string;
  nome: string;
}
export interface UnitReceb {
  unitCode: string;
  projectName: string;
  clienteNome: string | null;
  descricao: string;
  dia: string;
  valor: number;
}

const statusTone = (s: string) =>
  s === "Recebido"
    ? "success"
    : s === "Parcialmente recebido"
      ? "warning"
      : s === "Cancelada"
        ? "neutral"
        : "warning";

/** Formulário de criação (client por causa do campo condicional "Outras Receitas"). */
function NovaConta({
  projetos,
  clientes,
  bancos,
  unidades,
}: {
  projetos: Opt[];
  clientes: Opt[];
  bancos: Opt[];
  unidades: string[];
}) {
  const [tipo, setTipo] = useState<string>("Sinal");
  const [valor, setValor] = useState("");
  return (
    <Card className="mb-5">
      <CardContent className="p-5">
        <h3 className="mb-3 text-sm font-semibold text-[var(--color-ink)]">Nova conta a receber</h3>
        <form action={createContaReceber} className="grid grid-cols-1 gap-3 sm:grid-cols-4">
          <div>
            <Label>Projeto *</Label>
            <Select name="projectId" defaultValue={projetos[0]?.id ?? ""} required>
              {projetos.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.nome}
                </option>
              ))}
            </Select>
          </div>
          <div>
            <Label>Tipo *</Label>
            <Select name="tipo" value={tipo} onChange={(e) => setTipo(e.target.value)}>
              {TIPOS_RECEITA.map((t) => (
                <option key={t} value={t}>
                  {t}
                </option>
              ))}
            </Select>
          </div>
          <div>
            <Label>Valor</Label>
            <MoneyInput name="valor" value={valor} onChange={setValor} />
          </div>
          <div>
            <Label>Vencimento</Label>
            <DateField name="vencimento" />
          </div>
          {tipo === "Outras Receitas" && (
            <div className="sm:col-span-4">
              <Label>Descrição (obrigatória para Outras Receitas) *</Label>
              <Input name="descricao" required placeholder="Origem/natureza da receita" />
            </div>
          )}
          {tipo !== "Outras Receitas" && (
            <div className="sm:col-span-2">
              <Label>Descrição</Label>
              <Input name="descricao" placeholder="Opcional" />
            </div>
          )}
          <div>
            <Label>Unidade (opcional)</Label>
            <Select name="unitCode" defaultValue="">
              <option value="">—</option>
              {unidades.map((u) => (
                <option key={u} value={u}>
                  {u}
                </option>
              ))}
            </Select>
          </div>
          <div>
            <Label>Cliente (opcional)</Label>
            <Select name="clienteId" defaultValue="">
              <option value="">—</option>
              {clientes.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.nome}
                </option>
              ))}
            </Select>
          </div>
          <div>
            <Label>Banco (opcional)</Label>
            <Select name="bancoId" defaultValue="">
              <option value="">—</option>
              {bancos.map((b) => (
                <option key={b.id} value={b.id}>
                  {b.nome}
                </option>
              ))}
            </Select>
          </div>
          <div className="flex items-end">
            <Button type="submit" className="w-full">
              Adicionar
            </Button>
          </div>
        </form>
      </CardContent>
    </Card>
  );
}

/** Linha editável de uma conta a receber. */
function ContaRow({
  c,
  projetos,
  canEditar,
  canExcluir,
}: {
  c: ContaReceberRow;
  projetos: Opt[];
  canEditar: boolean;
  canExcluir: boolean;
}) {
  const [edit, setEdit] = useState(false);
  const [tipo, setTipo] = useState(c.tipo);
  const [valor, setValor] = useState(String(c.valor));
  const [recebido, setRecebido] = useState(String(c.valorRecebido));
  if (edit) {
    return (
      <TR>
        <TD colSpan={7}>
          <form action={updateContaReceber} className="grid grid-cols-2 gap-2 py-2 sm:grid-cols-4">
            <input type="hidden" name="id" value={c.id} />
            <div>
              <Label>Projeto</Label>
              <Select name="projectId" defaultValue={c.projectId}>
                {projetos.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.nome}
                  </option>
                ))}
              </Select>
            </div>
            <div>
              <Label>Tipo</Label>
              <Select name="tipo" value={tipo} onChange={(e) => setTipo(e.target.value)}>
                {TIPOS_RECEITA.map((t) => (
                  <option key={t} value={t}>
                    {t}
                  </option>
                ))}
              </Select>
            </div>
            <div>
              <Label>Valor</Label>
              <MoneyInput name="valor" value={valor} onChange={setValor} />
            </div>
            <div>
              <Label>Vencimento</Label>
              <DateField name="vencimento" defaultValue={c.vencimento ?? ""} />
            </div>
            <div className={tipo === "Outras Receitas" ? "sm:col-span-4" : "sm:col-span-2"}>
              <Label>Descrição{tipo === "Outras Receitas" ? " *" : ""}</Label>
              <Input name="descricao" defaultValue={c.descricao ?? ""} required={tipo === "Outras Receitas"} />
            </div>
            <div>
              <Label>Status</Label>
              <Select name="status" defaultValue={c.status}>
                <option>A receber</option>
                <option>Parcialmente recebido</option>
                <option>Recebido</option>
              </Select>
            </div>
            <div>
              <Label>Valor recebido</Label>
              <MoneyInput name="valorRecebido" value={recebido} onChange={setRecebido} />
            </div>
            <div>
              <Label>Data recebimento</Label>
              <DateField name="dataRecebimento" defaultValue={c.dataRecebimento ?? ""} />
            </div>
            <input type="hidden" name="unitCode" value={c.unitCode ?? ""} />
            <input type="hidden" name="clienteId" value={c.clienteId ?? ""} />
            <input type="hidden" name="bancoId" value={c.bancoId ?? ""} />
            <div className="flex items-end gap-2 sm:col-span-4">
              <Button type="submit" size="sm">
                Salvar
              </Button>
              <Button type="button" size="sm" variant="ghost" onClick={() => setEdit(false)}>
                Cancelar
              </Button>
            </div>
          </form>
        </TD>
      </TR>
    );
  }
  return (
    <TR>
      <TD className="whitespace-nowrap">{c.projectName}</TD>
      <TD>{c.tipo}</TD>
      <TD className="max-w-[220px] truncate">{c.descricao ?? c.unitCode ?? "—"}</TD>
      <TD className="text-right font-[family-name:var(--font-mono)]">{brl0(c.valor)}</TD>
      <TD className="font-[family-name:var(--font-mono)] text-[var(--color-ink2)]">
        {c.vencimento ? dateBR(c.vencimento) : "—"}
      </TD>
      <TD>
        <Badge tone={statusTone(c.status)}>{c.status}</Badge>
      </TD>
      <TD className="text-right">
        <div className="flex items-center justify-end gap-3">
          {canEditar && (
            <button className="text-sm text-[var(--color-accent2)] hover:underline" onClick={() => setEdit(true)}>
              Editar
            </button>
          )}
          {canExcluir && (
            <form action={cancelarContaReceber}>
              <input type="hidden" name="id" value={c.id} />
              <button type="submit" className="text-sm text-[var(--color-danger)] hover:underline">
                Cancelar
              </button>
            </form>
          )}
        </div>
      </TD>
    </TR>
  );
}

export function ContasReceberManager({
  projetos,
  clientes,
  bancos,
  unidades,
  contas,
  unitReceb,
  canCriar,
  canEditar,
  canExcluir,
}: {
  projetos: Opt[];
  clientes: Opt[];
  bancos: Opt[];
  unidades: string[];
  contas: ContaReceberRow[];
  unitReceb: UnitReceb[];
  canCriar: boolean;
  canEditar: boolean;
  canExcluir: boolean;
}) {
  const totalManual = contas.reduce((a, c) => a + c.valor, 0);
  const totalVendas = unitReceb.reduce((a, r) => a + r.valor, 0);

  // §5 — ordenação estilo planilha nas DUAS listagens desta tela. Sem clique de
  // cabeçalho, cada tabela mantém a ordem que já vinha do servidor.
  const colContas = useMemo<ColunaOrdenavel<ContaReceberRow>[]>(
    () => [
      { key: "projeto", tipo: "texto", get: (c) => c.projectName },
      { key: "tipo", tipo: "texto", get: (c) => c.tipo },
      { key: "descricao", tipo: "texto", get: (c) => c.descricao ?? c.unitCode },
      { key: "valor", tipo: "valor", get: (c) => c.valor },
      { key: "vencimento", tipo: "data", get: (c) => c.vencimento },
      { key: "status", tipo: "texto", get: (c) => c.status },
    ],
    [],
  );
  const contasOrd = useOrdenacaoTabela(contas, colContas, (c) => c.id);

  const colReceb = useMemo<ColunaOrdenavel<UnitReceb>[]>(
    () => [
      { key: "unidade", tipo: "texto", get: (r) => r.unitCode },
      { key: "projeto", tipo: "texto", get: (r) => r.projectName },
      { key: "cliente", tipo: "texto", get: (r) => r.clienteNome },
      { key: "descricao", tipo: "texto", get: (r) => r.descricao },
      { key: "previsto", tipo: "data", get: (r) => r.dia },
      { key: "valor", tipo: "valor", get: (r) => r.valor },
    ],
    [],
  );
  // Recebíveis não têm ID próprio (são derivados do plano de pagamento); a
  // chave estável é unidade + data + valor, suficiente para desempate fixo.
  const recebOrd = useOrdenacaoTabela(
    unitReceb,
    colReceb,
    (r) => `${r.unitCode}|${r.dia}|${r.valor}|${r.descricao}`,
  );

  return (
    <div>
      {canCriar && <NovaConta projetos={projetos} clientes={clientes} bancos={bancos} unidades={unidades} />}

      <div className="mb-2 flex flex-wrap items-center gap-3 text-[13px]">
        <Badge tone="neutral">{contas.length} lançadas</Badge>
        <span className="text-[var(--color-ink3)]">
          Total lançado{" "}
          <strong className="font-[family-name:var(--font-mono)] text-[var(--color-ink)]">{brl0(totalManual)}</strong>
        </span>
      </div>
      <Card className="mb-8">
        <CardContent className="p-0">
          <Table wrapperClassName="scroll-x-always" className="min-w-[900px]">
              <THead>
                <tr>
                  <SortTH coluna="projeto" estado={contasOrd.estado} onSort={contasOrd.onSort}>Projeto</SortTH>
                  <SortTH coluna="tipo" estado={contasOrd.estado} onSort={contasOrd.onSort}>Tipo</SortTH>
                  <SortTH coluna="descricao" estado={contasOrd.estado} onSort={contasOrd.onSort}>Descrição</SortTH>
                  <SortTH coluna="valor" estado={contasOrd.estado} onSort={contasOrd.onSort} className="text-right">Valor</SortTH>
                  <SortTH coluna="vencimento" estado={contasOrd.estado} onSort={contasOrd.onSort}>Vencimento</SortTH>
                  <SortTH coluna="status" estado={contasOrd.estado} onSort={contasOrd.onSort}>Status</SortTH>
                  <TH className="text-right">Ações</TH>
                </tr>
              </THead>
              <tbody>
                {contasOrd.rows.map((c) => (
                  <ContaRow key={c.id} c={c} projetos={projetos} canEditar={canEditar} canExcluir={canExcluir} />
                ))}
                {contasOrd.rows.length === 0 && (
                  <TR>
                    <TD colSpan={7} className="py-8 text-center text-[var(--color-ink4)]">
                      Nenhuma conta a receber lançada. Recebíveis das vendas aparecem abaixo.
                    </TD>
                  </TR>
                )}
              </tbody>
            </Table>
        </CardContent>
      </Card>

      {/* Recebíveis originados em Unidades / Vendas (derivados do plano de pagamento). */}
      <h2 className="mb-2 font-[family-name:var(--font-mono)] text-[11px] uppercase tracking-wide text-[var(--color-ink3)]">
        Recebíveis das vendas (Unidades) · {brl0(totalVendas)}
      </h2>
      <Card>
        <CardContent className="p-0">
          <Table wrapperClassName="max-h-[420px] scroll-x-always" className="min-w-[900px]">
              <THead>
                <tr>
                  <SortTH coluna="unidade" estado={recebOrd.estado} onSort={recebOrd.onSort}>Unidade</SortTH>
                  <SortTH coluna="projeto" estado={recebOrd.estado} onSort={recebOrd.onSort}>Projeto</SortTH>
                  <SortTH coluna="cliente" estado={recebOrd.estado} onSort={recebOrd.onSort}>Cliente</SortTH>
                  <SortTH coluna="descricao" estado={recebOrd.estado} onSort={recebOrd.onSort}>Descrição</SortTH>
                  <SortTH coluna="previsto" estado={recebOrd.estado} onSort={recebOrd.onSort}>Previsto</SortTH>
                  <SortTH coluna="valor" estado={recebOrd.estado} onSort={recebOrd.onSort} className="text-right">Valor</SortTH>
                </tr>
              </THead>
              <tbody>
                {recebOrd.rows.map((r, i) => (
                  <TR key={i}>
                    <TD className="font-medium">{r.unitCode}</TD>
                    <TD className="whitespace-nowrap">{r.projectName}</TD>
                    <TD className="text-[var(--color-ink3)]">{r.clienteNome ?? "—"}</TD>
                    <TD>{r.descricao}</TD>
                    <TD className="font-[family-name:var(--font-mono)] text-[var(--color-ink2)]">
                      {r.dia ? dateBR(r.dia) : "—"}
                    </TD>
                    <TD className="text-right font-[family-name:var(--font-mono)] text-[var(--color-success)]">
                      {brl0(r.valor)}
                    </TD>
                  </TR>
                ))}
                {recebOrd.rows.length === 0 && (
                  <TR>
                    <TD colSpan={6} className="py-6 text-center text-[var(--color-ink4)]">
                      Sem recebíveis de vendas (unidades vendidas geram recebíveis pelo plano de pagamento).
                    </TD>
                  </TR>
                )}
              </tbody>
            </Table>
        </CardContent>
      </Card>
    </div>
  );
}
```

### `src/components/app/sortable-th.tsx`

Importado por `contas-receber-manager.tsx`.

```tsx
"use client";

import { useMemo, useState } from "react";
import { TH } from "@/components/ui/table";
import {
  ordenarTabela,
  proximoEstado,
  setaOrdenacao,
  type ColunaOrdenavel,
  type EstadoOrdenacao,
} from "@/lib/tabela-ordenacao";

/**
 * Cabeçalho de coluna clicável (ordenação estilo planilha) — §5.
 *
 * COMPARTILHADO APENAS entre **Contas a Pagar** e **Contas a Receber**. A tela
 * de Despesas/Lançamentos mantém a ordenação por momento de lançamento e não
 * usa este componente.
 */
export function SortTH({
  coluna,
  estado,
  onSort,
  className,
  children,
}: {
  coluna: string;
  estado: EstadoOrdenacao | null;
  onSort: (coluna: string) => void;
  className?: string;
  children: React.ReactNode;
}) {
  const seta = setaOrdenacao(estado, coluna);
  const ativo = seta !== "";
  return (
    <TH className={className}>
      <button
        type="button"
        onClick={() => onSort(coluna)}
        // aria-sort no <th> seria o ideal, mas o indicador textual já é lido:
        // o title explica o próximo clique para quem usa mouse.
        title={
          !ativo
            ? "Ordenar (crescente)"
            : seta === "▲"
              ? "Ordenar (decrescente)"
              : "Remover ordenação"
        }
        className={`group inline-flex w-full items-center gap-1 uppercase tracking-wide transition-colors ${
          className?.includes("text-right") ? "justify-end" : "justify-start"
        } ${ativo ? "text-[var(--color-accent2)]" : "hover:text-[var(--color-ink)]"}`}
      >
        <span>{children}</span>
        <span
          aria-hidden
          className={`text-[9px] leading-none ${
            ativo ? "opacity-100" : "opacity-0 group-hover:opacity-40"
          }`}
        >
          {seta || "▲"}
        </span>
      </button>
    </TH>
  );
}

/**
 * Estado + aplicação da ordenação para uma tabela.
 *
 * `rowsPadrao` já vem filtrada e na ordem padrão da tela; enquanto não houver
 * clique de cabeçalho, ela é devolvida intacta. Trocar filtros NÃO limpa a
 * ordenação escolhida — ela é reaplicada ao novo conjunto filtrado inteiro
 * (inclusive fora da página visível), conforme §5.
 */
export function useOrdenacaoTabela<T>(
  rowsPadrao: readonly T[],
  colunas: readonly ColunaOrdenavel<T>[],
  id: (row: T) => string,
) {
  const [estado, setEstado] = useState<EstadoOrdenacao | null>(null);
  const onSort = (coluna: string) => setEstado((e) => proximoEstado(e, coluna));
  const rows = useMemo(
    () => ordenarTabela(rowsPadrao, colunas, estado, id),
    // `id` é uma função pura do chamador (identidade irrelevante para o
    // resultado); as demais dependências são as que de fato mudam a ordem.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [rowsPadrao, colunas, estado],
  );
  return { rows, estado, onSort };
}
```

---

## 3. Funções de `src/lib/queries.ts`

Excluídas conforme pedido: `getReceivables` e `getUnitCodesByTenant`, já em
`docs/TELA-unidades.md`. Restam três, mais o tipo `ContaReceberRow`, que a
página tipa a partir de `getContasReceber`.

| Item | Linhas | Observação |
|---|---|---|
| `ContaReceberRow` | 1783–1800 | tipo de retorno de `getContasReceber` |
| `getContasReceber` | 1802–1838 | — |
| `getClientes` | 1082–1088 | também em `TELA-projeto.md` |
| `getBankAccounts` | 219–227 | também em `CODIGO-BLOCO-4.md` |

### `src/lib/queries.ts` · linhas 1783–1800

Tipo `ContaReceberRow`.

```ts
export interface ContaReceberRow {
  id: string;
  projectId: string;
  projectName: string;
  unitCode: string | null;
  clienteId: string | null;
  clienteNome: string | null;
  descricao: string | null;
  tipo: string;
  valor: number;
  vencimento: string | null;
  dataRecebimento: string | null;
  valorRecebido: number;
  status: string;
  bancoId: string | null;
  origemCashEntryId: string | null;
  createdAt: string | null;
}
```

### `src/lib/queries.ts` · linhas 1802–1838

`getContasReceber`.

```ts
/** Contas a receber criadas manualmente / convertidas do extrato (não canceladas). */
export async function getContasReceber(tenantId: string): Promise<ContaReceberRow[]> {
  const rows = await db
    .select({
      c: schema.contasReceber,
      projectName: schema.projects.name,
      clienteNome: schema.clientes.nomeCompleto,
    })
    .from(schema.contasReceber)
    .innerJoin(schema.projects, eq(schema.contasReceber.projectId, schema.projects.id))
    .leftJoin(schema.clientes, eq(schema.contasReceber.clienteId, schema.clientes.id))
    .where(
      and(
        eq(schema.contasReceber.tenantId, tenantId),
        eq(schema.contasReceber.cancelado, false),
      ),
    )
    .orderBy(asc(schema.contasReceber.vencimento));
  return rows.map((r) => ({
    id: r.c.id,
    projectId: r.c.projectId,
    projectName: r.projectName,
    unitCode: r.c.unitCode,
    clienteId: r.c.clienteId,
    clienteNome: r.clienteNome,
    descricao: r.c.descricao,
    tipo: r.c.tipo,
    valor: Number(r.c.valor),
    vencimento: r.c.vencimento,
    dataRecebimento: r.c.dataRecebimento,
    valorRecebido: Number(r.c.valorRecebido),
    status: r.c.status,
    bancoId: r.c.bancoId,
    origemCashEntryId: r.c.origemCashEntryId,
    createdAt: r.c.createdAt ? new Date(r.c.createdAt).toISOString() : null,
  }));
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

---

## 4. Server Actions disparadas pela tela

As três actions exportadas por `src/lib/actions/contas-receber.ts` são todas
disparadas por `contas-receber-manager.tsx`. O arquivo vai inteiro — e é a
prova de que a baixa ainda não existe em `main`: não há nenhuma função de
baixa, estorno ou confirmação de recebimento nele.

### `src/lib/actions/contas-receber.ts`

```ts
"use server";

import { and, eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { db, schema } from "@/lib/db";
import { getActiveContext } from "@/lib/context";
import { can } from "@/lib/permissions";
import { logAudit } from "@/lib/audit";

/** Valor monetário BR/US em texto → string numérica ("1.000,50"→"1000.5"). */
function normValor(v: string | null | undefined): string {
  const s = (v ?? "").trim();
  if (!s) return "0";
  let t = s.replace(/[R$\s]/g, "");
  t = /,\d{1,2}$/.test(t) ? t.replace(/\./g, "").replace(",", ".") : t.replace(/,/g, "");
  const n = Number(t);
  return Number.isFinite(n) ? String(n) : "0";
}
const clean = (v: string | null | undefined) => {
  const s = (v ?? "").trim();
  return s ? s : null;
};

/**
 * Cria uma conta a receber. Exige vínculo com um projeto. Se o tipo for
 * "Outras Receitas", exige uma descrição que identifique a origem/natureza.
 * Pode nascer vinculada a um item do extrato (origemCashEntryId — item 6).
 */
export async function createContaReceber(formData: FormData) {
  const ctx = await getActiveContext();
  if (!ctx || !can(ctx.perms, "contasreceber", "criar")) {
    throw new Error("Sem permissão para criar contas a receber.");
  }
  const projectId = (formData.get("projectId") as string) || "";
  if (!projectId || !ctx.projects.some((p) => p.id === projectId)) {
    throw new Error("Selecione um projeto para a conta a receber.");
  }
  const tipo = (formData.get("tipo") as string) || "Outros";
  const descricao = clean(formData.get("descricao") as string);
  if (tipo === "Outras Receitas" && !descricao) {
    throw new Error('Para "Outras Receitas", informe uma descrição da origem/natureza da receita.');
  }
  // Trava contra receita de valor ZERO (receita fantasma nos relatórios).
  const valorCR = Number(normValor(formData.get("valor") as string));
  if (!Number.isFinite(valorCR) || valorCR === 0) {
    throw new Error("Informe um valor maior que zero para a conta a receber.");
  }
  const [row] = await db
    .insert(schema.contasReceber)
    .values({
      tenantId: ctx.tenant.id,
      projectId,
      unitCode: clean(formData.get("unitCode") as string),
      clienteId: clean(formData.get("clienteId") as string),
      descricao,
      tipo,
      valor: normValor(formData.get("valor") as string),
      vencimento: clean(formData.get("vencimento") as string),
      status: "A receber",
      bancoId: clean(formData.get("bancoId") as string),
      origemCashEntryId: clean(formData.get("origemCashEntryId") as string),
      createdBy: ctx.userEmail || ctx.userId || null,
    })
    .returning();
  await logAudit({
    tenantId: ctx.tenant.id,
    userId: ctx.userId,
    action: "contaReceber.create",
    entity: "conta_receber",
    entityId: row.id,
    meta: { projectId, tipo, valor: row.valor },
  });
  revalidatePath("/contasreceber");
}

/** Atualiza uma conta a receber (consulta/edição — item 5). */
export async function updateContaReceber(formData: FormData) {
  const ctx = await getActiveContext();
  if (!ctx || !can(ctx.perms, "contasreceber", "editar")) {
    throw new Error("Sem permissão para editar contas a receber.");
  }
  const id = (formData.get("id") as string) || "";
  if (!id) return;
  const tipo = (formData.get("tipo") as string) || "Outros";
  const descricao = clean(formData.get("descricao") as string);
  if (tipo === "Outras Receitas" && !descricao) {
    throw new Error('Para "Outras Receitas", informe uma descrição da origem/natureza da receita.');
  }
  const projectId = (formData.get("projectId") as string) || "";
  if (projectId && !ctx.projects.some((p) => p.id === projectId)) {
    throw new Error("Projeto inválido.");
  }
  const set: Partial<typeof schema.contasReceber.$inferInsert> = {
    tipo,
    descricao,
    valor: normValor(formData.get("valor") as string),
    vencimento: clean(formData.get("vencimento") as string),
    unitCode: clean(formData.get("unitCode") as string),
    clienteId: clean(formData.get("clienteId") as string),
    bancoId: clean(formData.get("bancoId") as string),
    dataRecebimento: clean(formData.get("dataRecebimento") as string),
    valorRecebido: normValor(formData.get("valorRecebido") as string),
    status: (formData.get("status") as string) || "A receber",
  };
  if (projectId) set.projectId = projectId;
  await db
    .update(schema.contasReceber)
    .set(set)
    .where(and(eq(schema.contasReceber.id, id), eq(schema.contasReceber.tenantId, ctx.tenant.id)));
  await logAudit({
    tenantId: ctx.tenant.id,
    userId: ctx.userId,
    action: "contaReceber.update",
    entity: "conta_receber",
    entityId: id,
    meta: { changes: set },
  });
  revalidatePath("/contasreceber");
}

/** Cancelamento lógico (preserva histórico e a rastreabilidade). */
export async function cancelarContaReceber(formData: FormData) {
  const ctx = await getActiveContext();
  if (!ctx || !can(ctx.perms, "contasreceber", "excluir")) {
    throw new Error("Sem permissão.");
  }
  const id = (formData.get("id") as string) || "";
  if (!id) return;
  await db
    .update(schema.contasReceber)
    .set({ cancelado: true, status: "Cancelada" })
    .where(and(eq(schema.contasReceber.id, id), eq(schema.contasReceber.tenantId, ctx.tenant.id)));
  await logAudit({
    tenantId: ctx.tenant.id,
    userId: ctx.userId,
    action: "contaReceber.cancel",
    entity: "conta_receber",
    entityId: id,
  });
  revalidatePath("/contasreceber");
}
```

---

## 5. Tabela `conta_receber` no schema

**A tabela não usa nenhum `pgEnum`.** As colunas que poderiam ser enum são
`text` com default: `tipo` (`text`, default `"Outros"`) e `status` (`text`,
default `"A receber"`). Os valores previstos aparecem só no comentário do
schema — `A receber | Recebido | Parcialmente recebido | Cancelado` — e nos
`<option>` do formulário, não no banco.

### `src/lib/db/schema.ts` · linhas 1237–1274

```ts
/**
 * Conta a Receber (recebível) criada manualmente ou a partir do extrato. Os
 * recebíveis das unidades vendidas continuam sendo derivados do plano de
 * pagamento (não duplicados aqui); esta tabela guarda os recebíveis lançados à
 * mão e as receitas convertidas de itens do extrato. Vinculada a um projeto.
 */
export const contasReceber = pgTable("conta_receber", {
  id: uuid("id").primaryKey().defaultRandom(),
  tenantId: uuid("tenant_id")
    .notNull()
    .references(() => tenants.id, { onDelete: "cascade" }),
  projectId: uuid("project_id")
    .notNull()
    .references(() => projects.id, { onDelete: "cascade" }),
  /** unidade/venda de origem (opcional). */
  unitCode: text("unit_code"),
  clienteId: uuid("cliente_id").references((): AnyPgColumn => clientes.id, {
    onDelete: "set null",
  }),
  descricao: text("descricao"),
  /** Sinal | Parcela mensal | Outros | Outras Receitas. */
  tipo: text("tipo").notNull().default("Outros"),
  valor: numeric("valor", { precision: 15, scale: 2 }).notNull().default("0"),
  /** data prevista "MM/DD/YYYY". */
  vencimento: text("vencimento"),
  dataRecebimento: text("data_recebimento"),
  valorRecebido: numeric("valor_recebido", { precision: 15, scale: 2 }).notNull().default("0"),
  /** A receber | Recebido | Parcialmente recebido | Cancelado. */
  status: text("status").notNull().default("A receber"),
  bancoId: uuid("banco_id").references(() => bankAccounts.id, { onDelete: "set null" }),
  /** rastreabilidade: item do extrato que originou/conciliou esta conta. */
  origemCashEntryId: uuid("origem_cash_entry_id").references(() => cashEntries.id, {
    onDelete: "set null",
  }),
  cancelado: boolean("cancelado").notNull().default(false),
  createdBy: text("created_by"),
  createdAt: timestamp("created_at", { mode: "date" }).notNull().defaultNow(),
});
```

---

## 6. `expandUnitReceivables`

Vive em `src/lib/calc/receivables.ts`, arquivo de 78 linhas do qual a função
ocupa da 12 à 77. Como o resto são apenas os imports e o tipo `Receivable`
que ela devolve, o arquivo vai inteiro.

### `src/lib/calc/receivables.ts`

```ts
import { parseDate } from "./projection";
import { serieVencimentos } from "./carencia";
import type { PaymentPlan, UnitStatus } from "./types";

export interface Receivable {
  /** data prevista, "MM/DD/YYYY". */
  dia: string;
  valor: number;
  label: string;
}

/**
 * Expande o plano de pagamento de uma unidade vendida em recebíveis datados
 * (uma linha por vencimento). Base do painel "Receitas a Receber do Dia".
 * Só gera recebíveis para unidades com status "Vendido".
 */
export function expandUnitReceivables(
  plan: PaymentPlan | null | undefined,
  status: UnitStatus,
): Receivable[] {
  if (status !== "Vendido" || !plan) return [];
  const out: Receivable[] = [];
  const fmt = (mo: number, d: number, yr: number) =>
    `${String(mo).padStart(2, "0")}/${String(d).padStart(2, "0")}/${yr}`;

  // Planos antigos/parciais podem não conter todas as seções — leia de forma
  // tolerante (seção ausente = campos vazios/zero) para nunca quebrar o cálculo.
  const p = plan as unknown as Record<string, unknown>;
  const sec = (k: string) => (p[k] ?? {}) as Record<string, unknown>;
  const str = (v: unknown) => (typeof v === "string" ? v : "");
  const num = (v: unknown) => Number(v) || 0;

  const periodic: { venc: string; val: number; n: number; label: string; step: number }[] = [
    { venc: str(sec("AS").venc), val: num(sec("AS").val), n: num(sec("AS").n), label: "Ato", step: 1 },
    { venc: str(sec("S1").venc), val: num(sec("S1").val), n: num(sec("S1").n), label: "Sinal 1", step: 1 },
    { venc: str(sec("S2").venc), val: num(sec("S2").val), n: num(sec("S2").n), label: "Sinal 2", step: 1 },
    { venc: str(sec("S3").venc), val: num(sec("S3").val), n: num(sec("S3").n), label: "Sinal 3", step: 1 },
    { venc: str(sec("Mensais").venc), val: num(sec("Mensais").val), n: num(sec("Mensais").n), label: "Mensal", step: 1 },
    { venc: str(sec("Semestrais").venc), val: num(sec("Semestrais").val), n: num(sec("Semestrais").n), label: "Semestral", step: 6 },
    { venc: str(sec("Anuais").venc), val: num(sec("Anuais").val), n: num(sec("Anuais").n), label: "Anual", step: 12 },
  ];
  for (const s of periodic) {
    const d = parseDate(s.venc);
    const val = Number(s.val) || 0;
    const n = Math.max(1, Number(s.n) || 1);
    if (!d || val <= 0) continue;
    // Item 6.2 / 2.4 — o dia de vencimento é ENCOLHIDO para o último dia do mês
    // quando o mês de destino não o tem. Antes a data era montada com o dia
    // ORIGINAL no mês deslocado, produzindo strings como "04/31/2026" — data
    // que não existe no calendário e que nenhuma tela conseguia interpretar.
    //
    // O dia desejado é sempre o da data-base: encolher em fevereiro NÃO
    // contamina março (31/01 → 28/02 → 31/03, e não 28/03).
    const datas = serieVencimentos(s.venc, n, s.step);
    for (let i = 0; i < n; i++) {
      out.push({
        dia: datas[i] ?? fmt(d.mo, d.d, d.yr),
        valor: val,
        label: n > 1 ? `${s.label} #${i + 1}` : s.label,
      });
    }
  }

  const singles: { venc: string; val: number; label: string }[] = [
    { venc: str(sec("FGTS").dataPrev), val: num(sec("FGTS").val), label: "FGTS" },
    { venc: str(sec("Subsidio").dataPrev), val: num(sec("Subsidio").val), label: "Subsídio" },
    { venc: str(sec("Permuta").dataPrev), val: num(sec("Permuta").val), label: "Permuta" },
    { venc: str(sec("Banco").dataPrimParc), val: num(sec("Banco").valFinanc), label: "Financiamento" },
  ];
  for (const s of singles) {
    const d = parseDate(s.venc);
    const val = Number(s.val) || 0;
    if (!d || val <= 0) continue;
    out.push({ dia: fmt(d.mo, d.d, d.yr), valor: val, label: s.label });
  }
  return out;
}
```

