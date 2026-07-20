"use client";

import { useState } from "react";
import {
  createContaReceber,
  updateContaReceber,
  cancelarContaReceber,
} from "@/lib/actions/contas-receber";

/** Tipos de receita (definido no client — não pode vir de módulo "use server"). */
const TIPOS_RECEITA = ["Sinal", "Parcela mensal", "Outros", "Outras Receitas"] as const;
import type { ContaReceberRow } from "@/lib/queries";
import { brl0, dateBR } from "@/lib/utils";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input, Label, Select } from "@/components/ui/input";
import { MoneyInput } from "@/components/ui/money-input";
import { DateField } from "@/components/ui/date-field";
import { Badge } from "@/components/ui/badge";
import { Table, THead, TH, TR, TD } from "@/components/ui/table";

interface Opt {
  id: string;
  nome: string;
}
export interface UnitReceb {
  unitCode: string;
  projectName: string;
  clienteNome: string | null;
  descricao: string;
  dia: string;
  valor: number;
}

const statusTone = (s: string) =>
  s === "Recebido"
    ? "success"
    : s === "Parcialmente recebido"
      ? "warning"
      : s === "Cancelada"
        ? "neutral"
        : "warning";

/** Formulário de criação (client por causa do campo condicional "Outras Receitas"). */
function NovaConta({
  projetos,
  clientes,
  bancos,
  unidades,
}: {
  projetos: Opt[];
  clientes: Opt[];
  bancos: Opt[];
  unidades: string[];
}) {
  const [tipo, setTipo] = useState<string>("Sinal");
  const [valor, setValor] = useState("");
  return (
    <Card className="mb-5">
      <CardContent className="p-5">
        <h3 className="mb-3 text-sm font-semibold text-[var(--color-ink)]">Nova conta a receber</h3>
        <form action={createContaReceber} className="grid grid-cols-1 gap-3 sm:grid-cols-4">
          <div>
            <Label>Projeto *</Label>
            <Select name="projectId" defaultValue={projetos[0]?.id ?? ""} required>
              {projetos.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.nome}
                </option>
              ))}
            </Select>
          </div>
          <div>
            <Label>Tipo *</Label>
            <Select name="tipo" value={tipo} onChange={(e) => setTipo(e.target.value)}>
              {TIPOS_RECEITA.map((t) => (
                <option key={t} value={t}>
                  {t}
                </option>
              ))}
            </Select>
          </div>
          <div>
            <Label>Valor</Label>
            <MoneyInput name="valor" value={valor} onChange={setValor} />
          </div>
          <div>
            <Label>Vencimento</Label>
            <DateField name="vencimento" />
          </div>
          {tipo === "Outras Receitas" && (
            <div className="sm:col-span-4">
              <Label>Descrição (obrigatória para Outras Receitas) *</Label>
              <Input name="descricao" required placeholder="Origem/natureza da receita" />
            </div>
          )}
          {tipo !== "Outras Receitas" && (
            <div className="sm:col-span-2">
              <Label>Descrição</Label>
              <Input name="descricao" placeholder="Opcional" />
            </div>
          )}
          <div>
            <Label>Unidade (opcional)</Label>
            <Select name="unitCode" defaultValue="">
              <option value="">—</option>
              {unidades.map((u) => (
                <option key={u} value={u}>
                  {u}
                </option>
              ))}
            </Select>
          </div>
          <div>
            <Label>Cliente (opcional)</Label>
            <Select name="clienteId" defaultValue="">
              <option value="">—</option>
              {clientes.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.nome}
                </option>
              ))}
            </Select>
          </div>
          <div>
            <Label>Banco (opcional)</Label>
            <Select name="bancoId" defaultValue="">
              <option value="">—</option>
              {bancos.map((b) => (
                <option key={b.id} value={b.id}>
                  {b.nome}
                </option>
              ))}
            </Select>
          </div>
          <div className="flex items-end">
            <Button type="submit" className="w-full">
              Adicionar
            </Button>
          </div>
        </form>
      </CardContent>
    </Card>
  );
}

/** Linha editável de uma conta a receber. */
function ContaRow({
  c,
  projetos,
  canEditar,
  canExcluir,
}: {
  c: ContaReceberRow;
  projetos: Opt[];
  canEditar: boolean;
  canExcluir: boolean;
}) {
  const [edit, setEdit] = useState(false);
  const [tipo, setTipo] = useState(c.tipo);
  const [valor, setValor] = useState(String(c.valor));
  const [recebido, setRecebido] = useState(String(c.valorRecebido));
  if (edit) {
    return (
      <TR>
        <TD colSpan={7}>
          <form action={updateContaReceber} className="grid grid-cols-2 gap-2 py-2 sm:grid-cols-4">
            <input type="hidden" name="id" value={c.id} />
            <div>
              <Label>Projeto</Label>
              <Select name="projectId" defaultValue={c.projectId}>
                {projetos.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.nome}
                  </option>
                ))}
              </Select>
            </div>
            <div>
              <Label>Tipo</Label>
              <Select name="tipo" value={tipo} onChange={(e) => setTipo(e.target.value)}>
                {TIPOS_RECEITA.map((t) => (
                  <option key={t} value={t}>
                    {t}
                  </option>
                ))}
              </Select>
            </div>
            <div>
              <Label>Valor</Label>
              <MoneyInput name="valor" value={valor} onChange={setValor} />
            </div>
            <div>
              <Label>Vencimento</Label>
              <DateField name="vencimento" defaultValue={c.vencimento ?? ""} />
            </div>
            <div className={tipo === "Outras Receitas" ? "sm:col-span-4" : "sm:col-span-2"}>
              <Label>Descrição{tipo === "Outras Receitas" ? " *" : ""}</Label>
              <Input name="descricao" defaultValue={c.descricao ?? ""} required={tipo === "Outras Receitas"} />
            </div>
            <div>
              <Label>Status</Label>
              <Select name="status" defaultValue={c.status}>
                <option>A receber</option>
                <option>Parcialmente recebido</option>
                <option>Recebido</option>
              </Select>
            </div>
            <div>
              <Label>Valor recebido</Label>
              <MoneyInput name="valorRecebido" value={recebido} onChange={setRecebido} />
            </div>
            <div>
              <Label>Data recebimento</Label>
              <DateField name="dataRecebimento" defaultValue={c.dataRecebimento ?? ""} />
            </div>
            <input type="hidden" name="unitCode" value={c.unitCode ?? ""} />
            <input type="hidden" name="clienteId" value={c.clienteId ?? ""} />
            <input type="hidden" name="bancoId" value={c.bancoId ?? ""} />
            <div className="flex items-end gap-2 sm:col-span-4">
              <Button type="submit" size="sm">
                Salvar
              </Button>
              <Button type="button" size="sm" variant="ghost" onClick={() => setEdit(false)}>
                Cancelar
              </Button>
            </div>
          </form>
        </TD>
      </TR>
    );
  }
  return (
    <TR>
      <TD className="whitespace-nowrap">{c.projectName}</TD>
      <TD>{c.tipo}</TD>
      <TD className="max-w-[220px] truncate">{c.descricao ?? c.unitCode ?? "—"}</TD>
      <TD className="text-right font-[family-name:var(--font-mono)]">{brl0(c.valor)}</TD>
      <TD className="font-[family-name:var(--font-mono)] text-[var(--color-ink2)]">
        {c.vencimento ? dateBR(c.vencimento) : "—"}
      </TD>
      <TD>
        <Badge tone={statusTone(c.status)}>{c.status}</Badge>
      </TD>
      <TD className="text-right">
        <div className="flex items-center justify-end gap-3">
          {canEditar && (
            <button className="text-sm text-[var(--color-accent2)] hover:underline" onClick={() => setEdit(true)}>
              Editar
            </button>
          )}
          {canExcluir && (
            <form action={cancelarContaReceber}>
              <input type="hidden" name="id" value={c.id} />
              <button type="submit" className="text-sm text-[var(--color-danger)] hover:underline">
                Cancelar
              </button>
            </form>
          )}
        </div>
      </TD>
    </TR>
  );
}

export function ContasReceberManager({
  projetos,
  clientes,
  bancos,
  unidades,
  contas,
  unitReceb,
  canCriar,
  canEditar,
  canExcluir,
}: {
  projetos: Opt[];
  clientes: Opt[];
  bancos: Opt[];
  unidades: string[];
  contas: ContaReceberRow[];
  unitReceb: UnitReceb[];
  canCriar: boolean;
  canEditar: boolean;
  canExcluir: boolean;
}) {
  const totalManual = contas.reduce((a, c) => a + c.valor, 0);
  const totalVendas = unitReceb.reduce((a, r) => a + r.valor, 0);
  return (
    <div>
      {canCriar && <NovaConta projetos={projetos} clientes={clientes} bancos={bancos} unidades={unidades} />}

      <div className="mb-2 flex flex-wrap items-center gap-3 text-[13px]">
        <Badge tone="neutral">{contas.length} lançadas</Badge>
        <span className="text-[var(--color-ink3)]">
          Total lançado{" "}
          <strong className="font-[family-name:var(--font-mono)] text-[var(--color-ink)]">{brl0(totalManual)}</strong>
        </span>
      </div>
      <Card className="mb-8">
        <CardContent className="p-0">
          <div className="overflow-x-auto">
            <Table>
              <THead>
                <tr>
                  <TH>Projeto</TH>
                  <TH>Tipo</TH>
                  <TH>Descrição</TH>
                  <TH className="text-right">Valor</TH>
                  <TH>Vencimento</TH>
                  <TH>Status</TH>
                  <TH className="text-right">Ações</TH>
                </tr>
              </THead>
              <tbody>
                {contas.map((c) => (
                  <ContaRow key={c.id} c={c} projetos={projetos} canEditar={canEditar} canExcluir={canExcluir} />
                ))}
                {contas.length === 0 && (
                  <TR>
                    <TD colSpan={7} className="py-8 text-center text-[var(--color-ink4)]">
                      Nenhuma conta a receber lançada. Recebíveis das vendas aparecem abaixo.
                    </TD>
                  </TR>
                )}
              </tbody>
            </Table>
          </div>
        </CardContent>
      </Card>

      {/* Recebíveis originados em Unidades / Vendas (derivados do plano de pagamento). */}
      <h2 className="mb-2 font-[family-name:var(--font-mono)] text-[11px] uppercase tracking-wide text-[var(--color-ink3)]">
        Recebíveis das vendas (Unidades) · {brl0(totalVendas)}
      </h2>
      <Card>
        <CardContent className="p-0">
          <div className="max-h-[420px] overflow-auto">
            <Table>
              <THead>
                <tr>
                  <TH>Unidade</TH>
                  <TH>Projeto</TH>
                  <TH>Cliente</TH>
                  <TH>Descrição</TH>
                  <TH>Previsto</TH>
                  <TH className="text-right">Valor</TH>
                </tr>
              </THead>
              <tbody>
                {unitReceb.map((r, i) => (
                  <TR key={i}>
                    <TD className="font-medium">{r.unitCode}</TD>
                    <TD className="whitespace-nowrap">{r.projectName}</TD>
                    <TD className="text-[var(--color-ink3)]">{r.clienteNome ?? "—"}</TD>
                    <TD>{r.descricao}</TD>
                    <TD className="font-[family-name:var(--font-mono)] text-[var(--color-ink2)]">
                      {r.dia ? dateBR(r.dia) : "—"}
                    </TD>
                    <TD className="text-right font-[family-name:var(--font-mono)] text-[var(--color-success)]">
                      {brl0(r.valor)}
                    </TD>
                  </TR>
                ))}
                {unitReceb.length === 0 && (
                  <TR>
                    <TD colSpan={6} className="py-6 text-center text-[var(--color-ink4)]">
                      Sem recebíveis de vendas (unidades vendidas geram recebíveis pelo plano de pagamento).
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
