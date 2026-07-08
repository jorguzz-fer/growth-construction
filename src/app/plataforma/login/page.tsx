"use client";

import { Suspense, useState } from "react";
import { signIn } from "next-auth/react";
import { useRouter, useSearchParams } from "next/navigation";
import { precheckPlatformLogin } from "@/lib/actions/platform-auth";
import { PasswordInput } from "@/components/ui/password-input";

/**
 * Login do Backoffice / Plataforma — entrada dedicada dos operadores da Growth
 * Tools (super-admins). Mesma base de contas do app, mas ambiente separado: só
 * super-admins entram aqui e vão para /plataforma.
 */
function PlataformaLoginInner() {
  const router = useRouter();
  const params = useSearchParams();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(
    params.get("error") === "forbidden"
      ? "Esta conta não tem acesso ao backoffice."
      : null,
  );
  const [loading, setLoading] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setLoading(true);
    try {
      const pre = await precheckPlatformLogin(email, password);
      if (!pre.ok) {
        setError(
          pre.notAuthorized
            ? "Esta conta não tem acesso ao backoffice."
            : "E-mail ou senha incorretos.",
        );
        return;
      }
      const res = await signIn("credentials", {
        email,
        password,
        redirect: false,
      });
      if (res?.error) {
        setError("Credenciais inválidas.");
        return;
      }
      router.push("/plataforma");
      router.refresh();
    } finally {
      setLoading(false);
    }
  }

  return (
    <main className="flex min-h-screen flex-col items-center justify-center bg-[#0b0b12] px-4 py-10">
      <div className="mb-6 text-center">
        <div className="font-[family-name:var(--font-serif)] text-xl text-white">
          Growth Tools
        </div>
        <div className="mt-0.5 font-[family-name:var(--font-mono)] text-[9px] uppercase tracking-[0.2em] text-[var(--color-accent3)]/70">
          Backoffice · Plataforma
        </div>
      </div>

      <div className="w-full max-w-[400px] rounded-[18px] border border-white/10 bg-[#14141d] p-7 sm:p-8">
        <h1 className="text-center text-lg font-semibold text-white">
          Acesso da plataforma
        </h1>
        <p className="mx-auto mt-2 max-w-[300px] text-center text-[12.5px] leading-relaxed text-white/45">
          Área restrita aos operadores da Growth Tools.
        </p>
        <form onSubmit={submit} className="mt-5 space-y-4">
          <div>
            <label className="mb-1.5 block text-[12.5px] font-medium text-white/80">
              E-mail
            </label>
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              autoComplete="email"
              required
              className="h-11 w-full rounded-[10px] border border-white/10 bg-black/30 px-3 text-sm text-white outline-none placeholder:text-white/20 focus:border-[var(--color-accent3)] focus:ring-2 focus:ring-[var(--color-accent2)]/30"
            />
          </div>
          <div>
            <label className="mb-1.5 block text-[12.5px] font-medium text-white/80">
              Senha
            </label>
            <PasswordInput
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              autoComplete="current-password"
              required
              className="h-11 rounded-[10px] border-white/10 bg-black/30 text-white placeholder:text-white/20 focus:border-[var(--color-accent3)] focus:ring-[var(--color-accent2)]/30"
              iconClassName="text-white/40 hover:text-white"
            />
          </div>
          {error && (
            <p className="text-center text-[13px] text-[#f87171]">{error}</p>
          )}
          <button
            type="submit"
            disabled={loading}
            className="h-11 w-full rounded-[10px] bg-[var(--color-accent2)] text-sm font-medium text-white transition-colors hover:bg-[var(--color-accent)] disabled:opacity-40"
          >
            {loading ? "Verificando…" : "Entrar"}
          </button>
        </form>
      </div>

      <a
        href="/login"
        className="mt-6 text-center text-[12px] text-white/30 hover:text-white/60"
      >
        Acessar o app de um cliente →
      </a>
    </main>
  );
}

export default function PlataformaLoginPage() {
  return (
    <Suspense>
      <PlataformaLoginInner />
    </Suspense>
  );
}
