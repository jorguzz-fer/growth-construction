"use client";

import { useTransition } from "react";
import { changeRole } from "@/lib/actions/users";
import type { Role } from "@/lib/context";

const ROLES: Role[] = ["owner", "admin", "membro", "contador"];

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
  return (
    <select
      defaultValue={role}
      disabled={disabled || pending}
      onChange={(e) => start(() => changeRole(userId, e.target.value as Role))}
      className="h-8 rounded-[8px] border border-[var(--color-accent2)]/20 bg-white px-2 text-xs disabled:opacity-50"
    >
      {ROLES.map((r) => (
        <option key={r} value={r}>
          {r}
        </option>
      ))}
    </select>
  );
}
