import { redirect } from "next/navigation";
import { eq } from "drizzle-orm";
import { db, schema } from "@/lib/db";
import { auth } from "@/lib/auth";
import { changePassword } from "@/lib/actions/account";
import { FormComResultado } from "@/components/app/form-com-resultado";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/input";
import { PasswordInput } from "@/components/ui/password-input";

export const dynamic = "force-dynamic";

/**
 * Troca obrigatória da senha provisória (Prompt AI, 1.2). Quem entra com senha
 * definida por outra pessoa — convite com senha inicial ou redefinição pelo
 * admin — cai aqui antes de qualquer tela (gate no layout do app).
 */
export default async function TrocarSenhaPage() {
  const session = await auth();
  const email = session?.user?.email?.toLowerCase();
  if (!email) redirect("/login");

  const [user] = await db
    .select({ mustChangePassword: schema.users.mustChangePassword })
    .from(schema.users)
    .where(eq(schema.users.email, email))
    .limit(1);
  if (!user) redirect("/login");
  if (!user.mustChangePassword) redirect("/dashboard");

  return (
    <div className="flex min-h-screen items-center justify-center px-4">
      <Card className="w-full max-w-md">
        <CardContent className="space-y-4 p-6">
          <div>
            <h1 className="text-lg font-semibold text-[var(--color-ink)]">Defina sua senha</h1>
            <p className="mt-1 text-sm text-[var(--color-ink3)]">
              Sua senha atual foi definida por um administrador. Para continuar,
              escolha uma senha que só você conheça.
            </p>
          </div>
          <FormComResultado
            action={changePassword}
            className="space-y-3"
            sucesso="Senha definida. Entrando…"
            aoConcluir="/dashboard"
          >
            <div>
              <Label>Senha atual (a que você recebeu)</Label>
              <PasswordInput name="current" autoComplete="current-password" required />
            </div>
            <div>
              <Label>Nova senha (mín. 8)</Label>
              <PasswordInput name="next" autoComplete="new-password" required minLength={8} />
            </div>
            <Button type="submit" className="w-full">
              Salvar e continuar
            </Button>
          </FormComResultado>
        </CardContent>
      </Card>
    </div>
  );
}
