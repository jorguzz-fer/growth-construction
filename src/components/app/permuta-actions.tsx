"use client";

import Link from "next/link";
import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { cancelarPermuta } from "@/lib/actions/receitas";

/**
 * Ações por linha na lista de Permuta (Prompt P, 2.2/2.3): editar (link) e
 * cancelar (lógico, com motivo). Cada ação só aparece conforme a permissão na
 * tela "permuta"; o servidor confere de novo.
 */
export function PermutaActions({
  id,
  rotulo,
  projectId,
  cancelado,
  canEditar,
  canExcluir,
}: {
  id: string;
  rotulo: string;
  projectId: string;
  cancelado: boolean;
  canEditar: boolean;
  canExcluir: boolean;
}) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);

  const cancelar = () => {
    const motivo = window.prompt(`Cancelar o ativo "${rotulo}"? Ele continua visível, mas sai dos totais, da receita e do caixa.\n\nMotivo do cancelamento:`);
    if (motivo === null) return;
    setError(null);
    start(async () => {
      const r = await cancelarPermuta(id, motivo);
      if (!r.ok) {
        setError(r.error);
        return;
      }
      router.push(`/permuta?proj=${projectId}&cancelado=1`);
    });
  };

  if (cancelado || (!canEditar && !canExcluir)) return <span className="text-[var(--color-ink4)]">—</span>;

  return (
    <div className="flex items-center justify-end gap-3">
      {canEditar && (
        <Link href={`/permuta/${id}`} className="text-[var(--color-accent2)] hover:underline">
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
