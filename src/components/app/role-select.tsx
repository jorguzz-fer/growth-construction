"use client";

import { useState, useTransition } from "react";
import { changeRole } from "@/lib/actions/users";
import type { Role } from "@/lib/context";
import { PAPEIS } from "@/lib/papeis";

/**
 * Seletor de papel da linha (AI, Parte 3).
 *  - promover a owner pede confirmação (3.1);
 *  - a própria linha não é editável (3.2 — a action também recusa);
 *  - quem tem telas personalizadas escolhe o destino delas antes de aplicar
 *    (3.4): nada é limpo em silêncio.
 */
export function RoleSelect({
  userId,
  role,
  disabled,
  isSelf,
  personalizadas = 0,
}: {
  userId: string;
  role: Role;
  disabled?: boolean;
  isSelf?: boolean;
  personalizadas?: number;
}) {
  const [pending, start] = useTransition();
  const [value, setValue] = useState<Role>(role);
  const [pedido, setPedido] = useState<Role | null>(null);
  const [error, setError] = useState<string | null>(null);

  const aplicar = (next: Role, manterPersonalizacoes: boolean) => {
    const prev = value;
    setValue(next);
    setPedido(null);
    setError(null);
    start(async () => {
      const res = await changeRole(userId, next, { manterPersonalizacoes });
      if (!res.ok) {
        setValue(prev);
        setError(res.error ?? "Falhou.");
      }
    });
  };

  return (
    <div className="flex flex-col gap-1">
      <select
        value={pedido ?? value}
        disabled={disabled || isSelf || pending}
        title={isSelf ? "Ninguém altera o próprio papel." : undefined}
        onChange={(e) => {
          const next = e.target.value as Role;
          if (next === value) {
            setPedido(null);
            return;
          }
          if (
            next === "owner" &&
            !window.confirm(
              "Promover a owner dá controle total da empresa, inclusive sobre os outros owners. Confirmar?",
            )
          ) {
            return;
          }
          if (personalizadas > 0) {
            setPedido(next);
            return;
          }
          aplicar(next, true);
        }}
        className="h-8 rounded-[8px] border border-[var(--color-accent2)]/20 bg-white px-2 text-xs disabled:opacity-50"
      >
        {PAPEIS.map((r) => (
          <option key={r} value={r}>
            {r}
          </option>
        ))}
      </select>
      {pedido && (
        <div className="flex max-w-[260px] flex-col gap-1 rounded-[8px] border border-[var(--color-accent2)]/20 bg-[var(--color-surface2)] p-2 text-[11px] text-[var(--color-ink2)]">
          <span>
            {personalizadas} tela(s) personalizada(s) em Gestão de Acessos. Ao virar{" "}
            <strong>{pedido}</strong>:
          </span>
          <div className="flex flex-wrap gap-1.5">
            <button
              type="button"
              onClick={() => aplicar(pedido, true)}
              className="rounded-[6px] bg-white px-2 py-1 font-medium hover:bg-[var(--color-accent4)]"
            >
              Manter personalizações
            </button>
            <button
              type="button"
              onClick={() => aplicar(pedido, false)}
              className="rounded-[6px] bg-white px-2 py-1 font-medium hover:bg-[var(--color-accent4)]"
            >
              Voltar ao padrão do papel
            </button>
            <button
              type="button"
              onClick={() => setPedido(null)}
              className="rounded-[6px] px-2 py-1 text-[var(--color-ink3)] hover:underline"
            >
              Cancelar
            </button>
          </div>
        </div>
      )}
      {error && <span className="text-xs text-[var(--color-danger)]">{error}</span>}
    </div>
  );
}
