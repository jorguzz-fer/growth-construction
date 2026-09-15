# Telas — Conferência (`/diagnostico/…`)

Coleta de código, sem análise. Cada arquivo aparece com o caminho como
cabeçalho. Trechos parciais trazem a faixa de linhas no título do bloco.

São duas telas irmãs sob a mesma rota-pai, que **não** é uma tela governada:
`/diagnostico/categorias-invertidas` (Conferência de lançamentos) e
`/diagnostico/planos-recebiveis` (Conferência de planos).

Base: branch `claude/contexto-revisao`.

---

## 1. A página `/diagnostico/categorias-invertidas`

### `src/app/(app)/diagnostico/categorias-invertidas/page.tsx`

```tsx
import { getActiveContext } from "@/lib/context";
import { can } from "@/lib/permissions";
import { getDespesasSuspeitas } from "@/lib/actions/diagnostico";
import { categoriasDeDespesa } from "@/lib/calc/natureza-dre";
import { CATEGORIAS_DRE } from "@/lib/calc/constants";
import { PageHeader } from "@/components/app/page-header";
import { AccessDenied } from "@/components/app/access-denied";
import { DiagnosticoCategorias } from "@/components/app/diagnostico-categorias";

export const dynamic = "force-dynamic";

/**
 * Diagnóstico dos lançamentos que violam as regras NOVAS (item 1.3).
 *
 * As validações deste pacote valem para lançamentos novos. Registros
 * históricos que as violem continuam legíveis, editáveis e íntegros — eles são
 * apenas LISTADOS aqui. Nada é corrigido automaticamente: a reclassificação
 * exige seleção e confirmação humana, e vai para a auditoria.
 */
export default async function CategoriasInvertidasPage() {
  const ctx = await getActiveContext();
  if (!ctx) return null;
  if (!can(ctx.perms, "despesas", "ver")) return <AccessDenied />;

  const rows = await getDespesasSuspeitas();

  return (
    <>
      <PageHeader
        eyebrow={ctx.tenant.name}
        title="Diagnóstico — lançamentos a conferir"
        subtitle="Despesas gravadas com categoria de receita, sem categoria ou com valor zero. Somente leitura: nada aqui é corrigido sozinho."
      />
      <DiagnosticoCategorias
        rows={rows}
        categorias={categoriasDeDespesa(CATEGORIAS_DRE)}
        canEditar={can(ctx.perms, "despesas", "editar")}
      />
    </>
  );
}
```

---

## 2. A página `/diagnostico/planos-recebiveis`

### `src/app/(app)/diagnostico/planos-recebiveis/page.tsx`

```tsx
import Link from "next/link";
import { getActiveContext } from "@/lib/context";
import { can } from "@/lib/permissions";
import { getPlanosSuspeitos } from "@/lib/actions/diagnostico";
import { dateBR } from "@/lib/utils";
import { PageHeader } from "@/components/app/page-header";
import { AccessDenied } from "@/components/app/access-denied";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Table, THead, TH, TR, TD } from "@/components/ui/table";

export const dynamic = "force-dynamic";

/**
 * Diagnóstico dos planos de pagamento de venda (item 6.3).
 *
 * Aponta duas coisas, sem alterar nenhuma delas:
 *
 *  - intervalo entre a data-base (ato) e a primeira mensal maior que a carência
 *    esperada — pode ser carência combinada em contrato ou digitação errada;
 *  - dia de vencimento que não existe em algum mês da série (ex.: 31 em abril).
 *
 * **Nenhuma data de recebível contratado é alterada aqui.** Corrigir um plano é
 * decisão comercial, feita na tela da unidade, com o contrato à vista.
 */
export default async function PlanosRecebiveisPage({
  searchParams,
}: {
  searchParams: Promise<{ carencia?: string }>;
}) {
  const ctx = await getActiveContext();
  if (!ctx) return null;
  if (!can(ctx.perms, "unidades", "ver")) return <AccessDenied />;

  const sp = await searchParams;
  const carencia = Number(sp.carencia) > 0 ? Number(sp.carencia) : 1;
  const rows = await getPlanosSuspeitos(carencia);

  return (
    <>
      <PageHeader
        eyebrow={ctx.tenant.name}
        title="Diagnóstico — planos de recebíveis"
        subtitle={`Planos cuja primeira mensal está a mais de ${carencia} mês(es) da data-base, ou com dia de vencimento inexistente em algum mês.`}
      />

      <Card className="mb-4">
        <CardContent className="p-4 text-[13px] leading-relaxed text-[var(--color-ink2)]">
          Esta tela é <strong>somente leitura</strong>. Um intervalo grande pode
          ser carência combinada em contrato — não é necessariamente erro. Nenhuma
          data de recebível já contratado foi ou será alterada por este
          diagnóstico; corrigir um plano é decisão comercial, feita na tela da
          unidade, com o contrato à vista.
        </CardContent>
      </Card>

      <div className="mb-3 flex flex-wrap items-center gap-3 text-[13px]">
        <Badge tone={rows.length > 0 ? "warning" : "success"}>
          {rows.length} plano(s) a conferir
        </Badge>
        <span className="text-[var(--color-ink3)]">
          Carência considerada: {carencia} mês(es) —{" "}
          {[1, 2, 3, 6, 12].map((n) => (
            <Link
              key={n}
              href={`/diagnostico/planos-recebiveis?carencia=${n}`}
              className={
                n === carencia
                  ? "mx-1 font-semibold text-[var(--color-ink)]"
                  : "mx-1 text-[var(--color-accent2)] hover:underline"
              }
            >
              {n}
            </Link>
          ))}
        </span>
      </div>

      {rows.length === 0 ? (
        <Card>
          <CardContent className="p-8 text-center text-[var(--color-ink3)]">
            Nenhum plano divergente com essa carência.
          </CardContent>
        </Card>
      ) : (
        <Card>
          <CardContent className="p-0">
            <Table wrapperClassName="max-h-[70vh] scroll-x-always" className="min-w-[1000px]">
              <THead className="sticky top-0 z-10">
                <tr>
                  <TH>Unidade</TH>
                  <TH>Projeto</TH>
                  <TH>Data-base</TH>
                  <TH>1ª mensal</TH>
                  <TH className="text-right">Intervalo</TH>
                  <TH>Observação</TH>
                </tr>
              </THead>
              <tbody>
                {rows.map((r) => (
                  <TR key={r.unitId}>
                    <TD className="whitespace-nowrap font-medium text-[var(--color-ink)]">
                      {r.unitCode}
                    </TD>
                    <TD className="whitespace-nowrap">{r.projectName}</TD>
                    <TD className="whitespace-nowrap font-[family-name:var(--font-mono)] text-[var(--color-ink2)]">
                      {r.dataBase ? `${r.labelBase} · ${dateBR(r.dataBase)}` : "—"}
                    </TD>
                    <TD className="whitespace-nowrap font-[family-name:var(--font-mono)] text-[var(--color-ink2)]">
                      {r.primeiraParcela ? dateBR(r.primeiraParcela) : "—"}
                    </TD>
                    <TD className="text-right font-[family-name:var(--font-mono)]">
                      {r.intervaloMeses > 0 ? (
                        <span
                          className={
                            r.intervaloMeses > carencia
                              ? "text-[var(--color-warning)]"
                              : undefined
                          }
                        >
                          {r.intervaloMeses} {r.intervaloMeses === 1 ? "mês" : "meses"}
                        </span>
                      ) : (
                        "—"
                      )}
                    </TD>
                    <TD className="text-[12px] text-[var(--color-ink3)]">
                      {r.intervaloMeses > carencia && (
                        <div>
                          Primeira mensal {r.intervaloMeses} meses após o{" "}
                          {r.labelBase.toLowerCase()}. Confirme a carência.
                        </div>
                      )}
                      {r.datasInvalidas.map((d) => (
                        <div key={d} className="text-[var(--color-danger)]">
                          {d}
                        </div>
                      ))}
                    </TD>
                  </TR>
                ))}
              </tbody>
            </Table>
          </CardContent>
        </Card>
      )}
    </>
  );
}
```

---

## 3. Componentes próprios que as duas importam (recursivamente)

```
src/app/(app)/diagnostico/categorias-invertidas/page.tsx
├── @/lib/context                       → getActiveContext
├── @/lib/permissions                   → can
├── @/lib/actions/diagnostico           → getDespesasSuspeitas             (seção 4)
├── @/lib/calc/natureza-dre             → categoriasDeDespesa              (seção 4)
├── @/lib/calc/constants                → CATEGORIAS_DRE
├── @/components/app/page-header        → PageHeader
├── @/components/app/access-denied      → AccessDenied
└── @/components/app/diagnostico-categorias → DiagnosticoCategorias   ("use client")
    ├── @/lib/actions/diagnostico       → reclassificarDespesas, DespesaSuspeita
    ├── @/lib/utils                      → brl0, dateBR
    ├── @/components/ui/card            → Card, CardContent
    ├── @/components/ui/button          → Button
    ├── @/components/ui/input           → Label, Select
    ├── @/components/ui/badge           → Badge
    └── @/components/ui/table           → Table, THead, TH, TR, TD

src/app/(app)/diagnostico/planos-recebiveis/page.tsx
├── next/link                           → Link
├── @/lib/context                       → getActiveContext
├── @/lib/permissions                   → can
├── @/lib/actions/diagnostico           → getPlanosSuspeitos               (seção 5)
├── @/lib/utils                          → dateBR
├── @/components/app/page-header        → PageHeader
├── @/components/app/access-denied      → AccessDenied
├── @/components/ui/card                → Card, CardContent
├── @/components/ui/badge               → Badge
└── @/components/ui/table               → Table, THead, TH, TR, TD
```

**Assimetria entre as duas:** só a de categorias tem componente próprio
(`DiagnosticoCategorias`, `"use client"`, 292 linhas). A de planos é um Server
Component inteiro, sem cliente, sem interatividade além dos links de carência.

### `src/components/app/diagnostico-categorias.tsx`

```tsx
"use client";

import Link from "next/link";
import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import {
  reclassificarDespesas,
  type DespesaSuspeita,
} from "@/lib/actions/diagnostico";
import { brl0, dateBR } from "@/lib/utils";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Label, Select } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Table, THead, TH, TR, TD } from "@/components/ui/table";

/**
 * Reclassificação ASSISTIDA de lançamentos históricos.
 *
 * O fluxo é deliberadamente lento: marcar → escolher a categoria → ver o
 * preview do que exatamente vai mudar → confirmar. Nenhum caminho aplica
 * correção sem que o usuário tenha visto a lista item a item. Valor,
 * competência, vencimento, status e número PED nunca são tocados.
 */
export function DiagnosticoCategorias({
  rows,
  categorias,
  canEditar,
}: {
  rows: DespesaSuspeita[];
  categorias: string[];
  canEditar: boolean;
}) {
  const router = useRouter();
  const [sel, setSel] = useState<Set<string>>(new Set());
  const [categoria, setCategoria] = useState("");
  const [preview, setPreview] = useState(false);
  const [pending, start] = useTransition();
  const [msg, setMsg] = useState<string | null>(null);
  const [erro, setErro] = useState<string | null>(null);

  // Só lançamentos ainda ativos podem ser reclassificados; os cancelados ficam
  // visíveis para conferência, mas fora da seleção.
  const selecionaveis = useMemo(
    () => rows.filter((r) => !r.motivos.includes("lançamento cancelado")),
    [rows],
  );
  const marcadas = useMemo(
    () => selecionaveis.filter((r) => sel.has(r.id)),
    [selecionaveis, sel],
  );

  const alternar = (id: string) =>
    setSel((s) => {
      const n = new Set(s);
      if (n.has(id)) n.delete(id);
      else n.add(id);
      return n;
    });

  const confirmar = () => {
    if (pending) return;
    setErro(null);
    setMsg(null);
    start(async () => {
      const res = await reclassificarDespesas([...sel], categoria);
      if (!res.ok) {
        setErro(res.error ?? "Falha ao reclassificar.");
        return;
      }
      setMsg(
        `${res.alteradas} lançamento(s) reclassificado(s) para "${categoria}". A alteração está registrada na auditoria.`,
      );
      setSel(new Set());
      setPreview(false);
      router.refresh();
    });
  };

  if (rows.length === 0) {
    return (
      <Card>
        <CardContent className="p-8 text-center text-[var(--color-ink3)]">
          Nenhum lançamento fora das regras novas. Nada a conferir.
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-4">
      <Card>
        <CardContent className="p-4 text-[13px] leading-relaxed text-[var(--color-ink2)]">
          Estes lançamentos foram gravados antes das validações novas e{" "}
          <strong>continuam íntegros, legíveis e editáveis</strong>. Eles não
          estão bloqueados nem foram alterados. Corrigir é opcional e sempre
          manual: marque os que quiser reclassificar, escolha a categoria,
          confira o preview e confirme. Valor, competência, vencimento, status e
          número PED não são tocados.
        </CardContent>
      </Card>

      <div className="flex flex-wrap items-center gap-3 text-[13px]">
        <Badge tone="warning">{rows.length} a conferir</Badge>
        <span className="text-[var(--color-ink3)]">
          Total{" "}
          <strong className="font-[family-name:var(--font-mono)] text-[var(--color-ink)]">
            {brl0(rows.reduce((a, r) => a + r.valor, 0))}
          </strong>
        </span>
        {sel.size > 0 && <Badge tone="info">{sel.size} selecionado(s)</Badge>}
      </div>

      {canEditar && selecionaveis.length > 0 && (
        <Card>
          <CardContent className="flex flex-wrap items-end gap-3 p-4">
            <div className="min-w-[240px]">
              <Label>Reclassificar os selecionados para</Label>
              <Select value={categoria} onChange={(e) => setCategoria(e.target.value)}>
                <option value="">Selecione...</option>
                {categorias.map((c) => (
                  <option key={c} value={c}>
                    {c}
                  </option>
                ))}
              </Select>
            </div>
            <Button
              type="button"
              disabled={sel.size === 0 || !categoria || pending}
              onClick={() => setPreview(true)}
            >
              Revisar {sel.size > 0 ? `${sel.size} lançamento(s)` : ""}
            </Button>
            <button
              type="button"
              onClick={() => setSel(new Set(selecionaveis.map((r) => r.id)))}
              className="text-[12px] text-[var(--color-accent2)] hover:underline"
            >
              Marcar todos
            </button>
            {sel.size > 0 && (
              <button
                type="button"
                onClick={() => setSel(new Set())}
                className="text-[12px] text-[var(--color-ink3)] hover:underline"
              >
                Limpar seleção
              </button>
            )}
          </CardContent>
        </Card>
      )}

      {msg && <p className="text-sm text-[var(--color-success)]">{msg}</p>}
      {erro && <p className="text-sm text-[var(--color-danger)]">{erro}</p>}

      <Card>
        <CardContent className="p-0">
          <Table wrapperClassName="max-h-[70vh] scroll-x-always" className="min-w-[1100px]">
            <THead className="sticky top-0 z-10">
              <tr>
                {canEditar && <TH className="w-8"></TH>}
                <TH>PED</TH>
                <TH>Projeto</TH>
                <TH>Fornecedor</TH>
                <TH>Categoria atual</TH>
                <TH>Competência</TH>
                <TH className="text-right">Valor</TH>
                <TH>Motivo</TH>
                <TH className="text-right">Abrir</TH>
              </tr>
            </THead>
            <tbody>
              {rows.map((r) => {
                const cancelada = r.motivos.includes("lançamento cancelado");
                return (
                  <TR key={r.id}>
                    {canEditar && (
                      <TD>
                        <input
                          type="checkbox"
                          checked={sel.has(r.id)}
                          disabled={cancelada}
                          onChange={() => alternar(r.id)}
                          aria-label={`Selecionar ${r.numDoc ?? r.id}`}
                        />
                      </TD>
                    )}
                    <TD className="whitespace-nowrap font-[family-name:var(--font-mono)] text-[var(--color-ink)]">
                      {r.numDoc ?? "—"}
                    </TD>
                    <TD className="whitespace-nowrap">{r.projectName}</TD>
                    <TD className="max-w-[200px] truncate">{r.fornecedorNome ?? "—"}</TD>
                    <TD>
                      {r.categoriaDre ? (
                        <Badge tone="danger">{r.categoriaDre}</Badge>
                      ) : (
                        <span className="text-[var(--color-ink4)]">—</span>
                      )}
                    </TD>
                    <TD className="font-[family-name:var(--font-mono)] text-[var(--color-ink3)]">
                      {r.competencia ?? "—"}
                    </TD>
                    <TD className="text-right font-[family-name:var(--font-mono)]">
                      {brl0(r.valor)}
                    </TD>
                    <TD className="text-[12px] text-[var(--color-ink3)]">
                      {r.motivos.join(" · ")}
                    </TD>
                    <TD className="text-right">
                      <Link
                        href={`/despesas?proj=${r.projectId}&tab=lancamentos&edit=${r.id}`}
                        className="text-sm text-[var(--color-accent2)] hover:underline"
                      >
                        Abrir
                      </Link>
                    </TD>
                  </TR>
                );
              })}
            </tbody>
          </Table>
        </CardContent>
      </Card>

      {preview && (
        <div
          onClick={() => setPreview(false)}
          className="fixed inset-0 z-[100] flex items-center justify-center bg-black/40 p-4"
        >
          <Card className="w-full max-w-2xl">
            <CardContent className="p-6" onClick={(e) => e.stopPropagation()}>
              <h2 className="mb-1 text-lg font-semibold text-[var(--color-ink)]">
                Conferir antes de aplicar
              </h2>
              <p className="mb-3 text-[12.5px] text-[var(--color-ink3)]">
                {marcadas.length} lançamento(s) passarão a ter a categoria{" "}
                <strong className="text-[var(--color-ink)]">{categoria}</strong>. Só a
                categoria muda — valor, competência, vencimento, status e número PED
                permanecem exatamente como estão.
              </p>
              <div className="max-h-[45vh] overflow-auto rounded-[8px] border border-[var(--color-accent2)]/15">
                <table className="w-full border-collapse text-[12.5px]">
                  <thead className="sticky top-0 bg-[var(--color-surface2)]">
                    <tr className="text-left font-[family-name:var(--font-mono)] text-[10px] uppercase tracking-wide text-[var(--color-ink3)]">
                      <th className="px-2 py-1.5">PED</th>
                      <th className="px-2 py-1.5">Projeto</th>
                      <th className="px-2 py-1.5">De</th>
                      <th className="px-2 py-1.5">Para</th>
                      <th className="px-2 py-1.5 text-right">Valor</th>
                      <th className="px-2 py-1.5">Vencimento</th>
                    </tr>
                  </thead>
                  <tbody>
                    {marcadas.map((r) => (
                      <tr key={r.id} className="border-t border-[var(--color-accent2)]/8">
                        <td className="px-2 py-1.5 font-[family-name:var(--font-mono)]">
                          {r.numDoc ?? "—"}
                        </td>
                        <td className="px-2 py-1.5">{r.projectName}</td>
                        <td className="px-2 py-1.5 text-[var(--color-danger)]">
                          {r.categoriaDre ?? "sem categoria"}
                        </td>
                        <td className="px-2 py-1.5 text-[var(--color-success)]">{categoria}</td>
                        <td className="px-2 py-1.5 text-right font-[family-name:var(--font-mono)]">
                          {brl0(r.valor)}
                        </td>
                        <td className="px-2 py-1.5 font-[family-name:var(--font-mono)] text-[var(--color-ink3)]">
                          {r.vencimento ? dateBR(r.vencimento) : "—"}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              {erro && <p className="mt-2 text-sm text-[var(--color-danger)]">{erro}</p>}
              <div className="mt-4 flex justify-end gap-2">
                <Button variant="ghost" onClick={() => setPreview(false)} disabled={pending}>
                  Voltar
                </Button>
                <Button onClick={confirmar} disabled={pending || marcadas.length === 0}>
                  {pending ? "Aplicando…" : `Confirmar ${marcadas.length} alteração(ões)`}
                </Button>
              </div>
            </CardContent>
          </Card>
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

## 4. `getDespesasSuspeitas` e `reclassificarDespesas`, na íntegra

As duas vivem no mesmo arquivo, junto de `getPlanosSuspeitos` (seção 5). Segue
o arquivo inteiro — o cabeçalho do módulo (linhas 17–27) declara o princípio
que governa as três.

### `src/lib/actions/diagnostico.ts`

```ts
"use server";

import { and, eq, inArray } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { db, schema } from "@/lib/db";
import { getActiveContext } from "@/lib/context";
import { can } from "@/lib/permissions";
import { logAudit } from "@/lib/audit";
import { diffAudit } from "@/lib/audit-diff";
import {
  categoriaValidaParaDespesa,
  validarCategoriaDespesa,
} from "@/lib/calc/natureza-dre";
import type { CategoriaDRE } from "@/lib/calc/constants";
import { intervaloMeses } from "@/lib/calc/carencia";

/**
 * Diagnóstico de lançamentos que violam as regras NOVAS.
 *
 * As validações deste pacote (categoria de natureza devedora, valor obrigatório)
 * valem apenas para lançamentos novos. Registros históricos que as violem
 * continuam legíveis, editáveis e íntegros — eles aparecem aqui, e só saem
 * daqui por decisão humana, item a item ou em lote com preview.
 *
 * Nada nestas funções corrige nada sozinho. `reclassificarDespesas` é a única
 * que escreve, e só age sobre os IDs que o usuário marcou e confirmou.
 */

export interface DespesaSuspeita {
  id: string;
  numDoc: string | null;
  projectId: string;
  projectName: string;
  fornecedorNome: string | null;
  categoriaDre: string | null;
  competencia: string | null;
  vencimento: string | null;
  valor: number;
  status: string | null;
  obs: string | null;
  /** Por que este lançamento está na lista. */
  motivos: string[];
}

/**
 * Despesas gravadas com categoria de natureza credora (o bug do item 1.3), sem
 * categoria nenhuma, ou com valor zero (item 1.4).
 *
 * Somente leitura. Inclui lançamentos cancelados marcados como tal, para que a
 * conferência veja o quadro inteiro sem que eles poluam a contagem de pendências.
 */
export async function getDespesasSuspeitas(): Promise<DespesaSuspeita[]> {
  const ctx = await getActiveContext();
  if (!ctx || !can(ctx.perms, "despesas", "ver")) return [];

  const rows = await db
    .select({
      d: schema.despesas,
      projectId: schema.projects.id,
      projectName: schema.projects.name,
      fornecedorNome: schema.stakeholders.nome,
    })
    .from(schema.despesas)
    .innerJoin(schema.versions, eq(schema.despesas.versionId, schema.versions.id))
    .innerJoin(schema.projects, eq(schema.versions.projectId, schema.projects.id))
    .leftJoin(schema.stakeholders, eq(schema.despesas.fornecedorId, schema.stakeholders.id))
    .where(eq(schema.despesas.tenantId, ctx.tenant.id));

  const out: DespesaSuspeita[] = [];
  for (const r of rows) {
    const motivos: string[] = [];
    if (r.d.categoriaDre && !categoriaValidaParaDespesa(r.d.categoriaDre)) {
      motivos.push("categoria de receita em lançamento de despesa");
    }
    if (!r.d.categoriaDre) motivos.push("sem categoria DRE");
    if (Number(r.d.valor) === 0) motivos.push("valor zero");
    if (r.d.cancelado) {
      // Cancelada não é pendência — mas some da lista só se não houver outro
      // motivo, para não esconder um registro que a contabilidade queira ver.
      if (motivos.length === 0) continue;
      motivos.push("lançamento cancelado");
    }
    if (motivos.length === 0) continue;
    out.push({
      id: r.d.id,
      numDoc: r.d.numDoc,
      projectId: r.projectId,
      projectName: r.projectName,
      fornecedorNome: r.fornecedorNome,
      categoriaDre: r.d.categoriaDre,
      competencia: r.d.competencia,
      vencimento: r.d.vencimento,
      valor: Number(r.d.valor),
      status: r.d.status,
      obs: r.d.obs,
      motivos,
    });
  }
  // Maiores valores primeiro: é por onde a conferência começa.
  return out.sort((a, b) => b.valor - a.valor);
}

export interface ReclassificarResult {
  ok: boolean;
  error?: string;
  alteradas?: number;
}

/**
 * Reclassificação ASSISTIDA: aplica uma categoria DRE às despesas escolhidas.
 *
 * Só roda sobre IDs que o usuário marcou na tela e confirmou depois do preview.
 * Nunca é chamada automaticamente, nunca infere a categoria "certa" sozinha e
 * nunca toca em valor, competência, vencimento, status ou número PED. Cada
 * alteração vai para a auditoria com valor anterior e novo (RG-09).
 */
export async function reclassificarDespesas(
  ids: string[],
  categoriaDre: string,
): Promise<ReclassificarResult> {
  const ctx = await getActiveContext();
  if (!ctx || !can(ctx.perms, "despesas", "editar")) {
    return { ok: false, error: "Sem permissão para reclassificar lançamentos." };
  }
  const erro = validarCategoriaDespesa(categoriaDre);
  if (erro) return { ok: false, error: erro };
  const alvos = [...new Set(ids.filter(Boolean))];
  if (alvos.length === 0) return { ok: false, error: "Nenhum lançamento selecionado." };

  const existentes = await db
    .select()
    .from(schema.despesas)
    .where(
      and(
        eq(schema.despesas.tenantId, ctx.tenant.id),
        inArray(schema.despesas.id, alvos),
      ),
    );
  if (existentes.length === 0) {
    return { ok: false, error: "Os lançamentos selecionados não foram encontrados." };
  }

  let alteradas = 0;
  for (const d of existentes) {
    // Cancelada não é reclassificada: o registro está encerrado.
    if (d.cancelado) continue;
    if (d.categoriaDre === categoriaDre) continue;
    const changes = diffAudit(d as unknown as Record<string, unknown>, {
      categoriaDre,
    });
    await db
      .update(schema.despesas)
      .set({ categoriaDre: categoriaDre as CategoriaDRE })
      .where(eq(schema.despesas.id, d.id));
    await logAudit({
      tenantId: ctx.tenant.id,
      userId: ctx.userId,
      action: "despesa.reclassificar",
      entity: "despesa",
      entityId: d.id,
      meta: { changes, origem: "diagnostico/categorias-invertidas", numDoc: d.numDoc },
    });
    alteradas++;
  }

  revalidatePath("/diagnostico/categorias-invertidas");
  revalidatePath("/despesas");
  revalidatePath("/dre");
  return { ok: true, alteradas };
}

export interface PlanoSuspeito {
  unitId: string;
  unitCode: string;
  projectName: string;
  status: string;
  /** Data-base do plano: o "Ato" (ou o primeiro bloco preenchido). */
  dataBase: string | null;
  labelBase: string;
  /** Vencimento da primeira parcela do bloco periódico seguinte. */
  primeiraParcela: string | null;
  labelPrimeira: string;
  /** Meses entre a data-base e a primeira parcela. */
  intervaloMeses: number;
  /** Datas que o expansor produziria fora do calendário (ex.: 31 em abril). */
  datasInvalidas: string[];
}

/**
 * Planos de pagamento cujo intervalo entre a data-base e a primeira mensal é
 * maior que a carência esperada (item 6.3), e planos cujo dia de vencimento não
 * existe em algum mês da série (item 6.2 / 2.4).
 *
 * Diagnóstico puro: **nenhuma data de recebível contratado é alterada aqui.**
 */
export async function getPlanosSuspeitos(
  carenciaEsperadaMeses = 1,
): Promise<PlanoSuspeito[]> {
  const ctx = await getActiveContext();
  if (!ctx || !can(ctx.perms, "unidades", "ver")) return [];

  const rows = await db
    .select({
      u: schema.units,
      projectName: schema.projects.name,
    })
    .from(schema.units)
    .innerJoin(schema.versions, eq(schema.units.versionId, schema.versions.id))
    .innerJoin(schema.projects, eq(schema.versions.projectId, schema.projects.id))
    .where(
      and(eq(schema.units.tenantId, ctx.tenant.id), eq(schema.versions.kind, "atual")),
    );

  const out: PlanoSuspeito[] = [];
  for (const r of rows) {
    if (r.u.status !== "Vendido" || !r.u.paymentPlan) continue;
    const p = r.u.paymentPlan as unknown as Record<string, Record<string, unknown>>;
    const sec = (k: string) => p[k] ?? {};
    const venc = (k: string) => {
      const v = sec(k).venc;
      return typeof v === "string" && v.trim() ? v : null;
    };
    const val = (k: string) => Number(sec(k).val) || 0;
    const qtd = (k: string) => Math.max(1, Number(sec(k).n) || 1);

    // Data-base: o primeiro bloco de entrada preenchido (Ato, depois Sinais).
    const basesPossiveis: [string, string][] = [
      ["AS", "Ato"],
      ["S1", "Sinal 1"],
      ["S2", "Sinal 2"],
      ["S3", "Sinal 3"],
    ];
    let dataBase: string | null = null;
    let labelBase = "";
    for (const [k, label] of basesPossiveis) {
      if (venc(k) && val(k) > 0) {
        dataBase = venc(k);
        labelBase = label;
        break;
      }
    }
    const primeira = venc("Mensais") && val("Mensais") > 0 ? venc("Mensais") : null;

    const meses = dataBase && primeira ? intervaloMeses(dataBase, primeira) : 0;

    // Dia de vencimento inexistente em algum mês da série periódica.
    const datasInvalidas: string[] = [];
    for (const [k, label, passo] of [
      ["Mensais", "Mensal", 1],
      ["Semestrais", "Semestral", 6],
      ["Anuais", "Anual", 12],
    ] as [string, string, number][]) {
      const base = venc(k);
      if (!base || val(k) <= 0) continue;
      const partes = base.split("/");
      if (partes.length !== 3) continue;
      const dia = Number(partes[1]);
      if (dia <= 28) continue; // 1..28 existe em todo mês
      const mo = Number(partes[0]);
      const yr = Number(partes[2]);
      for (let i = 0; i < qtd(k); i++) {
        const total = mo - 1 + i * passo;
        const m = (total % 12) + 1;
        const y = yr + Math.floor(total / 12);
        const ultimoDia = new Date(Date.UTC(y, m, 0)).getUTCDate();
        if (dia > ultimoDia) {
          datasInvalidas.push(
            `${label} #${i + 1}: dia ${dia} não existe em ${String(m).padStart(2, "0")}/${y}`,
          );
        }
      }
    }

    const forcaCarencia = dataBase && primeira && meses > carenciaEsperadaMeses;
    if (!forcaCarencia && datasInvalidas.length === 0) continue;

    out.push({
      unitId: r.u.id,
      unitCode: r.u.code,
      projectName: r.projectName,
      status: r.u.status,
      dataBase,
      labelBase,
      primeiraParcela: primeira,
      labelPrimeira: "Mensal #1",
      intervaloMeses: meses,
      // Um plano pode ter dezenas de parcelas; mostrar as primeiras já basta
      // para a conferência entender o padrão.
      datasInvalidas: datasInvalidas.slice(0, 6),
    });
  }
  return out.sort((a, b) => b.intervaloMeses - a.intervaloMeses);
}
```

### `src/lib/calc/natureza-dre.ts` — a regra que classifica e valida

```ts
/**
 * Natureza contábil das categorias da DRE — RG-01 e a trava do item 1.3.
 *
 * A DRE do Growth tem nove categorias numa lista única (`CATEGORIAS_DRE`), sem
 * distinguir o que é conta CREDORA (receita) do que é DEVEDORA (custo, despesa,
 * saída patrimonial). Essa lista alimenta o `<Select>` de despesa, e como
 * "Receita" é o primeiro item, toda despesa nova nascia classificada como
 * receita — inflando receita e resultado ao mesmo tempo.
 *
 * Este módulo é a fonte única dessa classificação. Ele existe separado da
 * constante porque a regra é contábil, precisa de teste e é consumida tanto
 * pela interface (filtrar o dropdown) quanto pelo servidor (recusar a
 * gravação). Validar só no cliente não protege nada: a Server Action é
 * chamável direto.
 */
import { CATEGORIAS_DRE, type CategoriaDRE } from "./constants";

export type NaturezaDRE = "credora" | "devedora";

/**
 * Categorias de natureza CREDORA — entram no resultado como receita.
 *
 * Hoje só "Receita". Fica como conjunto (e não como comparação direta) porque
 * o pacote de controladoria acrescenta "Receitas Financeiras" (RG-07, descontos
 * obtidos), e o resto do código não deve precisar mudar quando isso acontecer.
 */
const CREDORAS = new Set<string>(["Receita"]);

/**
 * Natureza de uma categoria da DRE.
 *
 * O default é DEVEDORA de propósito: uma categoria desconhecida (vinda de dado
 * histórico ou de uma versão futura da lista) é tratada como despesa, que é o
 * lado seguro — classificar errado como receita é o erro que este módulo
 * existe para impedir.
 */
export function naturezaCategoriaDre(categoria: string | null | undefined): NaturezaDRE {
  if (!categoria) return "devedora";
  return CREDORAS.has(categoria.trim()) ? "credora" : "devedora";
}

/** Categoria válida para um lançamento de DESPESA? (RG-01, item 1.3) */
export function categoriaValidaParaDespesa(categoria: string | null | undefined): boolean {
  return naturezaCategoriaDre(categoria) === "devedora";
}

/**
 * Categorias que podem aparecer no dropdown de uma despesa: só as devedoras.
 * A ordem original da lista é preservada — a tela não deve reordenar o que o
 * usuário já conhece de cor.
 */
export function categoriasDeDespesa(
  categorias: readonly string[] = CATEGORIAS_DRE,
): string[] {
  return categorias.filter((c) => categoriaValidaParaDespesa(c));
}

/** Mensagem única de recusa, usada pelas duas telas que lançam despesa. */
export const ERRO_CATEGORIA_CREDORA =
  "Categoria de receita não é válida para lançamento de despesa.";

/**
 * Valida a categoria escolhida num lançamento de despesa.
 *
 * Devolve a mensagem de erro ou `null`. Categoria vazia é recusada aqui porque
 * o formulário passou a abrir em "Selecione…" — sem isso, deixar o campo em
 * branco gravaria despesa sem classificação na DRE.
 */
export function validarCategoriaDespesa(
  categoria: string | null | undefined,
): string | null {
  if (!categoria || !categoria.trim()) return "Selecione a categoria DRE da despesa.";
  if (!categoriaValidaParaDespesa(categoria)) return ERRO_CATEGORIA_CREDORA;
  return null;
}

/** Type guard: a string é uma das categorias conhecidas da DRE? */
export function ehCategoriaDre(v: string | null | undefined): v is CategoriaDRE {
  return !!v && (CATEGORIAS_DRE as readonly string[]).includes(v);
}
```

### `src/lib/calc/constants.ts:254–266` — `CATEGORIAS_DRE`

```ts
/** As 7 categorias da DRE. §8.3 */
export const CATEGORIAS_DRE = [
  "Receita",
  "Custo Variável",
  "Custo Fixo",
  "Despesa Variável",
  "Despesa Fixa",
  "Retiradas",
  "Investimento",
  "Empréstimos",
  "Despesas Financeiras",
] as const;
export type CategoriaDRE = (typeof CATEGORIAS_DRE)[number];
```

### `src/lib/audit-diff.ts` — o `diffAudit` usado no log de cada item

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

## 5. A consulta da Conferência de planos, na íntegra

### `src/lib/actions/diagnostico.ts:189–293` — `getPlanosSuspeitos`

```ts
/**
 * Planos de pagamento cujo intervalo entre a data-base e a primeira mensal é
 * maior que a carência esperada (item 6.3), e planos cujo dia de vencimento não
 * existe em algum mês da série (item 6.2 / 2.4).
 *
 * Diagnóstico puro: **nenhuma data de recebível contratado é alterada aqui.**
 */
export async function getPlanosSuspeitos(
  carenciaEsperadaMeses = 1,
): Promise<PlanoSuspeito[]> {
  const ctx = await getActiveContext();
  if (!ctx || !can(ctx.perms, "unidades", "ver")) return [];

  const rows = await db
    .select({
      u: schema.units,
      projectName: schema.projects.name,
    })
    .from(schema.units)
    .innerJoin(schema.versions, eq(schema.units.versionId, schema.versions.id))
    .innerJoin(schema.projects, eq(schema.versions.projectId, schema.projects.id))
    .where(
      and(eq(schema.units.tenantId, ctx.tenant.id), eq(schema.versions.kind, "atual")),
    );

  const out: PlanoSuspeito[] = [];
  for (const r of rows) {
    if (r.u.status !== "Vendido" || !r.u.paymentPlan) continue;
    const p = r.u.paymentPlan as unknown as Record<string, Record<string, unknown>>;
    const sec = (k: string) => p[k] ?? {};
    const venc = (k: string) => {
      const v = sec(k).venc;
      return typeof v === "string" && v.trim() ? v : null;
    };
    const val = (k: string) => Number(sec(k).val) || 0;
    const qtd = (k: string) => Math.max(1, Number(sec(k).n) || 1);

    // Data-base: o primeiro bloco de entrada preenchido (Ato, depois Sinais).
    const basesPossiveis: [string, string][] = [
      ["AS", "Ato"],
      ["S1", "Sinal 1"],
      ["S2", "Sinal 2"],
      ["S3", "Sinal 3"],
    ];
    let dataBase: string | null = null;
    let labelBase = "";
    for (const [k, label] of basesPossiveis) {
      if (venc(k) && val(k) > 0) {
        dataBase = venc(k);
        labelBase = label;
        break;
      }
    }
    const primeira = venc("Mensais") && val("Mensais") > 0 ? venc("Mensais") : null;

    const meses = dataBase && primeira ? intervaloMeses(dataBase, primeira) : 0;

    // Dia de vencimento inexistente em algum mês da série periódica.
    const datasInvalidas: string[] = [];
    for (const [k, label, passo] of [
      ["Mensais", "Mensal", 1],
      ["Semestrais", "Semestral", 6],
      ["Anuais", "Anual", 12],
    ] as [string, string, number][]) {
      const base = venc(k);
      if (!base || val(k) <= 0) continue;
      const partes = base.split("/");
      if (partes.length !== 3) continue;
      const dia = Number(partes[1]);
      if (dia <= 28) continue; // 1..28 existe em todo mês
      const mo = Number(partes[0]);
      const yr = Number(partes[2]);
      for (let i = 0; i < qtd(k); i++) {
        const total = mo - 1 + i * passo;
        const m = (total % 12) + 1;
        const y = yr + Math.floor(total / 12);
        const ultimoDia = new Date(Date.UTC(y, m, 0)).getUTCDate();
        if (dia > ultimoDia) {
          datasInvalidas.push(
            `${label} #${i + 1}: dia ${dia} não existe em ${String(m).padStart(2, "0")}/${y}`,
          );
        }
      }
    }

    const forcaCarencia = dataBase && primeira && meses > carenciaEsperadaMeses;
    if (!forcaCarencia && datasInvalidas.length === 0) continue;

    out.push({
      unitId: r.u.id,
      unitCode: r.u.code,
      projectName: r.projectName,
      status: r.u.status,
      dataBase,
      labelBase,
      primeiraParcela: primeira,
      labelPrimeira: "Mensal #1",
      intervaloMeses: meses,
      // Um plano pode ter dezenas de parcelas; mostrar as primeiras já basta
      // para a conferência entender o padrão.
      datasInvalidas: datasInvalidas.slice(0, 6),
    });
  }
  return out.sort((a, b) => b.intervaloMeses - a.intervaloMeses);
}
```

### `src/lib/calc/carencia.ts` — `intervaloMeses` e o resto do módulo de datas

```ts
/**
 * Datas de vencimento: ajuste de fim de mês e carência — itens 2.4 e 6.2.
 *
 * Duas regras que o sistema não tinha:
 *
 * 1. **Fim de mês.** "Todo dia 30" precisa cair em 28/29 de fevereiro e o dia 31
 *    precisa cair em 30 nos meses de 30 dias. O expansor de recebíveis montava a
 *    data com o dia ORIGINAL no mês deslocado, produzindo strings como
 *    "04/31/2026" — data que não existe no calendário. Somar 30 dias também não
 *    resolve: desloca o dia de vencimento a cada mês.
 * 2. **Carência.** O intervalo entre a data-base (ato/contrato) e a primeira
 *    mensal precisa ser explícito, e não um número que emerge do que o usuário
 *    digitou em dois campos independentes.
 *
 * Todas as datas usam o formato interno da aplicação, "MM/DD/YYYY".
 */

export interface DataPartes {
  mo: number;
  d: number;
  yr: number;
}

/** "MM/DD/YYYY" → partes. `null` quando vazio ou malformado. */
export function parseDataInterna(s: string | null | undefined): DataPartes | null {
  if (!s || !s.trim()) return null;
  const p = s.split("/");
  if (p.length !== 3) return null;
  const mo = Number(p[0]);
  const d = Number(p[1]);
  const yr = Number(p[2]);
  if (!Number.isInteger(mo) || !Number.isInteger(d) || !Number.isInteger(yr)) return null;
  if (mo < 1 || mo > 12 || d < 1 || d > 31 || yr < 1900) return null;
  return { mo, d, yr };
}

/** Partes → "MM/DD/YYYY". */
export function formatDataInterna(p: DataPartes): string {
  return `${String(p.mo).padStart(2, "0")}/${String(p.d).padStart(2, "0")}/${p.yr}`;
}

/** Último dia do mês (trata ano bissexto). */
export function ultimoDiaDoMes(mo: number, yr: number): number {
  // Dia 0 do mês seguinte = último dia deste mês.
  return new Date(Date.UTC(yr, mo, 0)).getUTCDate();
}

/**
 * Data com o `diaDesejado` no mês/ano informados, encolhida para o último dia
 * quando o mês não tem esse dia.
 *
 * "todo dia 31" em abril vira 30/04; em fevereiro de 2027 vira 28/02; em
 * fevereiro de 2028 (bissexto) vira 29/02.
 */
export function ajustaDiaFimDeMes(mo: number, yr: number, diaDesejado: number): DataPartes {
  const ultimo = ultimoDiaDoMes(mo, yr);
  return { mo, yr, d: Math.min(Math.max(1, diaDesejado), ultimo) };
}

/**
 * Avança `n` meses a partir de uma data-base, preservando o dia desejado e
 * encolhendo-o quando o mês de destino não o tem.
 *
 * O dia desejado é sempre o da data-base — encolher num mês curto NÃO
 * "contamina" os meses seguintes: dia 31 → 28/02 → 31/03, e não 28/03.
 */
export function avancaMeses(base: DataPartes, n: number, diaDesejado?: number): DataPartes {
  const total = base.mo - 1 + n;
  const mo = ((total % 12) + 12) % 12 + 1;
  const yr = base.yr + Math.floor(total / 12);
  return ajustaDiaFimDeMes(mo, yr, diaDesejado ?? base.d);
}

/**
 * Série de vencimentos mensais (ou de passo `passoMeses`) a partir da data-base.
 *
 * `qtd` parcelas, todas com o mesmo dia de vencimento, ajustado ao fim de mês.
 */
export function serieVencimentos(
  dataBase: string,
  qtd: number,
  passoMeses = 1,
  diaVencimento?: number,
): string[] {
  const base = parseDataInterna(dataBase);
  if (!base || qtd <= 0) return [];
  const dia = diaVencimento ?? base.d;
  const out: string[] = [];
  for (let i = 0; i < qtd; i++) {
    out.push(formatDataInterna(avancaMeses(base, i * passoMeses, dia)));
  }
  return out;
}

/**
 * Diferença em MESES entre duas datas internas (ignora o dia).
 *
 * É a medida certa para carência: de 11/02/2026 até 20/01/2027 são 11 meses,
 * independentemente de o dia ter mudado de 11 para 20.
 */
export function intervaloMeses(de: string | null, ate: string | null): number {
  const a = parseDataInterna(de);
  const b = parseDataInterna(ate);
  if (!a || !b) return 0;
  return (b.yr - a.yr) * 12 + (b.mo - a.mo);
}

/**
 * Data da primeira parcela a partir da data-base e da carência (item 6.2).
 *
 * Carência 1 = primeira parcela um mês depois da data-base, que é o padrão de
 * mercado. Carência 0 = no mesmo mês.
 */
export function dataPrimeiraParcela(
  dataBase: string,
  carenciaMeses: number,
  diaVencimento?: number,
): string | null {
  const base = parseDataInterna(dataBase);
  if (!base) return null;
  return formatDataInterna(avancaMeses(base, Math.max(0, carenciaMeses), diaVencimento));
}

/**
 * A primeira parcela está mais distante da data-base do que a carência
 * configurada? Serve ao ALERTA do item 6.3 — que nunca bloqueia nem corrige.
 */
export function carenciaDivergente(
  dataBase: string | null,
  primeiraParcela: string | null,
  carenciaEsperadaMeses: number,
): boolean {
  if (!dataBase || !primeiraParcela) return false;
  return intervaloMeses(dataBase, primeiraParcela) > carenciaEsperadaMeses;
}
```

---

## 6. Perguntas

### a) Quantas condições `getDespesasSuspeitas` procura? Inclui sem categoria e valor zero?

Antes das condições, o ponto que muda como ler a resposta: **não existe uma
query com condições.** O `where` do SQL tem **um único filtro** — o tenant
(`diagnostico.ts:56–67`):

```ts
  const rows = await db
    .select({
      d: schema.despesas,
      projectId: schema.projects.id,
      projectName: schema.projects.name,
      fornecedorNome: schema.stakeholders.nome,
    })
    .from(schema.despesas)
    .innerJoin(schema.versions, eq(schema.despesas.versionId, schema.versions.id))
    .innerJoin(schema.projects, eq(schema.versions.projectId, schema.projects.id))
    .leftJoin(schema.stakeholders, eq(schema.despesas.fornecedorId, schema.stakeholders.id))
    .where(eq(schema.despesas.tenantId, ctx.tenant.id));
```

A consulta traz **todas as despesas do tenant**, com dois `innerJoin`
(versão → projeto) e um `leftJoin` (fornecedor). A triagem acontece **em
JavaScript**, no laço das linhas 70–98:

```ts
  const out: DespesaSuspeita[] = [];
  for (const r of rows) {
    const motivos: string[] = [];
    if (r.d.categoriaDre && !categoriaValidaParaDespesa(r.d.categoriaDre)) {
      motivos.push("categoria de receita em lançamento de despesa");
    }
    if (!r.d.categoriaDre) motivos.push("sem categoria DRE");
    if (Number(r.d.valor) === 0) motivos.push("valor zero");
    if (r.d.cancelado) {
      // Cancelada não é pendência — mas some da lista só se não houver outro
      // motivo, para não esconder um registro que a contabilidade queira ver.
      if (motivos.length === 0) continue;
      motivos.push("lançamento cancelado");
    }
    if (motivos.length === 0) continue;
    out.push({
      id: r.d.id,
      numDoc: r.d.numDoc,
      projectId: r.projectId,
      projectName: r.projectName,
      fornecedorNome: r.fornecedorNome,
      categoriaDre: r.d.categoriaDre,
      competencia: r.d.competencia,
      vencimento: r.d.vencimento,
      valor: Number(r.d.valor),
      status: r.d.status,
      obs: r.d.obs,
      motivos,
    });
  }
```

São **quatro testes**, sendo três que colocam a despesa na lista e um que a
tira:

| # | Condição | Motivo gerado | Linha |
|---|---|---|---|
| 1 | tem categoria **e** ela não é válida para despesa | `"categoria de receita em lançamento de despesa"` | 72–74 |
| 2 | **não tem categoria** | `"sem categoria DRE"` | 75 |
| 3 | `Number(valor) === 0` | `"valor zero"` | 76 |
| 4 | `cancelado` | se não houver outro motivo, **`continue`** (sai da lista); se houver, acrescenta `"lançamento cancelado"` | 77–82 |

**Respondendo diretamente: sim, as duas estão incluídas.**

- **Despesa sem categoria: incluída**, pela condição 2 (`diagnostico.ts:75`).
  O `if` da condição 1 exige `r.d.categoriaDre` truthy justamente para não
  duplicar motivo — quem está sem categoria cai na linha seguinte.
- **Valor zero: incluído**, pela condição 3 (`diagnostico.ts:76`).
  `Number(null)` é `0`, então despesa com `valor` nulo também entra (a coluna é
  `notNull().default("0")`, então na prática o caso é o `"0"`).

O docstring da função já anuncia as três (`diagnostico.ts:46–47`):
*"Despesas gravadas com categoria de natureza credora (o bug do item 1.3), sem
categoria nenhuma, ou com valor zero (item 1.4)."*

E o subtítulo da página repete (`categorias-invertidas/page.tsx:32`):
*"Despesas gravadas com categoria de receita, sem categoria ou com valor
zero."*

Quem decide o que é "categoria de receita" é `categoriaValidaParaDespesa`
(`natureza-dre.ts:43–45`), que pergunta a natureza da categoria. O conjunto
`CREDORAS` tem **um** elemento hoje — `"Receita"` (`natureza-dre.ts:27`) — e o
default é **devedora**, inclusive para categoria desconhecida
(`natureza-dre.ts:37–40`), com a justificativa escrita ali: *"classificar
errado como receita é o erro que este módulo existe para impedir"*.

Ordenação: maior valor primeiro (`diagnostico.ts:100`), sem `LIMIT`.

### b) Quantas despesas existem hoje sem `categoria_dre` e sem competência?

Duas observações antes da consulta.

**Primeira: a premissa do "se não inclui" não se aplica.** Despesa sem
categoria **é** incluída — item (a), condição 2. O que a função **não** testa é
a **competência**: não há nenhuma condição sobre `competencia` em
`getDespesasSuspeitas`. Uma despesa com categoria válida, valor diferente de
zero e `competencia` nula **não aparece na tela** — e competência nula a deixa
fora da DRE, que agrupa por `competencia`.

**Segunda: não é possível rodar.** Esta sessão não tem `DATABASE_URL` definido
(`echo "$DATABASE_URL"` devolve vazio), então não há como consultar o banco de
produção daqui. Não vou inventar números. Segue a consulta, somente leitura —
substitua `:tenant_id` pelo UUID do tenant ou remova o filtro para varrer tudo.

```sql
SELECT
  COUNT(*) FILTER (WHERE categoria_dre IS NULL)                       AS sem_categoria,
  COUNT(*) FILTER (WHERE competencia IS NULL OR btrim(competencia) = '')
                                                                      AS sem_competencia,
  COUNT(*) FILTER (WHERE categoria_dre IS NULL
                     AND (competencia IS NULL OR btrim(competencia) = ''))
                                                                      AS sem_os_dois,
  COUNT(*) FILTER (WHERE valor = 0)                                   AS valor_zero,
  COUNT(*) FILTER (WHERE categoria_dre = 'Receita')                   AS categoria_credora,
  COUNT(*) FILTER (WHERE cancelado)                                   AS canceladas,
  COUNT(*)                                                            AS total
  FROM despesa
 WHERE tenant_id = :tenant_id;
```

Detalhamento das que ficam **fora** da tela por só terem competência faltando —
o ponto cego descrito acima:

```sql
SELECT p.name AS obra, d.num_doc, d.categoria_dre, d.valor,
       d.vencimento, d.status, d.cancelado, d.created_at
  FROM despesa d
  JOIN version v ON v.id = d.version_id
  JOIN project p ON p.id = v.project_id
 WHERE d.tenant_id = :tenant_id
   AND (d.competencia IS NULL OR btrim(d.competencia) = '')
   AND d.categoria_dre IS NOT NULL
   AND d.valor <> 0
   AND NOT d.cancelado
 ORDER BY d.valor DESC;
```

E a contagem equivalente ao que a tela mostra, para conferir contra o badge
"N a conferir" (`diagnostico-categorias.tsx:104`):

```sql
SELECT COUNT(*) AS a_conferir, SUM(valor) AS total
  FROM despesa
 WHERE tenant_id = :tenant_id
   AND (categoria_dre = 'Receita' OR categoria_dre IS NULL OR valor = 0);
```

Note que a terceira consulta **não** reproduz exatamente a tela: a função
mantém a despesa cancelada quando ela tem outro motivo e a descarta quando não
tem (`diagnostico.ts:77–82`) — comportamento que o `WHERE` acima ignora, porque
toda linha aqui já tem ao menos um motivo.

### c) Quantos ids `reclassificarDespesas` aceita? O que grava e o que não toca?

**Não há limite algum.** A assinatura recebe `ids: string[]`
(`diagnostico.ts:118`) e o único tratamento é remover vazios e duplicados
(`diagnostico.ts:127`):

```ts
  const alvos = [...new Set(ids.filter(Boolean))];
  if (alvos.length === 0) return { ok: false, error: "Nenhum lançamento selecionado." };
```

Não há teto de quantidade, não há paginação do `inArray`, não há verificação de
tamanho do payload. O `inArray(schema.despesas.id, alvos)`
(`diagnostico.ts:136`) monta um `IN (...)` com todos os ids de uma vez. Na
prática o teto é o do botão "Marcar todos"
(`diagnostico-categorias.tsx:137`), que seleciona **todos os selecionáveis** da
lista — e a lista não tem limite (item (a)).

**O que ela grava** (`diagnostico.ts:151–154`):

```ts
    await db
      .update(schema.despesas)
      .set({ categoriaDre: categoriaDre as CategoriaDRE })
      .where(eq(schema.despesas.id, d.id));
```

**Uma única coluna: `categoria_dre`.** O `set` tem uma chave e nada mais.

**O que ela não toca:** todo o resto das 36 colunas de `despesa` —
`valor`, `competencia`, `vencimento`, `data_caixa`, `status`, `num_doc`,
`fornecedor_id`, `banco_id`, `conta_cef`, `obs`, os campos de boleto e cheque,
`pago_por_terceiro`, e os quatro de cancelamento. O docstring enumera os cinco
que mais importam (`diagnostico.ts:113–115`): *"nunca toca em valor,
competência, vencimento, status ou número PED"*, e a tela repete a mesma frase
em dois lugares (`diagnostico-categorias.tsx:98–99` e `:240–241`).

**Duas despesas são puladas dentro do laço** (`diagnostico.ts:144–147`):

```ts
  let alteradas = 0;
  for (const d of existentes) {
    // Cancelada não é reclassificada: o registro está encerrado.
    if (d.cancelado) continue;
    if (d.categoriaDre === categoriaDre) continue;
    const changes = diffAudit(d as unknown as Record<string, unknown>, {
      categoriaDre,
    });
```

- **cancelada** → `continue`, "o registro está encerrado";
- **já está na categoria de destino** → `continue`, evitando update e log
  inúteis.

Por isso `alteradas` (`diagnostico.ts:163`, devolvido em `:169`) pode ser
**menor** que a quantidade de ids enviados — e a mensagem da tela usa esse
número, não o tamanho da seleção (`diagnostico-categorias.tsx:71–73`).

Um detalhe de execução: o laço faz **um `UPDATE` e um `INSERT` de auditoria por
despesa**, em sequência, **sem transação** (`diagnostico.ts:144–164`). Marcar
500 lançamentos gera 1.000 statements independentes; se o processo cair no
meio, parte fica reclassificada e parte não, sem rollback.

### d) O destino é validado? Aceita categoria de natureza credora?

**É validado, no servidor, e categoria credora é recusada** — a mesma regra que
o diagnóstico existe para apontar não pode ser reintroduzida por ele.

A validação é a terceira linha da action (`diagnostico.ts:125–126`):

```ts
  const erro = validarCategoriaDespesa(categoriaDre);
  if (erro) return { ok: false, error: erro };
```

`validarCategoriaDespesa` (`natureza-dre.ts:69–75`, inteira na seção 4) recusa
dois casos:

| Entrada | Retorno | Mensagem |
|---|---|---|
| vazia / só espaços | erro | `"Selecione a categoria DRE da despesa."` |
| categoria credora (`"Receita"`) | erro | `"Categoria de receita não é válida para lançamento de despesa."` |
| qualquer categoria devedora | `null` | — (passa) |

A recusa acontece **antes** de qualquer leitura ou escrita: a action retorna
`{ ok: false, error }` (`diagnostico.ts:126`) e nenhuma despesa é tocada.

No cliente, o `<Select>` já é montado só com as devedoras
(`categorias-invertidas/page.tsx:36`):

```tsx
        categorias={categoriasDeDespesa(CATEGORIAS_DRE)}
```

`categoriasDeDespesa` (`natureza-dre.ts:52–56`) filtra a lista por
`categoriaValidaParaDespesa`. Como `CREDORAS` tem só `"Receita"`
(`natureza-dre.ts:27`) e `CATEGORIAS_DRE` tem **nove** itens
(`constants.ts:255–265`), o dropdown oferece **oito** opções: Custo Variável,
Custo Fixo, Despesa Variável, Despesa Fixa, Retiradas, Investimento,
Empréstimos e Despesas Financeiras.

Duas observações de rigor sobre o que li:

1. O comentário acima da constante diz *"As 7 categorias da DRE"*
   (`constants.ts:254`) — o array tem **9**. O comentário está desatualizado;
   o código que conta é o array.
2. A validação do cliente e a do servidor são independentes e ambas existem.
   O próprio módulo explica por quê (`natureza-dre.ts:12–14`): *"Validar só no
   cliente não protege nada: a Server Action é chamável direto."*

Não há, em compensação, validação de que o **destino faça sentido** para
aquela despesa — qualquer uma das oito é aceita para qualquer lançamento. A
escolha é do usuário, e o log guarda de→para (item (f)).

### e) O "preview" existe? Qual o fluxo entre marcar, Revisar e confirmar?

**Existe** — é um modal, `diagnostico-categorias.tsx:227–289`. O fluxo tem
quatro passos, e nenhum atalho aplica correção sem passar pelo modal.

**Passo 1 — marcar.** Checkbox por linha (`:181–187`), com
`disabled={cancelada}` (`:184`). O estado é um `Set<string>` de ids
(`:35`), alternado por `alternar` (`:53–59`). Há dois atalhos:
"Marcar todos" — que marca só os **selecionáveis** (`:137`) — e
"Limpar seleção" (`:145`).

**Passo 2 — escolher a categoria.** `<Select>` alimentado pelas oito devedoras
(`:119–126`).

**Passo 3 — Revisar.** O botão só habilita com seleção **e** categoria
(`:128–134`):

```tsx
            <Button
              type="button"
              disabled={sel.size === 0 || !categoria || pending}
              onClick={() => setPreview(true)}
            >
              Revisar {sel.size > 0 ? `${sel.size} lançamento(s)` : ""}
            </Button>
```

Ele apenas liga o modal: `onClick={() => setPreview(true)}`. **Nenhuma chamada
ao servidor acontece aqui.**

**Passo 4 — o modal e a confirmação.** O modal lista item a item, com as
colunas PED, Projeto, **De**, **Para**, Valor e Vencimento (`:243–276`), e o
texto de cabeçalho repete o que não muda (`:237–242`). O botão final chama
`confirmar` (`:61–78`):

```tsx
  const confirmar = () => {
    if (pending) return;
    setErro(null);
    setMsg(null);
    start(async () => {
      const res = await reclassificarDespesas([...sel], categoria);
      if (!res.ok) {
        setErro(res.error ?? "Falha ao reclassificar.");
        return;
      }
      setMsg(
        `${res.alteradas} lançamento(s) reclassificado(s) para "${categoria}". A alteração está registrada na auditoria.`,
      );
      setSel(new Set());
      setPreview(false);
      router.refresh();
    });
  };
```

Na volta: mensagem com `res.alteradas`, limpa a seleção, fecha o modal e chama
`router.refresh()` para a lista ser recarregada do servidor.

Dois detalhes que a leitura do código revela:

1. **O modal mostra `marcadas`, mas a action recebe `sel`.** `marcadas`
   (`:48–51`) é a interseção da seleção com `selecionaveis` — os não
   cancelados. Já `confirmar` envia `[...sel]` (`:66`), o conjunto bruto. Como
   o checkbox das canceladas é `disabled`, na prática os dois coincidem; e o
   servidor pula cancelada de qualquer forma (`diagnostico.ts:146`). A
   divergência existe no código, sem efeito prático hoje.
2. **Clicar no fundo escuro fecha o modal** (`:229`), e o `stopPropagation` no
   `CardContent` (`:233`) impede que um clique dentro dele feche. Fechar não
   perde a seleção — só o preview.

E o componente inteiro só é renderizado com `canEditar`
(`categorias-invertidas/page.tsx:37`) para o bloco de ação: sem
`despesas:editar`, os checkboxes e o painel de reclassificação não aparecem
(`:114`, `:163`, `:179`), mas a tabela continua legível.

### f) A action grava `logAudit` com valor anterior e novo, por item?

**Sim, por item, com de→para.** O `logAudit` está **dentro** do laço
(`diagnostico.ts:148–162`):

```ts
    const changes = diffAudit(d as unknown as Record<string, unknown>, {
      categoriaDre,
    });
    await db
      .update(schema.despesas)
      .set({ categoriaDre: categoriaDre as CategoriaDRE })
      .where(eq(schema.despesas.id, d.id));
    await logAudit({
      tenantId: ctx.tenant.id,
      userId: ctx.userId,
      action: "despesa.reclassificar",
      entity: "despesa",
      entityId: d.id,
      meta: { changes, origem: "diagnostico/categorias-invertidas", numDoc: d.numDoc },
    });
```

| Campo | Valor |
|---|---|
| `action` | `"despesa.reclassificar"` |
| `entity` | `"despesa"` |
| `entityId` | o id da despesa — **um por linha alterada** |
| `meta.changes` | `diffAudit(d, { categoriaDre })` → `{ categoriaDre: { de, para } }` |
| `meta.origem` | `"diagnostico/categorias-invertidas"` — identifica a tela |
| `meta.numDoc` | o PED da despesa |

`diffAudit` (inteira na seção 4) percorre as chaves do **patch** — aqui só
`categoriaDre` — e compara com o registro anterior. Como o laço já pulou o caso
`d.categoriaDre === categoriaDre` (`diagnostico.ts:147`), o diff **nunca sai
vazio** nesta action: cada linha de log tem uma mudança real. É a exceção entre
as três actions que gravam `changes` — `despesa.update`, `cliente.update` e
`tenant.fiscal` podem gravar `{}` (não têm essa guarda).

É também um dos poucos `meta` do sistema que carrega **as três coisas ao mesmo
tempo**: o de→para, o número do documento e a origem da alteração. Comparando
com `despesa.update`, que grava só `{ changes }` sem `numDoc`, uma linha de
`despesa.reclassificar` é legível no log sem consultar o banco.

Nada é logado quando a action **falha** na validação (`diagnostico.ts:122–128`)
nem para as despesas puladas — o log registra alteração, não tentativa.

### g) A coluna MOTIVO sai de onde?

**De um array montado no servidor, por regra — não é texto fixo da tela.**

A tela apenas junta o array com ` · ` (`diagnostico-categorias.tsx:208–210`):

```tsx
                    <TD className="text-[12px] text-[var(--color-ink3)]">
                      {r.motivos.join(" · ")}
                    </TD>
```

Quem preenche `motivos` é `getDespesasSuspeitas`, uma `push` por condição
satisfeita (`diagnostico.ts:71–82`). As **quatro** strings possíveis, todas
literais no servidor:

| String | Condição | Linha |
|---|---|---|
| `"categoria de receita em lançamento de despesa"` | categoria presente e credora | `diagnostico.ts:73` |
| `"sem categoria DRE"` | `categoria_dre` nula | `diagnostico.ts:75` |
| `"valor zero"` | `Number(valor) === 0` | `diagnostico.ts:76` |
| `"lançamento cancelado"` | `cancelado` **e** já havia outro motivo | `diagnostico.ts:81` |

Uma mesma despesa pode acumular motivos — uma cancelada, sem categoria e com
valor zero mostra `sem categoria DRE · valor zero · lançamento cancelado`. O
campo é declarado no tipo com o comentário que o define
(`diagnostico.ts:41–42`): *"Por que este lançamento está na lista."*

O motivo também governa a interface: `cancelada` é derivada dele
(`diagnostico-categorias.tsx:176`) —
`r.motivos.includes("lançamento cancelado")` — e é o que desabilita o checkbox
e exclui a linha de `selecionaveis` (`:44–47`). Ou seja, **a string do motivo é
usada como sinalizador de comportamento**, não só como texto; renomeá-la
quebraria a seleção em silêncio.

Na tela de planos o equivalente é a coluna **Observação**
(`planos-recebiveis/page.tsx:127–139`), montada de outro jeito: uma frase
construída no JSX quando `intervaloMeses > carencia` (`:128–133`) mais as
strings de `datasInvalidas`, estas sim geradas no servidor
(`diagnostico.ts:267–270`).

### h) Há filtro por projeto, competência ou fornecedor? Paginação?

**Nenhum filtro nessas três dimensões, em nenhuma das duas telas. E nenhuma
paginação.**

| Tela | `searchParams` | Filtros | Paginação | `LIMIT` na consulta |
|---|---|---|---|---|
| Categorias invertidas | **nenhum** — a função não recebe parâmetro (`categorias-invertidas/page.tsx:20`) | nenhum | não | **não** (`diagnostico.ts:56–67`) |
| Planos de recebíveis | `{ carencia?: string }` (`planos-recebiveis/page.tsx:26–30`) | só a **carência** | não | **não** (`diagnostico.ts:202–212`) |

O único controle de qualquer natureza é a carência da tela de planos, e ela é
um filtro de **regra**, não de escopo — muda o limiar que define o que é
divergente. São cinco valores fixos em links (`planos-recebiveis/page.tsx:63`):
1, 2, 3, 6 e 12; qualquer outro valor cai no default 1
(`planos-recebiveis/page.tsx:36`).

O que existe no lugar de filtro:

- **Ordenação fixa.** Categorias: maior valor primeiro
  (`diagnostico.ts:100`). Planos: maior intervalo primeiro
  (`diagnostico.ts:292`).
- **Rolagem com cabeçalho fixo.** `max-h-[70vh]` + `sticky top-0` nas duas
  (`diagnostico-categorias.tsx:160–161`, `planos-recebiveis/page.tsx:88–89`).
- **Busca do navegador.** Como tudo é renderizado de uma vez, `Ctrl+F`
  funciona sobre a lista inteira.
- **Link de saída.** Cada linha da tela de categorias tem "Abrir", que leva ao
  lançamento já com o projeto e o id na URL
  (`diagnostico-categorias.tsx:213`):
  `/despesas?proj=${r.projectId}&tab=lancamentos&edit=${r.id}`.

Consequência de não haver `LIMIT`: as duas telas carregam **todas** as linhas
que satisfazem as condições, e a de categorias **lê todas as despesas do
tenant** do banco antes de filtrar em memória (item (a)). Em um tenant com
muitas despesas, é a tabela inteira trafegando a cada visita.

A tela de planos tem um recorte adicional na própria consulta, que não é
filtro de usuário: só versões `kind = "atual"` (`diagnostico.ts:211`) e só
unidades com `status === "Vendido"` (`diagnostico.ts:216`).

### i) As telas verificam permissão? Qual chave? `screenIdOfPath` devolve o quê?

**Verificam, cada uma com a chave de outro módulo — e o enforcement central
não as cobre.**

| Camada | Categorias invertidas | Planos de recebíveis |
|---|---|---|
| Enforcement central (`layout.tsx:92–95`) | **não cobre** | **não cobre** |
| Página | `can(ctx.perms, "despesas", "ver")` → `<AccessDenied />` (`:23`) | `can(ctx.perms, "unidades", "ver")` → `<AccessDenied />` (`:33`) |
| Consulta | `can(ctx.perms, "despesas", "ver")` → `[]` (`diagnostico.ts:54`) | `can(ctx.perms, "unidades", "ver")` → `[]` (`diagnostico.ts:200`) |
| Bloco de edição | `can(ctx.perms, "despesas", "editar")` (`:37`) | — (somente leitura) |
| Action de escrita | `can(ctx.perms, "despesas", "editar")` (`diagnostico.ts:122`) | — |
| Menu lateral | `perm: "despesas"` (`sidebar.tsx:139`) | `perm: "unidades"` (`sidebar.tsx:144`) |

**`screenIdOfPath` devolve `null`.** A função pega o **primeiro segmento** da
rota (`permissions.ts:137–142`):

```ts
/** Primeiro segmento da rota → id de tela (ou null se não governada). */
export function screenIdOfPath(pathname: string | null | undefined): string | null {
  if (!pathname) return null;
  const seg = pathname.replace(/^\//, "").split("/")[0];
  return SCREEN_IDS.includes(seg) ? seg : null;
}
```

Para `/diagnostico/categorias-invertidas`, `seg` é `"diagnostico"` — e
`"diagnostico"` **não está em `SCREENS`**. Grep de `diagnostico` em
`permissions.ts` devolve uma única linha, e é outra tela:
`{ id: "diagnosticoia", … }` (`permissions.ts:73`). Logo
`SCREEN_IDS.includes("diagnostico")` é `false` e a função devolve `null`.

O efeito em `layout.tsx:95` é direto:

```tsx
  const denied = screenId ? !can(ctx.perms, screenId, "ver") : false;
```

Com `screenId` nulo, `denied` é `false` — **a rota passa pelo layout sem
nenhuma verificação**. Quem barra é exclusivamente o `can()` que cada página
faz por conta própria (`:23` e `:33`). As duas telas estão protegidas, mas por
código próprio, não pelo mecanismo central.

O mesmo vale para a listagem: como não há id de tela, as duas **não aparecem na
matriz de `/acessos`** (que itera `SCREENS`) — não há caixa para conceder ou
revogar acesso a elas isoladamente. Elas herdam as permissões de Despesas e de
Unidades.

O comentário do `NavItem` na sidebar registra que isso é deliberado
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

Note a assimetria de rigor entre as duas telas de categorias: a **página**
checa `despesas:ver` e a **action de leitura** checa de novo. Já a tela de
planos checa `unidades:ver` nas duas camadas. Nenhuma das duas checa `criar` ou
`excluir` — coerente com o que fazem.

### j) Há `tenant_id` no `where` de cada consulta e do update?

**Sim, nas quatro operações.**

| Operação | Arquivo:linha | `where` | Filtra? |
|---|---|---|---|
| `SELECT` das despesas suspeitas | `diagnostico.ts:67` | `eq(schema.despesas.tenantId, ctx.tenant.id)` | ✅ |
| `SELECT` dos planos | `diagnostico.ts:210–212` | `and(eq(units.tenantId, ctx.tenant.id), eq(versions.kind, "atual"))` | ✅ |
| `SELECT` prévio da reclassificação | `diagnostico.ts:133–138` | `and(eq(despesas.tenantId, …), inArray(despesas.id, alvos))` | ✅ |
| **`UPDATE`** da reclassificação | `diagnostico.ts:154` | `eq(schema.despesas.id, d.id)` | ❌ — **só o id** |

O `UPDATE` é o único sem `tenantId` no `where`:

```ts
    await db
      .update(schema.despesas)
      .set({ categoriaDre: categoriaDre as CategoriaDRE })
      .where(eq(schema.despesas.id, d.id));
```

Na prática **não há brecha**, porque `d` vem do `SELECT` da linha 130, que já
filtrou por tenant: o laço só itera linhas que pertencem ao tenant ativo. O
filtro é aplicado uma vez, na leitura, e o `UPDATE` opera sobre o resultado.
É o mesmo padrão de `resetMemberPassword` em `/usuarios` — checagem prévia,
`where` por id — e o oposto de `updateDespesa`, que também filtra só por id no
update mas faz o `select` prévio com tenant (`despesas.ts:605–611`, `:651`).

`ctx.tenant.id` vem de `getActiveContext`, resolvido pela sessão → usuário →
membership. Nenhuma das três funções aceita `tenantId` por parâmetro:
`getDespesasSuspeitas()` não recebe nada, `getPlanosSuspeitos(carencia)` recebe
só o número, e `reclassificarDespesas(ids, categoriaDre)` recebe ids e a
categoria — todos validados contra o tenant antes de qualquer escrita.

### k) A Conferência de planos procura o quê exatamente?

**Duas coisas, testadas independentemente**, sobre um universo restrito.

**O universo** (`diagnostico.ts:202–216`): unidades do tenant, na versão
`kind = "atual"`, com `status === "Vendido"` e `paymentPlan` não nulo. Tudo o
mais é descartado antes de qualquer teste.

**Condição 1 — carência maior que a esperada** (`diagnostico.ts:226–244`,
`:274`):

```ts
    // Data-base: o primeiro bloco de entrada preenchido (Ato, depois Sinais).
    const basesPossiveis: [string, string][] = [
      ["AS", "Ato"],
      ["S1", "Sinal 1"],
      ["S2", "Sinal 2"],
      ["S3", "Sinal 3"],
    ];
    let dataBase: string | null = null;
    let labelBase = "";
    for (const [k, label] of basesPossiveis) {
      if (venc(k) && val(k) > 0) {
        dataBase = venc(k);
        labelBase = label;
        break;
      }
    }
    const primeira = venc("Mensais") && val("Mensais") > 0 ? venc("Mensais") : null;

    const meses = dataBase && primeira ? intervaloMeses(dataBase, primeira) : 0;
```

A **data-base** é o primeiro bloco de entrada que tenha vencimento **e** valor
maior que zero, na ordem fixa `AS` (Ato) → `S1` → `S2` → `S3`
(`diagnostico.ts:227–241`). A **primeira parcela** é o vencimento do bloco
`Mensais`, e só quando `val("Mensais") > 0` (`:242`). O intervalo é
`intervaloMeses(dataBase, primeira)` (`:244`), que conta meses de calendário
ignorando o dia (`carencia.ts:101–106`).

O teste (`diagnostico.ts:274`):

```ts
    const forcaCarencia = dataBase && primeira && meses > carenciaEsperadaMeses;
```

`carenciaEsperadaMeses` é o parâmetro da função, default **1**
(`diagnostico.ts:197`), sobreposto pela URL na tela (`planos-recebiveis/page.tsx:36`).

**Condição 2 — dia de vencimento que não existe em algum mês da série**
(`diagnostico.ts:246–272`):

```ts
    // Dia de vencimento inexistente em algum mês da série periódica.
    const datasInvalidas: string[] = [];
    for (const [k, label, passo] of [
      ["Mensais", "Mensal", 1],
      ["Semestrais", "Semestral", 6],
      ["Anuais", "Anual", 12],
    ] as [string, string, number][]) {
      const base = venc(k);
      if (!base || val(k) <= 0) continue;
      const partes = base.split("/");
      if (partes.length !== 3) continue;
      const dia = Number(partes[1]);
      if (dia <= 28) continue; // 1..28 existe em todo mês
      const mo = Number(partes[0]);
      const yr = Number(partes[2]);
      for (let i = 0; i < qtd(k); i++) {
        const total = mo - 1 + i * passo;
        const m = (total % 12) + 1;
        const y = yr + Math.floor(total / 12);
        const ultimoDia = new Date(Date.UTC(y, m, 0)).getUTCDate();
        if (dia > ultimoDia) {
          datasInvalidas.push(
            `${label} #${i + 1}: dia ${dia} não existe em ${String(m).padStart(2, "0")}/${y}`,
          );
        }
      }
    }
```

Percorre **três** blocos periódicos, com seus passos: `Mensais` (1 mês),
`Semestrais` (6) e `Anuais` (12). Para cada um:

- pula se não houver vencimento ou se o valor for ≤ 0 (`:254`);
- pula se o dia for **≤ 28** (`:258`) — *"1..28 existe em todo mês"*;
- para cada uma das `qtd(k)` parcelas, calcula mês/ano e compara o dia com o
  último dia daquele mês, via `new Date(Date.UTC(y, m, 0)).getUTCDate()`
  (`:265`);
- acumula uma string por ocorrência, no formato
  `"Mensal #3: dia 31 não existe em 04/2026"` (`:267–270`).

**A linha entra na lista se qualquer uma das duas for verdadeira**
(`diagnostico.ts:275`):

```ts
    if (!forcaCarencia && datasInvalidas.length === 0) continue;
```

Só as **6 primeiras** datas inválidas são levadas à tela
(`diagnostico.ts:289`), com o comentário explicando: *"Um plano pode ter
dezenas de parcelas; mostrar as primeiras já basta"*. Ordenação: maior
intervalo primeiro (`:292`).

**O que ela NÃO faz:** nada é alterado. O docstring
(`diagnostico.ts:194`) e a própria tela (`planos-recebiveis/page.tsx:49–53`)
afirmam a mesma coisa — *"Nenhuma data de recebível contratado é alterada
aqui"*, *"corrigir um plano é decisão comercial, feita na tela da unidade, com
o contrato à vista"*. Não há action de escrita associada a esta tela: o arquivo
`diagnostico.ts` tem uma única função que escreve, `reclassificarDespesas`, e
ela é da outra tela.

Vale registrar duas limitações visíveis no código:

1. **Blocos periódicos não entram na escolha da data-base.** Se um plano não
   tiver Ato nem Sinais preenchidos, `dataBase` fica `null` e a condição 1
   nunca dispara — a unidade só aparece se cair na condição 2.
2. **`Semestrais` e `Anuais` não são testados quanto à carência** — só
   `Mensais` vira `primeira` (`:242`). Um plano cuja primeira semestral esteja
   longe da data-base não é apontado por esse critério.
