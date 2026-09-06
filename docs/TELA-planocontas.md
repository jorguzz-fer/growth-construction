# TELA-planocontas — código na íntegra

Coleta do código que compõe a tela **Plano de Contas** (`/planocontas`), em
`main` (commit `45f4ce3`). Sem resumo, sem análise.

**Árvore de dependências da tela:**

```
planocontas/page.tsx
├── components/app/page-header.tsx
├── components/app/planocontas-manager.tsx
│   (não importa nenhum outro componente de components/app/)
└── components/ui/card.tsx            (primitivo genérico)

query chamada pela página:  getChartAccounts
server actions disparadas:  addChartGroup        (actions/planocontas.ts)
                            addChartItem         (actions/planocontas.ts)
                            updateChartItem      (actions/planocontas.ts)
                            setChartAccountAtivo (actions/planocontas.ts)
                            deleteChartItem      (actions/planocontas.ts)
                            renameChartGroup     (actions/planocontas.ts)
                            deleteChartGroup     (actions/planocontas.ts)
```

Sobre o recorte, para não ficar implícito:

- Nas duas coletas anteriores (`TELA-projeto`, `TELA-budget`) os primitivos de
  `components/ui/` ficaram de fora. Aqui o pedido não trouxe essa exclusão,
  então os três que esta tela usa — `card`, `button` e `input` — vão na
  **seção 2b**, separados dos componentes de `components/app/`.
- Ficam de fora `@/lib/context`, `@/lib/permissions` e as bibliotecas `react`
  e `drizzle-orm`.
- `src/lib/natureza-grupo.ts` vai na seção 5 por pedido explícito. Registro o
  fato: **esta tela não o alcança**. `getChartAccounts` não o chama; quem usa
  `naturezaDoGrupo` é `getBudgetPlanning` (`src/lib/queries.ts`, linha 838),
  que alimenta as telas de Budget e Forecast.

---

## 1. Página

### `src/app/(app)/planocontas/page.tsx`

```tsx
import { getActiveContext } from "@/lib/context";
import { getChartAccounts, type ChartAccountRow } from "@/lib/queries";
import { can } from "@/lib/permissions";
import { PageHeader } from "@/components/app/page-header";
import { Card, CardContent } from "@/components/ui/card";
import { PlanoContasManager } from "@/components/app/planocontas-manager";

export const dynamic = "force-dynamic";

type Kind = "cef" | "complementar";
type Natureza = "receita" | "despesa";
interface Group {
  code: string;
  name: string;
  kind: Kind;
  items: { id: string; code: string; name: string; natureza: Natureza; ativo: boolean }[];
}

function groupBy(rows: ChartAccountRow[], kind: Kind): Group[] {
  const map = new Map<string, Group>();
  for (const r of rows.filter((x) => x.kind === kind)) {
    if (!map.has(r.groupCode)) {
      map.set(r.groupCode, { code: r.groupCode, name: r.groupName, kind, items: [] });
    }
    map.get(r.groupCode)!.items.push({
      id: r.id,
      code: r.code,
      name: r.name,
      natureza: (r.natureza === "receita" ? "receita" : "despesa") as Natureza,
      ativo: r.ativo ?? true,
    });
  }
  const groups = [...map.values()];
  for (const g of groups) {
    g.items.sort((a, b) => a.code.localeCompare(b.code, undefined, { numeric: true }));
  }
  return groups.sort((a, b) =>
    a.code.localeCompare(b.code, undefined, { numeric: true }),
  );
}

/** Categorias DRE — relatório fixo (não editável). */
const DRE_CATS = [
  { name: "Receita", desc: "Vendas de unidades, reembolsos, permuta", icon: "📈", color: "var(--color-success)" },
  { name: "Custo Variável", desc: "Medição de obra do mês (engenheiro), mão de obra direta", icon: "📊", color: "var(--color-danger)" },
  { name: "Custo Fixo", desc: "Administração local, aluguel canteiro", icon: "➖", color: "var(--color-ink3)" },
  { name: "Despesa Variável", desc: "Comissões, marketing proporcional", icon: "📉", color: "#f59e0b" },
  { name: "Despesa Fixa", desc: "Escritório, contabilidade, tecnologia", icon: "➖", color: "#f59e0b" },
  { name: "Retiradas", desc: "Pró-labore, distribuição de lucros", icon: "💰", color: "var(--color-accent)" },
  { name: "Investimento", desc: "Compra de terreno, equipamentos permanentes", icon: "🏢", color: "#3b82f6" },
  { name: "Empréstimos", desc: "Captação e amortização de empréstimos", icon: "🏦", color: "#0ea5e9" },
];

export default async function PlanoContasPage() {
  const ctx = await getActiveContext();
  if (!ctx) return null;
  const rows = await getChartAccounts(ctx.tenant.id);
  const cef = groupBy(rows, "cef");
  const comp = groupBy(rows, "complementar");
  const perms = {
    criar: can(ctx.perms, "planocontas", "criar"),
    editar: can(ctx.perms, "planocontas", "editar"),
    excluir: can(ctx.perms, "planocontas", "excluir"),
  };

  return (
    <>
      <PageHeader
        title="Plano de Contas"
        subtitle="Dupla classificação: Grupo CEF/Obra + Categoria DRE"
      />

      <div className="grid gap-6 lg:grid-cols-[1fr_340px]">
        <PlanoContasManager cef={cef} comp={comp} perms={perms} />

        <aside>
          <Card>
            <CardContent className="p-5">
              <h2 className="mb-4 text-sm font-semibold text-[var(--color-ink)]">
                Categorias DRE
              </h2>
              <div className="space-y-3">
                {DRE_CATS.map((c, i) => (
                  <div
                    key={c.name}
                    className={`flex items-start gap-3 ${
                      i < DRE_CATS.length - 1
                        ? "border-b border-[var(--color-accent2)]/10 pb-3"
                        : ""
                    }`}
                  >
                    <span
                      aria-hidden
                      className="mt-0.5 text-[15px]"
                      style={{ color: c.color }}
                    >
                      {c.icon}
                    </span>
                    <div>
                      <div className="text-[13px] font-semibold text-[var(--color-ink)]">
                        {c.name}
                      </div>
                      <div className="text-[12px] leading-snug text-[var(--color-ink3)]">
                        {c.desc}
                      </div>
                    </div>
                  </div>
                ))}
              </div>
              <p className="mt-4 rounded-[8px] bg-[var(--color-surface2)] px-3 py-2 text-[11px] leading-relaxed text-[var(--color-ink3)]">
                ⓘ As categorias DRE são fixas (estrutura do relatório) e não são
                editáveis. A edição de inserir/editar/excluir vale para os grupos e
                subitens CEF / complementares.
              </p>
            </CardContent>
          </Card>
        </aside>
      </div>
    </>
  );
}
```

---

## 2. Componentes de `components/app/`

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

### `src/components/app/planocontas-manager.tsx`

```tsx
"use client";

import { useState, useTransition } from "react";
import {
  addChartGroup,
  addChartItem,
  deleteChartGroup,
  deleteChartItem,
  renameChartGroup,
  setChartAccountAtivo,
  updateChartItem,
} from "@/lib/actions/planocontas";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input, Select } from "@/components/ui/input";

type Kind = "cef" | "complementar";
type Natureza = "receita" | "despesa";
interface Item {
  id: string;
  code: string;
  name: string;
  natureza: Natureza;
  ativo: boolean;
}
interface Group {
  code: string;
  name: string;
  kind: Kind;
  items: Item[];
}
export interface PlanoPerms {
  criar: boolean;
  editar: boolean;
  excluir: boolean;
}

export function PlanoContasManager({
  cef,
  comp,
  perms,
}: {
  cef: Group[];
  comp: Group[];
  perms: PlanoPerms;
}) {
  return (
    <div className="space-y-8">
      <GroupSection title="Grupos CEF / Obra" kind="cef" groups={cef} perms={perms} />
      <GroupSection
        title="Grupos Complementares"
        kind="complementar"
        groups={comp}
        perms={perms}
      />
    </div>
  );
}

function GroupSection({
  title,
  kind,
  groups,
  perms,
}: {
  title: string;
  kind: Kind;
  groups: Group[];
  perms: PlanoPerms;
}) {
  return (
    <section>
      <h2 className="mb-3 text-sm font-semibold text-[var(--color-ink)]">{title}</h2>
      <div className="space-y-3">
        {groups.map((g) => (
          <GroupCard key={`${g.kind}-${g.code}`} group={g} perms={perms} />
        ))}
        {groups.length === 0 && (
          <p className="text-[13px] text-[var(--color-ink4)]">Nenhum grupo ainda.</p>
        )}
      </div>
      {perms.criar && <NewGroupForm kind={kind} />}
    </section>
  );
}

function GroupCard({ group, perms }: { group: Group; perms: PlanoPerms }) {
  const [open, setOpen] = useState(false);
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [groupName, setGroupName] = useState(group.name);
  const [groupCode, setGroupCode] = useState(group.code);
  const canManage = perms.criar || perms.editar || perms.excluir;

  const run = (fn: () => Promise<void>) => {
    setError(null);
    start(async () => {
      try {
        await fn();
      } catch (e) {
        setError(e instanceof Error ? e.message : "Erro.");
      }
    });
  };

  return (
    <Card>
      <CardContent className="p-4">
        <div className="mb-2 flex items-center gap-2">
          <span className="flex h-6 min-w-6 items-center justify-center rounded-[6px] bg-[var(--color-accent4)] px-1.5 font-[family-name:var(--font-mono)] text-[11px] font-semibold text-[var(--color-accent)]">
            {group.code}
          </span>
          <span className="flex-1 text-sm font-semibold text-[var(--color-ink)]">
            {group.name}
          </span>
          {canManage && (
            <button
              onClick={() => setOpen((o) => !o)}
              className="text-[11px] text-[var(--color-accent2)] hover:underline"
            >
              {open ? "Fechar" : "Editar"}
            </button>
          )}
        </div>

        {!open ? (
          <div className="flex flex-wrap gap-2">
            {group.items.map((it) => (
              <span
                key={it.id}
                className="rounded-[8px] bg-[var(--color-surface3)] px-2.5 py-1 font-[family-name:var(--font-mono)] text-[12px] text-[var(--color-ink2)]"
              >
                {it.code} {it.name}
              </span>
            ))}
            {group.items.length === 0 && (
              <span className="text-[12px] text-[var(--color-ink4)]">Sem subitens.</span>
            )}
          </div>
        ) : (
          <div className="space-y-3">
            {/* Editar / excluir o grupo */}
            {(perms.editar || perms.excluir) && (
              <div className="flex flex-wrap items-end gap-2 rounded-[8px] bg-[var(--color-surface2)] p-2.5">
                <div className="w-20">
                  <label className="text-[10px] text-[var(--color-ink3)]">Código</label>
                  <Input
                    value={groupCode}
                    onChange={(e) => setGroupCode(e.target.value)}
                    disabled={!perms.editar || pending}
                    className="h-8 text-xs"
                  />
                </div>
                <div className="flex-1">
                  <label className="text-[10px] text-[var(--color-ink3)]">Nome do grupo</label>
                  <Input
                    value={groupName}
                    onChange={(e) => setGroupName(e.target.value)}
                    disabled={!perms.editar || pending}
                    className="h-8 text-xs"
                  />
                </div>
                {perms.editar && (
                  <Button
                    size="sm"
                    disabled={pending}
                    onClick={() =>
                      run(() =>
                        renameChartGroup({
                          kind: group.kind,
                          groupCode: group.code,
                          groupName,
                          newGroupCode: groupCode,
                        }),
                      )
                    }
                  >
                    Salvar
                  </Button>
                )}
                {perms.excluir && (
                  <button
                    disabled={pending}
                    onClick={() => {
                      if (
                        window.confirm(
                          `Excluir o grupo "${group.code} ${group.name}" e todos os seus subitens?`,
                        )
                      )
                        run(() =>
                          deleteChartGroup({ kind: group.kind, groupCode: group.code }),
                        );
                    }}
                    className="text-xs text-[var(--color-danger)] hover:underline disabled:opacity-50"
                  >
                    Excluir grupo
                  </button>
                )}
              </div>
            )}

            {/* Subitens editáveis */}
            <div className="space-y-1.5">
              {group.items.map((it) => (
                <ItemRow key={it.id} item={it} perms={perms} />
              ))}
            </div>

            {/* Novo subitem */}
            {perms.criar && <NewItemRow group={group} />}
          </div>
        )}

        {error && <p className="mt-2 text-xs text-[var(--color-danger)]">{error}</p>}
      </CardContent>
    </Card>
  );
}

function ItemRow({ item, perms }: { item: Item; perms: PlanoPerms }) {
  const [code, setCode] = useState(item.code);
  const [name, setName] = useState(item.name);
  const [natureza, setNatureza] = useState<Natureza>(item.natureza);
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const dirty = code !== item.code || name !== item.name || natureza !== item.natureza;

  const run = (fn: () => Promise<void>) => {
    setError(null);
    start(async () => {
      try {
        await fn();
      } catch (e) {
        setError(e instanceof Error ? e.message : "Erro.");
      }
    });
  };

  return (
    <div className={`flex flex-wrap items-center gap-2 ${item.ativo ? "" : "opacity-55"}`}>
      <Input
        value={code}
        onChange={(e) => setCode(e.target.value)}
        disabled={!perms.editar || pending}
        className="h-8 w-20 font-[family-name:var(--font-mono)] text-xs"
      />
      <Input
        value={name}
        onChange={(e) => setName(e.target.value)}
        disabled={!perms.editar || pending}
        className="h-8 flex-1 text-xs"
      />
      <Select
        value={natureza}
        onChange={(e) => setNatureza(e.target.value as Natureza)}
        disabled={!perms.editar || pending}
        className="h-8 w-28 text-xs"
        title="Natureza da conta (bloco Receitas/Despesas no planejamento)"
      >
        <option value="despesa">Despesa</option>
        <option value="receita">Receita</option>
      </Select>
      {!item.ativo && (
        <span className="rounded-full bg-[var(--color-ink4)]/15 px-2 py-0.5 text-[10px] text-[var(--color-ink3)]">
          inativa
        </span>
      )}
      {perms.editar && (
        <Button
          size="sm"
          variant="outline"
          disabled={pending || !dirty}
          onClick={() => run(() => updateChartItem(item.id, { code, name, natureza }))}
        >
          Salvar
        </Button>
      )}
      {perms.editar && (
        <button
          disabled={pending}
          onClick={() => run(() => setChartAccountAtivo(item.id, !item.ativo))}
          className="px-1.5 text-[11px] text-[var(--color-accent2)] hover:underline disabled:opacity-50"
          title={item.ativo ? "Inativar (some de novos lançamentos)" : "Reativar"}
        >
          {item.ativo ? "Inativar" : "Reativar"}
        </button>
      )}
      {perms.excluir && (
        <button
          disabled={pending}
          onClick={() => run(() => deleteChartItem(item.id))}
          className="px-1 text-[var(--color-danger)] hover:opacity-70 disabled:opacity-50"
          title="Excluir subitem"
        >
          ×
        </button>
      )}
      {error && <span className="text-xs text-[var(--color-danger)]">{error}</span>}
    </div>
  );
}

function NewItemRow({ group }: { group: Group }) {
  const [code, setCode] = useState("");
  const [name, setName] = useState("");
  const [natureza, setNatureza] = useState<Natureza>("despesa");
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);

  const add = () => {
    setError(null);
    start(async () => {
      try {
        await addChartItem({
          kind: group.kind,
          groupCode: group.code,
          groupName: group.name,
          code,
          name,
          natureza,
        });
        setCode("");
        setName("");
      } catch (e) {
        setError(e instanceof Error ? e.message : "Erro.");
      }
    });
  };

  return (
    <div className="flex flex-wrap items-center gap-2 border-t border-[var(--color-accent2)]/8 pt-2">
      <Input
        value={code}
        onChange={(e) => setCode(e.target.value)}
        placeholder="1.11"
        disabled={pending}
        className="h-8 w-20 font-[family-name:var(--font-mono)] text-xs"
      />
      <Input
        value={name}
        onChange={(e) => setName(e.target.value)}
        placeholder="Novo subitem"
        disabled={pending}
        className="h-8 flex-1 text-xs"
      />
      <Select
        value={natureza}
        onChange={(e) => setNatureza(e.target.value as Natureza)}
        disabled={pending}
        className="h-8 w-28 text-xs"
      >
        <option value="despesa">Despesa</option>
        <option value="receita">Receita</option>
      </Select>
      <Button size="sm" disabled={pending || !code.trim() || !name.trim()} onClick={add}>
        Adicionar
      </Button>
      {error && <span className="text-xs text-[var(--color-danger)]">{error}</span>}
    </div>
  );
}

function NewGroupForm({ kind }: { kind: Kind }) {
  const [open, setOpen] = useState(false);
  const [groupCode, setGroupCode] = useState("");
  const [groupName, setGroupName] = useState("");
  const [code, setCode] = useState("");
  const [name, setName] = useState("");
  const [natureza, setNatureza] = useState<Natureza>("despesa");
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);

  const create = () => {
    setError(null);
    start(async () => {
      try {
        await addChartGroup({ kind, groupCode, groupName, code, name, natureza });
        setGroupCode("");
        setGroupName("");
        setCode("");
        setName("");
        setOpen(false);
      } catch (e) {
        setError(e instanceof Error ? e.message : "Erro.");
      }
    });
  };

  if (!open) {
    return (
      <button
        onClick={() => setOpen(true)}
        className="mt-3 flex w-full items-center justify-center gap-1.5 rounded-[10px] border border-dashed border-[var(--color-accent2)]/25 px-3 py-2 text-[12px] text-[var(--color-ink3)] transition-colors hover:border-[var(--color-accent2)]/50 hover:text-[var(--color-ink)]"
      >
        + Novo grupo
      </button>
    );
  }

  return (
    <Card className="mt-3">
      <CardContent className="space-y-2 p-4">
        <h3 className="text-[13px] font-semibold text-[var(--color-ink)]">Novo grupo</h3>
        <div className="flex flex-wrap items-end gap-2">
          <div className="w-24">
            <label className="text-[10px] text-[var(--color-ink3)]">Código grupo</label>
            <Input
              value={groupCode}
              onChange={(e) => setGroupCode(e.target.value)}
              placeholder="11"
              className="h-8 text-xs"
            />
          </div>
          <div className="min-w-[180px] flex-1">
            <label className="text-[10px] text-[var(--color-ink3)]">Nome do grupo</label>
            <Input
              value={groupName}
              onChange={(e) => setGroupName(e.target.value)}
              placeholder="Instalações"
              className="h-8 text-xs"
            />
          </div>
        </div>
        <div className="flex flex-wrap items-end gap-2">
          <div className="w-24">
            <label className="text-[10px] text-[var(--color-ink3)]">1º subitem</label>
            <Input
              value={code}
              onChange={(e) => setCode(e.target.value)}
              placeholder="11.1"
              className="h-8 font-[family-name:var(--font-mono)] text-xs"
            />
          </div>
          <div className="min-w-[180px] flex-1">
            <label className="text-[10px] text-[var(--color-ink3)]">Nome do subitem</label>
            <Input
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Descrição"
              className="h-8 text-xs"
            />
          </div>
          <div className="w-32">
            <label className="text-[10px] text-[var(--color-ink3)]">Natureza</label>
            <Select
              value={natureza}
              onChange={(e) => setNatureza(e.target.value as Natureza)}
              className="h-8 text-xs"
            >
              <option value="despesa">Despesa</option>
              <option value="receita">Receita</option>
            </Select>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <Button
            size="sm"
            disabled={pending || !groupCode.trim() || !groupName.trim() || !code.trim() || !name.trim()}
            onClick={create}
          >
            Criar grupo
          </Button>
          <button
            onClick={() => setOpen(false)}
            disabled={pending}
            className="text-xs text-[var(--color-ink3)] hover:underline"
          >
            Cancelar
          </button>
          {error && <span className="text-xs text-[var(--color-danger)]">{error}</span>}
        </div>
      </CardContent>
    </Card>
  );
}
```

---

## 2b. Primitivos de `components/ui/` usados por esta tela

`card` é importado pela própria página; `card`, `button` e `input` são
importados por `planocontas-manager.tsx`.

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

## 3. Funções de `src/lib/queries.ts` chamadas pela página

A página chama uma só: `getChartAccounts`. O tipo `ChartAccountRow`, também
importado pela página, é declarado 40 linhas acima, junto dos demais tipos de
linha do arquivo — por isso vem em bloco separado.

### `src/lib/queries.ts` · linhas 188–188

Declaração do tipo `ChartAccountRow`.

```ts
export type BankAccountRow = typeof schema.bankAccounts.$inferSelect;
```

### `src/lib/queries.ts` · linhas 229–236

```ts
export async function getChartAccounts(
  tenantId: string,
): Promise<ChartAccountRow[]> {
  return db
    .select()
    .from(schema.chartAccounts)
    .where(eq(schema.chartAccounts.tenantId, tenantId));
}
```

---

## 4. Server Actions disparadas pela tela

As sete actions exportadas por `src/lib/actions/planocontas.ts` são todas
usadas por `planocontas-manager.tsx`. O arquivo vai inteiro.

### `src/lib/actions/planocontas.ts`

```ts
"use server";

import { and, eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { db, schema } from "@/lib/db";
import { getActiveContext } from "@/lib/context";
import { can } from "@/lib/permissions";
import { logAudit } from "@/lib/audit";

type Kind = "cef" | "complementar";
type Natureza = "receita" | "despesa";

function normKind(v: unknown): Kind {
  return v === "complementar" ? "complementar" : "cef";
}
function normNatureza(v: unknown): Natureza {
  return v === "receita" ? "receita" : "despesa";
}

async function codeExists(tenantId: string, code: string): Promise<boolean> {
  const [row] = await db
    .select({ id: schema.chartAccounts.id })
    .from(schema.chartAccounts)
    .where(
      and(
        eq(schema.chartAccounts.tenantId, tenantId),
        eq(schema.chartAccounts.code, code),
      ),
    )
    .limit(1);
  return Boolean(row);
}

/** Cria um novo grupo do plano de contas com o seu primeiro subitem. */
export async function addChartGroup(input: {
  kind: string;
  groupCode: string;
  groupName: string;
  code: string;
  name: string;
  natureza?: string;
}) {
  const ctx = await getActiveContext();
  if (!ctx || !can(ctx.perms, "planocontas", "criar")) {
    throw new Error("Sem permissão para criar grupos.");
  }
  const kind = normKind(input.kind);
  const natureza = normNatureza(input.natureza);
  const groupCode = input.groupCode.trim();
  const groupName = input.groupName.trim();
  const code = input.code.trim();
  const name = input.name.trim();
  if (!groupCode || !groupName || !code || !name) {
    throw new Error("Informe o grupo e o primeiro subitem.");
  }
  if (await codeExists(ctx.tenant.id, code)) {
    throw new Error(`O código "${code}" já existe.`);
  }
  await db.insert(schema.chartAccounts).values({
    tenantId: ctx.tenant.id,
    code,
    name,
    groupCode,
    groupName,
    kind,
    natureza,
  });
  await logAudit({
    tenantId: ctx.tenant.id,
    userId: ctx.userId,
    action: "chart.group.create",
    entity: "chart_account",
    meta: { groupCode, groupName, kind, natureza },
  });
  revalidatePath("/planocontas");
}

/** Adiciona um subitem a um grupo existente. */
export async function addChartItem(input: {
  kind: string;
  groupCode: string;
  groupName: string;
  code: string;
  name: string;
  natureza?: string;
}) {
  const ctx = await getActiveContext();
  if (!ctx || !can(ctx.perms, "planocontas", "criar")) {
    throw new Error("Sem permissão para criar subitens.");
  }
  const kind = normKind(input.kind);
  const natureza = normNatureza(input.natureza);
  const code = input.code.trim();
  const name = input.name.trim();
  if (!code || !name) throw new Error("Informe o código e o nome do subitem.");
  if (await codeExists(ctx.tenant.id, code)) {
    throw new Error(`O código "${code}" já existe.`);
  }
  await db.insert(schema.chartAccounts).values({
    tenantId: ctx.tenant.id,
    code,
    name,
    groupCode: input.groupCode.trim(),
    groupName: input.groupName.trim(),
    kind,
    natureza,
  });
  await logAudit({
    tenantId: ctx.tenant.id,
    userId: ctx.userId,
    action: "chart.item.create",
    entity: "chart_account",
    meta: { code, name },
  });
  revalidatePath("/planocontas");
}

/** Edita o código/nome de um subitem. */
export async function updateChartItem(
  id: string,
  patch: { code?: string; name?: string; natureza?: string },
) {
  const ctx = await getActiveContext();
  if (!ctx || !can(ctx.perms, "planocontas", "editar")) return;
  const [current] = await db
    .select()
    .from(schema.chartAccounts)
    .where(
      and(
        eq(schema.chartAccounts.id, id),
        eq(schema.chartAccounts.tenantId, ctx.tenant.id),
      ),
    )
    .limit(1);
  if (!current) return;
  const set: { code?: string; name?: string; natureza?: Natureza } = {};
  if (patch.code && patch.code.trim() && patch.code.trim() !== current.code) {
    if (await codeExists(ctx.tenant.id, patch.code.trim())) {
      throw new Error(`O código "${patch.code.trim()}" já existe.`);
    }
    set.code = patch.code.trim();
  }
  if (patch.name && patch.name.trim()) set.name = patch.name.trim();
  if (patch.natureza !== undefined) set.natureza = normNatureza(patch.natureza);
  if (Object.keys(set).length === 0) return;
  await db
    .update(schema.chartAccounts)
    .set(set)
    .where(eq(schema.chartAccounts.id, id));
  await logAudit({
    tenantId: ctx.tenant.id,
    userId: ctx.userId,
    action: "chart.item.update",
    entity: "chart_account",
    entityId: id,
    meta: set,
  });
  revalidatePath("/planocontas");
}

/** Ativa/inativa um subitem (exclusão lógica: some de novos lançamentos, fica no histórico). */
export async function setChartAccountAtivo(id: string, ativo: boolean) {
  const ctx = await getActiveContext();
  if (!ctx || !can(ctx.perms, "planocontas", "editar")) return;
  await db
    .update(schema.chartAccounts)
    .set({ ativo })
    .where(
      and(
        eq(schema.chartAccounts.id, id),
        eq(schema.chartAccounts.tenantId, ctx.tenant.id),
      ),
    );
  await logAudit({
    tenantId: ctx.tenant.id,
    userId: ctx.userId,
    action: ativo ? "chart.item.activate" : "chart.item.deactivate",
    entity: "chart_account",
    entityId: id,
  });
  revalidatePath("/planocontas");
}

/** Exclui um subitem. */
export async function deleteChartItem(id: string) {
  const ctx = await getActiveContext();
  if (!ctx || !can(ctx.perms, "planocontas", "excluir")) return;
  await db
    .delete(schema.chartAccounts)
    .where(
      and(
        eq(schema.chartAccounts.id, id),
        eq(schema.chartAccounts.tenantId, ctx.tenant.id),
      ),
    );
  await logAudit({
    tenantId: ctx.tenant.id,
    userId: ctx.userId,
    action: "chart.item.delete",
    entity: "chart_account",
    entityId: id,
  });
  revalidatePath("/planocontas");
}

/** Renomeia (nome e/ou código) um grupo inteiro — aplica a todos os subitens. */
export async function renameChartGroup(input: {
  kind: string;
  groupCode: string;
  groupName?: string;
  newGroupCode?: string;
}) {
  const ctx = await getActiveContext();
  if (!ctx || !can(ctx.perms, "planocontas", "editar")) return;
  const kind = normKind(input.kind);
  const set: { groupName?: string; groupCode?: string } = {};
  if (input.groupName && input.groupName.trim()) set.groupName = input.groupName.trim();
  if (input.newGroupCode && input.newGroupCode.trim()) set.groupCode = input.newGroupCode.trim();
  if (Object.keys(set).length === 0) return;
  await db
    .update(schema.chartAccounts)
    .set(set)
    .where(
      and(
        eq(schema.chartAccounts.tenantId, ctx.tenant.id),
        eq(schema.chartAccounts.kind, kind),
        eq(schema.chartAccounts.groupCode, input.groupCode),
      ),
    );
  await logAudit({
    tenantId: ctx.tenant.id,
    userId: ctx.userId,
    action: "chart.group.update",
    entity: "chart_account",
    meta: { kind, groupCode: input.groupCode, ...set },
  });
  revalidatePath("/planocontas");
}

/** Exclui um grupo inteiro (todos os seus subitens). */
export async function deleteChartGroup(input: { kind: string; groupCode: string }) {
  const ctx = await getActiveContext();
  if (!ctx || !can(ctx.perms, "planocontas", "excluir")) return;
  const kind = normKind(input.kind);
  await db
    .delete(schema.chartAccounts)
    .where(
      and(
        eq(schema.chartAccounts.tenantId, ctx.tenant.id),
        eq(schema.chartAccounts.kind, kind),
        eq(schema.chartAccounts.groupCode, input.groupCode),
      ),
    );
  await logAudit({
    tenantId: ctx.tenant.id,
    userId: ctx.userId,
    action: "chart.group.delete",
    entity: "chart_account",
    meta: { kind, groupCode: input.groupCode },
  });
  revalidatePath("/planocontas");
}
```

---

## 5. `src/lib/natureza-grupo.ts`

### `src/lib/natureza-grupo.ts`

Não é alcançado por esta tela — ver a observação de recorte no topo.

```ts
/**
 * Natureza (receita/despesa) de um GRUPO do Plano de Contas, derivada dos seus
 * subitens.
 *
 * Regra: basta UM subitem de receita para o grupo ser de receita — a mesma
 * lógica já usada para o "ativo" (grupo ativo se algum subitem estiver ativo).
 *
 * Por que isso importa: a coluna `natureza` tem default "despesa". Se a natureza
 * do grupo fosse decidida pelo primeiro subitem encontrado, um grupo cujo
 * primeiro subitem ainda estivesse no default seria classificado como despesa
 * inteiro e sumiria do bloco de receitas do Budget/Forecast — deixando a tela
 * sem nenhuma linha para lançar.
 */
export interface SubItemConta {
  natureza?: string | null;
}

export function naturezaDoGrupo(
  subitens: SubItemConta[],
): "receita" | "despesa" {
  return subitens.some((a) => a.natureza === "receita") ? "receita" : "despesa";
}

/** Grupo ativo se ALGUM subitem estiver ativo. */
export function grupoAtivo(subitens: { ativo?: boolean | null }[]): boolean {
  if (subitens.length === 0) return false;
  return subitens.some((a) => a.ativo ?? true);
}
```

