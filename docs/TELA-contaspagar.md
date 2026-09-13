# TELA-contaspagar — código na íntegra

Coleta do código da tela **Contas a Pagar** (`/contaspagar`), em `main`
(commit `45f4ce3`). Sem resumo, sem análise.

**Árvore de dependências própria:**

```
contaspagar/page.tsx
├── components/app/page-header.tsx
├── components/app/access-denied.tsx
│   └── components/app/page-header.tsx        (já listado)
└── components/app/contas-pagar-table.tsx
    └── components/app/sortable-th.tsx

query chamada:   getContasPagar
action chamada:  getObrigacoesTerceiroPendentes  (actions/restituicoes.ts)
                 — é leitura, não escrita; ver seção 4
```

> **Itens 7 e 8 dependem de DADOS de produção, não só de código.**
>
> Esta sessão não tem acesso ao banco de produção. As seções 7 e 8 trazem o
> que o código determina — e param onde só uma consulta responde, com o SQL
> somente-leitura pronto para você rodar.

---

## 1. Página

### `src/app/(app)/contaspagar/page.tsx`

```tsx
import { getActiveContext } from "@/lib/context";
import { getContasPagar, type ContaPagarRow } from "@/lib/queries";
import { getObrigacoesTerceiroPendentes } from "@/lib/actions/restituicoes";
import { rotuloStatusObrigacao } from "@/lib/calc/restituicao";
import { can } from "@/lib/permissions";
import { PageHeader } from "@/components/app/page-header";
import { AccessDenied } from "@/components/app/access-denied";
import { ContasPagarTable } from "@/components/app/contas-pagar-table";

export const dynamic = "force-dynamic";

export default async function ContasPagarPage() {
  const ctx = await getActiveContext();
  if (!ctx) return null;
  if (!can(ctx.perms, "contaspagar", "ver")) return <AccessDenied />;

  const podeVerObrigacoes = can(ctx.perms, "restituicoes", "ver");
  const [despesas, obrigacoes] = await Promise.all([
    getContasPagar(ctx.tenant.id),
    podeVerObrigacoes
      ? getObrigacoesTerceiroPendentes(ctx.tenant.id)
      : Promise.resolve([]),
  ]);

  // §11 — a obrigação com quem desembolsou aparece aqui como uma linha própria,
  // separada da despesa original. A despesa continua listada e continua sendo
  // reconhecida 1× na DRE, pela competência dela; esta linha é a dívida COM o
  // terceiro, com o saldo que ainda falta restituir.
  //
  // `origem: "obrigacao"` mantém as duas coisas distinguíveis para o total (uma
  // obrigação não é despesa nova — ver o rodapé de totais da tabela).
  const linhasObrigacao: ContaPagarRow[] = obrigacoes.map((o) => ({
    id: o.id,
    numDoc: o.numDoc,
    fornecedorNome: o.terceiro,
    descricao: o.descricao,
    categoriaDre: null,
    contaCef: null,
    valor: o.valorSaldo,
    vencimento: o.dataPrevista,
    competencia: o.competencia,
    dataPagamento: null,
    formaPagamento: "Restituição",
    status: rotuloStatusObrigacao(o.status),
    projectId: o.projectId,
    projectName: o.projectName,
    clienteId: null,
    clienteNome: null,
    origem: "obrigacao",
    obrigacaoId: o.obrigacaoId,
  }));

  const rows: ContaPagarRow[] = [...despesas, ...linhasObrigacao];

  return (
    <>
      <PageHeader
        eyebrow={ctx.tenant.name}
        title="Contas a Pagar"
        subtitle="Obrigações de todas as obras — filtre por período, fornecedor, cliente, projeto, categoria e status. Clique no cabeçalho para ordenar."
      />
      <ContasPagarTable rows={rows} canEditar={can(ctx.perms, "despesas", "editar")} />
    </>
  );
}
```

---

## 2. Componentes próprios

### `src/components/app/contas-pagar-table.tsx`

```tsx
"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import type { ContaPagarRow } from "@/lib/queries";
import { brl0, dateBR } from "@/lib/utils";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Input, Label, Select } from "@/components/ui/input";
import { Table, THead, TH, TR, TD } from "@/components/ui/table";
import { SortTH, useOrdenacaoTabela } from "@/components/app/sortable-th";
import type { ColunaOrdenavel } from "@/lib/tabela-ordenacao";

/** "MM/DD/YYYY" → "YYYY-MM-DD" para comparação de intervalo. */
function toISO(d: string | null): string {
  if (!d) return "";
  const p = d.split("/");
  if (p.length !== 3) return "";
  return `${p[2]}-${p[0].padStart(2, "0")}-${p[1].padStart(2, "0")}`;
}

const statusTone = (s: string | null) =>
  s === "Pago"
    ? "success"
    : s === "Vencida"
      ? "danger"
      : s === "Cancelada"
        ? "neutral"
        : s === "A pagar" || s === "Em aberto" || s === "Parcialmente paga"
          ? "warning"
          : "neutral";

/** Status exibido: "Vencida" é derivado automaticamente pela data de vencimento. */
function displayStatus(
  status: string | null,
  vencimento: string | null,
  hojeISO: string,
): string {
  if (status === "Pago" || status === "Cancelada" || status === "Parcialmente paga")
    return status;
  const iso =
    vencimento && vencimento.split("/").length === 3
      ? `${vencimento.split("/")[2]}-${vencimento.split("/")[0].padStart(2, "0")}-${vencimento.split("/")[1].padStart(2, "0")}`
      : "";
  if (iso && iso < hojeISO) return "Vencida";
  return status || "Em aberto";
}

export function ContasPagarTable({
  rows,
  canEditar = false,
}: {
  rows: ContaPagarRow[];
  canEditar?: boolean;
}) {
  const hoje = new Date();
  const hojeISO = `${hoje.getFullYear()}-${String(hoje.getMonth() + 1).padStart(2, "0")}-${String(hoje.getDate()).padStart(2, "0")}`;
  const [fornecedor, setFornecedor] = useState("");
  const [cliente, setCliente] = useState("");
  const [projeto, setProjeto] = useState("");
  const [categoria, setCategoria] = useState("");
  const [status, setStatus] = useState("");
  const [de, setDe] = useState("");
  const [ate, setAte] = useState("");

  const opts = useMemo(() => {
    const uniq = (xs: (string | null | undefined)[]) =>
      [...new Set(xs.filter((x): x is string => !!x))].sort((a, b) =>
        a.localeCompare(b),
      );
    // Projetos são identificados pelo ID REAL, nunca pelo nome: duas obras ou
    // filiais homônimas colapsariam num único filtro e vazariam dados entre si.
    const porId = new Map<string, string>();
    for (const r of rows) if (!porId.has(r.projectId)) porId.set(r.projectId, r.projectName);
    return {
      fornecedores: uniq(rows.map((r) => r.fornecedorNome)),
      clientes: uniq(rows.map((r) => r.clienteNome ?? "Empreendimento próprio")),
      projetos: [...porId]
        .map(([id, nome]) => ({ id, nome }))
        .sort((a, b) => a.nome.localeCompare(b.nome)),
      categorias: uniq(rows.map((r) => r.categoriaDre)),
      status: uniq(rows.map((r) => r.status)),
    };
  }, [rows]);

  const filtered = useMemo(() => {
    const out = rows.filter((r) => {
      if (fornecedor && r.fornecedorNome !== fornecedor) return false;
      const cli = r.clienteNome ?? "Empreendimento próprio";
      if (cliente && cli !== cliente) return false;
      // Filtro por ID real do projeto (não pelo nome) — isola obras/filiais.
      if (projeto && r.projectId !== projeto) return false;
      if (categoria && r.categoriaDre !== categoria) return false;
      if (status && r.status !== status) return false;
      const iso = toISO(r.vencimento);
      if (de && (!iso || iso < de)) return false;
      if (ate && (!iso || iso > ate)) return false;
      return true;
    });
    // Ordenação por vencimento usando datas reais (ISO), não strings BR:
    //  1) vencidas (mais antiga → recente), 2) a vencer (mais próxima → distante),
    //  3) pagas (por data de pagamento). Sem data vão para o fim do grupo.
    const bucket = (r: ContaPagarRow): number => {
      if (r.status === "Pago") return 2;
      const iso = toISO(r.vencimento);
      if (iso && iso < hojeISO) return 0; // vencida
      return 1; // a vencer (ou sem vencimento)
    };
    const keyDate = (r: ContaPagarRow): string => {
      const base = r.status === "Pago" ? toISO(r.dataPagamento) : toISO(r.vencimento);
      return base || "9999-12-31";
    };
    return out.sort((a, b) => {
      const ba = bucket(a);
      const bb = bucket(b);
      if (ba !== bb) return ba - bb;
      return keyDate(a).localeCompare(keyDate(b));
    });
  }, [rows, fornecedor, cliente, projeto, categoria, status, de, ate, hojeISO]);

  // §5 — ordenação estilo planilha. Aplicada SOBRE o conjunto já filtrado, na
  // íntegra (não só sobre a parte visível). Sem clique de cabeçalho, vale a
  // ordenação padrão acima (vencidas → a vencer → pagas).
  const colunas = useMemo<ColunaOrdenavel<ContaPagarRow>[]>(
    () => [
      { key: "fornecedor", tipo: "texto", get: (r) => r.fornecedorNome },
      { key: "descricao", tipo: "texto", get: (r) => r.descricao },
      { key: "categoria", tipo: "texto", get: (r) => r.categoriaDre },
      { key: "projeto", tipo: "texto", get: (r) => r.projectName },
      { key: "cliente", tipo: "texto", get: (r) => r.clienteNome ?? "Próprio" },
      { key: "valor", tipo: "valor", get: (r) => r.valor },
      { key: "vencimento", tipo: "data", get: (r) => r.vencimento },
      { key: "pagamento", tipo: "data", get: (r) => r.dataPagamento },
      { key: "forma", tipo: "texto", get: (r) => r.formaPagamento },
      // Ordena pelo status EXIBIDO (inclui "Vencida", que é derivado da data).
      { key: "status", tipo: "texto", get: (r) => displayStatus(r.status, r.vencimento, hojeISO) },
    ],
    [hojeISO],
  );
  const { rows: visiveis, estado, onSort } = useOrdenacaoTabela(
    filtered,
    colunas,
    (r) => r.id,
  );

  // Totais — uma obrigação de restituição NÃO é despesa nova: a despesa dela já
  // está listada (como "Pago", porque quem pagou o fornecedor foi o terceiro).
  // Por isso "Total" soma só as despesas, enquanto "Pendente" e "A restituir"
  // mostram o que de fato ainda vai sair do caixa da empresa. Somar as duas
  // coisas em "Total" contaria o mesmo fato duas vezes.
  const despesasFiltradas = filtered.filter((r) => r.origem !== "obrigacao");
  const obrigacoesFiltradas = filtered.filter((r) => r.origem === "obrigacao");
  const total = despesasFiltradas.reduce((a, r) => a + r.valor, 0);
  const totalPend = despesasFiltradas
    .filter((r) => r.status !== "Pago")
    .reduce((a, r) => a + r.valor, 0);
  const totalRestituir = obrigacoesFiltradas.reduce((a, r) => a + r.valor, 0);

  const limpar = () => {
    setFornecedor(""); setCliente(""); setProjeto("");
    setCategoria(""); setStatus(""); setDe(""); setAte("");
  };

  return (
    <div className="space-y-4">
      <Card>
        <CardContent className="grid grid-cols-2 gap-3 p-4 sm:grid-cols-4 lg:grid-cols-7">
          <div>
            <Label>De (vencimento)</Label>
            <Input type="date" value={de} onChange={(e) => setDe(e.target.value)} />
          </div>
          <div>
            <Label>Até</Label>
            <Input type="date" value={ate} onChange={(e) => setAte(e.target.value)} />
          </div>
          <FilterSelect label="Fornecedor" value={fornecedor} onChange={setFornecedor} options={opts.fornecedores} />
          <FilterSelect label="Cliente" value={cliente} onChange={setCliente} options={opts.clientes} />
          <div>
            <Label>Projeto</Label>
            <Select value={projeto} onChange={(e) => setProjeto(e.target.value)}>
              <option value="">Todos os projetos</option>
              {opts.projetos.map((p) => (
                <option key={p.id} value={p.id}>{p.nome}</option>
              ))}
            </Select>
          </div>
          <FilterSelect label="Categoria" value={categoria} onChange={setCategoria} options={opts.categorias} />
          <FilterSelect label="Status" value={status} onChange={setStatus} options={opts.status} />
        </CardContent>
      </Card>

      <div className="flex flex-wrap items-center gap-3 text-[13px]">
        <Badge tone="neutral">{filtered.length} contas</Badge>
        <span className="text-[var(--color-ink3)]">
          Total <strong className="font-[family-name:var(--font-mono)] text-[var(--color-ink)]">{brl0(total)}</strong>
        </span>
        <span className="text-[var(--color-ink3)]">
          Pendente <strong className="font-[family-name:var(--font-mono)] text-[var(--color-warning)]">{brl0(totalPend)}</strong>
        </span>
        {obrigacoesFiltradas.length > 0 && (
          <span
            className="text-[var(--color-ink3)]"
            title="Saldo devido a terceiros que pagaram fornecedores pela empresa. Não é despesa nova — a despesa já está listada acima."
          >
            A restituir{" "}
            <strong className="font-[family-name:var(--font-mono)] text-[var(--color-accent2)]">
              {brl0(totalRestituir)}
            </strong>
          </span>
        )}
        <button onClick={limpar} className="ml-auto text-[12px] text-[var(--color-accent2)] hover:underline">
          Limpar filtros
        </button>
      </div>

      <Card>
        <CardContent className="p-0">
          {/* Altura limitada: a rolagem (horizontal e vertical) acontece dentro
              da tabela, então a barra horizontal fica visível de imediato — sem
              precisar descer até o fim da página. Cabeçalho fixo ao rolar. */}
          <Table
            wrapperClassName="max-h-[70vh] scroll-x-always"
            className="min-w-[1200px]"
          >
            <THead className="sticky top-0 z-10">
                <tr>
                  <SortTH coluna="fornecedor" estado={estado} onSort={onSort}>Fornecedor</SortTH>
                  <SortTH coluna="descricao" estado={estado} onSort={onSort}>Descrição</SortTH>
                  <SortTH coluna="categoria" estado={estado} onSort={onSort}>Categoria</SortTH>
                  <SortTH coluna="projeto" estado={estado} onSort={onSort}>Projeto (Obra)</SortTH>
                  <SortTH coluna="cliente" estado={estado} onSort={onSort}>Cliente</SortTH>
                  <SortTH coluna="valor" estado={estado} onSort={onSort} className="text-right">Valor</SortTH>
                  <SortTH coluna="vencimento" estado={estado} onSort={onSort}>Vencimento</SortTH>
                  <SortTH coluna="pagamento" estado={estado} onSort={onSort}>Pagamento</SortTH>
                  <SortTH coluna="forma" estado={estado} onSort={onSort}>Forma</SortTH>
                  <SortTH coluna="status" estado={estado} onSort={onSort}>Status</SortTH>
                  {canEditar && <TH className="text-right">Ações</TH>}
                </tr>
              </THead>
              <tbody>
                {visiveis.map((r) => (
                  <TR key={r.id}>
                    <TD className="whitespace-nowrap font-medium text-[var(--color-ink)]">
                      {r.fornecedorNome ?? "—"}
                    </TD>
                    <TD className="max-w-[240px] truncate">{r.descricao ?? "—"}</TD>
                    <TD>{r.categoriaDre ?? "—"}</TD>
                    <TD className="whitespace-nowrap">{r.projectName}</TD>
                    <TD className="whitespace-nowrap text-[var(--color-ink3)]">
                      {r.clienteNome ?? "Próprio"}
                    </TD>
                    <TD className="text-right font-[family-name:var(--font-mono)]">{brl0(r.valor)}</TD>
                    <TD className="font-[family-name:var(--font-mono)] text-[var(--color-ink2)]">
                      {r.vencimento ? dateBR(r.vencimento) : "—"}
                    </TD>
                    <TD className="font-[family-name:var(--font-mono)] text-[var(--color-ink3)]">
                      {r.dataPagamento ? dateBR(r.dataPagamento) : "—"}
                    </TD>
                    <TD>{r.formaPagamento ?? "—"}</TD>
                    <TD>
                      {r.origem === "obrigacao" ? (
                        // Status da obrigação já vem no vocabulário da tela de
                        // Restituições; não passa por "Vencida" (a data aqui é
                        // uma previsão de restituição, não um vencimento).
                        <Badge tone="info">{r.status ?? "—"}</Badge>
                      ) : (
                        (() => {
                          const st = displayStatus(r.status, r.vencimento, hojeISO);
                          return <Badge tone={statusTone(st)}>{st}</Badge>;
                        })()
                      )}
                    </TD>
                    {canEditar && (
                      <TD className="text-right">
                        {r.origem === "obrigacao" ? (
                          <Link
                            href="/restituicoes"
                            className="text-sm text-[var(--color-accent2)] hover:underline"
                          >
                            Restituir
                          </Link>
                        ) : (
                          <Link
                            href={`/despesas?proj=${r.projectId}&tab=lancamentos&edit=${r.id}`}
                            className="text-sm text-[var(--color-accent2)] hover:underline"
                          >
                            Editar
                          </Link>
                        )}
                      </TD>
                    )}
                  </TR>
                ))}
                {visiveis.length === 0 && (
                  <TR>
                    <TD colSpan={canEditar ? 11 : 10} className="py-8 text-center text-[var(--color-ink4)]">
                      Nenhuma conta a pagar com os filtros aplicados.
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

function FilterSelect({
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
        {options.map((o) => (
          <option key={o} value={o}>{o}</option>
        ))}
      </Select>
    </div>
  );
}
```

### `src/components/app/sortable-th.tsx`

Importado por `contas-pagar-table.tsx`.

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

---

## 3. `getContasPagar` e `getObrigacoesTerceiroPendentes`

### `src/lib/queries.ts` · linhas 320–346

`ContaPagarRow` — o tipo que as duas fontes preenchem.

```ts
export interface ContaPagarRow {
  id: string;
  numDoc: string | null;
  fornecedorNome: string | null;
  descricao: string | null;
  categoriaDre: string | null;
  contaCef: string | null;
  valor: number;
  vencimento: string | null;
  competencia: string | null;
  dataPagamento: string | null;
  formaPagamento: string | null;
  status: string | null;
  projectId: string;
  projectName: string;
  clienteId: string | null;
  clienteNome: string | null;
  /**
   * "obrigacao" identifica as linhas de restituição a terceiros (§11), que a
   * tela de Contas a Pagar acrescenta às despesas. Ausente/"despesa" para tudo
   * que vem de `getContasPagar`, cujo retorno não mudou — ela também alimenta
   * Dashboard, Fechamento e a conciliação do extrato.
   */
  origem?: "despesa" | "obrigacao";
  /** ID da obrigação quando `origem === "obrigacao"`. */
  obrigacaoId?: string;
}
```

### `src/lib/queries.ts` · linhas 348–392

`getContasPagar` — filtra só por tenant e `cancelado = false`. **Não filtra por `project.kind`** (relevante para a seção 7) e **não filtra por status**.

```ts
/**
 * Contas a pagar do tenant: todas as despesas lançadas, com fornecedor,
 * projeto (obra) e cliente da obra. Base do módulo Contas a Pagar e do
 * painel esquerdo do Fechamento de Caixa.
 */
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

### `src/lib/actions/restituicoes.ts` · linhas 655–698

`getObrigacoesTerceiroPendentes` — apesar de viver em `actions/`, é leitura pura.

```ts
export async function getObrigacoesTerceiroPendentes(
  tenantId: string,
): Promise<ObrigacaoContaPagarRow[]> {
  const rows = await db
    .select({
      dt: schema.despesaTerceiros,
      numDoc: schema.despesas.numDoc,
      competencia: schema.despesas.competencia,
      terceiro: schema.stakeholders.nome,
      projectId: schema.projects.id,
      projectName: schema.projects.name,
    })
    .from(schema.despesaTerceiros)
    .innerJoin(schema.despesas, eq(schema.despesaTerceiros.despesaId, schema.despesas.id))
    .innerJoin(schema.versions, eq(schema.despesas.versionId, schema.versions.id))
    .innerJoin(schema.projects, eq(schema.versions.projectId, schema.projects.id))
    .leftJoin(
      schema.stakeholders,
      eq(schema.despesaTerceiros.pagadorTerceiroId, schema.stakeholders.id),
    )
    .where(
      and(
        eq(schema.despesaTerceiros.tenantId, tenantId),
        ne(schema.despesaTerceiros.status, "Cancelado"),
      ),
    );

  return rows
    .map((r) => ({
      id: `obr:${r.dt.id}`,
      obrigacaoId: r.dt.id,
      numDoc: r.numDoc,
      terceiro: r.terceiro,
      descricao: `Restituir a ${r.terceiro ?? "terceiro"} — ref. ${r.numDoc ?? "lançamento"}`,
      valorSaldo:
        Math.round((Number(r.dt.valorTotal) - Number(r.dt.valorRestituido)) * 100) / 100,
      dataPrevista: r.dt.dataPrevistaRestituicao,
      competencia: r.competencia,
      status: r.dt.status,
      projectId: r.projectId,
      projectName: r.projectName,
    }))
    .filter((r) => r.valorSaldo > 0.004);
}
```

---

## 4. Server Actions disparadas pela tela

**Nenhuma ação de escrita.** A tela é somente-leitura.

`getObrigacoesTerceiroPendentes` é importada de `@/lib/actions/restituicoes`,
mas é uma função de LEITURA — faz `select` e devolve; não grava, não chama
`logAudit` e não chama `revalidatePath`. Está em `actions/` por convivência
com as actions de restituição, não por ser uma.

A prop `canEditar` é passada à tabela (`page.tsx`, última linha), mas dentro
de `contas-pagar-table.tsx` ela só controla a exibição do link “Editar”, que
leva para `/despesas`. Nenhuma escrita acontece nesta tela.

---

## 5. Como “Total”, “Pendente” e “A restituir” são calculados

Os três saem de `contas-pagar-table.tsx`, linhas 151–157, e operam sobre
`filtered` — ou seja, **respeitam os filtros ativos**, não a base inteira.

```ts
// Totais — uma obrigação de restituição NÃO é despesa nova: a despesa dela já
// está listada (como "Pago", porque quem pagou o fornecedor foi o terceiro).
// Por isso "Total" soma só as despesas, enquanto "Pendente" e "A restituir"
// mostram o que de fato ainda vai sair do caixa da empresa. Somar as duas
// coisas em "Total" contaria o mesmo fato duas vezes.
const despesasFiltradas = filtered.filter((r) => r.origem !== "obrigacao");
const obrigacoesFiltradas = filtered.filter((r) => r.origem === "obrigacao");
const total = despesasFiltradas.reduce((a, r) => a + r.valor, 0);
const totalPend = despesasFiltradas
  .filter((r) => r.status !== "Pago")
  .reduce((a, r) => a + r.valor, 0);
const totalRestituir = obrigacoesFiltradas.reduce((a, r) => a + r.valor, 0);
```

| Indicador | Base | Filtro aplicado | Valor somado |
|---|---|---|---|
| **Total** | só linhas `origem !== "obrigacao"` | nenhum além dos filtros da tela | `r.valor` de **todas** as despesas, pagas e a pagar |
| **Pendente** | idem | `r.status !== "Pago"` | `r.valor` **cheio** de cada despesa |
| **A restituir** | só linhas `origem === "obrigacao"` | nenhum | `r.valor`, que para obrigações é `o.valorSaldo` |

Três consequências que decorrem direto do código:

- **“Total” inclui o que já foi pago.** Soma `r.valor` sem olhar status. O
  comentário explica por que obrigações ficam de fora, mas não separa pago de
  a pagar.
- **“Pendente” usa o valor CHEIO da despesa.** O filtro é
  `r.status !== "Pago"`, e o valor somado é `r.valor`, que vem de
  `Number(r.d.valor)` em `getContasPagar` — o valor da despesa, não o saldo.
  Uma despesa com status `"Parcialmente paga"` entra **inteira**. Não há
  subtração de `valorPago` nem consulta a `despesa_parcela` ou `pagamento`
  em nenhum ponto desta tela.
- **“Pendente” não separa vencido de a vencer.** O único critério é o status.
  Os filtros de data (`de`/`ate`) agem sobre `vencimento`, mas são escolha do
  usuário, não parte do cálculo.

- **“A restituir”** é o único dos três que usa saldo: `o.valorSaldo` vem de
  `getObrigacoesTerceiroPendentes`. E só aparece na tela quando há pelo menos
  uma obrigação no resultado filtrado (guarda na linha 200).

---

## 6. Como “Vencida” é determinado, e o que o filtro usa

### Determinação: derivada da data, no cliente

`contas-pagar-table.tsx`, linhas 33–47:

```ts
/** Status exibido: "Vencida" é derivado automaticamente pela data de vencimento. */
function displayStatus(
  status: string | null,
  vencimento: string | null,
  hojeISO: string,
): string {
  if (status === "Pago" || status === "Cancelada" || status === "Parcialmente paga")
    return status;
  const iso =
    vencimento && vencimento.split("/").length === 3
      ? `${vencimento.split("/")[2]}-${vencimento.split("/")[0].padStart(2, "0")}-${vencimento.split("/")[1].padStart(2, "0")}`
      : "";
  if (iso && iso < hojeISO) return "Vencida";
  return status || "Em aberto";
}
```

`hojeISO` é montado no corpo do componente a partir de `new Date()` — logo,
**no relógio do navegador do usuário**, não do servidor.

`"Vencida"` **não existe no banco**: nunca é gravado em `despesa.status`.
É um rótulo calculado a cada render.

### O filtro: usa o status PERSISTIDO

Três linhas contam a história:

| Linha | Código | O que faz |
|---|---|---|
| 82 | `status: uniq(rows.map((r) => r.status))` | monta as opções do dropdown a partir do status **gravado** |
| 94 | `if (status && r.status !== status) return false;` | filtra comparando com o status **gravado** |
| 268 | `const st = displayStatus(r.status, r.vencimento, hojeISO);` | exibe o status **derivado** |

Ou seja: a coluna mostra `displayStatus`, o filtro compara `r.status`.
**`"Vencida"` nunca aparece como opção do dropdown**, porque `opts.status` só
contém valores presentes na coluna do banco — e `"Vencida"` não é um deles.

A ordenação, por outro lado, usa o derivado (linha 136):

```ts
// Ordena pelo status EXIBIDO (inclui "Vencida", que é derivado da data).
{ key: "status", tipo: "texto", get: (r) => displayStatus(r.status, r.vencimento, hojeISO) },
```

E o agrupamento do `sort` padrão (linhas 104–110) usa um terceiro critério:
`bucket` compara `toISO(r.vencimento) < hojeISO` para separar vencidas, mas
classifica como “paga” só quem tem `r.status === "Pago"` — deixando
`"Parcialmente paga"` no grupo das vencidas ou a vencer.

---

## 7. O projeto “DESPESAS GERAIS ITANHAÉM”

### O que o código determina

`project.kind` é um enum de dois valores (`schema.ts:176`):

```ts
export const projectKindEnum = pgEnum("project_kind", ["proj", "office"]);
```

Um projeto `office` é criado por `createProject(nome, null, { kind: "office" })`
e nasce **sem cronograma**: `actions/projects.ts`, linhas 88 e 100–104, força
`durationMonths`, `startDate`, `endDate`, `mesInicial`, `mesFinal` e
`clienteId` a `null` quando o kind é `office`.

Isso casa com o print: cliente “Próprio” é como a tela exibe `clienteId = null`.

### Como `office` entra em cada lugar

| Onde | Arquivo | Linha | Tratamento |
|---|---|---|---|
| **Contas a Pagar** | `src/lib/queries.ts` | 348–392 | **entra normalmente** — `getContasPagar` não filtra por `kind` |
| Despesas (origem) | `src/lib/queries.ts` | 316 | rotula `Filial/Matriz · <nome>` |
| Budget/Forecast — período | `src/lib/queries.ts` | 778–781 | sem cronograma, usa **ano atual + 5 anos** |
| Budget/Forecast — rótulo | `src/lib/queries.ts` | 1373–1374 | `nome` ganha ` · Filial/Matriz` e marca `office: true` |
| Importação do realizado | `src/lib/actions/budget.ts` | 481, 490 | **exclui** custo CEF: `if (line.cef && officeIds.has(line.projectId)) continue;` |
| Seletor de projeto | `project-manager.tsx`, `project-switcher.tsx` | 83–84, 76–77 | listados em seção separada, “Unidades / Escritórios” |
| `/projeto`, `/budget`, `/forecast` | páginas | 65, 30, 45 | rótulo ` · Matriz/Filial` no dropdown |

O único ponto do repositório que **exclui** um projeto por ser `office` é
`budget.ts:490`, e só para linhas de custo CEF. Em todo o resto — Contas a
Pagar, DRE, Fluxo, Consolidado — ele entra como qualquer projeto.

### O que só o banco responde

Se **este** projeto é `office` ou `proj` não está no código. Rode:

```sql
-- somente leitura
SELECT id, name, kind, status, cliente_id, start_date, end_date,
       mes_inicial, mes_final, duration_months
  FROM project
 WHERE name ILIKE '%DESPESAS GERAIS%';
```

Se vier `kind = 'proj'` com `cliente_id` nulo, ele é um empreendimento comum
servindo de guarda-chuva — e aí **não** ganha nenhum dos tratamentos da tabela
acima: nem o rótulo `Filial/Matriz`, nem o período de 5 anos, nem a exclusão
de CEF na importação do realizado.

---

## 8. Por que existem PEDs em duas faixas

### Antes: o que a coluna “Descrição” mostra

Os PEDs que aparecem na coluna Descrição **não são descrições** — são o
fallback do campo. `getContasPagar`, na montagem da linha:

```ts
descricao: r.d.obs ?? r.d.numDoc,
```

Despesa sem `obs` preenchido exibe o próprio `num_doc` na coluna Descrição.
Por isso os PEDs aparecem ali.

### O que o código garante sobre a numeração

| Caminho | Arquivo | O que faz com `num_doc` |
|---|---|---|
| `addDespesa` | `actions/despesas.ts:326` | **sempre** `reserveDespesaNumber(tenantId)` — nunca aceita número digitado |
| Parcelas recorrentes | `actions/despesas.ts:537` | idem, um número novo por parcela |
| `updateDespesa` | `actions/despesas.ts:630` | **recusa** alterar: lança erro “O nº do pedido (PED) é numeração interna e não pode ser alterado” |
| Importação de planilha | `actions/version-io.ts:88–93` | **não grava `numDoc`** — as despesas importadas ficam com `num_doc = NULL` |
| Tela Numeração | `actions/numeracao.ts:56` | permite ao usuário definir `prefix`, `digits` e **`nextNumber` livremente** (mín. 1) |

E a semente da sequência, em `src/lib/db/numbering.ts`:

### `src/lib/db/numbering.ts` · linhas 4–16

`maxExistingDespesaNumber` — varre `num_doc`, extrai o sufixo numérico com `/(\d+)\s*$/` e devolve o maior.

```ts
/** Maior sufixo numérico já usado em `despesa.numDoc` (semente da sequência). */
async function maxExistingDespesaNumber(tenantId: string): Promise<number> {
  const rows = await db
    .select({ n: schema.despesas.numDoc })
    .from(schema.despesas)
    .where(eq(schema.despesas.tenantId, tenantId));
  let max = 0;
  for (const r of rows) {
    const m = r.n?.match(/(\d+)\s*$/);
    if (m) max = Math.max(max, parseInt(m[1], 10));
  }
  return max;
}
```

### `src/lib/db/numbering.ts` · linhas 18–64

`reserveDespesaNumber` — a semente só é calculada **uma vez**, no `if (!seq)`. Depois disso `nextNumber` apenas incrementa.

```ts
/**
 * Reserva o próximo número da sequência de Despesas de forma ATÔMICA no banco.
 * A linha da sequência é criada (semeada pelo maior número existente) na
 * primeira vez; a reserva usa `UPDATE ... RETURNING` (statement único) dentro
 * de uma transação, então dois lançamentos simultâneos recebem números
 * distintos — nunca duplicados, nunca reutilizando números excluídos.
 */
export async function reserveDespesaNumber(tenantId: string): Promise<string> {
  return db.transaction(async (tx) => {
    const [seq] = await tx
      .select()
      .from(schema.numberSequences)
      .where(
        and(
          eq(schema.numberSequences.tenantId, tenantId),
          eq(schema.numberSequences.entity, "despesa"),
        ),
      )
      .limit(1);

    if (!seq) {
      const start = (await maxExistingDespesaNumber(tenantId)) + 1;
      await tx
        .insert(schema.numberSequences)
        .values({ tenantId, entity: "despesa", nextNumber: start })
        .onConflictDoNothing();
    }

    const [updated] = await tx
      .update(schema.numberSequences)
      .set({
        nextNumber: sql`${schema.numberSequences.nextNumber} + 1`,
        updatedAt: new Date(),
      })
      .where(
        and(
          eq(schema.numberSequences.tenantId, tenantId),
          eq(schema.numberSequences.entity, "despesa"),
        ),
      )
      .returning();

    const used = updated.nextNumber - 1;
    const num = String(used).padStart(updated.digits, "0");
    return updated.usePrefix && updated.prefix ? `${updated.prefix}-${num}` : num;
  });
}
```

### `src/lib/actions/numeracao.ts` · linhas 55–99

`updateDespesaSequence` — grava `nextNumber` com o valor que o usuário digitar, para cima ou para baixo.

```ts
/** Atualiza a configuração da sequência (somente quem pode editar a tela). */
export async function updateDespesaSequence(patch: SequenceConfig) {
  const ctx = await getActiveContext();
  if (!ctx || !can(ctx.perms, "numeracao", "editar")) {
    throw new Error("Sem permissão para configurar a numeração.");
  }
  const prefix = (patch.prefix || "").trim().slice(0, 12);
  const digits = Math.min(12, Math.max(1, Math.trunc(patch.digits) || 6));
  const nextNumber = Math.max(1, Math.trunc(patch.nextNumber) || 1);
  const before = await getDespesaSequence(ctx.tenant.id);

  await db
    .insert(schema.numberSequences)
    .values({
      tenantId: ctx.tenant.id,
      entity: "despesa",
      prefix,
      usePrefix: !!patch.usePrefix,
      digits,
      nextNumber,
      active: !!patch.active,
      updatedAt: new Date(),
    })
    .onConflictDoUpdate({
      target: [schema.numberSequences.tenantId, schema.numberSequences.entity],
      set: {
        prefix,
        usePrefix: !!patch.usePrefix,
        digits,
        nextNumber,
        active: !!patch.active,
        updatedAt: new Date(),
      },
    });

  await logAudit({
    tenantId: ctx.tenant.id,
    userId: ctx.userId,
    action: "numeracao.update",
    entity: "number_sequence",
    meta: { before, after: { prefix, usePrefix: !!patch.usePrefix, digits, nextNumber, active: !!patch.active } },
  });
  revalidatePath("/numeracao");
  revalidatePath("/despesas");
}
```

### `src/lib/db/schema.ts` · linhas 1324–1347

Tabela `number_sequence`.

```ts
/**
 * Sequência numérica configurável por tenant/entidade (ex.: numeração das
 * Despesas). O próximo número é reservado de forma atômica no banco
 * (UPDATE ... RETURNING dentro de transação), evitando duplicidade sob
 * concorrência. `nextNumber` é semeado a partir do maior número já existente.
 */
export const numberSequences = pgTable(
  "number_sequence",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    tenantId: uuid("tenant_id")
      .notNull()
      .references(() => tenants.id, { onDelete: "cascade" }),
    /** entidade numerada, ex.: "despesa". */
    entity: text("entity").notNull().default("despesa"),
    prefix: text("prefix").notNull().default("PED"),
    usePrefix: boolean("use_prefix").notNull().default(true),
    digits: integer("digits").notNull().default(6),
    nextNumber: bigint("next_number", { mode: "number" }).notNull().default(1),
    active: boolean("active").notNull().default(true),
    updatedAt: timestamp("updated_at", { mode: "date" }).notNull().defaultNow(),
  },
  (t) => [unique("number_sequence_tenant_entity_uq").on(t.tenantId, t.entity)],
);
```

### O que decorre disso

- **Não há `UNIQUE` em `despesa.num_doc`** — verificado: nenhuma migração cria
  índice único ou constraint sobre a coluna. Duas despesas podem ter o mesmo
  PED sem o banco reclamar.
- **A semente é calculada uma única vez.** Se registros na faixa 026xxx
  chegaram depois de a linha de `number_sequence` já existir, a sequência
  nunca soube deles.
- **A importação de planilha não gera PED.** Despesas vindas por ali têm
  `num_doc` nulo, então não seriam a origem da faixa 026xxx.
- Dentro da aplicação, o **único** caminho que produz um salto de faixa é
  alguém definir `nextNumber` na tela Numeração.

### O que só o banco responde

Qual das hipóteses ocorreu — e se há risco de colisão agora — depende dos
dados. Três consultas somente-leitura:

```sql
-- 1) As faixas que existem de fato, e quantos registros em cada
SELECT length(regexp_replace(num_doc, '\D', '', 'g')) AS digitos,
       min(num_doc) AS menor, max(num_doc) AS maior, count(*) AS qtd
  FROM despesa
 WHERE num_doc IS NOT NULL
 GROUP BY 1 ORDER BY 1;

-- 2) Onde a sequência está hoje, contra o maior número já usado
SELECT ns.prefix, ns.digits, ns.next_number,
       (SELECT max((regexp_match(num_doc, '(\d+)\s*$'))[1]::bigint)
          FROM despesa d WHERE d.tenant_id = ns.tenant_id) AS maior_usado
  FROM number_sequence ns
 WHERE ns.entity = 'despesa';

-- 3) Já existe PED repetido?
SELECT num_doc, count(*) FROM despesa
 WHERE num_doc IS NOT NULL
 GROUP BY num_doc HAVING count(*) > 1;
```

A consulta 2 é a que responde o risco: se `next_number` estiver **abaixo** de
`maior_usado`, a sequência vai reemitir números que já existem — e, sem
`UNIQUE` na coluna, o banco aceitará.
