"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from "react";
import { usePathname, useSearchParams } from "next/navigation";
import type { ContextoDeTela, FormularioDaTela, PropostaDePreenchimento } from "@/lib/cris";

/**
 * Prompt E2 — o que a tela aberta conta para a Cris.
 *
 * - `<CrisDaTela titulo dados sugestoes />`: a página (servidor) entrega o
 *   resumo dos números que ela mostra. Nada de dado pessoal: a tela monta o
 *   resumo, e o servidor ainda o limpa (`sanitizarDados`).
 * - `useCrisFormulario(form, aplicar)`: o formulário de lançamento declara os
 *   campos e a função que PREENCHE a tela com a proposta. Preencher não grava:
 *   quem grava é o botão do formulário (regra 4.2.1).
 */

type Aplicar = (p: PropostaDePreenchimento) => void;

interface EstadoDaCris {
  tela: ContextoDeTela | null;
  setTela: (t: Omit<ContextoDeTela, "rota" | "formulario"> | null) => void;
  registrarFormulario: (f: FormularioDaTela, aplicar: Aplicar) => () => void;
  aplicarProposta: (p: PropostaDePreenchimento) => boolean;
  /** Abre a Cris com uma pergunta pronta (ex.: o botão de um painel). */
  perguntar: (texto: string) => void;
  pedidoPendente: string | null;
  consumirPedido: () => void;
}

const CrisCtx = createContext<EstadoDaCris | null>(null);

export function CrisProvider({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const sp = useSearchParams();
  const rota = `${pathname}${sp.toString() ? `?${sp.toString()}` : ""}`;
  const [base, setBase] = useState<Omit<ContextoDeTela, "rota" | "formulario"> | null>(null);
  const [formulario, setFormulario] = useState<FormularioDaTela | null>(null);
  const aplicarRef = useRef<Aplicar | null>(null);
  const [pedidoPendente, setPedido] = useState<string | null>(null);

  const registrarFormulario = useCallback((f: FormularioDaTela, aplicar: Aplicar) => {
    setFormulario(f);
    aplicarRef.current = aplicar;
    return () => {
      setFormulario((atual) => (atual?.id === f.id ? null : atual));
      if (aplicarRef.current === aplicar) aplicarRef.current = null;
    };
  }, []);

  const aplicarProposta = useCallback((p: PropostaDePreenchimento) => {
    if (!aplicarRef.current || !formulario || formulario.id !== p.formulario) return false;
    aplicarRef.current(p);
    return true;
  }, [formulario]);

  const tela = useMemo<ContextoDeTela | null>(() => {
    if (!base && !formulario) return null;
    return { rota, titulo: base?.titulo ?? formulario?.titulo ?? "", dados: base?.dados ?? null, sugestoes: base?.sugestoes ?? [], formulario };
  }, [base, formulario, rota]);

  const valor = useMemo<EstadoDaCris>(
    () => ({
      tela,
      setTela: setBase,
      registrarFormulario,
      aplicarProposta,
      perguntar: setPedido,
      pedidoPendente,
      consumirPedido: () => setPedido(null),
    }),
    [tela, registrarFormulario, aplicarProposta, pedidoPendente],
  );
  return <CrisCtx.Provider value={valor}>{children}</CrisCtx.Provider>;
}

export function useCris(): EstadoDaCris | null {
  return useContext(CrisCtx);
}

/** A página registra o que mostra. Desmontou (trocou de tela), o contexto some. */
export function CrisDaTela({ titulo, dados, sugestoes }: { titulo: string; dados?: Record<string, unknown> | null; sugestoes?: string[] }) {
  const cris = useCris();
  const json = JSON.stringify(dados ?? null);
  const sug = JSON.stringify(sugestoes ?? []);
  useEffect(() => {
    if (!cris) return;
    cris.setTela({ titulo, dados: JSON.parse(json), sugestoes: JSON.parse(sug) });
    return () => cris.setTela(null);
    // `cris.setTela` é estável; o resto entra pelo JSON.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [titulo, json, sug]);
  return null;
}

/** O formulário se oferece à Cris enquanto está montado. */
export function useCrisFormulario(form: FormularioDaTela | null, aplicar: Aplicar) {
  const cris = useCris();
  const aplicarRef = useRef(aplicar);
  aplicarRef.current = aplicar;
  const json = JSON.stringify(form);
  useEffect(() => {
    if (!cris || !form) return;
    return cris.registrarFormulario(JSON.parse(json), (p) => aplicarRef.current(p));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [json]);
}

/** Botão "Perguntar à Cris" para os painéis: abre o chat com a pergunta. */
export function PerguntarACris({ pergunta, children, className }: { pergunta: string; children?: React.ReactNode; className?: string }) {
  const cris = useCris();
  if (!cris) return null;
  return (
    <button type="button" onClick={() => cris.perguntar(pergunta)} className={className ?? "text-left text-[12px] text-[var(--color-accent2)] hover:underline"}>
      {children ?? pergunta}
    </button>
  );
}
