"use client";

import { useRef, useState, useTransition } from "react";
import { addCartao } from "@/lib/actions/cartoes";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input, Label, Select } from "@/components/ui/input";

export const BANDEIRAS = ["Visa", "Mastercard", "Elo", "American Express", "Hipercard", "Outra"] as const;

/**
 * Novo cartão (Prompt U, 1.2). Só os quatro últimos dígitos; o campo tem
 * maxLength 4 e o servidor recusa mais que isso (teste 17).
 */
export function CartaoForm({ contas }: { contas: { id: string; nome: string }[] }) {
  const ref = useRef<HTMLFormElement>(null);
  const [pending, start] = useTransition();
  const [erro, setErro] = useState<string | null>(null);
  const [ok, setOk] = useState<string | null>(null);

  return (
    <Card className="mb-6">
      <CardContent className="p-5">
        <h2 className="mb-3 text-[14px] font-semibold text-[var(--color-ink)]">Novo cartão</h2>
        <form
          ref={ref}
          onSubmit={(e) => {
            e.preventDefault();
            const fd = new FormData(e.currentTarget);
            setErro(null);
            setOk(null);
            start(async () => {
              const r = await addCartao(fd);
              if (r.ok) {
                setOk("Cartão cadastrado.");
                ref.current?.reset();
              } else setErro(r.error);
            });
          }}
          className="grid grid-cols-2 gap-3 sm:grid-cols-4"
        >
          <div className="col-span-2">
            <Label>Apelido</Label>
            <Input name="apelido" required placeholder="Ex.: Itaú final 1234" />
          </div>
          <div>
            <Label>Bandeira</Label>
            <Select name="bandeira" defaultValue="">
              <option value="">—</option>
              {BANDEIRAS.map((b) => (
                <option key={b}>{b}</option>
              ))}
            </Select>
          </div>
          <div>
            <Label>4 últimos dígitos</Label>
            <Input name="ultimos4" inputMode="numeric" maxLength={4} pattern="[0-9]{4}" placeholder="1234" title="Somente os 4 últimos dígitos" />
          </div>
          <div className="col-span-2">
            <Label>Titular</Label>
            <Input name="titular" />
          </div>
          <div>
            <Label>Limite (R$)</Label>
            <Input name="limite" type="number" step="0.01" min="0" />
          </div>
          <div>
            <Label>Taxa rotativo (% a.m., opcional)</Label>
            <Input name="taxaRotativo" type="number" step="0.01" min="0" max="100" placeholder="sem taxa: não projeta juro" />
          </div>
          <div>
            <Label>Dia de fechamento</Label>
            <Input name="diaFechamento" type="number" min={1} max={31} required />
          </div>
          <div>
            <Label>Dia de vencimento</Label>
            <Input name="diaVencimento" type="number" min={1} max={31} required />
          </div>
          <div className="col-span-2">
            <Label>Conta que debita a fatura</Label>
            <Select name="bankAccountId" defaultValue="">
              <option value="">—</option>
              {contas.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.nome}
                </option>
              ))}
            </Select>
          </div>
          <div className="col-span-2 flex items-end gap-3 sm:col-span-4">
            <Button type="submit" disabled={pending}>
              {pending ? "Salvando…" : "Cadastrar cartão"}
            </Button>
            {erro && <p className="text-[12px] text-[var(--color-danger)]" role="alert">{erro}</p>}
            {ok && <p className="text-[12px] text-[var(--color-ink2)]">{ok}</p>}
          </div>
        </form>
        <p className="mt-3 text-[11px] leading-snug text-[var(--color-ink3)]">
          O número completo do cartão não é guardado em hipótese nenhuma. A compra é lançada em Despesas com a forma &quot;Cartão de crédito&quot;; aqui ficam o cadastro, as faturas e a conferência.
        </p>
      </CardContent>
    </Card>
  );
}
