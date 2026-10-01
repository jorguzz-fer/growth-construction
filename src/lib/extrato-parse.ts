/**
 * Leitura de extratos (XLSX/CSV já convertidos em linhas) — funções PURAS,
 * movidas sem alteração de `import-extrato.tsx` (Caixa) para servirem também
 * ao extrato do cartão (Prompt U, seção 5). Nada aqui grava.
 */
/** Converte texto/valor monetário em número, tolerando formatos BR e US. */
export function parseMoney(v: unknown): number | null {
  if (v == null || v === "") return null;
  if (typeof v === "number") return Number.isFinite(v) ? v : null;
  let s = String(v).trim();
  if (!s) return null;
  s = s.replace(/r\$/i, "").trim();
  let neg = false;
  if (/^\(.*\)$/.test(s)) {
    neg = true;
    s = s.slice(1, -1);
  }
  if (/^-\s*/.test(s)) {
    neg = true;
    s = s.replace(/^-\s*/, "");
  }
  if (/-\s*$/.test(s)) {
    neg = true;
    s = s.replace(/-\s*$/, "");
  }
  s = s.replace(/\s/g, "");
  if (!/[0-9]/.test(s)) return null;
  const hasComma = s.includes(",");
  const hasDot = s.includes(".");
  let normd: string;
  if (hasComma && hasDot) {
    normd =
      s.lastIndexOf(",") > s.lastIndexOf(".")
        ? s.replace(/\./g, "").replace(",", ".")
        : s.replace(/,/g, "");
  } else if (hasComma) {
    const after = s.length - s.lastIndexOf(",") - 1;
    normd = after <= 2 ? s.replace(",", ".") : s.replace(/,/g, "");
  } else if (hasDot) {
    const dots = (s.match(/\./g) || []).length;
    const after = s.length - s.lastIndexOf(".") - 1;
    normd = dots === 1 && after <= 2 ? s : s.replace(/\./g, "");
  } else {
    normd = s;
  }
  const n = Number(normd);
  if (!Number.isFinite(n)) return null;
  return neg ? -n : n;
}

/** Converte data em texto/Date para o formato interno "MM/DD/YYYY". */
export function toInternalDate(v: unknown): string {
  if (v == null || v === "") return "";
  if (v instanceof Date) {
    return `${String(v.getMonth() + 1).padStart(2, "0")}/${String(v.getDate()).padStart(2, "0")}/${v.getFullYear()}`;
  }
  const s = String(v).trim();
  const br = s.match(/^(\d{1,2})[/\-.](\d{1,2})[/\-.](\d{2,4})/);
  if (br) {
    let y = br[3];
    if (y.length === 2) y = "20" + y;
    return `${br[2].padStart(2, "0")}/${br[1].padStart(2, "0")}/${y}`;
  }
  const iso = s.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (iso) return `${iso[2]}/${iso[3]}/${iso[1]}`;
  return "";
}

export const norm = (s: string) =>
  s.toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "").trim();

export interface PreviewRow {
  incluir: boolean;
  data: string; // interno MM/DD/YYYY
  descricao: string;
  doc: string;
  valor: number;
  tipo: "entrada" | "saida";
}
export interface ParseResult {
  rows: PreviewRow[];
  headers: string[];
  reconhecidos: number;
  ignorados: number;
}

/** Localiza o índice de coluna cujo cabeçalho casa com um dos apelidos. */
export function findCol(headers: string[], aliases: string[]): number {
  return headers.findIndex((h) => aliases.some((a) => norm(h).includes(a)));
}

export function parseSheet(aoa: unknown[][]): ParseResult {
  // Acha a linha de cabeçalho: contém "valor" e uma coluna de data/histórico.
  let headerIdx = -1;
  for (let i = 0; i < Math.min(aoa.length, 15); i++) {
    const cells = (aoa[i] || []).map((c) => norm(String(c ?? "")));
    const temValor = cells.some((c) => c.includes("valor") || c === "amount");
    const temData = cells.some((c) => c.includes("data") || c.includes("date"));
    const temHist = cells.some(
      (c) => c.includes("hist") || c.includes("descri") || c.includes("memo"),
    );
    if (temValor && (temData || temHist)) {
      headerIdx = i;
      break;
    }
  }
  if (headerIdx < 0)
    throw new Error(
      "Não encontrei a linha de cabeçalho do extrato (com colunas de Data e Valor). Verifique se o arquivo é um extrato bancário válido.",
    );

  const headers = (aoa[headerIdx] || []).map((c) => String(c ?? ""));
  const iDataMov = findCol(headers, ["data movimento", "data do movimento"]);
  const iData = iDataMov >= 0 ? iDataMov : findCol(headers, ["data lancamento", "data", "date"]);
  const iDesc = findCol(headers, ["histor", "descri", "memo", "lancamento"]);
  const iDoc = findCol(headers, ["documento", "doc"]);
  const iValor = findCol(headers, ["valor lancamento", "valor", "amount", "credito"]);
  const iNome = findCol(headers, ["nome", "razao", "favorecido"]);

  const faltando: string[] = [];
  if (iData < 0) faltando.push("Data");
  if (iValor < 0) faltando.push("Valor");
  if (faltando.length) {
    throw new Error(
      `Colunas obrigatórias não encontradas: ${faltando.join(", ")}. Cabeçalhos lidos: ${headers
        .filter(Boolean)
        .join(" | ")}.`,
    );
  }

  const rows: PreviewRow[] = [];
  let ignorados = 0;
  for (let i = headerIdx + 1; i < aoa.length; i++) {
    const r = aoa[i] || [];
    const valor = parseMoney(r[iValor]);
    const descRaw = String(r[iDesc] ?? "").trim();
    const nome = iNome >= 0 ? String(r[iNome] ?? "").trim() : "";
    const doc = iDoc >= 0 ? String(r[iDoc] ?? "").trim() : "";
    const isTotalRow = /saldo|total/i.test(descRaw);
    if (valor == null || valor === 0 || isTotalRow) {
      if (descRaw || r.some((c) => String(c ?? "").trim())) ignorados++;
      continue;
    }
    const data = toInternalDate(r[iData]);
    const descricao = [descRaw, nome].filter(Boolean).join(" · ");
    rows.push({
      incluir: true,
      data,
      descricao: descricao || "—",
      doc,
      valor,
      tipo: valor >= 0 ? "entrada" : "saida",
    });
  }
  return { rows, headers: headers.filter(Boolean), reconhecidos: rows.length, ignorados };
}

