import Link from "next/link";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { buttonVariants } from "@/components/ui/button";

/*
 * Placeholder da tela de login (Fase 0).
 * O fluxo de autenticação real (providers Auth.js, papéis, convites) entra na
 * Fase 6. Ver docs/STACK.md §2 e §7.
 */
export default function LoginPage() {
  return (
    <main className="flex min-h-screen items-center justify-center px-6">
      <Card className="w-full max-w-sm">
        <CardHeader>
          <span className="font-[family-name:var(--font-mono)] text-[10px] uppercase tracking-[0.2em] text-[var(--color-ink3)]">
            Growth Tools · Construction
          </span>
          <CardTitle className="font-[family-name:var(--font-serif)] text-2xl">
            Entrar
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <p className="text-sm text-[var(--color-ink3)]">
            Autenticação será habilitada na Fase 6. Por enquanto, acesse o app
            diretamente.
          </p>
          <Link
            href="/dashboard"
            className={buttonVariants({ className: "w-full" })}
          >
            Continuar para o app
          </Link>
        </CardContent>
      </Card>
    </main>
  );
}
