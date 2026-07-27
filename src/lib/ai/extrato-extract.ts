import "server-only";
import Anthropic from "@anthropic-ai/sdk";
import { aiClient, createMessageWithFallback, isAiConfigured } from "@/lib/ai/client";

/**
 * Leitura de extrato bancário em PDF por IA, para pré-preencher a importação de
 * lançamentos de caixa. Reaproveita a configuração (ANTHROPIC_API_KEY) das
 * demais leituras. Retorna as movimentações identificadas; a decisão final
 * (revisar, editar, escolher o que importar) permanece com o usuário na tela de
 * conferência já existente.
 */

export interface ExtratoMovimento {
  /** data "MM/DD/YYYY" (formato interno). */
  data: string;
  descricao: string;
  doc: string;
  /** valor com sinal: positivo = entrada/crédito, negativo = saída/débito. */
  valor: number;
}

export interface ExtratoExtraido {
  movimentos: ExtratoMovimento[];
  /** saldo final, se identificável (para conferência). */
  saldoFinal: number | null;
}

type ImageMime = "image/png" | "image/jpeg" | "image/webp" | "image/gif";

/** Valor monetário BR em texto → número (sem sinal). Ex.: "1.234,56" → 1234.56. */
function parseBRMoney(s: string): number | null {
  const m = s.replace(/\s/g, "").match(/-?\d{1,3}(?:\.\d{3})*,\d{2}|-?\d+,\d{2}/);
  if (!m) return null;
  const n = Number(m[0].replace(/\./g, "").replace(",", "."));
  return Number.isFinite(n) ? Math.abs(n) : null;
}

/**
 * Extração SEM IA de um extrato em PDF: lê o texto do PDF (unpdf) e identifica,
 * por heurística, linhas com data + valor. É "melhor esforço" — a decisão final
 * fica com o usuário na tela de conferência. Usado quando a IA não está
 * configurada (ANTHROPIC_API_KEY ausente).
 */
export async function extractExtratoFromText(bytes: Uint8Array): Promise<ExtratoExtraido> {
  const { extractText, getDocumentProxy } = await import("unpdf");
  const pdf = await getDocumentProxy(bytes);
  const { text } = await extractText(pdf, { mergePages: true });
  const linhas = String(text)
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter(Boolean);

  const movimentos: ExtratoMovimento[] = [];
  let saldoFinal: number | null = null;
  const dateRe = /(\d{1,2})[/](\d{1,2})[/](\d{2,4})/;
  const moneyGlobal = /-?\d{1,3}(?:\.\d{3})*,\d{2}|-?\d+,\d{2}/g;
  for (const linha of linhas) {
    const dm = linha.match(dateRe);
    const valores = linha.match(moneyGlobal);
    if (!dm || !valores || valores.length === 0) continue;
    const baixa = /^\s*saldo|saldo\s+(?:anterior|final|do dia|disp)/i.test(linha);
    if (baixa) {
      const v = parseBRMoney(valores[valores.length - 1]);
      if (v != null) saldoFinal = /-/.test(valores[valores.length - 1]) ? -v : v;
      continue;
    }
    // Último valor da linha costuma ser saldo; o penúltimo (quando há 2+) tende a
    // ser o valor do lançamento. Com um único valor, usa-o.
    const alvo = valores.length >= 2 ? valores[valores.length - 2] : valores[0];
    const abs = parseBRMoney(alvo);
    if (abs == null || abs === 0) continue;
    // Sinal: marcadores de débito/saída na linha ("-", " D ", "DEBITO", "PAGAMENTO").
    const negativo =
      /-\s*R?\$?\s*\d/.test(alvo) ||
      /\b[dD]\b|d[eé]bito|saíd|saida|pagamento|pgto|tarifa|tar\.|compra|saque/i.test(linha);
    const y = dm[3].length === 2 ? "20" + dm[3] : dm[3];
    const data = `${dm[2].padStart(2, "0")}/${dm[1].padStart(2, "0")}/${y}`;
    const descricao =
      linha
        .replace(dateRe, "")
        .replace(moneyGlobal, "")
        .replace(/\s{2,}/g, " ")
        .trim() || "—";
    movimentos.push({ data, descricao, doc: "", valor: negativo ? -abs : abs });
  }
  return { movimentos, saldoFinal };
}

/** "DD/MM/YYYY" ou "YYYY-MM-DD" → interno "MM/DD/YYYY"; vazio se inválido. */
function toInternal(s: string): string {
  const t = (s || "").trim();
  const br = t.match(/^(\d{1,2})[/\-.](\d{1,2})[/\-.](\d{2,4})/);
  if (br) {
    let y = br[3];
    if (y.length === 2) y = "20" + y;
    return `${br[2].padStart(2, "0")}/${br[1].padStart(2, "0")}/${y}`;
  }
  const iso = t.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (iso) return `${iso[2]}/${iso[3]}/${iso[1]}`;
  return "";
}

export async function extractExtratoFromDocument(
  bytes: Uint8Array,
  mime: string,
): Promise<ExtratoExtraido> {
  if (!isAiConfigured()) {
    throw new Error("Leitura por IA não configurada (defina ANTHROPIC_API_KEY).");
  }
  const client = aiClient();
  const data = Buffer.from(bytes).toString("base64");

  const docBlock: Anthropic.ContentBlockParam =
    mime === "application/pdf"
      ? { type: "document", source: { type: "base64", media_type: "application/pdf", data } }
      : { type: "image", source: { type: "base64", media_type: mime as ImageMime, data } };

  const tool: Anthropic.ToolUnion = {
    name: "extrair_extrato",
    description:
      "Extrai as movimentações (lançamentos) de um extrato bancário. Uma entrada por movimentação; ignore linhas de saldo/total.",
    input_schema: {
      type: "object",
      additionalProperties: false,
      properties: {
        movimentos: {
          type: "array",
          description: "Lista de movimentações do extrato, na ordem em que aparecem.",
          items: {
            type: "object",
            additionalProperties: false,
            properties: {
              data: { type: "string", description: "Data da movimentação (DD/MM/AAAA)." },
              descricao: { type: "string", description: "Descrição/histórico da movimentação." },
              doc: { type: "string", description: "Documento/identificador, se houver. Vazio se não." },
              valor: {
                type: "number",
                description:
                  "Valor com sinal: POSITIVO para crédito/entrada, NEGATIVO para débito/saída.",
              },
            },
            required: ["data", "descricao", "doc", "valor"],
          },
        },
        saldoFinal: {
          type: ["number", "null"],
          description: "Saldo final do extrato, se identificável. null se não houver.",
        },
      },
      required: ["movimentos", "saldoFinal"],
    },
    strict: true,
  };

  const message = await createMessageWithFallback(client, {
    max_tokens: 8192,
    tools: [tool],
    tool_choice: { type: "tool", name: "extrair_extrato" },
    messages: [
      {
        role: "user",
        content: [
          docBlock,
          {
            type: "text",
            text:
              "Extraia TODAS as movimentações deste extrato bancário e chame a ferramenta " +
              "extrair_extrato. Não invente valores; ignore linhas de saldo/total. Use sinal " +
              "negativo para débitos/saídas e positivo para créditos/entradas.",
          },
        ],
      },
    ],
  });

  const block = message.content.find((b) => b.type === "tool_use");
  if (!block || block.type !== "tool_use") {
    throw new Error(
      "Não foi possível ler as movimentações do PDF. Verifique se o arquivo é um extrato legível (não protegido/escaneado sem texto).",
    );
  }
  const input = block.input as { movimentos?: unknown[]; saldoFinal?: unknown };
  const movimentos: ExtratoMovimento[] = Array.isArray(input.movimentos)
    ? input.movimentos
        .map((m) => {
          const o = (m ?? {}) as Record<string, unknown>;
          const valor = Number(o.valor);
          return {
            data: toInternal(String(o.data ?? "")),
            descricao: String(o.descricao ?? "").trim() || "—",
            doc: String(o.doc ?? "").trim(),
            valor: Number.isFinite(valor) ? valor : 0,
          };
        })
        .filter((m) => m.valor !== 0)
    : [];
  const saldo = Number(input.saldoFinal);
  return { movimentos, saldoFinal: Number.isFinite(saldo) ? saldo : null };
}
