"use client";

import Image from "next/image";
import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { confirmMfa } from "@/lib/actions/account";

/** Segredo base32 em grupos de 4 (ex.: "6QDN KM4S HZXP ..."). */
function groupSecret(secret: string): string {
  return (secret.match(/.{1,4}/g) ?? [secret]).join(" ");
}

/**
 * Tela de enrollment do MFA (obrigatório), no modelo: QR central, chave
 * manual copiável, link "abrir no app autenticador" e código de 6 dígitos.
 */
export function MfaEnroll({
  qr,
  secret,
  otpauth,
  brand,
}: {
  qr: string;
  secret: string;
  otpauth: string;
  brand: string;
}) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [code, setCode] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  function copy() {
    navigator.clipboard.writeText(secret).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    });
  }

  function submit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    const fd = new FormData();
    fd.set("code", code);
    start(async () => {
      try {
        await confirmMfa(fd);
        router.push("/dashboard");
        router.refresh();
      } catch (err) {
        setError(err instanceof Error ? err.message : "Código inválido.");
      }
    });
  }

  return (
    <main className="flex min-h-screen flex-col items-center justify-center bg-[#0d0d14] px-4 py-10">
      <div className="mb-6 font-[family-name:var(--font-serif)] text-xl text-white">
        {brand}
      </div>

      <div className="w-full max-w-[440px] rounded-[18px] border border-white/10 bg-[#15151f] p-7 sm:p-9">
        {/* Ícone */}
        <div className="mx-auto mb-5 flex h-12 w-12 items-center justify-center rounded-full bg-white/5 ring-1 ring-white/10">
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#a5b4fc" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
            <path d="M21 2l-2 2m-7.61 7.61a5.5 5.5 0 1 1-7.778 7.778 5.5 5.5 0 0 1 7.777-7.777zm0 0L15.5 7.5m0 0l3 3L22 7l-3-3m-3.5 3.5L19 4" />
          </svg>
        </div>

        <h1 className="text-center text-lg font-semibold text-white">
          Verificação em duas etapas
        </h1>
        <p className="mx-auto mt-2 max-w-[360px] text-center text-[13px] leading-relaxed text-white/50">
          Escaneie o QR code com um app autenticador (Google Authenticator,
          Authy, 1Password, Microsoft Authenticator…) e digite o código gerado.
        </p>

        {/* QR */}
        <div className="mx-auto mt-6 w-fit rounded-[12px] bg-white p-3">
          <Image src={qr} alt="QR code do MFA" width={192} height={192} unoptimized />
        </div>

        {/* Chave manual */}
        <p className="mt-6 text-[12.5px] font-medium text-white/80">
          Não consegue escanear? Digite esta chave no app:
        </p>
        <div className="mt-2 flex items-center gap-2 rounded-[10px] border border-white/10 bg-black/30 px-3 py-2.5">
          <code className="flex-1 select-all font-[family-name:var(--font-mono)] text-[12.5px] tracking-wide text-white/90">
            {groupSecret(secret)}
          </code>
          <button
            type="button"
            onClick={copy}
            title="Copiar chave"
            className="shrink-0 rounded-[6px] p-1.5 text-white/40 transition-colors hover:bg-white/10 hover:text-white"
          >
            {copied ? (
              <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="#10b981" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
                <path d="M20 6L9 17l-5-5" />
              </svg>
            ) : (
              <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
                <rect x="9" y="9" width="13" height="13" rx="2" />
                <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1" />
              </svg>
            )}
          </button>
        </div>

        <a
          href={otpauth}
          className="mt-2 inline-block text-[12px] text-white/40 underline decoration-dotted underline-offset-4 hover:text-white/70"
        >
          Abrir no app autenticador
        </a>

        {/* Código */}
        <form onSubmit={submit} className="mt-6">
          <label className="mb-1.5 block text-[12.5px] font-medium text-white/80">
            Código de verificação
          </label>
          <input
            value={code}
            onChange={(e) => setCode(e.target.value.replace(/\D/g, "").slice(0, 6))}
            inputMode="numeric"
            autoComplete="one-time-code"
            placeholder="0 0 0 0 0 0"
            className="h-12 w-full rounded-[10px] border border-white/10 bg-black/30 text-center font-[family-name:var(--font-mono)] text-lg tracking-[0.5em] text-white outline-none placeholder:text-white/20 focus:border-[var(--color-accent3)] focus:ring-2 focus:ring-[var(--color-accent2)]/30"
          />
          {error && (
            <p className="mt-2 text-center text-[13px] text-[#f87171]">{error}</p>
          )}
          <button
            type="submit"
            disabled={pending || code.length < 6}
            className="mt-4 h-11 w-full rounded-[10px] bg-[var(--color-accent2)] text-sm font-medium text-white transition-colors hover:bg-[var(--color-accent)] disabled:opacity-40"
          >
            {pending ? "Verificando…" : "Ativar verificação"}
          </button>
        </form>
      </div>

      <p className="mt-6 text-center text-[12px] text-white/30">
        A verificação em duas etapas é obrigatória para acessar o painel.
      </p>
    </main>
  );
}
