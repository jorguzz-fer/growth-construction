"use server";

import { getTenantContext } from "@/lib/context";
import {
  aiClient,
  createMessageWithFallback,
  isAiConfigured,
  modelWarning,
  primaryModel,
} from "@/lib/ai/client";
import { rotuloModelo } from "@/lib/ai/modelos";
import { isR2Configured } from "@/lib/storage/r2";
import { can } from "@/lib/permissions";
import { comUsoDeIa, registrarUso } from "@/lib/ai/uso";

export interface AiDiagnosticResult {
  /** ANTHROPIC_API_KEY presente no ambiente? */
  keyPresent: boolean;
  /** Identificador do modelo que será usado (já resolvido a partir do env). */
  configuredModel: string;
  /** Nome comercial do modelo, para exibir junto do identificador. */
  configuredModelLabel: string;
  /**
   * O que há de errado na ANTHROPIC_MODEL do ambiente (nome comercial em vez
   * do identificador, valor sem sentido...). Vazio = nada a corrigir.
   */
  modelWarning: string;
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
 * modelo e conectividade de rede — fazendo uma chamada mínima à API. Serve para
 * diagnosticar em segundos por que a leitura por IA "não está funcionando".
 *
 * Prompt AM, 6.1: a permissão vem da MATRIZ (`diagnosticoia:editar` — o bloco
 * de configuração), não do papel; antes, um membro com a tela por override via
 * o botão e recebia "Sem permissão", e um admin com a tela revogada passava.
 * 7.3: o resultado fica registrado (quem, quando, modelo), em `ia_uso`.
 */
export async function testAiConnection(): Promise<AiDiagnosticResult> {
  const ctx = await getTenantContext();
  if (!ctx || !can(ctx.perms, "diagnosticoia", "editar")) {
    throw new Error("Sem permissão para executar o diagnóstico.");
  }
  const keyPresent = isAiConfigured();
  const configuredModel = primaryModel();
  const configuredModelLabel = rotuloModelo(configuredModel);
  const avisoModelo = modelWarning();
  const r2Configured = isR2Configured();

  if (!keyPresent) {
    // 7.3: o teste fica registrado mesmo sem chamada (quem testou, quando, falhou).
    await comUsoDeIa({ tenantId: ctx.tenant.id, userId: ctx.userId, operacao: "teste" }, () => registrarUso({ modelo: null, fallback: false, erro: true }));
    return {
      keyPresent: false,
      configuredModel,
      configuredModelLabel,
      modelWarning: avisoModelo,
      ok: false,
      modelUsed: null,
      error:
        "ANTHROPIC_API_KEY não está definida no ambiente do servidor. Defina a variável e reinicie/redeploy o app.",
      r2Configured,
    };
  }

  try {
    const msg = await comUsoDeIa({ tenantId: ctx.tenant.id, userId: ctx.userId, operacao: "teste" }, () =>
      createMessageWithFallback(aiClient(), {
        max_tokens: 8,
        messages: [{ role: "user", content: "responda apenas: ok" }],
      }),
    );
    return {
      keyPresent: true,
      configuredModel,
      configuredModelLabel,
      modelWarning: avisoModelo,
      ok: true,
      modelUsed: msg.model ?? null,
      error: null,
      r2Configured,
    };
  } catch (e) {
    return {
      keyPresent: true,
      configuredModel,
      configuredModelLabel,
      modelWarning: avisoModelo,
      ok: false,
      modelUsed: null,
      error: e instanceof Error ? e.message : String(e),
      r2Configured,
    };
  }
}
