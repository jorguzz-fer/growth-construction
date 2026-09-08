# PERMISSÕES — código e matriz de papéis

Coleta do controle de acesso do Growth Construction, em `main`
(commit `45f4ce3`). Sem resumo, sem análise.

O modelo tem duas camadas: um **papel** (`membership.role`) define a matriz
padrão, e um **override por membro** (`membership.permissions`, JSONB) pode
sobrescrever tela a tela. `effectivePermissions(role, overrides)` combina as
duas; `can(perms, tela, ação)` é o teste feito em cada página e Server Action.

**Árvore das três telas:**

```
contabilidade/page.tsx
└── components/app/page-header.tsx      (já entregue em coletas anteriores)

acessos/page.tsx
├── components/app/page-header.tsx      (já entregue)
└── components/app/access-matrix.tsx    ← novo

usuarios/page.tsx
├── components/app/page-header.tsx      (já entregue)
├── components/app/member-actions.tsx   ← novo
└── components/app/role-select.tsx      ← novo
```

`page-header.tsx` está em `TELA-projeto.md`, `TELA-budget.md` e outras; foi
omitido aqui para não repetir. Ficam de fora os primitivos de
`components/ui/` e `@/lib/context`, `@/lib/db`, `@/lib/audit`.

---

## 1. `src/lib/permissions.ts`

### `src/lib/permissions.ts`

```ts
import type { Role } from "@/lib/context";

/**
 * Permissões GRANULARES por tela × ação (Ver / Criar / Editar / Excluir),
 * portado do protótipo v0.4 (Gestão de Acessos). Cada membership tem um `role`
 * (perfil) que define permissões padrão; um admin pode sobrescrever por membro
 * via `membership.permissions` (matriz completa).
 */

export type PermAction = "ver" | "criar" | "editar" | "excluir";
export interface ScreenPerm {
  ver: boolean;
  criar: boolean;
  editar: boolean;
  excluir: boolean;
}
export type PermMatrix = Record<string, ScreenPerm>;

export type Modulo =
  | "Planejamento"
  | "Receitas"
  | "Despesas"
  | "Conciliação de Caixa"
  | "Reports"
  | "Backup"
  | "Config";

export interface Screen {
  id: string; // = primeiro segmento da rota (ex.: "unidades")
  label: string;
  modulo: Modulo;
}

/** Todas as telas governadas (rota → tela). `perfil` é pessoal e não entra aqui. */
export const SCREENS: Screen[] = [
  { id: "dashboard", label: "Dashboard", modulo: "Reports" },
  { id: "projecao", label: "Projeção de Receitas", modulo: "Reports" },
  { id: "consolidado", label: "Consolidado", modulo: "Reports" },
  { id: "caixa", label: "Controle de Caixa", modulo: "Conciliação de Caixa" },
  { id: "fechamento", label: "Fechamento de Caixa", modulo: "Conciliação de Caixa" },
  { id: "balancodia", label: "Balanço do Dia", modulo: "Reports" },
  { id: "dre", label: "DRE", modulo: "Reports" },
  { id: "fluxocaixa", label: "Fluxo de Caixa", modulo: "Reports" },
  { id: "medicao", label: "Medição de Obra", modulo: "Reports" },
  { id: "resumo", label: "Resumo Executivo", modulo: "Reports" },
  { id: "unidades", label: "Unidades / Dados de Venda", modulo: "Receitas" },
  { id: "budget", label: "Lançamento Budget", modulo: "Planejamento" },
  { id: "forecast", label: "Lançamento Forecast", modulo: "Planejamento" },
  { id: "clientes", label: "Clientes (Compradores)", modulo: "Receitas" },
  { id: "contasreceber", label: "Contas a Receber", modulo: "Receitas" },
  { id: "medicaolanc", label: "Lançamento de Medição", modulo: "Despesas" },
  { id: "simulador", label: "Simulador", modulo: "Receitas" },
  { id: "reembolso", label: "Reembolso", modulo: "Receitas" },
  { id: "permuta", label: "Inventário de Permuta", modulo: "Receitas" },
  { id: "parametros", label: "Parâmetros / INCC", modulo: "Receitas" },
  { id: "despesas", label: "Lançamentos de Despesas", modulo: "Despesas" },
  { id: "contaspagar", label: "Contas a Pagar", modulo: "Despesas" },
  { id: "restituicoes", label: "Restituições (pago por terceiro)", modulo: "Despesas" },
  { id: "fornecedores", label: "Fornecedores & Stakeholders", modulo: "Despesas" },
  { id: "planocontas", label: "Plano de Contas", modulo: "Planejamento" },
  { id: "contas", label: "Contas Correntes", modulo: "Despesas" },
  { id: "estoque", label: "Controle de Estoques", modulo: "Despesas" },
  { id: "ponto", label: "Controle de Ponto", modulo: "Despesas" },
  { id: "backup", label: "Backup & Arquivamento", modulo: "Backup" },
  { id: "usuarios", label: "Usuários & Acessos", modulo: "Config" },
  { id: "acessos", label: "Gestão de Acessos", modulo: "Config" },
  { id: "acoes", label: "Log de Auditoria", modulo: "Config" },
  { id: "contabilidade", label: "Acesso Contabilidade", modulo: "Config" },
  { id: "empresa", label: "Empresa", modulo: "Config" },
  { id: "projeto", label: "Projetos", modulo: "Config" },
  { id: "numeracao", label: "Numeração de Despesas", modulo: "Config" },
  { id: "versao", label: "Configuração da Versão", modulo: "Config" },
  { id: "diagnosticoia", label: "Diagnóstico de IA", modulo: "Config" },
];

export const SCREEN_IDS = SCREENS.map((s) => s.id);

const NONE: ScreenPerm = { ver: false, criar: false, editar: false, excluir: false };
const VIEW: ScreenPerm = { ver: true, criar: false, editar: false, excluir: false };
const FULL: ScreenPerm = { ver: true, criar: true, editar: true, excluir: true };
const EDIT: ScreenPerm = { ver: true, criar: true, editar: true, excluir: false };

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

/** Permissões padrão por perfil (role). */
export function defaultPermissions(role: Role): PermMatrix {
  const out: PermMatrix = {};
  for (const s of SCREENS) {
    if (role === "owner" || role === "admin") {
      out[s.id] = { ...FULL };
    } else if (role === "membro") {
      out[s.id] = s.modulo === "Config" ? { ...NONE } : { ...EDIT };
    } else if (role === "engenheiro") {
      // engenheiro: acesso apenas ao Lançamento de Medição
      out[s.id] = s.id === "medicaolanc" ? { ...FULL } : { ...NONE };
    } else {
      // contador: somente leitura de um subconjunto
      out[s.id] = CONTADOR_VE.has(s.id) ? { ...VIEW } : { ...NONE };
    }
  }
  return out;
}

/** Permissões efetivas: overrides do membro (se houver) por tela, senão default. */
export function effectivePermissions(
  role: Role,
  overrides?: PermMatrix | null,
): PermMatrix {
  const base = defaultPermissions(role);
  if (!overrides) return base;
  for (const s of SCREENS) {
    const o = overrides[s.id];
    if (o) base[s.id] = { ...base[s.id], ...o };
  }
  return base;
}

/** O usuário pode executar `action` na `screenId`? */
export function can(
  perms: PermMatrix,
  screenId: string,
  action: PermAction,
): boolean {
  return perms[screenId]?.[action] ?? false;
}

/** Primeiro segmento da rota → id de tela (ou null se não governada). */
export function screenIdOfPath(pathname: string | null | undefined): string | null {
  if (!pathname) return null;
  const seg = pathname.replace(/^\//, "").split("/")[0];
  return SCREEN_IDS.includes(seg) ? seg : null;
}
```

---

## 2. `/contabilidade`

Não importa nenhum componente próprio além de `page-header.tsx`.

### `src/app/(app)/contabilidade/page.tsx`

```tsx
import { getActiveContext } from "@/lib/context";
import { getDespesas, getMembers, getMonthlyRevenue } from "@/lib/queries";
import { inviteContador } from "@/lib/actions/users";
import { brl0 } from "@/lib/utils";
import { PageHeader } from "@/components/app/page-header";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input, Label } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Table, THead, TH, TR, TD } from "@/components/ui/table";

export const dynamic = "force-dynamic";

export default async function ContabilidadePage() {
  const ctx = await getActiveContext();
  if (!ctx) return null;

  const [despesas, revenue, members] = await Promise.all([
    getDespesas(ctx.version.id),
    getMonthlyRevenue(ctx.version.id, ctx.project.id),
    getMembers(ctx.tenant.id),
  ]);
  const receita = Object.values(revenue).reduce((a, b) => a + b, 0);
  const totalDespesas = despesas.reduce((a, d) => a + Number(d.valor), 0);
  const resultado = receita - totalDespesas;
  const contadores = members.filter((m) => m.role === "contador");
  const podeGerir = ctx.role === "owner" || ctx.role === "admin";

  return (
    <>
      <PageHeader
        title="Acesso Contabilidade"
        subtitle="Visão somente-leitura de balancetes e demonstrativos"
      />

      <div className="mb-6 grid grid-cols-1 gap-4 sm:grid-cols-3">
        <Card>
          <CardContent className="p-5">
            <p className="font-[family-name:var(--font-mono)] text-[10px] uppercase tracking-wide text-[var(--color-ink3)]">
              Receita projetada
            </p>
            <p className="mt-2 text-xl font-semibold">{brl0(receita)}</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-5">
            <p className="font-[family-name:var(--font-mono)] text-[10px] uppercase tracking-wide text-[var(--color-ink3)]">
              Despesas lançadas
            </p>
            <p className="mt-2 text-xl font-semibold">{brl0(totalDespesas)}</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-5">
            <p className="font-[family-name:var(--font-mono)] text-[10px] uppercase tracking-wide text-[var(--color-ink3)]">
              Resultado
            </p>
            <p
              className={`mt-2 text-xl font-semibold ${
                resultado >= 0
                  ? "text-[var(--color-success)]"
                  : "text-[var(--color-danger)]"
              }`}
            >
              {brl0(resultado)}
            </p>
          </CardContent>
        </Card>
      </div>

      {podeGerir && (
        <Card className="mb-6">
          <CardContent className="p-5">
            <h2 className="mb-3 text-sm font-semibold text-[var(--color-ink)]">
              Convidar escritório contábil
            </h2>
            <form
              action={inviteContador}
              className="grid grid-cols-2 gap-3 sm:grid-cols-3"
            >
              <div>
                <Label>Nome</Label>
                <Input name="name" placeholder="Escritório Contábil" />
              </div>
              <div>
                <Label>E-mail</Label>
                <Input name="email" type="email" required />
              </div>
              <div className="flex items-end">
                <Button type="submit" className="w-full">
                  Convidar (somente leitura)
                </Button>
              </div>
            </form>
          </CardContent>
        </Card>
      )}

      <h2 className="mb-3 text-sm font-semibold text-[var(--color-ink)]">
        Contadores com acesso
      </h2>
      <Table>
        <THead>
          <tr>
            <TH>Nome</TH>
            <TH>E-mail</TH>
            <TH>Acesso</TH>
          </tr>
        </THead>
        <tbody>
          {contadores.map((m) => (
            <TR key={m.userId}>
              <TD className="font-medium text-[var(--color-ink)]">
                {m.name ?? "—"}
              </TD>
              <TD className="font-[family-name:var(--font-mono)]">
                {m.email ?? "—"}
              </TD>
              <TD>
                <Badge tone="warning">somente leitura</Badge>
              </TD>
            </TR>
          ))}
          {contadores.length === 0 && (
            <TR>
              <TD colSpan={3} className="py-6 text-center text-[var(--color-ink3)]">
                Nenhum contador convidado ainda.
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

## 3. `/acessos` e `/usuarios`

### `src/app/(app)/acessos/page.tsx`

```tsx
import { getActiveContext, type Role } from "@/lib/context";
import { can, effectivePermissions } from "@/lib/permissions";
import { getMembers } from "@/lib/queries";
import { PageHeader } from "@/components/app/page-header";
import { AccessMatrix } from "@/components/app/access-matrix";

export const dynamic = "force-dynamic";

export default async function AcessosPage() {
  const ctx = await getActiveContext();
  if (!ctx) return null;

  const members = await getMembers(ctx.tenant.id);
  const canEditPerms = can(ctx.perms, "acessos", "editar");

  const rows = members.map((m) => ({
    userId: m.userId,
    name: m.name,
    email: m.email,
    role: m.role,
    perms: effectivePermissions(m.role as Role, m.permissions),
  }));

  return (
    <>
      <PageHeader
        title="Gestão de Acessos"
        subtitle="Permissões granulares por usuário · telas × ações (Ver / Criar / Editar / Excluir)"
      />
      {!canEditPerms && (
        <p className="mb-4 text-sm text-[var(--color-warning)]">
          Você pode visualizar, mas não editar permissões.
        </p>
      )}
      <AccessMatrix members={rows} canEdit={canEditPerms} />
    </>
  );
}
```

### `src/components/app/access-matrix.tsx`

Importado por `/acessos`. É a grade tela × ação que grava os overrides.

```tsx
"use client";

import { Fragment, useMemo, useState, useTransition } from "react";
import {
  SCREENS,
  type PermMatrix,
  type PermAction,
  type Modulo,
} from "@/lib/permissions";
import { setMemberPermissions } from "@/lib/actions/users";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";

export interface AccessMatrixMember {
  userId: string;
  name: string | null;
  email: string | null;
  role: string;
  perms: PermMatrix;
}

const ACTIONS: { key: PermAction; label: string }[] = [
  { key: "ver", label: "Ver" },
  { key: "criar", label: "Criar" },
  { key: "editar", label: "Editar" },
  { key: "excluir", label: "Excluir" },
];
const MODULOS: Modulo[] = [
  // A ordem espelha o menu lateral. "Planejamento" estava faltando: as telas de
  // Budget, Forecast e Plano de Contas não apareciam na matriz, e não havia como
  // conceder ou revogar acesso a elas por aqui.
  "Planejamento",
  "Receitas",
  "Despesas",
  "Conciliação de Caixa",
  "Reports",
  "Config",
  "Backup",
];

export function AccessMatrix({
  members,
  canEdit = true,
}: {
  members: AccessMatrixMember[];
  canEdit?: boolean;
}) {
  const [sel, setSel] = useState<string | null>(members[0]?.userId ?? null);
  const member = members.find((m) => m.userId === sel) ?? null;

  return (
    <div className="grid gap-6 lg:grid-cols-[260px_1fr]">
      {/* Lista de membros */}
      <div className="space-y-1.5">
        {members.map((m) => {
          const active = m.userId === sel;
          return (
            <button
              key={m.userId}
              onClick={() => setSel(m.userId)}
              className={`w-full rounded-[8px] border px-3 py-2.5 text-left transition-colors ${
                active
                  ? "border-[var(--color-accent2)] bg-[var(--color-accent4)]"
                  : "border-[var(--color-accent2)]/12 bg-white hover:bg-[var(--color-surface2)]"
              }`}
            >
              <div className="text-sm font-medium text-[var(--color-ink)]">
                {m.name ?? m.email}
              </div>
              <div className="mt-0.5 flex items-center gap-1.5">
                <Badge tone={m.role === "owner" ? "accent" : "neutral"}>
                  {m.role}
                </Badge>
              </div>
            </button>
          );
        })}
      </div>

      {/* Matriz do membro selecionado */}
      {member ? (
        <MemberMatrix key={member.userId} member={member} canEdit={canEdit} />
      ) : (
        <Card>
          <CardContent className="p-8 text-center text-sm text-[var(--color-ink3)]">
            Selecione um membro.
          </CardContent>
        </Card>
      )}
    </div>
  );
}

function MemberMatrix({
  member,
  canEdit,
}: {
  member: AccessMatrixMember;
  canEdit: boolean;
}) {
  const [perms, setPerms] = useState<PermMatrix>(() =>
    Object.fromEntries(
      SCREENS.map((s) => [s.id, { ...(member.perms[s.id] ?? { ver: false, criar: false, editar: false, excluir: false }) }]),
    ),
  );
  const [pending, start] = useTransition();
  const [saved, setSaved] = useState(false);
  const [dirty, setDirty] = useState(false);
  const ownerFull = member.role === "owner"; // owner sempre total
  const editable = canEdit && !ownerFull;

  // Persiste (e registra no log de auditoria) apenas ao clicar em "Salvar" —
  // evita gerar uma entrada de auditoria a cada clique de checkbox.
  const save = () => {
    if (!editable || !dirty) return;
    setSaved(false);
    start(async () => {
      await setMemberPermissions(member.userId, perms);
      setDirty(false);
      setSaved(true);
    });
  };

  function toggle(screenId: string, action: PermAction) {
    if (!editable) return;
    setSaved(false);
    setDirty(true);
    setPerms((prev) => {
      const cur = { ...prev[screenId] };
      const val = !cur[action];
      cur[action] = val;
      // "Ver" é pré-requisito das demais ações.
      if (action === "ver" && !val) {
        cur.criar = cur.editar = cur.excluir = false;
      } else if (action !== "ver" && val) {
        cur.ver = true;
      }
      return { ...prev, [screenId]: cur };
    });
  }

  const grouped = useMemo(
    () => MODULOS.map((mod) => ({ mod, screens: SCREENS.filter((s) => s.modulo === mod) })),
    [],
  );

  return (
    <Card>
      <CardContent className="p-5">
        <div className="mb-3 flex items-center justify-between">
          <h2 className="text-sm font-semibold text-[var(--color-ink)]">
            Permissões · {member.name ?? member.email}
          </h2>
          {ownerFull ? (
            <Badge tone="accent">owner — acesso total</Badge>
          ) : (
            <div className="flex items-center gap-3">
              {pending ? (
                <span className="text-xs text-[var(--color-ink3)]">Salvando…</span>
              ) : saved ? (
                <span className="text-xs text-[var(--color-success)]">Salvo.</span>
              ) : dirty ? (
                <span className="text-xs text-[var(--color-warning)]">
                  Alterações não salvas
                </span>
              ) : null}
              {editable && (
                <Button size="sm" onClick={save} disabled={!dirty || pending}>
                  Salvar
                </Button>
              )}
            </div>
          )}
        </div>

        <div className="tbl-scroll overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-[var(--color-accent2)]/12">
                <th className="px-2 py-2 text-left font-[family-name:var(--font-mono)] text-[10px] uppercase tracking-wide text-[var(--color-ink3)]">
                  Tela
                </th>
                {ACTIONS.map((a) => (
                  <th key={a.key} className="px-2 py-2 text-center font-[family-name:var(--font-mono)] text-[10px] uppercase tracking-wide text-[var(--color-ink3)]">
                    {a.label}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {grouped.map(({ mod, screens }) => (
                <Fragment key={mod}>
                  <tr className="bg-[var(--color-surface2)]">
                    <td colSpan={5} className="px-2 py-1.5 font-[family-name:var(--font-mono)] text-[10px] uppercase tracking-wide text-[var(--color-accent)]">
                      {mod}
                    </td>
                  </tr>
                  {screens.map((s) => (
                    <tr key={s.id} className="border-b border-[var(--color-accent2)]/8">
                      <td className="px-2 py-2 text-[var(--color-ink2)]">{s.label}</td>
                      {ACTIONS.map((a) => {
                        const checked = ownerFull ? true : perms[s.id]?.[a.key] ?? false;
                        return (
                          <td key={a.key} className="px-2 py-2 text-center">
                            <input
                              type="checkbox"
                              checked={checked}
                              disabled={!editable || pending}
                              onChange={() => toggle(s.id, a.key)}
                            />
                          </td>
                        );
                      })}
                    </tr>
                  ))}
                </Fragment>
              ))}
            </tbody>
          </table>
        </div>
      </CardContent>
    </Card>
  );
}
```

### `src/app/(app)/usuarios/page.tsx`

```tsx
import Link from "next/link";
import { getActiveContext, type Role } from "@/lib/context";
import { can } from "@/lib/permissions";
import { getMembers } from "@/lib/queries";
import { inviteMember } from "@/lib/actions/users";
import { PageHeader } from "@/components/app/page-header";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input, Label, Select } from "@/components/ui/input";
import { PasswordInput } from "@/components/ui/password-input";
import { Badge } from "@/components/ui/badge";
import { Table, THead, TH, TR, TD } from "@/components/ui/table";
import { RoleSelect } from "@/components/app/role-select";
import { MemberActions } from "@/components/app/member-actions";

export const dynamic = "force-dynamic";

const roleTone: Record<string, "accent" | "info" | "neutral" | "warning"> = {
  owner: "accent",
  admin: "info",
  membro: "neutral",
  contador: "warning",
  engenheiro: "info",
};

export default async function UsuariosPage() {
  const ctx = await getActiveContext();
  if (!ctx) return null;

  const members = await getMembers(ctx.tenant.id);
  const podeCriar = can(ctx.perms, "usuarios", "criar");
  const podeEditar = can(ctx.perms, "usuarios", "editar");
  const podeExcluir = can(ctx.perms, "usuarios", "excluir");
  const temAcoes = podeEditar || podeExcluir;

  return (
    <>
      <PageHeader
        title="Usuários & Acessos"
        subtitle={`${members.length} membros · seu papel: ${ctx.role}`}
      />

      {podeCriar && (
        <Card className="mb-6">
          <CardContent className="p-5">
            <h2 className="mb-3 text-sm font-semibold text-[var(--color-ink)]">
              Novo usuário
            </h2>
            <form
              action={inviteMember}
              className="grid grid-cols-2 gap-3 sm:grid-cols-5"
            >
              <div>
                <Label>Nome</Label>
                <Input name="name" placeholder="Nome do membro" />
              </div>
              <div>
                <Label>E-mail</Label>
                <Input name="email" type="email" required />
              </div>
              <div>
                <Label>Papel</Label>
                <Select name="role" defaultValue="membro">
                  <option value="admin">admin</option>
                  <option value="membro">membro</option>
                  <option value="contador">contador</option>
                  <option value="engenheiro">engenheiro</option>
                </Select>
              </div>
              <div>
                <Label>Senha inicial (opcional)</Label>
                <PasswordInput
                  name="password"
                  placeholder="mín. 8"
                  autoComplete="new-password"
                />
              </div>
              <div className="flex items-end">
                <Button type="submit" className="w-full">
                  Adicionar
                </Button>
              </div>
            </form>
            <p className="mt-2 text-xs text-[var(--color-ink3)]">
              Sem senha inicial, o usuário fica com acesso pendente até você
              definir uma senha na tabela abaixo.
            </p>
          </CardContent>
        </Card>
      )}

      <Table>
        <THead>
          <tr>
            <TH>Nome</TH>
            <TH>E-mail</TH>
            <TH>Papel</TH>
            <TH>Acesso</TH>
            {temAcoes && <TH>Ações</TH>}
          </tr>
        </THead>
        <tbody>
          {members.map((m) => (
            <TR key={m.userId}>
              <TD className="font-medium text-[var(--color-ink)]">
                {m.name ?? "—"}
              </TD>
              <TD className="font-[family-name:var(--font-mono)]">
                {m.email ?? "—"}
              </TD>
              <TD>
                {podeEditar ? (
                  <RoleSelect userId={m.userId} role={m.role as Role} />
                ) : (
                  <Badge tone={roleTone[m.role] ?? "neutral"}>{m.role}</Badge>
                )}
              </TD>
              <TD>
                <div className="flex flex-wrap items-center gap-1">
                  <Badge tone={m.hasPassword ? "success" : "warning"}>
                    {m.hasPassword ? "ativo" : "sem senha"}
                  </Badge>
                  {m.mfaEnabled && <Badge tone="info">MFA</Badge>}
                  {m.userId === ctx.userId && (
                    <Badge tone="neutral">você</Badge>
                  )}
                </div>
              </TD>
              {temAcoes && (
                <TD>
                  <MemberActions
                    userId={m.userId}
                    name={m.name}
                    isSelf={m.userId === ctx.userId}
                    canEdit={podeEditar}
                    canDelete={podeExcluir}
                  />
                </TD>
              )}
            </TR>
          ))}
        </tbody>
      </Table>

      {podeCriar && (
        <p className="mb-2 mt-6 text-sm text-[var(--color-ink3)]">
          Para permissões granulares por tela e ação, use{" "}
          <Link href="/acessos" className="text-[var(--color-accent2)] hover:underline">
            Gestão de Acessos
          </Link>
          .
        </p>
      )}

      {!podeEditar && (
        <p className="mt-4 text-sm text-[var(--color-warning)]">
          Você está em modo somente-leitura nesta tela.
        </p>
      )}
    </>
  );
}
```

### `src/components/app/member-actions.tsx`

Importado por `/usuarios`.

```tsx
"use client";

import { useState, useTransition } from "react";
import {
  removeMember,
  resetMemberPassword,
  updateMemberName,
} from "@/lib/actions/users";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { PasswordInput } from "@/components/ui/password-input";

type Mode = "view" | "name" | "password";

/**
 * Ações por linha na tela de Usuários: editar nome, redefinir senha e remover
 * o membro do tenant. As guardas (último owner, auto-remoção) vivem nas server
 * actions; aqui só refletimos o erro retornado.
 */
export function MemberActions({
  userId,
  name,
  isSelf,
  canEdit,
  canDelete,
}: {
  userId: string;
  name: string | null;
  isSelf: boolean;
  canEdit: boolean;
  canDelete: boolean;
}) {
  const [mode, setMode] = useState<Mode>("view");
  const [value, setValue] = useState(name ?? "");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();

  function run(fn: () => Promise<{ ok: boolean; error?: string }>) {
    setError(null);
    start(async () => {
      const res = await fn();
      if (!res.ok) {
        setError(res.error ?? "Falhou.");
        return;
      }
      setPassword("");
      setMode("view");
    });
  }

  if (mode === "name") {
    return (
      <div className="flex flex-col gap-1">
        <div className="flex items-center gap-2">
          <Input
            value={value}
            onChange={(e) => setValue(e.target.value)}
            placeholder="Nome"
            className="h-8 w-40"
            autoFocus
          />
          <Button
            size="sm"
            disabled={pending}
            onClick={() => run(() => updateMemberName(userId, value))}
          >
            Salvar
          </Button>
          <Button
            size="sm"
            variant="ghost"
            disabled={pending}
            onClick={() => {
              setValue(name ?? "");
              setError(null);
              setMode("view");
            }}
          >
            Cancelar
          </Button>
        </div>
        {error && <span className="text-xs text-[var(--color-danger)]">{error}</span>}
      </div>
    );
  }

  if (mode === "password") {
    return (
      <div className="flex flex-col gap-1">
        <div className="flex items-center gap-2">
          <PasswordInput
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            placeholder="Nova senha (mín. 8)"
            autoComplete="new-password"
            className="h-8 w-48"
            autoFocus
          />
          <Button
            size="sm"
            disabled={pending}
            onClick={() => run(() => resetMemberPassword(userId, password))}
          >
            Definir
          </Button>
          <Button
            size="sm"
            variant="ghost"
            disabled={pending}
            onClick={() => {
              setPassword("");
              setError(null);
              setMode("view");
            }}
          >
            Cancelar
          </Button>
        </div>
        {error && <span className="text-xs text-[var(--color-danger)]">{error}</span>}
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-1">
      <div className="flex items-center gap-1">
        {canEdit && (
          <>
            <Button size="sm" variant="outline" onClick={() => setMode("name")}>
              Editar
            </Button>
            <Button
              size="sm"
              variant="outline"
              onClick={() => setMode("password")}
            >
              Senha
            </Button>
          </>
        )}
        {canDelete && (
          <Button
            size="sm"
            variant="ghost"
            disabled={pending || isSelf}
            title={
              isSelf ? "Você não pode remover a si mesmo" : "Remover do tenant"
            }
            className="text-[var(--color-danger)] hover:bg-[#fee2e2]"
            onClick={() => {
              if (
                !window.confirm(
                  `Remover ${name || "este membro"} do tenant? O acesso será revogado.`,
                )
              )
                return;
              run(() => removeMember(userId));
            }}
          >
            Remover
          </Button>
        )}
      </div>
      {error && <span className="text-xs text-[var(--color-danger)]">{error}</span>}
    </div>
  );
}
```

### `src/components/app/role-select.tsx`

Importado por `/usuarios`.

```tsx
"use client";

import { useState, useTransition } from "react";
import { changeRole } from "@/lib/actions/users";
import type { Role } from "@/lib/context";

const ROLES: Role[] = ["owner", "admin", "membro", "contador", "engenheiro"];

export function RoleSelect({
  userId,
  role,
  disabled,
}: {
  userId: string;
  role: Role;
  disabled?: boolean;
}) {
  const [pending, start] = useTransition();
  const [value, setValue] = useState<Role>(role);
  const [error, setError] = useState<string | null>(null);

  return (
    <div className="flex flex-col gap-1">
      <select
        value={value}
        disabled={disabled || pending}
        onChange={(e) => {
          const next = e.target.value as Role;
          const prev = value;
          setValue(next);
          setError(null);
          start(async () => {
            const res = await changeRole(userId, next);
            if (!res.ok) {
              setValue(prev);
              setError(res.error ?? "Falhou.");
            }
          });
        }}
        className="h-8 rounded-[8px] border border-[var(--color-accent2)]/20 bg-white px-2 text-xs disabled:opacity-50"
      >
        {ROLES.map((r) => (
          <option key={r} value={r}>
            {r}
          </option>
        ))}
      </select>
      {error && (
        <span className="text-xs text-[var(--color-danger)]">{error}</span>
      )}
    </div>
  );
}
```

---

## 4. Server Actions que gravam `role` ou `permissions`

| Action | Arquivo | Linha | Operação | Grava |
|---|---|---|---|---|
| `setMemberPermissions` | `src/lib/actions/users.ts` | 114–115 | UPDATE `.set({ permissions })` | `permissions` |
| `changeRole` | `src/lib/actions/users.ts` | 158–159 | UPDATE `.set({ role })` | `role` |
| `invite` (via `inviteMember` / `inviteContador`) | `src/lib/actions/users.ts` | 78–84 | INSERT `.values({ userId, tenantId, role })` com `onConflictDoUpdate` `.set({ role })` | `role` |

São as três — e todas vivem em `src/lib/actions/users.ts`, que vai inteiro.

Fora das Server Actions, mais dois pontos do repositório escrevem a tabela
`membership`, ambos criando o vínculo inicial e nenhum deles alcançável pela
interface:

- `src/lib/tenant/provision.ts:101` — INSERT ao provisionar um tenant novo.
- `src/lib/db/seed.ts:70` — INSERT do seed.

Nenhum outro caminho grava `permissions`: `setMemberPermissions` é o único.

### `src/lib/actions/users.ts`

```ts
"use server";

import { and, eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { db, schema } from "@/lib/db";
import { getActiveContext, type Role } from "@/lib/context";
import { can, type PermMatrix } from "@/lib/permissions";
import { hashPassword } from "@/lib/password";
import { logAudit } from "@/lib/audit";

const ROLES: Role[] = ["owner", "admin", "membro", "contador", "engenheiro"];

export interface ActionResult {
  ok: boolean;
  error?: string;
}

/** Conta quantos owners o tenant tem (para proteger o último owner). */
async function countOwners(tenantId: string): Promise<number> {
  const rows = await db
    .select({ userId: schema.memberships.userId })
    .from(schema.memberships)
    .where(
      and(
        eq(schema.memberships.tenantId, tenantId),
        eq(schema.memberships.role, "owner"),
      ),
    );
  return rows.length;
}

/**
 * Convida um membro para o tenant: garante o usuário (por e-mail) e cria o
 * vínculo com o papel. Sem envio de e-mail ainda — o registro fica pronto para
 * o fluxo de login do Auth.js. Apenas owner/admin podem convidar.
 */
async function invite(formData: FormData, fixedRole?: Role) {
  const ctx = await getActiveContext();
  if (!ctx || !can(ctx.perms, "usuarios", "criar")) return;

  const email = ((formData.get("email") as string) || "").trim().toLowerCase();
  const name = (formData.get("name") as string) || null;
  const password = ((formData.get("password") as string) || "").trim();
  const role =
    fixedRole ??
    (ROLES.includes(formData.get("role") as Role)
      ? (formData.get("role") as Role)
      : "membro");
  if (!email) return;

  // Senha inicial é opcional; se informada precisa ter no mínimo 8 caracteres.
  const passwordHash =
    password.length >= 8 ? hashPassword(password) : undefined;

  const [existing] = await db
    .select()
    .from(schema.users)
    .where(eq(schema.users.email, email))
    .limit(1);

  const userId =
    existing?.id ??
    (
      await db
        .insert(schema.users)
        .values({ email, name, passwordHash })
        .returning()
    )[0].id;

  // Usuário já existia e foi informada uma senha inicial → define a senha.
  if (existing && passwordHash) {
    await db
      .update(schema.users)
      .set({ passwordHash })
      .where(eq(schema.users.id, userId));
  }

  await db
    .insert(schema.memberships)
    .values({ userId, tenantId: ctx.tenant.id, role })
    .onConflictDoUpdate({
      target: [schema.memberships.userId, schema.memberships.tenantId],
      set: { role },
    });

  await logAudit({
    tenantId: ctx.tenant.id,
    userId: ctx.userId,
    action: "membership.invite",
    entity: "membership",
    entityId: userId,
    meta: { email, role },
  });
  revalidatePath("/usuarios");
  revalidatePath("/contabilidade");
}

export async function inviteMember(formData: FormData) {
  await invite(formData);
}

export async function inviteContador(formData: FormData) {
  await invite(formData, "contador");
}

/** Define os overrides de permissão granular (tela × ação) de um membro. */
export async function setMemberPermissions(
  userId: string,
  permissions: PermMatrix,
) {
  const ctx = await getActiveContext();
  if (!ctx || !can(ctx.perms, "acessos", "editar")) return;
  await db
    .update(schema.memberships)
    .set({ permissions })
    .where(
      and(
        eq(schema.memberships.userId, userId),
        eq(schema.memberships.tenantId, ctx.tenant.id),
      ),
    );
  await logAudit({
    tenantId: ctx.tenant.id,
    userId: ctx.userId,
    action: "membership.permissions",
    entity: "membership",
    entityId: userId,
    meta: permissions,
  });
  revalidatePath("/usuarios");
}

export async function changeRole(
  userId: string,
  role: Role,
): Promise<ActionResult> {
  const ctx = await getActiveContext();
  if (!ctx || !can(ctx.perms, "usuarios", "editar"))
    return { ok: false, error: "Sem permissão." };

  // Rebaixar o último owner deixaria o tenant sem dono.
  const [target] = await db
    .select({ role: schema.memberships.role })
    .from(schema.memberships)
    .where(
      and(
        eq(schema.memberships.userId, userId),
        eq(schema.memberships.tenantId, ctx.tenant.id),
      ),
    )
    .limit(1);
  if (target?.role === "owner" && role !== "owner") {
    if ((await countOwners(ctx.tenant.id)) <= 1)
      return { ok: false, error: "O tenant precisa de pelo menos um owner." };
  }

  await db
    .update(schema.memberships)
    .set({ role })
    .where(
      and(
        eq(schema.memberships.userId, userId),
        eq(schema.memberships.tenantId, ctx.tenant.id),
      ),
    );
  await logAudit({
    tenantId: ctx.tenant.id,
    userId: ctx.userId,
    action: "membership.role",
    entity: "membership",
    entityId: userId,
    meta: { role },
  });
  revalidatePath("/usuarios");
  return { ok: true };
}

/** Edita o nome de exibição de um membro. */
export async function updateMemberName(
  userId: string,
  name: string,
): Promise<ActionResult> {
  const ctx = await getActiveContext();
  if (!ctx || !can(ctx.perms, "usuarios", "editar"))
    return { ok: false, error: "Sem permissão." };
  await db
    .update(schema.users)
    .set({ name: name.trim() || null })
    .where(eq(schema.users.id, userId));
  await logAudit({
    tenantId: ctx.tenant.id,
    userId: ctx.userId,
    action: "user.rename",
    entity: "user",
    entityId: userId,
    meta: { name },
  });
  revalidatePath("/usuarios");
  return { ok: true };
}

/**
 * Define/redefine a senha de um membro (admin). A troca só vale para membros
 * do próprio tenant. Mínimo de 8 caracteres.
 */
export async function resetMemberPassword(
  userId: string,
  password: string,
): Promise<ActionResult> {
  const ctx = await getActiveContext();
  if (!ctx || !can(ctx.perms, "usuarios", "editar"))
    return { ok: false, error: "Sem permissão." };
  if ((password ?? "").length < 8)
    return { ok: false, error: "A senha precisa de no mínimo 8 caracteres." };

  // Garante que o alvo é membro deste tenant.
  const [m] = await db
    .select({ userId: schema.memberships.userId })
    .from(schema.memberships)
    .where(
      and(
        eq(schema.memberships.userId, userId),
        eq(schema.memberships.tenantId, ctx.tenant.id),
      ),
    )
    .limit(1);
  if (!m) return { ok: false, error: "Membro não encontrado." };

  await db
    .update(schema.users)
    .set({ passwordHash: hashPassword(password) })
    .where(eq(schema.users.id, userId));
  await logAudit({
    tenantId: ctx.tenant.id,
    userId: ctx.userId,
    action: "user.password_reset",
    entity: "user",
    entityId: userId,
  });
  revalidatePath("/usuarios");
  return { ok: true };
}

/**
 * Remove o vínculo (membership) de um membro com o tenant. Não apaga o usuário
 * global (pode pertencer a outros tenants). Protege o último owner e impede a
 * auto-remoção.
 */
export async function removeMember(userId: string): Promise<ActionResult> {
  const ctx = await getActiveContext();
  if (!ctx || !can(ctx.perms, "usuarios", "excluir"))
    return { ok: false, error: "Sem permissão." };
  if (userId === ctx.userId)
    return { ok: false, error: "Você não pode remover a si mesmo." };

  const [target] = await db
    .select({ role: schema.memberships.role })
    .from(schema.memberships)
    .where(
      and(
        eq(schema.memberships.userId, userId),
        eq(schema.memberships.tenantId, ctx.tenant.id),
      ),
    )
    .limit(1);
  if (!target) return { ok: false, error: "Membro não encontrado." };
  if (target.role === "owner" && (await countOwners(ctx.tenant.id)) <= 1)
    return { ok: false, error: "O tenant precisa de pelo menos um owner." };

  await db
    .delete(schema.memberships)
    .where(
      and(
        eq(schema.memberships.userId, userId),
        eq(schema.memberships.tenantId, ctx.tenant.id),
      ),
    );
  await logAudit({
    tenantId: ctx.tenant.id,
    userId: ctx.userId,
    action: "membership.remove",
    entity: "membership",
    entityId: userId,
    meta: { role: target.role },
  });
  revalidatePath("/usuarios");
  return { ok: true };
}
```

---

## 5. `membership` e o enum de papéis

### `src/lib/db/schema.ts` · linhas 30–36

`roleEnum` — os cinco papéis. Os comentários de `contador` e `engenheiro` estão no próprio enum.

```ts
export const roleEnum = pgEnum("role", [
  "owner",
  "admin",
  "membro",
  "contador", // somente leitura (acesso contabilidade)
  "engenheiro", // acesso apenas ao Lançamento de Medição
]);
```

### `src/lib/db/schema.ts` · linhas 149–171

Tabela `membership`. Chave primária composta (`user_id`, `tenant_id`); `permissions` é JSONB nulável — NULL significa “usa os defaults do papel”.

```ts
/** Vínculo usuário ⇄ tenant com papel (RBAC). */
export const memberships = pgTable(
  "membership",
  {
    userId: text("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    tenantId: uuid("tenant_id")
      .notNull()
      .references(() => tenants.id, { onDelete: "cascade" }),
    role: roleEnum("role").notNull().default("membro"),
    /**
     * Permissões granulares (override do perfil/role): matriz tela → ações
     * {ver,criar,editar,excluir}. Null = usa os defaults do role.
     * Ver src/lib/permissions.ts.
     */
    permissions: jsonb("permissions").$type<
      Record<string, { ver: boolean; criar: boolean; editar: boolean; excluir: boolean }>
    >(),
    createdAt: timestamp("created_at", { mode: "date" }).notNull().defaultNow(),
  },
  (m) => [primaryKey({ columns: [m.userId, m.tenantId] })],
);
```

---

## 6. Matriz padrão por papel

Gerada executando `defaultPermissions(role)` para os cinco papéis sobre as
38 telas de `SCREENS`, não por leitura do código.

Legenda: **V** ver · **C** criar · **E** editar · **X** excluir · **—** nenhum acesso.

| Tela | Módulo | owner | admin | membro | contador | engenheiro |
|---|---|---|---|---|---|---|
| `dashboard` | Reports | VCEX | VCEX | VCE | — | — |
| `projecao` | Reports | VCEX | VCEX | VCE | — | — |
| `consolidado` | Reports | VCEX | VCEX | VCE | V | — |
| `caixa` | Conciliação de Caixa | VCEX | VCEX | VCE | — | — |
| `fechamento` | Conciliação de Caixa | VCEX | VCEX | VCE | — | — |
| `balancodia` | Reports | VCEX | VCEX | VCE | — | — |
| `dre` | Reports | VCEX | VCEX | VCE | V | — |
| `fluxocaixa` | Reports | VCEX | VCEX | VCE | V | — |
| `medicao` | Reports | VCEX | VCEX | VCE | V | — |
| `resumo` | Reports | VCEX | VCEX | VCE | V | — |
| `unidades` | Receitas | VCEX | VCEX | VCE | — | — |
| `budget` | Planejamento | VCEX | VCEX | VCE | — | — |
| `forecast` | Planejamento | VCEX | VCEX | VCE | — | — |
| `clientes` | Receitas | VCEX | VCEX | VCE | — | — |
| `contasreceber` | Receitas | VCEX | VCEX | VCE | — | — |
| `medicaolanc` | Despesas | VCEX | VCEX | VCE | — | VCEX |
| `simulador` | Receitas | VCEX | VCEX | VCE | — | — |
| `reembolso` | Receitas | VCEX | VCEX | VCE | — | — |
| `permuta` | Receitas | VCEX | VCEX | VCE | — | — |
| `parametros` | Receitas | VCEX | VCEX | VCE | — | — |
| `despesas` | Despesas | VCEX | VCEX | VCE | V | — |
| `contaspagar` | Despesas | VCEX | VCEX | VCE | — | — |
| `restituicoes` | Despesas | VCEX | VCEX | VCE | — | — |
| `fornecedores` | Despesas | VCEX | VCEX | VCE | — | — |
| `planocontas` | Planejamento | VCEX | VCEX | VCE | V | — |
| `contas` | Despesas | VCEX | VCEX | VCE | — | — |
| `estoque` | Despesas | VCEX | VCEX | VCE | — | — |
| `ponto` | Despesas | VCEX | VCEX | VCE | — | — |
| `backup` | Backup | VCEX | VCEX | VCE | — | — |
| `usuarios` | Config | VCEX | VCEX | — | — | — |
| `acessos` | Config | VCEX | VCEX | — | — | — |
| `acoes` | Config | VCEX | VCEX | — | V | — |
| `contabilidade` | Config | VCEX | VCEX | — | — | — |
| `empresa` | Config | VCEX | VCEX | — | — | — |
| `projeto` | Config | VCEX | VCEX | — | — | — |
| `numeracao` | Config | VCEX | VCEX | — | — | — |
| `versao` | Config | VCEX | VCEX | — | — | — |
| `diagnosticoia` | Config | VCEX | VCEX | — | — | — |

### Resumo por papel

| Papel | Regra no código | Resultado sobre as 38 telas |
|---|---|---|
| `owner` | `{ ...FULL }` em toda tela | **VCEX nas 38** |
| `admin` | idem `owner` — o código não os distingue | **VCEX nas 38** |
| `membro` | `NONE` se o módulo é `Config`, senão `EDIT` | **VCE em 29**, nenhum acesso às 9 de Config |
| `contador` | `VIEW` se a tela está em `CONTADOR_VE`, senão `NONE` | **V em 8**, nenhum acesso às outras 30 |
| `engenheiro` | `FULL` só em `medicaolanc`, senão `NONE` | **VCEX em 1**, nenhum acesso às outras 37 |

As 8 telas do conjunto `CONTADOR_VE`: `dre`, `fluxocaixa`, `medicao`,
`resumo`, `consolidado`, `planocontas`, `despesas`, `acoes`.

As 9 telas de módulo `Config`, fechadas para `membro`: `usuarios`,
`acessos`, `acoes`, `contabilidade`, `empresa`, `projeto`, `numeracao`,
`versao`, `diagnosticoia`.

Dois fatos que a tabela mostra e que valem registro, por serem observações do
código e não interpretação:

- **`owner` e `admin` têm exatamente a mesma matriz.** O `defaultPermissions`
  trata os dois no mesmo ramo (`role === "owner" || role === "admin"`).
- **A tela `perfil` não é governada.** Não está em `SCREENS`; o comentário do
  arquivo diz que é pessoal. `screenIdOfPath` devolve `null` para ela, e
  `can()` sobre um id ausente devolve `false` pelo `?? false`.
