"use client";

import Link from "next/link";
import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { cancelarReembolso } from "@/lib/actions/receitas";

/**
 * Ações por linha nas Liberações de Obra (Prompt O, 4.2/4.3): editar (link) e
 * cancelar (lógico, com motivo). Cada ação só aparece conforme a permissão na
 * tela "reembolso"; o servidor confere de novo.
 */
export function LiberacaoActions({ id, rotulo, projectId, cancelada, canEditar, canExcluir }: { id: string; rotulo: string; projectId: string; cancelada: boolean; canEditar: boolean; canExcluir: boolean }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);

  const cancelar = () => {
    const motivo = window.prompt(`Cancelar a liberação ${rotulo}? Ela continua visível, mas sai dos totais, do caixa e da projeção.\n\nMotivo do cancelamento:`);
    if (motivo === null) return;
    setError(null);
    start(async () => {
      const r = await cancelarReembolso(id, motivo);
      if (!r.ok) {
        setError(r.error);
        return;
      }
      router.push(`/reembolso?proj=${projectId}&cancelada=1`);
    });
  };

  if (cancelada || (!canEditar && !canExcluir)) return <span className="text-[var(--color-ink4)]">—</span>;

  return (
    <div className="flex items-center justify-end gap-3">
      {canEditar && (
        <Link href={`/reembolso/${id}`} className="text-[var(--color-accent2)] hover:underline">
          Editar
        </Link>
      )}
      {canExcluir && (
        <button type="button" onClick={cancelar} disabled={pending} className="text-[var(--color-danger)] hover:underline disabled:opacity-50">
          {pending ? "Cancelando…" : "Cancelar"}
        </button>
      )}
      {error && <span className="text-xs text-[var(--color-danger)]">{error}</span>}
    </div>
  );
}
