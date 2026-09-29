"use client";

import { signOut } from "next-auth/react";

/** Encerra o cookie de sessão e leva ao login (sessão revogada, AI 1.3). */
export function SairParaLogin() {
  return (
    <button
      type="button"
      onClick={async () => {
        await signOut({ redirect: false });
        window.location.href = "/login";
      }}
      className="mt-4 inline-block rounded-[8px] bg-[var(--color-accent2)] px-4 py-2 text-sm font-medium text-white hover:opacity-90"
    >
      Entrar de novo
    </button>
  );
}
