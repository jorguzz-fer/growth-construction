"use client";

import Image from "next/image";
import { useState, useTransition } from "react";
import { beginMfa, confirmMfa, disableMfa } from "@/lib/actions/account";
import { Button } from "@/components/ui/button";
import { Input, Label } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";

export function MfaSetup({ enabled }: { enabled: boolean }) {
  const [qr, setQr] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);

  if (enabled) {
    return (
      <div className="space-y-3">
        <Badge tone="success">MFA ativado</Badge>
        <p className="text-sm text-[var(--color-ink3)]">
          Seu acesso exige um código do app autenticador.
        </p>
        <Button
          variant="outline"
          disabled={pending}
          onClick={() => start(() => disableMfa())}
        >
          Desativar MFA
        </Button>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      <Badge tone="warning">MFA desativado</Badge>
      {!qr ? (
        <div>
          <p className="mb-2 text-sm text-[var(--color-ink3)]">
            Proteja sua conta com um segundo fator (Google Authenticator, Authy…).
          </p>
          <Button
            disabled={pending}
            onClick={() =>
              start(async () => {
                const { qr } = await beginMfa();
                setQr(qr);
              })
            }
          >
            Configurar MFA
          </Button>
        </div>
      ) : (
        <div className="space-y-3">
          <p className="text-sm text-[var(--color-ink2)]">
            1. Escaneie o QR no seu app autenticador:
          </p>
          <Image src={qr} alt="QR MFA" width={180} height={180} unoptimized />
          <form
            action={async (fd) => {
              setError(null);
              try {
                await confirmMfa(fd);
                setQr(null);
              } catch (e) {
                setError(e instanceof Error ? e.message : "Erro.");
              }
            }}
            className="flex items-end gap-2"
          >
            <div>
              <Label>2. Digite o código gerado</Label>
              <Input name="code" inputMode="numeric" placeholder="000000" required />
            </div>
            <Button type="submit">Ativar</Button>
          </form>
          {error && <p className="text-sm text-[var(--color-danger)]">{error}</p>}
        </div>
      )}
    </div>
  );
}
