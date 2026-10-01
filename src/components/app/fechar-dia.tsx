"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { brl0 } from "@/lib/utils";
import { fecharDia, reabrirDia } from "@/lib/actions/fechamento";

/**
 * Prompt L, Parte 9 — a ação de fechar (e reabrir) no cartão do dia. Os
 * números NÃO são enviados: o servidor recalcula pela mesma cadeia (9.2).
 * Fechar registra, não trava (9.6) — e o texto diz isso antes de confirmar.
 */
export function FecharDia({ dia, resumo, fechamento, canFechar, canReabrir }: { dia: string; resumo: { saldoFinal: number; saldoEmConta: number | null; diferenca: number | null }; fechamento: { id: string } | null; canFechar: boolean; canReabrir: boolean }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [erro, setErro] = useState<string | null>(null);
  const diaBR = dia.split("-").reverse().join("/");

  if (fechamento) {
    if (!canReabrir) return null;
    return (
      <div className="mt-2">
        <Button
          variant="ghost"
          size="sm"
          disabled={pending}
          onClick={() => {
            const motivo = window.prompt(`Reabrir ${diaBR}? O fechamento fica no histórico, marcado como reaberto. Informe o motivo:`);
            if (motivo == null) return;
            setErro(null);
            start(async () => {
              const r = await reabrirDia({ id: fechamento.id, motivo });
              if (!r.ok) setErro(r.error);
              else router.refresh();
            });
          }}
        >
          Reabrir
        </Button>
        {erro && <p role="alert" className="mt-1 text-[10.5px] text-[var(--color-danger)]">{erro}</p>}
      </div>
    );
  }
  if (!canFechar) return null;
  return (
    <div className="mt-2">
      <Button
        variant="outline"
        size="sm"
        disabled={pending}
        onClick={() => {
          const dif = resumo.diferenca == null ? "" : Math.abs(resumo.diferenca) > 0.005 ? ` A diferença de ${brl0(resumo.diferenca)} fica registrada; para explicá-la, use o ajuste com motivo na aba Ajustes.` : " Os dois saldos coincidem.";
          const ok = window.confirm(`Fechar ${diaBR}: grava o saldo conciliado ${brl0(resumo.saldoFinal)} e o em conta ${resumo.saldoEmConta == null ? "—" : brl0(resumo.saldoEmConta)}.${dif}\n\nFechar registra os números do dia; não trava lançamento, edição nem conciliação.`);
          if (!ok) return;
          setErro(null);
          start(async () => {
            const r = await fecharDia({ dia });
            if (!r.ok) setErro(r.error);
            else router.refresh();
          });
        }}
      >
        Fechar o dia
      </Button>
      {erro && <p role="alert" className="mt-1 text-[10.5px] text-[var(--color-danger)]">{erro}</p>}
    </div>
  );
}
