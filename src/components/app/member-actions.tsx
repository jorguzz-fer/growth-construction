"use client";

import { useState, useTransition } from "react";
import {
  removeMember,
  resetMemberPassword,
  updateMemberName,
} from "@/lib/actions/users";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { PasswordInput } from "@/components/ui/password-input";

type Mode = "view" | "name" | "password";

/**
 * Ações por linha na tela de Usuários: editar nome, redefinir senha e remover
 * o membro do tenant. As guardas (último owner, auto-remoção) vivem nas server
 * actions; aqui só refletimos o erro retornado.
 */
export function MemberActions({
  userId,
  name,
  isSelf,
  canEdit,
  canDelete,
}: {
  userId: string;
  name: string | null;
  isSelf: boolean;
  canEdit: boolean;
  canDelete: boolean;
}) {
  const [mode, setMode] = useState<Mode>("view");
  const [value, setValue] = useState(name ?? "");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();

  function run(fn: () => Promise<{ ok: boolean; error?: string }>) {
    setError(null);
    start(async () => {
      const res = await fn();
      if (!res.ok) {
        setError(res.error ?? "Falhou.");
        return;
      }
      setPassword("");
      setMode("view");
    });
  }

  if (mode === "name") {
    return (
      <div className="flex flex-col gap-1">
        <div className="flex items-center gap-2">
          <Input
            value={value}
            onChange={(e) => setValue(e.target.value)}
            placeholder="Nome"
            className="h-8 w-40"
            autoFocus
          />
          <Button
            size="sm"
            disabled={pending}
            onClick={() => run(() => updateMemberName(userId, value))}
          >
            Salvar
          </Button>
          <Button
            size="sm"
            variant="ghost"
            disabled={pending}
            onClick={() => {
              setValue(name ?? "");
              setError(null);
              setMode("view");
            }}
          >
            Cancelar
          </Button>
        </div>
        {error && <span className="text-xs text-[var(--color-danger)]">{error}</span>}
      </div>
    );
  }

  if (mode === "password") {
    return (
      <div className="flex flex-col gap-1">
        <div className="flex items-center gap-2">
          <PasswordInput
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            placeholder="Nova senha (mín. 8)"
            autoComplete="new-password"
            className="h-8 w-48"
            autoFocus
          />
          <Button
            size="sm"
            disabled={pending}
            onClick={() => run(() => resetMemberPassword(userId, password))}
          >
            Definir
          </Button>
          <Button
            size="sm"
            variant="ghost"
            disabled={pending}
            onClick={() => {
              setPassword("");
              setError(null);
              setMode("view");
            }}
          >
            Cancelar
          </Button>
        </div>
        {error && <span className="text-xs text-[var(--color-danger)]">{error}</span>}
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-1">
      <div className="flex items-center gap-1">
        {canEdit && (
          <>
            <Button size="sm" variant="outline" onClick={() => setMode("name")}>
              Editar
            </Button>
            <Button
              size="sm"
              variant="outline"
              onClick={() => setMode("password")}
            >
              Senha
            </Button>
          </>
        )}
        {canDelete && (
          <Button
            size="sm"
            variant="ghost"
            disabled={pending || isSelf}
            title={
              isSelf ? "Você não pode remover a si mesmo" : "Remover do tenant"
            }
            className="text-[var(--color-danger)] hover:bg-[#fee2e2]"
            onClick={() => {
              if (
                !window.confirm(
                  `Remover ${name || "este membro"} do tenant? O acesso será revogado.`,
                )
              )
                return;
              run(() => removeMember(userId));
            }}
          >
            Remover
          </Button>
        )}
      </div>
      {error && <span className="text-xs text-[var(--color-danger)]">{error}</span>}
    </div>
  );
}
