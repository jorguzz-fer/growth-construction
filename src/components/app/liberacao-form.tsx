"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { addReembolso, updateReembolso } from "@/lib/actions/receitas";
import { Card, CardContent } from "@/components/ui/card";
import { Button, buttonVariants } from "@/components/ui/button";
import { Input, Label } from "@/components/ui/input";
import { MoneyInput } from "@/components/ui/money-input";
import { DateField } from "@/components/ui/date-field";

/**
 * Formulário da liberação de obra (Prompt O, 3-A). Mesmos campos, mesma
 * disposição; o que entra é o que falta para o lançamento não nascer
 * inválido: obrigatórios marcados, placeholder real, o que a data significa,
 * a nota "entrada de caixa, não receita", e a mensagem da action — inteira —
 * no erro e no sucesso (3.2, 3-A.6). A validação de verdade é a do servidor.
 */
export interface LiberacaoInicial {
  id: string;
  data: string | null;
  origem: string | null;
  valor: string | null;
  obs: string | null;
}

export function LiberacaoForm({ projectId, initial }: { projectId: string; initial?: LiberacaoInicial }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [aviso, setAviso] = useState<string | null>(null);
  const [valor, setValor] = useState(initial?.valor ?? "");

  const enviar = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const fd = new FormData(e.currentTarget);
    setAviso(null);
    start(async () => {
      const r = initial ? await updateReembolso(fd) : await addReembolso(fd);
      if (!r.ok) {
        setAviso(r.error);
        return;
      }
      router.push(`/reembolso?proj=${projectId}&salva=1`);
    });
  };

  return (
    <Card>
      <CardContent className="p-5">
        <form onSubmit={enviar} className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          {/* Obra desta tela (Prompt A): a liberação vai para a versão de trabalho dela. */}
          <input type="hidden" name="projectId" value={projectId} />
          {initial && <input type="hidden" name="id" value={initial.id} />}
          <div>
            <Label>Data *</Label>
            <DateField name="data" defaultValue={initial?.data ?? ""} required />
            <p className="mt-1 text-[11px] leading-snug text-[var(--color-ink3)]">Data em que o recurso entrou na conta. É a data que o Fluxo de Caixa usa.</p>
          </div>
          <div>
            <Label>Origem *</Label>
            <Input name="origem" defaultValue={initial?.origem ?? ""} placeholder="Ex.: CEF · medição 03/2026" required />
          </div>
          <div>
            <Label>Valor (R$) *</Label>
            <MoneyInput name="valor" value={valor} onChange={setValor} />
          </div>
          <div>
            <Label>Observações</Label>
            <Input name="obs" defaultValue={initial?.obs ?? ""} placeholder="" />
          </div>
          {aviso && (
            <p role="status" className="text-[13px] text-[var(--color-danger)] sm:col-span-2">
              {aviso}
            </p>
          )}
          <div className="flex items-center gap-2 sm:col-span-2">
            <Button type="submit" disabled={pending}>
              {pending ? "Gravando…" : initial ? "Salvar alterações" : "Salvar liberação"}
            </Button>
            <a href={`/reembolso?proj=${projectId}`} className={buttonVariants({ variant: "ghost" })}>
              Cancelar
            </a>
          </div>
          <p className="text-[11.5px] leading-snug text-[var(--color-ink3)] sm:col-span-2">
            A liberação é <strong>entrada de caixa, não receita</strong>: a receita da obra é reconhecida pela venda da unidade.
          </p>
        </form>
      </CardContent>
    </Card>
  );
}
