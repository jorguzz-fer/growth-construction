"use server";

import { getTenantContext } from "@/lib/context";
import { can } from "@/lib/permissions";
import { isAiConfigured } from "@/lib/ai/client";
import { extractVendaFromText, MAX_TEXTO_VENDA } from "@/lib/ai/unidade-extract";
import { montarPropostaDeUnidade, type PropostaDeUnidade } from "@/lib/ai/unidade-doc";

export type ResultadoProposta = { ok: true; proposta: PropostaDeUnidade } | { ok: false; error: string };

/**
 * Lançamento assistido (Prompt J, 6.3; BJ-3): a descrição do usuário vira uma
 * PROPOSTA de preenchimento do formulário de unidade. Esta action **não
 * grava nada** — não toca no banco. Quem grava é o usuário, pelo botão
 * "Salvar unidade", que chama `saveUnit` com a mesma permissão verificada no
 * servidor (condição 2 de BJ-3: não existe caminho de gravação direta).
 *
 * A permissão de criar é exigida já aqui para o assistente não virar uma
 * porta lateral; a obra é validada contra o tenant (Prompt E, 2.2.3).
 */
export async function proporUnidadePorTexto(texto: string, projectId: string): Promise<ResultadoProposta> {
  const falha = (error: string) => ({ ok: false as const, error });
  const ctx = await getTenantContext();
  if (!ctx || !can(ctx.perms, "unidades", "criar")) return falha("Sem permissão para cadastrar unidades.");
  if (!projectId || !ctx.projects.some((p) => p.id === projectId)) return falha("Escolha a obra da unidade.");
  if (!isAiConfigured()) return falha("Assistente por IA não configurado (defina ANTHROPIC_API_KEY).");
  const descricao = (texto ?? "").trim();
  if (descricao.length < 3) return falha("Descreva a venda: unidade, valor, data e como será pago.");
  if (descricao.length > MAX_TEXTO_VENDA) return falha(`Descrição longa demais (máximo ${MAX_TEXTO_VENDA} caracteres).`);
  try {
    const lido = await extractVendaFromText(descricao, new Date().toISOString().slice(0, 10));
    return { ok: true, proposta: montarPropostaDeUnidade(lido) };
  } catch (e) {
    console.error("[unidades] falha no lançamento assistido:", e);
    return falha(e instanceof Error ? e.message : "Falha ao interpretar a descrição.");
  }
}
