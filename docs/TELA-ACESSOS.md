# Tela — Gestão de Acessos (`/acessos`)

Coleta de código, sem análise. Cada arquivo aparece com o caminho como
cabeçalho. Trechos parciais trazem a faixa de linhas no título do bloco.

Base: branch `claude/contexto-revisao`.

---

## 1. A página

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

---

## 2. Componentes próprios que a página importa (recursivamente)

```
src/app/(app)/acessos/page.tsx
├── @/lib/context                   → getActiveContext, Role
├── @/lib/permissions               → can, effectivePermissions            (seção 3)
├── @/lib/queries                   → getMembers                           (seção 4)
├── @/components/app/page-header    → PageHeader
└── @/components/app/access-matrix  → AccessMatrix   ("use client")
    ├── @/lib/permissions           → SCREENS, PermMatrix, PermAction, Modulo
    ├── @/lib/actions/users         → setMemberPermissions                 (seção 4)
    ├── @/components/ui/card        → Card, CardContent
    ├── @/components/ui/badge       → Badge
    └── @/components/ui/button      → Button
```

`AccessMatrix` é o único componente `"use client"`. Ele contém um segundo
componente interno, `MemberMatrix` (linhas 95–225), remontado a cada troca de
membro pela `key={member.userId}` (linha 83).

### `src/components/app/access-matrix.tsx`

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

---

## 3. `src/lib/permissions.ts` inteiro

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

### `src/lib/permissions.test.ts` — o teste de regressão do módulo

```ts
import { describe, it, expect } from "vitest";
import {
  SCREENS,
  can,
  defaultPermissions,
  effectivePermissions,
  screenIdOfPath,
  type PermMatrix,
} from "./permissions";

/**
 * Teste de REGRESSÃO das permissões.
 *
 * O cliente relatou (e considerou resolvido) um erro em que remover permissões
 * uma a uma acabava provocando "Acesso negado" em telas que deveriam continuar
 * liberadas. A auditoria não encontrou o defeito no código atual — a matriz é
 * enviada inteira e o merge é por tela. Estes testes fixam esse comportamento
 * para que a regressão não volte silenciosamente.
 */
describe("effectivePermissions — merge por tela", () => {
  it("remover a permissão de UMA tela não afeta as demais", () => {
    const base = defaultPermissions("membro");
    const telasComVer = SCREENS.filter((s) => base[s.id]?.ver).map((s) => s.id);
    expect(telasComVer.length).toBeGreaterThan(1);

    const alvo = telasComVer[0];
    const overrides: PermMatrix = {
      [alvo]: { ver: false, criar: false, editar: false, excluir: false },
    };
    const eff = effectivePermissions("membro", overrides);

    expect(can(eff, alvo, "ver")).toBe(false);
    // Todas as outras telas permanecem exatamente como estavam.
    for (const id of telasComVer.slice(1)) {
      expect(can(eff, id, "ver")).toBe(true);
    }
  });

  it("remover várias telas, uma a uma, não derruba as restantes", () => {
    const base = defaultPermissions("membro");
    const telas = SCREENS.filter((s) => base[s.id]?.ver).map((s) => s.id);
    const overrides: PermMatrix = {};
    // Simula o usuário desmarcando as 3 primeiras telas em sequência.
    for (const id of telas.slice(0, 3)) {
      overrides[id] = { ver: false, criar: false, editar: false, excluir: false };
    }
    const eff = effectivePermissions("membro", overrides);
    for (const id of telas.slice(0, 3)) expect(can(eff, id, "ver")).toBe(false);
    for (const id of telas.slice(3)) expect(can(eff, id, "ver")).toBe(true);
  });

  it("override parcial não apaga as demais ações da mesma tela", () => {
    const base = defaultPermissions("membro");
    const alvo = SCREENS.find((s) => base[s.id]?.ver)!.id;
    const eff = effectivePermissions("membro", { [alvo]: { excluir: false } } as PermMatrix);
    expect(can(eff, alvo, "ver")).toBe(true);
    expect(can(eff, alvo, "excluir")).toBe(false);
  });

  it("sem overrides devolve exatamente os padrões do papel", () => {
    expect(effectivePermissions("membro", null)).toEqual(defaultPermissions("membro"));
  });
});

describe("perfil contador — somente leitura", () => {
  const perms = defaultPermissions("contador");

  it("não pode criar, editar nem excluir em nenhuma tela", () => {
    for (const s of SCREENS) {
      expect(can(perms, s.id, "criar")).toBe(false);
      expect(can(perms, s.id, "editar")).toBe(false);
      expect(can(perms, s.id, "excluir")).toBe(false);
    }
  });

  it("enxerga os relatórios essenciais", () => {
    for (const id of ["dre", "fluxocaixa", "consolidado"]) {
      expect(can(perms, id, "ver")).toBe(true);
    }
  });

  it("continua somente-leitura mesmo se um override tentar liberar escrita", () => {
    // Blindagem: ainda que a matriz salva contivesse escrita, o papel contador
    // não deve poder excluir lançamentos. Se este teste passar a falhar, a
    // decisão precisa ser consciente.
    const eff = effectivePermissions("contador", {
      dre: { ver: true, criar: false, editar: false, excluir: false },
    } as PermMatrix);
    expect(can(eff, "dre", "ver")).toBe(true);
    expect(can(eff, "dre", "excluir")).toBe(false);
  });
});

describe("owner — acesso total", () => {
  it("pode tudo em todas as telas", () => {
    const perms = defaultPermissions("owner");
    for (const s of SCREENS) {
      expect(can(perms, s.id, "ver")).toBe(true);
      expect(can(perms, s.id, "excluir")).toBe(true);
    }
  });
});

describe("screenIdOfPath", () => {
  it("mapeia a rota para a tela governada", () => {
    expect(screenIdOfPath("/despesas")).toBe("despesas");
    expect(screenIdOfPath("/despesas/123")).toBe("despesas");
  });

  it("devolve null para rota não governada ou vazia", () => {
    expect(screenIdOfPath("/rota-inexistente")).toBeNull();
    expect(screenIdOfPath(null)).toBeNull();
  });
});

describe("can — ausência de permissão nega por padrão", () => {
  it("tela desconhecida é negada", () => {
    expect(can({}, "qualquer", "ver")).toBe(false);
  });
});
```

---

## 4. `setMemberPermissions` na íntegra

### `src/lib/actions/users.ts:106–131`

```ts
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
```

Contexto do arquivo: o topo, com os imports e o `ROLES` usado pelas outras
actions do mesmo módulo.

### `src/lib/actions/users.ts:1–16`

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
```

### `src/lib/queries.ts:1461–1491` — `getMembers`, que alimenta a página

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

## 5. Tabelas envolvidas no schema

A tela lê e escreve **uma única coluna**: `membership.permissions`. As demais
entram por join ou por efeito colateral.

### `src/lib/db/schema.ts:149–171` — `membership` (é aqui que a matriz mora)

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

O `jsonb` é tipado em TypeScript como
`Record<string, {ver, criar, editar, excluir}>` (`schema.ts:165–167`) — mas
**no banco é `jsonb` puro**: o Postgres aceita qualquer JSON, com quaisquer
chaves. `null` significa "use só os defaults do papel" (`schema.ts:162`).

### `src/lib/db/schema.ts:29–36` — `roleEnum`, a outra metade da conta

```ts
/** Papéis de acesso do tenant (ver docs/STACK.md §2 - Autenticação). */
export const roleEnum = pgEnum("role", [
  "owner",
  "admin",
  "membro",
  "contador", // somente leitura (acesso contabilidade)
  "engenheiro", // acesso apenas ao Lançamento de Medição
]);
```

### `src/lib/db/schema.ts:40–53` — `user` (entra por `innerJoin` em `getMembers`)

```ts
export const users = pgTable("user", {
  id: text("id")
    .primaryKey()
    .$defaultFn(() => crypto.randomUUID()),
  name: text("name"),
  email: text("email").unique(),
  emailVerified: timestamp("emailVerified", { mode: "date" }),
  image: text("image"),
  /** hash da senha (login por credenciais; scrypt). */
  passwordHash: text("password_hash"),
  /** segredo TOTP (base32) para MFA. */
  mfaSecret: text("mfa_secret"),
  mfaEnabled: boolean("mfa_enabled").notNull().default(false),
});
```

### `src/lib/db/schema.ts:1302–1320` — `audit_log` (destino do `logAudit`)

```ts
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

Índices e constraints, conferidos em `meta/0038_snapshot.json`:

```
TABLE public.membership
  indexes: {}
  uniques: {}
  compositePK: {"membership_user_id_tenant_id_pk": ["user_id", "tenant_id"]}
  FK ['user_id']   -> user   ['id'] ON DELETE cascade
  FK ['tenant_id'] -> tenant ['id'] ON DELETE cascade
```

Nenhum índice em `permissions`, e nenhuma constraint que valide seu conteúdo.

---

## 6. Perguntas

### a) `SCREENS` inteira. Quantas são? Quais rotas NÃO estão nela?

São **38 telas**. A constante inteira está colada na seção 3
(`permissions.ts:35–74`); em forma de tabela:

| # | `id` | `label` | `modulo` |
|---|---|---|---|
| 1 | `dashboard` | Dashboard | Reports |
| 2 | `projecao` | Projeção de Receitas | Reports |
| 3 | `consolidado` | Consolidado | Reports |
| 4 | `caixa` | Controle de Caixa | Conciliação de Caixa |
| 5 | `fechamento` | Fechamento de Caixa | Conciliação de Caixa |
| 6 | `balancodia` | Balanço do Dia | Reports |
| 7 | `dre` | DRE | Reports |
| 8 | `fluxocaixa` | Fluxo de Caixa | Reports |
| 9 | `medicao` | Medição de Obra | Reports |
| 10 | `resumo` | Resumo Executivo | Reports |
| 11 | `unidades` | Unidades / Dados de Venda | Receitas |
| 12 | `budget` | Lançamento Budget | Planejamento |
| 13 | `forecast` | Lançamento Forecast | Planejamento |
| 14 | `clientes` | Clientes (Compradores) | Receitas |
| 15 | `contasreceber` | Contas a Receber | Receitas |
| 16 | `medicaolanc` | Lançamento de Medição | Despesas |
| 17 | `simulador` | Simulador | Receitas |
| 18 | `reembolso` | Reembolso | Receitas |
| 19 | `permuta` | Inventário de Permuta | Receitas |
| 20 | `parametros` | Parâmetros / INCC | Receitas |
| 21 | `despesas` | Lançamentos de Despesas | Despesas |
| 22 | `contaspagar` | Contas a Pagar | Despesas |
| 23 | `restituicoes` | Restituições (pago por terceiro) | Despesas |
| 24 | `fornecedores` | Fornecedores & Stakeholders | Despesas |
| 25 | `planocontas` | Plano de Contas | Planejamento |
| 26 | `contas` | Contas Correntes | Despesas |
| 27 | `estoque` | Controle de Estoques | Despesas |
| 28 | `ponto` | Controle de Ponto | Despesas |
| 29 | `backup` | Backup & Arquivamento | Backup |
| 30 | `usuarios` | Usuários & Acessos | Config |
| 31 | `acessos` | Gestão de Acessos | Config |
| 32 | `acoes` | Log de Auditoria | Config |
| 33 | `contabilidade` | Acesso Contabilidade | Config |
| 34 | `empresa` | Empresa | Config |
| 35 | `projeto` | Projetos | Config |
| 36 | `numeracao` | Numeração de Despesas | Config |
| 37 | `versao` | Configuração da Versão | Config |
| 38 | `diagnosticoia` | Diagnóstico de IA | Config |

Distribuição por módulo: **Reports 8**, **Config 9**, **Despesas 8**,
**Receitas 7**, **Planejamento 3**, **Conciliação de Caixa 2**, **Backup 1**.

**Rotas que existem e NÃO estão em `SCREENS`.** Comparando os 42 diretórios de
`src/app/(app)/` com os 38 ids:

| Rota | Governada por quê, então |
|---|---|
| `/acerto` | **nada centralmente.** `screenIdOfPath("/acerto")` devolve `null` (`permissions.ts:141`), então `layout.tsx:95` não nega ninguém. A própria página checa `despesas:editar` + `caixa:ver` (`acerto/page.tsx:24`) e `despesas:excluir` (`:53`); no menu, o item declara `perm: "despesas"` (`sidebar.tsx:91`) |
| `/diagnostico` | idem — id ausente. As duas sub-telas checam por conta própria: `despesas:ver`/`editar` (`diagnostico/categorias-invertidas/page.tsx:23`, `:37`) e `unidades:ver` (`diagnostico/planos-recebiveis/page.tsx:33`). No menu, `perm: "despesas"` e `perm: "unidades"` (`sidebar.tsx:139`, `:144`) |
| `/lancamento` | id ausente. A rota de export checa `can(ctx.perms, version.kind, "ver")` (`lancamento/export/route.ts:29`), ou seja, cai em `budget` ou `forecast` |
| `/perfil` | id ausente, **de propósito** — o comentário de `SCREENS` diz: *"`perfil` é pessoal e não entra aqui"* (`permissions.ts:34`) |

Nenhum id de `SCREENS` ficou sem rota: os 38 têm diretório correspondente.

O comentário do `NavItem` na sidebar explica por que `/acerto` e
`/diagnostico` reaproveitam permissões em vez de ganharem id próprio
(`sidebar.tsx:13–19`):

```tsx
  /**
   * Módulo de permissão que governa o item, quando ele não coincide com o
   * primeiro segmento da rota (ex.: as telas de /diagnostico, que reaproveitam
   * as permissões de Despesas e Unidades em vez de criar módulos novos —
   * módulo novo nasceria negado para todos os papéis já configurados).
   */
  perm?: string;
```

Consequência prática de ficar fora de `SCREENS`: essas rotas **não aparecem na
matriz** de `/acessos` (que itera `SCREENS`, `access-matrix.tsx:144`) e **não
passam pelo enforcement central de "Ver"** do layout. Quem souber a URL de
`/acerto` ou `/diagnostico/...` chega na página; o que barra é só a checagem
que cada página faz por conta própria.

### b) Quais ações cada action realmente consulta? Quantas caixas não são lidas?

Inventário completo: grep de `can(…, "tela", "acao")` em todo o `src/`,
**excluindo arquivos de teste**, mais as seis chamadas com tela dinâmica
resolvidas à mão (ver abaixo). Resultado: **183 chamadas literais**, cobrindo
**72 pares (tela, ação) distintos**.

A leitura de `ver` merece nota antes da tabela: ela é consultada
**centralmente para todas as 38 telas** em `layout.tsx:92–95`, via
`screenIdOfPath`. Por isso a coluna "ver" está marcada em toda linha,
independentemente de a página repetir a checagem.

| # | tela | módulo | ver | criar | editar | excluir |
|---|---|---|:-:|:-:|:-:|:-:|
| 1 | `dashboard` | Reports | ✅ | — | — | — |
| 2 | `projecao` | Reports | ✅ | — | — | — |
| 3 | `consolidado` | Reports | ✅ | — | — | — |
| 4 | `caixa` | Conciliação de Caixa | ✅ | ✅ | ✅ | ✅ |
| 5 | `fechamento` | Conciliação de Caixa | ✅ | ✅ | — | — |
| 6 | `balancodia` | Reports | ✅ | — | — | — |
| 7 | `dre` | Reports | ✅ | — | — | — |
| 8 | `fluxocaixa` | Reports | ✅ | — | — | — |
| 9 | `medicao` | Reports | ✅ | — | — | — |
| 10 | `resumo` | Reports | ✅ | — | — | — |
| 11 | `unidades` | Receitas | ✅ | ✅ | ✅ | ✅ |
| 12 | `budget` | Planejamento | ✅ | — | ✅ | — |
| 13 | `forecast` | Planejamento | ✅ | ✅ | ✅ | — |
| 14 | `clientes` | Receitas | ✅ | ✅ | ✅ | ✅ |
| 15 | `contasreceber` | Receitas | ✅ | ✅ | ✅ | ✅ |
| 16 | `medicaolanc` | Despesas | ✅ | ✅ | ✅ | ✅ |
| 17 | `simulador` | Receitas | ✅ | — | — | — |
| 18 | `reembolso` | Receitas | ✅ | ✅ | — | — |
| 19 | `permuta` | Receitas | ✅ | ✅ | — | — |
| 20 | `parametros` | Receitas | ✅ | — | ✅ | — |
| 21 | `despesas` | Despesas | ✅ | ✅ | ✅ | ✅ |
| 22 | `contaspagar` | Despesas | ✅ | — | — | — |
| 23 | `restituicoes` | Despesas | ✅ | ✅ | ✅ | ✅ |
| 24 | `fornecedores` | Despesas | ✅ | ✅ | ✅ | ✅ |
| 25 | `planocontas` | Planejamento | ✅ | ✅ | ✅ | ✅ |
| 26 | `contas` | Despesas | ✅ | ✅ | ✅ | ✅ |
| 27 | `estoque` | Despesas | ✅ | ✅ | — | ✅ |
| 28 | `ponto` | Despesas | ✅ | ✅ | ✅ | — |
| 29 | `backup` | Backup | ✅ | — | — | — |
| 30 | `usuarios` | Config | ✅ | ✅ | ✅ | ✅ |
| 31 | `acessos` | Config | ✅ | — | ✅ | — |
| 32 | `acoes` | Config | ✅ | — | — | — |
| 33 | `contabilidade` | Config | ✅ | — | — | — |
| 34 | `empresa` | Config | ✅ | — | ✅ | — |
| 35 | `projeto` | Config | ✅ | ✅ | ✅ | ✅ |
| 36 | `numeracao` | Config | ✅ | — | ✅ | — |
| 37 | `versao` | Config | ✅ | ✅ | ✅ | ✅ |
| 38 | `diagnosticoia` | Config | ✅ | — | — | — |

**Total: 38 telas × 4 ações = 152 caixas. 91 são lidas por algum código; 61
NUNCA são consultadas por ninguém** — marcar ou desmarcar essas 61 caixas não
muda comportamento nenhum no sistema.

Quebrando as 61 caixas mortas por ação:

| Ação | Caixas mortas | Telas |
|---|---|---|
| `criar` | 19 | `dashboard`, `projecao`, `consolidado`, `balancodia`, `dre`, `fluxocaixa`, `medicao`, `resumo`, `budget`, `simulador`, `parametros`, `contaspagar`, `backup`, `acessos`, `acoes`, `contabilidade`, `empresa`, `numeracao`, `diagnosticoia` |
| `editar` | 18 | `dashboard`, `projecao`, `consolidado`, `fechamento`, `balancodia`, `dre`, `fluxocaixa`, `medicao`, `resumo`, `simulador`, `reembolso`, `permuta`, `contaspagar`, `estoque`, `backup`, `acoes`, `contabilidade`, `diagnosticoia` |
| `excluir` | 24 | `dashboard`, `projecao`, `consolidado`, `fechamento`, `balancodia`, `dre`, `fluxocaixa`, `medicao`, `resumo`, `budget`, `forecast`, `simulador`, `reembolso`, `permuta`, `parametros`, `contaspagar`, `ponto`, `backup`, `acessos`, `acoes`, `contabilidade`, `empresa`, `numeracao`, `diagnosticoia` |
| `ver` | 0 | — (lida centralmente para as 38) |

As **seis chamadas com tela dinâmica**, que resolvi manualmente e incluí na
tabela acima:

| Local | Expressão | Resolve para |
|---|---|---|
| `src/app/(app)/layout.tsx:95` | `can(ctx.perms, screenId, "ver")` | qualquer tela de `SCREENS` → **`ver` das 38** |
| `src/components/app/sidebar.tsx:160` | `can(perms, it.perm ?? href, "ver")` | `ver` das telas do menu, mais `despesas`/`unidades` para `/acerto` e `/diagnostico` |
| `src/lib/actions/units.ts:33` | `can(ctx.perms, "unidades", input.id ? "editar" : "criar")` | `unidades:editar` **e** `unidades:criar` |
| `src/lib/actions/planning.ts:45`, `:331` | `can(ctx.perms, screen, "editar")` com `screen = screenOf(version.kind)` | `budget:editar` ou `forecast:editar` |
| `src/lib/actions/budget.ts:60`, `:226`, `:469` | `can(ctx.perms, kind, "editar")` | idem |
| `src/components/app/lancamento-screen.tsx:22` | `can(ctx.perms, kind, "editar")` | idem |
| `src/app/(app)/lancamento/export/route.ts:29` | `can(ctx.perms, version.kind, "ver")` | `budget:ver` ou `forecast:ver` |
| `src/lib/agent/auth.ts:219` | `can(id.perms, screenId, action)` — `requireScreen` | as 4 rotas do agente, todas com a ação default `"ver"`: `projeto`, `unidades`, `contasreceber`, `contaspagar` |

E `screenOf`, que faz a ponte entre tipo de versão e tela
(`planning.ts:19–21`):

```ts
function screenOf(kind: string): "budget" | "forecast" | null {
  return kind === "budget" ? "budget" : kind === "forecast" ? "forecast" : null;
}
```

Duas assimetrias visíveis na tabela:

- **`budget:criar` não é lido; `forecast:criar` é** (`forecast/page.tsx:54`,
  `planning.ts:186`, `:257`). Faz sentido no fluxo — um Forecast nasce a
  partir de um Budget —, mas a caixa "Criar" da linha Budget existe na matriz
  e não governa nada.
- **`estoque:editar` não é lido**, embora `estoque:criar` e `estoque:excluir`
  sejam (`estoque/page.tsx:86–87`, `actions/estoque.ts:22`, `:48`, `:89`).

### c) As telas de leitura têm alguma action que consulte criar, editar ou excluir?

**Não. Nenhuma das sete.** Extraindo as linhas da tabela de (b):

| Tela | ver | criar | editar | excluir | Onde `ver` é conferida |
|---|:-:|:-:|:-:|:-:|---|
| `dre` | ✅ | — | — | — | `layout.tsx:95` + `sidebar.tsx:160` |
| `fluxocaixa` | ✅ | — | — | — | idem |
| `dashboard` | ✅ | — | — | — | idem |
| `resumo` | ✅ | — | — | — | idem |
| `consolidado` | ✅ | — | — | — | idem |
| `balancodia` | ✅ | — | — | — | idem + `balancodia/page.tsx:18` |
| `medicao` | ✅ | — | — | — | `layout.tsx:95` + `sidebar.tsx:160` |

São **21 caixas** (7 telas × 3 ações de escrita) que a matriz desenha,
permite marcar, grava no `jsonb` — e que nenhuma linha de código consulta.
É coerente com a natureza das telas: são relatórios, não têm o que criar,
editar ou excluir. Note que `medicao` (o relatório CEF) é tela de leitura;
quem lança medição é `medicaolanc`, que tem as quatro ações lidas.

Dessas sete, cinco não repetem sequer a checagem de `ver` na própria página —
dependem inteiramente do enforcement central do layout. As exceções são
`balancodia` (`balancodia/page.tsx:18`) e, fora dessa lista, várias outras telas que
repetem.

### d) Para um owner, marcar ou desmarcar uma caixa tem efeito?

**Pela tela, não — a matriz bloqueia. Pelo modelo de dados, teria.**

`defaultPermissions`, inteira (`permissions.ts:95–112`):

```ts
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
```

Owner e admin recebem `{...FULL}` em **todas** as telas (linhas 99–100).

O que a tela faz com isso (`access-matrix.tsx:110–111`):

```tsx
  const ownerFull = member.role === "owner"; // owner sempre total
  const editable = canEdit && !ownerFull;
```

Três consequências, todas no cliente:

1. Os checkboxes ficam `disabled` e aparecem sempre marcados —
   `checked={ownerFull ? true : perms[s.id]?.[a.key] ?? false}`
   (`access-matrix.tsx:203`, `:209`).
2. `toggle` sai na primeira linha: `if (!editable) return;`
   (`access-matrix.tsx:126`).
3. O botão "Salvar" nem é renderizado, e no lugar do bloco de status aparece
   o selo `owner — acesso total` (`access-matrix.tsx:155–156`).

**Mas o bloqueio é só da interface.** `setMemberPermissions` não tem nenhuma
verificação de papel do alvo (código inteiro na seção 4) e
`effectivePermissions` aplica o override por cima do `FULL` sem exceção
(`permissions.ts:121–124`). Rodando a lógica do módulo com um override
restritivo sobre um owner:

```
can(defaultPermissions("owner"),                       "dre", "ver")  →  true
can(effectivePermissions("owner", {dre: {…tudo false}}), "dre", "ver")  →  false
```

Ou seja: **se o jsonb de um owner contiver um override restritivo — gravado
por outra via, por um estado anterior da tela, ou direto no banco —, ele vale.**
"Owner sempre total" é uma regra do componente React, não do módulo de
permissões. Reciprocamente, um owner que já tenha overrides salvos de quando
era admin carrega esses overrides; a tela mostra tudo marcado e não permite
corrigir, porque o formulário está desabilitado.

O `admin` não recebe esse tratamento: tem `FULL` por default, mas a matriz o
deixa editável — dá para rebaixar um admin caixa a caixa.

### e) A matriz salva a cada clique ou tem botão de salvar?

**Botão de salvar.** O `toggle` só mexe no estado local; nada vai ao servidor
até o clique em "Salvar". O comentário acima da função explica o porquê
(`access-matrix.tsx:113–123`):

```tsx
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
```

E o `toggle`, que é puramente local (`access-matrix.tsx:125–141`):

```tsx
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
```

Detalhes do comportamento:

- **`ver` é pré-requisito.** Desmarcar "Ver" zera Criar/Editar/Excluir da mesma
  tela (linhas 134–135); marcar qualquer uma das três liga "Ver"
  automaticamente (linhas 136–137). A regra vive **só aqui, no cliente** — a
  action aceita `{ver:false, editar:true}` sem reclamar.
- **Não há confirmação nem diff na tela.** O estado é sinalizado por três
  textos mutuamente exclusivos: "Salvando…", "Salvo." ou "Alterações não
  salvas" (`:159–167`).
- **`save` ignora cliques sem alteração:** `if (!editable || !dirty) return;`
  (`:116`), e o botão fica `disabled={!dirty || pending}` (`:169`).
- **O erro não é tratado.** `setMemberPermissions` devolve `void` e, quando
  falta permissão, faz `return` silencioso (`users.ts:112`). A tela marca
  `setDirty(false); setSaved(true)` de qualquer jeito (`:120–121`) — ou seja,
  **mostra "Salvo." mesmo quando o servidor não gravou nada.**
- **Sem `router.refresh()`.** A página não é revalidada no cliente; a action
  chama `revalidatePath("/usuarios")` — e **não** `/acessos`
  (`users.ts:130`). Recarregar `/acessos` pode servir a versão anterior do
  cache.

### f) Os módulos da matriz saem de onde? Têm relação com o menu?

**Saem de uma lista própria do componente**, não diretamente de `SCREENS` —
embora o agrupamento das linhas use, sim, o campo `modulo` de cada tela.

A lista de módulos da matriz (`access-matrix.tsx:29–40`):

```tsx
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
```

E o agrupamento (`access-matrix.tsx:143–146`):

```tsx
  const grouped = useMemo(
    () => MODULOS.map((mod) => ({ mod, screens: SCREENS.filter((s) => s.modulo === mod) })),
    [],
  );
```

Então há **três listas de módulos** no repositório, e nenhuma deriva da outra:

| Lista | Onde | Itens |
|---|---|---|
| O tipo `Modulo` | `permissions.ts:19–26` | 7: Planejamento, Receitas, Despesas, Conciliação de Caixa, Reports, Backup, Config |
| A ordem da matriz | `access-matrix.tsx:29–40` | os mesmos 7, em **outra ordem** (Config antes de Backup) |
| As seções da sidebar | `sidebar.tsx:65–151` | **9**, com nomes diferentes |

Os nomes das seções do menu (`sidebar.tsx`, campo `title`):
"Módulo Planejamento", "Módulo Receitas", "Módulo Despesas",
**"Módulo Estoque"**, **"Controle de Ponto"**, "Conciliação de Caixa",
**"Reports & Dashboards"**, "Config", "Backup".

**Relação com o menu: só de intenção.** O comentário da lista diz que "a ordem
espelha o menu lateral" (`access-matrix.tsx:30`), e o mesmo comentário registra
que "Planejamento" já esteve faltando — as telas de Budget, Forecast e Plano de
Contas não apareciam na matriz e não havia como conceder ou revogar acesso a
elas por ali. As divergências que restam:

- **Estoque** e **Ponto** têm seção própria no menu, mas em `SCREENS` são
  `modulo: "Despesas"` — na matriz aparecem dentro de Despesas.
- **"Reports"** na matriz vs **"Reports & Dashboards"** no menu.
- A ordem difere no fim: matriz faz Config → Backup; o menu faz Config →
  Backup também, mas a `Modulo` do tipo declara Backup antes de Config.
- O menu tem itens que **não** são telas de `SCREENS` (`/acerto`,
  `/diagnostico/...`), governados por `perm:` (`sidebar.tsx:19`); a matriz não
  os mostra.
- `versao` (Configuração da Versão) está em `SCREENS` e **não tem item no
  menu** — aparece na matriz, mas não há link para a tela na barra lateral.

O acoplamento real entre os dois é apenas o `can(..., "ver")` do filtro do menu
(`sidebar.tsx:155–163`):

```tsx
  // Mostra só os itens com permissão de "Ver"; oculta seções vazias.
  const sections = allSections
    .map((s) => ({
      ...s,
      items: s.items.filter((it) =>
        can(perms, it.perm ?? it.href.replace(/^\//, ""), "ver"),
      ),
    }))
    .filter((s) => s.items.length > 0);
```

Um módulo de cor (`MODULE_NEON`, `sidebar.tsx:30–40`) é uma quarta lista,
chaveada pelo `title` da seção — mais um lugar a editar quando um módulo nasce.

### g) Override de tela que deixa de existir? E tela nova sem override?

**Tela removida de `SCREENS`:** o override vira letra morta, e é apagado no
próximo salvamento.

`effectivePermissions` itera `for (const s of SCREENS)` (`permissions.ts:121`),
então uma chave órfã **nunca é lida** e **não aparece** no resultado. Rodando a
lógica do módulo:

```
eff = effectivePermissions("membro", { telaquenaoexiste: {ver:true, …} })
Object.keys(eff).includes("telaquenaoexiste")  →  false
can(eff, "telaquenaoexiste", "ver")            →  false
```

A chave continua gravada no `jsonb` — ninguém a remove do banco — mas é
ignorada em toda leitura. E como `MemberMatrix` reconstrói o estado a partir de
`SCREENS` (`access-matrix.tsx:102–106`):

```tsx
  const [perms, setPerms] = useState<PermMatrix>(() =>
    Object.fromEntries(
      SCREENS.map((s) => [s.id, { ...(member.perms[s.id] ?? { ver: false, criar: false, editar: false, excluir: false }) }]),
    ),
  );
```

…o próximo "Salvar" grava um objeto com **exatamente as chaves de `SCREENS`**,
e a chave órfã some do banco em silêncio. Se a tela voltar a `SCREENS` depois
disso, o override antigo já não existe.

Vale notar o efeito inverso, que é o mesmo mecanismo: uma tela **removida** de
`SCREENS` também some do enforcement central, porque `screenIdOfPath` devolve
`null` para ela (`permissions.ts:141`) — a rota, se continuar existindo, fica
sem barreira, como hoje acontece com `/acerto` e `/diagnostico`.

**Tela nova, sem override:** cai no default do papel. `effectivePermissions`
só mescla `if (o)` (`permissions.ts:122–123`), e `o` é `undefined`. Resultado
por papel, para uma tela nova:

| Papel | Tela nova com `modulo` ≠ Config | Tela nova com `modulo: "Config"` |
|---|---|---|
| `owner` | FULL | FULL |
| `admin` | FULL | FULL |
| `membro` | **EDIT** (ver/criar/editar) | NONE |
| `contador` | NONE (não está em `CONTADOR_VE`) | NONE |
| `engenheiro` | NONE (id ≠ `medicaolanc`) | NONE |

Ou seja, uma tela nova fora de Config **nasce liberada para todo `membro`**,
inclusive para quem já tem uma matriz salva — porque a ausência de chave
devolve o default, não `false`. Para `contador` e `engenheiro` nasce negada.
O comentário da sidebar afirma que "módulo novo nasceria negado para todos os
papéis já configurados" (`sidebar.tsx:17`); isso vale para contador e
engenheiro, mas **não** para `membro`, que recebe EDIT automaticamente.

Um efeito colateral de (e) + (g) juntos: como o "Salvar" grava as 38 chaves
com booleanos explícitos, **depois do primeiro salvamento o papel do membro
deixa de influenciar qualquer tela existente** — todo default fica sombreado
por um override. O papel só volta a importar para telas que forem acrescentadas
a `SCREENS` depois.

### h) Existe recorte por projeto — ver só determinada obra?

**Não existe. Confirmado por busca.**

- `src/lib/permissions.ts` não menciona projeto: o modelo é
  `PermMatrix = Record<string, ScreenPerm>` (`permissions.ts:17`), chaveado por
  **tela**, e `ScreenPerm` tem só os quatro booleanos (`:11–16`). Não há
  dimensão de projeto, obra ou versão.
- `membership` não tem `project_id` (tabela inteira na seção 5) — a PK é
  `(user_id, tenant_id)`.
- Grep por `projectId` em `permissions.ts`, `actions/users.ts` e
  `access-matrix.tsx`: **zero ocorrências**.
- Grep no `src/` inteiro por `projectPerm`, `perProject`, `obrasPermitidas`,
  `allowedProjects` e variações de "permissão por projeto": **zero**.

O que existe no lugar: `getActiveContext` carrega **todos** os projetos do
tenant, sem filtro de usuário (`context.ts:72–77`):

```ts
  const projects = await db
    .select()
    .from(schema.projects)
    .where(eq(schema.projects.tenantId, tenant.id))
    .orderBy(asc(schema.projects.createdAt));
  if (projects.length === 0) return null;
```

Esses projetos alimentam o seletor de obra. Portanto **quem enxerga uma tela
enxerga essa tela para qualquer obra do tenant** — a granularidade máxima do
sistema é tela × ação, e o escopo é sempre o tenant inteiro.

### i) A action grava a matriz inteira ou só o que mudou? Há validação de chaves?

**Grava a matriz inteira, e não valida nada.** O `set` é
(`users.ts:113–121`, colado na seção 4):

```ts
  await db
    .update(schema.memberships)
    .set({ permissions })
    .where(
      and(
        eq(schema.memberships.userId, userId),
        eq(schema.memberships.tenantId, ctx.tenant.id),
      ),
    );
```

O que vai para o `jsonb` é o parâmetro `permissions` **como recebido**, sem
filtro, sem normalização e sem merge com o que já estava gravado — é
substituição total da coluna.

Quem monta esse objeto é o cliente. `MemberMatrix` inicializa o estado com
**uma chave por tela de `SCREENS`** (`access-matrix.tsx:102–106`) e envia
`perms` inteiro (`:119`). Então, na prática, o que chega ao banco é um objeto
com **38 chaves**, cada uma com os quatro booleanos — inclusive as telas que o
admin nem tocou, e inclusive as ações que ninguém lê (as 61 caixas de (b)).

**Validação: nenhuma.** A action:

- não confere que as chaves pertencem a `SCREENS` — o tipo `PermMatrix` é
  `Record<string, ScreenPerm>`, que aceita qualquer string, e TypeScript some
  em tempo de execução;
- não confere que os valores são booleanos;
- não aplica a regra "ver é pré-requisito" que a tela aplica
  (`access-matrix.tsx:133–137`) — um payload com
  `{ver:false, excluir:true}` é gravado como está, e `can(…, "excluir")`
  devolveria `true` com `ver` negado;
- não verifica o papel do alvo (ver (d));
- não verifica se o alvo é membro do tenant **antes** — mas o `where` cobre
  isso: um `userId` de outro tenant simplesmente não casa nenhuma linha e o
  update não afeta nada.

Chaves fora de `SCREENS` são aceitas pelo Postgres e ignoradas por
`effectivePermissions` (ver (g)) — inertes, mas ocupando a coluna até o
próximo salvamento pela tela.

### j) A action verifica permissão no servidor? Quem concede? Pode conceder a si mesmo?

**Verifica, na primeira linha** (`users.ts:111–112`):

```ts
  const ctx = await getActiveContext();
  if (!ctx || !can(ctx.perms, "acessos", "editar")) return;
```

A chave é **`acessos:editar`** — não `usuarios`. É a mesma que a página usa
para decidir se a matriz é editável (`acessos/page.tsx:14`).

Duas observações sobre essa guarda:

1. **Falha em silêncio.** É `return`, não `throw` nem
   `{ok:false}` — combinado com o `setSaved(true)` incondicional da tela
   (`access-matrix.tsx:120–121`), quem não tem permissão e forjar a chamada vê
   "Salvo." sem que nada tenha sido gravado.
2. **`ver` não é exigido.** Quem tiver `acessos:editar` sem `acessos:ver` não
   consegue abrir a página (o layout barra, `layout.tsx:95`), mas a action
   aceita a chamada.

**Quem concede:** por default, `owner` e `admin` — são os únicos papéis com
`FULL` em toda tela (`permissions.ts:99–100`), e `acessos` é `modulo: "Config"`,
que dá `NONE` a `membro` (`:101–102`), `NONE` a `engenheiro` (`:103–105`) e
`NONE` a `contador` (não está em `CONTADOR_VE`, `:84–93`).

**Pode conceder a si mesmo? Sim.** Não há nenhuma comparação entre `userId` e
`ctx.userId` em `setMemberPermissions` — compare com `removeMember`, que tem
`if (userId === ctx.userId) return {ok:false, …}` (`users.ts:253–254`). Aqui
não há equivalente. Quem tem `acessos:editar` pode:

- editar a própria linha na matriz (ela aparece na lista de membros como
  qualquer outra, `access-matrix.tsx:56–78`) e **marcar qualquer caixa para si
  mesmo**, inclusive `usuarios:editar`, que por sua vez permite trocar papéis
  e se promover a `owner`;
- ou **se auto-revogar** `acessos:editar`, perdendo o acesso à tela sem
  desfazer — se for o último com essa permissão, só um outro `owner`/`admin`
  ou uma alteração direta no banco reverte.

O único freio é o caso do owner (d): a matriz não deixa editar a linha de quem
já é `owner` — o que na prática impede um owner de se auto-restringir pela
tela, mas não impede um admin de se auto-ampliar.

### k) `logAudit` grava valor anterior e novo?

**Não. Grava só o valor novo**, e sem envelope — a matriz inteira vai crua no
`meta` (`users.ts:122–129`):

```ts
  await logAudit({
    tenantId: ctx.tenant.id,
    userId: ctx.userId,
    action: "membership.permissions",
    entity: "membership",
    entityId: userId,
    meta: permissions,
  });
```

| Campo | Valor |
|---|---|
| `action` | `"membership.permissions"` |
| `entity` | `"membership"` |
| `entityId` | o `userId` do membro alterado |
| `meta` | **o objeto `permissions` inteiro**, direto — não `{ before, after }`, não `{ changes }` |
| `tenantId` / `userId` | tenant ativo e quem executou |

Note que o `meta` recebe `permissions` **sem chave envolvente**: enquanto
`/empresa` grava `meta: { changes: diffAudit(antes, valores) }` e `/usuarios`
grava `meta: { role }`, aqui o JSON do log é a própria matriz —
`{"dashboard":{"ver":true,…},"projecao":{…},…}` com 38 chaves. Quem ler o log
não distingue, de uma entrada, o que mudou: precisa comparar duas entradas
consecutivas do mesmo membro.

A action **não lê o estado anterior** em momento nenhum — não há `select` antes
do `update` (código inteiro na seção 4). O dado anterior está disponível no
banco e é descartado.

O log também não registra **quem era o alvo por nome ou e-mail** — só o
`entityId`. Se o `user` for apagado, o `audit_log.user_id` (que é quem
executou) vira `NULL` por `ON DELETE set null`, mas o `entity_id` é `text` sem
FK e sobrevive como string solta.

Finalmente, a action grava log **mesmo quando nada mudou**: salvar a matriz sem
alterar caixa alguma é impedido pela tela (`dirty`), mas uma chamada direta
gera entrada. E grava log **depois** do update, sem transação — se o `logAudit`
falhar, a permissão já está gravada sem registro.

### l) Há `tenant_id` no `where` de cada consulta e de cada update?

**Sim, nas duas operações da tela.**

| Operação | Arquivo:linha | `where` | Filtra por tenant? |
|---|---|---|---|
| Leitura dos membros (`getMembers`) | `queries.ts:1483–1486` | `eq(memberships.tenantId, tenantId)` | ✅ |
| Update da matriz (`setMemberPermissions`) | `users.ts:116–120` | `and(eq(memberships.userId, userId), eq(memberships.tenantId, ctx.tenant.id))` | ✅ |
| `logAudit` (insert) | `audit.ts:15–22` | `tenantId: entry.tenantId` | ✅ (é insert) |

O `tenantId` passado a `getMembers` vem de `ctx.tenant.id`
(`acessos/page.tsx:13`), e `ctx.tenant` é resolvido pela sessão → usuário →
membership (`context.ts:42–70`). Nenhuma das duas aceita `tenantId` por
parâmetro do cliente.

O duplo filtro no update é o que impede alterar as permissões de um membro de
outro tenant mesmo sabendo o `userId`: o par `(userId, tenantId)` é a PK da
tabela (`schema.ts:170`), então o `where` casa no máximo uma linha, e ela é
necessariamente deste tenant. Um `userId` de outro tenant resulta em zero linhas
afetadas — silenciosamente, já que a action não checa o resultado do update nem
retorna nada.

O único ponto do módulo que **não** é filtrado por tenant é a leitura de
`effectivePermissions` na página (`acessos/page.tsx:21`), mas ela opera sobre
os dados que `getMembers` já trouxe filtrados — é computação pura, sem acesso
ao banco.
