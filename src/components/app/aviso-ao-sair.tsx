"use client";

import { useEffect } from "react";

export const PERGUNTA_AO_SAIR = "Há alterações não salvas nesta tela. Sair sem salvar?";

/**
 * Prompt D2 — aviso ao sair sem salvar. Cobre fechar ou recarregar a aba
 * (`beforeunload`) e os links dentro do app (a navegação do Next não dispara
 * `beforeunload`): o clique num link pede confirmação antes de seguir.
 */
export function useAvisoAoSair(sujo: boolean) {
  useEffect(() => {
    if (!sujo) return;
    const antes = (e: BeforeUnloadEvent) => {
      e.preventDefault();
      e.returnValue = "";
    };
    const clique = (e: MouseEvent) => {
      if (e.defaultPrevented || e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
      const a = (e.target as Element | null)?.closest?.("a[href]") as HTMLAnchorElement | null;
      if (!a || a.target === "_blank" || a.hasAttribute("download")) return;
      const destino = new URL(a.href, window.location.href);
      if (destino.origin !== window.location.origin) return;
      if (destino.pathname === window.location.pathname && destino.search === window.location.search) return;
      if (!window.confirm(PERGUNTA_AO_SAIR)) {
        e.preventDefault();
        e.stopPropagation();
      }
    };
    window.addEventListener("beforeunload", antes);
    document.addEventListener("click", clique, true);
    return () => {
      window.removeEventListener("beforeunload", antes);
      document.removeEventListener("click", clique, true);
    };
  }, [sujo]);
}
