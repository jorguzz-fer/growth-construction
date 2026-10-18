/**
 * Prompt PDF (Fase 3) — a faixa que só aparece no PDF, acima do título da
 * tela: a empresa e quando (e por quem) foi gerado. Na tela fica escondida.
 */
export function CabecalhoDeImpressao({ empresa, geradoPor, agora = new Date() }: { empresa: string; geradoPor?: string | null; agora?: Date }) {
  const quando = agora.toLocaleString("pt-BR", { timeZone: "America/Sao_Paulo", dateStyle: "short", timeStyle: "short" });
  return (
    <div data-cabecalho-impressao className="mb-3 hidden items-baseline justify-between border-b border-black/20 pb-1.5 text-[10.5px] text-black/70 print:flex">
      <span className="font-semibold uppercase tracking-wide text-black">{empresa}</span>
      <span>
        Gerado em {quando}
        {geradoPor ? ` por ${geradoPor}` : ""}
      </span>
    </div>
  );
}
