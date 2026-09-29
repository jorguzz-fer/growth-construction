"use client";

import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useEffect, useState, type ReactNode } from "react";
import { PARAM_PROJETO } from "@/lib/projeto-selecao";

/**
 * Memória por aba (B-A2, Prompt A). A obra da tela mora na URL (`?proj=`); a
 * aba lembra a última obra escolhida em `sessionStorage`, que o navegador
 * mantém separado por aba. Não é cookie, não vai ao servidor e não vale para
 * outras abas: duas abas em obras diferentes ficam independentes (seção 32).
 */
const CHAVE = "gc:projeto";

export function lerProjetoDaAba(): string | null {
  try {
    return window.sessionStorage.getItem(CHAVE);
  } catch {
    return null; // navegação privada / armazenamento bloqueado: sem memória
  }
}

export function gravarProjetoDaAba(projectId: string) {
  try {
    window.sessionStorage.setItem(CHAVE, projectId);
  } catch {
    // sem memória nesta aba; a tela continua funcionando pela URL
  }
}

/** Registra na aba a obra que a tela está mostrando (vinda da URL). */
export function LembrarProjeto({ projectId }: { projectId: string }) {
  useEffect(() => {
    gravarProjetoDaAba(projectId);
  }, [projectId]);
  return null;
}

/**
 * Tela aberta sem obra na URL: se a aba lembra uma obra que ainda está na
 * lista do usuário, reabre a tela nela (trocando a URL, sem novo item no
 * histórico). Senão, mostra `children` — o pedido de escolha. Nunca escolhe
 * o primeiro projeto.
 */
export function RecuperarProjeto({
  idsPermitidos,
  children,
}: {
  idsPermitidos: string[];
  children: ReactNode;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const sp = useSearchParams();
  const [semMemoria, setSemMemoria] = useState(false);
  // Chave estável: o array chega novo a cada renderização.
  const ids = idsPermitidos.join("|");

  useEffect(() => {
    const lembrado = lerProjetoDaAba();
    if (lembrado && ids.split("|").includes(lembrado)) {
      const params = new URLSearchParams(sp.toString());
      params.set(PARAM_PROJETO, lembrado);
      router.replace(`${pathname}?${params.toString()}`);
    } else {
      setSemMemoria(true);
    }
  }, [ids, pathname, router, sp]);

  return semMemoria ? <>{children}</> : null;
}
