/**
 * Documentos da medição (Prompt V, seção 5). Módulo PURO.
 *
 * A medição do mercado tem papel: laudo do fiscal, relatório fotográfico,
 * PLS assinada, ART/RRT. Cada tipo tem a SUA numeração de versão por
 * medição (5.4): anexar um laudo depois de um laudo v1 vira laudo v2; anexar
 * uma PLS depois não herda a numeração do laudo. Remover desfaz o vínculo,
 * não apaga o arquivo (5.5).
 */
export const TIPOS_DOC_MEDICAO = ["Laudo de medição", "Relatório fotográfico", "PLS", "ART/RRT", "Outros"] as const;
export type TipoDocMedicao = (typeof TIPOS_DOC_MEDICAO)[number];
export const TIPO_LAUDO: TipoDocMedicao = "Laudo de medição";

export function tipoDeDocValido(tipo: unknown): tipo is TipoDocMedicao {
  return typeof tipo === "string" && (TIPOS_DOC_MEDICAO as readonly string[]).includes(tipo);
}

/**
 * 5.4 — a versão do próximo anexo de um tipo: a maior versão já gravada
 * DESSE tipo NESTA medição + 1. Outros tipos não contam.
 */
export function proximaVersao(existentes: readonly { tipo: string | null; versao: number }[], tipo: string): number {
  const doTipo = existentes.filter((d) => d.tipo === tipo).map((d) => d.versao);
  return (doTipo.length ? Math.max(...doTipo) : 0) + 1;
}

export interface DocDaMedicao {
  id: string;
  filename: string;
  tipo: string | null;
  versao: number;
  url: string | null;
  uploadedAt: string | null;
  legivel: boolean;
}

/** Rótulo "Laudo de medição v2" para a lista. */
export function rotuloDoDoc(d: { tipo: string | null; versao: number }): string {
  return `${d.tipo ?? "Documento"} v${d.versao}`;
}
