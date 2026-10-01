/**
 * Prompt Y, 4-A.5 — foto de celular passa de 5 MB; o limite do servidor é
 * 10 MB por arquivo e 12 MB por envio. Comprime NO NAVEGADOR: redimensiona
 * para o lado maior de 2000 px e grava JPEG 0,85. PDF e outros arquivos
 * passam intactos. Só roda no cliente (usa canvas); em falha, devolve o
 * arquivo original.
 */
export const LADO_MAXIMO_PX = 2000;
export const QUALIDADE_JPEG = 0.85;
/** abaixo disto não vale comprimir. */
export const LIMIAR_BYTES = 1_200_000;

export function precisaComprimir(file: { type: string; size: number }): boolean {
  return file.type.startsWith("image/") && file.type !== "image/gif" && file.size > LIMIAR_BYTES;
}

export async function comprimirImagem(file: File): Promise<File> {
  if (!precisaComprimir(file) || typeof document === "undefined") return file;
  try {
    const bitmap = await createImageBitmap(file);
    const escala = Math.min(1, LADO_MAXIMO_PX / Math.max(bitmap.width, bitmap.height));
    const w = Math.max(1, Math.round(bitmap.width * escala));
    const h = Math.max(1, Math.round(bitmap.height * escala));
    const canvas = document.createElement("canvas");
    canvas.width = w;
    canvas.height = h;
    const ctx = canvas.getContext("2d");
    if (!ctx) return file;
    ctx.drawImage(bitmap, 0, 0, w, h);
    bitmap.close?.();
    const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, "image/jpeg", QUALIDADE_JPEG));
    if (!blob || blob.size >= file.size) return file;
    const nome = file.name.replace(/\.[^.]+$/, "") + ".jpg";
    return new File([blob], nome, { type: "image/jpeg", lastModified: file.lastModified });
  } catch {
    return file;
  }
}
