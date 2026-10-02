"use client";

import { useRef, useState, useTransition } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { perguntarAoAssistente, type RespostaDoChat } from "@/lib/actions/assistente-chat";
import { MAX_PERGUNTA } from "@/lib/assistente-chat";
import { Faisca } from "@/components/app/assistente-funcionarios";
import { Button } from "@/components/ui/button";

/**
 * Prompt E, Etapa 2 — chat suspenso, SOMENTE LEITURA (decisão de 01/10/2026).
 * Botão no canto inferior direito, em qualquer tela; abre por cima, sem
 * navegar. O contexto (obra da tela) vem da URL e é validado no servidor.
 * A conversa fica só na memória desta aba: nada é gravado.
 */
type Mensagem = { de: "voce"; texto: string } | { de: "assistente"; resposta: RespostaDoChat } | { de: "erro"; texto: string };

export function ChatAssistente({ projetos }: { projetos: { id: string; name: string }[] }) {
  const sp = useSearchParams();
  const proj = sp.get("proj") ?? sp.get("project");
  const daTela = proj ? (projetos.find((p) => p.id === proj) ?? null) : null;
  const [aberto, setAberto] = useState(false);
  const [texto, setTexto] = useState("");
  const [conversa, setConversa] = useState<Mensagem[]>([]);
  const [pendente, start] = useTransition();
  const fim = useRef<HTMLDivElement>(null);

  const enviar = () => {
    const pergunta = texto.trim();
    if (!pergunta || pendente) return;
    setTexto("");
    setConversa((c) => [...c, { de: "voce", texto: pergunta }]);
    start(async () => {
      try {
        const r = await perguntarAoAssistente(pergunta, daTela?.id ?? null);
        setConversa((c) => [...c, r.ok ? { de: "assistente", resposta: r.resposta } : { de: "erro", texto: r.error }]);
      } catch {
        setConversa((c) => [...c, { de: "erro", texto: "Não consegui responder agora. Tente de novo." }]);
      }
      setTimeout(() => fim.current?.scrollIntoView({ block: "end" }), 0);
    });
  };

  return (
    <>
      <button
        type="button"
        onClick={() => setAberto((a) => !a)}
        aria-label={aberto ? "Fechar o assistente" : "Abrir o assistente"}
        aria-expanded={aberto}
        data-chat-botao
        className="fixed bottom-5 right-5 z-[90] flex h-12 w-12 items-center justify-center rounded-full border border-[var(--color-line)] bg-[var(--color-surface)] shadow-lg hover:shadow-xl print:hidden"
      >
        <Faisca />
      </button>
      {aberto && (
        <div
          role="dialog"
          aria-label="Assistente"
          data-chat
          className="fixed bottom-20 right-5 z-[90] flex max-h-[70vh] w-[min(380px,calc(100vw-2.5rem))] flex-col overflow-hidden rounded-[12px] border border-[var(--color-line)] bg-[var(--color-surface)] shadow-2xl print:hidden"
        >
          <div className="border-b border-[var(--color-line)] px-4 py-3">
            <div className="flex items-center justify-between">
              <span className="text-sm font-semibold text-[var(--color-ink)]">Assistente</span>
              <button type="button" onClick={() => setAberto(false)} className="text-[12px] text-[var(--color-ink3)] hover:text-[var(--color-ink)]">
                fechar
              </button>
            </div>
            <p className="mt-1 text-[11.5px] text-[var(--color-ink3)]" data-chat-contexto>
              Contexto: {daTela ? daTela.name : "todas as obras que você vê"}. Responde sobre receita, custo, desvio e saldo; não grava nada.
            </p>
          </div>
          <div className="flex-1 space-y-3 overflow-y-auto px-4 py-3 text-[13px]">
            {conversa.length === 0 && (
              <div className="space-y-1.5 text-[12.5px] text-[var(--color-ink2)]">
                <p>Exemplos:</p>
                <ul className="list-disc space-y-0.5 pl-4">
                  <li>Quanto já gastamos nesta obra este ano?</li>
                  <li>Qual o desvio de custo contra o orçado?</li>
                  <li>Qual a receita orçada de todas as obras?</li>
                  <li>Qual o saldo das contas hoje?</li>
                </ul>
                <p className="pt-1 text-[11.5px] text-[var(--color-ink3)]">
                  Só a sua pergunta vai ao modelo de IA, para entender o que você quer. Nenhum dado do sistema vai junto: o número é
                  calculado aqui, com o seu acesso.
                </p>
              </div>
            )}
            {conversa.map((m, i) =>
              m.de === "voce" ? (
                <p key={i} className="ml-8 rounded-[10px] bg-[var(--color-surface2)] px-3 py-2 text-[var(--color-ink)]">
                  {m.texto}
                </p>
              ) : m.de === "erro" ? (
                <p key={i} className="text-[var(--color-danger)]" role="alert">
                  {m.texto}
                </p>
              ) : (
                <div key={i} className="space-y-1" data-chat-resposta>
                  {m.resposta.entendido && <p className="text-[11px] uppercase tracking-wide text-[var(--color-ink3)]">Entendi: {m.resposta.entendido}</p>}
                  <p className="font-medium text-[var(--color-ink)]">{m.resposta.texto}</p>
                  {m.resposta.detalhes.length > 0 && (
                    <ul className="list-disc space-y-0.5 pl-4 text-[12px] text-[var(--color-ink2)]">
                      {m.resposta.detalhes.map((d) => (
                        <li key={d}>{d}</li>
                      ))}
                    </ul>
                  )}
                  {m.resposta.link && (
                    <Link href={m.resposta.link.href} className="text-[12px] text-[var(--color-accent2)] hover:underline">
                      {m.resposta.link.rotulo} →
                    </Link>
                  )}
                </div>
              ),
            )}
            {pendente && <p className="text-[12px] text-[var(--color-ink3)]">Calculando…</p>}
            <div ref={fim} />
          </div>
          <form
            className="flex gap-2 border-t border-[var(--color-line)] p-3"
            onSubmit={(e) => {
              e.preventDefault();
              enviar();
            }}
          >
            <input
              value={texto}
              onChange={(e) => setTexto(e.target.value)}
              maxLength={MAX_PERGUNTA}
              placeholder="Pergunte sobre receita, custo, desvio ou saldo"
              aria-label="Pergunta"
              className="h-9 min-w-0 flex-1 rounded-[8px] border border-[var(--color-line)] bg-transparent px-3 text-[13px] outline-none focus:border-[var(--color-accent2)]"
            />
            <Button type="submit" size="sm" disabled={pendente || !texto.trim()}>
              Enviar
            </Button>
          </form>
        </div>
      )}
    </>
  );
}
