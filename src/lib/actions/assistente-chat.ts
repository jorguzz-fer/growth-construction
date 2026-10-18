"use server";

import { getTenantContext } from "@/lib/context";
import { isAiConfigured } from "@/lib/ai/client";
import { interpretarPergunta } from "@/lib/ai/chat-intencao";
import { MAX_PERGUNTA, interpretarLocalmente, type IntencaoDoChat } from "@/lib/assistente-chat";
import { comUsoDeIa, limiteDeConversa } from "@/lib/ai/uso";
import { responderMetrica, type RespostaDoChat } from "@/lib/chat-metricas";

export type { RespostaDoChat };
export type ResultadoDoChat = { ok: true; resposta: RespostaDoChat } | { ok: false; error: string };

/**
 * Prompt E, Etapa 2 — chat SOMENTE LEITURA (decisão de 01/10/2026).
 * - Só o texto da pergunta vai ao modelo (classificação); nada do banco.
 * - Contexto (obra da tela) validado aqui contra as obras que o usuário vê.
 * - Cada métrica exige a permissão de VER das telas de origem (3.4).
 * - A pergunta NÃO é gravada em log nem em auditoria. Nada é gravado.
 */
export async function perguntarAoAssistente(pergunta: string, projetoDaTela: string | null): Promise<ResultadoDoChat> {
  const ctx = await getTenantContext();
  if (!ctx) return { ok: false, error: "Sessão expirada. Entre de novo." };
  const texto = typeof pergunta === "string" ? pergunta.trim() : "";
  if (!texto) return { ok: false, error: "Escreva a pergunta." };
  if (texto.length > MAX_PERGUNTA) return { ok: false, error: `Pergunta longa demais (até ${MAX_PERGUNTA} caracteres).` };

  const agora = new Date();
  const mesAtual = `${String(agora.getMonth() + 1).padStart(2, "0")}/${agora.getFullYear()}`;
  let intencao: IntencaoDoChat;
  let via: RespostaDoChat["via"] = "local";
  // Prompt AM, 5.2: passou do limite de conversas, a leitura é local — sem custo, sem travar.
  const noLimite = isAiConfigured() ? await limiteDeConversa(ctx.tenant.id, ctx.userId) : null;
  if (isAiConfigured() && !noLimite) {
    try {
      intencao = await comUsoDeIa({ tenantId: ctx.tenant.id, userId: ctx.userId, operacao: "chat" }, () => interpretarPergunta(texto, mesAtual));
      via = "ia";
    } catch (e) {
      // Só o tipo do erro: a pergunta nunca vai para o log.
      console.error("[chat] interpretação pela IA falhou; usando a leitura local:", e instanceof Error ? e.name : "erro");
      intencao = interpretarLocalmente(texto, agora);
    }
  } else {
    intencao = interpretarLocalmente(texto, agora);
  }

  return { ok: true, resposta: await responderMetrica(ctx, intencao, projetoDaTela, via) };
}
