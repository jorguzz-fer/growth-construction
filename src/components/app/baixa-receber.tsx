"use client";

import { useEffect, useRef, useState } from "react";
import {
  baixarContaReceber,
  estornarBaixaContaReceber,
} from "@/lib/actions/contas-receber";
import { baixaCabe, saldoAReceber } from "@/lib/calc/baixa-receber";
import type { ContaReceberRow } from "@/lib/queries";
import { brl0, dateBR } from "@/lib/utils";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input, Label, Select } from "@/components/ui/input";
import { MoneyInput } from "@/components/ui/money-input";
import { DateField } from "@/components/ui/date-field";
import { Badge } from "@/components/ui/badge";

interface Opt {
  id: string;
  nome: string;
}

/** Hoje em "MM/DD/YYYY" — formato interno de data usado no app. */
function hojeInterno(): string {
  const d = new Date();
  return `${String(d.getMonth() + 1).padStart(2, "0")}/${String(d.getDate()).padStart(2, "0")}/${d.getFullYear()}`;
}

/** "1.234,56" ou "1234.56" → number. Vazio vira 0. */
function paraNumero(v: string): number {
  const t = (v ?? "").replace(/[R$\s]/g, "");
  const s = /,\d{1,2}$/.test(t) ? t.replace(/\./g, "").replace(",", ".") : t.replace(/,/g, "");
  const n = Number(s);
  return Number.isFinite(n) ? n : 0;
}

/**
 * Selo de situação do recebimento, exibido na linha da conta.
 *
 * Distingue as duas formas de a receita ser dada como recebida:
 *  · "Conciliada no caixa" — casou com um movimento do extrato bancário;
 *  · "Baixa manual" — confirmada aqui, sem passar pelo extrato.
 * A distinção importa: só a segunda pode ser estornada nesta tela.
 */
export function SeloBaixa({ c }: { c: ContaReceberRow }) {
  if (c.baixas.length === 0) return null;
  const doCaixa = c.baixas.some((b) => b.origem === "caixa");
  const ultima = c.baixas[c.baixas.length - 1];
  return (
    <Badge
      tone={doCaixa ? "info" : "success"}
      title={
        doCaixa
          ? "Recebimento conciliado com o extrato no Caixa Diário."
          : "Recebimento confirmado nesta tela (baixa manual)."
      }
    >
      {doCaixa ? "Conciliada no caixa" : "Baixa manual"}
      {ultima.data ? ` · ${dateBR(ultima.data)}` : ""}
    </Badge>
  );
}

/**
 * Painel de baixa de uma conta a receber.
 *
 * Registrar a baixa NÃO cria receita: ela só move o valor de "a receber" para o
 * caixa. O reconhecimento da receita segue o regime de competência, pelo plano
 * de pagamento da venda. É isso que o aviso no rodapé do painel explica ao
 * usuário, para ninguém achar que precisa lançar a receita de novo.
 */
export function PainelBaixa({
  conta,
  bancos,
  aberto,
  onFechar,
}: {
  conta: ContaReceberRow;
  bancos: Opt[];
  aberto: boolean;
  onFechar: () => void;
}) {
  const saldo = saldoAReceber(conta.valor, conta.valorRecebido);
  const [valor, setValor] = useState(String(saldo));
  const [data, setData] = useState(hojeInterno());
  const [bancoId, setBancoId] = useState(conta.bancoId ?? "");
  const [obs, setObs] = useState("");
  const [erro, setErro] = useState<string | null>(null);
  const [salvando, setSalvando] = useState(false);
  const dialogRef = useRef<HTMLDivElement>(null);

  // Ao reabrir, o valor volta a sugerir o saldo atual da conta (que pode ter
  // mudado por uma conciliação no caixa desde a última vez).
  useEffect(() => {
    if (aberto) {
      setValor(String(saldoAReceber(conta.valor, conta.valorRecebido)));
      setData(hojeInterno());
      setBancoId(conta.bancoId ?? "");
      setObs("");
      setErro(null);
      dialogRef.current?.focus();
    }
  }, [aberto, conta.valor, conta.valorRecebido, conta.bancoId]);

  useEffect(() => {
    if (!aberto) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onFechar();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [aberto, onFechar]);

  if (!aberto) return null;

  const valorNum = paraNumero(valor);
  const cabe = baixaCabe(conta.valor, conta.valorRecebido, valorNum);
  const restante = saldoAReceber(conta.valor, conta.valorRecebido + valorNum);

  const confirmar = async () => {
    setErro(null);
    if (!cabe) {
      setErro(
        valorNum > 0
          ? `Valor acima do saldo em aberto (${brl0(saldo)}).`
          : "Informe um valor maior que zero.",
      );
      return;
    }
    if (!data) {
      setErro("Informe a data do recebimento.");
      return;
    }
    setSalvando(true);
    const res = await baixarContaReceber({
      contaId: conta.id,
      valor: valorNum,
      data,
      bancoId: bancoId || null,
      obs: obs || null,
    });
    setSalvando(false);
    if (!res.ok) {
      setErro(res.error ?? "Não foi possível registrar a baixa.");
      return;
    }
    onFechar();
  };

  const estornar = async (cashEntryId: string) => {
    setErro(null);
    setSalvando(true);
    const res = await estornarBaixaContaReceber({ contaId: conta.id, cashEntryId });
    setSalvando(false);
    if (!res.ok) {
      setErro(res.error ?? "Não foi possível estornar a baixa.");
      return;
    }
    onFechar();
  };

  return (
    <div
      onClick={onFechar}
      className="fixed inset-0 z-[120] flex items-start justify-center overflow-y-auto bg-black/45 p-3 sm:p-6"
    >
      <Card
        className="my-auto w-full max-w-2xl"
        onClick={(e: React.MouseEvent) => e.stopPropagation()}
      >
        <CardContent className="p-5">
          <div ref={dialogRef} tabIndex={-1} className="outline-none">
            <div className="mb-4 flex flex-wrap items-start justify-between gap-3">
              <div>
                <h2 className="text-lg font-semibold text-[var(--color-ink)]">
                  Dar baixa no recebimento
                </h2>
                <p className="mt-0.5 text-[12.5px] text-[var(--color-ink3)]">
                  {conta.descricao ?? conta.unitCode ?? conta.tipo} · {conta.projectName}
                </p>
              </div>
              <button
                type="button"
                onClick={onFechar}
                className="text-sm text-[var(--color-ink3)] hover:text-[var(--color-ink)]"
                aria-label="Fechar"
              >
                Fechar
              </button>
            </div>

            {/* Situação atual da conta: o que ela vale, o que já entrou, o que falta. */}
            <div className="mb-4 grid grid-cols-3 gap-3 rounded-md border border-[var(--color-line)] bg-[var(--color-surface2)] p-3">
              <div>
                <div className="text-[10.5px] uppercase tracking-wide text-[var(--color-ink3)]">
                  Valor da conta
                </div>
                <div className="font-[family-name:var(--font-mono)] text-[15px] text-[var(--color-ink)]">
                  {brl0(conta.valor)}
                </div>
              </div>
              <div>
                <div className="text-[10.5px] uppercase tracking-wide text-[var(--color-ink3)]">
                  Já recebido
                </div>
                <div className="font-[family-name:var(--font-mono)] text-[15px] text-[var(--color-ink)]">
                  {brl0(conta.valorRecebido)}
                </div>
              </div>
              <div>
                <div className="text-[10.5px] uppercase tracking-wide text-[var(--color-ink3)]">
                  Saldo em aberto
                </div>
                <div className="font-[family-name:var(--font-mono)] text-[15px] font-semibold text-[var(--color-ink)]">
                  {brl0(saldo)}
                </div>
              </div>
            </div>

            {saldo > 0 && (
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-4">
                <div>
                  <Label>Valor recebido *</Label>
                  <MoneyInput value={valor} onChange={setValor} />
                </div>
                <div>
                  <Label>Data do recebimento *</Label>
                  <DateField value={data} onChange={setData} />
                </div>
                <div className="sm:col-span-2">
                  <Label>Conta que recebeu</Label>
                  <Select value={bancoId} onChange={(e) => setBancoId(e.target.value)}>
                    <option value="">—</option>
                    {bancos.map((b) => (
                      <option key={b.id} value={b.id}>
                        {b.nome}
                      </option>
                    ))}
                  </Select>
                </div>
                <div className="sm:col-span-4">
                  <Label>Observação (opcional)</Label>
                  <Input
                    value={obs}
                    onChange={(e) => setObs(e.target.value)}
                    placeholder="Ex.: PIX do cliente, TED, depósito em espécie"
                  />
                </div>
              </div>
            )}

            {saldo > 0 && valorNum > 0 && cabe && (
              <p className="mt-3 text-[12.5px] text-[var(--color-ink2)]">
                Depois desta baixa a conta fica{" "}
                <strong>{restante <= 0 ? "totalmente recebida" : "parcialmente recebida"}</strong>
                {restante > 0 ? `, com ${brl0(restante)} ainda em aberto` : ""}.
              </p>
            )}

            {saldo <= 0 && (
              <p className="rounded-md border border-[var(--color-line)] bg-[var(--color-surface2)] p-3 text-[13px] text-[var(--color-ink2)]">
                Esta conta já está totalmente recebida. Para corrigir, estorne uma
                das baixas abaixo ou ajuste os valores em “Editar”.
              </p>
            )}

            {erro && (
              <p className="mt-3 rounded-md border border-[var(--color-danger)] bg-[#fee2e2] p-2.5 text-[12.5px] text-[#991b1b]">
                {erro}
              </p>
            )}

            {/* Histórico: cada movimento de caixa que baixou esta conta. */}
            {conta.baixas.length > 0 && (
              <div className="mt-5">
                <h3 className="mb-2 font-[family-name:var(--font-mono)] text-[11px] uppercase tracking-wide text-[var(--color-ink3)]">
                  Recebimentos registrados
                </h3>
                <div className="divide-y divide-[var(--color-line)] rounded-md border border-[var(--color-line)]">
                  {conta.baixas.map((b) => (
                    <div
                      key={b.cashEntryId}
                      className="flex flex-wrap items-center justify-between gap-2 px-3 py-2 text-[13px]"
                    >
                      <div className="min-w-0">
                        <div className="flex flex-wrap items-center gap-2">
                          <span className="font-[family-name:var(--font-mono)]">
                            {b.data ? dateBR(b.data) : "sem data"}
                          </span>
                          <Badge tone={b.origem === "caixa" ? "info" : "success"}>
                            {b.origem === "caixa" ? "extrato / caixa" : "baixa manual"}
                          </Badge>
                        </div>
                        <div className="truncate text-[12px] text-[var(--color-ink3)]">
                          {b.bancoNome ?? "sem conta bancária"}
                          {b.conciliadoPor ? ` · ${b.conciliadoPor}` : ""}
                        </div>
                      </div>
                      <div className="flex items-center gap-3">
                        <span className="font-[family-name:var(--font-mono)] text-[var(--color-success)]">
                          {brl0(b.valor)}
                        </span>
                        {b.origem === "manual" ? (
                          <button
                            type="button"
                            disabled={salvando}
                            onClick={() => estornar(b.cashEntryId)}
                            className="text-[12.5px] text-[var(--color-danger)] hover:underline disabled:opacity-50"
                          >
                            Estornar
                          </button>
                        ) : (
                          <span
                            className="text-[12px] text-[var(--color-ink4)]"
                            title="Movimento do extrato bancário: desfaça no Caixa Diário, em “Desfazer conciliação”."
                          >
                            desfaz no Caixa
                          </span>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Aviso contábil: a razão de a baixa não mexer no resultado. */}
            <p className="mt-4 rounded-md border border-[var(--color-line)] bg-[var(--color-surface2)] p-3 text-[12px] leading-relaxed text-[var(--color-ink2)]">
              Dar baixa <strong>não lança receita</strong>. A baixa registra
              apenas a entrada do dinheiro: ela aparece no Caixa Diário e no
              Fluxo de Caixa Realizado. O reconhecimento da receita continua
              seguindo o regime de competência, pelo plano de pagamento da venda
              — e não pelo dia em que o dinheiro caiu na conta.
            </p>

            <div className="mt-4 flex items-center gap-2">
              {saldo > 0 && (
                <Button type="button" onClick={confirmar} disabled={salvando || !cabe}>
                  {salvando ? "Registrando…" : "Confirmar recebimento"}
                </Button>
              )}
              <Button type="button" variant="ghost" onClick={onFechar} disabled={salvando}>
                {saldo > 0 ? "Cancelar" : "Fechar"}
              </Button>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
