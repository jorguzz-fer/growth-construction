# Tela — Usuários & Acessos (`/usuarios`)

Coleta de código, sem análise. Cada arquivo aparece com o caminho como
cabeçalho. Trechos parciais trazem a faixa de linhas no título do bloco.

Base: branch `claude/contexto-revisao`.

---

## 1. A página

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

---

## 2. Componentes próprios que a página importa (recursivamente)

```
src/app/(app)/usuarios/page.tsx
├── next/link                        → Link
├── @/lib/context                    → getActiveContext, Role
├── @/lib/permissions                → can
├── @/lib/queries                    → getMembers                        (seção 3)
├── @/lib/actions/users              → inviteMember                      (seção 3)
├── @/components/app/page-header     → PageHeader
├── @/components/ui/card             → Card, CardContent
├── @/components/ui/button           → Button
├── @/components/ui/input            → Input, Label, Select
├── @/components/ui/password-input   → PasswordInput      ("use client")
├── @/components/ui/badge            → Badge
├── @/components/ui/table            → Table, THead, TH, TR, TD
├── @/components/app/role-select     → RoleSelect         ("use client")
│   └── @/lib/actions/users          → changeRole                        (seção 3)
└── @/components/app/member-actions  → MemberActions      ("use client")
    ├── @/lib/actions/users          → removeMember, resetMemberPassword,
    │                                  updateMemberName                  (seção 3)
    ├── @/components/ui/button       → Button
    ├── @/components/ui/input        → Input
    └── @/components/ui/password-input → PasswordInput
```

Três componentes `"use client"`: `PasswordInput`, `RoleSelect` e
`MemberActions`. O formulário "Novo usuário" é HTML puro com
`action={inviteMember}`.

### `src/components/app/role-select.tsx`

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

### `src/components/app/member-actions.tsx`

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

### `src/components/ui/password-input.tsx`

```tsx
"use client";

import * as React from "react";
import { Eye, EyeOff } from "lucide-react";
import { cn } from "@/lib/utils";

export interface PasswordInputProps
  extends Omit<React.InputHTMLAttributes<HTMLInputElement>, "type"> {
  /** classes do botão de olho (ajuste de cor por tema, ex.: dark). */
  iconClassName?: string;
}

/**
 * Campo de senha com toggle mostrar/ocultar (ícone de olho). Serve tanto para
 * uso controlado quanto em formulários (basta passar `name`).
 */
export const PasswordInput = React.forwardRef<
  HTMLInputElement,
  PasswordInputProps
>(({ className, iconClassName, ...props }, ref) => {
  const [show, setShow] = React.useState(false);
  return (
    <div className="relative">
      <input
        ref={ref}
        type={show ? "text" : "password"}
        className={cn(
          "h-9 w-full rounded-[8px] border border-[var(--color-accent2)]/20 bg-white px-3 pr-10 text-sm text-[var(--color-ink)] outline-none transition-colors placeholder:text-[var(--color-ink4)] focus:border-[var(--color-accent2)] focus:ring-2 focus:ring-[var(--color-accent2)]/20",
          className,
        )}
        {...props}
      />
      <button
        type="button"
        tabIndex={-1}
        onClick={() => setShow((s) => !s)}
        aria-label={show ? "Ocultar senha" : "Mostrar senha"}
        title={show ? "Ocultar senha" : "Mostrar senha"}
        className={cn(
          "absolute inset-y-0 right-0 flex w-10 items-center justify-center text-[var(--color-ink3)] transition-colors hover:text-[var(--color-ink)]",
          iconClassName,
        )}
      >
        {show ? (
          <EyeOff className="h-4 w-4" aria-hidden />
        ) : (
          <Eye className="h-4 w-4" aria-hidden />
        )}
      </button>
    </div>
  );
});
PasswordInput.displayName = "PasswordInput";
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

---

## 3. Server Actions da tela, na íntegra

Todas vivem no mesmo arquivo. Mapa das cinco operações que a tela oferece:

| Operação na tela | Função | Linhas | Permissão | Retorno |
|---|---|---|---|---|
| Adicionar | `inviteMember` → `invite` | 98–100 / 37–96 | `usuarios:criar` | `void` |
| Trocar papel | `changeRole` | 133–176 | `usuarios:editar` | `{ok, error?}` |
| Editar nome | `updateMemberName` | 179–200 | `usuarios:editar` | `{ok, error?}` |
| Definir senha | `resetMemberPassword` | 206–242 | `usuarios:editar` | `{ok, error?}` |
| Remover | `removeMember` | 249–288 | `usuarios:excluir` | `{ok, error?}` |

O mesmo arquivo exporta mais duas que **não** são da tela `/usuarios`:
`inviteContador` (102–104, usada em `/contabilidade`) e `setMemberPermissions`
(107–131, usada em `/acessos` — ver a pergunta (n)).

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

### `src/lib/queries.ts:1461–1491` — `MemberRow` e `getMembers`

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

### `src/lib/password.ts` — o hash usado por todas as actions de senha

```ts
import { scryptSync, randomBytes, timingSafeEqual } from "node:crypto";

/**
 * Hash/verificação de senha com scrypt (sem dependências externas).
 * Formato armazenado: "saltHex:hashHex".
 */
export function hashPassword(password: string): string {
  const salt = randomBytes(16);
  const hash = scryptSync(password, salt, 64);
  return `${salt.toString("hex")}:${hash.toString("hex")}`;
}

export function verifyPassword(password: string, stored: string): boolean {
  const [saltHex, hashHex] = stored.split(":");
  if (!saltHex || !hashHex) return false;
  const hash = Buffer.from(hashHex, "hex");
  const test = scryptSync(password, Buffer.from(saltHex, "hex"), 64);
  return hash.length === test.length && timingSafeEqual(hash, test);
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

### `src/lib/permissions.ts:115–142` — como `role` e `permissions` se combinam

```ts
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

## 4. Tabelas de usuário, vínculo e sessão

### `src/lib/db/schema.ts:29–93` — o enum de papéis e as quatro tabelas do Auth.js

```ts
/** Papéis de acesso do tenant (ver docs/STACK.md §2 - Autenticação). */
export const roleEnum = pgEnum("role", [
  "owner",
  "admin",
  "membro",
  "contador", // somente leitura (acesso contabilidade)
  "engenheiro", // acesso apenas ao Lançamento de Medição
]);

// ───────────────────────────── Auth.js ──────────────────────────────

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

export const accounts = pgTable(
  "account",
  {
    userId: text("userId")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    type: text("type").$type<AdapterAccountType>().notNull(),
    provider: text("provider").notNull(),
    providerAccountId: text("providerAccountId").notNull(),
    refresh_token: text("refresh_token"),
    access_token: text("access_token"),
    expires_at: integer("expires_at"),
    token_type: text("token_type"),
    scope: text("scope"),
    id_token: text("id_token"),
    session_state: text("session_state"),
  },
  (account) => [
    primaryKey({ columns: [account.provider, account.providerAccountId] }),
  ],
);

export const sessions = pgTable("session", {
  sessionToken: text("sessionToken").primaryKey(),
  userId: text("userId")
    .notNull()
    .references(() => users.id, { onDelete: "cascade" }),
  expires: timestamp("expires", { mode: "date" }).notNull(),
});

export const verificationTokens = pgTable(
  "verificationToken",
  {
    identifier: text("identifier").notNull(),
    token: text("token").notNull(),
    expires: timestamp("expires", { mode: "date" }).notNull(),
  },
  (vt) => [primaryKey({ columns: [vt.identifier, vt.token] })],
);
```

### `src/lib/db/schema.ts:149–171` — `membership`

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

### `src/lib/db/schema.ts:1302–1320` — `audit_log`

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

### Índices, constraints e chaves — conferidos no snapshot `meta/0038_snapshot.json`

```
TABLE public.user
  indexes: {}
  uniques: {"user_email_unique": {"columns": ["email"], "nullsNotDistinct": false}}
  compositePK: {}
  (sem foreign keys — é a tabela raiz)

TABLE public.membership
  indexes: {}
  uniques: {}
  compositePK: {"membership_user_id_tenant_id_pk": ["user_id", "tenant_id"]}
  FK ['user_id']   -> user   ['id'] ON DELETE cascade
  FK ['tenant_id'] -> tenant ['id'] ON DELETE cascade

TABLE public.account
  indexes: {}
  uniques: {}
  compositePK: {"account_provider_providerAccountId_pk": ["provider", "providerAccountId"]}
  FK ['userId'] -> user ['id'] ON DELETE cascade

TABLE public.session
  indexes: {}
  uniques: {}
  compositePK: {}   (PK simples em sessionToken)
  FK ['userId'] -> user ['id'] ON DELETE cascade

TABLE public.verificationToken
  indexes: {}
  uniques: {}
  compositePK: {"verificationToken_identifier_token_pk": ["identifier", "token"]}
  (sem foreign keys)

TABLE public.audit_log
  indexes: {}
  uniques: {}
  compositePK: {}
  FK ['tenant_id'] -> tenant ['id'] ON DELETE cascade
  FK ['user_id']   -> user   ['id'] ON DELETE set null
```

**Nenhuma das seis tabelas tem índice secundário.** A única constraint de
unicidade em `user` é o e-mail (`user_email_unique`, declarada por
`.unique()` em `schema.ts:45`). `membership` tem chave primária composta
`(user_id, tenant_id)` — é ela que garante um vínculo por par usuário/tenant e
que serve de `target` no `onConflictDoUpdate` do convite
(`users.ts:81–84`).

### Todas as referências a `user.id` no schema — o mapa de `ON DELETE`

Grep de `=> users.id` em `src/lib/db/schema.ts`, com a tabela de cada linha:

| Tabela | Coluna | Linha | `ON DELETE` |
|---|---|---|---|
| `account` | `userId` | 58–60 | **cascade** |
| `session` | `userId` | 79–81 | **cascade** |
| `membership` | `user_id` | 153–155 | **cascade** |
| `restituicao` | `usuario_id` | 688 | **set null** |
| `repasse` | `usuario_id` | 783 | **set null** |
| `acerto` | `usuario_id` | 844 | **set null** |
| `compensacao` | `usuario_id` | 952 | **set null** |
| `pagamento` | `usuario_id` | 1029 | **set null** |
| `audit_log` | `user_id` | 1311 | **set null** |
| `daily_closing` | `responsavel_id` | 1434–1436 | **set null** |

São **10 FKs** para `user.id`: 3 em cascata (as três tabelas de autenticação) e
7 com `set null` (as tabelas de negócio).

Além dessas, há **quatro colunas de texto que guardam identidade de usuário
SEM foreign key** — não são afetadas por delete algum:

| Tabela | Coluna | Linha | Conteúdo |
|---|---|---|---|
| `time_entry` | `user_id` | 337 | `text("user_id")`, sem `.references` |
| `despesa` | `cancelado_por` | 613 | e-mail ou id, gravado como texto |
| `document` | `uploaded_by` | 1069 | texto livre |
| `conta_receber` | `created_by` | 1272 | texto livre |

E `daily_closing` guarda, além do FK, um `responsavel_nome`
(`schema.ts:1437`) — nome desnormalizado que sobrevive ao `set null`.

---

## 5. A configuração do Auth.js v5

### `src/lib/auth.ts` — a configuração inteira

```ts
import NextAuth from "next-auth";
import Credentials from "next-auth/providers/credentials";
import { DrizzleAdapter } from "@auth/drizzle-adapter";
import { eq } from "drizzle-orm";
import { db } from "@/lib/db";
import { users, accounts, sessions, verificationTokens } from "@/lib/db/schema";
import { verifyPassword } from "@/lib/password";
import { mfaEnforced } from "@/lib/mfa";
import { verifyTotp } from "@/lib/totp";

/*
 * Auth.js (NextAuth v5): login por credenciais (e-mail + senha) com segundo
 * fator TOTP opcional. Sessão por JWT (exigida pelo provider Credentials).
 * Inicialização lazy para o build não depender de env. Ver docs/STACK.md §2.
 */
export const { handlers, signIn, signOut, auth } = NextAuth(() => ({
  adapter: DrizzleAdapter(db, {
    usersTable: users,
    accountsTable: accounts,
    sessionsTable: sessions,
    verificationTokensTable: verificationTokens,
  }),
  session: { strategy: "jwt" },
  pages: { signIn: "/login" },
  providers: [
    Credentials({
      credentials: {
        email: { label: "E-mail", type: "email" },
        password: { label: "Senha", type: "password" },
        totp: { label: "Código MFA", type: "text" },
      },
      authorize: async (creds) => {
        const email = String(creds?.email ?? "").toLowerCase().trim();
        const password = String(creds?.password ?? "");
        if (!email || !password) return null;

        const [u] = await db
          .select()
          .from(users)
          .where(eq(users.email, email))
          .limit(1);
        if (!u || !u.passwordHash) return null;
        if (!verifyPassword(password, u.passwordHash)) return null;

        // Segundo fator — só quando o MFA está sendo exigido (env) e ativo.
        if (mfaEnforced() && u.mfaEnabled) {
          const code = String(creds?.totp ?? "");
          if (!u.mfaSecret || !verifyTotp(u.mfaSecret, code)) return null;
        }
        return { id: u.id, email: u.email, name: u.name };
      },
    }),
  ],
  callbacks: {
    jwt({ token, user }) {
      if (user?.id) (token as { uid?: string }).uid = user.id;
      return token;
    },
    session({ session, token }) {
      const uid = (token as { uid?: string }).uid;
      if (uid && session.user) {
        (session.user as { id?: string }).id = uid;
      }
      return session;
    },
  },
}));
```

### `src/app/api/auth/[...nextauth]/route.ts` — o handler

```ts
import { handlers } from "@/lib/auth";

export const { GET, POST } = handlers;
```

### `src/middleware.ts` — o gate de rota

```ts
import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

/*
 * Gate de autenticação (edge-safe): rotas do app exigem sessão. Faz apenas a
 * checagem de presença do cookie de sessão (redirect de UX); a validação real
 * do usuário/perfil acontece no servidor via getActiveContext().
 */
const PUBLIC_PATHS = ["/", "/login", "/plataforma/login"];

export function middleware(req: NextRequest) {
  const { pathname } = req.nextUrl;

  if (
    PUBLIC_PATHS.includes(pathname) ||
    pathname.startsWith("/api") ||
    pathname.startsWith("/_next")
  ) {
    return NextResponse.next();
  }

  const hasSession =
    req.cookies.has("authjs.session-token") ||
    req.cookies.has("__Secure-authjs.session-token");

  if (!hasSession) {
    const url = req.nextUrl.clone();
    // O backoffice tem entrada própria; usuários do tenant vão ao /login.
    url.pathname = pathname.startsWith("/plataforma")
      ? "/plataforma/login"
      : "/login";
    if (!pathname.startsWith("/plataforma"))
      url.searchParams.set("callbackUrl", pathname);
    return NextResponse.redirect(url);
  }

  // Expõe o pathname para o layout aplicar o controle de "Ver" por tela.
  const headers = new Headers(req.headers);
  headers.set("x-pathname", pathname);
  return NextResponse.next({ request: { headers } });
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico).*)"],
};
```

### `src/lib/mfa.ts`

```ts
/**
 * Enforcement do MFA (verificação em duas etapas).
 *
 * Controlado pela env `MFA_ENFORCED`:
 *   - "true"  → MFA obrigatório (login exige código; enrollment forçado).
 *   - qualquer outro valor / ausente → MFA em STANDBY (fase de testes):
 *     login é só e-mail+senha e não há enrollment forçado.
 *
 * Reversível sem mudança de código — basta setar/limpar a env no deploy.
 */
export function mfaEnforced(): boolean {
  return process.env.MFA_ENFORCED === "true";
}
```

### `src/lib/totp.ts`

```ts
import * as OTPAuth from "otpauth";
import QRCode from "qrcode";

const ISSUER = "Growth Tools";

/** Gera um novo segredo TOTP em base32. */
export function generateSecret(): string {
  return new OTPAuth.Secret({ size: 20 }).base32;
}

function totp(secretBase32: string, label: string) {
  return new OTPAuth.TOTP({
    issuer: ISSUER,
    label,
    algorithm: "SHA1",
    digits: 6,
    period: 30,
    secret: OTPAuth.Secret.fromBase32(secretBase32),
  });
}

/** otpauth:// URL para apps autenticadores. */
export function otpauthUrl(secretBase32: string, label: string): string {
  return totp(secretBase32, label).toString();
}

/** Data URL (PNG) do QR code para a URL otpauth. */
export async function qrDataUrl(secretBase32: string, label: string): Promise<string> {
  return QRCode.toDataURL(otpauthUrl(secretBase32, label));
}

/** Valida um código TOTP (janela ±1 período). */
export function verifyTotp(secretBase32: string, token: string): boolean {
  if (!token) return false;
  const delta = totp(secretBase32, "verify").validate({
    token: token.replace(/\s/g, ""),
    window: 1,
  });
  return delta !== null;
}
```

### `src/app/(auth)/mfa/page.tsx`

```tsx
import { redirect } from "next/navigation";
import { eq } from "drizzle-orm";
import { db, schema } from "@/lib/db";
import { auth } from "@/lib/auth";
import { getOrCreateMfaSetup } from "@/lib/actions/account";
import { MfaEnroll } from "@/components/auth/mfa-enroll";

export const dynamic = "force-dynamic";

/**
 * Enrollment obrigatório do MFA: quem loga sem verificação em duas etapas
 * ativa cai aqui e só entra no painel depois de ativar (gate no layout do app).
 */
export default async function MfaPage() {
  const session = await auth();
  const email = session?.user?.email?.toLowerCase();
  if (!email) redirect("/login");

  const [user] = await db
    .select({ mfaEnabled: schema.users.mfaEnabled })
    .from(schema.users)
    .where(eq(schema.users.email, email))
    .limit(1);
  if (!user) redirect("/login");
  if (user.mfaEnabled) redirect("/dashboard");

  const setup = await getOrCreateMfaSetup();

  // Marca do tenant (se o vínculo já existir), com fallback do produto.
  const [tenant] = await db
    .select({ name: schema.tenants.name })
    .from(schema.memberships)
    .innerJoin(schema.users, eq(schema.users.id, schema.memberships.userId))
    .innerJoin(schema.tenants, eq(schema.tenants.id, schema.memberships.tenantId))
    .where(eq(schema.users.email, email))
    .limit(1);

  return (
    <MfaEnroll
      qr={setup.qr}
      secret={setup.secret}
      otpauth={setup.otpauth}
      brand={tenant?.name ?? "Growth Tools"}
    />
  );
}
```

### `src/lib/actions/account.ts` — as actions de senha própria e MFA

```ts
"use server";

import { eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { db, schema } from "@/lib/db";
import { auth } from "@/lib/auth";
import { hashPassword, verifyPassword } from "@/lib/password";
import { generateSecret, otpauthUrl, qrDataUrl, verifyTotp } from "@/lib/totp";

async function currentUser() {
  const session = await auth();
  const email = session?.user?.email?.toLowerCase();
  if (!email) return null;
  const [u] = await db
    .select()
    .from(schema.users)
    .where(eq(schema.users.email, email))
    .limit(1);
  return u ?? null;
}

export async function changePassword(formData: FormData) {
  const u = await currentUser();
  if (!u) throw new Error("Não autenticado.");
  const current = String(formData.get("current") ?? "");
  const next = String(formData.get("next") ?? "");
  if (next.length < 8) throw new Error("A nova senha deve ter ao menos 8 caracteres.");
  if (u.passwordHash && !verifyPassword(current, u.passwordHash)) {
    throw new Error("Senha atual incorreta.");
  }
  await db
    .update(schema.users)
    .set({ passwordHash: hashPassword(next) })
    .where(eq(schema.users.id, u.id));
  revalidatePath("/perfil");
}

export interface MfaSetupData {
  qr: string;
  /** segredo base32 para digitação manual. */
  secret: string;
  /** otpauth:// para "Abrir no app autenticador". */
  otpauth: string;
}

/**
 * Retorna os dados de enrollment do MFA para o usuário logado. Reaproveita um
 * segredo pendente (gerado mas ainda não confirmado) para que recarregar a
 * página não invalide o QR já escaneado; gera um novo apenas se não houver.
 */
export async function getOrCreateMfaSetup(): Promise<MfaSetupData> {
  const u = await currentUser();
  if (!u) throw new Error("Não autenticado.");
  let secret = !u.mfaEnabled && u.mfaSecret ? u.mfaSecret : null;
  if (!secret) {
    secret = generateSecret();
    await db
      .update(schema.users)
      .set({ mfaSecret: secret, mfaEnabled: false })
      .where(eq(schema.users.id, u.id));
  }
  const label = u.email ?? "conta";
  return {
    qr: await qrDataUrl(secret, label),
    secret,
    otpauth: otpauthUrl(secret, label),
  };
}

/** Confirma o código e ativa o MFA. */
export async function confirmMfa(formData: FormData) {
  const u = await currentUser();
  if (!u || !u.mfaSecret) throw new Error("Inicie a configuração do MFA primeiro.");
  const code = String(formData.get("code") ?? "");
  if (!verifyTotp(u.mfaSecret, code)) throw new Error("Código inválido.");
  await db
    .update(schema.users)
    .set({ mfaEnabled: true })
    .where(eq(schema.users.id, u.id));
  // Libera o gate do layout (que redireciona p/ /mfa enquanto não ativado).
  revalidatePath("/", "layout");
}

export async function disableMfa() {
  const u = await currentUser();
  if (!u) throw new Error("Não autenticado.");
  await db
    .update(schema.users)
    .set({ mfaEnabled: false, mfaSecret: null })
    .where(eq(schema.users.id, u.id));
  revalidatePath("/perfil");
}
```

### `src/lib/context.ts:42–70` — onde a sessão vira contexto (e permissões)

```ts
export async function getActiveContext(): Promise<ActiveContext | null> {
  const session = await auth();
  const email = session?.user?.email?.toLowerCase();
  if (!email) return null;

  const ck = await cookies();

  const [user] = await db
    .select()
    .from(schema.users)
    .where(eq(schema.users.email, email))
    .limit(1);
  if (!user) return null;

  // Vínculos do usuário (multi-tenant); por ora usa o primeiro tenant.
  const memberships = await db
    .select()
    .from(schema.memberships)
    .where(eq(schema.memberships.userId, user.id))
    .orderBy(asc(schema.memberships.createdAt));
  if (memberships.length === 0) return null;
  const membership = memberships[0];

  const [tenant] = await db
    .select()
    .from(schema.tenants)
    .where(eq(schema.tenants.id, membership.tenantId))
    .limit(1);
  if (!tenant) return null;
```

---

## 6. Perguntas

### a) Como a senha é armazenada? Qual algoritmo e custo?

**scrypt**, da biblioteca padrão do Node, sem dependência externa. O módulo
inteiro está colado na seção 3; o trecho que responde:

```ts
export function hashPassword(password: string): string {
  const salt = randomBytes(16);
  const hash = scryptSync(password, salt, 64);
  return `${salt.toString("hex")}:${hash.toString("hex")}`;
}
```

(`src/lib/password.ts:7–11`)

| Item | Valor |
|---|---|
| Algoritmo | `scryptSync` (`node:crypto`) |
| Salt | 16 bytes aleatórios por senha (`randomBytes(16)`) |
| Tamanho da chave derivada | 64 bytes |
| **Custo (N, r, p)** | **não informado** — usa os defaults do Node: `N = 16384`, `r = 8`, `p = 1`, `maxmem = 32 MiB` |
| Formato gravado | `saltHex:hashHex` numa única coluna `text` (`user.password_hash`) |
| Verificação | `scryptSync` com o salt gravado + `timingSafeEqual` (`password.ts:13–19`) |

Não há parâmetro de custo configurável nem coluna que registre qual custo foi
usado — se os defaults do Node mudarem numa versão futura, as senhas antigas
deixam de validar, porque o hash guardado não carrega os parâmetros.

A comparação usa `timingSafeEqual` (`password.ts:18`), com guarda de tamanho
antes, o que evita vazamento por tempo. O `verifyPassword` devolve `false` sem
exceção quando o formato gravado não tem os dois pedaços (`password.ts:15`).

### b) Existe convite por e-mail, link de definição de senha ou "esqueci a senha"?

**Nenhum dos três.** Grep no `src/` inteiro por `esqueci`, `forgot`,
`recuperar senha`, `resetToken`, `reset.token`, `convite`, `sendInvite` e
`verificationToken` (fora do schema e da config do Auth.js) não devolve
**nenhuma** ocorrência. Também não existe biblioteca de e-mail no projeto —
grep por `nodemailer`, `resend`, `sendMail` não devolve nada.

O próprio docstring da action de convite diz isso (`users.ts:32–36`):

```ts
/**
 * Convida um membro para o tenant: garante o usuário (por e-mail) e cria o
 * vínculo com o papel. Sem envio de e-mail ainda — o registro fica pronto para
 * o fluxo de login do Auth.js. Apenas owner/admin podem convidar.
 */
```

A tabela `verificationToken` existe no schema (`schema.ts:85–93`) porque o
`DrizzleAdapter` do Auth.js a exige na configuração (`auth.ts:21`), mas
**nada no repositório escreve nela** — não há provider de e-mail/magic link
registrado; o único provider é `Credentials` (`auth.ts:26`).

A tela `/login` também não tem link de recuperação: grep por "Esqueci" e
"recuper" em `src/app/(auth)/login/page.tsx` não devolve nada.

**Consequência prática:** o único caminho para um usuário ter senha é um
owner/admin digitá-la — na criação (campo "Senha inicial (opcional)",
`page.tsx:70–77`) ou depois, no botão "Senha" da linha
(`member-actions.tsx:133–139` → `resetMemberPassword`). A senha em claro
trafega do navegador do admin para o servidor e precisa ser comunicada ao
usuário por fora do sistema. Quem esquecer a senha depende de um admin
redefini-la.

### c) O que é "acesso pendente"? Existe coluna de situação?

**Não existe coluna de situação em nenhuma das duas tabelas.** "Acesso
pendente" é uma frase da tela, e o selo correspondente é derivado de
`passwordHash IS NULL`.

O caminho completo:

1. `getMembers` seleciona `passwordHash` e o converte em booleano, sem
   devolver o hash (`queries.ts:1481`, `:1487–1490`):

```ts
  return rows.map(({ passwordHash, ...m }) => ({
    ...m,
    hasPassword: Boolean(passwordHash),
  }));
```

2. O campo se chama `hasPassword` e o comentário do tipo explica o significado
   (`queries.ts:1468–1469`): *"já definiu senha? (senão, ainda não consegue
   logar)"*.

3. A coluna "Acesso" da tabela mostra (`page.tsx:120–122`):

```tsx
                  <Badge tone={m.hasPassword ? "success" : "warning"}>
                    {m.hasPassword ? "ativo" : "sem senha"}
                  </Badge>
```

4. O texto "acesso pendente" aparece só no rodapé do formulário
   (`page.tsx:84–87`): *"Sem senha inicial, o usuário fica com acesso pendente
   até você definir uma senha na tabela abaixo."*

Ou seja: **"ativo" significa apenas "tem hash de senha"**, e "sem senha"
significa "`password_hash` é nulo". Não há estado de convite aceito/pendente,
não há `status`, `ativo`, `bloqueado`, `desativado` nem `deleted_at` — nem em
`user` nem em `membership`. As duas definições estão coladas na seção 4; são
literalmente estas as colunas:

| `user` (`schema.ts:40–53`) | `membership` (`schema.ts:150–171`) |
|---|---|
| `id` (PK, text, uuid gerado) | `user_id` (FK → user, cascade) |
| `name` | `tenant_id` (FK → tenant, cascade) |
| `email` (**unique**) | `role` (enum, default `membro`) |
| `emailVerified` (timestamp) | `permissions` (jsonb, nulável) |
| `image` | `created_at` |
| `password_hash` | PK composta `(user_id, tenant_id)` |
| `mfa_secret` | |
| `mfa_enabled` (bool, default false) | |

`emailVerified` é a única coluna que se pareceria com situação — vem do
adapter do Auth.js e **nada no repositório a lê ou escreve**.

### d) Remover usuário faz DELETE físico? Qual o `ON DELETE` de cada FK?

**A tela nunca apaga o usuário.** `removeMember` apaga só a linha de
`membership`, e o `DELETE` é físico (`users.ts:270–277`):

```ts
  await db
    .delete(schema.memberships)
    .where(
      and(
        eq(schema.memberships.userId, userId),
        eq(schema.memberships.tenantId, ctx.tenant.id),
      ),
    );
```

O docstring é explícito (`users.ts:244–248`): *"Remove o vínculo (membership)
de um membro com o tenant. Não apaga o usuário global (pode pertencer a outros
tenants)."* Não existe em lugar nenhum do repositório um
`db.delete(schema.users)` disparado por esta tela.

O `ON DELETE` completo está na tabela da seção 4. Resumo do que aconteceria
**se** a linha de `user` fosse apagada (o que a tela não faz):

- **cascade** (a linha some junto): `account`, `session`, `membership`.
- **set null** (a linha fica, o vínculo vira nulo): `restituicao.usuario_id`,
  `repasse.usuario_id`, `acerto.usuario_id`, `compensacao.usuario_id`,
  `pagamento.usuario_id`, `audit_log.user_id`, `daily_closing.responsavel_id`.
- **intocadas** (texto sem FK): `time_entry.user_id`, `despesa.cancelado_por`,
  `document.uploaded_by`, `conta_receber.created_by`.

Como a tela só apaga `membership`, **na prática nada disso é acionado**:
nenhuma das sete colunas `set null` é zerada e o histórico continua apontando
para o usuário. O que muda é que `getActiveContext` deixa de encontrar o
vínculo — ver (i).

### e) Depois de remover, o que acontece com o log de auditoria daquele usuário?

**Nada — o log fica intacto.** Duas razões independentes:

1. A remoção não toca `user`, então a FK
   `audit_log.user_id → user.id ON DELETE set null` (`schema.ts:1311`) nem
   chega a ser avaliada. As linhas de log continuam apontando para o usuário
   removido, com nome e e-mail ainda resolvíveis por join.
2. `audit_log` é declarada como append-only (`schema.ts:1303–1304`) e não há
   `delete` sobre ela em nenhum ponto do repositório.

A própria remoção **gera** uma linha de log (`users.ts:278–285`), com
`action = "membership.remove"`, `entity = "membership"`,
`entityId = userId` e `meta = { role }` — o papel que o membro tinha.

Se algum dia o `user` for apagado direto no banco, aí sim `audit_log.user_id`
vira `NULL` e o log perde a autoria — a ação permanece registrada, mas sem
quem a fez. Não há coluna de e-mail ou nome desnormalizado em `audit_log` para
preservar essa informação (compare com `daily_closing`, que guarda
`responsavel_nome` justamente para isso, `schema.ts:1437`).

### f) Existe inativar? O que a operação faz hoje quando alguém sai da empresa?

**Não existe inativar.** Não há coluna de situação (ver (c)), não há action de
suspensão e o único botão destrutivo da tela é "Remover"
(`member-actions.tsx:142–163`).

O que existe hoje, e o que cada opção faz:

| Caminho | Efeito | Reversível? |
|---|---|---|
| **Remover** (`removeMember`) | apaga a linha de `membership`. O usuário perde acesso ao tenant; a conta global continua existindo com a senha antiga | sim — basta convidar de novo, mas os **overrides de permissão se perdem** junto com a linha |
| **Rebaixar o papel** (`changeRole` para `contador`) | mantém o acesso, em leitura, às 8 telas de `CONTADOR_VE` | sim |
| **Redefinir a senha** (`resetMemberPassword`) | troca o hash; o usuário não consegue mais logar com a senha que sabia | sim |

Nenhum deles invalida a sessão já aberta no mesmo instante — ver (i).

Um efeito colateral da remoção que vale registrar: a coluna `permissions`
(jsonb com os overrides granulares de `/acessos`) vive **na linha de
membership**. Remover o membro apaga os overrides; readmiti-lo devolve só os
defaults do papel.

### g) Quais papéis o select oferece? "engenheiro" está entre eles?

**Sim, `engenheiro` está — mas existem DUAS listas diferentes na mesma tela.**

**Lista 1 — formulário "Novo usuário"**, escrita à mão no JSX
(`page.tsx:63–68`), **quatro** opções, sem `owner`:

```tsx
              <div>
                <Label>Papel</Label>
                <Select name="role" defaultValue="membro">
                  <option value="admin">admin</option>
                  <option value="membro">membro</option>
                  <option value="contador">contador</option>
                  <option value="engenheiro">engenheiro</option>
                </Select>
              </div>
```

**Lista 2 — o `<select>` de cada linha da tabela**, em
`role-select.tsx:7`, **cinco** opções, **com** `owner`:

```ts
const ROLES: Role[] = ["owner", "admin", "membro", "contador", "engenheiro"];
```

**Origem de cada uma.** Não há fonte única: são três declarações
independentes do mesmo conjunto.

| Onde | Conteúdo | Papel |
|---|---|---|
| `src/lib/db/schema.ts:30–36` | `roleEnum` do Postgres: `owner`, `admin`, `membro`, `contador`, `engenheiro` | a verdade no banco |
| `src/lib/context.ts:11` | `export type Role = "owner" \| "admin" \| "membro" \| "contador" \| "engenheiro"` | o tipo do TypeScript |
| `src/lib/actions/users.ts:11` | `const ROLES: Role[] = [...]` — 5 itens | o que a action aceita |
| `src/components/app/role-select.tsx:7` | `const ROLES: Role[] = [...]` — 5 itens | o `<select>` da tabela |
| `src/app/(app)/usuarios/page.tsx:63–68` | 4 `<option>` literais | o `<select>` do formulário |

Consequência: **pelo formulário não dá para criar um `owner`; pela tabela dá
para promover qualquer um a `owner`** — e a action aceita, porque
`ROLES.includes(...)` (`users.ts:46`) inclui `owner` e `changeRole` não filtra
o papel de destino. Se o `roleEnum` ganhar um sexto papel, as três listas
precisam ser editadas à mão, e o `<option>` do formulário é a que mais
facilmente fica para trás.

A página também tem um quarto mapa com os mesmos nomes, só para cor de badge
(`page.tsx:18–24`) — usado quando o usuário **não** pode editar.

### h) Trocar papel exige confirmação? Há regra protegendo o último owner?

**Trocar papel não pede confirmação nenhuma.** O `<select>` dispara a action no
próprio `onChange` (`role-select.tsx:27–39`): escolher outro valor já grava. O
componente faz *optimistic update* e só reverte se a action devolver
`ok: false` (`:34–37`). **Remover**, ao contrário, tem `window.confirm`
(`member-actions.tsx:151–158`).

**Sim, existe proteção do último owner — nas duas actions**, e só no servidor.
Em `changeRole` (`users.ts:141–155`):

```ts
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
```

Em `removeMember` (`users.ts:253–268`):

```ts
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
```

E a contagem que as duas usam (`users.ts:18–30`):

```ts
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
```

Quadro das validações, por action:

| Action | Permissão | Auto-alvo | Último owner | Alvo é do tenant? |
|---|---|---|---|---|
| `changeRole` | `usuarios:editar` | **não checa** — você pode rebaixar a si mesmo | **sim**, se o alvo é owner e vira outra coisa | sim, o `where` filtra por tenant |
| `removeMember` | `usuarios:excluir` | **sim** — "Você não pode remover a si mesmo" | **sim** | sim |
| `resetMemberPassword` | `usuarios:editar` | não checa | n/a | **sim**, checa explicitamente (`users.ts:217–227`) |
| `updateMemberName` | `usuarios:editar` | não checa | n/a | **não checa** — ver (l) |
| `invite` | `usuarios:criar` | n/a | n/a | n/a |

Três lacunas visíveis no código, todas em `changeRole`:

1. **Não impede a auto-troca.** Um admin pode se rebaixar para `membro` e
   perder o acesso à tela; a única barreira é a do último owner.
2. **Não impede promover a `owner`.** Qualquer um com `usuarios:editar` — que
   um override de `/acessos` pode conceder a um `membro` — pode se promover a
   `owner`.
3. **Não há transação nem lock.** `countOwners` e o `update` são dois
   statements separados (`users.ts:153` e `:157`). Dois rebaixamentos
   simultâneos dos dois últimos owners podem passar ambos pela contagem `<= 1`
   antes de qualquer um gravar, deixando o tenant sem owner. O mesmo vale para
   `removeMember` (`:267` e `:270`).

### i) A sessão é invalidada quando o papel muda ou o usuário é removido?

**A sessão (o cookie) não é invalidada — mas as permissões são relidas a cada
requisição, então o efeito prático é imediato.** São duas coisas distintas.

**O que NÃO acontece:** nada no repositório revoga sessão. A estratégia é JWT
(`auth.ts:23`: `session: { strategy: "jwt" }`), o token carrega apenas o `uid`
(`auth.ts:55–58`) e não há lista de revogação, nem `signOut` forçado, nem
bump de versão de token. A tabela `session` existe no schema mas **não é usada**
— com estratégia JWT o Auth.js não grava sessão no banco. O middleware só
confere a *presença* do cookie (`middleware.ts:22–24`), e o próprio comentário
avisa que é "redirect de UX" e que "a validação real do usuário/perfil acontece
no servidor via getActiveContext()" (`middleware.ts:6–7`).

**O que acontece de fato:** `getActiveContext` roda em toda requisição (todas
as páginas são `dynamic = "force-dynamic"`) e relê do banco o usuário, os
memberships e as permissões (`context.ts:49–63`, `:106`). Então:

| Evento | Efeito na sessão aberta |
|---|---|
| **Papel alterado** | a próxima navegação já usa o papel novo — `effectivePermissions` é recalculada do zero em `context.ts:106` |
| **Permissões granulares alteradas** | idem |
| **Membro removido** | `memberships.length === 0` → `getActiveContext` devolve `null` (`context.ts:62`) → o layout do app renderiza a tela "Banco vazio" (`layout.tsx:25–47`), não um "acesso negado" |
| **Senha redefinida** | **nenhum** — o JWT continua válido até expirar; a sessão aberta segue funcionando com a senha antiga já trocada |
| **MFA desligado por outro** | não existe — só o próprio usuário desliga (ver (k)) |

Os dois pontos que merecem registro: a sessão de quem foi **removido** continua
autenticada (o cookie é válido; o middleware deixa passar), e o que barra é a
ausência de vínculo, com uma mensagem enganosa ("Banco vazio... rode
`node seed.mjs`"). E **trocar a senha de alguém não o desconecta** — se o
objetivo for cortar acesso imediato, redefinir senha não basta.

### j) Há política de senha? O "mín. 8" é validado no servidor?

**A política inteira é "8 caracteres ou mais".** Não há exigência de
maiúscula, dígito, símbolo, não há proibição de senha comum, não há histórico
de reuso, não há expiração e não há bloqueio por tentativas.

O mínimo é aplicado em **três** pontos do servidor, com comportamentos
diferentes:

| Onde | Código | Se a senha for curta |
|---|---|---|
| `resetMemberPassword` (`users.ts:213–214`) | `if ((password ?? "").length < 8) return { ok:false, error: "…" }` | **erro visível** na tela |
| `changePassword` (`account.ts:27`) | `if (next.length < 8) throw new Error("…")` | **erro visível** |
| `invite` (`users.ts:51–53`) | `password.length >= 8 ? hashPassword(password) : undefined` | **silêncio** |

O terceiro caso é o que destoa (`users.ts:51–53`):

```ts
  // Senha inicial é opcional; se informada precisa ter no mínimo 8 caracteres.
  const passwordHash =
    password.length >= 8 ? hashPassword(password) : undefined;
```

Digitar uma senha inicial de 5 caracteres no formulário "Novo usuário"
**cria o usuário sem senha nenhuma**, sem mensagem de erro. O admin acha que
definiu a senha; o membro aparece na tabela como "sem senha". O `invite` também
não retorna nada (`users.ts:98–100` devolve `void`), então a tela não teria
como mostrar o aviso mesmo que ele existisse.

No cliente, o `placeholder="mín. 8"` (`page.tsx:74`) e
`placeholder="Nova senha (mín. 8)"` (`member-actions.tsx:95`) são só texto —
não há `minLength` nos inputs.

Sobre reuso: `resetMemberPassword` não compara com o hash anterior, então
redefinir para a mesma senha é aceito. `changePassword` exige a senha atual
(`account.ts:28–30`) — mas só quando já existe hash; quem está "sem senha"
define uma sem provar nada, desde que esteja logado (o que, sem senha, não
consegue).

### k) MFA: está ativo, é opcional, por usuário ou por tenant? Quem desliga?

| Dimensão | Resposta |
|---|---|
| **Está ativo?** | Depende da env. `mfaEnforced()` é `process.env.MFA_ENFORCED === "true"` (`mfa.ts:11–12`). O docstring chama o estado padrão de **"STANDBY (fase de testes)"** |
| **Obrigatório ou opcional?** | Com `MFA_ENFORCED=true`, obrigatório para todos; sem ela, ninguém é forçado, mas quem quiser pode ativar em `/perfil` |
| **Por usuário ou por tenant?** | **Por usuário** — `user.mfa_enabled` e `user.mfa_secret` (`schema.ts:51–52`). Não há coluna de MFA em `tenant` nem em `membership` |
| **Por ambiente?** | **Sim** — a exigência é da instância inteira, via env. Não dá para exigir MFA só de um tenant ou só dos owners |
| **Quem desliga?** | **Só o próprio usuário** |

Os dois pontos onde a env é consultada:

```ts
        // Segundo fator — só quando o MFA está sendo exigido (env) e ativo.
        if (mfaEnforced() && u.mfaEnabled) {
          const code = String(creds?.totp ?? "");
          if (!u.mfaSecret || !verifyTotp(u.mfaSecret, code)) return null;
        }
```

(`auth.ts:45–49` — no login) e `layout.tsx:88`:

```tsx
  if (mfaEnforced() && me && !me.mfaEnabled) redirect("/mfa");
```

Note a consequência do `&&` no login: com `MFA_ENFORCED` desligada, **um
usuário que ativou o MFA voluntariamente não tem o código exigido** — o
segundo fator fica inerte até alguém ligar a env. A tela de Usuários continua
mostrando o selo "MFA" nesse membro (`page.tsx:123`), sugerindo uma proteção
que o login não está cobrando.

**Desligar** é `disableMfa` (`account.ts:84–92`), que só exige estar
autenticado — não há verificação de papel nem de tenant, e ela age sobre o
**próprio** usuário (`currentUser()`, `account.ts:10–20`). Zera
`mfa_enabled` e `mfa_secret`. Não existe nenhuma action que desligue o MFA de
outra pessoa: um admin que precise destravar alguém que perdeu o autenticador
não tem botão para isso em `/usuarios`. Com `MFA_ENFORCED=true`, desligar o
próprio MFA apenas manda o usuário de volta ao enrollment forçado
(`layout.tsx:88` → `/mfa`), então o efeito é re-cadastrar, não escapar.

O TOTP é SHA1, 6 dígitos, período de 30s, janela ±1 (`totp.ts:12–19`,
`:33–39`), segredo de 20 bytes em base32 (`totp.ts:8`). O segredo é gravado em
`user.mfa_secret` **em texto claro** — não há criptografia de coluna.

### l) As actions verificam permissão no servidor? Um "membro" consegue trocar papel?

**As cinco verificam**, cada uma logo na primeira linha, com a chave de tela
`"usuarios"`:

| Action | Verificação | Linha | Falha silenciosa? |
|---|---|---|---|
| `invite` | `can(ctx.perms, "usuarios", "criar")` | `users.ts:39` | **sim** — `return` sem erro |
| `changeRole` | `can(ctx.perms, "usuarios", "editar")` | `users.ts:138` | não — `{ok:false, error:"Sem permissão."}` |
| `updateMemberName` | `can(ctx.perms, "usuarios", "editar")` | `users.ts:184` | não |
| `resetMemberPassword` | `can(ctx.perms, "usuarios", "editar")` | `users.ts:211` | não |
| `removeMember` | `can(ctx.perms, "usuarios", "excluir")` | `users.ts:251` | não |
| `setMemberPermissions` | `can(ctx.perms, "**acessos**", "editar")` | `users.ts:112` | **sim** — `return` sem erro |

Há ainda o enforcement central de "Ver" no layout (`layout.tsx:92–95`), que
cobre a rota `/usuarios` porque `"usuarios"` está em `SCREENS`
(`permissions.ts:65`).

**Um "membro" consegue chamar `changeRole` direto?** Pelo perfil padrão,
**não**: `defaultPermissions` dá `NONE` a `membro` em toda tela do módulo
`Config` (`permissions.ts:101–102`), e `usuarios` é `Config`. A action
devolveria `{ok:false, error:"Sem permissão."}`.

**Mas o perfil não é a última palavra.** `effectivePermissions` aplica os
overrides do membership por cima (`permissions.ts:115–126`), e a tela
`/acessos` pode conceder `usuarios:editar` a um `membro`. Com esse override,
esse membro passa a poder trocar papéis — inclusive **promover a si mesmo a
`owner`**, já que `changeRole` não valida o papel de destino nem impede a
auto-alteração (ver (h)). O único freio é quem administra `/acessos`.

Duas observações de rigor sobre o alvo das actions:

- **`updateMemberName` não verifica se o alvo é membro deste tenant**
  (`users.ts:186–189`): o `where` é `eq(schema.users.id, userId)`, sem
  qualquer filtro de membership. Quem tiver `usuarios:editar` e souber o id de
  um usuário de **outro** tenant pode renomeá-lo. Compare com
  `resetMemberPassword`, que faz a checagem explícita (`users.ts:216–227`) —
  a assimetria está no código, com comentário só na segunda.
- `resetMemberPassword` **também** atualiza `schema.users` por
  `eq(users.id, userId)` (`:229–232`), mas só depois de confirmar o vínculo,
  o que fecha a brecha.

### m) Um usuário pode pertencer a mais de um tenant? Como a tela lida?

**Pode, pelo modelo de dados. A aplicação, porém, só enxerga um.**

O modelo suporta: `membership` tem PK composta `(user_id, tenant_id)`
(`schema.ts:170`), então o mesmo `user_id` pode ter N linhas, uma por tenant,
cada uma com papel e overrides próprios. O `invite` inclusive reaproveita o
usuário global quando o e-mail já existe (`users.ts:55–68`) — é exatamente o
caso de alguém que já é membro de outro tenant.

A aplicação não suporta (`context.ts:56–63`):

```ts
  // Vínculos do usuário (multi-tenant); por ora usa o primeiro tenant.
  const memberships = await db
    .select()
    .from(schema.memberships)
    .where(eq(schema.memberships.userId, user.id))
    .orderBy(asc(schema.memberships.createdAt));
  if (memberships.length === 0) return null;
  const membership = memberships[0];
```

Pega sempre o **primeiro por `created_at`** — o vínculo mais antigo. Não há
cookie de tenant ativo (existem `gtc_project` e `gtc_version`,
`context.ts:33–34`, mas nenhum de tenant), não há seletor na sidebar e não há
nenhuma outra referência a `memberships[` no repositório. Grep confirma:
`memberships[0]` aparece uma única vez, nesta linha.

**Como a tela lida:** ela não lida. `/usuarios` lista os membros de
`ctx.tenant.id` (`page.tsx:30` → `getMembers`, que filtra por tenant,
`queries.ts:1485`), e todas as actions filtram pelo mesmo tenant. Da
perspectiva do admin, a existência de outros vínculos do mesmo usuário é
invisível. Consequências concretas:

1. Remover um membro aqui **não** tira o acesso dele aos outros tenants —
   como o docstring diz (`users.ts:245–246`).
2. Se o vínculo removido era o **mais antigo**, o usuário passa a entrar pelo
   segundo — muda de empresa sem aviso, na próxima navegação.
3. Um usuário adicionado a um segundo tenant **nunca o verá**, porque o
   primeiro vínculo continua ganhando.
4. `resetMemberPassword` troca a senha **global** do usuário
   (`users.ts:229–232`, `where users.id`): o admin do tenant A redefine a
   senha e derruba, junto, o acesso da pessoa ao tenant B. A checagem de
   vínculo (`:217–227`) garante que o alvo é membro **deste** tenant, mas o
   efeito continua sendo global.

### n) Qual a relação entre esta tela e "Gestão de Acessos"?

Primeiro, a rota: o caminho é **`/acessos`** (id de tela `acessos`,
`permissions.ts:66`), não `/gestaoacessos`. "Gestão de Acessos" é o rótulo. A
própria `/usuarios` linka para ela no rodapé (`page.tsx:145–153`).

**Nenhuma sobrescreve a outra: elas escrevem em colunas diferentes da mesma
linha de `membership`.**

| Tela | Grava | Action | Permissão |
|---|---|---|---|
| `/usuarios` | `membership.role` | `changeRole` (`users.ts:157–165`) | `usuarios:editar` |
| `/acessos` | `membership.permissions` (jsonb) | `setMemberPermissions` (`users.ts:113–121`) | `acessos:editar` |

Como se combinam, na leitura — `permissions.ts:114–126`:

```ts
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
```

Ou seja: **`role` produz a base, o jsonb aplica um patch por cima, tela a
tela.** O merge é `{...base[s.id], ...o}` — raso e por tela: um override que
declare só `{ver:true}` para `dre` mantém `criar/editar/excluir` vindos do
papel naquela tela, e todas as outras telas ficam intactas. `null` em
`permissions` significa "use só os defaults do papel"
(`schema.ts:161–162`, `permissions.ts:120`).

O ponto que merece registro: **trocar o papel não limpa os overrides.**
`changeRole` grava só `{ role }` (`users.ts:159`) e deixa o jsonb como está.
Um `admin` que tenha recebido overrides e depois seja rebaixado a `contador`
carrega os overrides antigos para o papel novo — e como o override vence o
default, ele pode continuar com `editar` em telas que o `contador` não deveria
nem ver. O caminho inverso também vale: um override restritivo salvo enquanto
a pessoa era `membro` continua limitando-a depois de virada `admin`.

A `/acessos` exibe justamente o resultado combinado — ela chama
`effectivePermissions(m.role, m.permissions)` por membro
(`acessos/page.tsx:21`) antes de entregar à matriz. Então a tela mostra o
efeito, mas grava só o override; o papel continua sendo responsabilidade de
`/usuarios`.

### o) As actions gravam `logAudit` com valor anterior e novo? Senha entra no log?

**Todas gravam log. Nenhuma grava o valor anterior.** Diferente de
`/empresa` — que usa `diffAudit(antes, valores)` —, aqui não há leitura do
estado anterior para o log em nenhuma das cinco.

| Action | `action` | `entity` | `entityId` | `meta` | Anterior? |
|---|---|---|---|---|---|
| `invite` (`users.ts:86–93`) | `membership.invite` | `membership` | `userId` | `{ email, role }` | não |
| `changeRole` (`:166–173`) | `membership.role` | `membership` | `userId` | `{ role }` — **só o novo** | **não** |
| `updateMemberName` (`:190–197`) | `user.rename` | `user` | `userId` | `{ name }` — só o novo | **não** |
| `resetMemberPassword` (`:233–239`) | `user.password_reset` | `user` | `userId` | **ausente** | n/a |
| `removeMember` (`:278–285`) | `membership.remove` | `membership` | `userId` | `{ role: target.role }` — **só o antigo** | — |
| `setMemberPermissions` (`:122–129`) | `membership.permissions` | `membership` | `userId` | a matriz inteira, só a nova | não |

Detalhe do `changeRole`: a action **já leu** o papel anterior, em `target`
(`users.ts:142–151`), para a guarda do último owner — mas não o inclui no
`meta`. O dado está à mão e é descartado. No log fica apenas "virou X", sem
"era Y". Reconstruir o histórico exige ler as linhas de log em ordem.

O `removeMember` é o espelho disso: grava o papel que a pessoa tinha, e
naturalmente não há "novo".

**Senha no log: não, em nenhuma forma.** `resetMemberPassword` chama `logAudit`
**sem `meta`** (`users.ts:233–239`) — o objeto passado tem só `tenantId`,
`userId`, `action`, `entity` e `entityId`. Nem a senha em claro nem o hash
aparecem. `invite` grava `{ email, role }`, e a senha inicial, quando
informada, também não entra. `changePassword` (`/perfil`,
`account.ts:22–36`) **não grava log nenhum** — troca de senha pelo próprio
usuário não deixa rastro de auditoria.

Também não há log em: `confirmMfa`, `disableMfa` e `getOrCreateMfaSetup`
(`account.ts`). Ativar ou desligar o segundo fator — inclusive desligar, que é
uma redução de segurança — não gera linha em `audit_log`.

### Complemento — `tenant_id` no `where` de cada consulta e de cada update

Fechando o que a coleta levantou nas outras perguntas, por operação:

| Operação | `where` | Filtra por tenant? |
|---|---|---|
| `getMembers` (`queries.ts:1485`) | `eq(memberships.tenantId, tenantId)` | ✅ |
| `invite` — busca do usuário (`users.ts:58`) | `eq(users.email, email)` | n/a (usuário é global) |
| `invite` — insert do vínculo (`users.ts:80`) | `tenantId: ctx.tenant.id` | ✅ |
| `countOwners` (`users.ts:23–28`) | `tenantId` + `role = owner` | ✅ |
| `changeRole` — leitura e update (`users.ts:145–150`, `:160–164`) | `userId` + `tenantId` | ✅ |
| `resetMemberPassword` — checagem (`users.ts:220–225`) | `userId` + `tenantId` | ✅ |
| `resetMemberPassword` — update (`users.ts:232`) | `eq(users.id, userId)` | ❌ (mas precedido da checagem) |
| `updateMemberName` (`users.ts:189`) | `eq(users.id, userId)` | ❌ **sem checagem** |
| `removeMember` — leitura e delete (`users.ts:259–264`, `:272–276`) | `userId` + `tenantId` | ✅ |
| `setMemberPermissions` (`users.ts:116–120`) | `userId` + `tenantId` | ✅ |

Nove de dez operações filtram por tenant. A exceção sem compensação é
`updateMemberName`, já anotada em (l).
