import "server-only";
import Anthropic from "@anthropic-ai/sdk";
import { cadeiaDeModelos, resolverModelo } from "@/lib/ai/modelos";
import { mensagemDeErroIa } from "@/lib/ai/erros";

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

/**
 * Modelo primário: o que veio em `ANTHROPIC_MODEL`, já traduzido para o
 * identificador que a API aceita (ver `modelos.ts` — quem configura costuma
 * digitar o nome comercial, "Sonnet 5", e a API só entende `claude-sonnet-5`).
 */
export function primaryModel(): string {
  return resolverModelo(process.env.ANTHROPIC_MODEL).id;
}

/**
 * O que há de errado (ou de digno de nota) na `ANTHROPIC_MODEL` do ambiente.
 * Vazio quando está tudo certo. É o que a tela de Diagnóstico de IA mostra —
 * sem isso, um valor inválido some no fallback e a configuração parece valer
 * quando não vale.
 */
export function modelWarning(): string {
  return resolverModelo(process.env.ANTHROPIC_MODEL).aviso;
}

/** Ordem de tentativa (primário + alternativos, sem repetir). */
export function modelChain(): string[] {
  return cadeiaDeModelos(primaryModel());
}

/**
 * Workspace da chave de IA, quando exigido.
 *
 * Chave de API "vinculada a identidade" (identity-linked, criada para uma
 * service account no Console da Anthropic) só funciona se cada requisição
 * disser em QUAL workspace está agindo — header `anthropic-workspace-id`.
 * Sem ele a API responde 400 "anthropic-workspace-id is required".
 *
 * Chave comum não precisa disso; a variável é opcional e só entra no header
 * quando definida.
 */
export function workspaceId(): string | null {
  return process.env.ANTHROPIC_WORKSPACE_ID?.trim() || null;
}

export function aiClient(): Anthropic {
  const ws = workspaceId();
  return new Anthropic(
    ws ? { defaultHeaders: { "anthropic-workspace-id": ws } } : undefined,
  );
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

/**
 * Traduz erros da API da IA em mensagens acionáveis (pt-BR). A regra de
 * tradução mora em `erros.ts` (puro e testado); aqui só se extrai do erro do
 * SDK o que ela precisa saber.
 */
export function enrichAiError(e: unknown): Error {
  return new Error(
    mensagemDeErroIa({
      status: statusOf(e),
      mensagem: e instanceof Error ? e.message : String(e),
      semConexao: e instanceof Anthropic.APIConnectionError,
    }),
  );
}
