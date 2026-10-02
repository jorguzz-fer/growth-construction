import "server-only";
import { aiClient, createMessageWithFallback } from "@/lib/ai/client";
import { BASE_DE_CONHECIMENTO } from "@/lib/assistente-base";
import { systemDoAssistente, type FalaDoAssistente } from "@/lib/assistente-produto";

/**
 * Prompt AM, Parte 3 — uma resposta do Assistente do produto. Vai ao modelo:
 * as regras e a base (no `system`, com cache de prompt — 2.3/5.3) e a conversa
 * desta aba. NÃO vai: nenhum dado da empresa (1.2). Nada é gravado (BAM-3).
 */
export async function responderSobreOProduto(conversa: readonly FalaDoAssistente[]): Promise<string> {
  const message = await createMessageWithFallback(aiClient(), {
    max_tokens: 700,
    system: [{ type: "text", text: systemDoAssistente(BASE_DE_CONHECIMENTO), cache_control: { type: "ephemeral" } }],
    messages: conversa.map((f) => ({ role: f.de === "usuario" ? ("user" as const) : ("assistant" as const), content: f.texto })),
  });
  const texto = message.content
    .filter((b) => b.type === "text")
    .map((b) => (b.type === "text" ? b.text : ""))
    .join("\n")
    .trim();
  if (!texto) throw new Error("O Assistente não respondeu. Tente de novo.");
  return texto;
}
