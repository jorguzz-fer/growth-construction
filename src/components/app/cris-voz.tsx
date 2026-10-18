"use client";

import { useEffect, useRef, useState } from "react";

/**
 * Prompt VOZ (Fase 3) — ditado no chat da Cris, pelo reconhecimento de fala
 * do próprio navegador (Web Speech API, pt-BR). O texto ditado entra na
 * caixa de mensagem, para a pessoa conferir e enviar: o caminho depois é o
 * mesmo do texto digitado.
 *
 * BV2-1 (decidido no prompt): nenhum áudio passa pelo servidor do app nem vai
 * ao modelo da Cris; o navegador transcreve. No Chrome e no Edge o
 * reconhecimento roda no serviço de fala do fabricante do navegador. Sem
 * suporte (Firefox, por exemplo), o botão não aparece.
 */

interface ResultadoDeFala {
  results: ArrayLike<ArrayLike<{ transcript: string }> & { isFinal: boolean }>;
  resultIndex: number;
}
interface Reconhecedor {
  lang: string;
  continuous: boolean;
  interimResults: boolean;
  onresult: ((e: ResultadoDeFala) => void) | null;
  onend: (() => void) | null;
  onerror: ((e: { error: string }) => void) | null;
  start: () => void;
  stop: () => void;
}
type Construtor = new () => Reconhecedor;

function construtorDeFala(): Construtor | null {
  if (typeof window === "undefined") return null;
  const w = window as unknown as { SpeechRecognition?: Construtor; webkitSpeechRecognition?: Construtor };
  return w.SpeechRecognition ?? w.webkitSpeechRecognition ?? null;
}

export function BotaoDeVoz({ onTexto }: { onTexto: (texto: string) => void }) {
  const [suportado, setSuportado] = useState(false);
  const [ouvindo, setOuvindo] = useState(false);
  const [erro, setErro] = useState<string | null>(null);
  const rec = useRef<Reconhecedor | null>(null);
  const onTextoRef = useRef(onTexto);
  onTextoRef.current = onTexto;

  useEffect(() => setSuportado(!!construtorDeFala()), []);
  useEffect(() => () => rec.current?.stop(), []);

  if (!suportado) return null;

  const alternar = () => {
    if (ouvindo) {
      rec.current?.stop();
      return;
    }
    const C = construtorDeFala();
    if (!C) return;
    const r = new C();
    r.lang = "pt-BR";
    r.continuous = false;
    r.interimResults = false;
    r.onresult = (e) => {
      const partes: string[] = [];
      for (let i = e.resultIndex; i < e.results.length; i++) if (e.results[i].isFinal) partes.push(e.results[i][0].transcript);
      const t = partes.join(" ").trim();
      if (t) onTextoRef.current(t);
    };
    r.onerror = (e) => setErro(e.error === "not-allowed" ? "Permita o microfone no navegador." : "Não entendi. Tente de novo.");
    r.onend = () => setOuvindo(false);
    rec.current = r;
    setErro(null);
    setOuvindo(true);
    r.start();
  };

  return (
    <button
      type="button"
      onClick={alternar}
      title={erro ?? (ouvindo ? "Parar de ouvir" : "Falar (ditado)")}
      aria-label={ouvindo ? "Parar de ouvir" : "Falar em vez de digitar"}
      aria-pressed={ouvindo}
      data-cris-voz
      className={`text-[16px] ${ouvindo ? "animate-pulse text-[var(--color-danger)]" : erro ? "text-[var(--color-warning)]" : "text-[var(--color-ink3)] hover:text-[var(--color-ink)]"}`}
    >
      🎤
    </button>
  );
}
