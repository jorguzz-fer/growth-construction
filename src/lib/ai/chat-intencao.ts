import "server-only";
import type Anthropic from "@anthropic-ai/sdk";
import { aiClient, createMessageWithFallback } from "@/lib/ai/client";
import { CATALOGO, normalizarIntencao, promptDoChat, type IntencaoDoChat } from "@/lib/assistente-chat";

/**
 * Prompt E, Etapa 2 — o modelo só CLASSIFICA a pergunta. Vai ao provedor: a
 * pergunta digitada e o catálogo (texto fixo). NÃO vai: nenhum número, nome de
 * obra, cadastro ou histórico (decisão de 01/10/2026, BE-2). A resposta é
 * calculada e escrita no servidor.
 */
export async function interpretarPergunta(pergunta: string, mesAtual: string): Promise<IntencaoDoChat> {
  const client = aiClient();
  const tool: Anthropic.ToolUnion = {
    name: "classificar_pergunta",
    description: "Diz qual métrica do catálogo responde a pergunta, com cenário, obra citada e período.",
    input_schema: {
      type: "object",
      additionalProperties: false,
      properties: {
        metrica: { type: "string", enum: ["", ...CATALOGO.map((m) => m.id)], description: 'Id da métrica do catálogo; "" se nenhuma serve.' },
        cenario: { type: "string", enum: ["", "atual", "budget", "forecast"], description: '"" se a pergunta não disser.' },
        obra: { type: "string", description: 'Nome da obra como o usuário escreveu; "" se não citou.' },
        todas: { type: "boolean", description: "true se pediu todas as obras / a empresa toda." },
        de: { type: "string", description: 'Competência inicial MM/AAAA, ou "".' },
        ate: { type: "string", description: 'Competência final MM/AAAA, ou "".' },
      },
      required: ["metrica", "cenario", "obra", "todas", "de", "ate"],
    },
  };
  const message = await createMessageWithFallback(client, {
    max_tokens: 300,
    tools: [tool],
    tool_choice: { type: "tool", name: "classificar_pergunta" },
    system: promptDoChat(mesAtual),
    messages: [{ role: "user", content: [{ type: "text", text: pergunta }] }],
  });
  const block = message.content.find((b) => b.type === "tool_use");
  if (!block || block.type !== "tool_use") throw new Error("classificação vazia");
  return normalizarIntencao(block.input);
}
