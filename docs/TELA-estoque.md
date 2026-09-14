# TELA-estoque — código na íntegra

Coleta do código da tela **Controle de Estoques** (`/estoque`), em `main`
(commit `45f4ce3`). Sem resumo, sem análise.

> **Nota sobre o item 7.** O pedido chegou cortado em *"Como o saldo de
> cada"*. A seção 7 responde a leitura mais provável — **como o saldo de cada
> item é calculado**. Se a pergunta era outra (saldo por obra, saldo por
> período, valor de saldo…), é só dizer que eu acrescento.

**Árvore de dependências própria (recursiva):**

```
estoque/page.tsx
├── components/app/page-header.tsx
├── components/app/access-denied.tsx
│   └── components/app/page-header.tsx        (já listado)
└── components/app/estoque-manager.tsx
    ├── EstoqueManager   — quadro-resumo + barra de abas   (81–147)
    ├── Resumo           — cartão do quadro-resumo         (149–172)
    ├── ItensTab         — aba "Itens & Saldo"             (174–262)
    ├── MovTab           — aba "Entradas & Saídas"         (264–563)
    ├── FilterSel        — seletor de filtro do MovTab      (565–585)
    └── components/ui/money-input.tsx

A aba "Entradas & Saídas" é o `MovTab`, no MESMO arquivo do manager — não há
componente separado. `money-input.tsx` mora em `components/ui/` mas não é
primitiva genérica (é o acumulador de centavos do app), então entra na coleta;
card, button, input, date-field, badge e table ficam de fora.

queries chamadas:  getStockItems · getStockMovements
                   getDespesaOptions · getPermutaOptions
actions:           addStockItem, addStockMovement, deleteStockItem
                   — as TRÊS únicas de estoque no repositório
```

---

## 1. Página

### `src/app/(app)/estoque/page.tsx`

```tsx
import { getActiveContext } from "@/lib/context";
import {
  getStockItems,
  getStockMovements,
  getDespesaOptions,
  getPermutaOptions,
} from "@/lib/queries";
import { can } from "@/lib/permissions";
import { PageHeader } from "@/components/app/page-header";
import { AccessDenied } from "@/components/app/access-denied";
import { EstoqueManager } from "@/components/app/estoque-manager";

export const dynamic = "force-dynamic";

export default async function EstoquePage() {
  const ctx = await getActiveContext();
  if (!ctx) return null;
  if (!can(ctx.perms, "estoque", "ver")) return <AccessDenied />;

  const [items, movements, despesas, permutas] = await Promise.all([
    getStockItems(ctx.tenant.id),
    getStockMovements(ctx.tenant.id),
    getDespesaOptions(ctx.tenant.id),
    getPermutaOptions(ctx.tenant.id),
  ]);

  // Saldo por item = entradas - saídas.
  const saldo = new Map<string, number>();
  for (const m of movements) {
    const q = Number(m.quantidade);
    saldo.set(m.itemId, (saldo.get(m.itemId) ?? 0) + (m.tipo === "saida" ? -q : q));
  }

  const itemViews = items.map((i) => {
    const s = saldo.get(i.id) ?? 0;
    return {
      id: i.id,
      sku: i.sku,
      nome: i.nome,
      unidade: i.unidade,
      categoria: i.categoria,
      custoUnit: Number(i.custoUnit),
      minimo: Number(i.minimo),
      saldo: s,
      valorEstoque: s * Number(i.custoUnit),
    };
  });

  const movViews = movements.map((m) => ({
    id: m.id,
    itemNome: m.itemNome,
    unidade: m.unidade,
    tipo: m.tipo as "entrada" | "saida",
    origem: m.origem,
    quantidade: Number(m.quantidade),
    custoUnit: Number(m.custoUnit),
    data: m.data,
    doc: m.doc,
    obs: m.obs,
    projectName: m.projectName,
    clienteNome: m.clienteNome,
    responsavel: m.responsavel,
    despesaNumDoc: m.despesaNumDoc,
    permutaDescricao: m.permutaDescricao,
  }));

  return (
    <>
      <PageHeader
        eyebrow={ctx.tenant.name}
        title="Controle de Estoques"
        subtitle="Almoxarifado da obra: dê entrada e baixa em poucos cliques, com saldo, mínimo e vínculo à despesa ou permuta de origem."
      />
      <EstoqueManager
        items={itemViews}
        movements={movViews}
        projetos={ctx.projects.map((p) => ({ id: p.id, nome: p.name }))}
        despesas={despesas.map((d) => ({
          id: d.id,
          label: `${d.numDoc}${d.fornecedorNome ? ` · ${d.fornecedorNome}` : ""}`,
        }))}
        permutas={permutas.map((p) => ({
          id: p.id,
          label: `${p.descricao ?? "Permuta"}${p.cliente ? ` · ${p.cliente}` : ""}`,
        }))}
        canEdit={can(ctx.perms, "estoque", "criar")}
        canExcluir={can(ctx.perms, "estoque", "excluir")}
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

### `src/components/app/estoque-manager.tsx`

Arquivo único com os cinco componentes, **incluindo o `MovTab` — a aba "Entradas & Saídas"** (linhas 264–563).

```tsx
"use client";

import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import {
  addStockItem,
  addStockMovement,
  deleteStockItem,
} from "@/lib/actions/estoque";
import { brl0, dateBR } from "@/lib/utils";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input, Label, Select } from "@/components/ui/input";
import { MoneyInput } from "@/components/ui/money-input";
import { DateField } from "@/components/ui/date-field";
import { Badge } from "@/components/ui/badge";
import { Table, THead, TH, TR, TD } from "@/components/ui/table";

export interface ItemView {
  id: string;
  sku: string | null;
  nome: string;
  unidade: string;
  categoria: string | null;
  custoUnit: number;
  minimo: number;
  saldo: number;
  valorEstoque: number;
}
export interface MovView {
  id: string;
  itemNome: string;
  unidade: string;
  tipo: "entrada" | "saida";
  origem: string | null;
  quantidade: number;
  custoUnit: number;
  data: string | null;
  doc: string | null;
  obs: string | null;
  projectName: string | null;
  clienteNome: string | null;
  responsavel: string | null;
  despesaNumDoc: string | null;
  permutaDescricao: string | null;
}
interface Opt {
  id: string;
  nome?: string;
  label?: string;
}

// Origens/motivos padronizados (SOP) — reduzem erro de quem lança na ponta.
const ENTRADA_ORIGENS = [
  "Compra",
  "Permuta",
  "Devolução ao estoque",
  "Ajuste (inventário)",
  "Transferência entre obras",
];
const SAIDA_MOTIVOS = [
  "Consumo na obra",
  "Perda / Quebra",
  "Devolução ao fornecedor",
  "Transferência entre obras",
  "Ajuste (inventário)",
];

function toISO(d: string | null): string {
  if (!d) return "";
  const p = d.split("/");
  return p.length === 3 ? `${p[2]}-${p[0].padStart(2, "0")}-${p[1].padStart(2, "0")}` : "";
}
function hojeInterno(): string {
  const d = new Date();
  return `${String(d.getMonth() + 1).padStart(2, "0")}/${String(d.getDate()).padStart(2, "0")}/${d.getFullYear()}`;
}

type Tab = "itens" | "mov";

export function EstoqueManager({
  items,
  movements,
  projetos,
  despesas,
  permutas,
  canEdit,
  canExcluir,
}: {
  items: ItemView[];
  movements: MovView[];
  projetos: Opt[];
  despesas: Opt[];
  permutas: Opt[];
  canEdit: boolean;
  canExcluir: boolean;
}) {
  const [tab, setTab] = useState<Tab>("itens");

  const valorTotal = items.reduce((a, i) => a + i.valorEstoque, 0);
  const abaixoMin = items.filter((i) => i.minimo > 0 && i.saldo <= i.minimo).length;
  const entradas = movements.filter((m) => m.tipo === "entrada").length;
  const saidas = movements.filter((m) => m.tipo === "saida").length;

  return (
    <div className="space-y-5">
      {/* Quadro-resumo */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <Resumo label="Itens cadastrados" value={String(items.length)} />
        <Resumo label="Valor em estoque" value={brl0(valorTotal)} tone="accent" />
        <Resumo
          label="Abaixo do mínimo"
          value={String(abaixoMin)}
          tone={abaixoMin > 0 ? "neg" : undefined}
        />
        <Resumo label="Movimentações" value={`${entradas}↑ / ${saidas}↓`} />
      </div>

      <div className="flex gap-1 rounded-[8px] bg-[var(--color-surface3)] p-1 w-fit">
        {(["itens", "mov"] as Tab[]).map((t) => (
          <button
            key={t}
            onClick={() => setTab(t)}
            className={`rounded-[6px] px-3 py-1.5 text-xs transition-colors ${
              tab === t ? "bg-white text-[var(--color-ink)] shadow-sm" : "text-[var(--color-ink3)]"
            }`}
          >
            {t === "itens" ? "Itens & Saldo" : "Entradas & Saídas"}
          </button>
        ))}
      </div>

      {tab === "itens" ? (
        <ItensTab items={items} canEdit={canEdit} canExcluir={canExcluir} />
      ) : (
        <MovTab
          items={items}
          movements={movements}
          projetos={projetos}
          despesas={despesas}
          permutas={permutas}
          canEdit={canEdit}
        />
      )}
    </div>
  );
}

function Resumo({
  label,
  value,
  tone,
}: {
  label: string;
  value: string;
  tone?: "accent" | "neg";
}) {
  const color =
    tone === "accent" ? "var(--color-accent)" : tone === "neg" ? "var(--color-danger)" : "var(--color-ink)";
  return (
    <Card>
      <CardContent className="p-4">
        <p className="font-[family-name:var(--font-mono)] text-[10px] uppercase tracking-wide text-[var(--color-ink3)]">
          {label}
        </p>
        <p className="mt-1 text-xl font-semibold" style={{ color }}>
          {value}
        </p>
      </CardContent>
    </Card>
  );
}

function ItensTab({
  items,
  canEdit,
  canExcluir,
}: {
  items: ItemView[];
  canEdit: boolean;
  canExcluir: boolean;
}) {
  return (
    <div className="space-y-4">
      {canEdit && (
        <Card>
          <CardContent className="p-5">
            <h3 className="mb-3 text-sm font-semibold text-[var(--color-ink)]">Novo item</h3>
            <form action={addStockItem} className="grid grid-cols-2 gap-3 sm:grid-cols-6">
              <div className="sm:col-span-2"><Label>Nome</Label><Input name="nome" required /></div>
              <div><Label>SKU / Código</Label><Input name="sku" /></div>
              <div><Label>Unidade</Label><Input name="unidade" placeholder="un, m, kg, sc" /></div>
              <div><Label>Categoria</Label><Input name="categoria" /></div>
              <div><Label>Custo unit.</Label><Input name="custoUnit" type="number" step="0.01" placeholder="0" /></div>
              <div><Label>Estoque mínimo</Label><Input name="minimo" type="number" step="0.001" placeholder="0" /></div>
              <div className="sm:col-span-3"><Label>Observação</Label><Input name="obs" /></div>
              <div className="flex items-end sm:col-span-1"><Button type="submit" className="w-full">Cadastrar</Button></div>
            </form>
          </CardContent>
        </Card>
      )}

      <Card>
        <CardContent className="p-0">
          <div className="tbl-scroll overflow-x-auto">
            <Table>
              <THead>
                <tr>
                  <TH>Item</TH>
                  <TH>SKU</TH>
                  <TH>Categoria</TH>
                  <TH className="text-right">Custo unit.</TH>
                  <TH className="text-right">Mínimo</TH>
                  <TH className="text-right">Saldo</TH>
                  <TH className="text-right">Valor em estoque</TH>
                  {canExcluir && <TH></TH>}
                </tr>
              </THead>
              <tbody>
                {items.map((i) => {
                  const baixo = i.minimo > 0 && i.saldo <= i.minimo;
                  return (
                    <TR key={i.id}>
                      <TD className="font-medium text-[var(--color-ink)]">
                        {i.nome}
                        {baixo && <Badge tone="danger" className="ml-2">estoque baixo</Badge>}
                      </TD>
                      <TD className="text-[var(--color-ink3)]">{i.sku ?? "—"}</TD>
                      <TD>{i.categoria ?? "—"}</TD>
                      <TD className="text-right font-[family-name:var(--font-mono)]">{brl0(i.custoUnit)}</TD>
                      <TD className="text-right font-[family-name:var(--font-mono)] text-[var(--color-ink3)]">
                        {i.minimo > 0 ? `${i.minimo.toLocaleString("pt-BR")} ${i.unidade}` : "—"}
                      </TD>
                      <TD
                        className={`text-right font-[family-name:var(--font-mono)] font-semibold ${
                          baixo ? "text-[var(--color-danger)]" : "text-[var(--color-ink)]"
                        }`}
                      >
                        {i.saldo.toLocaleString("pt-BR")} {i.unidade}
                      </TD>
                      <TD className="text-right font-[family-name:var(--font-mono)] text-[var(--color-accent)]">{brl0(i.valorEstoque)}</TD>
                      {canExcluir && (
                        <TD className="text-right">
                          <form action={deleteStockItem.bind(null, i.id)}>
                            <button className="text-[12px] text-[var(--color-danger)] hover:underline">Excluir</button>
                          </form>
                        </TD>
                      )}
                    </TR>
                  );
                })}
                {items.length === 0 && (
                  <TR><TD colSpan={canExcluir ? 8 : 7} className="py-8 text-center text-[var(--color-ink4)]">Nenhum item cadastrado.</TD></TR>
                )}
              </tbody>
            </Table>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

function MovTab({
  items,
  movements,
  projetos,
  despesas,
  permutas,
  canEdit,
}: {
  items: ItemView[];
  movements: MovView[];
  projetos: Opt[];
  despesas: Opt[];
  permutas: Opt[];
  canEdit: boolean;
}) {
  const router = useRouter();
  const [saving, start] = useTransition();
  const [err, setErr] = useState<string | null>(null);

  // Formulário de movimentação (controlado, para revelar campos por origem).
  const [tipo, setTipo] = useState<"entrada" | "saida">("entrada");
  const [itemId, setItemId] = useState("");
  const [origem, setOrigem] = useState(ENTRADA_ORIGENS[0]);
  const [quantidade, setQuantidade] = useState("");
  const [custo, setCusto] = useState("");
  const [projectId, setProjectId] = useState("");
  const [data, setData] = useState(hojeInterno());
  const [doc, setDoc] = useState("");
  const [despesaId, setDespesaId] = useState("");
  const [permutaId, setPermutaId] = useState("");
  const [obs, setObs] = useState("");

  const trocarTipo = (t: "entrada" | "saida") => {
    setTipo(t);
    setOrigem(t === "entrada" ? ENTRADA_ORIGENS[0] : SAIDA_MOTIVOS[0]);
    setDespesaId("");
    setPermutaId("");
  };

  const registrar = () => {
    setErr(null);
    if (!itemId) return setErr("Selecione o item.");
    if (!(Number(quantidade) > 0)) return setErr("Informe a quantidade (maior que zero).");
    const fd = new FormData();
    fd.set("itemId", itemId);
    fd.set("tipo", tipo);
    fd.set("origem", origem);
    fd.set("quantidade", quantidade);
    fd.set("custoUnit", custo || "0");
    fd.set("projectId", projectId);
    fd.set("data", data);
    fd.set("doc", doc);
    if (tipo === "entrada" && origem === "Compra") fd.set("despesaId", despesaId);
    if (tipo === "entrada" && origem === "Permuta") fd.set("permutaId", permutaId);
    fd.set("obs", obs);
    start(async () => {
      try {
        await addStockMovement(fd);
        setItemId("");
        setQuantidade("");
        setCusto("");
        setProjectId("");
        setDoc("");
        setDespesaId("");
        setPermutaId("");
        setObs("");
        router.refresh();
      } catch (e) {
        setErr(e instanceof Error ? e.message : "Falha ao registrar movimentação.");
      }
    });
  };

  // Filtros do histórico
  const [fProduto, setFProduto] = useState("");
  const [fObra, setFObra] = useState("");
  const [fTipo, setFTipo] = useState("");
  const [de, setDe] = useState("");
  const [ate, setAte] = useState("");

  const opts = useMemo(() => {
    const uniq = (xs: (string | null)[]) =>
      [...new Set(xs.filter((x): x is string => !!x))].sort((a, b) => a.localeCompare(b));
    return {
      produtos: uniq(movements.map((m) => m.itemNome)),
      obras: uniq(movements.map((m) => m.projectName)),
    };
  }, [movements]);

  const filtered = useMemo(
    () =>
      movements.filter((m) => {
        if (fProduto && m.itemNome !== fProduto) return false;
        if (fObra && m.projectName !== fObra) return false;
        if (fTipo && m.tipo !== fTipo) return false;
        const iso = toISO(m.data);
        if (de && (!iso || iso < de)) return false;
        if (ate && (!iso || iso > ate)) return false;
        return true;
      }),
    [movements, fProduto, fObra, fTipo, de, ate],
  );

  const origens = tipo === "entrada" ? ENTRADA_ORIGENS : SAIDA_MOTIVOS;

  return (
    <div className="space-y-4">
      {canEdit && items.length > 0 && (
        <Card>
          <CardContent className="space-y-4 p-5">
            {/* Botões grandes Entrada / Saída */}
            <div className="flex gap-2">
              <button
                type="button"
                onClick={() => trocarTipo("entrada")}
                className={`flex-1 rounded-[10px] border px-4 py-2.5 text-sm font-semibold transition-colors ${
                  tipo === "entrada"
                    ? "border-[var(--color-success)] bg-[var(--color-success)]/12 text-[var(--color-success)]"
                    : "border-[var(--color-accent2)]/20 text-[var(--color-ink3)] hover:bg-[var(--color-surface2)]"
                }`}
              >
                ↓ Dar entrada
              </button>
              <button
                type="button"
                onClick={() => trocarTipo("saida")}
                className={`flex-1 rounded-[10px] border px-4 py-2.5 text-sm font-semibold transition-colors ${
                  tipo === "saida"
                    ? "border-[var(--color-danger)] bg-[var(--color-danger)]/12 text-[var(--color-danger)]"
                    : "border-[var(--color-accent2)]/20 text-[var(--color-ink3)] hover:bg-[var(--color-surface2)]"
                }`}
              >
                ↑ Dar baixa
              </button>
            </div>

            <div className="grid grid-cols-2 gap-3 sm:grid-cols-6">
              <div className="sm:col-span-2">
                <Label>Item</Label>
                <Select value={itemId} onChange={(e) => setItemId(e.target.value)}>
                  <option value="">Selecione…</option>
                  {items.map((i) => (
                    <option key={i.id} value={i.id}>
                      {i.nome} (saldo {i.saldo.toLocaleString("pt-BR")} {i.unidade})
                    </option>
                  ))}
                </Select>
              </div>
              <div className="sm:col-span-2">
                <Label>{tipo === "entrada" ? "Origem da entrada" : "Motivo da baixa"}</Label>
                <Select value={origem} onChange={(e) => setOrigem(e.target.value)}>
                  {origens.map((o) => (
                    <option key={o} value={o}>{o}</option>
                  ))}
                </Select>
              </div>
              <div>
                <Label>Quantidade</Label>
                <Input
                  type="number"
                  step="0.001"
                  value={quantidade}
                  onChange={(e) => setQuantidade(e.target.value)}
                  placeholder="0"
                />
              </div>
              <div>
                <Label>Custo unit.</Label>
                <MoneyInput value={custo} onChange={setCusto} />
              </div>

              {/* Vínculo condicional: Compra → despesa; Permuta → permuta */}
              {tipo === "entrada" && origem === "Compra" && (
                <div className="sm:col-span-3">
                  <Label>Despesa vinculada (NF/pedido)</Label>
                  <Select value={despesaId} onChange={(e) => setDespesaId(e.target.value)}>
                    <option value="">— sem vínculo —</option>
                    {despesas.map((d) => (
                      <option key={d.id} value={d.id}>{d.label}</option>
                    ))}
                  </Select>
                </div>
              )}
              {tipo === "entrada" && origem === "Permuta" && (
                <div className="sm:col-span-3">
                  <Label>Permuta vinculada</Label>
                  <Select value={permutaId} onChange={(e) => setPermutaId(e.target.value)}>
                    <option value="">— sem vínculo —</option>
                    {permutas.map((p) => (
                      <option key={p.id} value={p.id}>{p.label}</option>
                    ))}
                  </Select>
                </div>
              )}

              <div className="sm:col-span-2">
                <Label>Obra</Label>
                <Select value={projectId} onChange={(e) => setProjectId(e.target.value)}>
                  <option value="">— geral / almoxarifado —</option>
                  {projetos.map((p) => (
                    <option key={p.id} value={p.id}>{p.nome}</option>
                  ))}
                </Select>
              </div>
              <div>
                <Label>Data</Label>
                <DateField value={data} onChange={setData} />
              </div>
              <div>
                <Label>Documento (NF/nº)</Label>
                <Input value={doc} onChange={(e) => setDoc(e.target.value)} />
              </div>
              <div className="sm:col-span-4">
                <Label>Observação</Label>
                <Input value={obs} onChange={(e) => setObs(e.target.value)} />
              </div>
              <div className="flex items-end sm:col-span-2">
                <Button type="button" className="w-full" disabled={saving} onClick={registrar}>
                  {saving ? "Registrando…" : tipo === "entrada" ? "Registrar entrada" : "Registrar baixa"}
                </Button>
              </div>
            </div>
            {err && <p className="text-sm text-[var(--color-danger)]">{err}</p>}
          </CardContent>
        </Card>
      )}

      {/* Filtros */}
      <Card>
        <CardContent className="grid grid-cols-2 gap-3 p-4 sm:grid-cols-4 lg:grid-cols-5">
          <div><Label>De</Label><Input type="date" value={de} onChange={(e) => setDe(e.target.value)} /></div>
          <div><Label>Até</Label><Input type="date" value={ate} onChange={(e) => setAte(e.target.value)} /></div>
          <FilterSel label="Produto" value={fProduto} onChange={setFProduto} options={opts.produtos} />
          <FilterSel label="Obra" value={fObra} onChange={setFObra} options={opts.obras} />
          <div>
            <Label>Tipo</Label>
            <Select value={fTipo} onChange={(e) => setFTipo(e.target.value)}>
              <option value="">Todos</option>
              <option value="entrada">Entrada</option>
              <option value="saida">Saída</option>
            </Select>
          </div>
        </CardContent>
      </Card>

      {/* Histórico */}
      <Card>
        <CardContent className="p-0">
          <div className="tbl-scroll overflow-x-auto">
            <Table>
              <THead>
                <tr>
                  <TH>Data</TH>
                  <TH>Item</TH>
                  <TH>Tipo</TH>
                  <TH>Origem / Motivo</TH>
                  <TH className="text-right">Qtd</TH>
                  <TH className="text-right">Custo unit.</TH>
                  <TH>Obra</TH>
                  <TH>Vínculo</TH>
                  <TH>Responsável</TH>
                </tr>
              </THead>
              <tbody>
                {filtered.map((m) => (
                  <TR key={m.id}>
                    <TD className="whitespace-nowrap font-[family-name:var(--font-mono)] text-[var(--color-ink2)]">{m.data ? dateBR(m.data) : "—"}</TD>
                    <TD className="font-medium text-[var(--color-ink)]">{m.itemNome}</TD>
                    <TD>
                      <Badge tone={m.tipo === "entrada" ? "success" : "danger"}>
                        {m.tipo === "entrada" ? "Entrada" : "Saída"}
                      </Badge>
                    </TD>
                    <TD className="text-[var(--color-ink2)]">{m.origem ?? "—"}</TD>
                    <TD className="text-right font-[family-name:var(--font-mono)]">
                      {m.quantidade.toLocaleString("pt-BR")} {m.unidade}
                    </TD>
                    <TD className="text-right font-[family-name:var(--font-mono)]">{brl0(m.custoUnit)}</TD>
                    <TD className="text-[var(--color-ink2)]">{m.projectName ?? "Geral"}</TD>
                    <TD className="text-[var(--color-ink3)]">
                      {m.despesaNumDoc
                        ? `Despesa ${m.despesaNumDoc}`
                        : m.permutaDescricao
                          ? `Permuta · ${m.permutaDescricao}`
                          : m.doc ?? "—"}
                    </TD>
                    <TD className="whitespace-nowrap text-[var(--color-ink3)]">{m.responsavel ?? "—"}</TD>
                  </TR>
                ))}
                {filtered.length === 0 && (
                  <TR><TD colSpan={9} className="py-8 text-center text-[var(--color-ink4)]">Nenhuma movimentação.</TD></TR>
                )}
              </tbody>
            </Table>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

function FilterSel({
  label,
  value,
  onChange,
  options,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  options: string[];
}) {
  return (
    <div>
      <Label>{label}</Label>
      <Select value={value} onChange={(e) => onChange(e.target.value)}>
        <option value="">Todos</option>
        {options.map((o) => <option key={o} value={o}>{o}</option>)}
      </Select>
    </div>
  );
}
```

### `src/components/ui/money-input.tsx`

Importado por `estoque-manager.tsx`.

```tsx
"use client";

import { useEffect, useState } from "react";
import { cn } from "@/lib/utils";

/**
 * Formata centavos (inteiro) no padrão brasileiro: 100050 → "1.000,50".
 * Sempre com duas casas decimais.
 */
function fmtCents(cents: number): string {
  const neg = cents < 0;
  const abs = Math.abs(Math.trunc(cents));
  const s = String(abs).padStart(3, "0");
  const int = s.slice(0, -2);
  const dec = s.slice(-2);
  const intFmt = int.replace(/\B(?=(\d{3})+(?!\d))/g, ".");
  return (neg ? "-" : "") + intFmt + "," + dec;
}

/** Valor canônico (reais) → centavos inteiros. "1000.5" → 100050. */
function valueToCents(v: string | number): number {
  const n =
    typeof v === "number" ? v : parseFloat(String(v).replace(/\s/g, "").replace(",", "."));
  if (!isFinite(n) || n === 0) return 0;
  return Math.round(n * 100);
}

const toDisplay = (v: string | number): string =>
  v === "" || v === null || v === undefined ? "" : fmtCents(valueToCents(v));

/**
 * Campo monetário com formatação automática no padrão BR enquanto o usuário
 * digita (estilo "acumulador de centavos"): digitar 100000 exibe 1.000,00.
 * O `onChange` emite o valor canônico em reais (ponto decimal, ex.: "1000").
 */
export function MoneyInput({
  value,
  onChange,
  disabled,
  placeholder = "0,00",
  className,
  name,
  "aria-label": ariaLabel,
}: {
  value: string | number;
  onChange: (v: string) => void;
  disabled?: boolean;
  placeholder?: string;
  className?: string;
  name?: string;
  "aria-label"?: string;
}) {
  const [text, setText] = useState(() => toDisplay(value));

  // Sincroniza a exibição quando o valor muda por fora (import, IA, reset).
  useEffect(() => {
    setText(toDisplay(value));
  }, [value]);

  const handle = (raw: string) => {
    const digitsOnly = raw.replace(/\D/g, "");
    if (digitsOnly === "") {
      setText("");
      onChange("");
      return;
    }
    const cents = Number(digitsOnly);
    setText(fmtCents(cents));
    onChange(String(cents / 100));
  };

  return (
    <>
      {name && (
        <input
          type="hidden"
          name={name}
          value={value === "" || value === null || value === undefined ? "" : String(value)}
        />
      )}
      <input
        type="text"
        inputMode="numeric"
        aria-label={ariaLabel}
        disabled={disabled}
        value={text}
        placeholder={placeholder}
        onChange={(e) => handle(e.target.value)}
        className={cn(
          "h-9 w-full rounded-[8px] border border-[var(--color-accent2)]/20 bg-white px-3 text-right text-sm text-[var(--color-ink)] outline-none transition-colors placeholder:text-[var(--color-ink4)] focus:border-[var(--color-accent2)] focus:ring-2 focus:ring-[var(--color-accent2)]/20 disabled:opacity-60",
          className,
        )}
      />
    </>
  );
}
```

---

## 3. Funções de `queries.ts` chamadas pela página

Quatro, no `Promise.all` das linhas 20–25. Todas filtram só por `tenant_id`.

### `src/lib/queries.ts` · linhas 477–485

Os tipos `StockItemRow` e `StockMovementRow`.

```ts
export type StockItemRow = typeof schema.stockItems.$inferSelect;
export type StockMovementRow = typeof schema.stockMovements.$inferSelect & {
  itemNome: string;
  unidade: string;
  projectName: string | null;
  clienteNome: string | null;
  despesaNumDoc: string | null;
  permutaDescricao: string | null;
};
```

### `src/lib/queries.ts` · linhas 542–548

`getStockItems`.

```ts
export async function getStockItems(tenantId: string): Promise<StockItemRow[]> {
  return db
    .select()
    .from(schema.stockItems)
    .where(eq(schema.stockItems.tenantId, tenantId))
    .orderBy(asc(schema.stockItems.nome));
}
```

### `src/lib/queries.ts` · linhas 550–579

`getStockMovements` — traz os nomes por `join`, inclusive `despesaNumDoc` e `permutaDescricao`. **Sem `limit`.**

```ts
/** Movimentações de estoque do tenant, com item, obra e cliente. */
export async function getStockMovements(tenantId: string): Promise<StockMovementRow[]> {
  const rows = await db
    .select({
      m: schema.stockMovements,
      itemNome: schema.stockItems.nome,
      unidade: schema.stockItems.unidade,
      projectName: schema.projects.name,
      clienteNome: schema.clientes.nomeCompleto,
      despesaNumDoc: schema.despesas.numDoc,
      permutaDescricao: schema.permutas.descricao,
    })
    .from(schema.stockMovements)
    .innerJoin(schema.stockItems, eq(schema.stockMovements.itemId, schema.stockItems.id))
    .leftJoin(schema.projects, eq(schema.stockMovements.projectId, schema.projects.id))
    .leftJoin(schema.clientes, eq(schema.projects.clienteId, schema.clientes.id))
    .leftJoin(schema.despesas, eq(schema.stockMovements.despesaId, schema.despesas.id))
    .leftJoin(schema.permutas, eq(schema.stockMovements.permutaId, schema.permutas.id))
    .where(eq(schema.stockMovements.tenantId, tenantId))
    .orderBy(desc(schema.stockMovements.createdAt));
  return rows.map((r) => ({
    ...r.m,
    itemNome: r.itemNome,
    unidade: r.unidade,
    projectName: r.projectName,
    clienteNome: r.clienteNome,
    despesaNumDoc: r.despesaNumDoc,
    permutaDescricao: r.permutaDescricao,
  }));
}
```

### `src/lib/queries.ts` · linhas 487–513

`getDespesaOptions` — limitada às 500 despesas mais recentes do tenant.

```ts
export interface DespesaOption {
  id: string;
  numDoc: string;
  fornecedorNome: string | null;
  valor: number;
}
/** Despesas do tenant para vincular a uma entrada de estoque (mais recentes primeiro). */
export async function getDespesaOptions(tenantId: string): Promise<DespesaOption[]> {
  const rows = await db
    .select({
      id: schema.despesas.id,
      numDoc: schema.despesas.numDoc,
      valor: schema.despesas.valor,
      fornecedorNome: schema.stakeholders.nome,
    })
    .from(schema.despesas)
    .leftJoin(schema.stakeholders, eq(schema.despesas.fornecedorId, schema.stakeholders.id))
    .where(eq(schema.despesas.tenantId, tenantId))
    .orderBy(desc(schema.despesas.createdAt))
    .limit(500);
  return rows.map((r) => ({
    id: r.id,
    numDoc: r.numDoc ?? "—",
    fornecedorNome: r.fornecedorNome,
    valor: Number(r.valor),
  }));
}
```

### `src/lib/queries.ts` · linhas 515–540

`getPermutaOptions` — limitada a 500, ordenada por `id` (não por data).

```ts
export interface PermutaOption {
  id: string;
  descricao: string | null;
  cliente: string | null;
  estimado: number | null;
}
/** Permutas do tenant para vincular a uma entrada de estoque recebida via permuta. */
export async function getPermutaOptions(tenantId: string): Promise<PermutaOption[]> {
  const rows = await db
    .select({
      id: schema.permutas.id,
      descricao: schema.permutas.descricao,
      cliente: schema.permutas.cliente,
      estimado: schema.permutas.estimado,
    })
    .from(schema.permutas)
    .where(eq(schema.permutas.tenantId, tenantId))
    .orderBy(desc(schema.permutas.id))
    .limit(500);
  return rows.map((r) => ({
    id: r.id,
    descricao: r.descricao,
    cliente: r.cliente,
    estimado: r.estimado === null ? null : Number(r.estimado),
  }));
}
```

---

## 4. As Server Actions de estoque


São três, e o arquivo inteiro tem 94 linhas. Não existe action de **edição**
de item nem de **exclusão/estorno de movimentação**: uma vez lançada, uma
entrada ou saída não pode ser corrigida nem apagada pela interface.

| Action | Permissão | Sem permissão | Grava auditoria? |
|---|---|---|---|
| `addStockItem` | `estoque:criar` | **lança** `Error` | sim (`estoque.item.create`) |
| `addStockMovement` | `estoque:criar` | **lança** `Error` | sim (`estoque.mov.create`) |
| `deleteStockItem` | `estoque:excluir` | `return` silencioso | **não** |

`deleteStockItem` apaga o item; as movimentações vão junto por
`onDelete: "cascade"` na FK `stock_movement.item_id` (`schema.ts:1493`). Não
há checagem de saldo nem de histórico antes de apagar, e nada fica no log.

### `src/lib/actions/estoque.ts`

```ts
"use server";

import { and, eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { db, schema } from "@/lib/db";
import { getActiveContext } from "@/lib/context";
import { can } from "@/lib/permissions";
import { logAudit } from "@/lib/audit";

const num = (v: FormDataEntryValue | null): number => {
  const n = Number(String(v ?? "").replace(",", "."));
  return Number.isFinite(n) ? n : 0;
};
const str = (v: FormDataEntryValue | null): string | null => {
  const s = String(v ?? "").trim();
  return s ? s : null;
};

/** Cadastra um item de estoque. */
export async function addStockItem(formData: FormData) {
  const ctx = await getActiveContext();
  if (!ctx || !can(ctx.perms, "estoque", "criar")) throw new Error("Sem permissão.");
  const nome = str(formData.get("nome"));
  if (!nome) throw new Error("Informe o nome do item.");
  await db.insert(schema.stockItems).values({
    tenantId: ctx.tenant.id,
    sku: str(formData.get("sku")),
    nome,
    unidade: str(formData.get("unidade")) || "un",
    categoria: str(formData.get("categoria")),
    custoUnit: String(num(formData.get("custoUnit"))),
    minimo: String(num(formData.get("minimo"))),
    obs: str(formData.get("obs")),
  });
  await logAudit({
    tenantId: ctx.tenant.id,
    userId: ctx.userId,
    action: "estoque.item.create",
    entity: "stock_item",
    meta: { nome },
  });
  revalidatePath("/estoque");
}

/** Registra uma movimentação de estoque (entrada ou saída). */
export async function addStockMovement(formData: FormData) {
  const ctx = await getActiveContext();
  if (!ctx || !can(ctx.perms, "estoque", "criar")) throw new Error("Sem permissão.");
  const itemId = str(formData.get("itemId"));
  if (!itemId) throw new Error("Selecione o item.");
  const tipo = String(formData.get("tipo") ?? "entrada") === "saida" ? "saida" : "entrada";
  const quantidade = num(formData.get("quantidade"));
  if (quantidade <= 0) throw new Error("Quantidade deve ser maior que zero.");

  // Vínculos: só fazem sentido em entrada por compra (despesa) ou permuta.
  const despesaId = tipo === "entrada" ? str(formData.get("despesaId")) : null;
  const permutaId = tipo === "entrada" ? str(formData.get("permutaId")) : null;
  const responsavel = str(formData.get("responsavel")) || ctx.userEmail || null;

  await db.insert(schema.stockMovements).values({
    tenantId: ctx.tenant.id,
    itemId,
    projectId: str(formData.get("projectId")),
    tipo,
    origem: str(formData.get("origem")),
    quantidade: String(quantidade),
    custoUnit: String(num(formData.get("custoUnit"))),
    data: str(formData.get("data")),
    doc: str(formData.get("doc")),
    despesaId,
    permutaId,
    responsavel,
    obs: str(formData.get("obs")),
  });
  await logAudit({
    tenantId: ctx.tenant.id,
    userId: ctx.userId,
    action: "estoque.mov.create",
    entity: "stock_movement",
    entityId: itemId,
    meta: { tipo, quantidade, origem: str(formData.get("origem")) },
  });
  revalidatePath("/estoque");
}

/** Exclui um item de estoque (e suas movimentações em cascata). */
export async function deleteStockItem(id: string) {
  const ctx = await getActiveContext();
  if (!ctx || !can(ctx.perms, "estoque", "excluir")) return;
  await db
    .delete(schema.stockItems)
    .where(and(eq(schema.stockItems.id, id), eq(schema.stockItems.tenantId, ctx.tenant.id)));
  revalidatePath("/estoque");
}
```

---

## 5. `stock_item` e `stock_movement` no schema


### 5.1 Não existe nenhum enum de estoque

O pedido menciona "os enums que usam". Registro o que o código mostra: **as
duas tabelas não usam `pgEnum` nenhum.** Os dez enums declarados no schema
(`roleEnum`, `projectKindEnum`, `projectStatusEnum`, `versionKindEnum`,
`unitStatusEnum`, `unitItemTypeEnum`, `stakeholderTypeEnum`,
`bankAccountTypeEnum`, `accountKindEnum`, `dreCategoryEnum` — linhas 30 a 215)
não incluem nenhum de estoque.

Os dois campos que pareceriam enums são `text` livre:

| Coluna | Tipo | Valores esperados | Onde os valores estão declarados |
|---|---|---|---|
| `tipo` | `text` `notNull` | `"entrada"` \| `"saida"` | só no comentário (`schema.ts:1498`) e num ternário da action (`estoque.ts:51`) |
| `origem` | `text` nullable | 5 entradas + 5 saídas | só no comentário (`schema.ts:1500–1504`) e em duas constantes do cliente (`estoque-manager.tsx:54–67`) |

Sem `CHECK` e sem enum, o banco aceita qualquer string nas duas colunas. A
única trava é o ternário de `tipo` na action, que força qualquer valor
diferente de `"saida"` a virar `"entrada"`.

As listas do comentário do schema e as do componente **não batem**:

| `schema.ts:1501–1503` | `estoque-manager.tsx:54–67` |
|---|---|
| Entradas: Compra, Permuta, Devolução, Ajuste, Transferência | Compra, Permuta, Devolução ao estoque, Ajuste (inventário), Transferência entre obras |
| Saídas: Consumo na obra, Perda/Quebra, Devolução ao fornecedor, Transferência, Ajuste | Consumo na obra, Perda / Quebra, Devolução ao fornecedor, Transferência entre obras, Ajuste (inventário) |

O que vai para o banco são as strings do componente.

### `src/lib/db/schema.ts` · linhas 1467–1483

`stock_item`.

```ts
/** Item de estoque (produto/material) cadastrado no tenant. */
export const stockItems = pgTable("stock_item", {
  id: uuid("id").primaryKey().defaultRandom(),
  tenantId: uuid("tenant_id")
    .notNull()
    .references(() => tenants.id, { onDelete: "cascade" }),
  sku: text("sku"),
  nome: text("nome").notNull(),
  /** unidade de medida (un, kg, m, m2, m3, sc, …). */
  unidade: text("unidade").notNull().default("un"),
  categoria: text("categoria"),
  custoUnit: numeric("custo_unit", { precision: 15, scale: 2 }).notNull().default("0"),
  /** estoque mínimo para alerta. */
  minimo: numeric("minimo", { precision: 15, scale: 3 }).notNull().default("0"),
  obs: text("obs"),
  createdAt: timestamp("created_at", { mode: "date" }).notNull().defaultNow(),
});
```

### `src/lib/db/schema.ts` · linhas 1485–1523

`stock_movement` — inclusive `despesa_id` e `permuta_id`, ambos `set null`.

```ts
/** Movimentação de estoque: entrada ou saída, associada a uma obra. */
export const stockMovements = pgTable("stock_movement", {
  id: uuid("id").primaryKey().defaultRandom(),
  tenantId: uuid("tenant_id")
    .notNull()
    .references(() => tenants.id, { onDelete: "cascade" }),
  itemId: uuid("item_id")
    .notNull()
    .references(() => stockItems.id, { onDelete: "cascade" }),
  /** obra à qual a movimentação está associada (NULL = geral/almoxarifado). */
  projectId: uuid("project_id").references(() => projects.id, {
    onDelete: "set null",
  }),
  /** "entrada" | "saida" */
  tipo: text("tipo").notNull(),
  /**
   * Origem/motivo padronizado da movimentação. Entradas: Compra, Permuta,
   * Devolução, Ajuste, Transferência. Saídas: Consumo na obra, Perda/Quebra,
   * Devolução ao fornecedor, Transferência, Ajuste.
   */
  origem: text("origem"),
  quantidade: numeric("quantidade", { precision: 15, scale: 3 }).notNull().default("0"),
  custoUnit: numeric("custo_unit", { precision: 15, scale: 2 }).notNull().default("0"),
  /** data da movimentação, "MM/DD/YYYY". */
  data: text("data"),
  doc: text("doc"),
  /** Vínculo opcional a uma despesa (entrada por compra). */
  despesaId: uuid("despesa_id").references(() => despesas.id, {
    onDelete: "set null",
  }),
  /** Vínculo opcional a uma permuta (entrada por permuta). */
  permutaId: uuid("permuta_id").references(() => permutas.id, {
    onDelete: "set null",
  }),
  /** Responsável pelo lançamento (quem deu entrada/baixa). */
  responsavel: text("responsavel"),
  obs: text("obs"),
  createdAt: timestamp("created_at", { mode: "date" }).notNull().defaultNow(),
});
```

### `src/components/app/estoque-manager.tsx` · linhas 53–67

As listas de origem que realmente chegam ao banco, no cliente.

```tsx
// Origens/motivos padronizados (SOP) — reduzem erro de quem lança na ponta.
const ENTRADA_ORIGENS = [
  "Compra",
  "Permuta",
  "Devolução ao estoque",
  "Ajuste (inventário)",
  "Transferência entre obras",
];
const SAIDA_MOTIVOS = [
  "Consumo na obra",
  "Perda / Quebra",
  "Devolução ao fornecedor",
  "Transferência entre obras",
  "Ajuste (inventário)",
];
```

---

## 6. Quem grava `despesa_id` e `permuta_id`


**Grava, sim — em exatamente um lugar:** `addStockMovement`, em
`src/lib/actions/estoque.ts`. É a única escrita em `stock_movement` de todo o
repositório.

| Arquivo:linha | O que faz |
|---|---|
| `estoque.ts:56` | `const despesaId = tipo === "entrada" ? str(formData.get("despesaId")) : null;` |
| `estoque.ts:57` | `const permutaId = tipo === "entrada" ? str(formData.get("permutaId")) : null;` |
| `estoque.ts:70–71` | os dois entram no `values({...})` do `insert` |

Três fatos que saem direto dessas quatro linhas:

- **Em saída, os dois são forçados a `null`.** O ternário não olha o que veio
  do formulário: se `tipo === "saida"`, o vínculo é descartado mesmo que o
  cliente o tenha enviado.
- **Os dois podem ser preenchidos ao mesmo tempo.** Não há validação de
  exclusividade — nada impede uma entrada vinculada a uma despesa *e* a uma
  permuta.
- **Nenhum dos dois é obrigatório**, mesmo quando a `origem` é "Compra" ou
  "Permuta". Não há amarração entre o valor de `origem` e o vínculo gravado.

Do outro lado, a leitura: `getStockMovements` faz `leftJoin` nas duas
(`queries.ts:566–567`) para trazer `despesaNumDoc` e `permutaDescricao`, que a
página repassa ao `MovTab` — é exibição, não cálculo. Nenhum outro ponto do
repositório lê essas duas colunas.

### `src/lib/actions/estoque.ts` · linhas 45–84

`addStockMovement` inteiro — a única escrita.

```ts
/** Registra uma movimentação de estoque (entrada ou saída). */
export async function addStockMovement(formData: FormData) {
  const ctx = await getActiveContext();
  if (!ctx || !can(ctx.perms, "estoque", "criar")) throw new Error("Sem permissão.");
  const itemId = str(formData.get("itemId"));
  if (!itemId) throw new Error("Selecione o item.");
  const tipo = String(formData.get("tipo") ?? "entrada") === "saida" ? "saida" : "entrada";
  const quantidade = num(formData.get("quantidade"));
  if (quantidade <= 0) throw new Error("Quantidade deve ser maior que zero.");

  // Vínculos: só fazem sentido em entrada por compra (despesa) ou permuta.
  const despesaId = tipo === "entrada" ? str(formData.get("despesaId")) : null;
  const permutaId = tipo === "entrada" ? str(formData.get("permutaId")) : null;
  const responsavel = str(formData.get("responsavel")) || ctx.userEmail || null;

  await db.insert(schema.stockMovements).values({
    tenantId: ctx.tenant.id,
    itemId,
    projectId: str(formData.get("projectId")),
    tipo,
    origem: str(formData.get("origem")),
    quantidade: String(quantidade),
    custoUnit: String(num(formData.get("custoUnit"))),
    data: str(formData.get("data")),
    doc: str(formData.get("doc")),
    despesaId,
    permutaId,
    responsavel,
    obs: str(formData.get("obs")),
  });
  await logAudit({
    tenantId: ctx.tenant.id,
    userId: ctx.userId,
    action: "estoque.mov.create",
    entity: "stock_movement",
    entityId: itemId,
    meta: { tipo, quantidade, origem: str(formData.get("origem")) },
  });
  revalidatePath("/estoque");
}
```

---

## 7. Como o saldo de cada item é calculado


*(leitura assumida do pedido cortado — ver a nota no topo.)*

### 7.1 Onde

**No servidor, dentro do `page.tsx`** — não há coluna de saldo no banco, não
há função em `calc/`, não há agregação em SQL. São cinco linhas
(`estoque/page.tsx:27–32`):

```ts
// Saldo por item = entradas - saídas.
const saldo = new Map<string, number>();
for (const m of movements) {
  const q = Number(m.quantidade);
  saldo.set(m.itemId, (saldo.get(m.itemId) ?? 0) + (m.tipo === "saida" ? -q : q));
}
```

### 7.2 O que entra na conta

`movements` é o retorno de `getStockMovements(ctx.tenant.id)` — **todas** as
movimentações do tenant, sem `limit`, sem recorte de data e **sem filtro de
projeto**. Consequências:

- O saldo é **global do tenant**, não por obra. Uma saída lançada na obra A e
  uma entrada na obra B se somam no mesmo número, embora `stock_movement`
  tenha `project_id` e o `MovTab` permita filtrar a *listagem* por obra.
- Não há data de corte: o saldo é sempre o acumulado desde o primeiro
  lançamento.
- A classificação é binária: `"saida"` subtrai, **qualquer outro valor soma**.
  Uma linha com `tipo` gravado errado (a coluna é `text` livre) entra como
  entrada.
- `origem` não participa do cálculo. "Devolução ao fornecedor" e "Consumo na
  obra" pesam igual, porque as duas são `tipo = "saida"`.
- **O saldo pode ficar negativo.** Não há `Math.max(0, …)` aqui nem validação
  em `addStockMovement`, que só recusa `quantidade <= 0`. Dar baixa de 10
  unidades num item com saldo 3 é aceito sem aviso.

### 7.3 O valor em estoque

`valorEstoque = saldo × item.custoUnit` (`page.tsx:45`) — o custo **atual do
cadastro do item**, não o custo de cada movimentação. `stock_movement` tem seu
próprio `custo_unit` (`schema.ts:1507`), gravado por `addStockMovement`
(`estoque.ts:67`), mas ele **não entra na valoração**: é só exibido na listagem
de movimentações. Não há PEPS, UEPS nem custo médio — mudar o `custoUnit` do
item revaloriza todo o estoque retroativamente.

### 7.4 O que a tela deriva do saldo

| Indicador | Fórmula | Onde |
|---|---|---|
| Valor em estoque (total) | `Σ item.valorEstoque` | `estoque-manager.tsx:100` |
| Abaixo do mínimo | `items.filter(i => i.minimo > 0 && i.saldo <= i.minimo).length` | `estoque-manager.tsx:101` |
| Movimentações | contagem de `entrada` / `saida` | `estoque-manager.tsx:102–103` |

O alerta de mínimo é `<=`, não `<`: um item com saldo exatamente igual ao
mínimo já conta como abaixo. Item com `minimo = 0` nunca alerta, mesmo com
saldo negativo.

### 7.5 O estoque não chega a lugar nenhum além desta tela

`schema.stockItems` e `schema.stockMovements` aparecem em exatamente dois
arquivos: `actions/estoque.ts` (escrita) e `queries.ts` (leitura). As quatro
queries são importadas só por `estoque/page.tsx`. Nenhum relatório — DRE,
fluxo de caixa, consolidado, dashboard — lê estoque, e o valor em estoque não
entra em nenhum resultado contábil.

### `src/app/(app)/estoque/page.tsx` · linhas 20–47

O cálculo do saldo e a montagem das linhas, no `page.tsx`.

```tsx
  const [items, movements, despesas, permutas] = await Promise.all([
    getStockItems(ctx.tenant.id),
    getStockMovements(ctx.tenant.id),
    getDespesaOptions(ctx.tenant.id),
    getPermutaOptions(ctx.tenant.id),
  ]);

  // Saldo por item = entradas - saídas.
  const saldo = new Map<string, number>();
  for (const m of movements) {
    const q = Number(m.quantidade);
    saldo.set(m.itemId, (saldo.get(m.itemId) ?? 0) + (m.tipo === "saida" ? -q : q));
  }

  const itemViews = items.map((i) => {
    const s = saldo.get(i.id) ?? 0;
    return {
      id: i.id,
      sku: i.sku,
      nome: i.nome,
      unidade: i.unidade,
      categoria: i.categoria,
      custoUnit: Number(i.custoUnit),
      minimo: Number(i.minimo),
      saldo: s,
      valorEstoque: s * Number(i.custoUnit),
    };
  });
```

### `src/components/app/estoque-manager.tsx` · linhas 98–117

Os indicadores derivados, no `EstoqueManager`.

```tsx
  const [tab, setTab] = useState<Tab>("itens");

  const valorTotal = items.reduce((a, i) => a + i.valorEstoque, 0);
  const abaixoMin = items.filter((i) => i.minimo > 0 && i.saldo <= i.minimo).length;
  const entradas = movements.filter((m) => m.tipo === "entrada").length;
  const saidas = movements.filter((m) => m.tipo === "saida").length;

  return (
    <div className="space-y-5">
      {/* Quadro-resumo */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <Resumo label="Itens cadastrados" value={String(items.length)} />
        <Resumo label="Valor em estoque" value={brl0(valorTotal)} tone="accent" />
        <Resumo
          label="Abaixo do mínimo"
          value={String(abaixoMin)}
          tone={abaixoMin > 0 ? "neg" : undefined}
        />
        <Resumo label="Movimentações" value={`${entradas}↑ / ${saidas}↓`} />
      </div>
```
