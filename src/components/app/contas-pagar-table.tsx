"use client";

import { useMemo, useState } from "react";
import type { ContaPagarRow } from "@/lib/queries";
import { brl0, dateBR } from "@/lib/utils";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Input, Label, Select } from "@/components/ui/input";
import { Table, THead, TH, TR, TD } from "@/components/ui/table";

/** "MM/DD/YYYY" → "YYYY-MM-DD" para comparação de intervalo. */
function toISO(d: string | null): string {
  if (!d) return "";
  const p = d.split("/");
  if (p.length !== 3) return "";
  return `${p[2]}-${p[0].padStart(2, "0")}-${p[1].padStart(2, "0")}`;
}

const statusTone = (s: string | null) =>
  s === "Pago" ? "success" : s === "A pagar" ? "warning" : "neutral";

export function ContasPagarTable({ rows }: { rows: ContaPagarRow[] }) {
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
    return {
      fornecedores: uniq(rows.map((r) => r.fornecedorNome)),
      clientes: uniq(rows.map((r) => r.clienteNome ?? "Empreendimento próprio")),
      projetos: uniq(rows.map((r) => r.projectName)),
      categorias: uniq(rows.map((r) => r.categoriaDre)),
      status: uniq(rows.map((r) => r.status)),
    };
  }, [rows]);

  const filtered = useMemo(() => {
    return rows.filter((r) => {
      if (fornecedor && r.fornecedorNome !== fornecedor) return false;
      const cli = r.clienteNome ?? "Empreendimento próprio";
      if (cliente && cli !== cliente) return false;
      if (projeto && r.projectName !== projeto) return false;
      if (categoria && r.categoriaDre !== categoria) return false;
      if (status && r.status !== status) return false;
      const iso = toISO(r.vencimento);
      if (de && (!iso || iso < de)) return false;
      if (ate && (!iso || iso > ate)) return false;
      return true;
    });
  }, [rows, fornecedor, cliente, projeto, categoria, status, de, ate]);

  const total = filtered.reduce((a, r) => a + r.valor, 0);
  const totalPend = filtered
    .filter((r) => r.status !== "Pago")
    .reduce((a, r) => a + r.valor, 0);

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
          <FilterSelect label="Projeto" value={projeto} onChange={setProjeto} options={opts.projetos} />
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
        <button onClick={limpar} className="ml-auto text-[12px] text-[var(--color-accent2)] hover:underline">
          Limpar filtros
        </button>
      </div>

      <Card>
        <CardContent className="p-0">
          <div className="overflow-x-auto">
            <Table>
              <THead>
                <tr>
                  <TH>Fornecedor</TH>
                  <TH>Descrição</TH>
                  <TH>Categoria</TH>
                  <TH>Projeto (Obra)</TH>
                  <TH>Cliente</TH>
                  <TH className="text-right">Valor</TH>
                  <TH>Vencimento</TH>
                  <TH>Pagamento</TH>
                  <TH>Forma</TH>
                  <TH>Status</TH>
                </tr>
              </THead>
              <tbody>
                {filtered.map((r) => (
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
                    <TD><Badge tone={statusTone(r.status)}>{r.status ?? "—"}</Badge></TD>
                  </TR>
                ))}
                {filtered.length === 0 && (
                  <TR>
                    <TD colSpan={10} className="py-8 text-center text-[var(--color-ink4)]">
                      Nenhuma conta a pagar com os filtros aplicados.
                    </TD>
                  </TR>
                )}
              </tbody>
            </Table>
          </div>
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
