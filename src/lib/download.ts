import * as XLSX from "xlsx";

/**
 * Dispara o download de um arquivo no browser de forma confiável: gera um
 * object URL, anexa um <a> ao DOM, clica e só então (com atraso) revoga o URL.
 * Revogar imediatamente após o clique cancela o download em alguns navegadores.
 */
export function baixarBlob(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.style.display = "none";
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1500);
}

/** Escreve um workbook XLSX e baixa (sem depender de XLSX.writeFile/fs). */
export function baixarXlsx(wb: XLSX.WorkBook, filename: string): void {
  const buf = XLSX.write(wb, { type: "array", bookType: "xlsx" }) as ArrayBuffer;
  baixarBlob(
    new Blob([buf], {
      type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    }),
    filename,
  );
}
