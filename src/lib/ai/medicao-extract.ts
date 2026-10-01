import "server-only";
import Anthropic from "@anthropic-ai/sdk";
import { aiClient, createMessageWithFallback, isAiConfigured } from "@/lib/ai/client";
import type { LaudoLido } from "@/lib/ai/medicao-doc";

/**
 * Leitura por IA do laudo de medição (Prompt V, 6.2). Só a conversa com a
 * IA mora aqui; a comparação com o lançado está em `medicao-doc.ts` (puro).
 * Desligada sem `ANTHROPIC_API_KEY`. Nunca grava.
 */
type ImageMime = "image/png" | "image/jpeg" | "image/webp" | "image/gif";

export async function extractLaudoDeMedicao(doc: { bytes: Uint8Array; mime: string; filename: string }, grupos: readonly { code: string; name: string }[]): Promise<LaudoLido> {
  if (!isAiConfigured()) throw new Error("Leitura por IA não configurada (defina ANTHROPIC_API_KEY).");
  const client = aiClient();
  const data = Buffer.from(doc.bytes).toString("base64");
  const bloco: Anthropic.ContentBlockParam =
    doc.mime === "application/pdf" ? { type: "document", source: { type: "base64", media_type: "application/pdf", data } } : { type: "image", source: { type: "base64", media_type: doc.mime as ImageMime, data } };
  const tool: Anthropic.ToolUnion = {
    name: "ler_laudo",
    description: "Extrai do laudo de medição de obra a competência e, por item, o grupo CEF, a descrição, o percentual executado e o valor, como estiverem escritos.",
    input_schema: {
      type: "object",
      additionalProperties: false,
      properties: {
        competencia: { type: "string", description: "Competência medida, em MM/YYYY. Vazio se não constar." },
        itens: {
          type: "array",
          items: {
            type: "object",
            additionalProperties: false,
            properties: {
              grupo: { type: "string", description: `Código do grupo CEF a que o item corresponde, entre: ${grupos.map((g) => `${g.code} (${g.name})`).join("; ")}. Vazio se não der para identificar.` },
              descricao: { type: "string", description: "Descrição do item como está no laudo." },
              percentual: { type: ["number", "null"], description: "Percentual executado escrito no laudo (0 a 100). null se não houver." },
              valor: { type: ["number", "null"], description: "Valor em reais escrito no laudo. null se não houver." },
            },
            required: ["grupo", "descricao", "percentual", "valor"],
          },
        },
        observacoes: { type: "array", items: { type: "string" }, description: "Avisos curtos (ex.: 'o percentual é acumulado', 'laudo sem assinatura')." },
      },
      required: ["competencia", "itens", "observacoes"],
    },
  };
  const message = await createMessageWithFallback(client, {
    max_tokens: 2048,
    tools: [tool],
    tool_choice: { type: "tool", name: "ler_laudo" },
    messages: [{ role: "user", content: [bloco, { type: "text", text: "Leia este laudo de medição de obra e chame a ferramenta ler_laudo. Não invente: deixe vazio ou null o que não estiver escrito. Não some nem calcule; copie o que o laudo declara." }] }],
  });
  const block = message.content.find((b) => b.type === "tool_use");
  if (!block || block.type !== "tool_use") throw new Error("A IA não conseguiu ler o laudo.");
  const input = block.input as Partial<Record<string, unknown>>;
  const str = (v: unknown) => (typeof v === "string" ? v.trim() : "");
  const n = (v: unknown) => (typeof v === "number" && Number.isFinite(v) ? v : typeof v === "string" && v.trim() && Number.isFinite(Number(v)) ? Number(v) : null);
  const itens = Array.isArray(input.itens) ? input.itens : [];
  return {
    competencia: str(input.competencia),
    itens: itens
      .filter((i): i is Record<string, unknown> => !!i && typeof i === "object")
      .map((i) => ({ grupo: str(i.grupo), descricao: str(i.descricao), percentual: n(i.percentual), valor: n(i.valor) })),
    observacoes: Array.isArray(input.observacoes) ? input.observacoes.filter((x): x is string => typeof x === "string").map((s) => s.trim()).filter(Boolean) : [],
  };
}
