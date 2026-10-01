"use client";

import { useState, useTransition } from "react";
import { setCartaoAtivo, updateCartao } from "@/lib/actions/cartoes";
import type { CartaoView } from "@/lib/queries";
import { cicloAberto, disponivelDoLimite } from "@/lib/calc/cartao-ciclo";
import { brl0, dateBR } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Input, Select } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Table, THead, TH, TR, TD } from "@/components/ui/table";
import { BANDEIRAS } from "@/components/app/cartao-form";

/**
 * Lista de cartões (Prompt U, 1.3): limite, usado no ciclo aberto e
 * disponível. `usado` vem da página (compras e parcelas vinculadas ao ciclo
 * aberto); 1.4: inativar em vez de excluir.
 */
export function CartoesManager({ cartoes, contas, usado, hoje, canEditar }: { cartoes: CartaoView[]; contas: { id: string; nome: string }[]; usado: Record<string, number>; hoje: string; canEditar: boolean }) {
  return (
    <Table>
      <THead>
        <tr>
          <TH>Cartão</TH>
          <TH>Titular</TH>
          <TH>Ciclo</TH>
          <TH>Conta que debita</TH>
          <TH className="text-right">Limite</TH>
          <TH className="text-right">Usado no ciclo</TH>
          <TH className="text-right">Disponível</TH>
          <TH>Rotativo</TH>
          <TH>Situação</TH>
          {canEditar && <TH className="text-right">Ações</TH>}
        </tr>
      </THead>
      <tbody>
        {cartoes.length === 0 ? (
          <TR>
            <TD colSpan={canEditar ? 10 : 9} className="py-8 text-center text-[var(--color-ink4)]">
              Nenhum cartão cadastrado.
            </TD>
          </TR>
        ) : (
          cartoes.map((c) => <Linha key={c.id} c={c} contas={contas} usado={usado[c.id] ?? 0} hoje={hoje} canEditar={canEditar} />)
        )}
      </tbody>
    </Table>
  );
}

function Linha({ c, contas, usado, hoje, canEditar }: { c: CartaoView; contas: { id: string; nome: string }[]; usado: number; hoje: string; canEditar: boolean }) {
  const [editando, setEditando] = useState(false);
  const [pending, start] = useTransition();
  const [erro, setErro] = useState<string | null>(null);
  const ciclo = cicloAberto(hoje, c);
  const disponivel = disponivelDoLimite(c.limite, usado);

  if (editando) {
    return (
      <TR>
        <TD colSpan={canEditar ? 10 : 9}>
          <form
            onSubmit={(e) => {
              e.preventDefault();
              const fd = new FormData(e.currentTarget);
              fd.set("id", c.id);
              setErro(null);
              start(async () => {
                const r = await updateCartao(fd);
                if (r.ok) setEditando(false);
                else setErro(r.error);
              });
            }}
            className="grid grid-cols-2 gap-2 py-1 sm:grid-cols-5"
          >
            <Input name="apelido" defaultValue={c.apelido} placeholder="Apelido" required aria-label="Apelido" />
            <Select name="bandeira" defaultValue={c.bandeira ?? ""} aria-label="Bandeira">
              <option value="">—</option>
              {BANDEIRAS.map((b) => (
                <option key={b}>{b}</option>
              ))}
            </Select>
            <Input name="ultimos4" defaultValue={c.ultimos4 ?? ""} maxLength={4} pattern="[0-9]{4}" placeholder="4 últimos" aria-label="4 últimos dígitos" />
            <Input name="titular" defaultValue={c.titular ?? ""} placeholder="Titular" aria-label="Titular" />
            <Input name="limite" type="number" step="0.01" min="0" defaultValue={c.limite ?? ""} placeholder="Limite" aria-label="Limite" />
            <Input name="diaFechamento" type="number" min={1} max={31} defaultValue={c.diaFechamento} aria-label="Dia de fechamento" required />
            <Input name="diaVencimento" type="number" min={1} max={31} defaultValue={c.diaVencimento} aria-label="Dia de vencimento" required />
            <Select name="bankAccountId" defaultValue={c.bankAccountId ?? ""} aria-label="Conta que debita">
              <option value="">— sem conta —</option>
              {contas.map((k) => (
                <option key={k.id} value={k.id}>
                  {k.nome}
                </option>
              ))}
            </Select>
            <Input name="taxaRotativo" type="number" step="0.01" min="0" max="100" defaultValue={c.taxaRotativo ?? ""} placeholder="Taxa rotativo % a.m." aria-label="Taxa do rotativo" />
            <div className="flex items-center gap-2">
              <Button type="submit" size="sm" disabled={pending}>
                Salvar
              </Button>
              <Button type="button" size="sm" variant="ghost" onClick={() => setEditando(false)}>
                Cancelar
              </Button>
            </div>
            {erro && (
              <p className="col-span-2 text-[12px] text-[var(--color-danger)] sm:col-span-5" role="alert">
                {erro}
              </p>
            )}
          </form>
        </TD>
      </TR>
    );
  }

  return (
    <TR className={!c.ativo ? "opacity-60" : undefined}>
      <TD className="font-medium text-[var(--color-ink)]">
        {c.apelido}
        <div className="text-[11px] text-[var(--color-ink3)]">
          {c.bandeira ?? "—"} {c.ultimos4 ? `· •••• ${c.ultimos4}` : ""}
        </div>
      </TD>
      <TD>{c.titular ?? "—"}</TD>
      <TD className="text-[12px]">
        fecha dia {c.diaFechamento} · vence dia {c.diaVencimento}
        {ciclo && <div className="text-[11px] text-[var(--color-ink3)]">aberta: fecha {dateBR(ciclo.fechamento)}, vence {dateBR(ciclo.vencimento)}</div>}
      </TD>
      <TD>{c.contaNome ?? <span className="text-[var(--color-ink4)]">sem conta</span>}</TD>
      <TD className="text-right font-[family-name:var(--font-mono)]">{c.limite == null ? "—" : brl0(c.limite)}</TD>
      <TD className="text-right font-[family-name:var(--font-mono)]">{brl0(usado)}</TD>
      <TD className="text-right font-[family-name:var(--font-mono)]">{disponivel == null ? "—" : <span className={disponivel < 0 ? "text-[var(--color-danger)]" : undefined}>{brl0(disponivel)}</span>}</TD>
      <TD className="text-[12px]">{c.taxaRotativo == null ? <span className="text-[var(--color-ink4)]">sem taxa — não projeta juro</span> : `${c.taxaRotativo}% a.m.`}</TD>
      <TD>
        <Badge tone={c.ativo ? "success" : "neutral"}>{c.ativo ? "ativo" : "inativo"}</Badge>
      </TD>
      {canEditar && (
        <TD className="text-right">
          <div className="flex justify-end gap-1">
            <Button size="sm" variant="ghost" onClick={() => setEditando(true)}>
              Editar
            </Button>
            <Button
              size="sm"
              variant="ghost"
              disabled={pending}
              onClick={() => {
                setErro(null);
                start(async () => {
                  const r = await setCartaoAtivo(c.id, !c.ativo);
                  if (!r.ok) setErro(r.error);
                });
              }}
            >
              {c.ativo ? "Inativar" : "Reativar"}
            </Button>
          </div>
          {erro && <p className="text-[11px] text-[var(--color-danger)]">{erro}</p>}
        </TD>
      )}
    </TR>
  );
}
