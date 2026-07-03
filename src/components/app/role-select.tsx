"use client";

import { useState, useTransition } from "react";
import { changeRole } from "@/lib/actions/users";
import type { Role } from "@/lib/context";

const ROLES: Role[] = ["owner", "admin", "membro", "contador", "engenheiro"];

export function RoleSelect({
  userId,
  role,
  disabled,
}: {
  userId: string;
  role: Role;
  disabled?: boolean;
}) {
  const [pending, start] = useTransition();
  const [value, setValue] = useState<Role>(role);
  const [error, setError] = useState<string | null>(null);

  return (
    <div className="flex flex-col gap-1">
      <select
        value={value}
        disabled={disabled || pending}
        onChange={(e) => {
          const next = e.target.value as Role;
          const prev = value;
          setValue(next);
          setError(null);
          start(async () => {
            const res = await changeRole(userId, next);
            if (!res.ok) {
              setValue(prev);
              setError(res.error ?? "Falhou.");
            }
          });
        }}
        className="h-8 rounded-[8px] border border-[var(--color-accent2)]/20 bg-white px-2 text-xs disabled:opacity-50"
      >
        {ROLES.map((r) => (
          <option key={r} value={r}>
            {r}
          </option>
        ))}
      </select>
      {error && (
        <span className="text-xs text-[var(--color-danger)]">{error}</span>
      )}
    </div>
  );
}
