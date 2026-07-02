import { eq } from "drizzle-orm";
import { db, schema } from "@/lib/db";
import { getActiveContext } from "@/lib/context";
import { changePassword } from "@/lib/actions/account";
import { mfaEnforced } from "@/lib/mfa";
import { PageHeader } from "@/components/app/page-header";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/input";
import { PasswordInput } from "@/components/ui/password-input";
import { MfaSetup } from "@/components/app/mfa-setup";

export const dynamic = "force-dynamic";

export default async function PerfilPage() {
  const ctx = await getActiveContext();
  if (!ctx || !ctx.userId) return null;
  const [user] = await db
    .select()
    .from(schema.users)
    .where(eq(schema.users.id, ctx.userId))
    .limit(1);

  return (
    <>
      <PageHeader
        title="Meu perfil"
        subtitle={`${user?.name ?? user?.email ?? ""} · papel ${ctx.role}`}
      />

      <div className="grid gap-4 md:grid-cols-2">
        <Card>
          <CardContent className="space-y-4 p-5">
            <h2 className="text-sm font-semibold text-[var(--color-ink)]">
              Autenticação em 2 fatores (MFA)
            </h2>
            <MfaSetup enabled={!!user?.mfaEnabled} enforced={mfaEnforced()} />
          </CardContent>
        </Card>

        <Card>
          <CardContent className="space-y-4 p-5">
            <h2 className="text-sm font-semibold text-[var(--color-ink)]">
              Alterar senha
            </h2>
            <form action={changePassword} className="space-y-3">
              <div>
                <Label>Senha atual</Label>
                <PasswordInput name="current" autoComplete="current-password" />
              </div>
              <div>
                <Label>Nova senha (mín. 8)</Label>
                <PasswordInput name="next" autoComplete="new-password" required />
              </div>
              <Button type="submit">Salvar senha</Button>
            </form>
          </CardContent>
        </Card>
      </div>
    </>
  );
}
