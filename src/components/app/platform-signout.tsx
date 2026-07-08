"use client";

import { signOut } from "next-auth/react";

/** Sair do backoffice: encerra a sessão e volta ao login da plataforma. */
export function PlatformSignOut() {
  return (
    <button
      onClick={async () => {
        await signOut({ redirect: false });
        window.location.href = "/plataforma/login";
      }}
      className="rounded-[8px] px-3 py-1.5 text-[12px] text-white/50 transition-colors hover:bg-white/10 hover:text-white/80"
    >
      Sair
    </button>
  );
}
