"use client";

import Link from "next/link";
import { useState, useTransition } from "react";
import { deleteUnit } from "@/lib/actions/units";

/**
 * Ações por linha na lista de Unidades: editar (link para o formulário) e
 * excluir (server action com confirmação). Cada ação só aparece conforme a
 * permissão do usuário na tela "unidades".
 */
export function UnitActions({
  id,
  code,
  canEditar,
  canExcluir,
}: {
  id: string;
  code: string;
  canEditar: boolean;
  canExcluir: boolean;
}) {
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);

  const remove = () => {
    if (
      !window.confirm(
        `Excluir a unidade "${code}"? Esta ação não pode ser desfeita.`,
      )
    )
      return;
    setError(null);
    start(async () => {
      try {
        await deleteUnit(id);
      } catch (e) {
        setError(e instanceof Error ? e.message : "Erro ao excluir.");
      }
    });
  };

  if (!canEditar && !canExcluir) return <span className="text-[var(--color-ink4)]">—</span>;

  return (
    <div className="flex items-center justify-end gap-3">
      {canEditar && (
        <Link
          href={`/unidades/${id}`}
          className="text-[var(--color-accent2)] hover:underline"
        >
          Editar
        </Link>
      )}
      {canExcluir && (
        <button
          onClick={remove}
          disabled={pending}
          className="text-[var(--color-danger)] hover:underline disabled:opacity-50"
        >
          {pending ? "Excluindo..." : "Excluir"}
        </button>
      )}
      {error && <span className="text-xs text-[var(--color-danger)]">{error}</span>}
    </div>
  );
}
