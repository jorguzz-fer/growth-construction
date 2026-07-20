import "server-only";
import Anthropic from "@anthropic-ai/sdk";
import { isAiConfigured } from "@/lib/ai/despesa-extract";

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
  const client = new Anthropic();
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

  const message = await client.messages.create({
    model: "claude-opus-4-8",
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
