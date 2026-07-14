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
          <div className="overflow-x-auto">
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
          <div className="overflow-x-auto">
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
