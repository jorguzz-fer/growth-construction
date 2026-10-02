"use client";

import { useRef, useState, useTransition } from "react";
import Link from "next/link";
import { perguntarAoProduto } from "@/lib/actions/assistente-produto";
import { AVISO_DO_ASSISTENTE, EXEMPLOS_DO_ASSISTENTE, MAX_MENSAGEM_PRODUTO, trechosDaResposta, type FalaDoAssistente } from "@/lib/assistente-produto";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Faisca } from "@/components/app/assistente-funcionarios";

/**
 * Prompt AM, Parte 3 — a conversa com o Assistente do produto. A conversa vive
 * só nesta aba (BAM-3: some ao recarregar); nada é gravado.
 */
export function AssistenteProduto() {
  const [conversa, setConversa] = useState<FalaDoAssistente[]>([]);
  const [erro, setErro] = useState<string | null>(null);
  const [texto, setTexto] = useState("");
  const [pendente, start] = useTransition();
  const fim = useRef<HTMLDivElement>(null);

  const enviar = (pergunta: string) => {
    const q = pergunta.trim();
    if (!q || pendente) return;
    const nova: FalaDoAssistente[] = [...conversa, { de: "usuario", texto: q }];
    setConversa(nova);
    setTexto("");
    setErro(null);
    start(async () => {
      try {
        const r = await perguntarAoProduto(nova);
        if (r.ok) setConversa([...nova, { de: "assistente", texto: r.texto }]);
        else setErro(r.error);
      } catch {
        setErro("Não consegui responder agora. Tente de novo.");
      }
      setTimeout(() => fim.current?.scrollIntoView({ block: "end" }), 0);
    });
  };

  return (
    <Card data-assistente-produto>
      <CardContent className="space-y-4 p-5">
        {/* 4.4 — a ausência de dados declarada na tela, sempre visível. */}
        <p className="rounded-[8px] bg-[var(--color-surface2)] px-3 py-2 text-[12.5px] text-[var(--color-ink2)]" data-aviso-sem-dados>
          {AVISO_DO_ASSISTENTE} Para receita, custo, desvio e saldo da empresa, use o chat do botão no canto inferior direito.
        </p>
        {conversa.length === 0 && (
          <div className="space-y-2 text-[13px] text-[var(--color-ink2)]">
            <p>
              Pergunte como o sistema funciona: onde fica cada coisa, o que cada campo significa, a diferença entre telas parecidas. Ele
              não grava nada e não dá orientação fiscal ou contábil.
            </p>
            <div className="flex flex-wrap gap-2">
              {EXEMPLOS_DO_ASSISTENTE.map((e) => (
                <button
                  key={e}
                  type="button"
                  onClick={() => enviar(e)}
                  className="rounded-full border border-[var(--color-line)] px-3 py-1 text-[12px] hover:border-[var(--color-accent2)]"
                >
                  {e}
                </button>
              ))}
            </div>
          </div>
        )}
        <div className="space-y-3 text-[13.5px]">
          {conversa.map((f, i) =>
            f.de === "usuario" ? (
              <p key={i} className="ml-10 rounded-[10px] bg-[var(--color-surface2)] px-3 py-2 text-[var(--color-ink)]">
                {f.texto}
              </p>
            ) : (
              <div key={i} className="flex gap-2" data-resposta-assistente>
                <Faisca />
                <p className="whitespace-pre-wrap leading-relaxed text-[var(--color-ink)]">
                  {trechosDaResposta(f.texto).map((t, j) =>
                    t.tipo === "link" ? (
                      <Link key={j} href={t.href} className="text-[var(--color-accent2)] underline">
                        {t.texto}
                      </Link>
                    ) : (
                      <span key={j}>{t.texto.replace(/\*\*/g, "")}</span>
                    ),
                  )}
                </p>
              </div>
            ),
          )}
          {pendente && <p className="text-[12px] text-[var(--color-ink3)]">Pensando…</p>}
          {erro && (
            <p className="text-[13px] text-[var(--color-danger)]" role="alert">
              {erro}
            </p>
          )}
          <div ref={fim} />
        </div>
        <form
          className="flex gap-2"
          onSubmit={(e) => {
            e.preventDefault();
            enviar(texto);
          }}
        >
          <input
            value={texto}
            onChange={(e) => setTexto(e.target.value)}
            maxLength={MAX_MENSAGEM_PRODUTO}
            placeholder="Como funciona…?"
            aria-label="Pergunta ao Assistente"
            className="h-10 min-w-0 flex-1 rounded-[8px] border border-[var(--color-line)] bg-transparent px-3 text-[13.5px] outline-none focus:border-[var(--color-accent2)]"
          />
          <Button type="submit" disabled={pendente || !texto.trim()}>
            Perguntar
          </Button>
          {conversa.length > 0 && (
            <Button type="button" variant="outline" onClick={() => (setConversa([]), setErro(null))}>
              Nova conversa
            </Button>
          )}
        </form>
      </CardContent>
    </Card>
  );
}
