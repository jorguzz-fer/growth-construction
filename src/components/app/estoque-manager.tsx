"use client";

import { useMemo, useState } from "react";
import {
  addStockItem,
  addStockMovement,
  deleteStockItem,
} from "@/lib/actions/estoque";
import { brl0, dateBR } from "@/lib/utils";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input, Label, Select } from "@/components/ui/input";
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
  quantidade: number;
  custoUnit: number;
  data: string | null;
  doc: string | null;
  obs: string | null;
  projectName: string | null;
  clienteNome: string | null;
}
interface Projeto {
  id: string;
  nome: string;
}

function toISO(d: string | null): string {
  if (!d) return "";
  const p = d.split("/");
  return p.length === 3 ? `${p[2]}-${p[0].padStart(2, "0")}-${p[1].padStart(2, "0")}` : "";
}

type Tab = "itens" | "mov";

export function EstoqueManager({
  items,
  movements,
  projetos,
  canEdit,
  canExcluir,
}: {
  items: ItemView[];
  movements: MovView[];
  projetos: Projeto[];
  canEdit: boolean;
  canExcluir: boolean;
}) {
  const [tab, setTab] = useState<Tab>("itens");
  const valorTotal = items.reduce((a, i) => a + i.valorEstoque, 0);

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center gap-3">
        <div className="flex gap-1 rounded-[8px] bg-[var(--color-surface3)] p-1">
          {(["itens", "mov"] as Tab[]).map((t) => (
            <button
              key={t}
              onClick={() => setTab(t)}
              className={`rounded-[6px] px-3 py-1.5 text-xs transition-colors ${
                tab === t ? "bg-white text-[var(--color-ink)] shadow-sm" : "text-[var(--color-ink3)]"
              }`}
            >
              {t === "itens" ? "Itens & Saldo" : "Movimentações"}
            </button>
          ))}
        </div>
        <span className="text-[13px] text-[var(--color-ink3)]">
          {items.length} itens · valor em estoque{" "}
          <strong className="font-[family-name:var(--font-mono)] text-[var(--color-ink)]">{brl0(valorTotal)}</strong>
        </span>
      </div>

      {tab === "itens" ? (
        <ItensTab items={items} canEdit={canEdit} canExcluir={canExcluir} />
      ) : (
        <MovTab items={items} movements={movements} projetos={projetos} canEdit={canEdit} />
      )}
    </div>
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
              <div><Label>SKU</Label><Input name="sku" /></div>
              <div><Label>Unidade</Label><Input name="unidade" placeholder="un" /></div>
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
          <div className="overflow-x-auto">
            <Table>
              <THead>
                <tr>
                  <TH>Item</TH>
                  <TH>SKU</TH>
                  <TH>Categoria</TH>
                  <TH className="text-right">Custo unit.</TH>
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
                      <TD className="text-right font-[family-name:var(--font-mono)] font-semibold text-[var(--color-ink)]">
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
                  <TR><TD colSpan={canExcluir ? 7 : 6} className="py-8 text-center text-[var(--color-ink4)]">Nenhum item cadastrado.</TD></TR>
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
  canEdit,
}: {
  items: ItemView[];
  movements: MovView[];
  projetos: Projeto[];
  canEdit: boolean;
}) {
  const [produto, setProduto] = useState("");
  const [obra, setObra] = useState("");
  const [cliente, setCliente] = useState("");
  const [tipo, setTipo] = useState("");
  const [de, setDe] = useState("");
  const [ate, setAte] = useState("");

  const opts = useMemo(() => {
    const uniq = (xs: (string | null)[]) =>
      [...new Set(xs.filter((x): x is string => !!x))].sort((a, b) => a.localeCompare(b));
    return {
      produtos: uniq(movements.map((m) => m.itemNome)),
      obras: uniq(movements.map((m) => m.projectName)),
      clientes: uniq(movements.map((m) => m.clienteNome)),
    };
  }, [movements]);

  const filtered = useMemo(
    () =>
      movements.filter((m) => {
        if (produto && m.itemNome !== produto) return false;
        if (obra && m.projectName !== obra) return false;
        if (cliente && m.clienteNome !== cliente) return false;
        if (tipo && m.tipo !== tipo) return false;
        const iso = toISO(m.data);
        if (de && (!iso || iso < de)) return false;
        if (ate && (!iso || iso > ate)) return false;
        return true;
      }),
    [movements, produto, obra, cliente, tipo, de, ate],
  );

  return (
    <div className="space-y-4">
      {canEdit && items.length > 0 && (
        <Card>
          <CardContent className="p-5">
            <h3 className="mb-3 text-sm font-semibold text-[var(--color-ink)]">Nova movimentação</h3>
            <form action={addStockMovement} className="grid grid-cols-2 gap-3 sm:grid-cols-6">
              <div className="sm:col-span-2">
                <Label>Item</Label>
                <Select name="itemId" required defaultValue="">
                  <option value="" disabled>Selecione…</option>
                  {items.map((i) => <option key={i.id} value={i.id}>{i.nome}</option>)}
                </Select>
              </div>
              <div>
                <Label>Tipo</Label>
                <Select name="tipo" defaultValue="entrada">
                  <option value="entrada">Entrada</option>
                  <option value="saida">Saída</option>
                </Select>
              </div>
              <div><Label>Quantidade</Label><Input name="quantidade" type="number" step="0.001" required /></div>
              <div><Label>Custo unit.</Label><Input name="custoUnit" type="number" step="0.01" placeholder="0" /></div>
              <div>
                <Label>Obra</Label>
                <Select name="projectId" defaultValue="">
                  <option value="">— geral —</option>
                  {projetos.map((p) => <option key={p.id} value={p.id}>{p.nome}</option>)}
                </Select>
              </div>
              <div><Label>Data</Label><DateField name="data" /></div>
              <div><Label>Documento</Label><Input name="doc" /></div>
              <div className="sm:col-span-2"><Label>Observação</Label><Input name="obs" /></div>
              <div className="flex items-end"><Button type="submit" className="w-full">Registrar</Button></div>
            </form>
          </CardContent>
        </Card>
      )}

      <Card>
        <CardContent className="grid grid-cols-2 gap-3 p-4 sm:grid-cols-4 lg:grid-cols-6">
          <div><Label>De</Label><Input type="date" value={de} onChange={(e) => setDe(e.target.value)} /></div>
          <div><Label>Até</Label><Input type="date" value={ate} onChange={(e) => setAte(e.target.value)} /></div>
          <Filter label="Produto" value={produto} onChange={setProduto} options={opts.produtos} />
          <Filter label="Obra" value={obra} onChange={setObra} options={opts.obras} />
          <Filter label="Cliente" value={cliente} onChange={setCliente} options={opts.clientes} />
          <div>
            <Label>Tipo</Label>
            <Select value={tipo} onChange={(e) => setTipo(e.target.value)}>
              <option value="">Todos</option>
              <option value="entrada">Entrada</option>
              <option value="saida">Saída</option>
            </Select>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardContent className="p-0">
          <div className="overflow-x-auto">
            <Table>
              <THead>
                <tr>
                  <TH>Data</TH>
                  <TH>Item</TH>
                  <TH>Tipo</TH>
                  <TH className="text-right">Qtd</TH>
                  <TH className="text-right">Custo unit.</TH>
                  <TH>Obra</TH>
                  <TH>Cliente</TH>
                  <TH>Doc</TH>
                </tr>
              </THead>
              <tbody>
                {filtered.map((m) => (
                  <TR key={m.id}>
                    <TD className="font-[family-name:var(--font-mono)] text-[var(--color-ink2)]">{m.data ? dateBR(m.data) : "—"}</TD>
                    <TD className="font-medium text-[var(--color-ink)]">{m.itemNome}</TD>
                    <TD>
                      <Badge tone={m.tipo === "entrada" ? "success" : "danger"}>
                        {m.tipo === "entrada" ? "Entrada" : "Saída"}
                      </Badge>
                    </TD>
                    <TD className="text-right font-[family-name:var(--font-mono)]">
                      {m.quantidade.toLocaleString("pt-BR")} {m.unidade}
                    </TD>
                    <TD className="text-right font-[family-name:var(--font-mono)]">{brl0(m.custoUnit)}</TD>
                    <TD className="text-[var(--color-ink2)]">{m.projectName ?? "Geral"}</TD>
                    <TD className="text-[var(--color-ink3)]">{m.clienteNome ?? "—"}</TD>
                    <TD className="text-[var(--color-ink3)]">{m.doc ?? "—"}</TD>
                  </TR>
                ))}
                {filtered.length === 0 && (
                  <TR><TD colSpan={8} className="py-8 text-center text-[var(--color-ink4)]">Nenhuma movimentação.</TD></TR>
                )}
              </tbody>
            </Table>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

function Filter({
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
