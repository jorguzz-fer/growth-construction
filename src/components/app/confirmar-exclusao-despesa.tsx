"use client";

import { useEffect, useState, useTransition } from "react";
import { deleteDespesa, inventarioDeExclusao } from "@/lib/actions/despesas";
import { brl } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Input, Label } from "@/components/ui/input";

/**
 * Prompt S, seção 2 — exclusão informada. Antes de confirmar, mostra o
 * inventário do que a despesa tem vinculado (2.2) e, quando há dependência,
 * a recusa já vem escrita (Prompt I, §12: com fato financeiro, nota ou anexo
 * o caminho é cancelar). A confirmação é pela digitação do PED (2.3).
 */
export function ConfirmarExclusaoDespesa({ despesaId, onCancelar, onExcluida }: { despesaId: string; onCancelar: () => void; onExcluida: () => void }) {
  const [inv, setInv] = useState<Awaited<ReturnType<typeof inventarioDeExclusao>> | null>(null);
  const [confirmacao, setConfirmacao] = useState("");
  const [erro, setErro] = useState<string | null>(null);
  const [pending, start] = useTransition();

  useEffect(() => {
    let vivo = true;
    inventarioDeExclusao(despesaId).then((r) => {
      if (vivo) setInv(r);
    });
    return () => {
      vivo = false;
    };
  }, [despesaId]);

  const excluir = () =>
    start(async () => {
      setErro(null);
      const r = await deleteDespesa(despesaId, confirmacao);
      if (!r.ok) {
        setErro(r.error);
        return;
      }
      onExcluida();
    });

  if (!inv) return <p className="text-[12px] text-[var(--color-ink3)]">Conferindo o que está vinculado…</p>;
  if (!inv.ok) return <p role="alert" className="text-[12px] text-[var(--color-danger)]">{inv.error}</p>;

  const v = inv.inventario;
  const esperado = inv.numDoc?.trim() || "EXCLUIR";
  const linhas: string[] = [];
  linhas.push(`${v.parcelas} parcela(s)${v.parcelasPagas ? `, ${v.parcelasPagas} paga(s)` : ""}`);
  linhas.push(`${v.pagamentos} pagamento(s)${v.totalPago > 0 ? ` · ${brl(v.totalPago)} já saído(s) do caixa` : ""}`);
  linhas.push(v.acertos ? `acerto(s) ${v.acertosNumDoc.join(", ")}` : "nenhum acerto contábil");
  linhas.push(v.terceiros ? `obrigação com terceiro${v.restituicoes ? ` e ${v.restituicoes} restituição(ões)` : ""}` : "nenhuma obrigação com terceiro");
  linhas.push(`${v.documentosFiscais} documento(s) fiscal(is) · ${v.anexos} anexo(s)`);
  linhas.push(v.caixaConciliado ? `${v.caixaConciliado} movimento(s) bancário(s) ficaria(m) sem vínculo` : "nenhum movimento bancário vinculado");

  return (
    <div role="region" aria-label="Confirmar exclusão da despesa" className="space-y-2 rounded-[10px] border border-[var(--color-danger)]/30 bg-[var(--color-danger)]/5 p-3 text-[12px] text-[var(--color-ink2)]">
      <p className="font-medium text-[var(--color-ink)]">
        Excluir definitivamente a despesa {inv.numDoc ?? "(sem PED)"} ({brl(Number(inv.valor))})? O que ela tem vinculado:
      </p>
      <ul className="list-disc pl-5">
        {linhas.map((l) => (
          <li key={l}>{l}</li>
        ))}
      </ul>
      {inv.bloqueios.length > 0 ? (
        <p role="alert" className="text-[var(--color-danger)]">
          Não é possível excluir: {inv.bloqueios.join("; ")}. Para preservar o histórico, use &ldquo;Cancelar despesa&rdquo;.
        </p>
      ) : (
        <p className="text-[var(--color-ink3)]">Nada depende desta despesa; a exclusão não pode ser desfeita.</p>
      )}
      <div className="flex flex-wrap items-end gap-2">
        <div className="min-w-[220px]">
          <Label>{inv.numDoc ? `Digite o PED ${inv.numDoc} para confirmar` : "Digite EXCLUIR para confirmar"}</Label>
          <Input value={confirmacao} onChange={(e) => setConfirmacao(e.target.value)} placeholder={esperado} autoComplete="off" aria-label="Confirmação da exclusão" disabled={inv.bloqueios.length > 0} />
        </div>
        <Button type="button" variant="outline" size="sm" disabled={pending || inv.bloqueios.length > 0 || !confirmacao.trim()} onClick={excluir}>
          {pending ? "Excluindo…" : "Excluir definitivamente"}
        </Button>
        <Button type="button" variant="ghost" size="sm" disabled={pending} onClick={onCancelar}>
          Voltar
        </Button>
      </div>
      {erro && (
        <p role="alert" className="text-[var(--color-danger)]">
          {erro}
        </p>
      )}
    </div>
  );
}
