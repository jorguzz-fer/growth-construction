"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { travarVersao } from "@/lib/actions/versao-trava";
import { confirmacaoDaTrava, textoDaTrava } from "@/lib/versao-trava";

/** Botão de travar/destravar uma versão (Prompt AP, BAP-2), com confirmação. */
export function BotaoTrava({ versionId, rotulo, locked }: { versionId: string; rotulo: string; locked: boolean }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [erro, setErro] = useState<string | null>(null);
  const t = textoDaTrava(locked);
  return (
    <span className="inline-flex items-center gap-1.5">
      <button
        type="button"
        disabled={pending}
        onClick={() => {
          if (!window.confirm(confirmacaoDaTrava(rotulo, !locked))) return;
          setErro(null);
          start(async () => {
            const r = await travarVersao(versionId, !locked);
            if (!r.ok) setErro(r.error);
            else router.refresh();
          });
        }}
        className="rounded-[7px] border border-[var(--color-line)] px-2 py-0.5 text-[11.5px] font-medium text-[var(--color-ink2)] hover:bg-[var(--color-surface2)] disabled:opacity-50"
      >
        {pending ? "…" : t.botao}
      </button>
      {erro && <span role="alert" className="text-[11px] text-[var(--color-danger)]">{erro}</span>}
    </span>
  );
}
