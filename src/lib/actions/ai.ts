"use server";

import { getActiveContext } from "@/lib/context";
import {
  aiClient,
  createMessageWithFallback,
  isAiConfigured,
  primaryModel,
} from "@/lib/ai/client";
import { isR2Configured } from "@/lib/storage/r2";

export interface AiDiagnosticResult {
  /** ANTHROPIC_API_KEY presente no ambiente? */
  keyPresent: boolean;
  /** Modelo primário configurado (env ANTHROPIC_MODEL ou padrão). */
  configuredModel: string;
  /** O teste real de chamada funcionou? */
  ok: boolean;
  /** Modelo que efetivamente respondeu (pode ser um fallback). */
  modelUsed: string | null;
  /** Mensagem de erro amigável, quando falhou. */
  error: string | null;
  /** Storage R2 configurado? (necessário para anexar/baixar documentos). */
  r2Configured: boolean;
}

/**
 * Testa, ao vivo, a configuração de leitura por IA: presença da chave, acesso ao
 * modelo e conectividade de rede — fazendo uma chamada mínima à API. Só
 * owner/admin. Serve para diagnosticar em segundos por que a leitura por IA
 * "não está funcionando" no ambiente.
 */
export async function testAiConnection(): Promise<AiDiagnosticResult> {
  const ctx = await getActiveContext();
  if (!ctx || (ctx.role !== "owner" && ctx.role !== "admin")) {
    throw new Error("Sem permissão para executar o diagnóstico.");
  }
  const keyPresent = isAiConfigured();
  const configuredModel = primaryModel();
  const r2Configured = isR2Configured();

  if (!keyPresent) {
    return {
      keyPresent: false,
      configuredModel,
      ok: false,
      modelUsed: null,
      error:
        "ANTHROPIC_API_KEY não está definida no ambiente do servidor. Defina a variável e reinicie/redeploy o app.",
      r2Configured,
    };
  }

  try {
    const msg = await createMessageWithFallback(aiClient(), {
      max_tokens: 8,
      messages: [{ role: "user", content: "responda apenas: ok" }],
    });
    return {
      keyPresent: true,
      configuredModel,
      ok: true,
      modelUsed: msg.model ?? null,
      error: null,
      r2Configured,
    };
  } catch (e) {
    return {
      keyPresent: true,
      configuredModel,
      ok: false,
      modelUsed: null,
      error: e instanceof Error ? e.message : String(e),
      r2Configured,
    };
  }
}
