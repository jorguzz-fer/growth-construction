"use client";

import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { disableMfa } from "@/lib/actions/account";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";

/**
 * Estado do MFA no perfil. Como a verificação em duas etapas é obrigatória,
 * não há "desativar" — apenas reconfigurar (gera novo QR e leva ao enrollment).
 */
export function MfaSetup({ enabled }: { enabled: boolean }) {
  const router = useRouter();
  const [pending, start] = useTransition();

  if (!enabled) {
    return (
      <div className="space-y-3">
        <Badge tone="warning">pendente</Badge>
        <p className="text-sm text-[var(--color-ink3)]">
          A verificação em duas etapas é obrigatória. Conclua a ativação.
        </p>
        <Button onClick={() => router.push("/mfa")}>Ativar agora</Button>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      <Badge tone="success">ativada</Badge>
      <p className="text-sm text-[var(--color-ink3)]">
        Seu acesso exige um código do app autenticador a cada login.
      </p>
      <Button
        variant="outline"
        disabled={pending}
        onClick={() =>
          start(async () => {
            // Invalida o segredo atual e reinicia o enrollment (novo QR).
            await disableMfa();
            router.push("/mfa");
          })
        }
      >
        {pending ? "Preparando…" : "Reconfigurar (novo QR)"}
      </Button>
      <p className="text-xs text-[var(--color-ink4)]">
        Use se trocou de celular. Você fará a ativação novamente em seguida.
      </p>
    </div>
  );
}
