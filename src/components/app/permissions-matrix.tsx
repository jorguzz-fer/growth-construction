"use client";

import { useState, useTransition } from "react";
import {
  SECTIONS,
  effectivePermissions,
  type AccessLevel,
} from "@/lib/permissions";
import { setMemberPermissions } from "@/lib/actions/users";
import type { Role } from "@/lib/context";
import { Table, THead, TH, TR, TD } from "@/components/ui/table";

export interface MatrixMember {
  userId: string;
  name: string | null;
  email: string | null;
  role: Role;
  permissions: Record<string, string> | null;
}

const LEVELS: AccessLevel[] = ["none", "view", "edit"];
const LEVEL_LABEL: Record<AccessLevel, string> = {
  none: "Sem acesso",
  view: "Ver",
  edit: "Editar",
};

export function PermissionsMatrix({ members }: { members: MatrixMember[] }) {
  return (
    <Table>
      <THead>
        <tr>
          <TH>Membro</TH>
          {SECTIONS.map((s) => (
            <TH key={s.key} className="text-center">
              {s.label}
            </TH>
          ))}
        </tr>
      </THead>
      <tbody>
        {members.map((m) => (
          <Row key={m.userId} member={m} />
        ))}
      </tbody>
    </Table>
  );
}

function Row({ member }: { member: MatrixMember }) {
  const [pending, start] = useTransition();
  const [perms, setPerms] = useState<Record<string, AccessLevel>>(
    effectivePermissions(member.role, member.permissions),
  );

  function update(section: string, level: AccessLevel) {
    const next = { ...perms, [section]: level };
    setPerms(next);
    start(() => setMemberPermissions(member.userId, next));
  }

  return (
    <TR>
      <TD>
        <div className="font-medium text-[var(--color-ink)]">
          {member.name ?? "—"}
        </div>
        <div className="font-[family-name:var(--font-mono)] text-[11px] text-[var(--color-ink3)]">
          {member.email} · {member.role}
        </div>
      </TD>
      {SECTIONS.map((s) => (
        <TD key={s.key} className="text-center">
          <select
            value={perms[s.key] ?? "none"}
            disabled={pending || member.role === "owner"}
            onChange={(e) => update(s.key, e.target.value as AccessLevel)}
            className="h-8 rounded-[8px] border border-[var(--color-accent2)]/20 bg-white px-2 text-xs disabled:opacity-50"
          >
            {LEVELS.map((l) => (
              <option key={l} value={l}>
                {LEVEL_LABEL[l]}
              </option>
            ))}
          </select>
        </TD>
      ))}
    </TR>
  );
}
