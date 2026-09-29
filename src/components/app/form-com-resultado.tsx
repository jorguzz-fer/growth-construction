"use client";

import { useRef, useState, useTransition } from "react";

type Resultado = { ok: boolean; error?: string };

/**
 * Formulário que chama uma Server Action que DEVOLVE `{ ok, error }` e mostra
 * o resultado. Existe porque `<form action>` ignora o retorno — e exceção de
 * Server Action não chega com mensagem ao navegador em produção.
 */
export function FormComResultado({
  action,
  children,
  className,
  sucesso = "Salvo.",
  aoConcluir,
}: {
  action: (fd: FormData) => Promise<Resultado | void>;
  children: React.ReactNode;
  className?: string;
  sucesso?: string;
  /** "recarregar" recarrega a página; uma rota navega para ela. */
  aoConcluir?: "recarregar" | string;
}) {
  const ref = useRef<HTMLFormElement>(null);
  const [pending, start] = useTransition();
  const [msg, setMsg] = useState<{ ok: boolean; texto: string } | null>(null);

  return (
    <form
      ref={ref}
      className={className}
      onSubmit={(e) => {
        e.preventDefault();
        const fd = new FormData(e.currentTarget);
        setMsg(null);
        start(async () => {
          const r = (await action(fd)) ?? { ok: true };
          if (!r.ok) {
            setMsg({ ok: false, texto: r.error ?? "Não foi possível concluir." });
            return;
          }
          ref.current?.reset();
          setMsg({ ok: true, texto: sucesso });
          if (aoConcluir === "recarregar") window.location.reload();
          else if (aoConcluir) window.location.href = aoConcluir;
        });
      }}
    >
      <fieldset disabled={pending} className="contents">
        {children}
      </fieldset>
      {msg && (
        <p
          className={`text-sm ${msg.ok ? "text-[var(--color-success)]" : "text-[var(--color-danger)]"}`}
          role={msg.ok ? "status" : "alert"}
        >
          {msg.texto}
        </p>
      )}
    </form>
  );
}
