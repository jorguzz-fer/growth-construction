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
