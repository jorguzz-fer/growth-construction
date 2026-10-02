"use server";

import { getTenantContext } from "@/lib/context";
import { can } from "@/lib/permissions";
import { isAiConfigured } from "@/lib/ai/client";
import { comUsoDeIa, limiteDeConversa } from "@/lib/ai/uso";
import { responderSobreOProduto } from "@/lib/ai/assistente-produto";
import { historicoValido } from "@/lib/assistente-produto";

export type ResultadoDoAssistente = { ok: true; texto: string } | { ok: false; error: string };

/**
 * Prompt AM — pergunta ao Assistente do produto. Somente leitura (3.1): não
 * lê nem grava dado de negócio. A conversa vem do cliente (só desta aba) e
 * não é gravada; nem a pergunta nem a resposta vão para log ou auditoria. O
 * consumo (tokens) é registrado em `ia_uso` (5.1) e a conversa tem limite (5.2).
 */
export async function perguntarAoProduto(conversa: unknown): Promise<ResultadoDoAssistente> {
  const ctx = await getTenantContext();
  if (!ctx) return { ok: false, error: "Sessão expirada. Entre de novo." };
  if (!can(ctx.perms, "diagnosticoia", "ver")) return { ok: false, error: "Sem permissão para usar o Assistente." };
  const falas = historicoValido(conversa);
  if (!falas) return { ok: false, error: "Escreva a pergunta." };
  if (!isAiConfigured()) return { ok: false, error: "O Assistente está indisponível: a chave de IA não está configurada no servidor." };
  const limite = await limiteDeConversa(ctx.tenant.id, ctx.userId);
  if (limite) return { ok: false, error: limite };
  try {
    const texto = await comUsoDeIa({ tenantId: ctx.tenant.id, userId: ctx.userId, operacao: "assistente" }, () => responderSobreOProduto(falas));
    return { ok: true, texto };
  } catch (e) {
    // 3.5: o erro chega traduzido (erros.ts, via createMessageWithFallback). Log só do tipo.
    console.error("[assistente] falha:", e instanceof Error ? e.name : "erro");
    return { ok: false, error: e instanceof Error ? e.message : "Falha ao falar com o Assistente." };
  }
}
