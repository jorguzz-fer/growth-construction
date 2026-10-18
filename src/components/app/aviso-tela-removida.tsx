import { avisoDeTelaRemovida } from "@/lib/telas-removidas";

/**
 * Aviso de uma linha na tela que assumiu a função de uma tela que saiu
 * (Prompts AL e AB2). Sem parâmetro conhecido, não mostra nada.
 */
export function AvisoTelaRemovida({ de }: { de: string | string[] | undefined | null }) {
  const aviso = avisoDeTelaRemovida(de);
  if (!aviso) return null;
  return (
    <p role="status" data-aviso-tela-removida className="mb-4 rounded-[8px] border border-[var(--color-line)] bg-[var(--color-surface2)] px-3 py-2 text-[13px] text-[var(--color-ink2)]">
      {aviso}
    </p>
  );
}
