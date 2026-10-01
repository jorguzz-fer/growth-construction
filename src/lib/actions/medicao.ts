"use server";

import { and, eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { db, schema } from "@/lib/db";
import { getTenantContext } from "@/lib/context";
import { can } from "@/lib/permissions";
import { logAudit } from "@/lib/audit";
import { getAtualVersion, getMedicoes } from "@/lib/queries";
import { brl } from "@/lib/utils";
import { avisoDeDuplicidade, competenciaValida, podeTocarMedicao, recusaDaMedicao, recusaDoValor, TELA_LANCAMENTO } from "@/lib/medicao-regras";

/**
 * Lançamentos de medição de obra (engenheiro), por competência e grupo CEF.
 *
 * Informação AUXILIAR (Prompt V): alimenta o Relatório CEF (orçado × medido
 * por grupo). NÃO alimenta a DRE, não compõe custo e não entra no resultado —
 * por isso nenhuma action aqui revalida `/dre`.
 *
 * Regras: a medição vai SEMPRE para a versão Atual do projeto informado (1.2:
 * sem fallback para o cookie nem para a versão padrão); editar e excluir
 * conferem a versão do registro (1.3) e a autoria (0.5.5) no banco; tudo
 * devolve `{ ok, error }` (4.4); valor > 0 e competência MM/AAAA (4.5);
 * duplicidade AVISA, não bloqueia (4.6); excluir exige confirmação (4.3).
 */
export type ResultadoMedicao = { ok: true; id?: string; aviso?: string } | { ok: false; error: string };

const SEM_SESSAO = "Sessão expirada. Entre de novo.";

export async function addMedicao(formData: FormData): Promise<ResultadoMedicao> {
  const ctx = await getTenantContext();
  if (!ctx) return { ok: false, error: SEM_SESSAO };
  if (!can(ctx.perms, TELA_LANCAMENTO, "criar")) return { ok: false, error: "Sem permissão para lançar medições." };
  // Projeto sendo medido (Prompt A): obrigatório e desta empresa.
  const projectId = ((formData.get("projectId") as string) || "").trim();
  if (!projectId || !ctx.projects.some((p) => p.id === projectId)) return { ok: false, error: "Escolha o projeto da medição." };
  // 1.2 — SEMPRE a Atual do projeto; sem ela, bloqueia e informa.
  const atual = await getAtualVersion(ctx.tenant.id, projectId);
  if (!atual) return { ok: false, error: "Este projeto não tem versão Atual: a medição não tem onde ser gravada. Crie a versão Atual em Configuração da Versão." };
  if (atual.locked) return { ok: false, error: "Versão congelada — lançamentos bloqueados." };

  const competencia = ((formData.get("competencia") as string) || "").trim();
  const grupo = ((formData.get("grupo") as string) || "").trim();
  const valor = ((formData.get("valor") as string) || "").trim();
  // "grupoCode|grupoName" vem do select para preservar o nome do grupo.
  const [grupoCodeBruto, ...rest] = grupo.split("|");
  const grupoCode = (grupoCodeBruto ?? "").trim();
  const grupoName = (rest.join("|") || grupoCode).trim();
  const recusa = recusaDaMedicao({ competencia, grupoCode, valor });
  if (recusa) return { ok: false, error: recusa };

  // 4.6 — aviso de duplicidade, calculado no servidor sobre a mesma versão.
  const existentes = await getMedicoes(ctx.tenant.id, atual.id);
  const aviso = avisoDeDuplicidade(
    existentes.map((m) => ({ id: m.id, competencia: m.competencia, grupoCode: m.grupoCode, valor: Number(m.valor) })),
    { competencia, grupoCode },
    brl,
  );

  const [criada] = await db
    .insert(schema.medicoes)
    .values({
      versionId: atual.id,
      tenantId: ctx.tenant.id,
      competencia,
      grupoCode,
      grupoName,
      valor,
      obs: ((formData.get("obs") as string) || "").trim() || null,
      // 0.5.1 — autor daqui em diante; medições antigas ficam sem (BV-3).
      createdBy: ctx.userId || null,
    })
    .returning({ id: schema.medicoes.id });
  await logAudit({
    tenantId: ctx.tenant.id,
    userId: ctx.userId,
    action: "medicao.create",
    entity: "medicao",
    entityId: criada.id,
    meta: { competencia, grupoCode, valor, projectId, versionId: atual.id, duplicidade: aviso != null },
  });
  revalidatePath("/medicaolanc");
  revalidatePath("/medicao");
  return { ok: true, id: criada.id, aviso: aviso ?? undefined };
}

/**
 * A medição com a versão dela, no tenant — se essa versão está congelada
 * (§19) e a que projeto pertence (1.3: a versão do registro é conferida, não
 * só id + tenant).
 */
async function medicaoDoTenant(tenantId: string, id: string) {
  const [row] = await db
    .select({ m: schema.medicoes, locked: schema.versions.locked, projectId: schema.versions.projectId, kind: schema.versions.kind })
    .from(schema.medicoes)
    .innerJoin(schema.versions, eq(schema.medicoes.versionId, schema.versions.id))
    .where(and(eq(schema.medicoes.id, id), eq(schema.medicoes.tenantId, tenantId), eq(schema.versions.tenantId, tenantId)))
    .limit(1);
  return row ?? null;
}

async function alvoDaAcao(id: string, acao: "editar" | "excluir") {
  const ctx = await getTenantContext();
  if (!ctx) return { ok: false as const, error: SEM_SESSAO };
  if (!can(ctx.perms, TELA_LANCAMENTO, acao)) return { ok: false as const, error: `Sem permissão para ${acao} medições.` };
  const alvo = await medicaoDoTenant(ctx.tenant.id, id);
  // 1.3 — a versão do registro precisa ser de um projeto desta empresa.
  if (!alvo || !ctx.projects.some((p) => p.id === alvo.projectId)) return { ok: false as const, error: "Medição não encontrada." };
  if (alvo.locked) return { ok: false as const, error: `Versão congelada — ${acao === "editar" ? "edição" : "exclusão"} bloqueada.` };
  // 0.5.5 — quem só vê as próprias só toca nas próprias (conferido no banco).
  if (!podeTocarMedicao(alvo.m, { userId: ctx.userId, role: ctx.role })) return { ok: false as const, error: "Esta medição foi lançada por outro usuário: só o autor (ou quem vê todas) pode alterá-la." };
  return { ok: true as const, ctx, alvo };
}

export async function updateMedicao(
  id: string,
  patch: { competencia?: string; valor?: string; obs?: string },
): Promise<ResultadoMedicao> {
  const r = await alvoDaAcao(id, "editar");
  if (!r.ok) return r;
  const { ctx, alvo } = r;
  const set: { competencia?: string; valor?: string; obs?: string | null } = {};
  if (patch.competencia !== undefined) {
    const c = patch.competencia.trim();
    if (!competenciaValida(c)) return { ok: false, error: "Informe a competência no formato MM/AAAA." };
    if (c !== alvo.m.competencia) set.competencia = c;
  }
  if (patch.valor !== undefined) {
    const recusa = recusaDoValor(patch.valor);
    if (recusa) return { ok: false, error: recusa };
    if (Number(patch.valor) !== Number(alvo.m.valor)) set.valor = String(patch.valor).trim();
  }
  if (patch.obs !== undefined && (patch.obs.trim() || null) !== alvo.m.obs) set.obs = patch.obs.trim() || null;
  if (Object.keys(set).length === 0) return { ok: true };
  // 4.6 — mudar a competência pode criar duplicidade: avisa, não bloqueia.
  let aviso: string | null = null;
  if (set.competencia) {
    const existentes = await getMedicoes(ctx.tenant.id, alvo.m.versionId);
    aviso = avisoDeDuplicidade(
      existentes.map((m) => ({ id: m.id, competencia: m.competencia, grupoCode: m.grupoCode, valor: Number(m.valor) })),
      { competencia: set.competencia, grupoCode: alvo.m.grupoCode },
      brl,
      id,
    );
  }
  await db
    .update(schema.medicoes)
    .set(set)
    .where(and(eq(schema.medicoes.id, id), eq(schema.medicoes.tenantId, ctx.tenant.id)));
  await logAudit({
    tenantId: ctx.tenant.id,
    userId: ctx.userId,
    action: "medicao.update",
    entity: "medicao",
    entityId: id,
    meta: { de: { competencia: alvo.m.competencia, valor: alvo.m.valor, obs: alvo.m.obs }, para: set, versionId: alvo.m.versionId },
  });
  revalidatePath("/medicaolanc");
  revalidatePath("/medicao");
  return { ok: true, aviso: aviso ?? undefined };
}

/** 4.3 — exclusão física, com confirmação explícita e auditoria do que saiu. */
export async function deleteMedicao(id: string, confirmado = false): Promise<ResultadoMedicao> {
  const r = await alvoDaAcao(id, "excluir");
  if (!r.ok) return r;
  const { ctx, alvo } = r;
  if (!confirmado) return { ok: false, error: `Confirme a exclusão da medição de ${alvo.m.competencia}, grupo ${alvo.m.grupoCode} (${brl(Number(alvo.m.valor))}).` };
  await db
    .delete(schema.medicoes)
    .where(and(eq(schema.medicoes.id, id), eq(schema.medicoes.tenantId, ctx.tenant.id)));
  await logAudit({
    tenantId: ctx.tenant.id,
    userId: ctx.userId,
    action: "medicao.delete",
    entity: "medicao",
    entityId: id,
    meta: { competencia: alvo.m.competencia, grupoCode: alvo.m.grupoCode, grupoName: alvo.m.grupoName, valor: alvo.m.valor, obs: alvo.m.obs, versionId: alvo.m.versionId, autor: alvo.m.createdBy },
  });
  revalidatePath("/medicaolanc");
  revalidatePath("/medicao");
  return { ok: true };
}
