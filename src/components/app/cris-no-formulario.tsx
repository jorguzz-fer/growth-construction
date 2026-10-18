"use client";

import { useRef, useState } from "react";
import { useCrisFormulario } from "@/components/app/cris-contexto";
import type { CampoDoFormulario } from "@/lib/cris";
import { valoresParaOFormulario, type OpcoesPorCampo } from "@/lib/cris-no-formulario";

/**
 * Prompt AH2/AK2/AF2 — oferece à Cris um formulário da página que é
 * renderizado no servidor (campos não controlados, com `name`). Fica DENTRO
 * do <form>: ao aplicar a proposta, escreve o valor em cada campo pelo nome
 * (opção pelo rótulo → valor do <option>) e mostra o aviso. Quem grava ou
 * filtra é o botão do próprio formulário.
 */
export function CrisNoFormulario({ id, titulo, campos, opcoes = {}, aviso }: { id: string; titulo: string; campos: CampoDoFormulario[]; opcoes?: OpcoesPorCampo; aviso?: string }) {
  const ref = useRef<HTMLSpanElement>(null);
  const [preencheu, setPreencheu] = useState<number | null>(null);
  useCrisFormulario({ id, titulo, campos }, (p) => {
    const form = ref.current?.closest("form");
    if (!form) return;
    const valores = valoresParaOFormulario(p.valores, opcoes);
    let n = 0;
    for (const [nome, valor] of Object.entries(valores)) {
      const el = form.elements.namedItem(nome);
      if (!(el instanceof HTMLInputElement || el instanceof HTMLSelectElement || el instanceof HTMLTextAreaElement)) continue;
      el.value = valor;
      el.dispatchEvent(new Event("input", { bubbles: true }));
      el.dispatchEvent(new Event("change", { bubbles: true }));
      n++;
    }
    setPreencheu(n);
  });
  return (
    <span ref={ref} className="block">
      {preencheu != null && (
        <span data-cris-preencheu role="status" className="block text-[12.5px] text-[var(--color-accent)]">
          A Cris preencheu {preencheu} campo(s). {aviso ?? "Confira e clique no botão do formulário — nada foi gravado ainda."}
        </span>
      )}
    </span>
  );
}
