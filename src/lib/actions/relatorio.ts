"use server";

import { getTenantContext } from "@/lib/context";
import { can } from "@/lib/permissions";
import { isAiConfigured } from "@/lib/ai/client";
import { comUsoDeIa, limiteDeConversa } from "@/lib/ai/uso";
import { proporRelatorio } from "@/lib/ai/relatorio";
import { historicoDaCris } from "@/lib/cris";
import { urlDaReceita } from "@/lib/relatorio-custom";

export type ResultadoDoRelatorio = { ok: true; texto: string; url: string | null } | { ok: false; error: string };

/**
 * Prompt RC — o chat dos Relatórios Customizados. Devolve o texto e o link da
 * receita; a tela navega e o servidor calcula com o acesso da pessoa. Nada é
 * gravado; a conversa não é registrada (só o consumo, operação "relatorio").
 */
export async function pedirRelatorio(entrada: { conversa: unknown }): Promise<ResultadoDoRelatorio> {
  const ctx = await getTenantContext();
  if (!ctx) return { ok: false, error: "Sessão expirada. Entre de novo." };
  if (!can(ctx.perms, "relatorios", "ver")) return { ok: false, error: "Sem acesso aos Relatórios Customizados." };
  const conversa = historicoDaCris(entrada?.conversa);
  if (!conversa) return { ok: false, error: "Escreva o pedido." };
  if (!isAiConfigured()) return { ok: false, error: "A IA não está configurada. Monte o relatório pelos campos ao lado." };
  const limite = await limiteDeConversa(ctx.tenant.id, ctx.userId);
  if (limite) return { ok: false, error: limite };
  try {
    const r = await comUsoDeIa({ tenantId: ctx.tenant.id, userId: ctx.userId, operacao: "relatorio" }, () =>
      proporRelatorio(conversa, ctx.projects.map((p) => ({ id: p.id, nome: p.name }))),
    );
    return { ok: true, texto: r.texto, url: r.receita ? urlDaReceita(r.receita) : null };
  } catch (e) {
    console.error("[relatorio] falha:", e instanceof Error ? e.name : "erro");
    return { ok: false, error: "Não consegui montar agora. Tente de novo ou use os campos." };
  }
}
