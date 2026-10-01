"use server";

import { getProjectVersions, getTenantContext } from "@/lib/context";
import { can } from "@/lib/permissions";
import { isAiConfigured } from "@/lib/ai/client";
import { extractAtivoFromText, MAX_TEXTO_ATIVO } from "@/lib/ai/permuta-extract";
import { montarPropostaDeAtivo, type PropostaDeAtivo } from "@/lib/ai/permuta-doc";
import { getClientes, getUnits } from "@/lib/queries";
import { TIPOS_PERMUTA } from "@/lib/calc/constants";

export type ResultadoPropostaDeAtivo = { ok: true; proposta: PropostaDeAtivo } | { ok: false; error: string };

/**
 * Lançamento assistido do ativo de permuta (Prompt P, 7.1/7.3): a descrição
 * do usuário vira uma PROPOSTA de preenchimento do formulário. Esta action
 * **não grava nada**. Quem grava é o usuário, pelo botão "Salvar ativo", que
 * chama `addPermuta` com a mesma validação e a mesma permissão no servidor —
 * não existe caminho de gravação direta nem atalho.
 *
 * A permissão de criar é exigida já aqui; a obra é validada contra a empresa.
 * As listas da tela (unidades da versão de trabalho, clientes, tipos) servem
 * só para casar o que a IA leu com o que o formulário aceita.
 */
export async function proporAtivoPorTexto(texto: string, projectId: string): Promise<ResultadoPropostaDeAtivo> {
  const falha = (error: string) => ({ ok: false as const, error });
  const ctx = await getTenantContext();
  if (!ctx || !can(ctx.perms, "permuta", "criar")) return falha("Sem permissão para cadastrar ativos de permuta.");
  if (!projectId || !ctx.projects.some((p) => p.id === projectId)) return falha("Escolha a obra do ativo.");
  if (!isAiConfigured()) return falha("Assistente por IA não configurado (defina ANTHROPIC_API_KEY).");
  const descricao = (texto ?? "").trim();
  if (descricao.length < 3) return falha("Descreva o bem recebido: o que é, de qual unidade, de quem, quando e por quanto entra.");
  if (descricao.length > MAX_TEXTO_ATIVO) return falha(`Descrição longa demais (máximo ${MAX_TEXTO_ATIVO} caracteres).`);
  const obra = await getProjectVersions(ctx.tenant.id, projectId);
  if (!obra?.trabalho) return falha("Obra sem versão de trabalho.");
  try {
    const [lido, units, clientes] = await Promise.all([
      extractAtivoFromText(descricao, new Date().toISOString().slice(0, 10), TIPOS_PERMUTA),
      getUnits(ctx.tenant.id, obra.trabalho.id),
      getClientes(ctx.tenant.id),
    ]);
    return {
      ok: true,
      proposta: montarPropostaDeAtivo(lido, {
        unidades: [...new Set(units.map((u) => u.code))],
        clientes: clientes.map((c) => ({ id: c.id, nome: c.nomeCompleto })),
        tipos: TIPOS_PERMUTA,
      }),
    };
  } catch (e) {
    console.error("[permuta] falha no lançamento assistido:", e);
    return falha(e instanceof Error ? e.message : "Falha ao interpretar a descrição.");
  }
}
