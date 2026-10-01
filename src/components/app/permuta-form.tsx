"use client";

import { useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { addPermuta } from "@/lib/actions/receitas";
import { Card, CardContent } from "@/components/ui/card";
import { Button, buttonVariants } from "@/components/ui/button";
import { Input, Label, Select } from "@/components/ui/input";
import { MoneyInput } from "@/components/ui/money-input";
import { DateField } from "@/components/ui/date-field";

/**
 * Formulário do ativo de permuta (Prompt P, 3.1/3.2). Cliente porque a action
 * devolve `{ ok, error }` e a mensagem precisa aparecer aqui, inteira — antes
 * o erro virava um digest genérico e a falta de permissão sumia em silêncio.
 * Os valores usam `MoneyInput` (vírgula decimal); a validação de verdade é a
 * do servidor, a mesma para criar e, na P-2, para editar.
 */
export function PermutaForm({
  projectId,
  unidades,
  clientes,
  tipos,
}: {
  projectId: string;
  unidades: string[];
  clientes: { id: string; nome: string }[];
  tipos: readonly string[];
}) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [aviso, setAviso] = useState<string | null>(null);
  const [estimado, setEstimado] = useState("");
  const [valorVenda, setValorVenda] = useState("");
  const [status, setStatus] = useState("Disponivel");
  const [forma, setForma] = useState("avista");
  const formRef = useRef<HTMLFormElement>(null);
  const vendido = status === "Vendido";

  const enviar = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const fd = new FormData(e.currentTarget);
    setAviso(null);
    start(async () => {
      const r = await addPermuta(fd);
      if (!r.ok) {
        setAviso(r.error);
        return;
      }
      router.push(`/permuta?proj=${projectId}&salvo=1`);
    });
  };

  return (
    <Card>
      <CardContent className="p-5">
        <form ref={formRef} onSubmit={enviar} className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {/* Obra desta tela (Prompt A): o ativo vai para a versão de trabalho dela. */}
          <input type="hidden" name="projectId" value={projectId} />
          <div>
            <Label>Unidade de origem *</Label>
            <Select name="unitCode" defaultValue="" required>
              <option value="">— selecione —</option>
              {unidades.map((c) => (
                <option key={c} value={c}>
                  {c}
                </option>
              ))}
            </Select>
          </div>
          <div>
            <Label>Cliente *</Label>
            <Select name="cliente" defaultValue="" required>
              <option value="">— selecione —</option>
              {clientes.map((c) => (
                <option key={c.id} value={c.nome}>
                  {c.nome}
                </option>
              ))}
            </Select>
          </div>
          <div>
            <Label>Data de recebimento *</Label>
            <DateField name="dataRecebimento" required />
          </div>
          <div>
            <Label>Tipo do bem / serviço *</Label>
            <Select name="tipo" defaultValue={tipos[0] ?? ""}>
              {tipos.map((t) => (
                <option key={t} value={t}>
                  {t}
                </option>
              ))}
            </Select>
          </div>
          <div className="lg:col-span-2">
            <Label>Descrição</Label>
            <Input name="descricao" placeholder="" />
          </div>
          <div>
            <Label>Valor estimado (R$) *</Label>
            <MoneyInput name="estimado" value={estimado} onChange={setEstimado} />
          </div>
          <div>
            <Label>Status</Label>
            <Select name="status" value={status} onChange={(e) => setStatus(e.target.value)}>
              <option value="Disponivel">Disponível (em estoque)</option>
              <option value="Vendido">Vendido</option>
            </Select>
          </div>
          <div>
            <Label>Data da venda / escambo{vendido ? " *" : ""}</Label>
            <DateField name="dataVenda" />
          </div>
          <div>
            <Label>Valor da venda (R$){vendido ? " *" : ""}</Label>
            <MoneyInput name="valorVenda" value={valorVenda} onChange={setValorVenda} />
          </div>
          <div>
            <Label>Forma da revenda do bem</Label>
            <Select name="formaVenda" value={forma} onChange={(e) => setForma(e.target.value)}>
              <option value="avista">Venda à vista</option>
              <option value="parcelada">Venda parcelada</option>
              <option value="escambo">Escambo (troca, sem entrada financeira)</option>
            </Select>
          </div>
          {forma === "parcelada" && (
            <>
              <div>
                <Label>Parcelas{vendido ? " *" : ""}</Label>
                <Input name="parcelas" type="number" min="1" step="1" placeholder="Ex.: 12" />
              </div>
              <div>
                <Label>Periodicidade</Label>
                <Select name="periodicidade" defaultValue="mensal">
                  <option value="mensal">Mensal</option>
                  <option value="semestral">Semestral</option>
                  <option value="anual">Anual</option>
                </Select>
              </div>
              <div>
                <Label>Vencimento da 1ª parcela</Label>
                <DateField name="dataPrimParcela" />
              </div>
            </>
          )}
          <div>
            <Label>Tipo permuta</Label>
            <Input name="tipoPermuta" placeholder="Ex.: materiais, serviços" />
          </div>
          <div className="lg:col-span-2">
            <Label>Observações</Label>
            <Input name="obs" placeholder="" />
          </div>
          {aviso && (
            <p role="status" className="text-[13px] text-[var(--color-danger)] sm:col-span-2 lg:col-span-3">
              {aviso}
            </p>
          )}
          <div className="flex items-center gap-2 sm:col-span-2 lg:col-span-3">
            <Button type="submit" disabled={pending}>
              {pending ? "Gravando…" : "Salvar ativo"}
            </Button>
            <a href={`/permuta?proj=${projectId}`} className={buttonVariants({ variant: "ghost" })}>
              Cancelar
            </a>
          </div>
        </form>
      </CardContent>
    </Card>
  );
}
