import "server-only";
import Anthropic from "@anthropic-ai/sdk";

/**
 * Camada compartilhada das leituras por IA (despesa, fornecedor, extrato).
 *
 * - Resolve o modelo: `ANTHROPIC_MODEL` (env) ou o padrão, permitindo trocar de
 *   modelo sem alterar código.
 * - `createMessageWithFallback`: tenta o modelo primário e, se ele não estiver
 *   disponível na conta (404/not_found), cai automaticamente para alternativos
 *   amplamente disponíveis — assim a leitura não falha por causa do ID do modelo.
 * - `enrichAiError`: traduz falhas comuns (sem chave, sem rede, modelo, limite)
 *   em mensagens claras em português.
 */

export function isAiConfigured(): boolean {
  return Boolean(process.env.ANTHROPIC_API_KEY);
}

const DEFAULT_MODEL = "claude-opus-4-8";
/** Alternativos, em ordem, caso o primário não esteja liberado na conta. */
const FALLBACK_MODELS = ["claude-opus-4-5", "claude-sonnet-4-5"];

/** Modelo primário: override por env (ANTHROPIC_MODEL) ou padrão. */
export function primaryModel(): string {
  return process.env.ANTHROPIC_MODEL?.trim() || DEFAULT_MODEL;
}

/** Ordem de tentativa (primário + alternativos, sem repetir). */
export function modelChain(): string[] {
  const p = primaryModel();
  return [p, ...FALLBACK_MODELS.filter((m) => m !== p)];
}

export function aiClient(): Anthropic {
  return new Anthropic();
}

function statusOf(e: unknown): number | undefined {
  return e instanceof Anthropic.APIError ? e.status : undefined;
}

/** O erro indica que o modelo não existe / não está liberado para a conta? */
function isModelUnavailable(e: unknown): boolean {
  if (statusOf(e) === 404) return true;
  const msg = e instanceof Error ? e.message : String(e);
  return /not_found|model/i.test(msg) && /404|not.?found|unavailable|access/i.test(msg);
}

/**
 * Cria a mensagem tentando o modelo primário e, se indisponível, os
 * alternativos. Qualquer outro erro é traduzido por `enrichAiError`.
 */
export async function createMessageWithFallback(
  client: Anthropic,
  params: Omit<Anthropic.MessageCreateParamsNonStreaming, "model">,
): Promise<Anthropic.Message> {
  const models = modelChain();
  let lastErr: unknown;
  for (const model of models) {
    try {
      return await client.messages.create({ ...params, model });
    } catch (e) {
      lastErr = e;
      if (!isModelUnavailable(e)) throw enrichAiError(e);
      // modelo indisponível → tenta o próximo da cadeia
    }
  }
  throw enrichAiError(lastErr);
}

/** Traduz erros da API da IA em mensagens acionáveis (pt-BR). */
export function enrichAiError(e: unknown): Error {
  const status = statusOf(e);
  if (status === 401 || status === 403) {
    return new Error(
      "Chave de IA inválida ou sem permissão (verifique ANTHROPIC_API_KEY).",
    );
  }
  if (status === 404) {
    return new Error(
      "Nenhum modelo de IA disponível para esta conta. Defina ANTHROPIC_MODEL com um modelo acessível.",
    );
  }
  if (status === 429) {
    return new Error("Limite de uso da IA atingido — tente novamente em instantes.");
  }
  if (e instanceof Anthropic.APIConnectionError) {
    return new Error(
      "Sem conexão com a API da IA — verifique a rede/egress do servidor.",
    );
  }
  const msg = e instanceof Error ? e.message : String(e);
  if (/fetch failed|ENOTFOUND|ECONNREFUSED|ETIMEDOUT|network/i.test(msg)) {
    return new Error("Sem conexão com a API da IA — verifique a rede/egress do servidor.");
  }
  return new Error(`Falha na leitura por IA: ${msg}`);
}
