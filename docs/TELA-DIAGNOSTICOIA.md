# Tela — Diagnóstico de IA (`/diagnosticoia`)

Coleta de código, sem análise. Cada arquivo aparece com o caminho como
cabeçalho. Trechos parciais trazem a faixa de linhas no título do bloco.

Base: branch `claude/contexto-revisao`.

---

## 1. A página

### `src/app/(app)/diagnosticoia/page.tsx`

```tsx
import { getActiveContext } from "@/lib/context";
import { can } from "@/lib/permissions";
import { PageHeader } from "@/components/app/page-header";
import { AiDiagnosticPanel } from "@/components/app/ai-diagnostic-panel";

export const dynamic = "force-dynamic";

export default async function DiagnosticoIaPage() {
  const ctx = await getActiveContext();
  if (!ctx) return null;
  if (!can(ctx.perms, "diagnosticoia", "ver")) return null;

  return (
    <>
      <PageHeader title="Diagnóstico de IA" />
      <AiDiagnosticPanel />
    </>
  );
}
```

---

## 2. Componentes próprios que a página importa (recursivamente)

```
src/app/(app)/diagnosticoia/page.tsx
├── @/lib/context                        → getActiveContext
├── @/lib/permissions                    → can
├── @/components/app/page-header         → PageHeader
└── @/components/app/ai-diagnostic-panel → AiDiagnosticPanel   ("use client")
    ├── @/lib/actions/ai                 → testAiConnection, AiDiagnosticResult  (seção 3)
    ├── @/lib/ai/modelos                 → MODELO_PADRAO, rotuloModelo           (seção 4)
    ├── @/components/ui/card             → Card, CardContent
    ├── @/components/ui/button           → Button
    └── @/components/ui/badge            → Badge
```

A página tem 19 linhas e nenhuma consulta ao banco. `AiDiagnosticPanel` é o
único componente `"use client"`, e contém um subcomponente local `Item`
(`ai-diagnostic-panel.tsx:10–20`), não exportado.

### `src/components/app/ai-diagnostic-panel.tsx`

```tsx
"use client";

import { useState, useTransition } from "react";
import { testAiConnection, type AiDiagnosticResult } from "@/lib/actions/ai";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { MODELO_PADRAO, rotuloModelo } from "@/lib/ai/modelos";

function Item({ label, ok, hint }: { label: string; ok: boolean; hint?: string }) {
  return (
    <div className="flex items-center justify-between gap-3 border-b border-[var(--color-accent2)]/8 py-2 last:border-0">
      <div>
        <div className="text-[13px] text-[var(--color-ink)]">{label}</div>
        {hint && <div className="text-[11.5px] text-[var(--color-ink3)]">{hint}</div>}
      </div>
      <Badge tone={ok ? "success" : "danger"}>{ok ? "OK" : "Falhou"}</Badge>
    </div>
  );
}

export function AiDiagnosticPanel() {
  const [res, setRes] = useState<AiDiagnosticResult | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [pending, start] = useTransition();

  const run = () => {
    setErr(null);
    start(async () => {
      try {
        setRes(await testAiConnection());
      } catch (e) {
        setErr(e instanceof Error ? e.message : "Falha ao executar o diagnóstico.");
      }
    });
  };

  return (
    <Card>
      <CardContent className="space-y-4 p-5">
        <div className="flex items-center justify-between gap-3">
          <p className="text-[13px] text-[var(--color-ink3)]">
            Testa a leitura por IA (despesas, fornecedores e extratos) fazendo uma
            chamada real à API — verifica a chave, o acesso ao modelo e a rede.
          </p>
          <Button type="button" onClick={run} disabled={pending} className="shrink-0">
            {pending ? "Testando…" : "Testar agora"}
          </Button>
        </div>

        {err && <p className="text-sm text-[var(--color-danger)]">{err}</p>}

        {res && (
          <div className="rounded-[10px] border border-[var(--color-accent2)]/12 bg-[var(--color-surface2)] p-4">
            <div className="mb-2 flex items-center gap-2">
              <Badge tone={res.ok ? "success" : "danger"}>
                {res.ok ? "Leitura por IA operacional" : "Leitura por IA indisponível"}
              </Badge>
            </div>
            <Item
              label="Chave de IA (ANTHROPIC_API_KEY)"
              ok={res.keyPresent}
              hint={res.keyPresent ? "Definida no ambiente" : "Ausente — defina no ambiente do servidor"}
            />
            <Item
              label="Chamada ao modelo"
              ok={res.ok}
              hint={
                res.ok
                  ? `Respondeu com o modelo ${res.modelUsed ?? "?"}`
                  : "A chamada de teste falhou"
              }
            />
            <Item
              label="Storage de documentos (R2)"
              ok={res.r2Configured}
              hint={
                res.r2Configured
                  ? "Configurado — anexos são salvos e entram no backup"
                  : "Opcional para a leitura; necessário para anexar/baixar documentos"
              }
            />
            <div className="mt-3 space-y-1.5 text-[11.5px] text-[var(--color-ink3)]">
              <div>
                Modelo configurado:{" "}
                <span className="font-[family-name:var(--font-mono)] text-[var(--color-ink2)]">
                  {res.configuredModel}
                </span>{" "}
                ({res.configuredModelLabel}) — defina <code>ANTHROPIC_MODEL</code> para
                trocar sem alterar código
              </div>
              {/* A variável tem que levar o IDENTIFICADOR do modelo, não o nome
                  comercial. Sem este aviso, um valor errado some no fallback e a
                  configuração parece valer quando não vale. */}
              {res.modelWarning && (
                <div className="rounded-[8px] border border-[var(--color-warning)]/40 bg-[var(--color-warning)]/10 px-2.5 py-2 leading-relaxed text-[#92400e]">
                  {res.modelWarning}
                </div>
              )}
              {res.error && (
                <div className="rounded-[8px] border border-[var(--color-danger)]/40 bg-[var(--color-danger)]/8 px-2.5 py-2 leading-relaxed text-[var(--color-danger)]">
                  {res.error}
                </div>
              )}
            </div>
          </div>
        )}

        <div className="space-y-1.5 text-[11.5px] leading-relaxed text-[var(--color-ink3)]">
          <p>
            <strong className="text-[var(--color-ink)]">Como habilitar:</strong> defina{" "}
            <code>ANTHROPIC_API_KEY</code> no ambiente do servidor (ex.: variáveis do
            Coolify) e reinicie/redeploy o app. Com a chave ativa e créditos na conta,
            a leitura de NF/boleto, cadastro de fornecedor por imagem/PDF e extratos
            (inclusive escaneados) passa a funcionar.
          </p>
          <p>
            <strong className="text-[var(--color-ink)]">Escolher o modelo:</strong>{" "}
            <code>ANTHROPIC_MODEL</code> é opcional e aceita o{" "}
            <em>identificador</em>, não o nome comercial — ex.:{" "}
            <code>claude-sonnet-5</code>, e não &ldquo;Sonnet 5&rdquo;. Sem ela, o app
            usa {rotuloModelo(MODELO_PADRAO)} (<code>{MODELO_PADRAO}</code>), que é o
            mais econômico e dá conta de PDF nítido. Se a leitura de foto (cupom
            amassado, papel desbotado) vier fraca, suba um degrau:{" "}
            <code>claude-sonnet-5</code> ou <code>claude-opus-5</code>.
          </p>
          <p>
            <strong className="text-[var(--color-ink)]">Créditos:</strong> chave e
            modelo corretos, mas a chamada falha por saldo? O consumo é cobrado por
            uso — adicione créditos em <code>console.anthropic.com</code> (Plans &amp;
            Billing).
          </p>
          <p>
            <strong className="text-[var(--color-ink)]">Chave vinculada a identidade:</strong>{" "}
            se a chave foi criada para uma service account, defina também{" "}
            <code>ANTHROPIC_WORKSPACE_ID</code> com o ID do workspace
            (Settings → Workspaces, começa com <code>wrkspc_</code>). Chave comum
            dispensa isso.
          </p>
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

## 3. A action que o botão "Testar agora" chama

É uma Server Action, não uma rota: `ai-diagnostic-panel.tsx:31` chama
`testAiConnection()` direto.

### `src/lib/actions/ai.ts`

```ts
"use server";

import { getActiveContext } from "@/lib/context";
import {
  aiClient,
  createMessageWithFallback,
  isAiConfigured,
  modelWarning,
  primaryModel,
} from "@/lib/ai/client";
import { rotuloModelo } from "@/lib/ai/modelos";
import { isR2Configured } from "@/lib/storage/r2";

export interface AiDiagnosticResult {
  /** ANTHROPIC_API_KEY presente no ambiente? */
  keyPresent: boolean;
  /** Identificador do modelo que será usado (já resolvido a partir do env). */
  configuredModel: string;
  /** Nome comercial do modelo, para exibir junto do identificador. */
  configuredModelLabel: string;
  /**
   * O que há de errado na ANTHROPIC_MODEL do ambiente (nome comercial em vez
   * do identificador, valor sem sentido...). Vazio = nada a corrigir.
   */
  modelWarning: string;
  /** O teste real de chamada funcionou? */
  ok: boolean;
  /** Modelo que efetivamente respondeu (pode ser um fallback). */
  modelUsed: string | null;
  /** Mensagem de erro amigável, quando falhou. */
  error: string | null;
  /** Storage R2 configurado? (necessário para anexar/baixar documentos). */
  r2Configured: boolean;
}

/**
 * Testa, ao vivo, a configuração de leitura por IA: presença da chave, acesso ao
 * modelo e conectividade de rede — fazendo uma chamada mínima à API. Só
 * owner/admin. Serve para diagnosticar em segundos por que a leitura por IA
 * "não está funcionando" no ambiente.
 */
export async function testAiConnection(): Promise<AiDiagnosticResult> {
  const ctx = await getActiveContext();
  if (!ctx || (ctx.role !== "owner" && ctx.role !== "admin")) {
    throw new Error("Sem permissão para executar o diagnóstico.");
  }
  const keyPresent = isAiConfigured();
  const configuredModel = primaryModel();
  const configuredModelLabel = rotuloModelo(configuredModel);
  const avisoModelo = modelWarning();
  const r2Configured = isR2Configured();

  if (!keyPresent) {
    return {
      keyPresent: false,
      configuredModel,
      configuredModelLabel,
      modelWarning: avisoModelo,
      ok: false,
      modelUsed: null,
      error:
        "ANTHROPIC_API_KEY não está definida no ambiente do servidor. Defina a variável e reinicie/redeploy o app.",
      r2Configured,
    };
  }

  try {
    const msg = await createMessageWithFallback(aiClient(), {
      max_tokens: 8,
      messages: [{ role: "user", content: "responda apenas: ok" }],
    });
    return {
      keyPresent: true,
      configuredModel,
      configuredModelLabel,
      modelWarning: avisoModelo,
      ok: true,
      modelUsed: msg.model ?? null,
      error: null,
      r2Configured,
    };
  } catch (e) {
    return {
      keyPresent: true,
      configuredModel,
      configuredModelLabel,
      modelWarning: avisoModelo,
      ok: false,
      modelUsed: null,
      error: e instanceof Error ? e.message : String(e),
      r2Configured,
    };
  }
}
```

---

## 4. `src/lib/ai/` inteiro

Dez módulos de código e cinco de teste:

| Arquivo | Linhas | Papel |
|---|---|---|
| `client.ts` | 114 | cliente da API, resolução de modelo, fallback, tradução de erro |
| `modelos.ts` | 160 | catálogo de modelos, `ANTHROPIC_MODEL` → id, cadeia de fallback |
| `erros.ts` | 58 | falha da API → mensagem em pt-BR |
| `campos.ts` | 233 | vocabulário de "campo lido", limites de formato e quantidade |
| `despesa-prompt.ts` | 92 | o texto enviado na leitura de despesa (system + instrução) |
| `despesa-extract.ts` | 277 | **chamada de IA 1** — NF/cupom/boleto/comprovante |
| `despesa-doc.ts` | 544 | módulo puro: transforma o lido em preenchimento + alertas |
| `fornecedor-extract.ts` | 155 | **chamada de IA 2** — cartão CNPJ, contrato, cartão de visita |
| `fornecedor-doc.ts` | 162 | módulo puro do cadastro de fornecedor |
| `extrato-extract.ts` | 202 | **chamada de IA 3** — extrato bancário (e o fallback sem IA) |
| `client` + 4 testes | 580 | `despesa-doc.test.ts`, `despesa-prompt.test.ts`, `erros.test.ts`, `fornecedor-doc.test.ts`, `modelos.test.ts` |

### `src/lib/ai/client.ts`

```ts
import "server-only";
import Anthropic from "@anthropic-ai/sdk";
import { cadeiaDeModelos, resolverModelo } from "@/lib/ai/modelos";
import { mensagemDeErroIa } from "@/lib/ai/erros";

/**
 * Camada compartilhada das leituras por IA (despesa, fornecedor, extrato).
 *
 * - Resolve o modelo: `ANTHROPIC_MODEL` (env) ou o padrão, permitindo trocar de
 *   modelo sem alterar código.
 * - `createMessageWithFallback`: tenta o modelo primário e, se ele não estiver
 *   disponível na conta (404/not_found), cai automaticamente para alternativos
 *   amplamente disponíveis — assim a leitura não falha por causa do ID do modelo.
 * - `enrichAiError`: traduz falhas comuns (sem chave, sem rede, modelo, limite)
 *   em mensagens claras em português.
 */

export function isAiConfigured(): boolean {
  return Boolean(process.env.ANTHROPIC_API_KEY);
}

/**
 * Modelo primário: o que veio em `ANTHROPIC_MODEL`, já traduzido para o
 * identificador que a API aceita (ver `modelos.ts` — quem configura costuma
 * digitar o nome comercial, "Sonnet 5", e a API só entende `claude-sonnet-5`).
 */
export function primaryModel(): string {
  return resolverModelo(process.env.ANTHROPIC_MODEL).id;
}

/**
 * O que há de errado (ou de digno de nota) na `ANTHROPIC_MODEL` do ambiente.
 * Vazio quando está tudo certo. É o que a tela de Diagnóstico de IA mostra —
 * sem isso, um valor inválido some no fallback e a configuração parece valer
 * quando não vale.
 */
export function modelWarning(): string {
  return resolverModelo(process.env.ANTHROPIC_MODEL).aviso;
}

/** Ordem de tentativa (primário + alternativos, sem repetir). */
export function modelChain(): string[] {
  return cadeiaDeModelos(primaryModel());
}

/**
 * Workspace da chave de IA, quando exigido.
 *
 * Chave de API "vinculada a identidade" (identity-linked, criada para uma
 * service account no Console da Anthropic) só funciona se cada requisição
 * disser em QUAL workspace está agindo — header `anthropic-workspace-id`.
 * Sem ele a API responde 400 "anthropic-workspace-id is required".
 *
 * Chave comum não precisa disso; a variável é opcional e só entra no header
 * quando definida.
 */
export function workspaceId(): string | null {
  return process.env.ANTHROPIC_WORKSPACE_ID?.trim() || null;
}

export function aiClient(): Anthropic {
  const ws = workspaceId();
  return new Anthropic(
    ws ? { defaultHeaders: { "anthropic-workspace-id": ws } } : undefined,
  );
}

function statusOf(e: unknown): number | undefined {
  return e instanceof Anthropic.APIError ? e.status : undefined;
}

/** O erro indica que o modelo não existe / não está liberado para a conta? */
function isModelUnavailable(e: unknown): boolean {
  if (statusOf(e) === 404) return true;
  const msg = e instanceof Error ? e.message : String(e);
  return /not_found|model/i.test(msg) && /404|not.?found|unavailable|access/i.test(msg);
}

/**
 * Cria a mensagem tentando o modelo primário e, se indisponível, os
 * alternativos. Qualquer outro erro é traduzido por `enrichAiError`.
 */
export async function createMessageWithFallback(
  client: Anthropic,
  params: Omit<Anthropic.MessageCreateParamsNonStreaming, "model">,
): Promise<Anthropic.Message> {
  const models = modelChain();
  let lastErr: unknown;
  for (const model of models) {
    try {
      return await client.messages.create({ ...params, model });
    } catch (e) {
      lastErr = e;
      if (!isModelUnavailable(e)) throw enrichAiError(e);
      // modelo indisponível → tenta o próximo da cadeia
    }
  }
  throw enrichAiError(lastErr);
}

/**
 * Traduz erros da API da IA em mensagens acionáveis (pt-BR). A regra de
 * tradução mora em `erros.ts` (puro e testado); aqui só se extrai do erro do
 * SDK o que ela precisa saber.
 */
export function enrichAiError(e: unknown): Error {
  return new Error(
    mensagemDeErroIa({
      status: statusOf(e),
      mensagem: e instanceof Error ? e.message : String(e),
      semConexao: e instanceof Anthropic.APIConnectionError,
    }),
  );
}
```

### `src/lib/ai/modelos.ts`

```ts
/**
 * Qual modelo da Claude o app usa — e como interpretar o que veio no ambiente.
 *
 * A variável `ANTHROPIC_MODEL` existe para trocar de modelo sem mexer em
 * código. O problema é que quem configura o servidor lê o nome comercial
 * ("Sonnet 5", "Opus 5") e é isso que digita — mas a API só aceita o
 * IDENTIFICADOR (`claude-sonnet-5`). Com um valor inválido a chamada falha com
 * erro de modelo, ou (pior) cai silenciosamente no fallback e ninguém percebe
 * que a configuração não está valendo.
 *
 * Este módulo resolve isso em um lugar só: aceita o nome comercial, devolve o
 * ID correto e, quando não dá para entender o valor, diz exatamente o que
 * está errado — texto que a tela de Diagnóstico de IA mostra.
 *
 * Módulo PURO: sem rede, sem `server-only`. Testado em `modelos.test.ts`.
 */

/**
 * Modelos conhecidos, do mais capaz ao mais econômico. Serve para validar o
 * que vem do ambiente e para montar a cadeia de fallback; NÃO é uma lista
 * fechada — um modelo novo, lançado depois desta versão, passa direto (ver
 * `pareceIdDeModelo`).
 */
export const MODELOS_CLAUDE = [
  { id: "claude-opus-5", rotulo: "Claude Opus 5" },
  { id: "claude-opus-4-8", rotulo: "Claude Opus 4.8" },
  { id: "claude-opus-4-7", rotulo: "Claude Opus 4.7" },
  { id: "claude-opus-4-6", rotulo: "Claude Opus 4.6" },
  { id: "claude-sonnet-5", rotulo: "Claude Sonnet 5" },
  { id: "claude-sonnet-4-6", rotulo: "Claude Sonnet 4.6" },
  { id: "claude-haiku-4-5", rotulo: "Claude Haiku 4.5" },
] as const;

export type IdModelo = (typeof MODELOS_CLAUDE)[number]["id"];

/**
 * Padrão do app quando `ANTHROPIC_MODEL` não está definida.
 *
 * O uso da API é cobrado por token e a leitura de documento é o que mais roda
 * aqui — então o padrão é o modelo mais barato. Ele dá conta de PDF nítido
 * (DANFE, comprovante de Pix, boleto), que é a maior parte do volume.
 *
 * Se a leitura de FOTO (cupom amassado, papel desbotado, imagem torta) vier
 * fraca, subir um degrau resolve sem tocar em código: basta
 * `ANTHROPIC_MODEL=claude-sonnet-5` (ou `claude-opus-5`, o mais capaz). O que
 * a IA não entender continua chegando na tela como alerta de campo, então uma
 * leitura pior custa conferência, não erro silencioso.
 */
export const MODELO_PADRAO: IdModelo = "claude-haiku-4-5";

/**
 * Alternativos, em ordem, quando o modelo escolhido não está liberado para a
 * conta. Segue a mesma lógica do padrão: sobe o mínimo necessário.
 */
export const MODELOS_FALLBACK: IdModelo[] = [
  "claude-sonnet-5",
  "claude-opus-4-8",
];

const IDS = new Set<string>(MODELOS_CLAUDE.map((m) => m.id));

const MARCAS_ACENTO = new RegExp("[\\u0300-\\u036f]", "g");

/** "Claude Sonnet 5" / "sonnet-5" / "SONNET5" → "sonnet5". */
function chave(v: string): string {
  return v
    .toLowerCase()
    .normalize("NFD")
    .replace(MARCAS_ACENTO, "")
    .replace(/claude/g, "")
    .replace(/[^a-z0-9]/g, "");
}

/** Nome comercial → id. Montado a partir do próprio catálogo. */
const POR_NOME = new Map<string, IdModelo>();
for (const m of MODELOS_CLAUDE) {
  POR_NOME.set(chave(m.rotulo), m.id);
  POR_NOME.set(chave(m.id), m.id);
}
// Apelidos que aparecem no dia a dia (versão sem o número, escrita "4.5"...).
POR_NOME.set("opus", "claude-opus-5");
POR_NOME.set("sonnet", "claude-sonnet-5");
POR_NOME.set("haiku", "claude-haiku-4-5");

/**
 * Parece um identificador de modelo da Anthropic? Serve para deixar passar um
 * modelo lançado depois desta versão do app: travar em uma lista fixa
 * significaria ter que alterar código a cada lançamento — exatamente o que a
 * variável de ambiente existe para evitar.
 */
export function pareceIdDeModelo(v: string): boolean {
  return /^claude-[a-z0-9]+(-[a-z0-9]+)+$/.test(v.trim().toLowerCase());
}

export interface ModeloResolvido {
  /** ID que será enviado à API. */
  id: string;
  /**
   * `padrao`     — a variável não está definida;
   * `id`         — veio um ID válido;
   * `desconhecido` — veio um ID plausível, fora do catálogo desta versão;
   * `nome`       — veio o nome comercial e foi traduzido para o ID;
   * `invalido`   — não deu para entender: usa o padrão.
   */
  origem: "padrao" | "id" | "desconhecido" | "nome" | "invalido";
  /** Texto para a tela quando há algo a corrigir/saber. Vazio = tudo certo. */
  aviso: string;
}

/**
 * Traduz o valor de `ANTHROPIC_MODEL` no ID que vai para a API.
 *
 * Nunca lança: um valor errado no ambiente não pode derrubar a leitura — cai
 * no padrão e explica o problema para quem cuida do servidor.
 */
export function resolverModelo(valorEnv: string | undefined | null): ModeloResolvido {
  const bruto = (valorEnv ?? "").trim();
  if (!bruto) {
    return { id: MODELO_PADRAO, origem: "padrao", aviso: "" };
  }
  if (IDS.has(bruto)) {
    return { id: bruto, origem: "id", aviso: "" };
  }
  const porNome = POR_NOME.get(chave(bruto));
  if (porNome) {
    return {
      id: porNome,
      origem: "nome",
      aviso:
        `ANTHROPIC_MODEL está como "${bruto}", que é o nome comercial. ` +
        `Foi usado o identificador "${porNome}" — grave esse valor na variável para não depender desta tradução.`,
    };
  }
  if (pareceIdDeModelo(bruto)) {
    return {
      id: bruto.toLowerCase(),
      origem: "desconhecido",
      aviso:
        `ANTHROPIC_MODEL está como "${bruto}", que não está na lista conhecida desta versão do app. ` +
        "Se for um modelo novo, tudo bem; se for erro de digitação, a chamada vai falhar.",
    };
  }
  return {
    id: MODELO_PADRAO,
    origem: "invalido",
    aviso:
      `ANTHROPIC_MODEL está como "${bruto}", que não é um identificador de modelo válido. ` +
      `Usando "${MODELO_PADRAO}". Valores aceitos: ${MODELOS_CLAUDE.map((m) => m.id).join(", ")}.`,
  };
}

/** Nome comercial de um ID, para exibir junto do identificador na tela. */
export function rotuloModelo(id: string): string {
  return MODELOS_CLAUDE.find((m) => m.id === id)?.rotulo ?? id;
}

/** Cadeia de tentativas: o escolhido primeiro, depois os alternativos. */
export function cadeiaDeModelos(id: string): string[] {
  return [id, ...MODELOS_FALLBACK.filter((m) => m !== id)];
}
```

### `src/lib/ai/erros.ts`

```ts
/**
 * Tradução das falhas da API de IA em mensagens acionáveis, em português.
 *
 * O que vem da API é um JSON em inglês ("Your credit balance is too low...").
 * Quem lê isso na tela de Diagnóstico conclui o que for — normalmente "a chave
 * está errada" — e vai mexer na configuração errada. Cada caso aqui existe
 * porque alguém precisou saber O QUE FAZER, não o que aconteceu.
 *
 * Módulo PURO (sem SDK, sem rede): testado em `erros.test.ts`.
 */

export interface FalhaIa {
  /** Status HTTP, quando houver. */
  status?: number;
  /** Mensagem original (normalmente já com o corpo JSON da API). */
  mensagem: string;
  /** O SDK classificou como falha de conexão? */
  semConexao?: boolean;
}

export function mensagemDeErroIa({ status, mensagem, semConexao }: FalhaIa): string {
  // Saldo/créditos vem ANTES do status: a API responde 400, que sozinho seria
  // lido como "requisição inválida" e mandaria mexer no código ou no modelo —
  // quando o que falta é crédito na conta.
  if (/credit balance is too low|purchase credits|Plans & Billing/i.test(mensagem)) {
    return (
      "A conta da API de IA está sem créditos. A chave e o modelo estão corretos — " +
      "adicione créditos em console.anthropic.com (Plans & Billing) e teste novamente."
    );
  }
  // Chave vinculada a identidade (service account): a API exige saber em qual
  // workspace a requisição age. Também vem como 400 — sem esta tradução,
  // parece problema no código.
  if (/anthropic-workspace-id is required|identity-linked/i.test(mensagem)) {
    return (
      "A chave de IA é vinculada a identidade e exige o workspace: defina " +
      "ANTHROPIC_WORKSPACE_ID no ambiente do servidor com o ID do workspace " +
      "(console.anthropic.com → Settings → Workspaces, começa com wrkspc_) e " +
      "redeploy. Alternativa: gere uma chave de API comum, que dispensa isso."
    );
  }
  if (status === 401 || status === 403) {
    return "Chave de IA inválida ou sem permissão (verifique ANTHROPIC_API_KEY).";
  }
  if (status === 404) {
    return (
      "O modelo configurado não existe ou não está liberado para esta conta. " +
      "Confira ANTHROPIC_MODEL — ela aceita o identificador (ex.: claude-sonnet-5), não o nome comercial."
    );
  }
  if (status === 429) {
    return "Limite de uso da IA atingido — tente novamente em instantes.";
  }
  if (semConexao || /fetch failed|ENOTFOUND|ECONNREFUSED|ETIMEDOUT|network/i.test(mensagem)) {
    return "Sem conexão com a API da IA — verifique a rede/egress do servidor.";
  }
  return `Falha na leitura por IA: ${mensagem}`;
}
```

### `src/lib/ai/campos.ts`

```ts
/**
 * Leitura de documentos por IA — vocabulário comum de "campo lido".
 *
 * Toda tela que aceita subir um documento (NF, boleto, cupom, comprovante,
 * foto) e pré-preencher um formulário usa estes tipos. A regra de negócio que
 * eles carregam é uma só, e vale para qualquer tela:
 *
 *   o que a IA preencheu com certeza fica limpo; o que ela NÃO conseguiu
 *   preencher, ou preencheu sem confiança, fica marcado com ALERTA para o
 *   usuário conferir antes de gravar.
 *
 * Nada aqui bloqueia o lançamento — alerta é sinal, não trava. O documento
 * que chega da obra é foto amassada, cupom sem valor fiscal e comprovante com
 * CPF mascarado; exigir certeza impediria o uso real.
 *
 * Módulo PURO (sem `server-only`, sem React): é importado tanto pelo servidor
 * — que fala com a API da IA — quanto pelo cliente, que desenha os alertas.
 */

/**
 * Formatos que a IA consegue LER. Outros arquivos (XML da nota, planilha,
 * e-mail) continuam podendo ser anexados à despesa — só não são lidos. Fica
 * neste módulo puro porque a tela também precisa da lista, para saber se vale
 * disparar a leitura do que o usuário acabou de escolher.
 */
export const AI_ACCEPTED_MIME = [
  "application/pdf",
  "image/png",
  "image/jpeg",
  "image/webp",
  "image/gif",
] as const;

/** O arquivo escolhido é legível pela IA? */
export function legivelPelaIa(mime: string): boolean {
  return (AI_ACCEPTED_MIME as readonly string[]).includes(mime || "");
}

/**
 * Quantos arquivos vão juntos numa leitura. Passa de longe o caso real (nota +
 * comprovante + foto do cupom) e evita que alguém selecione a pasta inteira e
 * mande 40 páginas para a IA de uma vez.
 */
export const AI_MAX_DOCS = 4;

/** Quanta certeza a IA tem do que leu naquele campo específico. */
export type Confianca = "alta" | "media" | "baixa";

/**
 * Um campo lido do documento. `nota` é o que a IA quer dizer ao usuário sobre
 * aquele campo — de onde tirou o dado, ou por que está em dúvida. É essa nota
 * que vira o texto do alerta na tela.
 */
export interface CampoLido<T = string> {
  valor: T;
  confianca: Confianca;
  nota: string;
}

/**
 * `faltando` — o documento não traz a informação (ou ela não existe nele).
 * `conferir` — há um valor, mas ele pode estar errado: leitura duvidosa,
 * dado inferido/deduzido, ou algo que a IA trouxe e a tela não pôde aplicar
 * (fornecedor não cadastrado, categoria inexistente...).
 */
export type NivelAlerta = "faltando" | "conferir";

export interface Alerta {
  nivel: NivelAlerta;
  motivo: string;
}

/** Campo lido vazio (string em branco, número zero, booleano falso ausente). */
export function vazio<T>(campo: CampoLido<T> | null | undefined): boolean {
  if (!campo) return true;
  const v = campo.valor;
  if (typeof v === "string") return v.trim() === "";
  if (typeof v === "number") return !v;
  return v === null || v === undefined;
}

/** Normaliza um campo vindo da API (que pode chegar parcial ou fora do tipo). */
export function normalizarCampo(bruto: unknown, padrao = ""): CampoLido {
  const o = (bruto ?? {}) as Partial<CampoLido>;
  const conf: Confianca =
    o.confianca === "alta" || o.confianca === "media" || o.confianca === "baixa"
      ? o.confianca
      : "baixa";
  return {
    valor: typeof o.valor === "string" ? o.valor.trim() : padrao,
    confianca: conf,
    nota: typeof o.nota === "string" ? o.nota.trim() : "",
  };
}

/** Idem, para campos numéricos (valor da despesa). */
export function normalizarCampoNumero(bruto: unknown): CampoLido<number> {
  const c = normalizarCampo(bruto);
  const o = (bruto ?? {}) as { valor?: unknown };
  const n = typeof o.valor === "number" ? o.valor : Number(o.valor);
  return { ...c, valor: Number.isFinite(n) ? n : 0 };
}

/** Idem, para campos booleanos (ex.: "o documento comprova pagamento?"). */
export function normalizarCampoBool(bruto: unknown): CampoLido<boolean> {
  const c = normalizarCampo(bruto);
  const o = (bruto ?? {}) as { valor?: unknown };
  return { ...c, valor: o.valor === true || o.valor === "true" };
}

/**
 * Decide o alerta de um campo depois que a tela tentou aplicá-lo.
 *
 * A ordem importa:
 *  1. a IA trouxe algo que a tela NÃO conseguiu usar → sempre "conferir"
 *     (ex.: leu "Casarão Itanhaém" e não existe esse fornecedor cadastrado);
 *  2. ficou vazio e o campo é essencial ao lançamento → "faltando";
 *  3. preencheu, mas sem confiança alta → "conferir".
 *
 * Campo opcional que ficou vazio não vira alerta: marcar tudo que o documento
 * não tem transformaria a tela num muro amarelo e o alerta perderia o sentido.
 */
export function avaliarCampo<T>(
  campo: CampoLido<T> | null | undefined,
  opts: {
    /** O valor efetivamente aplicado no formulário ficou vazio? */
    aplicadoVazio: boolean;
    /** O campo é essencial para um lançamento correto? */
    essencial?: boolean;
    /** Motivo de a tela não ter conseguido aplicar o que a IA leu. */
    naoAplicado?: string;
  },
): Alerta | null {
  if (opts.naoAplicado) {
    return { nivel: "conferir", motivo: opts.naoAplicado };
  }
  if (opts.aplicadoVazio) {
    if (!opts.essencial) return null;
    return {
      nivel: "faltando",
      motivo:
        campo?.nota?.trim() ||
        "O documento não traz esta informação — preencha manualmente.",
    };
  }
  if (campo && campo.confianca !== "alta") {
    return {
      nivel: "conferir",
      motivo:
        campo.nota.trim() ||
        (campo.confianca === "baixa"
          ? "Leitura de baixa confiança — confira no documento."
          : "Valor deduzido do documento — confira antes de lançar."),
    };
  }
  return null;
}

/** Quantos alertas de cada nível — alimenta o resumo no topo do formulário. */
export function contarAlertas(alertas: Record<string, Alerta>): {
  faltando: number;
  conferir: number;
  total: number;
} {
  const vals = Object.values(alertas);
  const faltando = vals.filter((a) => a.nivel === "faltando").length;
  const conferir = vals.filter((a) => a.nivel === "conferir").length;
  return { faltando, conferir, total: vals.length };
}

// ── Conversões de data ────────────────────────────────────────────────────
//
// A IA responde SEMPRE em ISO (YYYY-MM-DD / YYYY-MM): é o único formato sem
// ambiguidade entre 03/04 (3 de abril) e 03/04 (4 de março) — e o documento
// brasileiro escreve DD/MM enquanto o formato interno das telas é MM/DD/YYYY.
// A tradução acontece aqui, uma vez, com validação de calendário.

/** "2026-07-20" → "07/20/2026" (formato interno). Vazio se inválido. */
export function isoParaDataInterna(iso: string): string {
  const m = (iso || "").trim().match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!m) return "";
  const ano = Number(m[1]);
  const mes = Number(m[2]);
  const dia = Number(m[3]);
  if (mes < 1 || mes > 12 || dia < 1 || dia > 31 || ano < 1900 || ano > 2200) return "";
  // Rejeita data inexistente (31/02) — a IA às vezes "completa" um dia ilegível.
  const d = new Date(Date.UTC(ano, mes - 1, dia));
  if (d.getUTCMonth() !== mes - 1 || d.getUTCDate() !== dia) return "";
  return `${m[2]}/${m[3]}/${m[1]}`;
}

/** "2026-07" → "07/2026" (competência interna). Vazio se inválido. */
export function isoParaCompetenciaInterna(iso: string): string {
  const m = (iso || "").trim().match(/^(\d{4})-(\d{2})$/);
  if (!m) return "";
  const mes = Number(m[2]);
  if (mes < 1 || mes > 12) return "";
  return `${m[2]}/${m[1]}`;
}

/** "07/20/2026" → "07/2026": competência derivada de uma data interna. */
export function competenciaDeDataInterna(interna: string): string {
  const p = (interna || "").split("/");
  return p.length === 3 ? `${p[0]}/${p[2]}` : "";
}

// ── Normalizações de texto/documento ──────────────────────────────────────

const MARCAS_ACENTO = new RegExp("[\\u0300-\\u036f]", "g");

/** Compara nomes ignorando acento, caixa e pontuação. */
export function normalizarNome(s: string): string {
  return (s || "")
    .toLowerCase()
    .normalize("NFD")
    .replace(MARCAS_ACENTO, "")
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

export function somenteDigitos(s: string): string {
  return (s || "").replace(/\D+/g, "");
}

/**
 * CPF/CNPJ legível por completo? Comprovante de Pix mascara o CPF
 * ("***.844.476-**") e cupom às vezes borra o CNPJ — nesses casos o documento
 * existe, mas o dado NÃO serve para identificar o fornecedor com segurança.
 */
export function docCompleto(doc: string): boolean {
  const d = somenteDigitos(doc);
  return d.length === 11 || d.length === 14;
}
```

### `src/lib/ai/despesa-prompt.ts`

```ts
/**
 * O texto que vai para a IA na leitura de uma despesa — separado em duas
 * partes, e a separação é o ponto deste módulo.
 *
 * A conta da API é cobrada por token, e a maior parte do que enviamos em cada
 * leitura NÃO muda: os fornecedores cadastrados, o plano de contas, as obras,
 * as regras. Só o documento muda. Colocando o que é estável no `system` e
 * marcando um ponto de cache, essa parte passa a ser cobrada ~10% nas leituras
 * seguintes (a janela de cache é curta, mas o uso real é lançar vários
 * documentos em sequência — exatamente o caso que ela cobre).
 *
 * Para o cache valer, o prefixo precisa ser IDÊNTICO byte a byte entre as
 * chamadas: por isso as listas são ordenadas aqui, e não na consulta ao banco.
 * Qualquer variação de ordem invalidaria o cache em silêncio.
 *
 * Módulo PURO: testado em `despesa-prompt.test.ts`.
 */

export interface ContextoLeituraDespesa {
  fornecedores: { nome: string; doc: string | null }[];
  contas: { code: string; name: string }[];
  projetos: { nome: string }[];
  categorias: readonly string[];
  tiposDocumento: readonly { id: string; label: string }[];
  /** A própria empresa — para NÃO ser confundida com o fornecedor. */
  empresa: { nome: string; cnpj: string | null };
}

/** Tetos de listagem: o que passa disso não cabe no prompt sem virar custo. */
const MAX_FORNECEDORES = 200;
const MAX_CONTAS = 400;

const porTexto = (a: string, b: string) => a.localeCompare(b, "pt-BR");

/**
 * Parte ESTÁVEL do prompt (vai em `system`, com ponto de cache): quem é a
 * empresa, o que existe cadastrado e as regras de leitura. Só muda quando o
 * cadastro do tenant muda.
 */
export function promptSistemaDespesa(ctx: ContextoLeituraDespesa): string {
  const fornList =
    [...ctx.fornecedores]
      .sort((a, b) => porTexto(a.nome, b.nome))
      .slice(0, MAX_FORNECEDORES)
      .map((f) => `- ${f.nome}${f.doc ? ` (${f.doc})` : ""}`)
      .join("\n") || "(nenhum cadastrado)";
  const contaList =
    [...ctx.contas]
      .sort((a, b) => a.code.localeCompare(b.code, undefined, { numeric: true }))
      .slice(0, MAX_CONTAS)
      .map((c) => `- ${c.code} — ${c.name}`)
      .join("\n") || "(nenhum cadastrado)";
  const projList =
    [...ctx.projetos]
      .sort((a, b) => porTexto(a.nome, b.nome))
      .map((p) => `- ${p.nome}`)
      .join("\n") || "(nenhum cadastrado)";
  const tipoList = ctx.tiposDocumento.map((t) => `- ${t.id} = ${t.label}`).join("\n");

  return (
    "Você lê documentos de compra de uma construtora (nota fiscal, cupom, boleto, " +
    "comprovante de pagamento, recibo, foto de papel) e preenche o lançamento da despesa.\n\n" +
    `EMPRESA QUE ESTÁ LANÇANDO (é a PAGADORA — nunca a fornecedora): ${ctx.empresa.nome}` +
    (ctx.empresa.cnpj ? ` — CNPJ ${ctx.empresa.cnpj}` : "") +
    ".\nEm comprovante de Pix/TED, o fornecedor é o RECEBEDOR, não o pagador. " +
    "Nunca devolva os dados da empresa acima como fornecedor.\n\n" +
    `OBRAS/PROJETOS cadastrados:\n${projList}\n\n` +
    `FORNECEDORES já cadastrados (use exatamente o nome quando corresponder):\n${fornList}\n\n` +
    `PLANO DE CONTAS (escolha o código mais adequado):\n${contaList}\n\n` +
    `TIPOS DE DOCUMENTO FISCAL aceitos:\n${tipoList}\n\n` +
    "REGRAS:\n" +
    "- Datas SEMPRE em ISO: YYYY-MM-DD (e YYYY-MM na competência). O documento brasileiro escreve DD/MM/AAAA — converta.\n" +
    "- Valor numérico em reais, com ponto decimal, já líquido de desconto (se o cupom mostra Mercadorias, Desconto e Total, use o Total).\n" +
    "- Nunca invente: o que não estiver no documento volta vazio, com confianca=baixa e a nota explicando.\n" +
    '- Use confianca="alta" só para o que está escrito e legível; "media" para o que você deduziu; "baixa" para o que está ilegível, cortado, mascarado ou é palpite.\n' +
    "- A nota é lida pelo usuário na tela, em português, curta e útil (ex.: 'CPF mascarado no comprovante', 'competência deduzida da data do Pix').\n" +
    "- Comprovante de pagamento não é nota fiscal: docFiscalTipo=SEM_DOC, e pago=true."
  );
}

/**
 * Parte VOLÁTIL: o que muda a cada leitura. Fica depois do ponto de cache e
 * por isso precisa ser curta — cada token aqui é cobrado inteiro, sempre.
 */
export function instrucaoLeituraDespesa(quantidadeDeArquivos: number): string {
  return (
    (quantidadeDeArquivos > 1
      ? `São ${quantidadeDeArquivos} arquivos da MESMA compra (ex.: a nota e o comprovante do pagamento): combine as informações. ` +
        "Se perceber que tratam de despesas diferentes, use os dados do documento principal e registre isso em observacoes. "
      : "") + "Extraia os dados e chame a ferramenta preencher_despesa."
  );
}
```

### `src/lib/ai/despesa-extract.ts`

```ts
import "server-only";
import Anthropic from "@anthropic-ai/sdk";
import { aiClient, createMessageWithFallback, isAiConfigured } from "@/lib/ai/client";
import {
  AI_ACCEPTED_MIME,
  AI_MAX_DOCS,
  normalizarCampo,
  normalizarCampoBool,
  normalizarCampoNumero,
} from "@/lib/ai/campos";
import {
  NATUREZAS_ARQUIVO,
  type ExtractedDespesa,
  type NaturezaArquivo,
} from "@/lib/ai/despesa-doc";
import {
  instrucaoLeituraDespesa,
  promptSistemaDespesa,
  type ContextoLeituraDespesa,
} from "@/lib/ai/despesa-prompt";

/**
 * Leitura por IA dos documentos de uma despesa (NF, cupom, boleto, comprovante,
 * foto do papel) para pré-preencher o lançamento.
 *
 * Duas características que diferenciam esta leitura de um OCR comum:
 *
 * 1. **Vários arquivos, um lançamento.** A mesma compra costuma chegar em duas
 *    partes — a nota E o comprovante do Pix, ou a foto do cupom E o print da
 *    transferência. Os arquivos vão juntos na MESMA chamada para que a IA
 *    cruze as informações (a nota dá o número e a chave; o comprovante diz que
 *    já foi pago, quando e como).
 * 2. **Confiança por campo.** Cada campo volta com `confianca` e uma `nota`
 *    dizendo de onde saiu ou por que está em dúvida. É isso que a tela
 *    transforma em ALERTA — o usuário sabe exatamente o que conferir em vez de
 *    reler o documento inteiro.
 *
 * Fica desabilitada quando `ANTHROPIC_API_KEY` não está definida (mesmo padrão
 * do R2): nesse caso o upload/vínculo do arquivo continua funcionando.
 */

export { isAiConfigured, AI_ACCEPTED_MIME, AI_MAX_DOCS };
export type { ExtractedDespesa };

type ImageMime = "image/png" | "image/jpeg" | "image/webp" | "image/gif";

export interface DocumentoParaLeitura {
  bytes: Uint8Array;
  mime: string;
  filename: string;
}

export type { ContextoLeituraDespesa };

/** Sub-schema de um campo lido: valor + confiança + nota para o usuário. */
function campoSchema(
  descricaoValor: string,
  tipo: "string" | "number" | "boolean" = "string",
  extra: Record<string, unknown> = {},
) {
  return {
    type: "object" as const,
    additionalProperties: false,
    properties: {
      valor: { type: tipo, description: descricaoValor, ...extra },
      confianca: {
        type: "string",
        enum: ["alta", "media", "baixa"],
        description:
          "alta = está escrito no documento, sem ambiguidade. media = deduzido/interpretado. baixa = ilegível, parcial ou palpite.",
      },
      nota: {
        type: "string",
        description:
          "Uma frase curta, em português, para o usuário: de onde saiu o dado ou por que há dúvida. Vazio quando confianca=alta.",
      },
    },
    required: ["valor", "confianca", "nota"],
  };
}

function blocoDoDocumento(doc: DocumentoParaLeitura): Anthropic.ContentBlockParam {
  const data = Buffer.from(doc.bytes).toString("base64");
  return doc.mime === "application/pdf"
    ? { type: "document", source: { type: "base64", media_type: "application/pdf", data } }
    : { type: "image", source: { type: "base64", media_type: doc.mime as ImageMime, data } };
}

/**
 * Envia os documentos para a Claude e devolve os campos da despesa, cada um
 * com sua confiança. Campos não identificados voltam vazios ("" / 0 / false)
 * com a `nota` explicando a ausência.
 */
export async function extractDespesaFromDocument(
  docs: DocumentoParaLeitura[],
  ctx: ContextoLeituraDespesa,
): Promise<ExtractedDespesa> {
  if (!isAiConfigured()) {
    throw new Error("Leitura por IA não configurada (defina ANTHROPIC_API_KEY).");
  }
  if (docs.length === 0) throw new Error("Selecione ao menos um documento.");
  const client = aiClient();

  const tool: Anthropic.ToolUnion = {
    name: "preencher_despesa",
    description:
      "Preenche os campos de um lançamento de despesa a partir dos documentos anexados (nota fiscal, cupom, boleto, comprovante de pagamento, recibo ou foto).",
    input_schema: {
      type: "object",
      additionalProperties: false,
      properties: {
        natureza: {
          type: "string",
          enum: [...NATUREZAS_ARQUIVO],
          description:
            "O que são os arquivos, no conjunto. COMPROVANTE = comprovante de pagamento (Pix, TED, recibo de transferência). CUPOM = cupom/recibo de loja, inclusive 'SEM VALOR FISCAL'. ORCAMENTO = orçamento/pedido ainda não executado.",
        },
        resumo: {
          type: "string",
          description:
            "Uma frase em português dizendo o que é a despesa (ex.: 'Compra de 1 saco de cimento na A F Andrade, NF-e 17547').",
        },
        observacoes: {
          type: "array",
          items: { type: "string" },
          description:
            "Ressalvas gerais sobre a leitura: foto cortada, valor rasurado, documento sem valor fiscal, arquivos que parecem ser de despesas diferentes. Lista vazia se não houver.",
        },
        fornecedorNome: campoSchema(
          "Nome/razão social de QUEM RECEBE o dinheiro (emitente da nota, loja, prestador, recebedor do Pix). Vazio se não identificar.",
        ),
        fornecedorDoc: campoSchema(
          "CNPJ ou CPF do fornecedor, como está escrito. Se estiver mascarado (ex.: ***.844.476-**), copie assim mesmo e use confianca=baixa.",
        ),
        valor: campoSchema(
          "Valor total efetivamente devido, em reais, já com descontos (número puro, sem 'R$' nem separador de milhar). 0 se não identificar.",
          "number",
        ),
        competencia: campoSchema(
          "Mês do FATO GERADOR (entrega/serviço/emissão), formato ISO YYYY-MM. Vazio se não der para determinar.",
        ),
        vencimento: campoSchema(
          "Data de vencimento, formato ISO YYYY-MM-DD. Vazio se o documento não trouxer prazo.",
        ),
        descricao: campoSchema(
          "Objeto da compra em uma linha (ex.: '2 discos diamantados segmentados 110mm'). Para serviço, o que foi feito.",
        ),
        categoriaDre: campoSchema(
          "Categoria DRE mais provável, EXATAMENTE como listada abaixo. Vazio se incerto.",
          "string",
          { enum: [...ctx.categorias, ""] },
        ),
        contaCef: campoSchema(
          "Código do plano de contas mais adequado (ex.: 1.1), dentre os listados. Vazio se incerto.",
        ),
        projetoNome: campoSchema(
          "Obra/projeto citado no documento (ex.: 'OBRA 25' no nome do destinatário, ou carimbado no cupom). Vazio se não citar.",
        ),
        docFiscalTipo: campoSchema(
          "Tipo de documento fiscal, usando um dos ids listados. Use SEM_DOC para comprovante de pagamento, cupom sem valor fiscal e orçamento.",
          "string",
          { enum: [...ctx.tiposDocumento.map((t) => t.id), ""] },
        ),
        numDoc: campoSchema(
          "Número da nota/cupom/boleto emitido pelo fornecedor. Vazio se não houver.",
        ),
        serie: campoSchema("Série da nota fiscal. Vazio se não houver."),
        chaveAcesso: campoSchema(
          "Chave de acesso da NF-e (44 dígitos, sem separadores). Vazio se não houver.",
        ),
        dataEmissao: campoSchema("Data de emissão do documento, ISO YYYY-MM-DD."),
        formaPagamento: campoSchema(
          "Meio de pagamento: PIX, Boleto, Transferência bancária, Cartão de crédito, Cartão de débito, Dinheiro, Cheque, Débito automático. Vazio se não constar.",
        ),
        pago: campoSchema(
          "true SOMENTE se os documentos comprovarem pagamento já efetuado (comprovante efetivado, carimbo PAGO, cupom quitado à vista).",
          "boolean",
        ),
        dataPagamento: campoSchema(
          "Data em que o pagamento foi feito, ISO YYYY-MM-DD. Vazio se não houver comprovante.",
        ),
      },
      required: [
        "natureza",
        "resumo",
        "observacoes",
        "fornecedorNome",
        "fornecedorDoc",
        "valor",
        "competencia",
        "vencimento",
        "descricao",
        "categoriaDre",
        "contaCef",
        "projetoNome",
        "docFiscalTipo",
        "numDoc",
        "serie",
        "chaveAcesso",
        "dataEmissao",
        "formaPagamento",
        "pago",
        "dataPagamento",
      ],
    },
    // SEM `strict: true` — e é de propósito. Com strict, a API compila o
    // schema inteiro numa gramática que valida a resposta byte a byte; com
    // ~20 campos aninhados (valor+confiança+nota cada um), essa gramática
    // estoura o limite e a chamada falha com 400 "compiled grammar is too
    // large". A garantia de formato aqui não vem do strict: todo campo passa
    // por normalizarCampo*/montarPreenchimentoDespesa, que tolera ausência e
    // tipo errado — campo malformado vira alerta na tela, não erro.
  };

  // Ordem que a API usa para o cache: tools → system → messages. O ponto de
  // cache no fim do `system` cobre, portanto, a ferramenta E todo o contexto do
  // tenant (fornecedores, plano de contas, obras, regras) — que é a maior parte
  // dos tokens e não muda entre uma leitura e a seguinte. O documento vem
  // depois, em `messages`, porque é o único pedaço realmente volátil.
  const message = await createMessageWithFallback(client, {
    max_tokens: 2048,
    tools: [tool],
    tool_choice: { type: "tool", name: "preencher_despesa" },
    system: [
      {
        type: "text",
        text: promptSistemaDespesa(ctx),
        cache_control: { type: "ephemeral" },
      },
    ],
    messages: [
      {
        role: "user",
        content: [
          ...docs.flatMap((d): Anthropic.ContentBlockParam[] =>
            docs.length > 1
              ? [{ type: "text", text: `Arquivo: ${d.filename}` }, blocoDoDocumento(d)]
              : [blocoDoDocumento(d)],
          ),
          { type: "text", text: instrucaoLeituraDespesa(docs.length) },
        ],
      },
    ],
  });

  const block = message.content.find((b) => b.type === "tool_use");
  if (!block || block.type !== "tool_use") {
    throw new Error("A IA não conseguiu extrair os campos do documento.");
  }
  const input = block.input as Record<string, unknown>;
  const natureza = String(input.natureza ?? "OUTRO") as NaturezaArquivo;

  return {
    natureza: NATUREZAS_ARQUIVO.includes(natureza) ? natureza : "OUTRO",
    resumo: typeof input.resumo === "string" ? input.resumo : "",
    observacoes: Array.isArray(input.observacoes)
      ? input.observacoes.filter((o): o is string => typeof o === "string" && !!o.trim())
      : [],
    fornecedorNome: normalizarCampo(input.fornecedorNome),
    fornecedorDoc: normalizarCampo(input.fornecedorDoc),
    valor: normalizarCampoNumero(input.valor),
    competencia: normalizarCampo(input.competencia),
    vencimento: normalizarCampo(input.vencimento),
    descricao: normalizarCampo(input.descricao),
    categoriaDre: normalizarCampo(input.categoriaDre),
    contaCef: normalizarCampo(input.contaCef),
    projetoNome: normalizarCampo(input.projetoNome),
    docFiscalTipo: normalizarCampo(input.docFiscalTipo),
    numDoc: normalizarCampo(input.numDoc),
    serie: normalizarCampo(input.serie),
    chaveAcesso: normalizarCampo(input.chaveAcesso),
    dataEmissao: normalizarCampo(input.dataEmissao),
    formaPagamento: normalizarCampo(input.formaPagamento),
    pago: normalizarCampoBool(input.pago),
    dataPagamento: normalizarCampo(input.dataPagamento),
  };
}
```

### `src/lib/ai/despesa-doc.ts`

```ts
/**
 * Documento → lançamento de despesa: o contrato da leitura e a regra de
 * preenchimento.
 *
 * Este módulo é PURO (sem rede, sem `server-only`, sem React) de propósito: é
 * aqui que mora a decisão de o que preencher, o que deduzir e o que marcar com
 * alerta — e isso precisa ser testável sem chamar a API da IA.
 *
 * Divisão de trabalho:
 *   - `despesa-extract.ts` (servidor) conversa com a IA e devolve `ExtractedDespesa`;
 *   - `montarPreenchimentoDespesa` (aqui) traduz isso para os valores do
 *     formulário + os alertas de cada campo;
 *   - `despesa-form.tsx` (cliente) só aplica o resultado e desenha.
 *
 * Os documentos reais que chegam da obra e que este módulo precisa dar conta:
 *   - DANFE de NF-e (tudo preenchido, inclusive chave de acesso);
 *   - cupom "SEM VALOR FISCAL" de loja de material (tem valor e item, não tem NF);
 *   - comprovante de Pix/TED (paga um serviço, CPF mascarado, sem nota);
 *   - boleto (vencimento sim, competência não);
 *   - orçamento/pedido (não é despesa ainda — vira alerta em quase tudo).
 */

import {
  avaliarCampo,
  competenciaDeDataInterna,
  docCompleto,
  isoParaCompetenciaInterna,
  isoParaDataInterna,
  normalizarNome,
  somenteDigitos,
  vazio,
  type Alerta,
  type CampoLido,
} from "@/lib/ai/campos";

/**
 * Natureza do arquivo enviado. Não é o mesmo que o tipo de documento fiscal:
 * um comprovante de Pix é um documento legítimo de despesa e NÃO gera nota —
 * o lançamento nasce "pendente de NF", que é situação normal aqui.
 */
export const NATUREZAS_ARQUIVO = [
  "NOTA_FISCAL",
  "CUPOM",
  "BOLETO",
  "COMPROVANTE",
  "RECIBO",
  "ORCAMENTO",
  "CONTRATO",
  "OUTRO",
] as const;
export type NaturezaArquivo = (typeof NATUREZAS_ARQUIVO)[number];

export const ROTULO_NATUREZA: Record<NaturezaArquivo, string> = {
  NOTA_FISCAL: "Nota fiscal",
  CUPOM: "Cupom / recibo de loja",
  BOLETO: "Boleto",
  COMPROVANTE: "Comprovante de pagamento",
  RECIBO: "Recibo",
  ORCAMENTO: "Orçamento / pedido",
  CONTRATO: "Contrato",
  OUTRO: "Documento",
};

/** O que a IA devolve depois de ler um ou mais arquivos da MESMA despesa. */
export interface ExtractedDespesa {
  natureza: NaturezaArquivo;
  /** Uma linha dizendo o que é o documento — aparece no resumo da leitura. */
  resumo: string;
  /** Ressalvas gerais (documento cortado, valor rasurado, foto ilegível...). */
  observacoes: string[];

  fornecedorNome: CampoLido;
  fornecedorDoc: CampoLido;
  valor: CampoLido<number>;
  /** ISO "YYYY-MM". */
  competencia: CampoLido;
  /** ISO "YYYY-MM-DD". */
  vencimento: CampoLido;
  descricao: CampoLido;
  categoriaDre: CampoLido;
  contaCef: CampoLido;
  projetoNome: CampoLido;

  /** Bloco documento fiscal — id de TIPOS_DOCUMENTO. */
  docFiscalTipo: CampoLido;
  numDoc: CampoLido;
  serie: CampoLido;
  chaveAcesso: CampoLido;
  /** ISO "YYYY-MM-DD". */
  dataEmissao: CampoLido;

  /** Pagamento. */
  formaPagamento: CampoLido;
  pago: CampoLido<boolean>;
  /** ISO "YYYY-MM-DD". */
  dataPagamento: CampoLido;
}

/** Campos do formulário de despesa que a leitura por IA pode tocar. */
export type CampoDespesa =
  | "projeto"
  | "fornecedor"
  | "docFiscalTipo"
  | "docFiscalNumero"
  | "docFiscalSerie"
  | "docFiscalEmissao"
  | "docFiscalChave"
  | "contaCef"
  | "categoriaDre"
  | "competencia"
  | "vencimento"
  | "valor"
  | "status"
  | "obs"
  | "formaPagamento";

export const ROTULO_CAMPO: Record<CampoDespesa, string> = {
  projeto: "Projeto",
  fornecedor: "Fornecedor",
  docFiscalTipo: "Tipo de documento",
  docFiscalNumero: "Nº do documento",
  docFiscalSerie: "Série",
  docFiscalEmissao: "Emissão",
  docFiscalChave: "Chave de acesso",
  contaCef: "Conta / plano de contas",
  categoriaDre: "Categoria DRE",
  competencia: "Competência",
  vencimento: "Vencimento",
  valor: "Valor",
  status: "Status",
  obs: "Descrição da compra",
  formaPagamento: "Forma de pagamento",
};

/** Valores prontos para o estado do formulário (formato interno das telas). */
export interface ValoresDespesa {
  projetoId?: string;
  fornecedorId?: string;
  contaCef?: string;
  categoriaDre?: string;
  /** "MM/YYYY". */
  competencia?: string;
  /** "MM/DD/YYYY". */
  vencimento?: string;
  /** Valor canônico em reais, com ponto decimal ("1234.56"). */
  valor?: string;
  status?: "Pago" | "A pagar";
  obs?: string;
  formaPagamento?: string;
  docFiscal?: {
    tipo: string;
    numero: string;
    serie: string;
    chaveAcesso: string;
    /** "MM/DD/YYYY". */
    dataEmissao: string;
  };
  /** "MM/DD/YYYY" — usado quando o documento comprova pagamento já feito. */
  dataPagamento?: string;
}

export interface PreenchimentoDespesa {
  valores: ValoresDespesa;
  /** Campo → alerta. Campo ausente = preenchido com confiança, sem alerta. */
  alertas: Partial<Record<CampoDespesa, Alerta>>;
  /** Rótulos dos campos efetivamente preenchidos (para o resumo da leitura). */
  preenchidos: string[];
  natureza: NaturezaArquivo;
  resumo: string;
  observacoes: string[];
}

export interface ContextoDespesa {
  fornecedores: { id: string; nome: string; doc: string | null }[];
  /** Códigos existentes no plano de contas do tenant. */
  contas: string[];
  /** Categorias DRE ACEITAS para despesa (natureza devedora). */
  categorias: readonly string[];
  projetos: { id: string; nome: string }[];
  formasPagamento: readonly string[];
  /** Ids válidos de TIPOS_DOCUMENTO. */
  tiposDocumento: readonly string[];
}

/** Resultado do casamento de um texto lido com um cadastro existente. */
interface Match {
  id: string | null;
  /** Casou por um critério fraco (nome parecido) e merece conferência. */
  fraco: boolean;
}

function acharFornecedor(
  nome: string,
  doc: string,
  lista: ContextoDespesa["fornecedores"],
): Match {
  // 1) CNPJ/CPF é identificador — mas só quando veio completo. Comprovante de
  //    Pix mascara o CPF, e casar por dígito parcial vincularia a despesa ao
  //    fornecedor errado sem ninguém perceber.
  if (docCompleto(doc)) {
    const d = somenteDigitos(doc);
    const byDoc = lista.find((f) => f.doc && somenteDigitos(f.doc) === d);
    if (byDoc) return { id: byDoc.id, fraco: false };
  }
  const n = normalizarNome(nome);
  if (!n) return { id: null, fraco: false };
  const exato = lista.find((f) => normalizarNome(f.nome) === n);
  if (exato) return { id: exato.id, fraco: false };
  // 2) "CASARAO ITANHAEM COM MAT CONSTR LTDA" no cupom x "Casarão Itanhaém"
  //    no cadastro: casa, mas é palpite — o usuário confirma.
  const parcial = lista.find((f) => {
    const fn = normalizarNome(f.nome);
    return fn.length >= 4 && (fn.includes(n) || n.includes(fn));
  });
  return parcial ? { id: parcial.id, fraco: true } : { id: null, fraco: false };
}

function acharProjeto(nome: string, lista: ContextoDespesa["projetos"]): Match {
  const n = normalizarNome(nome);
  if (!n) return { id: null, fraco: false };
  const exato = lista.find((p) => normalizarNome(p.nome) === n);
  if (exato) return { id: exato.id, fraco: false };
  // A obra costuma vir embutida no nome do destinatário ("BMV CONSTRUCOES
  // LTDA (OBRA 25)") ou carimbada no cupom ("OBRA 28").
  const parcial = lista.find((p) => {
    const pn = normalizarNome(p.nome);
    return pn.length >= 3 && (n.includes(pn) || pn.includes(n));
  });
  return parcial ? { id: parcial.id, fraco: true } : { id: null, fraco: false };
}

/** Casa a forma de pagamento lida com a lista fechada do sistema. */
function acharForma(lido: string, formas: readonly string[]): string | null {
  const n = normalizarNome(lido);
  if (!n) return null;
  const direto = formas.find((f) => normalizarNome(f) === n);
  if (direto) return direto;
  const sinonimos: Record<string, string> = {
    pix: "PIX",
    ted: "Transferência bancária",
    doc: "Transferência bancária",
    transferencia: "Transferência bancária",
    "transferencia bancaria": "Transferência bancária",
    deposito: "Transferência bancária",
    boleto: "Boleto",
    "boleto bancario": "Boleto",
    dinheiro: "Dinheiro",
    especie: "Dinheiro",
    "a vista": "Dinheiro",
    cheque: "Cheque",
    "cartao de credito": "Cartão de crédito",
    credito: "Cartão de crédito",
    "cartao de debito": "Cartão de débito",
    debito: "Cartão de débito",
    "debito automatico": "Débito automático",
  };
  const alvo = sinonimos[n];
  return alvo && formas.includes(alvo) ? alvo : null;
}

/**
 * Traduz a leitura da IA nos valores do formulário + nos alertas por campo.
 *
 * Duas ideias guiam tudo o que está aqui:
 *
 * 1. **Deduzir é permitido, esconder não.** Quando o documento não traz o
 *    campo mas ele pode ser derivado com segurança razoável (competência a
 *    partir da emissão, vencimento de um comprovante já pago), o campo é
 *    preenchido E marcado com alerta "conferir". O usuário vê de onde veio.
 * 2. **O que não dá para aplicar vira alerta, não silêncio.** Fornecedor que
 *    não está cadastrado, conta que não existe no plano, categoria de receita
 *    sugerida para uma despesa: nada disso é aplicado, e o motivo aparece no
 *    campo.
 */
export function montarPreenchimentoDespesa(
  x: ExtractedDespesa,
  ctx: ContextoDespesa,
): PreenchimentoDespesa {
  const valores: ValoresDespesa = {};
  const alertas: Partial<Record<CampoDespesa, Alerta>> = {};
  const preenchidos: string[] = [];

  const marcar = (campo: CampoDespesa, a: Alerta | null) => {
    if (a) alertas[campo] = a;
  };
  const preencheu = (campo: CampoDespesa) => preenchidos.push(ROTULO_CAMPO[campo]);

  // ── Projeto ───────────────────────────────────────────────────────────
  // Lançar na obra errada é o erro mais caro desta tela (contamina DRE, fluxo
  // e medição). Por isso o projeto NUNCA passa sem sinal: ou a IA identificou
  // a obra no documento, ou o campo pede confirmação.
  const proj = acharProjeto(x.projetoNome.valor, ctx.projetos);
  if (proj.id) {
    valores.projetoId = proj.id;
    preencheu("projeto");
    marcar(
      "projeto",
      proj.fraco
        ? {
            nivel: "conferir",
            motivo: `Obra identificada por semelhança com "${x.projetoNome.valor}" no documento — confirme.`,
          }
        : avaliarCampo(x.projetoNome, { aplicadoVazio: false }),
    );
  } else if (!vazio(x.projetoNome)) {
    marcar("projeto", {
      nivel: "conferir",
      motivo: `O documento cita "${x.projetoNome.valor}", que não corresponde a nenhum projeto cadastrado — confirme o projeto.`,
    });
  } else {
    marcar("projeto", {
      nivel: "conferir",
      motivo: "O documento não identifica a obra — confirme se o projeto selecionado é o correto.",
    });
  }

  // ── Fornecedor ────────────────────────────────────────────────────────
  const forn = acharFornecedor(x.fornecedorNome.valor, x.fornecedorDoc.valor, ctx.fornecedores);
  if (forn.id) {
    valores.fornecedorId = forn.id;
    preencheu("fornecedor");
    marcar(
      "fornecedor",
      forn.fraco
        ? {
            nivel: "conferir",
            motivo: `Vinculado por semelhança de nome com "${x.fornecedorNome.valor}" — confirme se é o mesmo fornecedor.`,
          }
        : avaliarCampo(x.fornecedorNome, { aplicadoVazio: false }),
    );
  } else if (!vazio(x.fornecedorNome)) {
    const docTxt = docCompleto(x.fornecedorDoc.valor)
      ? ` (${x.fornecedorDoc.valor})`
      : x.fornecedorDoc.valor.trim()
        ? ` (documento incompleto no arquivo: ${x.fornecedorDoc.valor})`
        : "";
    marcar("fornecedor", {
      nivel: "conferir",
      motivo: `"${x.fornecedorNome.valor}"${docTxt} não está cadastrado — cadastre o fornecedor ou escolha o equivalente.`,
    });
  } else {
    marcar("fornecedor", avaliarCampo(x.fornecedorNome, { aplicadoVazio: true, essencial: true }));
  }

  // ── Valor ─────────────────────────────────────────────────────────────
  if (x.valor.valor > 0) {
    valores.valor = String(x.valor.valor);
    preencheu("valor");
    marcar("valor", avaliarCampo(x.valor, { aplicadoVazio: false }));
  } else {
    marcar("valor", avaliarCampo(x.valor, { aplicadoVazio: true, essencial: true }));
  }

  // ── Documento fiscal ──────────────────────────────────────────────────
  const tipoLido = x.docFiscalTipo.valor.trim().toUpperCase();
  const tipo = ctx.tiposDocumento.includes(tipoLido) ? tipoLido : "SEM_DOC";
  const emissaoInterna = isoParaDataInterna(x.dataEmissao.valor);
  const chaveDigitos = somenteDigitos(x.chaveAcesso.valor);
  valores.docFiscal = {
    tipo,
    numero: x.numDoc.valor,
    serie: x.serie.valor,
    chaveAcesso: chaveDigitos,
    dataEmissao: emissaoInterna,
  };
  if (tipo !== "SEM_DOC") {
    preencheu("docFiscalTipo");
    marcar("docFiscalTipo", avaliarCampo(x.docFiscalTipo, { aplicadoVazio: false }));
  } else if (!vazio(x.docFiscalTipo) && tipoLido !== "SEM_DOC") {
    marcar("docFiscalTipo", {
      nivel: "conferir",
      motivo: `Tipo "${x.docFiscalTipo.valor}" não é um tipo aceito — escolha manualmente.`,
    });
  }

  // O número/série/chave só viram pendência quando existe nota: comprovante de
  // Pix e cupom sem valor fiscal não têm número de documento a cobrar.
  const temNota = tipo !== "SEM_DOC";
  if (x.numDoc.valor) preencheu("docFiscalNumero");
  marcar(
    "docFiscalNumero",
    avaliarCampo(x.numDoc, { aplicadoVazio: !x.numDoc.valor, essencial: temNota }),
  );
  if (x.serie.valor) {
    preencheu("docFiscalSerie");
    marcar("docFiscalSerie", avaliarCampo(x.serie, { aplicadoVazio: false }));
  }
  if (emissaoInterna) {
    preencheu("docFiscalEmissao");
    marcar("docFiscalEmissao", avaliarCampo(x.dataEmissao, { aplicadoVazio: false }));
  } else if (!vazio(x.dataEmissao)) {
    marcar("docFiscalEmissao", {
      nivel: "conferir",
      motivo: `Data de emissão ilegível no documento ("${x.dataEmissao.valor}") — informe manualmente.`,
    });
  } else if (temNota) {
    marcar("docFiscalEmissao", avaliarCampo(x.dataEmissao, { aplicadoVazio: true, essencial: true }));
  }
  if (chaveDigitos) {
    preencheu("docFiscalChave");
    marcar(
      "docFiscalChave",
      chaveDigitos.length !== 44
        ? {
            nivel: "conferir",
            motivo: `Chave lida com ${chaveDigitos.length} dígitos (a NF-e tem 44) — confira no documento.`,
          }
        : avaliarCampo(x.chaveAcesso, { aplicadoVazio: false }),
    );
  }

  // ── Datas ─────────────────────────────────────────────────────────────
  const vencIso = isoParaDataInterna(x.vencimento.valor);
  const pagIso = isoParaDataInterna(x.dataPagamento.valor);
  if (pagIso) valores.dataPagamento = pagIso;

  if (vencIso) {
    valores.vencimento = vencIso;
    preencheu("vencimento");
    marcar("vencimento", avaliarCampo(x.vencimento, { aplicadoVazio: false }));
  } else if (pagIso) {
    // Comprovante de pagamento: a despesa venceu, no mais tardar, no dia em
    // que foi paga. Preenche para o lançamento não nascer sem data, e avisa.
    valores.vencimento = pagIso;
    preencheu("vencimento");
    marcar("vencimento", {
      nivel: "conferir",
      motivo: "Documento comprova pagamento e não traz vencimento — assumido o dia do pagamento.",
    });
  } else if (emissaoInterna) {
    valores.vencimento = emissaoInterna;
    preencheu("vencimento");
    marcar("vencimento", {
      nivel: "conferir",
      motivo: "Vencimento não consta no documento — assumida a data de emissão. Ajuste se houver prazo.",
    });
  } else {
    marcar("vencimento", avaliarCampo(x.vencimento, { aplicadoVazio: true, essencial: true }));
  }

  const compIso = isoParaCompetenciaInterna(x.competencia.valor);
  if (compIso) {
    valores.competencia = compIso;
    preencheu("competencia");
    marcar("competencia", avaliarCampo(x.competencia, { aplicadoVazio: false }));
  } else {
    // Competência é regime de COMPETÊNCIA (RG-01): o mês do fato gerador —
    // emissão da nota / entrega — e não o mês do pagamento. Por isso a ordem
    // de dedução começa pela emissão.
    const base = emissaoInterna || valores.vencimento || pagIso || "";
    const derivada = competenciaDeDataInterna(base);
    if (derivada) {
      valores.competencia = derivada;
      preencheu("competencia");
      marcar("competencia", {
        nivel: "conferir",
        motivo: emissaoInterna
          ? "Competência deduzida do mês de emissão do documento — ajuste se o custo for de outro mês."
          : "Competência deduzida da data do documento — ajuste se o custo for de outro mês.",
      });
    } else {
      marcar("competencia", avaliarCampo(x.competencia, { aplicadoVazio: true, essencial: true }));
    }
  }

  // ── Classificação contábil ────────────────────────────────────────────
  if (x.contaCef.valor && ctx.contas.includes(x.contaCef.valor)) {
    valores.contaCef = x.contaCef.valor;
    preencheu("contaCef");
    marcar("contaCef", avaliarCampo(x.contaCef, { aplicadoVazio: false }));
  } else if (x.contaCef.valor) {
    marcar("contaCef", {
      nivel: "conferir",
      motivo: `A IA sugeriu a conta "${x.contaCef.valor}", que não existe no plano de contas — escolha a conta.`,
    });
  } else {
    marcar("contaCef", avaliarCampo(x.contaCef, { aplicadoVazio: true, essencial: true }));
  }

  // A IA nunca pode classificar uma despesa em categoria de RECEITA (RG-01):
  // `ctx.categorias` já chega filtrada por natureza devedora.
  if (x.categoriaDre.valor && ctx.categorias.includes(x.categoriaDre.valor)) {
    valores.categoriaDre = x.categoriaDre.valor;
    preencheu("categoriaDre");
    marcar("categoriaDre", avaliarCampo(x.categoriaDre, { aplicadoVazio: false }));
  } else if (x.categoriaDre.valor) {
    marcar("categoriaDre", {
      nivel: "conferir",
      motivo: `"${x.categoriaDre.valor}" não é uma categoria de despesa válida — escolha a categoria.`,
    });
  } else {
    marcar("categoriaDre", avaliarCampo(x.categoriaDre, { aplicadoVazio: true, essencial: true }));
  }

  // ── Descrição ─────────────────────────────────────────────────────────
  if (x.descricao.valor) {
    valores.obs = x.descricao.valor;
    preencheu("obs");
    marcar("obs", avaliarCampo(x.descricao, { aplicadoVazio: false }));
  } else {
    marcar("obs", avaliarCampo(x.descricao, { aplicadoVazio: true, essencial: true }));
  }

  // ── Pagamento ─────────────────────────────────────────────────────────
  if (x.pago.valor) {
    valores.status = "Pago";
    preencheu("status");
    marcar(
      "status",
      avaliarCampo(x.pago, {
        aplicadoVazio: false,
        naoAplicado:
          x.pago.confianca === "alta"
            ? undefined
            : "Status deduzido do documento — confirme se a despesa já foi paga.",
      }),
    );
  }
  const forma = acharForma(x.formaPagamento.valor, ctx.formasPagamento);
  if (forma) {
    valores.formaPagamento = forma;
    preencheu("formaPagamento");
    marcar("formaPagamento", avaliarCampo(x.formaPagamento, { aplicadoVazio: false }));
  } else if (!vazio(x.formaPagamento)) {
    marcar("formaPagamento", {
      nivel: "conferir",
      motivo: `Forma "${x.formaPagamento.valor}" não corresponde às opções do sistema — escolha manualmente.`,
    });
  } else if (x.pago.valor) {
    marcar("formaPagamento", {
      nivel: "faltando",
      motivo: "O documento comprova pagamento, mas não diz por qual meio — informe.",
    });
  }

  return {
    valores,
    alertas,
    preenchidos,
    natureza: NATUREZAS_ARQUIVO.includes(x.natureza) ? x.natureza : "OUTRO",
    resumo: x.resumo,
    observacoes: x.observacoes ?? [],
  };
}
```

### `src/lib/ai/fornecedor-extract.ts`

```ts
import "server-only";
import Anthropic from "@anthropic-ai/sdk";
import { PAPEIS_STAKEHOLDER } from "@/lib/calc/constants";
import { aiClient, createMessageWithFallback, isAiConfigured } from "@/lib/ai/client";
import type { DadosFornecedorLidos } from "@/lib/ai/fornecedor-doc";

/**
 * Leitura de documentos (cartão CNPJ, contrato social, cabeçalho de NF, cartão
 * de visita) por IA para pré-preencher o cadastro de um fornecedor/stakeholder.
 * Reaproveita a mesma configuração da leitura de despesas (ANTHROPIC_API_KEY;
 * modelo resolvido em lib/ai/modelos.ts).
 */

/**
 * O contrato (campos lidos) mora em `fornecedor-doc.ts`, módulo puro, junto da
 * regra que decide o que preencher e o que marcar com alerta — este arquivo
 * cuida só da conversa com a IA.
 */
export type ExtractedFornecedor = DadosFornecedorLidos;

type ImageMime = "image/png" | "image/jpeg" | "image/webp" | "image/gif";

export async function extractFornecedorFromDocument(
  bytes: Uint8Array,
  mime: string,
): Promise<ExtractedFornecedor> {
  if (!isAiConfigured()) {
    throw new Error("Leitura por IA não configurada (defina ANTHROPIC_API_KEY).");
  }
  const client = aiClient();
  const data = Buffer.from(bytes).toString("base64");

  const docBlock: Anthropic.ContentBlockParam =
    mime === "application/pdf"
      ? {
          type: "document",
          source: { type: "base64", media_type: "application/pdf", data },
        }
      : {
          type: "image",
          source: { type: "base64", media_type: mime as ImageMime, data },
        };

  const tool: Anthropic.ToolUnion = {
    name: "preencher_fornecedor",
    description:
      "Preenche o cadastro de um fornecedor/stakeholder a partir do documento anexado (cartão CNPJ, contrato, NF, cartão de visita).",
    input_schema: {
      type: "object",
      additionalProperties: false,
      properties: {
        nome: {
          type: "string",
          description: "Razão social ou nome principal do fornecedor. Vazio se não identificar.",
        },
        nomeFantasia: { type: "string", description: "Nome fantasia. Vazio se não houver." },
        tipo: {
          type: "string",
          enum: ["PJ", "PF", ""],
          description: "PJ se houver CNPJ, PF se houver apenas CPF. Vazio se incerto.",
        },
        doc: {
          type: "string",
          description: "CNPJ ou CPF (com pontuação). Vazio se não houver.",
        },
        contato: { type: "string", description: "Nome da pessoa de contato. Vazio se não houver." },
        email: { type: "string", description: "E-mail de contato. Vazio se não houver." },
        tel: { type: "string", description: "Telefone de contato. Vazio se não houver." },
        whatsapp: { type: "string", description: "WhatsApp, se distinto do telefone. Vazio se não houver." },
        site: { type: "string", description: "Site/URL. Vazio se não houver." },
        endereco: { type: "string", description: "Logradouro (rua/avenida). Vazio se não houver." },
        numero: { type: "string", description: "Número do endereço. Vazio se não houver." },
        complemento: { type: "string", description: "Complemento (sala, andar). Vazio se não houver." },
        bairro: { type: "string", description: "Bairro. Vazio se não houver." },
        cidade: { type: "string", description: "Cidade. Vazio se não houver." },
        estado: { type: "string", description: "UF (2 letras). Vazio se não houver." },
        cep: { type: "string", description: "CEP. Vazio se não houver." },
        papeis: {
          type: "array",
          description:
            "Papéis mais prováveis do fornecedor, dentre os listados. Vazio se incerto.",
          items: { type: "string", enum: [...PAPEIS_STAKEHOLDER] },
        },
        baixaConfianca: {
          type: "array",
          description:
            "Lista dos NOMES de campos preenchidos com BAIXA confiança (ex.: 'doc', 'cep'), para o usuário conferir. Vazio se todos confiáveis.",
          items: { type: "string" },
        },
      },
      required: [
        "nome", "nomeFantasia", "tipo", "doc", "contato", "email", "tel", "whatsapp",
        "site", "endereco", "numero", "complemento", "bairro", "cidade", "estado", "cep",
        "papeis", "baixaConfianca",
      ],
    },
    // Sem `strict: true`: a gramática que a API compila para validar a
    // resposta tem limite de tamanho (400 "compiled grammar is too large" —
    // aconteceu na leitura de despesa). A garantia de formato vem do parse
    // defensivo abaixo, que tolera campo ausente ou de tipo errado.
  };

  const message = await createMessageWithFallback(client, {
    max_tokens: 1024,
    tools: [tool],
    tool_choice: { type: "tool", name: "preencher_fornecedor" },
    messages: [
      {
        role: "user",
        content: [
          docBlock,
          {
            type: "text",
            text:
              "Extraia os dados do fornecedor deste documento e chame a ferramenta preencher_fornecedor. " +
              'Deixe "" ou lista vazia tudo que não conseguir identificar com confiança.',
          },
        ],
      },
    ],
  });

  const block = message.content.find((b) => b.type === "tool_use");
  if (!block || block.type !== "tool_use") {
    throw new Error("A IA não conseguiu extrair os dados do documento.");
  }
  const input = block.input as Partial<ExtractedFornecedor>;
  const tipo = input.tipo === "PJ" || input.tipo === "PF" ? input.tipo : "";
  const papeisSet = new Set<string>(PAPEIS_STAKEHOLDER);
  const str = (v: unknown) => String(v ?? "");
  return {
    nome: str(input.nome),
    nomeFantasia: str(input.nomeFantasia),
    tipo,
    doc: str(input.doc),
    contato: str(input.contato),
    email: str(input.email),
    tel: str(input.tel),
    whatsapp: str(input.whatsapp),
    site: str(input.site),
    endereco: str(input.endereco),
    numero: str(input.numero),
    complemento: str(input.complemento),
    bairro: str(input.bairro),
    cidade: str(input.cidade),
    estado: str(input.estado),
    cep: str(input.cep),
    papeis: Array.isArray(input.papeis)
      ? input.papeis.map(String).filter((p) => papeisSet.has(p))
      : [],
    baixaConfianca: Array.isArray(input.baixaConfianca)
      ? input.baixaConfianca.map(String)
      : [],
  };
}
```

### `src/lib/ai/fornecedor-doc.ts`

```ts
/**
 * Documento → cadastro de fornecedor: contrato da leitura e regra de
 * preenchimento (a mesma ideia de `despesa-doc.ts`, aplicada ao segundo ponto
 * do sistema onde se sobe um arquivo para preencher um formulário).
 *
 * Módulo PURO — testável sem chamar a IA.
 */

import { avaliarCampo, docCompleto, type Alerta } from "@/lib/ai/campos";

/** O que a IA devolve ao ler um cartão CNPJ, contrato ou cabeçalho de nota. */
export interface DadosFornecedorLidos {
  nome: string;
  nomeFantasia: string;
  tipo: "PJ" | "PF" | "";
  doc: string;
  contato: string;
  email: string;
  tel: string;
  whatsapp: string;
  site: string;
  endereco: string;
  numero: string;
  complemento: string;
  bairro: string;
  cidade: string;
  estado: string;
  cep: string;
  papeis: string[];
  /** Campos que a IA identificou com BAIXA confiança. */
  baixaConfianca: string[];
}

export type CampoFornecedor =
  | "nome"
  | "nomeFantasia"
  | "tipo"
  | "doc"
  | "contato"
  | "email"
  | "tel"
  | "whatsapp"
  | "site"
  | "endereco"
  | "numero"
  | "complemento"
  | "bairro"
  | "cidade"
  | "estado"
  | "cep"
  | "papeis";

export const ROTULO_CAMPO_FORNECEDOR: Record<CampoFornecedor, string> = {
  nome: "Nome",
  nomeFantasia: "Nome fantasia",
  tipo: "Tipo",
  doc: "CNPJ / CPF",
  contato: "Pessoa de contato",
  email: "E-mail",
  tel: "Telefone",
  whatsapp: "WhatsApp",
  site: "Site",
  endereco: "Endereço",
  numero: "Número",
  complemento: "Complemento",
  bairro: "Bairro",
  cidade: "Cidade",
  estado: "Estado",
  cep: "CEP",
  papeis: "Papéis",
};

/** Sem estes o cadastro não serve para vincular despesa nem emitir relatório. */
const ESSENCIAIS: CampoFornecedor[] = ["nome", "doc", "papeis"];

const CAMPOS_TEXTO: CampoFornecedor[] = [
  "nome",
  "nomeFantasia",
  "doc",
  "contato",
  "email",
  "tel",
  "whatsapp",
  "site",
  "endereco",
  "numero",
  "complemento",
  "bairro",
  "cidade",
  "estado",
  "cep",
];

export interface PreenchimentoFornecedor {
  /** Só os campos que devem ser aplicados (o resto o usuário já digitou). */
  valores: Partial<Record<CampoFornecedor, string>>;
  papeis: string[] | null;
  alertas: Partial<Record<CampoFornecedor, Alerta>>;
  preenchidos: string[];
}

/**
 * Aplica a leitura sobre o que já está na tela.
 *
 * Nunca sobrescreve campo digitado pelo usuário: quem preencheu à mão sabe
 * mais que a foto do cartão de visita. O que a IA leu e não pôde aplicar (ou
 * leu com dúvida) vira alerta no campo.
 */
export function montarPreenchimentoFornecedor(
  x: DadosFornecedorLidos,
  atuais: Partial<Record<CampoFornecedor, string>>,
  papeisAtuais: string[],
): PreenchimentoFornecedor {
  const baixa = new Set(x.baixaConfianca ?? []);
  const valores: Partial<Record<CampoFornecedor, string>> = {};
  const alertas: Partial<Record<CampoFornecedor, Alerta>> = {};
  const preenchidos: string[] = [];

  for (const campo of CAMPOS_TEXTO) {
    const lido = (x[campo] as string) ?? "";
    const atual = (atuais[campo] ?? "").trim();
    const aplicado = atual || lido;
    if (lido && !atual) {
      valores[campo] = lido;
      preenchidos.push(ROTULO_CAMPO_FORNECEDOR[campo]);
    }
    const alerta = avaliarCampo(
      { valor: lido, confianca: baixa.has(campo) ? "baixa" : "alta", nota: "" },
      { aplicadoVazio: !aplicado, essencial: ESSENCIAIS.includes(campo) },
    );
    if (alerta) alertas[campo] = alerta;
  }

  // CNPJ/CPF pela metade é pior que vazio: casa com o fornecedor errado numa
  // busca por documento. Se veio incompleto, o campo pede conferência mesmo
  // que a IA tenha dito "alta".
  const docFinal = valores.doc ?? atuais.doc ?? "";
  if (docFinal && !docCompleto(docFinal)) {
    alertas.doc = {
      nivel: "conferir",
      motivo: "Documento incompleto ou mascarado no arquivo — confira os dígitos.",
    };
  }

  if (x.tipo && !(atuais.tipo ?? "").trim()) {
    valores.tipo = x.tipo;
    preenchidos.push(ROTULO_CAMPO_FORNECEDOR.tipo);
  }

  let papeis: string[] | null = null;
  if (x.papeis.length > 0 && papeisAtuais.length === 0) {
    papeis = x.papeis;
    preenchidos.push(ROTULO_CAMPO_FORNECEDOR.papeis);
  } else if (x.papeis.length === 0 && papeisAtuais.length === 0) {
    alertas.papeis = {
      nivel: "faltando",
      motivo: "O documento não diz o que este cadastro é (fornecedor, cliente, sócio…) — escolha.",
    };
  }

  return { valores, papeis, alertas, preenchidos };
}
```

### `src/lib/ai/extrato-extract.ts`

```ts
import "server-only";
import Anthropic from "@anthropic-ai/sdk";
import { aiClient, createMessageWithFallback, isAiConfigured } from "@/lib/ai/client";

/**
 * Leitura de extrato bancário em PDF por IA, para pré-preencher a importação de
 * lançamentos de caixa. Reaproveita a configuração (ANTHROPIC_API_KEY) das
 * demais leituras. Retorna as movimentações identificadas; a decisão final
 * (revisar, editar, escolher o que importar) permanece com o usuário na tela de
 * conferência já existente.
 */

export interface ExtratoMovimento {
  /** data "MM/DD/YYYY" (formato interno). */
  data: string;
  descricao: string;
  doc: string;
  /** valor com sinal: positivo = entrada/crédito, negativo = saída/débito. */
  valor: number;
}

export interface ExtratoExtraido {
  movimentos: ExtratoMovimento[];
  /** saldo final, se identificável (para conferência). */
  saldoFinal: number | null;
}

type ImageMime = "image/png" | "image/jpeg" | "image/webp" | "image/gif";

/** Valor monetário BR em texto → número (sem sinal). Ex.: "1.234,56" → 1234.56. */
function parseBRMoney(s: string): number | null {
  const m = s.replace(/\s/g, "").match(/-?\d{1,3}(?:\.\d{3})*,\d{2}|-?\d+,\d{2}/);
  if (!m) return null;
  const n = Number(m[0].replace(/\./g, "").replace(",", "."));
  return Number.isFinite(n) ? Math.abs(n) : null;
}

/**
 * Extração SEM IA de um extrato em PDF: lê o texto do PDF (unpdf) e identifica,
 * por heurística, linhas com data + valor. É "melhor esforço" — a decisão final
 * fica com o usuário na tela de conferência. Usado quando a IA não está
 * configurada (ANTHROPIC_API_KEY ausente).
 */
export async function extractExtratoFromText(bytes: Uint8Array): Promise<ExtratoExtraido> {
  const { extractText, getDocumentProxy } = await import("unpdf");
  const pdf = await getDocumentProxy(bytes);
  const { text } = await extractText(pdf, { mergePages: true });
  const linhas = String(text)
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter(Boolean);

  const movimentos: ExtratoMovimento[] = [];
  let saldoFinal: number | null = null;
  const dateRe = /(\d{1,2})[/](\d{1,2})[/](\d{2,4})/;
  const moneyGlobal = /-?\d{1,3}(?:\.\d{3})*,\d{2}|-?\d+,\d{2}/g;
  for (const linha of linhas) {
    const dm = linha.match(dateRe);
    const valores = linha.match(moneyGlobal);
    if (!dm || !valores || valores.length === 0) continue;
    const baixa = /^\s*saldo|saldo\s+(?:anterior|final|do dia|disp)/i.test(linha);
    if (baixa) {
      const v = parseBRMoney(valores[valores.length - 1]);
      if (v != null) saldoFinal = /-/.test(valores[valores.length - 1]) ? -v : v;
      continue;
    }
    // Último valor da linha costuma ser saldo; o penúltimo (quando há 2+) tende a
    // ser o valor do lançamento. Com um único valor, usa-o.
    const alvo = valores.length >= 2 ? valores[valores.length - 2] : valores[0];
    const abs = parseBRMoney(alvo);
    if (abs == null || abs === 0) continue;
    // Sinal: marcadores de débito/saída na linha ("-", " D ", "DEBITO", "PAGAMENTO").
    const negativo =
      /-\s*R?\$?\s*\d/.test(alvo) ||
      /\b[dD]\b|d[eé]bito|saíd|saida|pagamento|pgto|tarifa|tar\.|compra|saque/i.test(linha);
    const y = dm[3].length === 2 ? "20" + dm[3] : dm[3];
    const data = `${dm[2].padStart(2, "0")}/${dm[1].padStart(2, "0")}/${y}`;
    const descricao =
      linha
        .replace(dateRe, "")
        .replace(moneyGlobal, "")
        .replace(/\s{2,}/g, " ")
        .trim() || "—";
    movimentos.push({ data, descricao, doc: "", valor: negativo ? -abs : abs });
  }
  return { movimentos, saldoFinal };
}

/** "DD/MM/YYYY" ou "YYYY-MM-DD" → interno "MM/DD/YYYY"; vazio se inválido. */
function toInternal(s: string): string {
  const t = (s || "").trim();
  const br = t.match(/^(\d{1,2})[/\-.](\d{1,2})[/\-.](\d{2,4})/);
  if (br) {
    let y = br[3];
    if (y.length === 2) y = "20" + y;
    return `${br[2].padStart(2, "0")}/${br[1].padStart(2, "0")}/${y}`;
  }
  const iso = t.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (iso) return `${iso[2]}/${iso[3]}/${iso[1]}`;
  return "";
}

export async function extractExtratoFromDocument(
  bytes: Uint8Array,
  mime: string,
): Promise<ExtratoExtraido> {
  if (!isAiConfigured()) {
    throw new Error("Leitura por IA não configurada (defina ANTHROPIC_API_KEY).");
  }
  const client = aiClient();
  const data = Buffer.from(bytes).toString("base64");

  const docBlock: Anthropic.ContentBlockParam =
    mime === "application/pdf"
      ? { type: "document", source: { type: "base64", media_type: "application/pdf", data } }
      : { type: "image", source: { type: "base64", media_type: mime as ImageMime, data } };

  const tool: Anthropic.ToolUnion = {
    name: "extrair_extrato",
    description:
      "Extrai as movimentações (lançamentos) de um extrato bancário. Uma entrada por movimentação; ignore linhas de saldo/total.",
    input_schema: {
      type: "object",
      additionalProperties: false,
      properties: {
        movimentos: {
          type: "array",
          description: "Lista de movimentações do extrato, na ordem em que aparecem.",
          items: {
            type: "object",
            additionalProperties: false,
            properties: {
              data: { type: "string", description: "Data da movimentação (DD/MM/AAAA)." },
              descricao: { type: "string", description: "Descrição/histórico da movimentação." },
              doc: { type: "string", description: "Documento/identificador, se houver. Vazio se não." },
              valor: {
                type: "number",
                description:
                  "Valor com sinal: POSITIVO para crédito/entrada, NEGATIVO para débito/saída.",
              },
            },
            required: ["data", "descricao", "doc", "valor"],
          },
        },
        saldoFinal: {
          type: ["number", "null"],
          description: "Saldo final do extrato, se identificável. null se não houver.",
        },
      },
      required: ["movimentos", "saldoFinal"],
    },
    // Sem `strict: true`: a gramática que a API compila para validar a
    // resposta tem limite de tamanho (400 "compiled grammar is too large" —
    // aconteceu na leitura de despesa). A garantia de formato vem do parse
    // defensivo abaixo, que tolera campo ausente ou de tipo errado.
  };

  const message = await createMessageWithFallback(client, {
    max_tokens: 8192,
    tools: [tool],
    tool_choice: { type: "tool", name: "extrair_extrato" },
    messages: [
      {
        role: "user",
        content: [
          docBlock,
          {
            type: "text",
            text:
              "Extraia TODAS as movimentações deste extrato bancário e chame a ferramenta " +
              "extrair_extrato. Não invente valores; ignore linhas de saldo/total. Use sinal " +
              "negativo para débitos/saídas e positivo para créditos/entradas.",
          },
        ],
      },
    ],
  });

  const block = message.content.find((b) => b.type === "tool_use");
  if (!block || block.type !== "tool_use") {
    throw new Error(
      "Não foi possível ler as movimentações do PDF. Verifique se o arquivo é um extrato legível (não protegido/escaneado sem texto).",
    );
  }
  const input = block.input as { movimentos?: unknown[]; saldoFinal?: unknown };
  const movimentos: ExtratoMovimento[] = Array.isArray(input.movimentos)
    ? input.movimentos
        .map((m) => {
          const o = (m ?? {}) as Record<string, unknown>;
          const valor = Number(o.valor);
          return {
            data: toInternal(String(o.data ?? "")),
            descricao: String(o.descricao ?? "").trim() || "—",
            doc: String(o.doc ?? "").trim(),
            valor: Number.isFinite(valor) ? valor : 0,
          };
        })
        .filter((m) => m.valor !== 0)
    : [];
  const saldo = Number(input.saldoFinal);
  return { movimentos, saldoFinal: Number.isFinite(saldo) ? saldo : null };
}
```

### `src/lib/ai/modelos.test.ts`

```ts
import { describe, it, expect } from "vitest";
import {
  MODELOS_CLAUDE,
  MODELO_PADRAO,
  cadeiaDeModelos,
  pareceIdDeModelo,
  resolverModelo,
  rotuloModelo,
} from "./modelos";

describe("resolverModelo", () => {
  it("sem a variável definida, usa o padrão sem reclamar", () => {
    for (const v of [undefined, null, "", "   "]) {
      const r = resolverModelo(v);
      expect(r.id).toBe(MODELO_PADRAO);
      expect(r.origem).toBe("padrao");
      expect(r.aviso).toBe("");
    }
  });

  it("aceita o identificador correto sem aviso", () => {
    for (const m of MODELOS_CLAUDE) {
      const r = resolverModelo(m.id);
      expect(r.id).toBe(m.id);
      expect(r.origem).toBe("id");
      expect(r.aviso).toBe("");
    }
  });

  it("traduz o nome comercial — é o que quem configura o servidor digita", () => {
    const r = resolverModelo("Sonnet 5");
    expect(r.id).toBe("claude-sonnet-5");
    expect(r.origem).toBe("nome");
    expect(r.aviso).toContain("Sonnet 5");
    expect(r.aviso).toContain("claude-sonnet-5");

    expect(resolverModelo("Claude Opus 5").id).toBe("claude-opus-5");
    expect(resolverModelo("opus 4.8").id).toBe("claude-opus-4-8");
    expect(resolverModelo("HAIKU 4.5").id).toBe("claude-haiku-4-5");
    // Família sem número: cai no mais capaz daquela família.
    expect(resolverModelo("sonnet").id).toBe("claude-sonnet-5");
    expect(resolverModelo("opus").id).toBe("claude-opus-5");
  });

  it("deixa passar um modelo novo, fora do catálogo desta versão", () => {
    const r = resolverModelo("claude-opus-9-9");
    expect(r.id).toBe("claude-opus-9-9");
    expect(r.origem).toBe("desconhecido");
    expect(r.aviso).toContain("não está na lista conhecida");
  });

  it("valor sem sentido cai no padrão e explica o que fazer", () => {
    const r = resolverModelo("gpt-4o");
    expect(r.id).toBe(MODELO_PADRAO);
    expect(r.origem).toBe("invalido");
    expect(r.aviso).toContain("gpt-4o");
    expect(r.aviso).toContain(MODELO_PADRAO);
  });

  it("nunca lança, seja qual for o lixo no ambiente", () => {
    for (const v of ["   ", "!!!", "claude", "123", "modelo bom"]) {
      expect(() => resolverModelo(v)).not.toThrow();
      expect(resolverModelo(v).id).toBeTruthy();
    }
  });
});

describe("pareceIdDeModelo", () => {
  it("reconhece o formato de identificador e recusa nome comercial", () => {
    expect(pareceIdDeModelo("claude-sonnet-5")).toBe(true);
    expect(pareceIdDeModelo("claude-opus-4-8")).toBe(true);
    expect(pareceIdDeModelo("Sonnet 5")).toBe(false);
    expect(pareceIdDeModelo("claude")).toBe(false);
    expect(pareceIdDeModelo("gpt-4o")).toBe(false);
  });
});

describe("cadeia de fallback", () => {
  it("começa pelo escolhido e não repete", () => {
    const c = cadeiaDeModelos("claude-sonnet-5");
    expect(c[0]).toBe("claude-sonnet-5");
    expect(new Set(c).size).toBe(c.length);
  });

  it("sempre oferece alternativa quando o escolhido não está liberado", () => {
    expect(cadeiaDeModelos(MODELO_PADRAO).length).toBeGreaterThan(1);
  });
});

describe("rotuloModelo", () => {
  it("mostra o nome comercial do id conhecido e devolve o próprio id quando não conhece", () => {
    expect(rotuloModelo("claude-sonnet-5")).toBe("Claude Sonnet 5");
    expect(rotuloModelo("claude-opus-9-9")).toBe("claude-opus-9-9");
  });
});
```

### `src/lib/ai/erros.test.ts`

```ts
import { describe, it, expect } from "vitest";
import { mensagemDeErroIa } from "./erros";

/** Corpo real devolvido pela API quando a conta fica sem saldo. */
const SEM_CREDITO =
  '400 {"type":"error","error":{"type":"invalid_request_error","message":"Your credit balance is too low to access the Anthropic API. Please go to Plans & Billing to upgrade or purchase credits."},"request_id":"req_011CeTcu7wVEbvJ5rdyr5Z8D"}';

describe("mensagem de erro da IA", () => {
  it("saldo insuficiente: diz que é crédito, não chave nem modelo", () => {
    const m = mensagemDeErroIa({ status: 400, mensagem: SEM_CREDITO });
    expect(m).toContain("sem créditos");
    expect(m).toContain("Plans & Billing");
    // O ponto da tradução: não mandar o usuário mexer na chave/modelo, que
    // estão certos.
    expect(m).toContain("estão corretos");
    expect(m).not.toContain("credit balance");
  });

  it("chave vinculada a identidade sem workspace: manda definir ANTHROPIC_WORKSPACE_ID", () => {
    // Corpo real da API para chave identity-linked sem o header de workspace.
    const m = mensagemDeErroIa({
      status: 400,
      mensagem:
        '400 {"type":"error","error":{"type":"invalid_request_error","message":"anthropic-workspace-id is required when authenticating with an identity-linked API key; send the id of the workspace this request acts in."},"request_id":null}',
    });
    expect(m).toContain("ANTHROPIC_WORKSPACE_ID");
    expect(m).toContain("wrkspc_");
    expect(m).toContain("chave de API comum");
    expect(m).not.toContain("identity-linked API key");
  });

  it("chave inválida (401/403) manda conferir a ANTHROPIC_API_KEY", () => {
    for (const status of [401, 403]) {
      expect(mensagemDeErroIa({ status, mensagem: "401 unauthorized" })).toContain(
        "ANTHROPIC_API_KEY",
      );
    }
  });

  it("modelo inexistente (404) aponta o identificador, que é o erro típico", () => {
    const m = mensagemDeErroIa({ status: 404, mensagem: "404 not_found" });
    expect(m).toContain("ANTHROPIC_MODEL");
    expect(m).toContain("claude-sonnet-5");
    expect(m).toContain("nome comercial");
  });

  it("limite de uso (429) sugere tentar de novo", () => {
    expect(mensagemDeErroIa({ status: 429, mensagem: "429" })).toContain("Limite de uso");
  });

  it("falha de rede aponta egress do servidor, por status ou por texto", () => {
    expect(mensagemDeErroIa({ mensagem: "boom", semConexao: true })).toContain("rede/egress");
    expect(mensagemDeErroIa({ mensagem: "fetch failed" })).toContain("rede/egress");
    expect(mensagemDeErroIa({ mensagem: "ECONNREFUSED 1.2.3.4:443" })).toContain(
      "rede/egress",
    );
  });

  it("erro desconhecido preserva o texto original para investigação", () => {
    const m = mensagemDeErroIa({ status: 500, mensagem: "overloaded_error" });
    expect(m).toContain("overloaded_error");
  });
});
```

### `src/lib/ai/despesa-prompt.test.ts`

```ts
import { describe, it, expect } from "vitest";
import {
  instrucaoLeituraDespesa,
  promptSistemaDespesa,
  type ContextoLeituraDespesa,
} from "./despesa-prompt";

const CTX: ContextoLeituraDespesa = {
  fornecedores: [
    { nome: "Zeladoria Sul", doc: null },
    { nome: "A F ANDRADE COM MAT CONSTR EIRELI", doc: "10.365.725/0002-18" },
    { nome: "Casarão Itanhaém", doc: null },
  ],
  contas: [
    { code: "2.10", name: "Serviços" },
    { code: "1.1", name: "Materiais" },
    { code: "1.2", name: "Mão de obra" },
  ],
  projetos: [{ nome: "OBRA 28" }, { nome: "OBRA 25" }],
  categorias: ["Custo de Obra"],
  tiposDocumento: [
    { id: "SEM_DOC", label: "Sem documento" },
    { id: "NFE", label: "NF-e" },
  ],
  empresa: { nome: "BMV Construções Ltda", cnpj: "42.844.364/0001-06" },
};

describe("parte estável do prompt (a que é cacheada)", () => {
  const p = promptSistemaDespesa(CTX);

  it("leva o contexto do tenant: empresa, obras, fornecedores, plano e tipos", () => {
    expect(p).toContain("BMV Construções Ltda");
    expect(p).toContain("42.844.364/0001-06");
    expect(p).toContain("OBRA 25");
    expect(p).toContain("A F ANDRADE COM MAT CONSTR EIRELI");
    expect(p).toContain("1.1 — Materiais");
    expect(p).toContain("NFE = NF-e");
  });

  it("deixa explícito que a empresa é a pagadora, nunca a fornecedora", () => {
    expect(p).toContain("PAGADORA");
    expect(p).toContain("RECEBEDOR");
  });

  /**
   * O cache é casamento de PREFIXO byte a byte: se a ordem das listas variar
   * entre uma leitura e outra (a consulta ao banco não garante ordem), o
   * prefixo muda, o cache não é aproveitado e ninguém percebe — só a fatura.
   */
  it("ordena as listas, para o prefixo ser idêntico entre chamadas", () => {
    const embaralhado = promptSistemaDespesa({
      ...CTX,
      fornecedores: [...CTX.fornecedores].reverse(),
      contas: [...CTX.contas].reverse(),
      projetos: [...CTX.projetos].reverse(),
    });
    expect(embaralhado).toBe(p);
  });

  it("ordena o plano de contas por código, numericamente", () => {
    expect(p.indexOf("- 1.1 ")).toBeLessThan(p.indexOf("- 1.2 "));
    expect(p.indexOf("- 1.2 ")).toBeLessThan(p.indexOf("- 2.10 "));
  });

  it("não depende dos arquivos desta leitura — se dependesse, nunca cachearia", () => {
    expect(p).not.toContain("arquivo");
    expect(p).not.toContain("Arquivo");
  });

  it("cadastro vazio não quebra o prompt", () => {
    const vazio = promptSistemaDespesa({
      ...CTX,
      fornecedores: [],
      contas: [],
      projetos: [],
    });
    expect(vazio).toContain("(nenhum cadastrado)");
  });
});

describe("parte volátil (cobrada inteira em toda leitura)", () => {
  it("um arquivo: instrução curta, sem o texto de combinação", () => {
    const i = instrucaoLeituraDespesa(1);
    expect(i).toContain("preencher_despesa");
    expect(i).not.toContain("MESMA compra");
    expect(i.length).toBeLessThan(200);
  });

  it("vários arquivos: manda combinar as informações da mesma compra", () => {
    const i = instrucaoLeituraDespesa(3);
    expect(i).toContain("3 arquivos");
    expect(i).toContain("MESMA compra");
    expect(i).toContain("observacoes");
  });

  it("não repete o contexto do tenant — isso já está na parte cacheada", () => {
    const i = instrucaoLeituraDespesa(2);
    expect(i).not.toContain("PLANO DE CONTAS");
    expect(i).not.toContain("FORNECEDORES");
  });
});
```

### `src/lib/ai/fornecedor-doc.test.ts`

```ts
import { describe, it, expect } from "vitest";
import {
  montarPreenchimentoFornecedor,
  type DadosFornecedorLidos,
} from "./fornecedor-doc";

function lido(over: Partial<DadosFornecedorLidos> = {}): DadosFornecedorLidos {
  return {
    nome: "",
    nomeFantasia: "",
    tipo: "",
    doc: "",
    contato: "",
    email: "",
    tel: "",
    whatsapp: "",
    site: "",
    endereco: "",
    numero: "",
    complemento: "",
    bairro: "",
    cidade: "",
    estado: "",
    cep: "",
    papeis: [],
    baixaConfianca: [],
    ...over,
  };
}

describe("preenchimento do cadastro de fornecedor", () => {
  it("preenche o que está vazio e preserva o que o usuário digitou", () => {
    const res = montarPreenchimentoFornecedor(
      lido({ nome: "A F ANDRADE COM MAT CONSTR EIRELI", doc: "10.365.725/0002-18", cidade: "Itanhaém" }),
      { nome: "Nome digitado à mão" },
      [],
    );
    expect(res.valores.nome).toBeUndefined();
    expect(res.valores.doc).toBe("10.365.725/0002-18");
    expect(res.valores.cidade).toBe("Itanhaém");
    expect(res.alertas.nome).toBeUndefined();
  });

  it("marca como 'conferir' o que a IA leu com baixa confiança", () => {
    const res = montarPreenchimentoFornecedor(
      lido({ nome: "Casarão Itanhaém", tel: "(13)3426-8176", baixaConfianca: ["tel"] }),
      {},
      ["Fornecedor"],
    );
    expect(res.alertas.tel?.nivel).toBe("conferir");
    expect(res.alertas.nome).toBeUndefined();
  });

  it("cobra nome e documento quando o arquivo não os traz", () => {
    const res = montarPreenchimentoFornecedor(lido({ cidade: "Itanhaém" }), {}, ["Fornecedor"]);
    expect(res.alertas.nome?.nivel).toBe("faltando");
    expect(res.alertas.doc?.nivel).toBe("faltando");
    // Campo opcional vazio não vira alerta — a tela ficaria ilegível.
    expect(res.alertas.site).toBeUndefined();
  });

  it("CPF mascarado entra no campo, mas pede conferência dos dígitos", () => {
    const res = montarPreenchimentoFornecedor(
      lido({ nome: "Israel Pereira Salvador", doc: "***.844.476-**", tipo: "PF" }),
      {},
      ["Fornecedor"],
    );
    expect(res.valores.doc).toBe("***.844.476-**");
    expect(res.alertas.doc?.nivel).toBe("conferir");
    expect(res.valores.tipo).toBe("PF");
  });

  it("aplica os papéis lidos e cobra escolha quando ninguém definiu nenhum", () => {
    const comPapeis = montarPreenchimentoFornecedor(
      lido({ nome: "X", doc: "42.844.364/0001-06", papeis: ["Fornecedor"] }),
      {},
      [],
    );
    expect(comPapeis.papeis).toEqual(["Fornecedor"]);
    expect(comPapeis.alertas.papeis).toBeUndefined();

    const semPapeis = montarPreenchimentoFornecedor(lido({ nome: "X" }), {}, []);
    expect(semPapeis.papeis).toBeNull();
    expect(semPapeis.alertas.papeis?.nivel).toBe("faltando");
  });
});
```

### `src/lib/ai/despesa-doc.test.ts`

```ts
import { describe, it, expect } from "vitest";
import {
  avaliarCampo,
  competenciaDeDataInterna,
  docCompleto,
  isoParaCompetenciaInterna,
  isoParaDataInterna,
  type CampoLido,
} from "./campos";
import {
  montarPreenchimentoDespesa,
  type ContextoDespesa,
  type ExtractedDespesa,
} from "./despesa-doc";

/**
 * Os cenários abaixo são os documentos que realmente chegam da obra:
 * DANFE de NF-e, cupom "SEM VALOR FISCAL" de loja de material e comprovante de
 * Pix. Cada um exercita uma parte diferente da regra de alerta.
 */

const alta = (valor: string): CampoLido => ({ valor, confianca: "alta", nota: "" });
const baixa = (valor: string, nota: string): CampoLido => ({
  valor,
  confianca: "baixa",
  nota,
});
const vazioC = (nota = ""): CampoLido => ({ valor: "", confianca: "baixa", nota });

const CHAVE_NFE = "35260810365725000218550020000175474713510943";

function extracao(over: Partial<ExtractedDespesa> = {}): ExtractedDespesa {
  return {
    natureza: "OUTRO",
    resumo: "",
    observacoes: [],
    fornecedorNome: vazioC(),
    fornecedorDoc: vazioC(),
    valor: { valor: 0, confianca: "baixa", nota: "" },
    competencia: vazioC(),
    vencimento: vazioC(),
    descricao: vazioC(),
    categoriaDre: vazioC(),
    contaCef: vazioC(),
    projetoNome: vazioC(),
    docFiscalTipo: alta("SEM_DOC"),
    numDoc: vazioC(),
    serie: vazioC(),
    chaveAcesso: vazioC(),
    dataEmissao: vazioC(),
    formaPagamento: vazioC(),
    pago: { valor: false, confianca: "alta", nota: "" },
    dataPagamento: vazioC(),
    ...over,
  };
}

const CTX: ContextoDespesa = {
  fornecedores: [
    { id: "f-andrade", nome: "A F ANDRADE COM MAT CONSTR EIRELI - ME", doc: "10.365.725/0002-18" },
    { id: "f-casarao", nome: "Casarão Itanhaém", doc: null },
  ],
  contas: ["1.1", "2.3"],
  categorias: ["Custo de Obra", "Despesas Administrativas"],
  projetos: [
    { id: "p25", nome: "OBRA 25" },
    { id: "p28", nome: "OBRA 28" },
  ],
  formasPagamento: ["Boleto", "PIX", "Transferência bancária", "Dinheiro", "Cartão de crédito"],
  tiposDocumento: ["SEM_DOC", "NFE", "NFSE", "NFCE", "RECIBO", "CUPOM", "CONTRATO"],
};

describe("conversão de datas ISO → formato interno", () => {
  it("converte data e competência válidas", () => {
    expect(isoParaDataInterna("2026-07-20")).toBe("07/20/2026");
    expect(isoParaCompetenciaInterna("2026-07")).toBe("07/2026");
    expect(competenciaDeDataInterna("08/21/2026")).toBe("08/2026");
  });

  it("recusa data inexistente ou fora de formato (a IA às vezes 'completa' o ilegível)", () => {
    expect(isoParaDataInterna("2026-02-31")).toBe("");
    expect(isoParaDataInterna("20/07/2026")).toBe("");
    expect(isoParaDataInterna("")).toBe("");
    expect(isoParaCompetenciaInterna("2026-13")).toBe("");
  });
});

describe("documento do fornecedor", () => {
  it("só considera completo CPF/CNPJ com todos os dígitos", () => {
    expect(docCompleto("42.844.364/0001-06")).toBe(true);
    expect(docCompleto("133.844.476-03")).toBe(true);
    // Comprovante de Pix mascara o CPF — não serve para identificar ninguém.
    expect(docCompleto("***.844.476-**")).toBe(false);
    expect(docCompleto("")).toBe(false);
  });
});

describe("avaliarCampo", () => {
  it("campo essencial vazio vira alerta 'faltando' com a nota da IA", () => {
    const a = avaliarCampo(vazioC("Não consta no cupom"), {
      aplicadoVazio: true,
      essencial: true,
    });
    expect(a).toEqual({ nivel: "faltando", motivo: "Não consta no cupom" });
  });

  it("campo opcional vazio não polui a tela", () => {
    expect(avaliarCampo(vazioC(), { aplicadoVazio: true })).toBeNull();
  });

  it("valor preenchido sem confiança alta pede conferência", () => {
    const a = avaliarCampo(baixa("123", "Número rasurado"), { aplicadoVazio: false });
    expect(a).toEqual({ nivel: "conferir", motivo: "Número rasurado" });
  });

  it("campo lido com confiança alta não gera alerta", () => {
    expect(avaliarCampo(alta("17547"), { aplicadoVazio: false })).toBeNull();
  });
});

describe("DANFE de NF-e (documento completo)", () => {
  const res = montarPreenchimentoDespesa(
    extracao({
      natureza: "NOTA_FISCAL",
      resumo: "Compra de 1 saco de cimento na A F Andrade, NF-e 17547",
      fornecedorNome: alta("A F ANDRADE COM MAT CONSTR EIRELI - ME"),
      fornecedorDoc: alta("10.365.725/0002-18"),
      valor: { valor: 34.56, confianca: "alta", nota: "" },
      competencia: alta("2026-08"),
      dataEmissao: alta("2026-08-21"),
      vencimento: alta("2026-08-21"),
      descricao: alta("Cimento 50kg Portland composto"),
      categoriaDre: alta("Custo de Obra"),
      contaCef: alta("1.1"),
      projetoNome: alta("BMV CONSTRUCOES LTDA (OBRA 25)"),
      docFiscalTipo: alta("NFE"),
      numDoc: alta("17547"),
      serie: alta("2"),
      chaveAcesso: alta(CHAVE_NFE),
      formaPagamento: alta("Dinheiro"),
    }),
    CTX,
  );

  it("preenche os campos da nota sem alerta", () => {
    expect(res.valores.fornecedorId).toBe("f-andrade");
    expect(res.valores.valor).toBe("34.56");
    expect(res.valores.competencia).toBe("08/2026");
    expect(res.valores.vencimento).toBe("08/21/2026");
    expect(res.valores.contaCef).toBe("1.1");
    expect(res.valores.categoriaDre).toBe("Custo de Obra");
    expect(res.valores.docFiscal).toEqual({
      tipo: "NFE",
      numero: "17547",
      serie: "2",
      chaveAcesso: CHAVE_NFE,
      dataEmissao: "08/21/2026",
    });
    expect(res.alertas.valor).toBeUndefined();
    expect(res.alertas.fornecedor).toBeUndefined();
    expect(res.alertas.competencia).toBeUndefined();
  });

  it("acha a obra citada dentro do nome do destinatário, mas pede confirmação", () => {
    expect(res.valores.projetoId).toBe("p25");
    expect(res.alertas.projeto?.nivel).toBe("conferir");
  });
});

describe("cupom de loja sem valor fiscal", () => {
  const res = montarPreenchimentoDespesa(
    extracao({
      natureza: "CUPOM",
      fornecedorNome: alta("CASARAO ITANHAEM COM MAT CONSTR LTDA"),
      fornecedorDoc: alta("10.365.725/0002-18"),
      valor: { valor: 35.35, confianca: "alta", nota: "Total após desconto" },
      dataEmissao: alta("2026-07-21"),
      descricao: alta("2 discos diamantados segmentados 110mm"),
      projetoNome: alta("OBRA 28"),
      docFiscalTipo: alta("SEM_DOC"),
      pago: { valor: true, confianca: "alta", nota: "Carimbo PAGO" },
      formaPagamento: alta("a vista"),
      dataPagamento: alta("2026-07-21"),
      contaCef: alta("9.9"),
      categoriaDre: alta("Receita de Vendas"),
    }),
    CTX,
  );

  it("usa o total já com desconto e marca a despesa como paga", () => {
    expect(res.valores.valor).toBe("35.35");
    expect(res.valores.status).toBe("Pago");
    expect(res.valores.formaPagamento).toBe("Dinheiro"); // "à vista" → dinheiro
  });

  it("sem NF, não cobra número de documento", () => {
    expect(res.valores.docFiscal?.tipo).toBe("SEM_DOC");
    expect(res.alertas.docFiscalNumero).toBeUndefined();
  });

  it("deduz vencimento e competência da emissão, avisando que foram deduzidos", () => {
    expect(res.valores.vencimento).toBe("07/21/2026");
    expect(res.valores.competencia).toBe("07/2026");
    expect(res.alertas.vencimento?.nivel).toBe("conferir");
    expect(res.alertas.competencia?.nivel).toBe("conferir");
  });

  it("recusa conta inexistente e categoria de receita, explicando o motivo no campo", () => {
    expect(res.valores.contaCef).toBeUndefined();
    expect(res.alertas.contaCef?.motivo).toContain("9.9");
    expect(res.valores.categoriaDre).toBeUndefined();
    expect(res.alertas.categoriaDre?.motivo).toContain("Receita de Vendas");
  });
});

describe("comprovante de Pix (sem nota, CPF mascarado)", () => {
  const res = montarPreenchimentoDespesa(
    extracao({
      natureza: "COMPROVANTE",
      resumo: "Pix de R$ 900,00 para Israel Pereira Salvador — ajudante autônomo",
      fornecedorNome: alta("Israel Pereira Salvador"),
      fornecedorDoc: baixa("***.844.476-**", "CPF mascarado no comprovante"),
      valor: { valor: 900, confianca: "alta", nota: "" },
      descricao: alta("Ajudante autônomo"),
      pago: { valor: true, confianca: "alta", nota: "Situação: Efetivado" },
      formaPagamento: alta("PIX"),
      dataPagamento: alta("2026-07-20"),
      observacoes: ["Comprovante não é nota fiscal — lançamento nasce sem NF."],
    }),
    CTX,
  );

  it("não vincula fornecedor não cadastrado e diz o que fazer", () => {
    expect(res.valores.fornecedorId).toBeUndefined();
    expect(res.alertas.fornecedor?.nivel).toBe("conferir");
    expect(res.alertas.fornecedor?.motivo).toContain("Israel Pereira Salvador");
    expect(res.alertas.fornecedor?.motivo).toContain("não está cadastrado");
  });

  it("assume o vencimento como o dia do pagamento, sinalizando a dedução", () => {
    expect(res.valores.vencimento).toBe("07/20/2026");
    expect(res.valores.competencia).toBe("07/2026");
    expect(res.alertas.vencimento?.nivel).toBe("conferir");
  });

  it("marca como paga, por PIX, e guarda a data do pagamento", () => {
    expect(res.valores.status).toBe("Pago");
    expect(res.valores.formaPagamento).toBe("PIX");
    expect(res.valores.dataPagamento).toBe("07/20/2026");
  });

  it("cobra classificação contábil, que o comprovante nunca traz", () => {
    expect(res.alertas.contaCef?.nivel).toBe("faltando");
    expect(res.alertas.categoriaDre?.nivel).toBe("faltando");
  });

  it("sem obra citada, pede confirmação do projeto em vez de aceitar em silêncio", () => {
    expect(res.valores.projetoId).toBeUndefined();
    expect(res.alertas.projeto?.nivel).toBe("conferir");
  });

  it("repassa as ressalvas gerais da leitura", () => {
    expect(res.observacoes).toHaveLength(1);
  });
});

describe("leituras defeituosas", () => {
  it("chave de acesso com menos de 44 dígitos entra, mas marcada", () => {
    const res = montarPreenchimentoDespesa(
      extracao({ docFiscalTipo: alta("NFE"), numDoc: alta("1"), chaveAcesso: alta("123456") }),
      CTX,
    );
    expect(res.valores.docFiscal?.chaveAcesso).toBe("123456");
    expect(res.alertas.docFiscalChave?.motivo).toContain("6 dígitos");
  });

  it("nota fiscal sem número cobra o número; emissão ilegível vira alerta", () => {
    const res = montarPreenchimentoDespesa(
      extracao({ docFiscalTipo: alta("NFE"), dataEmissao: baixa("21/08", "Data cortada na foto") }),
      CTX,
    );
    expect(res.alertas.docFiscalNumero?.nivel).toBe("faltando");
    expect(res.valores.docFiscal?.dataEmissao).toBe("");
    expect(res.alertas.docFiscalEmissao?.nivel).toBe("conferir");
  });

  it("tipo de documento desconhecido não é aplicado e avisa", () => {
    const res = montarPreenchimentoDespesa(extracao({ docFiscalTipo: alta("BOLETO") }), CTX);
    expect(res.valores.docFiscal?.tipo).toBe("SEM_DOC");
    expect(res.alertas.docFiscalTipo?.motivo).toContain("BOLETO");
  });

  it("orçamento sem valor legível cobra tudo o que falta para lançar", () => {
    const res = montarPreenchimentoDespesa(
      extracao({
        natureza: "ORCAMENTO",
        valor: { valor: 0, confianca: "baixa", nota: "Valor ilegível na foto" },
      }),
      CTX,
    );
    expect(res.alertas.valor).toEqual({ nivel: "faltando", motivo: "Valor ilegível na foto" });
    expect(res.alertas.vencimento?.nivel).toBe("faltando");
    expect(res.alertas.obs?.nivel).toBe("faltando");
    expect(res.preenchidos).toHaveLength(0);
  });

  it("forma de pagamento fora da lista do sistema não é aplicada", () => {
    const res = montarPreenchimentoDespesa(
      extracao({ formaPagamento: alta("Consignado em folha") }),
      CTX,
    );
    expect(res.valores.formaPagamento).toBeUndefined();
    expect(res.alertas.formaPagamento?.motivo).toContain("Consignado em folha");
  });

  it("pagamento comprovado sem meio informado vira pendência", () => {
    const res = montarPreenchimentoDespesa(
      extracao({ pago: { valor: true, confianca: "alta", nota: "" } }),
      CTX,
    );
    expect(res.alertas.formaPagamento?.nivel).toBe("faltando");
  });

  it("status deduzido com pouca confiança pede confirmação", () => {
    const res = montarPreenchimentoDespesa(
      extracao({ pago: { valor: true, confianca: "media", nota: "Carimbo ilegível" } }),
      CTX,
    );
    expect(res.valores.status).toBe("Pago");
    expect(res.alertas.status?.nivel).toBe("conferir");
  });
});
```

---

## 5. Todos os lugares que chamam a API de IA

Grep de `createMessageWithFallback` e `client.messages` em todo o `src/`.
**Quatro** pontos, e só quatro:

| # | Arquivo:linha | Função | O que faz |
|---|---|---|---|
| 1 | `src/lib/ai/despesa-extract.ts:220` | `extractDespesaFromDocument` | lê NF/cupom/boleto/comprovante e devolve os campos da despesa |
| 2 | `src/lib/ai/fornecedor-extract.ts:103` | `extractFornecedorFromDocument` | lê cartão CNPJ/contrato/cartão de visita e devolve o cadastro |
| 3 | `src/lib/ai/extrato-extract.ts:158` | `extractExtratoFromDocument` | lê extrato bancário e devolve as movimentações |
| 4 | `src/lib/actions/ai.ts:68` | `testAiConnection` | **o "Testar agora" desta tela** |

Todos passam por `createMessageWithFallback` (`client.ts:83`), que é o único
lugar que fala `client.messages.create`.

E as três Server Actions que expõem essas leituras à interface:

| Action | Arquivo:linha | Permissão | Chama |
|---|---|---|---|
| `extractDespesaFromDoc` | `src/lib/actions/despesas.ts:846` | `despesas:criar` | leitura 1 |
| `extractFornecedorFromDoc` | `src/lib/actions/despesas.ts:194` | `fornecedores:criar` | leitura 2 |
| `extractExtratoPdf` | `src/lib/actions/caixa.ts:42` | `caixa:editar` | leitura 3 |
| `testAiConnection` | `src/lib/actions/ai.ts:42` | `role` owner/admin | leitura 4 |

### `src/lib/actions/despesas.ts:826–923` — a action da leitura de despesa

```ts
/**
 * Lê os documentos enviados (PDF/imagem) com IA e devolve os campos da despesa
 * já traduzidos para o formulário — com os ALERTAS de cada campo que a tela
 * precisa mostrar (o que faltou e o que merece conferência).
 *
 * Aceita VÁRIOS arquivos no mesmo `file`: a compra costuma chegar em partes
 * (a nota e o comprovante do Pix), e ler tudo junto é o que permite dizer
 * "esta despesa já está paga, por PIX, em 20/07".
 *
 * O casamento com os cadastros (fornecedor, conta, categoria, obra) acontece
 * aqui no servidor, onde as listas já estão carregadas — o cliente recebe
 * pronto o que aplicar e o que sinalizar.
 *
 * IMPORTANTE: em produção o Next.js redige (esconde) a mensagem de qualquer
 * erro LANÇADO por uma Server Action, substituindo por um texto genérico em
 * inglês ("An error occurred in the Server Components render…"). Por isso os
 * erros são RETORNADOS em `{ ok: false, error }` — é o único jeito de a
 * mensagem real ("a conta está sem créditos", "arquivo grande demais") chegar
 * ao usuário. Mesmo padrão de `extractExtratoPdf` e `addDespesaDocs`.
 */
export async function extractDespesaFromDoc(
  formData: FormData,
): Promise<
  { ok: true; data: PreenchimentoDespesa } | { ok: false; error: string }
> {
  const falha = (error: string) => ({ ok: false as const, error });
  const ctx = await getActiveContext();
  if (!ctx || !can(ctx.perms, "despesas", "criar")) {
    return falha("Sem permissão para lançar despesas.");
  }
  if (!isAiConfigured()) {
    return falha("Leitura por IA não configurada (defina ANTHROPIC_API_KEY).");
  }
  const files = formData
    .getAll("file")
    .filter((f): f is File => f instanceof File && f.size > 0);
  if (files.length === 0) return falha("Selecione um arquivo.");

  // Só PDF/imagem vão para a IA. Os demais anexos (XML, planilha, e-mail)
  // continuam podendo ser anexados à despesa — só não são lidos.
  const legiveis = files.filter((f) =>
    (AI_ACCEPTED_MIME as readonly string[]).includes(f.type || ""),
  );
  if (legiveis.length === 0) {
    return falha(
      "Nenhum arquivo legível pela IA — envie PDF ou imagem (PNG, JPG, WebP ou GIF).",
    );
  }
  const selecionados = legiveis.slice(0, AI_MAX_DOCS);
  for (const f of selecionados) {
    if (f.size > 10 * 1024 * 1024) {
      return falha(`"${f.name}" tem mais de 10 MB — envie um arquivo menor.`);
    }
  }

  try {
    const [fornecedores, contas] = await Promise.all([
      getStakeholders(ctx.tenant.id),
      getChartAccounts(ctx.tenant.id),
    ]);
    const categorias = categoriasDeDespesa(CATEGORIAS_DRE);
    const projetos = ctx.projects.map((p) => ({ id: p.id, nome: p.name }));

    const docs = await Promise.all(
      selecionados.map(async (f) => ({
        bytes: new Uint8Array(await f.arrayBuffer()),
        mime: f.type,
        filename: f.name,
      })),
    );

    const extraido = await extractDespesaFromDocument(docs, {
      fornecedores: fornecedores.map((f) => ({ nome: f.nome, doc: f.doc })),
      contas: contas.map((c) => ({ code: c.code, name: c.name })),
      projetos: projetos.map((p) => ({ nome: p.nome })),
      categorias,
      tiposDocumento: TIPOS_DOCUMENTO,
      empresa: { nome: ctx.tenant.name, cnpj: ctx.tenant.cnpj },
    });

    return {
      ok: true,
      data: montarPreenchimentoDespesa(extraido, {
        fornecedores: fornecedores.map((f) => ({ id: f.id, nome: f.nome, doc: f.doc })),
        contas: contas.map((c) => c.code),
        categorias,
        projetos,
        formasPagamento: FORMAS_PAGAMENTO,
        tiposDocumento: TIPOS_DOCUMENTO.map((t) => t.id),
      }),
    };
  } catch (e) {
    // O log fica no servidor (com stack); para a tela vai a mensagem já
    // traduzida por enrichAiError ("sem créditos", "chave inválida"...).
    console.error("[despesa] falha na leitura por IA:", e);
    return falha(e instanceof Error ? e.message : "Falha ao ler o documento.");
  }
}
```

### `src/lib/actions/despesas.ts:187–221` — a action da leitura de fornecedor

```ts
/**
 * Lê um documento (PDF/imagem) com IA e devolve os dados do fornecedor para o
 * cliente pré-preencher o formulário (o usuário revisa antes de cadastrar).
 *
 * Erros são RETORNADOS (não lançados): em produção o Next.js esconde a
 * mensagem de erro lançado por Server Action — ver `extractDespesaFromDoc`.
 */
export async function extractFornecedorFromDoc(
  formData: FormData,
): Promise<
  { ok: true; data: ExtractedFornecedor } | { ok: false; error: string }
> {
  const falha = (error: string) => ({ ok: false as const, error });
  const ctx = await getActiveContext();
  if (!ctx || !can(ctx.perms, "fornecedores", "criar")) {
    return falha("Sem permissão para cadastrar fornecedores.");
  }
  if (!isAiConfigured()) {
    return falha("Leitura por IA não configurada (defina ANTHROPIC_API_KEY).");
  }
  const file = formData.get("file") as File | null;
  if (!file || file.size === 0) return falha("Selecione um arquivo.");
  if (file.size > 10 * 1024 * 1024) return falha("Arquivo deve ter até 10 MB.");
  const mime = file.type || "";
  if (!(AI_ACCEPTED_MIME as readonly string[]).includes(mime)) {
    return falha("Envie um PDF ou imagem (PNG, JPG ou WebP).");
  }
  try {
    const bytes = new Uint8Array(await file.arrayBuffer());
    return { ok: true, data: await extractFornecedorFromDocument(bytes, mime) };
  } catch (e) {
    console.error("[fornecedor] falha na leitura por IA:", e);
    return falha(e instanceof Error ? e.message : "Falha ao ler o documento.");
  }
}
```

### `src/lib/actions/caixa.ts:27–132` — a action da leitura de extrato

```ts
/** Formatos aceitos na leitura por IA do extrato (PDF/imagens). */
const EXTRATO_AI_MIME = [
  "application/pdf",
  "image/png",
  "image/jpeg",
  "image/webp",
  "image/gif",
] as const;

/**
 * Lê um extrato bancário em PDF (ou imagem) por IA e retorna as movimentações
 * identificadas para conferência na mesma tela de pré-visualização usada pelos
 * formatos XLSX/CSV. O PDF original é armazenado (R2) para consulta/auditoria.
 * A importação só ocorre após o usuário confirmar — nada é gravado aqui.
 */
export async function extractExtratoPdf(
  formData: FormData,
): Promise<ExtratoExtraido & { error?: string }> {
  // IMPORTANTE: em produção o Next.js redige (esconde) a mensagem de qualquer
  // erro LANÇADO por uma Server Action, substituindo por um texto genérico
  // ("An error occurred in the Server Components render…"). Por isso RETORNAMOS
  // os erros em `error` — assim a mensagem real chega ao usuário na tela.
  const empty: ExtratoExtraido = { movimentos: [], saldoFinal: null };
  const ctx = await getActiveContext();
  if (!ctx || !can(ctx.perms, "caixa", "editar")) {
    return { ...empty, error: "Sem permissão para importar extrato." };
  }
  const file = formData.get("file") as File | null;
  if (!file || file.size === 0) return { ...empty, error: "Selecione um arquivo de extrato." };
  // Limite alinhado ao bodySizeLimit das Server Actions (12 MB no next.config):
  // acima disso o Next rejeita o upload antes da action rodar.
  if (file.size > 10 * 1024 * 1024) {
    return { ...empty, error: "Arquivo deve ter até 10 MB. Para extratos maiores, envie XLSX/CSV." };
  }
  const mime = file.type || "";
  if (!(EXTRATO_AI_MIME as readonly string[]).includes(mime)) {
    return { ...empty, error: "Envie um PDF ou imagem (PNG, JPG ou WebP) do extrato." };
  }
  const bytes = new Uint8Array(await file.arrayBuffer());
  // Com IA configurada, usa a leitura por IA (melhor precisão, inclusive imagens).
  // Sem IA, faz leitura de TEXTO do PDF (unpdf) por heurística — o usuário revisa
  // e ajusta na tela de conferência. Imagens sem IA não são suportadas.
  let result: ExtratoExtraido;
  try {
    if (isAiConfigured()) {
      result = await extractExtratoFromDocument(bytes, mime);
    } else if (mime === "application/pdf") {
      result = await extractExtratoFromText(bytes);
    } else {
      return {
        ...empty,
        error:
          "Leitura de imagem exige IA (ANTHROPIC_API_KEY). Para PDF sem IA, envie o PDF com texto; ou use XLSX/CSV.",
      };
    }
  } catch (e) {
    console.error("[extrato] falha ao ler PDF/imagem:", e);
    const detail = e instanceof Error ? e.message : String(e);
    return {
      ...empty,
      error:
        `Falha ao ler o arquivo do extrato (${detail}). ` +
        "Se o PDF for escaneado/imagem (sem texto), ative a leitura por IA em " +
        "Config → Diagnóstico de IA, ou envie o extrato em XLSX/CSV.",
    };
  }
  if (result.movimentos.length === 0) {
    return {
      ...result,
      error:
        "Não identifiquei movimentações no texto do PDF. Ele pode ser escaneado/imagem " +
        "(sem texto) — ative a leitura por IA em Config → Diagnóstico de IA, ou envie XLSX/CSV.",
    };
  }

  // Guarda o arquivo original do extrato para auditoria (quando o R2 existe).
  const bankAccountId = (formData.get("bankAccountId") as string) || null;
  if (isR2Configured()) {
    try {
      const safe = file.name.replace(/[^\w.\-]+/g, "_");
      const key = `tenants/${ctx.tenant.id}/extratos/${Date.now()}_${safe}`;
      await putObject(key, bytes, file.type || "application/octet-stream");
      await db.insert(schema.documents).values({
        tenantId: ctx.tenant.id,
        storageKey: key,
        filename: file.name,
        contentType: file.type || null,
        size: file.size,
        tipo: "Extrato bancário",
        uploadedBy: ctx.userEmail || ctx.userId || null,
      });
    } catch {
      // Falha ao armazenar o original não impede a conferência/importação.
    }
  }

  await logAudit({
    tenantId: ctx.tenant.id,
    userId: ctx.userId,
    action: "extrato.readPdf",
    entity: "cash_entry",
    entityId: bankAccountId ?? "—",
    meta: { arquivo: file.name, movimentos: result.movimentos.length },
  });
  return result;
}
```

---

## 6. Perguntas

### a) O que "Testar agora" faz exatamente? Envia dado real do tenant?

**Envia um payload sintético de 4 palavras. Nenhum dado do tenant.** A chamada
inteira (`ai.ts:67–71`):

```ts
  try {
    const msg = await createMessageWithFallback(aiClient(), {
      max_tokens: 8,
      messages: [{ role: "user", content: "responda apenas: ok" }],
    });
```

O que sai pela rede, literalmente:

| Item | Valor |
|---|---|
| `messages` | `[{ role: "user", content: "responda apenas: ok" }]` |
| `max_tokens` | **8** |
| `system` | ausente |
| `tools` | ausente |
| Documento anexado | nenhum |
| Modelo | a cadeia de `modelChain()` — primário + `claude-sonnet-5` + `claude-opus-4-8` |

Antes da chamada, a action apenas lê variáveis de ambiente e faz três
verificações locais, sem rede (`ai.ts:47–51`): `isAiConfigured()`,
`primaryModel()`, `rotuloModelo()`, `modelWarning()` e `isR2Configured()`. Se
`ANTHROPIC_API_KEY` estiver ausente, ela **retorna antes de chamar a API**
(`ai.ts:53–65`) — nenhuma requisição é feita.

**Nenhum dado de despesa, cliente, fornecedor, projeto ou tenant é enviado.**
Basta comparar com a leitura de despesa, que manda o catálogo inteiro do
tenant no `system` (item (f)) — aqui o `system` nem existe.

**Custo:** o pedido tem ~5 tokens de entrada e no máximo 8 de saída. Não há
cache, não há documento, não há ferramenta. É a menor chamada que a API aceita
— na prática, custo desprezível por clique, no modelo configurado (padrão
`claude-haiku-4-5`, `modelos.ts:49`). O código **não mede nem registra** o
consumo: `msg.usage` está disponível na resposta e é descartado — a action só
lê `msg.model` (`ai.ts:78`).

Um detalhe do fallback: se o modelo primário não estiver liberado, a cadeia
tenta os alternativos (`client.ts:83–99`), e cada tentativa é uma chamada
faturada. No pior caso um clique gera **3** chamadas mínimas.

### b) O resultado do teste é gravado em algum lugar?

**Não. Só exibido.** `testAiConnection` retorna o objeto `AiDiagnosticResult`
(`ai.ts:14–34`) e o painel o guarda em `useState`
(`ai-diagnostic-panel.tsx:23`, `:31`):

`ai-diagnostic-panel.tsx:23`:

```tsx
  const [res, setRes] = useState<AiDiagnosticResult | null>(null);
```

`ai-diagnostic-panel.tsx:31`:

```tsx
        setRes(await testAiConnection());
```

A action não tem `db.insert`, `db.update` nem `logAudit` — o arquivo
`src/lib/actions/ai.ts` inteiro (94 linhas, colado na seção 3) não importa
`@/lib/db` nem `@/lib/audit`. Não há tabela de diagnóstico no schema.

Consequência: recarregar a página zera o resultado, e não há histórico de
"quando o teste passou pela última vez" nem registro de quem o executou.

### c) Como as variáveis de ambiente são lidas? Há variante por tenant?

**Três `process.env`, todas globais do processo. Não há variante por tenant.**

#### `ANTHROPIC_API_KEY` — `client.ts:18–20`

```ts
export function isAiConfigured(): boolean {
  return Boolean(process.env.ANTHROPIC_API_KEY);
}
```

O código **só verifica a presença**. Quem a consome de fato é o SDK: o
construtor `new Anthropic(...)` (`client.ts:63`) a lê sozinho do ambiente — o
app nunca passa a chave explicitamente.

#### `ANTHROPIC_MODEL` — `client.ts:27–29`

```ts
export function primaryModel(): string {
  return resolverModelo(process.env.ANTHROPIC_MODEL).id;
}
```

Passa por `resolverModelo` (`modelos.ts:116–150`), que aceita o identificador,
traduz o nome comercial ("Sonnet 5" → `claude-sonnet-5`), deixa passar um id
plausível fora do catálogo, e **nunca lança**: valor incompreensível cai em
`MODELO_PADRAO` (`claude-haiku-4-5`) com um aviso. Esse aviso é o que a tela
mostra (`client.ts:37–39` → `ai.ts:50` → `ai-diagnostic-panel.tsx:95–99`).

#### `ANTHROPIC_WORKSPACE_ID` — `client.ts:57–66`

```ts
export function workspaceId(): string | null {
  return process.env.ANTHROPIC_WORKSPACE_ID?.trim() || null;
}

export function aiClient(): Anthropic {
  const ws = workspaceId();
  return new Anthropic(
    ws ? { defaultHeaders: { "anthropic-workspace-id": ws } } : undefined,
  );
}
```

Opcional. Quando definida, vira o header `anthropic-workspace-id` em toda
requisição; quando ausente, o cliente é construído sem `defaultHeaders`.

**Variante por tenant: não existe.** As três são lidas de `process.env` no
processo do servidor, sem nenhum parâmetro de tenant. Não há coluna de chave,
modelo ou workspace em `tenant` (a tabela tem 26 colunas e nenhuma é de IA),
não há tabela de configuração por tenant, e `aiClient()` não recebe argumento
nenhum. **Todos os tenants da instância compartilham a mesma chave, o mesmo
modelo e a mesma fatura** — mesmo desenho do token fiscal (`FOCUS_NFE_TOKEN`).

Note ainda que `isAiConfigured` é reexportada por `despesa-extract.ts:42` e é
por ali que três páginas a importam (`caixa/page.tsx:24`,
`despesas/page.tsx:19`, `fornecedores/page.tsx:5`) — só para decidir se
mostram o botão de leitura.

### d) A tela mostra o modelo configurado, a chave e o último teste?

**Mostra o modelo e a chave; o "último teste" não existe.** O painel só desenha
algo depois que `res` deixa de ser `null` — ou seja, **antes do primeiro
clique a tela não mostra estado nenhum**, nem se a chave existe.

Depois do clique, o bloco de resultado (`ai-diagnostic-panel.tsx:53–107`)
mostra:

| Item | Origem | Linha |
|---|---|---|
| Selo "Leitura por IA operacional / indisponível" | `res.ok` | `:56–58` |
| **Chave de IA (ANTHROPIC_API_KEY)** — OK/Falhou | `res.keyPresent` | `:60–64` |
| **Chamada ao modelo** — OK/Falhou, com o modelo que respondeu | `res.ok`, `res.modelUsed` | `:65–73` |
| **Storage de documentos (R2)** — OK/Falhou | `res.r2Configured` | `:74–82` |
| **Modelo configurado** — id + nome comercial | `res.configuredModel`, `res.configuredModelLabel` | `:83–91` |
| Aviso sobre `ANTHROPIC_MODEL` mal preenchida | `res.modelWarning` | `:95–99` |
| Mensagem de erro traduzida | `res.error` | `:100–104` |

E quatro blocos de texto de ajuda fixos (`:109–140`), que existem
independentemente do teste: como habilitar, como escolher o modelo, o que fazer
sem créditos, e quando definir `ANTHROPIC_WORKSPACE_ID`.

**Não há "último teste"** porque nada é persistido (item (b)): não há data,
não há histórico, não há quem executou. Também não há: contagem de chamadas,
consumo, custo, nem lista das funcionalidades que usam IA.

O bloco de ajuda cita `MODELO_PADRAO` direto do módulo
(`ai-diagnostic-panel.tsx:122`), então o texto "o app usa Claude Haiku 4.5"
aparece **antes** de qualquer teste — é a única informação de configuração
visível na tela virgem.

### e) Quais funcionalidades usam IA hoje?

**Quatro, contando o próprio diagnóstico.** Uma a uma:

#### 1. Leitura de documento de despesa (NF, cupom, boleto, comprovante, foto)

| Item | Valor |
|---|---|
| Arquivo da chamada | `src/lib/ai/despesa-extract.ts:220` |
| Action | `extractDespesaFromDoc` (`despesas.ts:846`) |
| Onde na UI | botão de leitura no formulário de despesa (`despesa-form.tsx:502`) |
| Modelo | o de `ANTHROPIC_MODEL`, ou `claude-haiku-4-5` |
| `max_tokens` | 2048 |
| Ferramenta | `preencher_despesa`, 20 campos, cada um com valor + confiança + nota |
| Cache de prompt | **sim** — `cache_control: {type:"ephemeral"}` no fim do `system` (`despesa-extract.ts:228`) |
| Enviado ao modelo | o `system` com o catálogo do tenant (item (f)) + até 4 arquivos em base64 + uma instrução curta |

#### 2. Leitura de documento de fornecedor

| Item | Valor |
|---|---|
| Arquivo da chamada | `src/lib/ai/fornecedor-extract.ts:103` |
| Action | `extractFornecedorFromDoc` (`despesas.ts:194`) |
| Onde na UI | formulário de fornecedor (`fornecedor-form.tsx:107`) |
| Modelo | o mesmo |
| `max_tokens` | 1024 |
| Ferramenta | `preencher_fornecedor`, 18 campos |
| Cache de prompt | **não** — não há `system` |
| Enviado ao modelo | **um** arquivo em base64 + uma instrução curta. Nenhum dado do tenant |

#### 3. Leitura de extrato bancário

| Item | Valor |
|---|---|
| Arquivo da chamada | `src/lib/ai/extrato-extract.ts:158` |
| Action | `extractExtratoPdf` (`caixa.ts:42`) |
| Onde na UI | importação de extrato (`import-extrato.tsx:234`) |
| Modelo | o mesmo |
| `max_tokens` | **8192** — o maior dos três |
| Ferramenta | `extrair_extrato`, lista de movimentos + saldo final |
| Cache de prompt | **não** |
| Enviado ao modelo | **um** arquivo em base64 + uma instrução curta. Nenhum dado do tenant |

Esta é a única com **caminho alternativo sem IA**: `extractExtratoFromText`
(`extrato-extract.ts:44`) lê o texto do PDF com `unpdf` e identifica linhas por
heurística. É usada quando `ANTHROPIC_API_KEY` não está definida
(`caixa.ts:71–81`); imagem sem IA não é suportada.

#### 4. O diagnóstico desta tela

`src/lib/actions/ai.ts:68` — `max_tokens: 8`, sem ferramenta, sem `system`,
payload sintético (item (a)).

Não há mais nada. Não existe chat, sugestão de classificação em lote, resumo de
relatório ou geração de texto em nenhum outro ponto do app.

### f) O que exatamente vai no prompt de cada uma? Há dado de cliente, CPF, renda?

#### Leitura de despesa — o único prompt que carrega dados do tenant

O módulo do prompt, inteiro, está na seção 4. O que ele monta
(`despesa-prompt.ts:40–79`):

```ts
export function promptSistemaDespesa(ctx: ContextoLeituraDespesa): string {
  const fornList =
    [...ctx.fornecedores]
      .sort((a, b) => porTexto(a.nome, b.nome))
      .slice(0, MAX_FORNECEDORES)
      .map((f) => `- ${f.nome}${f.doc ? ` (${f.doc})` : ""}`)
      .join("\n") || "(nenhum cadastrado)";
  const contaList =
    [...ctx.contas]
      .sort((a, b) => a.code.localeCompare(b.code, undefined, { numeric: true }))
      .slice(0, MAX_CONTAS)
      .map((c) => `- ${c.code} — ${c.name}`)
      .join("\n") || "(nenhum cadastrado)";
  const projList =
    [...ctx.projetos]
      .sort((a, b) => porTexto(a.nome, b.nome))
      .map((p) => `- ${p.nome}`)
      .join("\n") || "(nenhum cadastrado)";
  const tipoList = ctx.tiposDocumento.map((t) => `- ${t.id} = ${t.label}`).join("\n");

  return (
    "Você lê documentos de compra de uma construtora (nota fiscal, cupom, boleto, " +
    "comprovante de pagamento, recibo, foto de papel) e preenche o lançamento da despesa.\n\n" +
    `EMPRESA QUE ESTÁ LANÇANDO (é a PAGADORA — nunca a fornecedora): ${ctx.empresa.nome}` +
    (ctx.empresa.cnpj ? ` — CNPJ ${ctx.empresa.cnpj}` : "") +
    ".\nEm comprovante de Pix/TED, o fornecedor é o RECEBEDOR, não o pagador. " +
    "Nunca devolva os dados da empresa acima como fornecedor.\n\n" +
    `OBRAS/PROJETOS cadastrados:\n${projList}\n\n` +
    `FORNECEDORES já cadastrados (use exatamente o nome quando corresponder):\n${fornList}\n\n` +
    `PLANO DE CONTAS (escolha o código mais adequado):\n${contaList}\n\n` +
    `TIPOS DE DOCUMENTO FISCAL aceitos:\n${tipoList}\n\n` +
    "REGRAS:\n" +
    "- Datas SEMPRE em ISO: YYYY-MM-DD (e YYYY-MM na competência). O documento brasileiro escreve DD/MM/AAAA — converta.\n" +
    "- Valor numérico em reais, com ponto decimal, já líquido de desconto (se o cupom mostra Mercadorias, Desconto e Total, use o Total).\n" +
    "- Nunca invente: o que não estiver no documento volta vazio, com confianca=baixa e a nota explicando.\n" +
    '- Use confianca="alta" só para o que está escrito e legível; "media" para o que você deduziu; "baixa" para o que está ilegível, cortado, mascarado ou é palpite.\n' +
    "- A nota é lida pelo usuário na tela, em português, curta e útil (ex.: 'CPF mascarado no comprovante', 'competência deduzida da data do Pix').\n" +
    "- Comprovante de pagamento não é nota fiscal: docFiscalTipo=SEM_DOC, e pago=true."
  );
}
```

Portanto, **o que sai do banco e vai para a API a cada leitura de despesa**:

| Dado | Origem | Teto |
|---|---|---|
| **Razão social + CNPJ da empresa** | `ctx.tenant.name`, `ctx.tenant.cnpj` (`despesas.ts:903`) | — |
| **Nome e CNPJ/CPF de cada fornecedor** | `getStakeholders(ctx.tenant.id)` (`despesas.ts:883`, `:898`) | **200** (`despesa-prompt.ts:30`) |
| **Plano de contas: código + nome** | `getChartAccounts(ctx.tenant.id)` (`despesas.ts:884`, `:899`) | **400** (`despesa-prompt.ts:31`) |
| **Nome de cada obra/projeto** | `ctx.projects` (`despesas.ts:887`, `:900`) | sem teto |
| Categorias da DRE | constante do código | — |
| Tipos de documento fiscal | constante do código | — |
| **Os arquivos**, em base64 | upload do usuário | 4 arquivos, 10 MB cada |

E a parte volátil, que vai depois do ponto de cache
(`despesa-prompt.ts:85–92`): uma ou duas frases, sem dado nenhum.

**Respondendo diretamente sobre dado sensível:**

- **CPF/CNPJ: SIM.** O `doc` de cada fornecedor cadastrado vai no `system`
  (`despesa-prompt.ts:45`) — e `stakeholder` guarda tanto PJ quanto **PF**,
  então CPF de pessoa física cadastrada como fornecedor é enviado. Mais o CNPJ
  da própria empresa (`:64`).
- **Endereço: não** — o prompt lista só nome e documento do fornecedor.
- **Valor: sim, os do documento** — mas nenhum saldo, total ou histórico
  financeiro do tenant vai no prompt; a IA só vê o que está no arquivo.
- **Dado de cliente comprador: NÃO.** A tabela `cliente` — que é onde moram
  `cpfCnpj`, `rendaBruta`, `rendaLiquida`, `saldoFgts`, `scoreCredito` — **não
  é lida por nenhuma das três leituras**. Grep de `schema.clientes` em
  `src/lib/ai/` e nas três actions: zero ocorrências. Nenhuma renda, score ou
  restrição de crédito é enviada à API.
- **O conteúdo dos arquivos** é o que for: um comprovante de Pix leva o CPF
  mascarado do recebedor, e o schema instrui explicitamente a copiá-lo
  (`despesa-extract.ts:133`).

#### Leitura de fornecedor

Não há `system` e não há contexto do tenant. O prompt é o arquivo em base64
mais esta instrução (`fornecedor-extract.ts:112–118`):

```ts
          {
            type: "text",
            text:
              "Extraia os dados do fornecedor deste documento e chame a ferramenta preencher_fornecedor. " +
              'Deixe "" ou lista vazia tudo que não conseguir identificar com confiança.',
          },
        ],
```

A única coisa vinda do código é o `enum` de papéis, `PAPEIS_STAKEHOLDER`
(`fornecedor-extract.ts:82`). O schema pede 18 campos, incluindo `doc`
(CNPJ/CPF), `endereco`, `cep`, `email` e `tel` — mas **como saída**, extraída
do documento, não como entrada.

#### Leitura de extrato

Também sem `system` e sem contexto. O arquivo mais esta instrução
(`extrato-extract.ts:166–175`):

```ts
          docBlock,
          {
            type: "text",
            text:
              "Extraia TODAS as movimentações deste extrato bancário e chame a ferramenta " +
              "extrair_extrato. Não invente valores; ignore linhas de saldo/total. Use sinal " +
              "negativo para débitos/saídas e positivo para créditos/entradas.",
          },
        ],
      },
```

O extrato em si, claro, contém a movimentação bancária inteira da conta —
descrições, contrapartes, valores e saldo. É o dado financeiro mais sensível
que passa pela API, e passa integralmente, em base64.

#### Diagnóstico

`"responda apenas: ok"`. Nada mais (item (a)).

### g) Há registro de uso? Existe `logAudit` em alguma chamada de IA?

**Uma das quatro registra; nenhuma mede consumo.**

| Chamada | `logAudit`? | O que grava |
|---|---|---|
| Leitura de extrato (`caixa.ts:123–130`) | **sim** | `action: "extrato.readPdf"`, `entity: "cash_entry"`, `entityId: bankAccountId ?? "—"`, `meta: { arquivo: file.name, movimentos: result.movimentos.length }` |
| Leitura de despesa (`despesas.ts:846–923`) | **não** | — |
| Leitura de fornecedor (`despesas.ts:194–221`) | **não** | — |
| Diagnóstico (`ai.ts:42–94`) | **não** | — |

O log do extrato:

```ts
  await logAudit({
    tenantId: ctx.tenant.id,
    userId: ctx.userId,
    action: "extrato.readPdf",
    entity: "cash_entry",
    entityId: bankAccountId ?? "—",
    meta: { arquivo: file.name, movimentos: result.movimentos.length },
  });
```

Note que ele registra **nome do arquivo e quantidade de movimentos** — não
tokens, não modelo, não custo, não se a IA foi usada ou se caiu no fallback de
texto (`extractExtratoFromText`). Uma leitura sem IA gera a mesma linha de log
de uma leitura com IA.

**Contagem e custo: não existem em lugar nenhum.** Grep por `usage`,
`input_tokens`, `output_tokens`, `custo`, `cost`, `quota` e `throttle` em
`src/lib/ai/` e em `src/lib/actions/ai.ts` não devolve nenhuma linha de código
— só comentários sobre o tamanho do prompt. O objeto `usage` que a API devolve
em toda resposta é descartado nas quatro chamadas: `despesa-extract.ts:246`,
`fornecedor-extract.ts:123` e `extrato-extract.ts:179` leem só
`message.content`; `ai.ts:78` lê só `msg.model`.

Portanto **não há como responder, pelo sistema, quantas leituras foram feitas,
por quem, em qual tenant ou a que custo.** A única fonte é o console da
Anthropic, que agrega tudo numa chave só (item (c)).

### h) Há limite de tamanho, frequência ou custo? O que impede subir 500 PDFs?

**Há limites de tamanho e de quantidade por chamada. Não há limite de
frequência nem de custo.**

| Limite | Valor | Onde |
|---|---|---|
| Arquivos por leitura de despesa | **4** (`AI_MAX_DOCS`) | `campos.ts:44`; aplicado em `despesas.ts:874` e no cliente, `despesa-form.tsx:493` |
| Tamanho por arquivo (despesa) | **10 MB** | `despesas.ts:876–879` |
| Tamanho (fornecedor) | **10 MB**, 1 arquivo | `despesas.ts:209` |
| Tamanho (extrato) | **10 MB**, 1 arquivo | `caixa.ts:58–60` |
| Body da Server Action | **12 MB** | `next.config.ts`, `serverActions.bodySizeLimit` |
| Formatos aceitos | PDF, PNG, JPEG, WebP, GIF | `campos.ts:26–32` |
| Fornecedores no prompt | 200 | `despesa-prompt.ts:30` |
| Contas no prompt | 400 | `despesa-prompt.ts:31` |
| `max_tokens` de saída | 2048 / 1024 / 8192 / 8 | por chamada |

O comentário do `AI_MAX_DOCS` diz para que ele serve
(`campos.ts:39–44`):

```ts
/**
 * Quantos arquivos vão juntos numa leitura. Passa de longe o caso real (nota +
 * comprovante + foto do cupom) e evita que alguém selecione a pasta inteira e
 * mande 40 páginas para a IA de uma vez.
 */
export const AI_MAX_DOCS = 4;
```

**O que impede alguém de subir 500 PDFs: nada, além da paciência.** Não há:

- limite de chamadas por usuário, por tenant, por minuto ou por dia;
- fila, debounce ou throttle no servidor;
- teto de gasto, contador de uso ou desligamento automático;
- verificação de saldo antes da chamada.

500 PDFs viram 125 leituras de despesa (4 por vez) ou 500 leituras de extrato,
uma por clique, todas contra a mesma chave e a mesma fatura. O único freio é a
interface — cada leitura exige uma seleção de arquivos e um clique — e o
`429` da própria API, que o app traduz como *"Limite de uso da IA atingido —
tente novamente em instantes"* (`erros.ts:51–53`) e **não** reenfileira.

Vale notar que `testAiConnection` também não tem freio: o botão "Testar agora"
fica desabilitado só enquanto a chamada está em voo
(`ai-diagnostic-panel.tsx:46`), e cada clique pode disparar até 3 chamadas se
o modelo primário não estiver liberado.

### i) O que acontece quando a API falha?

**Erro visível e traduzido, em todas as quatro. Sem retry, exceto a troca de
modelo.**

O caminho comum: qualquer exceção passa por `enrichAiError`
(`client.ts:106–114`), que chama `mensagemDeErroIa` (`erros.ts`, inteiro na
seção 4) e devolve texto em pt-BR. Os casos cobertos:

| Situação | Mensagem | Linha |
|---|---|---|
| Sem créditos (vem como **400**) | "A conta da API de IA está sem créditos…" | `erros.ts:25–30` |
| Chave vinculada a identidade (também **400**) | "…defina ANTHROPIC_WORKSPACE_ID…" | `erros.ts:34–41` |
| 401 / 403 | "Chave de IA inválida ou sem permissão…" | `erros.ts:42–44` |
| 404 | "O modelo configurado não existe ou não está liberado…" | `erros.ts:45–50` |
| 429 | "Limite de uso da IA atingido — tente novamente em instantes." | `erros.ts:51–53` |
| Sem rede | "Sem conexão com a API da IA — verifique a rede/egress…" | `erros.ts:54–56` |
| Qualquer outra | `Falha na leitura por IA: <mensagem original>` | `erros.ts:57` |

O comentário do módulo explica a ordem: saldo e workspace são testados **antes**
do status porque ambos chegam como 400, que sozinho mandaria mexer na coisa
errada (`erros.ts:22–24`, `:31–33`).

**O único "retry" é a cadeia de modelos** (`client.ts:83–99`): se o erro
indicar modelo indisponível (`isModelUnavailable`, `client.ts:73–77` — 404 ou
mensagem casando `not_found`/`model`), tenta o próximo da cadeia. **Qualquer
outro erro interrompe na hora** (`client.ts:94`): sem backoff, sem segunda
tentativa, sem fila.

Por action:

- **Despesa** (`despesas.ts:917–922`): `console.error` no servidor e
  `return { ok: false, error }` — o formulário mostra a mensagem ao lado dos
  arquivos (`despesa-form.tsx:504`). O comentário explica por que retorna em
  vez de lançar: *"em produção o Next.js esconde a mensagem de erro lançado por
  Server Action"* (`despesa-form.tsx:497–500`).
- **Fornecedor** (`despesas.ts:217–220`): mesmo padrão.
- **Extrato** (`caixa.ts:82–92`): `console.error` e retorna `error` com a
  mensagem **mais** uma sugestão ("se o PDF for escaneado… ative a leitura por
  IA… ou envie XLSX/CSV"). Há ainda um segundo caso, sem exceção: zero
  movimentos identificados (`caixa.ts:93–100`).
- **Diagnóstico** (`ai.ts:82–93`): captura e devolve `ok:false` com
  `error` — o painel o pinta em vermelho (`ai-diagnostic-panel.tsx:100–104`).
  Este é o único que **não** loga no servidor.

Nenhuma falha de IA impede o trabalho: a despesa pode ser lançada à mão, o
fornecedor cadastrado à mão, e o extrato importado em XLSX/CSV.

### j) O resultado da extração é gravado antes ou depois da conferência humana?

**Depois, sempre. Nenhuma das três leituras grava o que a IA devolveu.**

#### Despesa

A action `extractDespesaFromDoc` **não tem nenhum `db.insert` ou `db.update`**
(código inteiro na seção 5): ela lê o tenant, chama a IA, passa o resultado por
`montarPreenchimentoDespesa` e **retorna**. O formulário aplica no estado local
(`despesa-form.tsx:496–509`):

```tsx
    startReading(async () => {
      // A falha da leitura aparece DENTRO do bloco de upload, ao lado dos
      // arquivos. A action RETORNA o erro em vez de lançar: em produção o
      // Next.js esconde a mensagem de erro lançado por Server Action e o
      // usuário via só um texto genérico em inglês.
      try {
        const res = await extractDespesaFromDoc(fd);
        if (res.ok) aplicarLeitura(res.data, enviados.length);
        else setErroLeitura(res.error);
      } catch {
        // Só resta o caso que a action não alcança (rede, sessão expirada).
        setErroLeitura("Falha ao ler o documento — verifique a conexão e tente novamente.");
      }
    });
```

`aplicarLeitura` (`despesa-form.tsx:442`) preenche os campos e desenha os
alertas; a gravação só acontece quando o usuário clica em salvar, e aí quem
grava é `addDespesa` — a mesma action do lançamento manual. O princípio está
declarado em `campos.ts:8–14`:

> o que a IA preencheu com certeza fica limpo; o que ela NÃO conseguiu
> preencher, ou preencheu sem confiança, fica marcado com ALERTA para o
> usuário conferir antes de gravar.
>
> Nada aqui bloqueia o lançamento — alerta é sinal, não trava.

#### Fornecedor

Idêntico: `extractFornecedorFromDoc` retorna os dados
(`despesas.ts:216`) e o formulário os aplica no estado
(`fornecedor-form.tsx:107`); só `addStakeholder` grava.

#### Extrato

Aqui há uma exceção que vale registrar, e ela **não** é a extração:
`extractExtratoPdf` **grava duas coisas** antes da conferência —

1. **o arquivo original** no R2 e uma linha em `document`
   (`caixa.ts:104–121`), explicitamente "para auditoria";
2. **a linha de auditoria** `extrato.readPdf` (`caixa.ts:123–130`).

Mas **nenhuma movimentação** é inserida em `cash_entry`. O docstring da action
é explícito (`caixa.ts:40`): *"A importação só ocorre após o usuário confirmar
— nada é gravado aqui."* As movimentações viram `PreviewRow[]` no cliente
(`import-extrato.tsx:239–246`), com `incluir: true` por linha e valores
editáveis; quem grava é `importCash`, depois da confirmação.

Resumindo o fluxo das três: **IA → objeto de retorno → estado do formulário →
conferência do usuário → action de gravação normal.** A extração e a gravação
são actions diferentes, com permissões diferentes.

### k) Qual permissão governa a tela e a action? Está em `SCREENS`?

**Está em `SCREENS`** (`permissions.ts:73`):

```ts
  { id: "diagnosticoia", label: "Diagnóstico de IA", modulo: "Config" },
```

Mas **a tela e a action usam critérios diferentes**, e essa é a observação
central desta pergunta.

| Camada | Critério | Linha |
|---|---|---|
| Enforcement central | `can(ctx.perms, "diagnosticoia", "ver")` via `screenIdOfPath` | `layout.tsx:92–95` |
| Página | `can(ctx.perms, "diagnosticoia", "ver")` → `return null` | `diagnosticoia/page.tsx:11` |
| **Action `testAiConnection`** | **`ctx.role !== "owner" && ctx.role !== "admin"`** | `ai.ts:44` |

A action, na íntegra (`ai.ts:43–46`):

```ts
  const ctx = await getActiveContext();
  if (!ctx || (ctx.role !== "owner" && ctx.role !== "admin")) {
    throw new Error("Sem permissão para executar o diagnóstico.");
  }
```

Ela **não consulta a matriz de permissões** — testa o papel diretamente. O
efeito: um `contador` ou `membro` que receba `diagnosticoia:ver` por override
em `/acessos` vê a tela e o botão, clica, e recebe
`"Sem permissão para executar o diagnóstico."`. O inverso também vale: um
`admin` que tenha `diagnosticoia:ver` revogado não chega à tela, mas a action
continuaria aceitando uma chamada forjada.

É o mesmo padrão da rota `/api/health/r2` (`route.ts:21–23`), que também
verifica o papel em vez da tela.

Perfis padrão para `diagnosticoia` (`permissions.ts:96–112`): `owner` e
`admin` recebem `FULL`; `membro` recebe `NONE` porque o módulo é `Config`;
`engenheiro` e `contador` recebem `NONE`. Na configuração padrão, portanto, a
divergência entre os dois critérios não aparece — ela só se manifesta com
override.

Detalhe da página: quando não há permissão ela faz `return null`
(`diagnosticoia/page.tsx:11`), não `<AccessDenied />` como as demais telas —
o usuário vê uma página em branco. Na prática o layout já barrou antes.

Permissões das outras três actions de IA, para comparação:

| Action | Permissão | Linha |
|---|---|---|
| `extractDespesaFromDoc` | `can(…, "despesas", "criar")` | `despesas.ts:853` |
| `extractFornecedorFromDoc` | `can(…, "fornecedores", "criar")` | `despesas.ts:201` |
| `extractExtratoPdf` | `can(…, "caixa", "editar")` | `caixa.ts:51` |
| `testAiConnection` | `role` owner/admin | `ai.ts:44` |

Ou seja: **quem pode lançar despesa pode gastar crédito de IA**, e isso não
passa pela tela de Diagnóstico nem pela permissão `diagnosticoia`.

### l) Há `tenant_id` no `where` de cada consulta?

**Nesta tela não há consulta nenhuma ao banco.** A página lê
`getActiveContext()` e renderiza (`diagnosticoia/page.tsx:9–18`); a action lê
variáveis de ambiente e chama a API (`ai.ts`, 94 linhas, sem `import` de
`@/lib/db`).

Nas três actions de leitura por IA, que é onde o banco aparece:

| Operação | Arquivo:linha | `where` | Filtra? |
|---|---|---|---|
| `getStakeholders(ctx.tenant.id)` | `despesas.ts:883` | por tenant, dentro da query | ✅ |
| `getChartAccounts(ctx.tenant.id)` | `despesas.ts:884` | por tenant | ✅ |
| `ctx.projects` | `despesas.ts:887` | vem de `getActiveContext` (`context.ts:72–76`, filtrado por tenant) | ✅ |
| `ctx.tenant.name` / `.cnpj` | `despesas.ts:903` | é a própria linha do tenant | ✅ |
| `insert` do extrato em `document` | `caixa.ts:109–117` | `tenantId: ctx.tenant.id` nos valores | ✅ |
| `logAudit` do extrato | `caixa.ts:123–130` | `tenantId: ctx.tenant.id` | ✅ |
| Chave do R2 do extrato | `caixa.ts:107` | `tenants/${ctx.tenant.id}/extratos/…` | ✅ |

`extractFornecedorFromDoc` não consulta o banco — só valida permissão, lê o
arquivo e chama a IA.

Em todos os casos o `tenantId` vem de `ctx.tenant.id`, resolvido pela sessão, e
nenhuma das actions aceita tenant por parâmetro. O ponto de atenção não é
isolamento de leitura, e sim o que a seção (c) registra: **a chave da API é
compartilhada entre todos os tenants da instância**, então o dado de cada um
sai pelo mesmo canal e entra na mesma fatura.
