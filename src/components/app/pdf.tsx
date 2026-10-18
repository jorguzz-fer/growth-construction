"use client";

import { Button } from "@/components/ui/button";

/**
 * Prompt PDF (Fase 3) — "Exportar PDF". BPDF-1 em aberto: o PDF sai pelo
 * navegador (Imprimir → Salvar como PDF), sem servidor de renderização. O
 * nome sugerido do arquivo vem do título do documento durante a impressão.
 */
export function ExportarPdf({ arquivo, label = "Exportar PDF" }: { arquivo: string; label?: string }) {
  return (
    <Button
      type="button"
      variant="outline"
      size="sm"
      data-exportar-pdf
      className="print:hidden"
      onClick={() => {
        const antes = document.title;
        document.title = arquivo;
        const voltar = () => {
          document.title = antes;
          window.removeEventListener("afterprint", voltar);
        };
        window.addEventListener("afterprint", voltar);
        window.print();
      }}
    >
      {label}
    </Button>
  );
}
