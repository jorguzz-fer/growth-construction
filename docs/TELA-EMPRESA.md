# Tela — Empresa (`/empresa`)

Coleta de código, sem análise. Cada arquivo aparece com o caminho como
cabeçalho. Trechos parciais trazem a faixa de linhas no título do bloco.

Base: branch `claude/contexto-revisao`.

---

## 1. A página

### `src/app/(app)/empresa/page.tsx`

```tsx
import Image from "next/image";
import { getActiveContext } from "@/lib/context";
import { can } from "@/lib/permissions";
import { isR2Configured, readUrl } from "@/lib/storage/r2";
import { renameTenant, salvarDadosFiscais, uploadLogo } from "@/lib/actions/empresa";
import { PageHeader } from "@/components/app/page-header";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input, Label, Select } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { R2HealthCheck } from "@/components/app/r2-healthcheck";
import {
  REGIMES_ESPECIAIS,
  REGIMES_TRIBUTARIOS,
  checarProntidaoFiscal,
  formatarCnpj,
} from "@/lib/calc/emitente-fiscal";
import { focusConfigurado, resolverAmbiente } from "@/lib/fiscal/focus";

export const dynamic = "force-dynamic";

export default async function EmpresaPage() {
  const ctx = await getActiveContext();
  if (!ctx) return null;
  const canEdit = can(ctx.perms, "empresa", "editar");
  const r2 = isR2Configured();
  const logoUrl =
    ctx.tenant.logoKey && r2 ? await readUrl(ctx.tenant.logoKey) : null;

  const t = ctx.tenant;
  const ambiente = resolverAmbiente(t.fiscalAmbiente);
  const provedorPronto = focusConfigurado(ambiente);
  const pendencias = checarProntidaoFiscal({
    razaoSocial: t.name,
    nomeFantasia: t.nomeFantasia,
    cnpj: t.cnpj,
    inscricaoMunicipal: t.inscricaoMunicipal,
    inscricaoEstadual: t.inscricaoEstadual,
    regimeTributario: t.regimeTributario,
    regimeEspecial: t.regimeEspecial,
    itemListaServico: t.itemListaServico,
    codigoTributarioMunicipio: t.codigoTributarioMunicipio,
    cnae: t.cnae,
    aliquotaIss: t.aliquotaIss === null ? null : Number(t.aliquotaIss),
    logradouro: t.logradouro,
    numero: t.numeroEndereco,
    complemento: t.complemento,
    bairro: t.bairro,
    codigoMunicipio: t.codigoMunicipio,
    municipio: t.municipio,
    uf: t.uf,
    cep: t.cep,
    telefone: t.telefone,
    email: t.emailFiscal,
  });
  const bloqueios = pendencias.filter((p) => p.severidade === "bloqueio");
  const avisos = pendencias.filter((p) => p.severidade === "aviso");

  return (
    <>
      <PageHeader
        title="Empresa"
        subtitle="Identidade do tenant e cadastro fiscal do emitente"
      />

      <div className="grid gap-4 md:grid-cols-2">
        <Card>
          <CardContent className="space-y-4 p-5">
            <h2 className="text-sm font-semibold text-[var(--color-ink)]">
              Dados
            </h2>
            <form action={renameTenant} className="space-y-3">
              <div>
                <Label>Nome da empresa</Label>
                <Input name="name" defaultValue={ctx.tenant.name} disabled={!canEdit} />
              </div>
              {canEdit && <Button type="submit">Salvar nome</Button>}
            </form>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="space-y-4 p-5">
            <div className="flex items-center justify-between">
              <h2 className="text-sm font-semibold text-[var(--color-ink)]">
                Logo
              </h2>
              <Badge tone={r2 ? "success" : "neutral"}>
                {r2 ? "R2 ativo" : "R2 não configurado"}
              </Badge>
            </div>

            {canEdit && <R2HealthCheck />}

            <div className="flex h-24 w-full items-center justify-center rounded-[8px] border border-dashed border-[var(--color-accent2)]/20 bg-[var(--color-surface2)]">
              {logoUrl ? (
                <Image
                  src={logoUrl}
                  alt="Logo"
                  width={160}
                  height={80}
                  className="max-h-20 w-auto object-contain"
                  unoptimized
                />
              ) : (
                <span className="text-xs text-[var(--color-ink4)]">
                  Sem logo
                </span>
              )}
            </div>

            {canEdit && r2 ? (
              <form action={uploadLogo} className="flex items-center gap-2">
                <input
                  type="file"
                  name="logo"
                  accept="image/png,image/jpeg,image/svg+xml,image/webp"
                  className="text-xs"
                  required
                />
                <Button type="submit" size="sm">
                  Enviar
                </Button>
              </form>
            ) : (
              <p className="text-xs text-[var(--color-ink3)]">
                {r2
                  ? "Sem permissão para alterar o logo."
                  : "Configure as variáveis R2_* para habilitar o upload de logo."}
              </p>
            )}
          </CardContent>
        </Card>
      </div>

      <Card className="mt-4">
        <CardContent className="space-y-5 p-5">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div>
              <h2 className="text-sm font-semibold text-[var(--color-ink)]">
                Dados fiscais — emissão de nota
              </h2>
              <p className="mt-1 text-xs text-[var(--color-ink3)]">
                Dados do prestador exigidos na NFS-e. {formatarCnpj(t.cnpj) || "CNPJ não informado"}
              </p>
            </div>
            <div className="flex items-center gap-2">
              <Badge tone={ambiente === "producao" ? "warning" : "info"}>
                {ambiente === "producao" ? "Produção" : "Homologação"}
              </Badge>
              <Badge tone={bloqueios.length === 0 ? "success" : "neutral"}>
                {bloqueios.length === 0
                  ? "Cadastro completo"
                  : `${bloqueios.length} pendência(s)`}
              </Badge>
              <Badge tone={provedorPronto ? "success" : "neutral"}>
                {provedorPronto ? "Provedor configurado" : "Sem token do provedor"}
              </Badge>
            </div>
          </div>

          {(bloqueios.length > 0 || avisos.length > 0) && (
            <ul className="space-y-1.5 rounded-[8px] border border-[var(--color-accent2)]/20 bg-[var(--color-surface2)] p-3">
              {[...bloqueios, ...avisos].map((p) => (
                <li key={p.campo} className="flex items-start gap-2 text-xs">
                  <Badge tone={p.severidade === "bloqueio" ? "danger" : "warning"}>
                    {p.severidade === "bloqueio" ? "falta" : "confira"}
                  </Badge>
                  <span className="text-[var(--color-ink2)]">
                    <strong className="text-[var(--color-ink)]">{p.label}:</strong>{" "}
                    {p.mensagem}
                  </span>
                </li>
              ))}
            </ul>
          )}

          {!provedorPronto && (
            <p className="text-xs text-[var(--color-ink3)]">
              Defina <code>FOCUS_NFE_TOKEN</code> (ou a variante por ambiente) para
              habilitar o envio ao provedor de emissão.
            </p>
          )}

          <form action={salvarDadosFiscais} className="space-y-4">
            <fieldset disabled={!canEdit} className="space-y-4">
              <div className="grid gap-3 md:grid-cols-3">
                <div>
                  <Label>Nome fantasia</Label>
                  <Input name="nomeFantasia" defaultValue={t.nomeFantasia ?? ""} />
                </div>
                <div>
                  <Label>CNPJ</Label>
                  <Input
                    name="cnpj"
                    defaultValue={t.cnpj ?? ""}
                    placeholder="00.000.000/0001-00"
                  />
                </div>
                <div>
                  <Label>Inscrição municipal</Label>
                  <Input
                    name="inscricaoMunicipal"
                    defaultValue={t.inscricaoMunicipal ?? ""}
                  />
                </div>
                <div>
                  <Label>Inscrição estadual</Label>
                  <Input
                    name="inscricaoEstadual"
                    defaultValue={t.inscricaoEstadual ?? ""}
                  />
                </div>
                <div>
                  <Label>Regime tributário</Label>
                  <Select name="regimeTributario" defaultValue={t.regimeTributario ?? ""}>
                    <option value="">—</option>
                    {REGIMES_TRIBUTARIOS.map((r) => (
                      <option key={r.id} value={r.id}>
                        {r.label}
                      </option>
                    ))}
                  </Select>
                </div>
                <div>
                  <Label>Regime especial (opcional)</Label>
                  <Select name="regimeEspecial" defaultValue={t.regimeEspecial ?? ""}>
                    <option value="">—</option>
                    {REGIMES_ESPECIAIS.map((r) => (
                      <option key={r.id} value={r.id}>
                        {r.label}
                      </option>
                    ))}
                  </Select>
                </div>
                <div>
                  <Label>Item da lista de serviço (LC 116)</Label>
                  <Input
                    name="itemListaServico"
                    defaultValue={t.itemListaServico ?? ""}
                    placeholder="7.02"
                  />
                </div>
                <div>
                  <Label>Código tributário do município</Label>
                  <Input
                    name="codigoTributarioMunicipio"
                    defaultValue={t.codigoTributarioMunicipio ?? ""}
                  />
                </div>
                <div>
                  <Label>CNAE</Label>
                  <Input name="cnae" defaultValue={t.cnae ?? ""} placeholder="4120400" />
                </div>
                <div>
                  <Label>Alíquota de ISS (%)</Label>
                  <Input
                    name="aliquotaIss"
                    defaultValue={t.aliquotaIss ?? ""}
                    placeholder="3"
                  />
                </div>
                <div>
                  <Label>Ambiente de emissão</Label>
                  <Select name="fiscalAmbiente" defaultValue={ambiente}>
                    <option value="homologacao">Homologação (sem valor fiscal)</option>
                    <option value="producao">Produção (nota válida)</option>
                  </Select>
                </div>
              </div>

              <div className="grid gap-3 md:grid-cols-4">
                <div className="md:col-span-2">
                  <Label>Logradouro</Label>
                  <Input name="logradouro" defaultValue={t.logradouro ?? ""} />
                </div>
                <div>
                  <Label>Número</Label>
                  <Input name="numeroEndereco" defaultValue={t.numeroEndereco ?? ""} />
                </div>
                <div>
                  <Label>Complemento</Label>
                  <Input name="complemento" defaultValue={t.complemento ?? ""} />
                </div>
                <div>
                  <Label>Bairro</Label>
                  <Input name="bairro" defaultValue={t.bairro ?? ""} />
                </div>
                <div>
                  <Label>Município</Label>
                  <Input name="municipio" defaultValue={t.municipio ?? ""} />
                </div>
                <div>
                  <Label>Código IBGE (7 dígitos)</Label>
                  <Input
                    name="codigoMunicipio"
                    defaultValue={t.codigoMunicipio ?? ""}
                    placeholder="3552502"
                  />
                </div>
                <div>
                  <Label>UF</Label>
                  <Input name="uf" defaultValue={t.uf ?? ""} maxLength={2} />
                </div>
                <div>
                  <Label>CEP</Label>
                  <Input name="cep" defaultValue={t.cep ?? ""} />
                </div>
                <div>
                  <Label>Telefone</Label>
                  <Input name="telefone" defaultValue={t.telefone ?? ""} />
                </div>
                <div className="md:col-span-2">
                  <Label>E-mail fiscal</Label>
                  <Input
                    name="emailFiscal"
                    type="email"
                    defaultValue={t.emailFiscal ?? ""}
                  />
                </div>
              </div>
            </fieldset>

            {canEdit ? (
              <Button type="submit">Salvar dados fiscais</Button>
            ) : (
              <p className="text-xs text-[var(--color-ink3)]">
                Sem permissão para alterar os dados fiscais.
              </p>
            )}
          </form>
        </CardContent>
      </Card>
    </>
  );
}
```

---

## 2. Componentes próprios que a página importa (recursivamente)

```
src/app/(app)/empresa/page.tsx
├── next/image                      → Image
├── @/lib/context                   → getActiveContext
├── @/lib/permissions               → can
├── @/lib/storage/r2                → isR2Configured, readUrl            (seção 3)
├── @/lib/actions/empresa           → renameTenant, salvarDadosFiscais,
│                                     uploadLogo                          (seção 3)
├── @/components/app/page-header    → PageHeader
├── @/components/ui/card            → Card, CardContent
├── @/components/ui/button          → Button
├── @/components/ui/input           → Input, Label, Select
├── @/components/ui/badge           → Badge
├── @/components/app/r2-healthcheck → R2HealthCheck  ("use client")
│   └── @/components/ui/button      → Button
│   └── fetch("/api/health/r2")     → src/app/api/health/r2/route.ts      (seção 3)
├── @/lib/calc/emitente-fiscal      → REGIMES_ESPECIAIS, REGIMES_TRIBUTARIOS,
│                                     checarProntidaoFiscal, formatarCnpj (seção 3)
└── @/lib/fiscal/focus              → focusConfigurado, resolverAmbiente  (seção 3)
    └── @/lib/fiscal/tipos          → ehAmbienteFiscal, AmbienteFiscal, …
    └── @/lib/fiscal/nfse-payload   → PayloadNfse (só o tipo)
```

`R2HealthCheck` é o único componente `"use client"` da tela. Os demais são
Server Components; o resto do formulário é HTML puro com `action={serverAction}`.

### `src/components/app/r2-healthcheck.tsx`

```tsx
"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";

interface HealthResult {
  ok: boolean;
  configured?: boolean;
  error?: string;
  stage?: string;
  steps?: Record<string, string>;
}

/**
 * Botão de diagnóstico do Cloudflare R2. Chama /api/health/r2 (round-trip
 * PUT→GET→DELETE) e mostra o resultado inline. Ajuda o admin a validar as
 * variáveis logo após o deploy, sem tentar um upload real.
 */
export function R2HealthCheck() {
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<HealthResult | null>(null);

  async function run() {
    setLoading(true);
    setResult(null);
    try {
      const res = await fetch("/api/health/r2", { cache: "no-store" });
      setResult((await res.json()) as HealthResult);
    } catch (e) {
      setResult({ ok: false, error: e instanceof Error ? e.message : String(e) });
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="space-y-2">
      <Button variant="outline" size="sm" onClick={run} disabled={loading}>
        {loading ? "Testando…" : "Testar conexão R2"}
      </Button>

      {result && (
        <div
          className={`rounded-[8px] border p-3 text-xs ${
            result.ok
              ? "border-emerald-500/30 bg-emerald-500/10 text-emerald-700"
              : "border-red-500/30 bg-red-500/10 text-red-700"
          }`}
        >
          <p className="font-semibold">
            {result.ok ? "✓ Conexão OK — upload/leitura funcionando." : "✗ Falhou"}
          </p>
          {result.stage && <p>Etapa que falhou: {result.stage}</p>}
          {result.error && <p className="mt-1 break-words">{result.error}</p>}
          {result.steps && (
            <ul className="mt-1 space-y-0.5">
              {Object.entries(result.steps).map(([k, v]) => (
                <li key={k}>
                  {k}: {v}
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </div>
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

As três actions da tela vivem no mesmo arquivo. **"Testar conexão R2" não é
Server Action** — é um `fetch` do cliente para um Route Handler (`GET`), colado
logo abaixo.

### `src/lib/actions/empresa.ts`

Contém `uploadLogo` (linhas 23–56), `salvarDadosFiscais` (70–141) e
`renameTenant` (143–153).

```ts
"use server";

import { eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { db, schema } from "@/lib/db";
import { getActiveContext } from "@/lib/context";
import { can } from "@/lib/permissions";
import { isR2Configured, putObject } from "@/lib/storage/r2";
import { logAudit } from "@/lib/audit";
import { diffAudit } from "@/lib/audit-diff";
import {
  aliquotaIssValida,
  cnpjValido,
  ehRegimeEspecial,
  ehRegimeTributario,
  normalizarCep,
  normalizarCnpj,
  normalizarCodigoMunicipio,
} from "@/lib/calc/emitente-fiscal";
import { ehAmbienteFiscal } from "@/lib/fiscal/tipos";

/** Faz upload do logo da empresa para o R2 e salva a chave no tenant. */
export async function uploadLogo(formData: FormData) {
  const ctx = await getActiveContext();
  if (!ctx || !can(ctx.perms, "empresa", "editar")) {
    throw new Error("Sem permissão.");
  }
  if (!isR2Configured()) {
    throw new Error(
      "Storage (Cloudflare R2) não configurado — defina as variáveis R2_*.",
    );
  }
  const file = formData.get("logo") as File | null;
  if (!file || file.size === 0) throw new Error("Selecione um arquivo.");
  if (file.size > 2 * 1024 * 1024) throw new Error("Logo deve ter até 2 MB.");

  const ext = (file.name.split(".").pop() || "png").toLowerCase();
  const key = `tenants/${ctx.tenant.id}/logo.${ext}`;
  const bytes = new Uint8Array(await file.arrayBuffer());
  await putObject(key, bytes, file.type || "image/png");

  await db
    .update(schema.tenants)
    .set({ logoKey: key })
    .where(eq(schema.tenants.id, ctx.tenant.id));

  await logAudit({
    tenantId: ctx.tenant.id,
    userId: ctx.userId,
    action: "tenant.logo",
    entity: "tenant",
    entityId: ctx.tenant.id,
    meta: { key },
  });
  revalidatePath("/", "layout");
}

/**
 * Cadastro fiscal do emitente (Fase 1 da emissão de NF — ver docs/EMISSAO-NF.md).
 *
 * Salva PARCIAL de propósito: o cadastro é longo, vem de fontes diferentes
 * (contrato social, prefeitura, contabilidade) e travar o salvamento até estar
 * completo faria o usuário perder o que já digitou. Quem diz se dá para emitir
 * é `checarProntidaoFiscal`, na tela.
 *
 * O único campo recusado é o CNPJ com dígito verificador errado: gravar CNPJ
 * inválido só adia a rejeição para o momento da emissão, quando o erro custa
 * mais caro.
 */
export async function salvarDadosFiscais(formData: FormData) {
  const ctx = await getActiveContext();
  if (!ctx || !can(ctx.perms, "empresa", "editar")) {
    throw new Error("Sem permissão para editar os dados fiscais.");
  }

  const t = (campo: string) => {
    const v = formData.get(campo);
    return typeof v === "string" && v.trim() ? v.trim() : null;
  };

  const cnpj = normalizarCnpj(t("cnpj"));
  if (cnpj && !cnpjValido(cnpj)) {
    throw new Error("CNPJ inválido — confira os dígitos verificadores.");
  }

  const aliquotaTexto = t("aliquotaIss")?.replace(",", ".");
  const aliquota = aliquotaTexto === null ? null : Number(aliquotaTexto);
  if (aliquota !== null && !aliquotaIssValida(aliquota)) {
    throw new Error("A alíquota de ISS deve estar entre 0 e 5%.");
  }

  const ambiente = t("fiscalAmbiente");
  const valores = {
    nomeFantasia: t("nomeFantasia"),
    cnpj,
    inscricaoMunicipal: t("inscricaoMunicipal"),
    inscricaoEstadual: t("inscricaoEstadual"),
    regimeTributario: ehRegimeTributario(t("regimeTributario"))
      ? t("regimeTributario")
      : null,
    regimeEspecial: ehRegimeEspecial(t("regimeEspecial")) ? t("regimeEspecial") : null,
    itemListaServico: t("itemListaServico"),
    codigoTributarioMunicipio: t("codigoTributarioMunicipio"),
    cnae: t("cnae"),
    aliquotaIss: aliquota === null ? null : String(aliquota),
    logradouro: t("logradouro"),
    numeroEndereco: t("numeroEndereco"),
    complemento: t("complemento"),
    bairro: t("bairro"),
    codigoMunicipio: normalizarCodigoMunicipio(t("codigoMunicipio")),
    municipio: t("municipio"),
    uf: t("uf")?.toUpperCase() ?? null,
    cep: normalizarCep(t("cep")),
    telefone: t("telefone"),
    emailFiscal: t("emailFiscal"),
    fiscalAmbiente: ehAmbienteFiscal(ambiente) ? ambiente : "homologacao",
  };

  const [antes] = await db
    .select()
    .from(schema.tenants)
    .where(eq(schema.tenants.id, ctx.tenant.id))
    .limit(1);

  await db
    .update(schema.tenants)
    .set(valores)
    .where(eq(schema.tenants.id, ctx.tenant.id));

  await logAudit({
    tenantId: ctx.tenant.id,
    userId: ctx.userId,
    action: "tenant.fiscal",
    entity: "tenant",
    entityId: ctx.tenant.id,
    meta: {
      changes: diffAudit(antes as unknown as Record<string, unknown>, valores),
    },
  });
  revalidatePath("/empresa");
}

export async function renameTenant(formData: FormData) {
  const ctx = await getActiveContext();
  if (!ctx || !can(ctx.perms, "empresa", "editar")) return;
  const name = ((formData.get("name") as string) || "").trim();
  if (!name) return;
  await db
    .update(schema.tenants)
    .set({ name })
    .where(eq(schema.tenants.id, ctx.tenant.id));
  revalidatePath("/", "layout");
}
```

### `src/app/api/health/r2/route.ts` — o que o botão "Testar conexão R2" chama

```ts
import { NextResponse } from "next/server";
import { DeleteObjectCommand, S3Client } from "@aws-sdk/client-s3";
import { getActiveContext } from "@/lib/context";
import { isR2Configured, putObject, readUrl } from "@/lib/storage/r2";

export const dynamic = "force-dynamic";

/**
 * Diagnóstico da conexão com o Cloudflare R2. Faz um round-trip completo
 * (PUT → GET → DELETE) de um objeto de teste e reporta o resultado de cada
 * etapa. Serve para validar as variáveis de ambiente logo após o deploy, sem
 * precisar tentar um upload real "no escuro".
 *
 * Protegido: exige sessão de owner/admin (não expõe nada a anônimos).
 */
export async function GET() {
  const ctx = await getActiveContext();
  if (!ctx) {
    return NextResponse.json({ ok: false, error: "não autenticado" }, { status: 401 });
  }
  if (ctx.role !== "owner" && ctx.role !== "admin") {
    return NextResponse.json({ ok: false, error: "sem permissão" }, { status: 403 });
  }

  const configured = isR2Configured();
  const steps: Record<string, string> = {};
  const env = {
    R2_ENDPOINT: mask(process.env.R2_ENDPOINT),
    R2_BUCKET: process.env.R2_BUCKET ?? null,
    R2_ACCESS_KEY_ID: mask(process.env.R2_ACCESS_KEY_ID),
    R2_SECRET_ACCESS_KEY: process.env.R2_SECRET_ACCESS_KEY ? "definido" : null,
    R2_REGION: process.env.R2_REGION ?? "auto (default)",
    R2_PUBLIC_URL: process.env.R2_PUBLIC_URL ?? null,
  };

  if (!configured) {
    return NextResponse.json(
      {
        ok: false,
        configured: false,
        error:
          "R2 não configurado — faltam variáveis obrigatórias (endpoint, bucket, access key, secret).",
        env,
      },
      { status: 503 },
    );
  }

  // key temporária no bucket; ignora Math.random (indisponível) usando ctx.
  const key = `_healthcheck/${ctx.tenant.id}-${key6(ctx.tenant.id)}.txt`;
  const body = Buffer.from("growth-tools r2 healthcheck", "utf8");

  try {
    await putObject(key, body, "text/plain");
    steps.put = "ok";
  } catch (e) {
    steps.put = "falhou";
    return NextResponse.json(
      { ok: false, configured: true, stage: "put", error: msg(e), steps, env },
      { status: 502 },
    );
  }

  try {
    const url = await readUrl(key, 60);
    const res = await fetch(url);
    steps.get = res.ok
      ? "ok"
      : `falhou (HTTP ${res.status})`;
    if (!res.ok) throw new Error(`GET retornou HTTP ${res.status}`);
  } catch (e) {
    steps.get = "falhou";
    await tryDelete(key);
    return NextResponse.json(
      { ok: false, configured: true, stage: "get", error: msg(e), steps, env },
      { status: 502 },
    );
  }

  await tryDelete(key, steps);

  return NextResponse.json({ ok: true, configured: true, steps, env });
}

function tryDelete(key: string, steps?: Record<string, string>) {
  return (async () => {
    try {
      const s3 = new S3Client({
        region: process.env.R2_REGION || "auto",
        endpoint: process.env.R2_ENDPOINT,
        credentials: {
          accessKeyId: process.env.R2_ACCESS_KEY_ID!,
          secretAccessKey: process.env.R2_SECRET_ACCESS_KEY!,
        },
      });
      await s3.send(
        new DeleteObjectCommand({ Bucket: process.env.R2_BUCKET, Key: key }),
      );
      if (steps) steps.delete = "ok";
    } catch (e) {
      if (steps) steps.delete = `falhou: ${msg(e)}`;
    }
  })();
}

function mask(v?: string | null): string | null {
  if (!v) return null;
  if (v.length <= 12) return `${v.slice(0, 3)}…`;
  return `${v.slice(0, 8)}…${v.slice(-4)}`;
}

function msg(e: unknown): string {
  return e instanceof Error ? e.message : String(e);
}

/** sufixo curto e estável derivado do id do tenant (sem Math.random). */
function key6(seed: string): string {
  let h = 0;
  for (let i = 0; i < seed.length; i++) h = (h * 31 + seed.charCodeAt(i)) | 0;
  return Math.abs(h).toString(36).slice(0, 6);
}
```

### `src/lib/storage/r2.ts`

```ts
import { S3Client, GetObjectCommand, PutObjectCommand } from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";

/**
 * Cliente Cloudflare R2 (S3-compatível) para o repositório de documentos do
 * módulo Despesas. Ver docs/STACK.md §2 (Storage) e §5 (variáveis).
 *
 * O upload é feito pelo cliente direto ao R2 via presigned URL — o arquivo não
 * passa pela aplicação. A leitura usa o domínio público do bucket (R2_PUBLIC_URL)
 * ou uma presigned URL de GET.
 */

export function isR2Configured(): boolean {
  return Boolean(
    process.env.R2_ENDPOINT &&
      process.env.R2_BUCKET &&
      process.env.R2_ACCESS_KEY_ID &&
      process.env.R2_SECRET_ACCESS_KEY,
  );
}

let cached: S3Client | null = null;

function client(): S3Client {
  if (!isR2Configured()) {
    throw new Error("Cloudflare R2 não configurado (ver .env.example).");
  }
  if (!cached) {
    cached = new S3Client({
      region: process.env.R2_REGION || "auto",
      endpoint: process.env.R2_ENDPOINT,
      credentials: {
        accessKeyId: process.env.R2_ACCESS_KEY_ID!,
        secretAccessKey: process.env.R2_SECRET_ACCESS_KEY!,
      },
    });
  }
  return cached;
}

/** Upload direto de um objeto (usado para arquivos pequenos, ex.: logo). */
export async function putObject(
  key: string,
  body: Uint8Array | Buffer,
  contentType: string,
): Promise<void> {
  await client().send(
    new PutObjectCommand({
      Bucket: process.env.R2_BUCKET,
      Key: key,
      Body: body,
      ContentType: contentType,
    }),
  );
}

/** Baixa um objeto inteiro em memória (usado para montar o ZIP de backup). */
export async function getObjectBytes(key: string): Promise<Uint8Array> {
  const res = await client().send(
    new GetObjectCommand({ Bucket: process.env.R2_BUCKET, Key: key }),
  );
  const body = res.Body as { transformToByteArray?: () => Promise<Uint8Array> } | undefined;
  if (!body?.transformToByteArray) {
    throw new Error("Resposta do R2 sem corpo legível.");
  }
  return body.transformToByteArray();
}

/** Presigned URL de upload (PUT). Válida por `expiresIn` segundos. */
export async function presignUpload(
  key: string,
  contentType: string,
  expiresIn = 600,
): Promise<string> {
  return getSignedUrl(
    client(),
    new PutObjectCommand({
      Bucket: process.env.R2_BUCKET,
      Key: key,
      ContentType: contentType,
    }),
    { expiresIn },
  );
}

/** URL de leitura: domínio público do bucket, ou presigned GET. */
export async function readUrl(key: string, expiresIn = 600): Promise<string> {
  if (process.env.R2_PUBLIC_URL) {
    return `${process.env.R2_PUBLIC_URL.replace(/\/$/, "")}/${key}`;
  }
  return getSignedUrl(
    client(),
    new GetObjectCommand({ Bucket: process.env.R2_BUCKET, Key: key }),
    { expiresIn },
  );
}
```

### `src/lib/calc/emitente-fiscal.ts`

```ts
/**
 * Dados fiscais do EMITENTE — pré-requisito de qualquer emissão de nota.
 *
 * Antes de falar com API de emissão nenhuma (Focus NFe, PlugNotas, NFE.io), o
 * tenant precisa estar cadastrado com o que a prefeitura exige do prestador:
 * CNPJ, inscrição municipal, regime tributário, item da lista de serviço e
 * endereço com código IBGE do município. Este módulo concentra a validação
 * desses campos e produz o CHECKLIST de prontidão que a tela mostra.
 *
 * Princípio: nada aqui bloqueia o cadastro parcial. O tenant pode salvar o que
 * já tem e completar depois — o checklist é que diz se dá para emitir. Enquanto
 * houver pendência bloqueante, a emissão não deve nem ser oferecida.
 *
 * O que este módulo NÃO faz: presumir alíquota, regime ou item de serviço. A
 * tributação varia por município e por contrato, e chutar valor padrão aqui
 * produziria nota errada com aparência de nota certa.
 */

// ───────────────────────────────── CNPJ ─────────────────────────────────

/**
 * CNPJ pode ser ALFANUMÉRICO desde julho/2026 (IN RFB 2.229/2024): os 12
 * primeiros caracteres aceitam letras e dígitos, e só os 2 dígitos
 * verificadores continuam numéricos. O cálculo do DV passou a usar o valor
 * ASCII do caractere menos 48 — para dígitos isso devolve o próprio número, o
 * que mantém todo CNPJ numérico antigo válido pela mesma conta.
 */
const PESOS_DV1 = [5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2];
const PESOS_DV2 = [6, 5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2];

/** Só o que interessa: A–Z e 0–9, em maiúsculas. */
export function normalizarCnpj(cnpj: string | null | undefined): string | null {
  if (!cnpj) return null;
  const limpo = cnpj.toUpperCase().replace(/[^A-Z0-9]/g, "");
  return limpo || null;
}

function valorAscii(ch: string): number {
  return ch.charCodeAt(0) - 48;
}

function dvCnpj(base: string, pesos: number[]): number {
  const soma = pesos.reduce((acc, peso, i) => acc + valorAscii(base[i]) * peso, 0);
  const resto = soma % 11;
  return resto < 2 ? 0 : 11 - resto;
}

/**
 * CNPJ válido (numérico ou alfanumérico), conferindo os dois dígitos.
 *
 * Vazio devolve `false` — quem quer permitir campo em branco checa isso antes.
 * Sequência de caractere repetido é recusada: `00000000000000` passa no módulo
 * 11 e não é CNPJ de ninguém.
 */
export function cnpjValido(cnpj: string | null | undefined): boolean {
  const v = normalizarCnpj(cnpj);
  if (!v || v.length !== 14) return false;
  if (/^(.)\1{13}$/.test(v)) return false;
  // Os dois últimos caracteres são os DV e continuam sendo dígitos.
  if (!/^[A-Z0-9]{12}\d{2}$/.test(v)) return false;

  const base = v.slice(0, 12);
  const dv1 = dvCnpj(base, PESOS_DV1);
  const dv2 = dvCnpj(base + String(dv1), PESOS_DV2);
  return v.slice(12) === `${dv1}${dv2}`;
}

/** `12.345.678/0001-95` — máscara só para exibição. */
export function formatarCnpj(cnpj: string | null | undefined): string {
  const v = normalizarCnpj(cnpj);
  if (!v || v.length !== 14) return cnpj ?? "";
  return `${v.slice(0, 2)}.${v.slice(2, 5)}.${v.slice(5, 8)}/${v.slice(8, 12)}-${v.slice(12)}`;
}

// ────────────────────────── Endereço e município ─────────────────────────

/** CEP: 8 dígitos. Devolve só os dígitos, ou `null` quando vazio. */
export function normalizarCep(cep: string | null | undefined): string | null {
  if (!cep) return null;
  const d = cep.replace(/\D/g, "");
  return d || null;
}

export function cepValido(cep: string | null | undefined): boolean {
  const d = normalizarCep(cep);
  return !!d && d.length === 8;
}

/**
 * Código IBGE do município: 7 dígitos.
 *
 * É o campo que amarra a nota ao município certo — tanto o do prestador quanto
 * o de incidência do ISS. Nome de cidade em texto livre não serve para emissão:
 * a API quer o código.
 */
export function codigoMunicipioValido(codigo: string | null | undefined): boolean {
  if (!codigo) return false;
  return /^\d{7}$/.test(codigo.replace(/\D/g, ""));
}

export function normalizarCodigoMunicipio(
  codigo: string | null | undefined,
): string | null {
  if (!codigo) return null;
  const d = codigo.replace(/\D/g, "");
  return d || null;
}

const UFS = new Set([
  "AC", "AL", "AP", "AM", "BA", "CE", "DF", "ES", "GO", "MA", "MT", "MS",
  "MG", "PA", "PB", "PR", "PE", "PI", "RJ", "RN", "RS", "RO", "RR", "SC",
  "SP", "SE", "TO",
]);

export function ufValida(uf: string | null | undefined): boolean {
  return !!uf && UFS.has(uf.trim().toUpperCase());
}

// ─────────────────────────── Regime tributário ───────────────────────────

/**
 * Regimes que o cadastro aceita.
 *
 * A lista espelha o que a API de emissão precisa saber (o Focus NFe usa os
 * códigos 1 a 4 no cadastro da empresa), incluindo o caso do Simples que
 * estourou o sublimite — ele existe no cadastro do provedor e sem ele o
 * de-para ficaria incompleto. A tradução para o código do provedor mora no
 * adaptador, não aqui.
 */
export const REGIMES_TRIBUTARIOS = [
  { id: "SIMPLES", label: "Simples Nacional" },
  { id: "SIMPLES_EXCESSO", label: "Simples Nacional — excesso de sublimite" },
  { id: "LUCRO_PRESUMIDO", label: "Lucro Presumido" },
  { id: "LUCRO_REAL", label: "Lucro Real" },
  { id: "MEI", label: "MEI" },
] as const;

export type RegimeTributario = (typeof REGIMES_TRIBUTARIOS)[number]["id"];

const REGIME_IDS = new Set<string>(REGIMES_TRIBUTARIOS.map((r) => r.id));

export function ehRegimeTributario(v: string | null | undefined): v is RegimeTributario {
  return !!v && REGIME_IDS.has(v);
}

export function rotuloRegime(id: string | null | undefined): string {
  return REGIMES_TRIBUTARIOS.find((r) => r.id === id)?.label ?? "—";
}

/**
 * O regime implica optante pelo Simples Nacional?
 *
 * A NFS-e tem um campo booleano só para isso, separado do regime. Derivar do
 * regime evita que os dois campos discordem no cadastro.
 */
export function optantePeloSimples(regime: string | null | undefined): boolean {
  return regime === "SIMPLES" || regime === "SIMPLES_EXCESSO" || regime === "MEI";
}

/**
 * Regime ESPECIAL de tributação — outro campo, opcional, da própria nota
 * (microempresa municipal, estimativa, sociedade de profissionais, cooperativa,
 * MEI, ME/EPP do Simples). Vários municípios ignoram; alguns rejeitam a nota
 * sem ele. Fica no cadastro para não ter que ser redigitado a cada emissão.
 */
export const REGIMES_ESPECIAIS = [
  { id: "1", label: "Microempresa municipal" },
  { id: "2", label: "Estimativa" },
  { id: "3", label: "Sociedade de profissionais" },
  { id: "4", label: "Cooperativa" },
  { id: "5", label: "MEI — Simples Nacional" },
  { id: "6", label: "ME/EPP — Simples Nacional" },
] as const;

export type RegimeEspecial = (typeof REGIMES_ESPECIAIS)[number]["id"];

export function ehRegimeEspecial(v: string | null | undefined): v is RegimeEspecial {
  return !!v && REGIMES_ESPECIAIS.some((r) => r.id === v);
}

/**
 * Alíquota de ISS aceitável (%).
 *
 * A Constituição fixa o teto em 5% (EC 37/2002 fixou também o piso de 2%). Fora
 * de 0–5 é erro de digitação — vírgula trocada por ponto, tipicamente. Abaixo
 * de 2% não é recusado aqui porque existem regimes especiais e o Simples
 * Nacional recolhe por outra sistemática; vira AVISO no checklist.
 */
export function aliquotaIssValida(aliquota: number | null | undefined): boolean {
  if (aliquota === null || aliquota === undefined) return false;
  return Number.isFinite(aliquota) && aliquota >= 0 && aliquota <= 5;
}

// ──────────────────────────── Checklist fiscal ───────────────────────────

export interface EmitenteFiscal {
  razaoSocial?: string | null;
  nomeFantasia?: string | null;
  cnpj?: string | null;
  inscricaoMunicipal?: string | null;
  inscricaoEstadual?: string | null;
  regimeTributario?: string | null;
  regimeEspecial?: string | null;
  itemListaServico?: string | null;
  codigoTributarioMunicipio?: string | null;
  cnae?: string | null;
  aliquotaIss?: number | null;
  logradouro?: string | null;
  numero?: string | null;
  complemento?: string | null;
  bairro?: string | null;
  codigoMunicipio?: string | null;
  municipio?: string | null;
  uf?: string | null;
  cep?: string | null;
  telefone?: string | null;
  email?: string | null;
}

export type SeveridadePendencia = "bloqueio" | "aviso";

export interface PendenciaFiscal {
  campo: string;
  label: string;
  mensagem: string;
  severidade: SeveridadePendencia;
}

/**
 * O que ainda falta para o tenant conseguir emitir.
 *
 * `bloqueio` = a API de emissão vai recusar ou a prefeitura vai rejeitar.
 * `aviso`    = dá para emitir, mas alguém precisa confirmar se está certo.
 *
 * A separação existe para a tela não gritar em campo que é legitimamente
 * opcional (inscrição estadual de prestador de serviço, por exemplo).
 */
export function checarProntidaoFiscal(e: EmitenteFiscal): PendenciaFiscal[] {
  const p: PendenciaFiscal[] = [];
  const falta = (v: string | null | undefined) => !v || !v.trim();

  if (falta(e.razaoSocial)) {
    p.push({
      campo: "razaoSocial",
      label: "Razão social",
      mensagem: "A razão social vai no corpo da nota e não pode ficar em branco.",
      severidade: "bloqueio",
    });
  }

  if (falta(e.cnpj)) {
    p.push({
      campo: "cnpj",
      label: "CNPJ",
      mensagem: "Sem CNPJ não há emitente a cadastrar na API de emissão.",
      severidade: "bloqueio",
    });
  } else if (!cnpjValido(e.cnpj)) {
    p.push({
      campo: "cnpj",
      label: "CNPJ",
      mensagem: "Os dígitos verificadores não conferem — revise o número.",
      severidade: "bloqueio",
    });
  }

  if (falta(e.inscricaoMunicipal)) {
    p.push({
      campo: "inscricaoMunicipal",
      label: "Inscrição municipal",
      mensagem:
        "É a inscrição do prestador na prefeitura; a NFS-e é recusada sem ela.",
      severidade: "bloqueio",
    });
  }

  if (!ehRegimeTributario(e.regimeTributario)) {
    p.push({
      campo: "regimeTributario",
      label: "Regime tributário",
      mensagem: "Define como o ISS e as retenções são apurados na nota.",
      severidade: "bloqueio",
    });
  }

  if (falta(e.itemListaServico)) {
    p.push({
      campo: "itemListaServico",
      label: "Item da lista de serviço",
      mensagem:
        "Item da LC 116/2003 (construção civil costuma ser 7.02 ou 7.05). Determina a alíquota e o município de incidência.",
      severidade: "bloqueio",
    });
  }

  if (!aliquotaIssValida(e.aliquotaIss)) {
    p.push({
      campo: "aliquotaIss",
      label: "Alíquota de ISS",
      mensagem: "Informe a alíquota do município (0 a 5%).",
      severidade: "bloqueio",
    });
  } else if ((e.aliquotaIss ?? 0) < 2 && !optantePeloSimples(e.regimeTributario)) {
    p.push({
      campo: "aliquotaIss",
      label: "Alíquota de ISS",
      mensagem:
        "Abaixo do piso de 2% (EC 37/2002). Só é correto em regime especial — confirme com a contabilidade.",
      severidade: "aviso",
    });
  }

  if (!codigoMunicipioValido(e.codigoMunicipio)) {
    p.push({
      campo: "codigoMunicipio",
      label: "Código IBGE do município",
      mensagem:
        "A API identifica o município pelo código de 7 dígitos, não pelo nome.",
      severidade: "bloqueio",
    });
  }

  if (falta(e.logradouro) || falta(e.numero) || falta(e.bairro)) {
    p.push({
      campo: "endereco",
      label: "Endereço",
      mensagem: "Logradouro, número e bairro compõem o endereço do prestador.",
      severidade: "bloqueio",
    });
  }

  if (!cepValido(e.cep)) {
    p.push({
      campo: "cep",
      label: "CEP",
      mensagem: "Informe os 8 dígitos do CEP.",
      severidade: "bloqueio",
    });
  }

  if (!ufValida(e.uf)) {
    p.push({
      campo: "uf",
      label: "UF",
      mensagem: "Informe a sigla do estado.",
      severidade: "bloqueio",
    });
  }

  if (falta(e.cnae)) {
    p.push({
      campo: "cnae",
      label: "CNAE",
      mensagem:
        "Alguns municípios exigem o CNAE do serviço prestado na NFS-e.",
      severidade: "aviso",
    });
  }

  if (falta(e.email)) {
    p.push({
      campo: "email",
      label: "E-mail",
      mensagem: "Usado pela prefeitura e pelo provedor para enviar a nota.",
      severidade: "aviso",
    });
  }

  return p;
}

/** Dá para emitir? Só quando não sobrou nenhuma pendência bloqueante. */
export function emitentePronto(e: EmitenteFiscal): boolean {
  return !checarProntidaoFiscal(e).some((p) => p.severidade === "bloqueio");
}
```

### `src/lib/fiscal/focus.ts`

```ts
/**
 * Cliente da API Focus NFe (v2) — a ÚNICA parte do app que conhece o provedor.
 *
 * O que a documentação define e este arquivo respeita:
 *
 *  - **Ambientes**: `https://homologacao.focusnfe.com.br` e
 *    `https://api.focusnfe.com.br`, ambos com prefixo `/v2`. Homologação não
 *    tem validade fiscal — é o padrão do cadastro por isso.
 *  - **Autenticação**: HTTP Basic com o TOKEN como usuário e senha VAZIA
 *    (`Basic base64("token:")`). Não há header de API key.
 *  - **Referência (`ref`)**: obrigatória na query string, única por token,
 *    só letras e números. Reenviar a mesma `ref` depois de um erro é o caminho
 *    de correção; depois de autorizada, aquela `ref` fica presa àquele
 *    documento para sempre.
 *  - **Fluxo assíncrono**: o POST devolve `processando_autorizacao`. A
 *    autorização chega por consulta ou por webhook — nunca na mesma requisição.
 *
 * O token vem de variável de ambiente, um por ambiente. Nada de credencial em
 * coluna de banco, e nada de token em log: mensagem de erro é montada sem ele.
 */

import {
  ehAmbienteFiscal,
  refValida,
  type AmbienteFiscal,
  type ErroNota,
  type ResultadoNota,
  type StatusNota,
} from "./tipos";
import type { PayloadNfse } from "./nfse-payload";

const BASES: Record<AmbienteFiscal, string> = {
  homologacao: "https://homologacao.focusnfe.com.br/v2",
  producao: "https://api.focusnfe.com.br/v2",
};

/** 20s: a pré-validação é síncrona, mas a fila do provedor pode demorar. */
const TIMEOUT_MS = 20_000;

export function tokenFocus(ambiente: AmbienteFiscal): string | null {
  const especifico =
    ambiente === "producao"
      ? process.env.FOCUS_NFE_TOKEN_PRODUCAO
      : process.env.FOCUS_NFE_TOKEN_HOMOLOGACAO;
  return especifico?.trim() || process.env.FOCUS_NFE_TOKEN?.trim() || null;
}

/** Dá para emitir neste ambiente? A tela usa isto para não oferecer o botão. */
export function focusConfigurado(ambiente: AmbienteFiscal = "homologacao"): boolean {
  return !!tokenFocus(ambiente);
}

export function resolverAmbiente(v: string | null | undefined): AmbienteFiscal {
  return ehAmbienteFiscal(v) ? v : "homologacao";
}

/** `Basic base64(token:)` — os dois-pontos com nada depois são intencionais. */
function cabecalhoAuth(token: string): string {
  return `Basic ${Buffer.from(`${token}:`, "utf8").toString("base64")}`;
}

/**
 * Traduz o vocabulário do provedor para o nosso.
 *
 * Status desconhecido cai em "processando" de propósito: tratar como erro uma
 * situação que só não sabemos ler faria o app declarar falha numa nota que
 * pode estar a caminho da autorização. Esperar e reconsultar é reversível;
 * declarar erro, não.
 */
export function traduzirStatus(status: string | undefined | null): StatusNota {
  switch ((status ?? "").toLowerCase()) {
    case "autorizado":
      return "autorizado";
    case "cancelado":
      return "cancelado";
    case "erro_autorizacao":
    case "erro":
      return "erro";
    case "nao_encontrada":
    case "nao_encontrado":
      return "nao_encontrada";
    default:
      return "processando";
  }
}

interface RespostaFocus {
  status?: string;
  ref?: string;
  numero?: string;
  numero_rps?: string;
  serie_rps?: string;
  codigo_verificacao?: string;
  data_emissao?: string;
  url?: string;
  caminho_xml_nota_fiscal?: string;
  caminho_xml_cancelamento?: string;
  url_danfse?: string;
  erros?: ErroNota[];
  codigo?: string;
  mensagem?: string;
  correcao?: string;
}

function mapear(ref: string, corpo: RespostaFocus, httpOk: boolean): ResultadoNota {
  // Erro de pré-validação (4xx) vem como {codigo, mensagem} — sem `status`.
  const erros: ErroNota[] =
    corpo.erros ??
    (!httpOk && corpo.mensagem
      ? [{ codigo: corpo.codigo, mensagem: corpo.mensagem, correcao: corpo.correcao }]
      : []);

  const status: StatusNota =
    !httpOk && !corpo.status ? "erro" : traduzirStatus(corpo.status);

  return {
    status,
    ref: corpo.ref || ref,
    numero: corpo.numero ?? null,
    codigoVerificacao: corpo.codigo_verificacao ?? null,
    numeroRps: corpo.numero_rps ?? null,
    serieRps: corpo.serie_rps ?? null,
    dataEmissao: corpo.data_emissao ?? null,
    urlEspelho: corpo.url ?? null,
    caminhoXml: corpo.caminho_xml_nota_fiscal ?? null,
    caminhoXmlCancelamento: corpo.caminho_xml_cancelamento ?? null,
    urlDanfse: corpo.url_danfse ?? null,
    erros: erros.length > 0 ? erros : undefined,
    bruto: corpo,
  };
}

async function chamar(
  ambiente: AmbienteFiscal,
  metodo: "POST" | "GET" | "DELETE",
  caminho: string,
  corpo?: unknown,
): Promise<{ ok: boolean; json: RespostaFocus; http: number }> {
  const token = tokenFocus(ambiente);
  if (!token) {
    throw new Error(
      `Token do provedor fiscal não configurado para ${ambiente} — defina FOCUS_NFE_TOKEN.`,
    );
  }
  const resp = await fetch(`${BASES[ambiente]}${caminho}`, {
    method: metodo,
    headers: {
      Authorization: cabecalhoAuth(token),
      "Content-Type": "application/json",
      Accept: "application/json",
    },
    body: corpo === undefined ? undefined : JSON.stringify(corpo),
    signal: AbortSignal.timeout(TIMEOUT_MS),
    cache: "no-store",
  });

  const bruto = await resp.text();
  let json: RespostaFocus = {};
  if (bruto) {
    try {
      json = JSON.parse(bruto) as RespostaFocus;
    } catch {
      // 401 devolve HTML ("HTTP Basic: Access denied"). Vira erro legível sem
      // ecoar a resposta inteira (que pode conter cabeçalho de autenticação).
      json = {
        codigo: `http_${resp.status}`,
        mensagem:
          resp.status === 401
            ? "Provedor recusou a autenticação — verifique o token do ambiente."
            : `Resposta inesperada do provedor (HTTP ${resp.status}).`,
      };
    }
  }
  return { ok: resp.ok, json, http: resp.status };
}

/**
 * Envia a NFS-e. Resposta 201 significa ACEITA PARA PROCESSAMENTO, não
 * autorizada — quem confirma é o webhook ou a consulta.
 */
export async function emitirNfse(
  ambiente: AmbienteFiscal,
  ref: string,
  payload: PayloadNfse,
): Promise<ResultadoNota> {
  if (!refValida(ref)) {
    throw new Error("Referência inválida: use apenas letras e números.");
  }
  const { ok, json } = await chamar(
    ambiente,
    "POST",
    `/nfse?ref=${encodeURIComponent(ref)}`,
    payload,
  );
  return mapear(ref, json, ok);
}

/** Consulta o estado atual da nota pela referência. */
export async function consultarNfse(
  ambiente: AmbienteFiscal,
  ref: string,
): Promise<ResultadoNota> {
  const { ok, json, http } = await chamar(
    ambiente,
    "GET",
    `/nfse/${encodeURIComponent(ref)}`,
  );
  if (http === 404) {
    return { status: "nao_encontrada", ref, bruto: json };
  }
  return mapear(ref, json, ok);
}

/**
 * Cancela uma NFS-e autorizada.
 *
 * O prazo é da PREFEITURA e varia por município — algumas recusam cancelamento
 * fora do mês de competência. Recusa vem como erro do provedor, não como
 * exceção: quem decide o que fazer é a tela.
 */
export async function cancelarNfse(
  ambiente: AmbienteFiscal,
  ref: string,
  justificativa?: string,
): Promise<ResultadoNota> {
  const { ok, json } = await chamar(
    ambiente,
    "DELETE",
    `/nfse/${encodeURIComponent(ref)}`,
    justificativa?.trim() ? { justificativa: justificativa.trim() } : undefined,
  );
  return mapear(ref, json, ok);
}
```

### `src/lib/fiscal/tipos.ts`

```ts
/**
 * Contrato NEUTRO com o provedor de emissão de nota fiscal.
 *
 * O app fala com estes tipos; quem fala "focusnfe" é só `focus.ts`. A troca de
 * provedor (ou a convivência com dois, durante a migração para a NFS-e
 * Nacional) não deveria vazar para as telas nem para o banco.
 *
 * Os status abaixo são os NOSSOS — o vocabulário do provedor é traduzido na
 * borda. São quatro porque quatro é o que muda o comportamento do sistema:
 * esperar, arquivar, mostrar erro ou registrar cancelamento.
 */

export type StatusNota =
  /** aceita pelo provedor, aguardando a prefeitura. Estado normal logo após o envio. */
  | "processando"
  | "autorizado"
  | "cancelado"
  /** rejeitada pela prefeitura ou pela pré-validação — `erros` explica. */
  | "erro"
  /** o provedor não conhece esta referência. */
  | "nao_encontrada";

export interface ErroNota {
  codigo?: string;
  mensagem: string;
  correcao?: string;
}

export interface ResultadoNota {
  status: StatusNota;
  ref: string;
  /** número da NFS-e (existe só depois de autorizada). */
  numero?: string | null;
  codigoVerificacao?: string | null;
  numeroRps?: string | null;
  serieRps?: string | null;
  dataEmissao?: string | null;
  /** espelho HTML da nota no provedor. */
  urlEspelho?: string | null;
  caminhoXml?: string | null;
  caminhoXmlCancelamento?: string | null;
  urlDanfse?: string | null;
  erros?: ErroNota[];
  /**
   * Resposta crua do provedor, para gravar no log de eventos.
   *
   * Rejeição de prefeitura vem com mensagem obscura e específica do município;
   * sem o corpo original guardado, diagnosticar depois vira adivinhação.
   */
  bruto?: unknown;
}

export type AmbienteFiscal = "homologacao" | "producao";

export function ehAmbienteFiscal(v: string | null | undefined): v is AmbienteFiscal {
  return v === "homologacao" || v === "producao";
}

/**
 * Referência da emissão (`ref`): identificador nosso, único por token.
 *
 * A API aceita apenas letras e números — nada de hífen, ponto ou espaço. Como
 * as chaves do banco são UUID (que tem hífen), a conversão precisa ser explícita
 * e sempre a mesma: o mesmo registro tem que produzir a mesma `ref`, senão uma
 * reemissão viraria nota duplicada em vez de retomar a anterior.
 */
export function refDaNota(id: string): string {
  return id.replace(/[^A-Za-z0-9]/g, "");
}

export function refValida(ref: string): boolean {
  return /^[A-Za-z0-9]{1,50}$/.test(ref);
}
```

### `src/lib/audit-diff.ts` — usado pelo log de `salvarDadosFiscais`

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

---

## 4. A tabela `tenant` no schema e a migração 0039

### `src/lib/db/schema.ts:97–147` — tabela `tenant`, todas as colunas

```ts
/**
 * Empresa cliente (incorporadora). Ver docs/SPEC.md §1.
 *
 * O bloco fiscal existe para a EMISSÃO de nota (ver docs/EMISSAO-NF.md): são os
 * dados do prestador que a prefeitura exige na NFS-e e que o provedor de
 * emissão exige no cadastro da empresa. Todos NULÁVEIS — tenant que não emite
 * nota segue funcionando sem preencher nada, e `checarProntidaoFiscal`
 * (src/lib/calc/emitente-fiscal.ts) é quem diz se já dá para emitir.
 *
 * O token do provedor NÃO mora aqui: credencial de emissão vale dinheiro e vai
 * em variável de ambiente/secret, não em coluna de banco lida por toda query de
 * tenant.
 */
export const tenants = pgTable("tenant", {
  id: uuid("id").primaryKey().defaultRandom(),
  /** razão social — é o que vai no corpo da nota. */
  name: text("name").notNull(),
  /** chave do logo no storage R2. */
  logoKey: text("logo_key"),
  // ── Identificação fiscal do emitente ───────────────────────────────────
  nomeFantasia: text("nome_fantasia"),
  /** aceita CNPJ alfanumérico (IN RFB 2.229/2024). Gravado sem máscara. */
  cnpj: text("cnpj"),
  inscricaoMunicipal: text("inscricao_municipal"),
  inscricaoEstadual: text("inscricao_estadual"),
  /** SIMPLES | SIMPLES_EXCESSO | LUCRO_PRESUMIDO | LUCRO_REAL | MEI. */
  regimeTributario: text("regime_tributario"),
  /** regime especial da nota (1..6), quando o município exigir. */
  regimeEspecial: text("regime_especial"),
  /** item da lista da LC 116/2003 — 7.02 / 7.05 na construção civil. */
  itemListaServico: text("item_lista_servico"),
  codigoTributarioMunicipio: text("codigo_tributario_municipio"),
  cnae: text("cnae"),
  /** alíquota de ISS em % (até 4 casas: alguns municípios usam). */
  aliquotaIss: numeric("aliquota_iss", { precision: 8, scale: 4 }),
  // ── Endereço do prestador ──────────────────────────────────────────────
  logradouro: text("logradouro"),
  numeroEndereco: text("numero_endereco"),
  complemento: text("complemento"),
  bairro: text("bairro"),
  /** código IBGE de 7 dígitos — é assim que a API identifica o município. */
  codigoMunicipio: text("codigo_municipio"),
  municipio: text("municipio"),
  uf: text("uf"),
  cep: text("cep"),
  telefone: text("telefone"),
  emailFiscal: text("email_fiscal"),
  /** ambiente de emissão: "homologacao" (padrão) | "producao". */
  fiscalAmbiente: text("fiscal_ambiente").notNull().default("homologacao"),
  createdAt: timestamp("created_at", { mode: "date" }).notNull().defaultNow(),
});
```

São **26 colunas**: `id`, `name`, `logo_key`, `created_at` (as quatro
originais) e as 22 fiscais criadas pela 0039 — 10 de identificação fiscal, 11 de
endereço/contato e `fiscal_ambiente`.

`pgTable("tenant", {...})` é chamada com **um único argumento**: não há o
segundo parâmetro `(t) => [...]`, portanto nenhum índice nem constraint composta.
Nenhuma coluna fiscal tem `UNIQUE` — inclusive `cnpj`, que pode repetir entre
tenants.

### `src/lib/db/migrations/0039_emitente_fiscal.sql` — inteira

```sql
-- 0039 — Cadastro fiscal do EMITENTE e da obra (preparação da emissão de NF).
--
-- ADITIVA E REVERSÍVEL. Só acrescenta colunas NULÁVEIS em `tenant` e `project`.
-- Nenhum registro é apagado, alterado ou reclassificado: tenants e projetos
-- existentes continuam exatamente como estão, com as colunas novas em branco.
-- Todas as instruções usam IF NOT EXISTS para poderem ser reaplicadas após um
-- rollback (as migrações rodam no boot do contêiner).
--
-- Por quê: até aqui o app só REGISTRAVA nota fiscal recebida de fornecedor
-- (`documento_fiscal`, filha de `despesa`). Para EMITIR é preciso conhecer o
-- prestador — CNPJ, inscrição municipal, regime, item da lista de serviço e
-- endereço com código IBGE. Ver docs/EMISSAO-NF.md.
--
-- O token do provedor de emissão NÃO entra aqui de propósito: credencial vai em
-- variável de ambiente, não em coluna lida por toda query de tenant.

-- ── Identificação fiscal do emitente ─────────────────────────────────────
ALTER TABLE "tenant" ADD COLUMN IF NOT EXISTS "nome_fantasia" text;--> statement-breakpoint
ALTER TABLE "tenant" ADD COLUMN IF NOT EXISTS "cnpj" text;--> statement-breakpoint
ALTER TABLE "tenant" ADD COLUMN IF NOT EXISTS "inscricao_municipal" text;--> statement-breakpoint
ALTER TABLE "tenant" ADD COLUMN IF NOT EXISTS "inscricao_estadual" text;--> statement-breakpoint
ALTER TABLE "tenant" ADD COLUMN IF NOT EXISTS "regime_tributario" text;--> statement-breakpoint
ALTER TABLE "tenant" ADD COLUMN IF NOT EXISTS "regime_especial" text;--> statement-breakpoint
ALTER TABLE "tenant" ADD COLUMN IF NOT EXISTS "item_lista_servico" text;--> statement-breakpoint
ALTER TABLE "tenant" ADD COLUMN IF NOT EXISTS "codigo_tributario_municipio" text;--> statement-breakpoint
ALTER TABLE "tenant" ADD COLUMN IF NOT EXISTS "cnae" text;--> statement-breakpoint
ALTER TABLE "tenant" ADD COLUMN IF NOT EXISTS "aliquota_iss" numeric(8, 4);--> statement-breakpoint

-- ── Endereço do prestador ────────────────────────────────────────────────
ALTER TABLE "tenant" ADD COLUMN IF NOT EXISTS "logradouro" text;--> statement-breakpoint
ALTER TABLE "tenant" ADD COLUMN IF NOT EXISTS "numero_endereco" text;--> statement-breakpoint
ALTER TABLE "tenant" ADD COLUMN IF NOT EXISTS "complemento" text;--> statement-breakpoint
ALTER TABLE "tenant" ADD COLUMN IF NOT EXISTS "bairro" text;--> statement-breakpoint
ALTER TABLE "tenant" ADD COLUMN IF NOT EXISTS "codigo_municipio" text;--> statement-breakpoint
ALTER TABLE "tenant" ADD COLUMN IF NOT EXISTS "municipio" text;--> statement-breakpoint
ALTER TABLE "tenant" ADD COLUMN IF NOT EXISTS "uf" text;--> statement-breakpoint
ALTER TABLE "tenant" ADD COLUMN IF NOT EXISTS "cep" text;--> statement-breakpoint
ALTER TABLE "tenant" ADD COLUMN IF NOT EXISTS "telefone" text;--> statement-breakpoint
ALTER TABLE "tenant" ADD COLUMN IF NOT EXISTS "email_fiscal" text;--> statement-breakpoint

-- Ambiente de emissão. Nasce em "homologacao" para TODO tenant existente: nota
-- de teste não tem validade fiscal, e o padrão inverso emitiria nota real por
-- acidente na primeira tentativa de integração.
ALTER TABLE "tenant"
  ADD COLUMN IF NOT EXISTS "fiscal_ambiente" text NOT NULL DEFAULT 'homologacao';--> statement-breakpoint

-- ── Dados fiscais da obra ────────────────────────────────────────────────
-- Na construção civil o ISS é devido no município da obra (LC 116/2003, art.
-- 3º, III), que nem sempre é o da sede — por isso o município de incidência
-- fica no projeto.
ALTER TABLE "project" ADD COLUMN IF NOT EXISTS "codigo_municipio_obra" text;--> statement-breakpoint
ALTER TABLE "project" ADD COLUMN IF NOT EXISTS "municipio_obra" text;--> statement-breakpoint
ALTER TABLE "project" ADD COLUMN IF NOT EXISTS "uf_obra" text;--> statement-breakpoint
ALTER TABLE "project" ADD COLUMN IF NOT EXISTS "codigo_obra" text;--> statement-breakpoint
ALTER TABLE "project" ADD COLUMN IF NOT EXISTS "art" text;
```

### `src/lib/db/migrations/down/0039_emitente_fiscal.sql` — o rollback

```sql
-- ROLLBACK da 0039 (ver docs/ROLLBACK.md).
--
-- Remove APENAS as colunas fiscais que a 0039 criou em `tenant` e `project`.
-- Nome do tenant, logo, projetos, versões, despesas e receitas não são tocados:
-- some só o cadastro fiscal do emitente e os dados fiscais da obra.
--
-- Se o cadastro fiscal já tiver sido preenchido e você quiser preservá-lo,
-- exporte antes:
--   \copy (SELECT id, name, cnpj, inscricao_municipal, inscricao_estadual,
--                 regime_tributario, regime_especial, item_lista_servico,
--                 codigo_tributario_municipio, cnae, aliquota_iss, logradouro,
--                 numero_endereco, complemento, bairro, codigo_municipio,
--                 municipio, uf, cep, telefone, email_fiscal, fiscal_ambiente
--            FROM tenant WHERE cnpj IS NOT NULL)
--     TO 'tenant_fiscal.csv' CSV HEADER
--   \copy (SELECT id, name, codigo_municipio_obra, municipio_obra, uf_obra,
--                 codigo_obra, art
--            FROM project WHERE codigo_municipio_obra IS NOT NULL)
--     TO 'project_fiscal.csv' CSV HEADER

ALTER TABLE "project" DROP COLUMN IF EXISTS "art";
ALTER TABLE "project" DROP COLUMN IF EXISTS "codigo_obra";
ALTER TABLE "project" DROP COLUMN IF EXISTS "uf_obra";
ALTER TABLE "project" DROP COLUMN IF EXISTS "municipio_obra";
ALTER TABLE "project" DROP COLUMN IF EXISTS "codigo_municipio_obra";

ALTER TABLE "tenant" DROP COLUMN IF EXISTS "fiscal_ambiente";
ALTER TABLE "tenant" DROP COLUMN IF EXISTS "email_fiscal";
ALTER TABLE "tenant" DROP COLUMN IF EXISTS "telefone";
ALTER TABLE "tenant" DROP COLUMN IF EXISTS "cep";
ALTER TABLE "tenant" DROP COLUMN IF EXISTS "uf";
ALTER TABLE "tenant" DROP COLUMN IF EXISTS "municipio";
ALTER TABLE "tenant" DROP COLUMN IF EXISTS "codigo_municipio";
ALTER TABLE "tenant" DROP COLUMN IF EXISTS "bairro";
ALTER TABLE "tenant" DROP COLUMN IF EXISTS "complemento";
ALTER TABLE "tenant" DROP COLUMN IF EXISTS "numero_endereco";
ALTER TABLE "tenant" DROP COLUMN IF EXISTS "logradouro";
ALTER TABLE "tenant" DROP COLUMN IF EXISTS "aliquota_iss";
ALTER TABLE "tenant" DROP COLUMN IF EXISTS "cnae";
ALTER TABLE "tenant" DROP COLUMN IF EXISTS "codigo_tributario_municipio";
ALTER TABLE "tenant" DROP COLUMN IF EXISTS "item_lista_servico";
ALTER TABLE "tenant" DROP COLUMN IF EXISTS "regime_especial";
ALTER TABLE "tenant" DROP COLUMN IF EXISTS "regime_tributario";
ALTER TABLE "tenant" DROP COLUMN IF EXISTS "inscricao_estadual";
ALTER TABLE "tenant" DROP COLUMN IF EXISTS "inscricao_municipal";
ALTER TABLE "tenant" DROP COLUMN IF EXISTS "cnpj";
ALTER TABLE "tenant" DROP COLUMN IF EXISTS "nome_fantasia";

-- A linha da 0039 precisa sair do journal do drizzle para que a migração seja
-- reaplicada no próximo boot.
DELETE FROM drizzle.__drizzle_migrations
 WHERE hash IN (
   SELECT hash FROM drizzle.__drizzle_migrations ORDER BY created_at DESC LIMIT 1
 );
```

Nota sobre a 0039 em relação às travas de produção do SOW: ela é **aditiva**
(só `ADD COLUMN IF NOT EXISTS`, nenhum `DROP`, `TRUNCATE` ou `DELETE`), e tem
`down` escrito. O `down`, por ser rollback, contém `DROP COLUMN IF EXISTS` — e o
próprio arquivo abre com o `\copy` de exportação antes de derrubar as colunas.

### Onde a linha do tenant nasce

`src/lib/tenant/provision.ts:95–98` cria o tenant apenas com o nome; todas as
colunas fiscais nascem `NULL`, e `fiscal_ambiente` nasce `'homologacao'` pelo
DEFAULT da coluna:

```ts
      const [tenant] = await tx
        .insert(schema.tenants)
        .values({ name: tenantName })
        .returning();
```

---

## 5. Tudo que lê os campos fiscais fora desta tela

Grep de todas as 22 colunas fiscais (`cnpj`, `inscricaoMunicipal`,
`regimeTributario`, `itemListaServico`, `aliquotaIss`, `codigoMunicipio`,
`fiscalAmbiente`, `nomeFantasia`, `emailFiscal`, `codigoTributarioMunicipio`,
`regimeEspecial`, `inscricaoEstadual`, …) em `src/`:

| Arquivo | Lê campo fiscal **do tenant**? | O que faz |
|---|---|---|
| `src/app/(app)/empresa/page.tsx` | **sim**, todos os 22 | a própria tela |
| `src/lib/actions/empresa.ts` | **sim**, todos os 22 | a própria action |
| `src/lib/calc/emitente-fiscal.ts` | recebe por argumento | checklist + validadores |
| `src/lib/fiscal/nfse-payload.ts` | recebe por argumento | monta o JSON da NFS-e |
| `src/lib/actions/despesas.ts:903` | **sim** — `ctx.tenant.cnpj` | manda o CNPJ da empresa para o prompt da IA |
| `src/lib/queries.ts:1509–1513` | **sim**, `select()` sem projeção | `getAllTenantsOverview` (super-admin) traz a linha inteira |
| `src/lib/context.ts:65–69` | **sim**, `select()` sem projeção | `getActiveContext` carrega a linha inteira em `ctx.tenant` |
| `src/components/app/fornecedor-form.tsx` | **não** | `nomeFantasia` é do **fornecedor** (stakeholder) |
| `src/lib/ai/fornecedor-doc.ts`, `fornecedor-extract.ts` | **não** | idem — dados do fornecedor |
| `src/lib/ai/despesa-prompt.ts:26`, `:64` | recebe por argumento | recebe `{nome, cnpj}` da empresa vindos de `despesas.ts:903` |
| `src/lib/calc/nfse.ts` | **não** | recebe `aliquotaIss` como número na entrada |

**Emissão de NFS-e:** nenhuma tela, action ou rota chama `emitirNfse`,
`consultarNfse`, `cancelarNfse` ou `montarPayloadNfse` — ver a pergunta (g).

**Relatórios e impressão:** nenhum consumidor. O repositório não tem biblioteca
de PDF nem de e-mail (grep por `nodemailer`, `resend`, `sendMail`, `jsPDF`,
`pdfkit`, `puppeteer` não devolve nada em `src/`), e o único `PrintButton` do
app está em `/medicao`, que não lê campo fiscal algum.

### `src/lib/actions/despesas.ts:897–905` — o único consumidor real fora da tela

```ts
    const extraido = await extractDespesaFromDocument(docs, {
      fornecedores: fornecedores.map((f) => ({ nome: f.nome, doc: f.doc })),
      contas: contas.map((c) => ({ code: c.code, name: c.name })),
      projetos: projetos.map((p) => ({ nome: p.nome })),
      categorias,
      tiposDocumento: TIPOS_DOCUMENTO,
      empresa: { nome: ctx.tenant.name, cnpj: ctx.tenant.cnpj },
    });

```

### `src/lib/ai/despesa-prompt.ts:20–27` e `:60–66` — onde esse CNPJ é usado

```ts
  fornecedores: { nome: string; doc: string | null }[];
  contas: { code: string; name: string }[];
  projetos: { nome: string }[];
  categorias: readonly string[];
  tiposDocumento: readonly { id: string; label: string }[];
  /** A própria empresa — para NÃO ser confundida com o fornecedor. */
  empresa: { nome: string; cnpj: string | null };
}
```


```ts
  return (
    "Você lê documentos de compra de uma construtora (nota fiscal, cupom, boleto, " +
    "comprovante de pagamento, recibo, foto de papel) e preenche o lançamento da despesa.\n\n" +
    `EMPRESA QUE ESTÁ LANÇANDO (é a PAGADORA — nunca a fornecedora): ${ctx.empresa.nome}` +
    (ctx.empresa.cnpj ? ` — CNPJ ${ctx.empresa.cnpj}` : "") +
    ".\nEm comprovante de Pix/TED, o fornecedor é o RECEBEDOR, não o pagador. " +
    "Nunca devolva os dados da empresa acima como fornecedor.\n\n" +
```

### `src/lib/fiscal/nfse-payload.ts` — quem *leria* os campos, se algo o chamasse

```ts
/**
 * Montagem do payload da NFS-e a partir dos dados do app.
 *
 * Função PURA e testável: recebe emitente, obra, tomador e serviço; devolve o
 * JSON que o provedor espera, ou a lista do que falta. Deixar isso fora do
 * cliente HTTP é o que permite testar o mapeamento sem rede — e é onde moram as
 * duas decisões que mais erram nota de construtora:
 *
 *  1. **Município de incidência.** Na construção civil o ISS é devido no
 *     município da OBRA (LC 116/2003, art. 3º, III). `servico.codigo_municipio`
 *     sai do projeto, não da sede — e a natureza da operação é derivada dessa
 *     comparação, não escolhida a dedo.
 *  2. **Bruto × líquido.** O que vai na nota é o bruto; o que entra no caixa é o
 *     líquido. O cálculo vem de `calc/nfse.ts` e os dois números saem daqui
 *     juntos, para o Contas a Receber não usar o número errado.
 *
 * Referência dos campos: API Focus NFe v2, `POST /v2/nfse` (doc "Emitir NFSe").
 */

import {
  cnpjValido,
  codigoMunicipioValido,
  ehRegimeEspecial,
  emitentePronto,
  normalizarCnpj,
  optantePeloSimples,
  type EmitenteFiscal,
} from "@/lib/calc/emitente-fiscal";
import {
  calcularNfse,
  naturezaPorMunicipio,
  validarNfse,
  type EntradaNfse,
  type ResultadoNfse,
} from "@/lib/calc/nfse";

/** Dados fiscais da obra que a nota de construção civil carrega. */
export interface ObraFiscal {
  /** código IBGE do município onde a obra é executada. */
  codigoMunicipio?: string | null;
  /** matrícula CNO/CEI — campo `codigo_obra`, máx. 15 caracteres. */
  codigoObra?: string | null;
  /** ART/RRT do responsável técnico. Ignorado por alguns municípios. */
  art?: string | null;
}

export interface EnderecoTomador {
  logradouro?: string | null;
  numero?: string | null;
  complemento?: string | null;
  bairro?: string | null;
  codigoMunicipio?: string | null;
  uf?: string | null;
  cep?: string | null;
}

export interface TomadorNfse {
  cnpj?: string | null;
  cpf?: string | null;
  razaoSocial?: string | null;
  inscricaoMunicipal?: string | null;
  email?: string | null;
  telefone?: string | null;
  endereco?: EnderecoTomador | null;
}

export interface ServicoNfse {
  /** o que aparece no corpo da nota. */
  discriminacao: string;
  valores: EntradaNfse;
  /** sobrepõem o cadastro do emitente quando o contrato exigir outro item. */
  itemListaServico?: string | null;
  codigoTributarioMunicipio?: string | null;
  cnae?: string | null;
}

export interface DadosEmissaoNfse {
  emitente: EmitenteFiscal;
  obra?: ObraFiscal | null;
  tomador: TomadorNfse;
  servico: ServicoNfse;
  /** ISO 8601 com fuso, ex.: "2026-08-26T10:30:00-03:00". */
  dataEmissao: string;
}

/** Payload conforme `POST /v2/nfse`. Campos ausentes são omitidos, não nulos. */
export interface PayloadNfse {
  data_emissao: string;
  natureza_operacao: string;
  optante_simples_nacional: boolean;
  regime_especial_tributacao?: string;
  prestador: {
    cnpj: string;
    inscricao_municipal: string;
    codigo_municipio?: string;
  };
  tomador: Record<string, unknown>;
  servico: Record<string, unknown>;
  codigo_obra?: string;
  art?: string;
}

export interface MontagemNfse {
  payload?: PayloadNfse;
  /** o que impede a emissão. Vazio = pode enviar. */
  erros: string[];
  /** os valores calculados, para gravar junto da nota. */
  calculo?: ResultadoNfse;
}

const soDigitos = (v: string | null | undefined) => (v ?? "").replace(/\D/g, "");
const texto = (v: string | null | undefined) => (v ?? "").trim();

/** Omite chaves vazias: alguns municípios rejeitam campo presente e em branco. */
function limpar(obj: Record<string, unknown>): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(obj)) {
    if (v === undefined || v === null || v === "") continue;
    if (typeof v === "object" && !Array.isArray(v)) {
      const dentro = limpar(v as Record<string, unknown>);
      if (Object.keys(dentro).length > 0) out[k] = dentro;
      continue;
    }
    out[k] = v;
  }
  return out;
}

/**
 * Monta o payload — ou explica o que falta.
 *
 * Nunca lança: devolver a lista de pendências deixa a tela mostrar todas de uma
 * vez, em vez de o usuário descobrir uma por tentativa.
 */
export function montarPayloadNfse(d: DadosEmissaoNfse): MontagemNfse {
  const erros: string[] = [];
  const { emitente, tomador, servico, obra } = d;

  if (!emitentePronto(emitente)) {
    erros.push(
      "O cadastro fiscal da empresa está incompleto — complete em Config › Empresa.",
    );
  }
  if (!cnpjValido(emitente.cnpj)) erros.push("CNPJ do emitente inválido.");

  const cnpjTomador = soDigitos(tomador.cnpj);
  const cpfTomador = soDigitos(tomador.cpf);
  if (!cnpjTomador && !cpfTomador) {
    erros.push("Informe o CPF ou o CNPJ do tomador.");
  }
  if (cnpjTomador && !cnpjValido(tomador.cnpj)) {
    erros.push("CNPJ do tomador inválido.");
  }

  if (!texto(servico.discriminacao)) {
    erros.push("Informe a discriminação do serviço.");
  }

  const erroValores = validarNfse(servico.valores);
  if (erroValores) erros.push(erroValores);

  const itemLista = texto(servico.itemListaServico) || texto(emitente.itemListaServico);
  if (!itemLista) erros.push("Informe o item da lista de serviço (LC 116/2003).");

  // Município de PRESTAÇÃO: o da obra manda; sem obra informada, o da sede.
  const municipioPrestacao =
    soDigitos(obra?.codigoMunicipio) || soDigitos(emitente.codigoMunicipio);
  if (!codigoMunicipioValido(municipioPrestacao)) {
    erros.push(
      "Informe o código IBGE do município da obra (ou do prestador, se a obra não tiver município cadastrado).",
    );
  }

  if (erros.length > 0) return { erros };

  const calculo = calcularNfse(servico.valores);
  const v = servico.valores;

  const payload: PayloadNfse = {
    data_emissao: d.dataEmissao,
    natureza_operacao: naturezaPorMunicipio(
      emitente.codigoMunicipio,
      municipioPrestacao,
    ),
    optante_simples_nacional: optantePeloSimples(emitente.regimeTributario),
    prestador: {
      cnpj: normalizarCnpj(emitente.cnpj)!,
      inscricao_municipal: texto(emitente.inscricaoMunicipal),
      codigo_municipio: soDigitos(emitente.codigoMunicipio) || undefined,
    },
    tomador: limpar({
      cnpj: cnpjTomador || undefined,
      cpf: cpfTomador || undefined,
      razao_social: texto(tomador.razaoSocial) || undefined,
      inscricao_municipal: soDigitos(tomador.inscricaoMunicipal) || undefined,
      email: texto(tomador.email) || undefined,
      // A API aceita no máximo 11 dígitos no telefone.
      telefone: soDigitos(tomador.telefone).slice(0, 11) || undefined,
      endereco: tomador.endereco
        ? {
            logradouro: texto(tomador.endereco.logradouro) || undefined,
            numero: texto(tomador.endereco.numero) || undefined,
            complemento: texto(tomador.endereco.complemento) || undefined,
            bairro: texto(tomador.endereco.bairro) || undefined,
            codigo_municipio: soDigitos(tomador.endereco.codigoMunicipio) || undefined,
            uf: texto(tomador.endereco.uf).toUpperCase() || undefined,
            cep: soDigitos(tomador.endereco.cep) || undefined,
          }
        : undefined,
    }),
    servico: limpar({
      valor_servicos: v.valorServicos,
      valor_deducoes: v.valorDeducoes || undefined,
      desconto_incondicionado: v.descontoIncondicionado || undefined,
      desconto_condicionado: v.descontoCondicionado || undefined,
      base_calculo: calculo.baseCalculo,
      aliquota: v.aliquotaIss,
      valor_iss: calculo.valorIss,
      iss_retido: v.issRetido,
      // A API só quer este campo quando há retenção de fato.
      valor_iss_retido: calculo.valorIssRetido || undefined,
      valor_pis: calculo.retencoes.pis || undefined,
      valor_cofins: calculo.retencoes.cofins || undefined,
      valor_csll: calculo.retencoes.csll || undefined,
      valor_ir: calculo.retencoes.ir || undefined,
      valor_inss: calculo.retencoes.inss || undefined,
      outras_retencoes: calculo.outrasRetencoes || undefined,
      item_lista_servico: itemLista,
      codigo_tributario_municipio:
        texto(servico.codigoTributarioMunicipio) ||
        texto(emitente.codigoTributarioMunicipio) ||
        undefined,
      codigo_cnae: soDigitos(servico.cnae) || soDigitos(emitente.cnae) || undefined,
      discriminacao: texto(servico.discriminacao),
      codigo_municipio: municipioPrestacao,
    }) as PayloadNfse["servico"],
  };

  if (ehRegimeEspecial(emitente.regimeEspecial)) {
    payload.regime_especial_tributacao = emitente.regimeEspecial;
  }
  // Campos de construção civil: 15 caracteres é o limite da API.
  const codigoObra = texto(obra?.codigoObra);
  if (codigoObra) payload.codigo_obra = codigoObra.slice(0, 15);
  const art = texto(obra?.art);
  if (art) payload.art = art.slice(0, 15);

  return { payload, erros: [], calculo };
}
```

### `src/lib/calc/nfse.ts` — o cálculo que o payload usa

```ts
/**
 * Cálculo dos valores da NFS-e.
 *
 * Produz exatamente os números que vão no bloco `servico` da nota (base de
 * cálculo, ISS, retenções) e o **valor líquido a receber** — que é o que
 * interessa ao Contas a Receber e à conciliação de caixa. Nota de R$ 100.000
 * com ISS retido e INSS não deposita R$ 100.000 na conta; se o sistema tratar
 * bruto e líquido como a mesma coisa, toda conciliação vai acusar diferença.
 *
 * ## O que este módulo NÃO decide
 *
 * **Quais tributos incidem.** Retenção federal em serviço de construção civil
 * depende do tipo de contrato (empreitada global × cessão de mão de obra), do
 * regime do prestador e da natureza do tomador — regra que muda por contrato e
 * que a contabilidade do cliente define, não o software. Aqui cada retenção é
 * informada explicitamente (alíquota e, quando for o caso, base própria); o
 * módulo só faz a conta. Um padrão embutido produziria nota errada com
 * aparência de nota certa, que é o pior resultado possível.
 *
 * A convenção de base segue a prática fiscal: o **ISS** incide sobre a base de
 * cálculo (serviços menos deduções e desconto incondicionado) e as **retenções
 * federais** sobre o valor bruto dos serviços, salvo base informada caso a caso
 * — é comum o INSS ter base própria (só a parcela de mão de obra).
 */

const round2 = (v: number) => Math.round(v * 100) / 100;

/** Uma retenção federal: alíquota em % e, opcionalmente, base própria. */
export interface RetencaoFederal {
  aliquota: number;
  /** Base própria. Ausente = valor bruto dos serviços. */
  base?: number;
}

export interface RetencoesFederais {
  pis?: RetencaoFederal;
  cofins?: RetencaoFederal;
  csll?: RetencaoFederal;
  /** IRRF. */
  ir?: RetencaoFederal;
  /** INSS — costuma ter base própria (parcela de mão de obra da medição). */
  inss?: RetencaoFederal;
}

export interface EntradaNfse {
  valorServicos: number;
  /** Deduções admitidas pelo município (materiais, subempreitada). */
  valorDeducoes?: number;
  descontoIncondicionado?: number;
  descontoCondicionado?: number;
  /** Alíquota do ISS em % (0 a 5). */
  aliquotaIss: number;
  /** O tomador retém o ISS? */
  issRetido: boolean;
  retencoes?: RetencoesFederais;
  /** Retenções municipais/contratuais que não têm campo próprio. */
  outrasRetencoes?: number;
}

export interface ResultadoNfse {
  baseCalculo: number;
  valorIss: number;
  /** Só é maior que zero quando o ISS é retido pelo tomador. */
  valorIssRetido: number;
  retencoes: { pis: number; cofins: number; csll: number; ir: number; inss: number };
  totalRetencoesFederais: number;
  outrasRetencoes: number;
  /** Tudo que o tomador retém e recolhe no lugar do prestador. */
  totalRetencoes: number;
  /** Bruto menos desconto incondicionado menos retenções. */
  valorLiquido: number;
  /** O mesmo, caso o desconto condicionado se concretize. */
  valorLiquidoComDescontoCondicionado: number;
}

const naoNegativo = (v: number | undefined | null) =>
  !v || !Number.isFinite(v) || v < 0 ? 0 : v;

function aplicar(
  ret: RetencaoFederal | undefined,
  baseBruta: number,
): number {
  if (!ret || !Number.isFinite(ret.aliquota) || ret.aliquota <= 0) return 0;
  const base = ret.base === undefined ? baseBruta : naoNegativo(ret.base);
  return round2((base * ret.aliquota) / 100);
}

/**
 * Recusa o que a prefeitura recusaria — ou o que produziria nota sem sentido.
 * Devolve `null` quando está tudo certo.
 */
export function validarNfse(e: EntradaNfse): string | null {
  if (!Number.isFinite(e.valorServicos) || e.valorServicos <= 0) {
    return "O valor dos serviços deve ser maior que zero.";
  }
  if (!Number.isFinite(e.aliquotaIss) || e.aliquotaIss < 0 || e.aliquotaIss > 5) {
    return "A alíquota do ISS deve estar entre 0 e 5%.";
  }
  const deducoes = naoNegativo(e.valorDeducoes);
  const descIncond = naoNegativo(e.descontoIncondicionado);
  if (deducoes + descIncond > e.valorServicos) {
    return "Deduções e desconto incondicionado não podem superar o valor dos serviços.";
  }
  return null;
}

/**
 * Calcula os valores da nota.
 *
 * Assume entrada já validada por `validarNfse` — valores negativos são tratados
 * como zero em vez de gerar número absurdo silenciosamente.
 */
export function calcularNfse(e: EntradaNfse): ResultadoNfse {
  const bruto = naoNegativo(e.valorServicos);
  const deducoes = naoNegativo(e.valorDeducoes);
  const descIncond = naoNegativo(e.descontoIncondicionado);
  const descCond = naoNegativo(e.descontoCondicionado);

  const baseCalculo = round2(Math.max(0, bruto - deducoes - descIncond));
  const aliquota = Math.max(0, e.aliquotaIss || 0);
  const valorIss = round2((baseCalculo * aliquota) / 100);
  const valorIssRetido = e.issRetido ? valorIss : 0;

  const r = e.retencoes ?? {};
  const retencoes = {
    pis: aplicar(r.pis, bruto),
    cofins: aplicar(r.cofins, bruto),
    csll: aplicar(r.csll, bruto),
    ir: aplicar(r.ir, bruto),
    inss: aplicar(r.inss, bruto),
  };
  const totalRetencoesFederais = round2(
    retencoes.pis + retencoes.cofins + retencoes.csll + retencoes.ir + retencoes.inss,
  );
  const outrasRetencoes = round2(naoNegativo(e.outrasRetencoes));
  const totalRetencoes = round2(
    valorIssRetido + totalRetencoesFederais + outrasRetencoes,
  );

  const valorLiquido = round2(bruto - descIncond - totalRetencoes);

  return {
    baseCalculo,
    valorIss,
    valorIssRetido,
    retencoes,
    totalRetencoesFederais,
    outrasRetencoes,
    totalRetencoes,
    valorLiquido,
    valorLiquidoComDescontoCondicionado: round2(valorLiquido - descCond),
  };
}

/**
 * Natureza da operação da NFS-e (campo `natureza_operacao`).
 *
 * `1` tributa no município do prestador e `2` fora dele. Na construção civil o
 * ISS é devido no município da OBRA (LC 116/2003, art. 3º, III) — por isso a
 * escolha sai da comparação entre o município do prestador e o da prestação, e
 * não de uma preferência do usuário.
 */
export const NATUREZAS_OPERACAO = [
  { id: "1", label: "Tributação no município" },
  { id: "2", label: "Tributação fora do município" },
  { id: "3", label: "Isenção" },
  { id: "4", label: "Imune" },
  { id: "5", label: "Exigibilidade suspensa por decisão judicial" },
  { id: "6", label: "Exigibilidade suspensa por procedimento administrativo" },
] as const;

export type NaturezaOperacao = (typeof NATUREZAS_OPERACAO)[number]["id"];

export function naturezaPorMunicipio(
  codigoMunicipioPrestador: string | null | undefined,
  codigoMunicipioPrestacao: string | null | undefined,
): NaturezaOperacao {
  const p = (codigoMunicipioPrestador ?? "").replace(/\D/g, "");
  const s = (codigoMunicipioPrestacao ?? "").replace(/\D/g, "");
  if (!p || !s || p === s) return "1";
  return "2";
}
```

---

## 6. Perguntas

### a) Os dois botões gravam na mesma tabela? Um bloco pode sobrescrever o outro?

**Sim, a mesma tabela `tenant`, a mesma linha** — as duas actions terminam em
`db.update(schema.tenants).where(eq(schema.tenants.id, ctx.tenant.id))`. As duas
estão coladas na íntegra na seção 3; os `set` são disjuntos:

| Action | `set` |
|---|---|
| `renameTenant` (`empresa.ts:148–151`) | `{ name }` — **só** o nome |
| `salvarDadosFiscais` (`empresa.ts:125–128`) | as 21 chaves do objeto `valores` — **não** inclui `name` nem `logoKey` |
| `uploadLogo` (`empresa.ts:42–45`) | `{ logoKey }` — **só** o logo |

Como os conjuntos de colunas não se cruzam, **um botão não apaga campo do
outro**. "Salvar nome" não zera dado fiscal; "Salvar dados fiscais" não mexe na
razão social nem no logo.

Mas **dentro do próprio bloco fiscal a gravação é destrutiva por omissão**.
`salvarDadosFiscais` monta o objeto `valores` com as 21 chaves **sempre
presentes**, e o helper `t()` (`empresa.ts:76–79`) devolve `null` para campo
vazio:

```ts
  const t = (campo: string) => {
    const v = formData.get(campo);
    return typeof v === "string" && v.trim() ? v.trim() : null;
  };
```

O `set` é um patch completo, não parcial. Consequências concretas:

1. Todo campo fiscal deixado em branco no formulário é gravado como `NULL` —
   **apaga** o que estava lá. Não existe "salvar só o que foi alterado".
2. Se o usuário não tocar em `fiscalAmbiente`, o `<Select>` ainda envia o valor
   atual (tem `defaultValue={ambiente}`, `page.tsx:265`), então esse campo não
   se perde. O mesmo vale para os demais, que têm `defaultValue` preenchido com
   o valor gravado.
3. **O risco real é o `fieldset disabled`.** Quando `canEdit` é falso o
   `<fieldset disabled>` (`page.tsx:186`) desabilita todos os inputs — e campo
   desabilitado **não é enviado** no `FormData`. Só que, nesse caso, o botão de
   submit também não é renderizado (`page.tsx:324–330`), então o formulário não
   tem como ser submetido pela tela. A action, porém, continua exportada e
   verifica a permissão por conta própria (`empresa.ts:72–74`).

Um detalhe assimétrico entre as três: **`renameTenant` não grava log de
auditoria nenhum.** `uploadLogo` grava (`tenant.logo`) e `salvarDadosFiscais`
grava (`tenant.fiscal`). Trocar a razão social — que é o que vai no corpo da
nota — não deixa rastro no log. `renameTenant` também **não lança erro**: sem
permissão ou com nome vazio ela simplesmente faz `return` (`empresa.ts:145`,
`:147`), e a tela não mostra nada.

### b) O JSX dos quatro campos, e o que os valores 7.02 / 4120400 / 3552502 / 3 realmente são

**São todos `placeholder`. Nenhum é `defaultValue`.** O `defaultValue` de cada
um é sempre `t.<campo> ?? ""`.

#### Item da lista de serviço — `src/app/(app)/empresa/page.tsx:236–243`

```tsx
                <div>
                  <Label>Item da lista de serviço (LC 116)</Label>
                  <Input
                    name="itemListaServico"
                    defaultValue={t.itemListaServico ?? ""}
                    placeholder="7.02"
                  />
                </div>
```

#### CNAE — `src/app/(app)/empresa/page.tsx:251–254`

```tsx
                <div>
                  <Label>CNAE</Label>
                  <Input name="cnae" defaultValue={t.cnae ?? ""} placeholder="4120400" />
                </div>
```

#### Alíquota de ISS — `src/app/(app)/empresa/page.tsx:255–262`

```tsx
                <div>
                  <Label>Alíquota de ISS (%)</Label>
                  <Input
                    name="aliquotaIss"
                    defaultValue={t.aliquotaIss ?? ""}
                    placeholder="3"
                  />
                </div>
```

#### Código IBGE — `src/app/(app)/empresa/page.tsx:293–300`

```tsx
                <div>
                  <Label>Código IBGE (7 dígitos)</Label>
                  <Input
                    name="codigoMunicipio"
                    defaultValue={t.codigoMunicipio ?? ""}
                    placeholder="3552502"
                  />
                </div>
```

**O que é gravado se o usuário salvar sem tocar neles:** nada. Um `placeholder`
é texto de fundo do input — o `value` do campo continua vazio, o `FormData`
carrega string vazia, e o helper `t()` converte string vazia em `null`
(`empresa.ts:76–79`). As colunas ficam `NULL`.

O efeito colateral é que a tela fica mostrando `7.02`, `4120400`, `3552502` e
`3` em cinza dentro dos campos, e ao mesmo tempo lista esses mesmos campos como
pendência "falta" logo acima — porque `checarProntidaoFiscal` os vê vazios. O
número aparente na tela não é o número gravado.

Cada um desses campos é, além disso, um bloqueio no checklist quando vazio:
`itemListaServico` (`emitente-fiscal.ts:286–294`), `aliquotaIss`
(`:296–302`), `codigoMunicipio` (`:313–321`); o `cnae` vazio é apenas aviso
(`:350–358`).

### c) De onde veio o `3552502`? É constante no código? Qual município?

**Não é constante.** Ocorrências de `3552502` no repositório inteiro:

| Arquivo:linha | Papel |
|---|---|
| `src/app/(app)/empresa/page.tsx:298` | o `placeholder` do campo Código IBGE |
| `src/lib/fiscal/nfse-payload.test.ts:14` | fixture de teste, com comentário |
| `src/lib/fiscal/nfse-payload.test.ts:33`, `:53`, `:62`, `:117`, `:123`, `:130` | asserções do mesmo teste |
| `src/lib/calc/emitente-fiscal.test.ts:82`, `:115` | fixture e asserção |
| `src/lib/calc/nfse.test.ts:149`, `:153` | fixture de `naturezaPorMunicipio` |

Não existe nenhum `const`, enum ou tabela de municípios no código — o valor só
aparece como texto literal nesses lugares. Quem nomeia o município é um
comentário no teste:

```ts
  itemListaServico: "7.02",
  aliquotaIss: 3,
  codigoMunicipio: "3552502", // Itanhaém/SP (sede)
  uf: "SP",
  logradouro: "Av. Brasil",
  numero: "1000",
  bairro: "Centro",
  cep: "11740-000",
  cnae: "4120400",
```

Ou seja, segundo o próprio repositório (`nfse-payload.test.ts:14`), **3552502 é
Itanhaém/SP**, usado ali como "sede". O `4120400` é o CNAE de construção de
edifícios e o `7.02` é o item da LC 116/2003 citado no texto da pendência
(`emitente-fiscal.ts:291`) — nenhum dos três tem origem em cadastro do cliente
dentro do código; são exemplos digitados no `placeholder` e nos testes.

### d) Como a lista de pendências é calculada? O que separa "falta" de "confira"?

A função inteira está colada na seção 3 (`emitente-fiscal.ts:238–370`). A tela
chama uma vez, em `page.tsx:33–55`, passando campo a campo, e separa em duas
listas em `page.tsx:56–57`:

```tsx
  const bloqueios = pendencias.filter((p) => p.severidade === "bloqueio");
  const avisos = pendencias.filter((p) => p.severidade === "aviso");
```

A tradução para os rótulos da tela está em `page.tsx:166–168`:

```tsx
                  <Badge tone={p.severidade === "bloqueio" ? "danger" : "warning"}>
                    {p.severidade === "bloqueio" ? "falta" : "confira"}
                  </Badge>
```

Então: **"falta" = `severidade: "bloqueio"`, "confira" = `severidade: "aviso"`.**
A distinção é declarada no docstring da função (`emitente-fiscal.ts:232–233`):
bloqueio é "a API de emissão vai recusar ou a prefeitura vai rejeitar"; aviso é
"dá para emitir, mas alguém precisa confirmar se está certo".

**A regra está num lugar só** — `checarProntidaoFiscal` é a única função que
produz pendências, e `emitentePronto` (`:373–375`) apenas conta os bloqueios
dela. A tela não acrescenta nenhuma checagem própria. As 13 regras:

| # | Campo | Condição | Severidade |
|---|---|---|---|
| 1 | `razaoSocial` | vazio | bloqueio |
| 2 | `cnpj` | vazio | bloqueio |
| 3 | `cnpj` | preenchido mas DV não confere | bloqueio |
| 4 | `inscricaoMunicipal` | vazio | bloqueio |
| 5 | `regimeTributario` | fora da lista de 5 ids | bloqueio |
| 6 | `itemListaServico` | vazio | bloqueio |
| 7 | `aliquotaIss` | `null` ou fora de 0–5 | bloqueio |
| 8 | `aliquotaIss` | < 2 e regime não é do Simples | **aviso** |
| 9 | `codigoMunicipio` | não são 7 dígitos | bloqueio |
| 10 | `logradouro` **ou** `numero` **ou** `bairro` | qualquer um vazio | bloqueio |
| 11 | `cep` | não são 8 dígitos | bloqueio |
| 12 | `uf` | fora do `Set` de 27 siglas | bloqueio |
| 13 | `cnae` | vazio | **aviso** |
| 14 | `email` | vazio | **aviso** |

São 11 regras de bloqueio e 3 de aviso (14 no total; as regras 2 e 3 são
mutuamente exclusivas, e 7 e 8 também).

**Campos que a interface `EmitenteFiscal` declara e a função nunca checa:**
`nomeFantasia`, `inscricaoEstadual`, `regimeEspecial`,
`codigoTributarioMunicipio`, `municipio`, `complemento` e `telefone`. Deixá-los
em branco nunca produz pendência, nem bloqueio nem aviso — embora `municipio` e
`telefone` sejam preenchidos no formulário e `codigoTributarioMunicipio` entre
no payload da nota (`nfse-payload.ts:229–232`).

Detalhe de ordenação: a tela renderiza `[...bloqueios, ...avisos]`
(`page.tsx:164`), então os "falta" vêm sempre antes dos "confira",
independentemente da ordem em que a função os gerou.

### e) `FOCUS_NFE_TOKEN` é por ambiente ou por tenant?

**Por ambiente. Nunca por tenant.** O código que o lê, inteiro:

```ts
export function tokenFocus(ambiente: AmbienteFiscal): string | null {
  const especifico =
    ambiente === "producao"
      ? process.env.FOCUS_NFE_TOKEN_PRODUCAO
      : process.env.FOCUS_NFE_TOKEN_HOMOLOGACAO;
  return especifico?.trim() || process.env.FOCUS_NFE_TOKEN?.trim() || null;
}

/** Dá para emitir neste ambiente? A tela usa isto para não oferecer o botão. */
export function focusConfigurado(ambiente: AmbienteFiscal = "homologacao"): boolean {
  return !!tokenFocus(ambiente);
}
```

Três variáveis de ambiente, com precedência: `FOCUS_NFE_TOKEN_PRODUCAO` ou
`FOCUS_NFE_TOKEN_HOMOLOGACAO` (conforme o ambiente pedido) e, se a específica
estiver vazia, `FOCUS_NFE_TOKEN` como fallback geral.

**Sim, há variante por ambiente** — exatamente o que o texto da tela promete
(`page.tsx:178–183`): *"Defina `FOCUS_NFE_TOKEN` (ou a variante por
ambiente)"*.

**E sim: num sistema multi-tenant, todas as empresas emitiriam pelo mesmo
token.** `tokenFocus` recebe só o ambiente; não há parâmetro de tenant, não há
coluna de token em `tenant` e não há lookup por tenant em lugar nenhum. A
decisão está documentada no cabeçalho do próprio arquivo
(`focus.ts:18–19`) e repetida no schema (`schema.ts:106–108`) e na migração
(`0039_emitente_fiscal.sql`, linhas 15–16): *"credencial de emissão vale
dinheiro e vai em variável de ambiente/secret, não em coluna de banco"*.

Como a `ref` da nota é "única por token" (`focus.ts:11–12`) e
`refDaNota` a deriva do UUID do registro (`tipos.ts:67–69`), dois tenants no
mesmo token compartilhariam o mesmo espaço de referências — os UUIDs não
colidem, mas o token, a numeração do provedor e a fatura seriam os mesmos.

### f) O que "Ambiente de emissão" controla exatamente?

Três coisas, e **nenhuma delas é a emissão em si** (que não existe — ver (g)).

**1. Qual token é procurado.** `page.tsx:31–32`:

```tsx
  const ambiente = resolverAmbiente(t.fiscalAmbiente);
  const provedorPronto = focusConfigurado(ambiente);
```

`focusConfigurado` → `tokenFocus(ambiente)` (colado em (e)): em `producao`
procura `FOCUS_NFE_TOKEN_PRODUCAO`, em `homologacao` procura
`FOCUS_NFE_TOKEN_HOMOLOGACAO`, ambos com fallback para `FOCUS_NFE_TOKEN`.

**2. Qual URL base seria usada**, se algo chamasse o cliente
(`focus.ts:32–35`):

```ts
const BASES: Record<AmbienteFiscal, string> = {
  homologacao: "https://homologacao.focusnfe.com.br/v2",
  producao: "https://api.focusnfe.com.br/v2",
};
```

**3. A cor e o texto do selo na tela** (`page.tsx:148–150`):

```tsx
              <Badge tone={ambiente === "producao" ? "warning" : "info"}>
                {ambiente === "producao" ? "Produção" : "Homologação"}
              </Badge>
```

Na gravação, o valor passa por uma lista fechada (`empresa.ts:116`):

```ts
    fiscalAmbiente: ehAmbienteFiscal(ambiente) ? ambiente : "homologacao",
```

Qualquer valor fora de `"homologacao" | "producao"` cai em `"homologacao"` — o
mesmo default da coluna (`schema.ts:145`) e da migração, que o texto da 0039
justifica: *"nota de teste não tem validade fiscal, e o padrão inverso emitiria
nota real por acidente"*.

**Existe aviso na emissão dizendo que a nota é de homologação?** Não existe
emissão, portanto não existe esse aviso. O que existe é o selo azul
"Homologação" na tela de cadastro (`page.tsx:148–150`), o rótulo da opção do
`<Select>` — `"Homologação (sem valor fiscal)"` (`page.tsx:266`) — e o
comentário no `focus.ts:7–8`. Nenhum desses textos acompanha uma nota, porque
nenhuma nota é gerada.

### g) Quem emite nota hoje? Existe tela, action ou rota de emissão?

**Não existe.** Grep de `emitirNfse`, `consultarNfse`, `cancelarNfse` e
`montarPayloadNfse` em todo o `src/`:

| Símbolo | Definido em | Chamado em |
|---|---|---|
| `emitirNfse` | `focus.ts:181` | **nenhum lugar** |
| `consultarNfse` | `focus.ts:199` | **nenhum lugar** |
| `cancelarNfse` | `focus.ts:221` | **nenhum lugar** |
| `montarPayloadNfse` | `nfse-payload.ts:135` | **só `nfse-payload.test.ts`** |
| `calcularNfse` / `validarNfse` / `naturezaPorMunicipio` | `calc/nfse.ts` | só `nfse-payload.ts` e os testes |

`find src/app -type d | grep -i "nfse\|nota\|fiscal"` não devolve nenhuma rota.
Não há tela, não há Server Action, não há Route Handler de emissão. Também não
há tabela de notas emitidas no schema — `documento_fiscal` é nota **recebida** de
fornecedor, filha de `despesa`, como diz o cabeçalho da 0039.

**Então os campos alimentam o quê, hoje?** Exatamente três coisas:

1. **O checklist da própria tela** — `checarProntidaoFiscal`, que lê 15 dos 22
   campos e desenha a lista de pendências e o selo "Cadastro completo".
2. **O prompt da IA de leitura de documento de despesa** — `ctx.tenant.cnpj`,
   e só ele, vai para `despesa-prompt.ts` para a IA não confundir a empresa com
   o fornecedor (`despesas.ts:903`).
3. **O `select()` sem projeção de `getActiveContext` e de
   `getAllTenantsOverview`**, que carregam a linha inteira do tenant por serem
   `select()` sem lista de colunas — os campos viajam junto, mas nenhuma tela
   os exibe.

Os 22 campos estão, portanto, cadastrados para uma emissão que o repositório
ainda não faz. O caminho completo existe em código puro e testado
(`nfse-payload.ts` + `calc/nfse.ts` + `focus.ts`, com 3 arquivos de teste), mas
nada o invoca.

### h) O selo "R2 ativo" reflete teste real ou presença de variável?

**Presença de variável de ambiente, apenas.** O selo, em `page.tsx:88–90`:

```tsx
              <Badge tone={r2 ? "success" : "neutral"}>
                {r2 ? "R2 ativo" : "R2 não configurado"}
              </Badge>
```

`r2` vem de `page.tsx:26` → `isR2Configured()`, que é só isto
(`storage/r2.ts:13–20`):

```ts
export function isR2Configured(): boolean {
  return Boolean(
    process.env.R2_ENDPOINT &&
      process.env.R2_BUCKET &&
      process.env.R2_ACCESS_KEY_ID &&
      process.env.R2_SECRET_ACCESS_KEY,
  );
}
```

Quatro variáveis não vazias. Nenhuma requisição, nenhuma credencial conferida —
chave errada, bucket inexistente ou endpoint fora do ar continuam exibindo "R2
ativo".

**O botão "Testar conexão R2" é que faz o teste real.** O componente
(`r2-healthcheck.tsx:23–34`) chama `GET /api/health/r2`, e a rota
(`api/health/r2/route.ts`, colada inteira na seção 3) faz um round-trip de
verdade:

1. Exige sessão e papel `owner` ou `admin` (linhas 17–23) — 401/403 caso
   contrário.
2. Repete `isR2Configured()` e devolve 503 se faltar variável (linhas 36–47).
3. `PUT` de um objeto de teste em `_healthcheck/<tenantId>-<hash>.txt`
   (linhas 50–62).
4. `GET` pela `readUrl` e `fetch` na URL devolvida (linhas 64–78).
5. `DELETE` do objeto de teste (linha 80; falha do delete não derruba o
   resultado, só vira `steps.delete`).
6. Devolve `{ok, configured, steps, env}` com as variáveis **mascaradas**
   (`mask`, linhas 106–110: só os 8 primeiros e os 4 últimos caracteres; o
   secret vira só `"definido"`).

Ou seja: o selo e o botão medem coisas diferentes, e só o botão prova que o
upload funciona. O `key6` (linhas 117–121) é um hash determinístico do id do
tenant — a chave de teste é sempre a mesma para o mesmo tenant, então dois
testes simultâneos do mesmo tenant escreveriam e apagariam o mesmo objeto.

### i) O logo é usado em quê?

Grep de `logoKey` / `logo_key` em todo o `src/` devolve **cinco** ocorrências, e
apenas **dois** consumidores:

| Arquivo:linha | Papel |
|---|---|
| `src/lib/db/schema.ts:115` | a coluna |
| `src/lib/actions/empresa.ts:44` | a gravação (`uploadLogo`) |
| `src/app/(app)/empresa/page.tsx:28` | **consumidor 1** — o preview na própria tela |
| `src/app/(app)/layout.tsx:70–71` | **consumidor 2** — a faixa do topo |
| `src/app/(app)/layout.tsx:113–123` | onde essa faixa é renderizada |

O consumidor 2, na íntegra:

```tsx
        {logoUrl && (
          <div className="sticky top-0 z-30 hidden justify-end border-b border-[var(--color-accent2)]/12 bg-[var(--color-surface2)]/85 px-6 py-2 backdrop-blur lg:flex">
            <Image
              src={logoUrl}
              alt={ctx.tenant.name}
              width={130}
              height={32}
              unoptimized
              className="max-h-8 w-auto object-contain"
            />
          </div>
        )}
```

Note o `hidden … lg:flex` (linha 114): a faixa com o logo **só aparece em
telas grandes** — no celular ela não é renderizada.

**Impressão, relatório e e-mail: nenhum.** Não há `@media print` no projeto, o
único `PrintButton` do app está em `/medicao` e não referencia logo, e não há
biblioteca de PDF nem de e-mail em `src/` (grep por `nodemailer`, `resend`,
`sendMail`, `jsPDF`, `pdfkit`, `puppeteer` não devolve nada). O logo aparece
exatamente em dois lugares da interface web e em nenhum artefato exportado.

Sobre o upload em si (`empresa.ts:33–40`): aceita até 2 MB, grava em
`tenants/<tenantId>/logo.<ext>` — **a extensão vem do nome do arquivo enviado**,
não do tipo real, e o `accept` do input (`page.tsx:117`) é validação só do
navegador. Como a chave inclui a extensão, trocar um `logo.png` por um
`logo.jpg` deixa o arquivo antigo órfão no bucket.

### j) Há validação de CNPJ, CEP, código IBGE e alíquota no servidor?

**Só duas das quatro.** A action inteira está na seção 3; as validações são
exatamente estas duas, `empresa.ts:81–90`:

```ts
  const cnpj = normalizarCnpj(t("cnpj"));
  if (cnpj && !cnpjValido(cnpj)) {
    throw new Error("CNPJ inválido — confira os dígitos verificadores.");
  }

  const aliquotaTexto = t("aliquotaIss")?.replace(",", ".");
  const aliquota = aliquotaTexto === null ? null : Number(aliquotaTexto);
  if (aliquota !== null && !aliquotaIssValida(aliquota)) {
    throw new Error("A alíquota de ISS deve estar entre 0 e 5%.");
  }
```

| Campo | Validado na action? | O que a action faz |
|---|---|---|
| **CNPJ** | **sim** | `normalizarCnpj` + `cnpjValido` (dígitos verificadores, 14 caracteres, recusa sequência repetida, aceita alfanumérico da IN RFB 2.229/2024). **Lança erro** e nada é gravado. Só valida se veio preenchido — vazio passa. |
| **Alíquota de ISS** | **sim** | troca vírgula por ponto, `Number`, e `aliquotaIssValida` exige finito e 0 ≤ x ≤ 5. **Lança erro.** Vazio passa como `null`. |
| **CEP** | **não** | só `normalizarCep` (`empresa.ts:113`), que **remove tudo que não é dígito** e devolve o que sobrou. `"1"` é aceito e gravado. A função `cepValido` existe (`emitente-fiscal.ts:84–87`) mas **não é chamada aqui**. |
| **Código IBGE** | **não** | só `normalizarCodigoMunicipio` (`empresa.ts:110`), que também só filtra dígitos. `"99"` é aceito e gravado. `codigoMunicipioValido` (`emitente-fiscal.ts:96–99`) existe e **não é chamada aqui**. |
| **UF** | **não** | só `.toUpperCase()` (`empresa.ts:112`). `ufValida` existe e não é chamada. `maxLength={2}` no input é do navegador. |
| **Regime tributário / especial** | **sim, por lista fechada** | `ehRegimeTributario` / `ehRegimeEspecial` (`empresa.ts:98–101`) — valor fora da lista vira `null` **silenciosamente**, sem erro. |
| **Ambiente fiscal** | **sim, por lista fechada** | `ehAmbienteFiscal` (`empresa.ts:116`) — fora da lista vira `"homologacao"`, sem erro. |
| **E-mail fiscal** | **não** no servidor | `type="email"` no input (`page.tsx:317`) é validação de navegador apenas. |
| Demais campos | **não** | `t()` só faz `trim` e converte vazio em `null`. |

Resumo: dos quatro campos perguntados, **CNPJ e alíquota têm validação real no
servidor; CEP e código IBGE não têm — são apenas normalizados**. Os validadores
de CEP, IBGE e UF existem no mesmo módulo que a action já importa, mas só são
usados pelo checklist da tela, que é informativo e não impede a gravação. Isso é
deliberado e está documentado no docstring da action (`empresa.ts:58–69`):
*"Salva PARCIAL de propósito… O único campo recusado é o CNPJ com dígito
verificador errado"*.

### k) A alteração grava `logAudit` com valor anterior e novo? Dados fiscais são sensíveis para o log?

**Para os dados fiscais, sim.** `salvarDadosFiscais` lê a linha anterior
**antes** do update (`empresa.ts:119–123`) e grava o diff campo a campo:

```ts
  const [antes] = await db
    .select()
    .from(schema.tenants)
    .where(eq(schema.tenants.id, ctx.tenant.id))
    .limit(1);

  await db
    .update(schema.tenants)
    .set(valores)
    .where(eq(schema.tenants.id, ctx.tenant.id));

  await logAudit({
    tenantId: ctx.tenant.id,
    userId: ctx.userId,
    action: "tenant.fiscal",
    entity: "tenant",
    entityId: ctx.tenant.id,
    meta: {
      changes: diffAudit(antes as unknown as Record<string, unknown>, valores),
    },
  });
  revalidatePath("/empresa");
}
```

`diffAudit` (colado na seção 3) percorre as chaves do **patch**, compara com o
registro anterior via `mesmoValor` e devolve `{campo: {de, para}}` só para o que
mudou de fato. `action = "tenant.fiscal"`, `entity = "tenant"`,
`entityId = ctx.tenant.id`.

Para as outras duas actions:

| Action | `logAudit`? | Conteúdo |
|---|---|---|
| `salvarDadosFiscais` | **sim** | `tenant.fiscal`, `meta.changes` = diff de/para dos 21 campos |
| `uploadLogo` | **sim** | `tenant.logo`, `meta = { key }` — só a chave no R2, sem antes/depois |
| `renameTenant` | **não** | nenhum log |

**Sobre sensibilidade: não há redação nenhuma.** O `meta` é gravado como JSONB
íntegro (`audit.ts:21`) e `diffAudit` não tem lista de campos a mascarar — CNPJ,
inscrição municipal, inscrição estadual, endereço completo, CEP, telefone e
e-mail entram no log em texto claro, com valor anterior e novo. Não existe no
repositório nenhum mecanismo de mascaramento para o log de auditoria (o único
`mask()` do projeto é o da rota de health do R2, que é outro contexto).

Vale contrastar com a decisão deliberada do lado oposto: o **token do provedor**
foi mantido fora do banco justamente para não ser lido por toda query de tenant
(`schema.ts:106–108`), e `focus.ts:19` registra *"nada de token em log"*. Os
dados cadastrais do emitente não receberam o mesmo tratamento — o que é
coerente com o fato de serem dados públicos de CNPJ, mas é uma diferença de
critério que vale registrar.

Um detalhe do `diffAudit`: `normalizar` (`audit-diff.ts:35–46`) converte string
numérica em número. `aliquotaIss` é `numeric(8,4)`, que o Postgres devolve como
`"3.0000"`; salvar `3` não é reportado como alteração, porque `3` e `"3.0000"`
normalizam para o mesmo número. Já `cnpj`, gravado sem máscara, muda no log
sempre que a máscara digitada mudar? **Não** — `normalizarCnpj` remove a máscara
antes do `set`, então o diff compara sempre a forma limpa.

### l) Qual permissão governa? Está em `SCREENS`? A action verifica no servidor?

**Sim, está em `SCREENS`**, e o servidor verifica nas três camadas.

#### `src/lib/permissions.ts:69`

```ts
  { id: "empresa", label: "Empresa", modulo: "Config" },
```

1. **Enforcement central** — `src/app/(app)/layout.tsx:92–95` mapeia a rota
   para a tela e nega o "Ver". Como `"empresa"` está em `SCREEN_IDS`,
   `screenIdOfPath("/empresa")` devolve `"empresa"` e a rota é coberta:

```tsx
  // Enforcement central de "Ver": mapeia a rota atual para a tela governada.
  const pathname = (await headers()).get("x-pathname");
  const screenId = screenIdOfPath(pathname);
  const denied = screenId ? !can(ctx.perms, screenId, "ver") : false;
```

2. **Na página** — `page.tsx:25` calcula
   `canEdit = can(ctx.perms, "empresa", "editar")` e usa esse booleano para
   esconder os botões (`:77`, `:93`, `:112`, `:324`) e desabilitar o
   `<fieldset>` (`:186`). Note que a página **não** repete o `can(…, "ver")` —
   quem barra a leitura é só o layout. Se a rota deixasse de estar em `SCREENS`,
   a tela abriria para qualquer um.

3. **Nas actions, no servidor** — as três verificam, com comportamentos
   diferentes:

```ts
  const ctx = await getActiveContext();
  if (!ctx || !can(ctx.perms, "empresa", "editar")) {
    throw new Error("Sem permissão.");
  }
```


```ts
  const ctx = await getActiveContext();
  if (!ctx || !can(ctx.perms, "empresa", "editar")) {
    throw new Error("Sem permissão para editar os dados fiscais.");
  }
```


```ts
  const ctx = await getActiveContext();
  if (!ctx || !can(ctx.perms, "empresa", "editar")) return;
```

`uploadLogo` e `salvarDadosFiscais` **lançam**; `renameTenant` faz `return`
silencioso — o usuário sem permissão que forjar a chamada não vê erro, e a tela
recarrega igual.

4. **Na rota de health do R2** — não usa `can` nem a tela `empresa`: verifica o
   papel diretamente (`route.ts:21–23`), exigindo `owner` ou `admin`. Um
   `membro` com override de `empresa:editar` veria o botão "Testar conexão R2"
   (que depende só de `canEdit`, `page.tsx:93`) e receberia **403** ao clicar.

Perfis padrão (`permissions.ts:96–112`): `owner` e `admin` recebem `FULL`;
`membro` recebe `NONE` porque o módulo de `empresa` é `Config`; `engenheiro`
recebe `NONE`; `contador` recebe `NONE` porque `"empresa"` não está em
`CONTADOR_VE`.

### m) Há `tenant_id` no `where` de cada consulta e de cada update?

Nesta tela a pergunta tem uma resposta particular: **a tabela `tenant` não tem
coluna `tenant_id` — a chave primária `id` É o tenant.** Então o filtro
equivalente é `eq(schema.tenants.id, ctx.tenant.id)`. Todas as quatro operações
o têm:

| Operação | Arquivo:linha | `where` |
|---|---|---|
| `SELECT` do estado anterior (fiscal) | `empresa.ts:119–123` | `eq(schema.tenants.id, ctx.tenant.id)` ✅ |
| `UPDATE` dos dados fiscais | `empresa.ts:125–128` | `eq(schema.tenants.id, ctx.tenant.id)` ✅ |
| `UPDATE` do logo | `empresa.ts:42–45` | `eq(schema.tenants.id, ctx.tenant.id)` ✅ |
| `UPDATE` do nome | `empresa.ts:148–151` | `eq(schema.tenants.id, ctx.tenant.id)` ✅ |

E `ctx.tenant.id` não vem do cliente: `getActiveContext` resolve o tenant a
partir da sessão → usuário → `membership`, e carrega a linha por esse id
(`context.ts:42–70`). Nenhuma das actions aceita `tenantId` por parâmetro ou por
`FormData`, então não há como apontar para outro tenant.

A leitura da página também é segura pelo mesmo caminho: `page.tsx:30` faz
`const t = ctx.tenant` — não há query nenhuma na página, só o objeto que o
contexto já trouxe.

Duas leituras de `tenant` **fora** desta tela não são filtradas, por desenho:

- `getAllTenantsOverview` (`queries.ts:1509–1513`) faz `select()` de **todos**
  os tenants, sem `where`. O docstring diz que é visão de plataforma e que *"o
  chamador é responsável por restringir o acesso a super-admins"* — a garantia
  é do chamador, não da query.
- `src/app/(auth)/mfa/page.tsx:31–34` faz `innerJoin` a partir de
  `membership`, projetando só `tenants.name` — filtrado pelo vínculo do usuário.

Uma observação sobre exposição, não sobre isolamento: tanto `getActiveContext`
(`context.ts:65–69`) quanto `getAllTenantsOverview` usam `select()` **sem lista
de colunas**, então trazem a linha inteira do tenant — as 22 colunas fiscais
incluídas. No caso de `getActiveContext` isso é o que faz a tela funcionar sem
query própria; no caso de `getAllTenantsOverview`, os dados fiscais de todos os
tenants entram na memória da tela de super-admin mesmo que ela não os mostre.
