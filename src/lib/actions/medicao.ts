"use server";

import { and, eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { db, schema } from "@/lib/db";
import { getTenantContext, getWorkingVersion } from "@/lib/context";
import { can } from "@/lib/permissions";
import { logAudit } from "@/lib/audit";

/**
 * Lançamentos de medição de obra (engenheiro), por competência e grupo CEF.
 * A soma alimenta o Custo Variável da DRE.
 */

export async function addMedicao(formData: FormData) {
  const ctx = await getTenantContext();
  if (!ctx || !can(ctx.perms, "medicaolanc", "criar")) {
    throw new Error("Sem permissão para lançar medições.");
  }
  // Projeto sendo medido (Prompt A): obrigatório e desta empresa; a medição
  // vai para a versão de trabalho dele (Atual). Antes, sem projeto, caía na
  // obra do cookie.
  const projectId = ((formData.get("projectId") as string) || "").trim();
  const version = await getWorkingVersion(ctx.tenant.id, projectId);
  if (!version) throw new Error("Escolha o projeto da medição.");
  const versionId = version.id;
  if (version.locked) throw new Error("Versão congelada — lançamentos bloqueados.");
  const competencia = ((formData.get("competencia") as string) || "").trim();
  const grupo = ((formData.get("grupo") as string) || "").trim();
  const valor = (formData.get("valor") as string) || "0";
  if (!competencia) throw new Error("Informe a competência (MM/YYYY).");
  if (!grupo) throw new Error("Selecione o grupo de obra.");
  // "grupoCode|grupoName" vem do select para preservar o nome do grupo.
  const [grupoCode, ...rest] = grupo.split("|");
  const grupoName = rest.join("|") || grupoCode;

  await db.insert(schema.medicoes).values({
    versionId,
    tenantId: ctx.tenant.id,
    competencia,
    grupoCode: grupoCode.trim(),
    grupoName: grupoName.trim(),
    valor,
    obs: (formData.get("obs") as string) || null,
  });
  await logAudit({
    tenantId: ctx.tenant.id,
    userId: ctx.userId,
    action: "medicao.create",
    entity: "medicao",
    meta: { competencia, grupoCode: grupoCode.trim(), valor, projectId },
  });
  revalidatePath("/medicaolanc");
  revalidatePath("/dre");
}

type Resultado = { ok: true } | { ok: false; error: string };

/** A medição com a versão dela, no tenant — e se essa versão está congelada (§19). */
async function medicaoDoTenant(tenantId: string, id: string) {
  const [row] = await db
    .select({ m: schema.medicoes, locked: schema.versions.locked })
    .from(schema.medicoes)
    .innerJoin(schema.versions, eq(schema.medicoes.versionId, schema.versions.id))
    .where(and(eq(schema.medicoes.id, id), eq(schema.medicoes.tenantId, tenantId), eq(schema.versions.tenantId, tenantId)))
    .limit(1);
  return row ?? null;
}

export async function updateMedicao(
  id: string,
  patch: { competencia?: string; valor?: string; obs?: string },
): Promise<Resultado> {
  const ctx = await getTenantContext();
  if (!ctx || !can(ctx.perms, "medicaolanc", "editar")) {
    return { ok: false, error: "Sem permissão para editar medições." };
  }
  const alvo = await medicaoDoTenant(ctx.tenant.id, id);
  if (!alvo) return { ok: false, error: "Medição não encontrada." };
  if (alvo.locked) return { ok: false, error: "Versão congelada — edição bloqueada." };
  const set: { competencia?: string; valor?: string; obs?: string | null } = {};
  if (patch.competencia && patch.competencia.trim()) set.competencia = patch.competencia.trim();
  if (patch.valor !== undefined) {
    const n = Number(patch.valor);
    if (!Number.isFinite(n) || n < 0) return { ok: false, error: "Informe um valor válido." };
    set.valor = patch.valor || "0";
  }
  if (patch.obs !== undefined) set.obs = patch.obs || null;
  if (Object.keys(set).length === 0) return { ok: true };
  await db
    .update(schema.medicoes)
    .set(set)
    .where(
      and(eq(schema.medicoes.id, id), eq(schema.medicoes.tenantId, ctx.tenant.id)),
    );
  await logAudit({
    tenantId: ctx.tenant.id,
    userId: ctx.userId,
    action: "medicao.update",
    entity: "medicao",
    entityId: id,
    meta: set,
  });
  revalidatePath("/medicaolanc");
  revalidatePath("/dre");
  return { ok: true };
}

export async function deleteMedicao(id: string): Promise<Resultado> {
  const ctx = await getTenantContext();
  if (!ctx || !can(ctx.perms, "medicaolanc", "excluir")) {
    return { ok: false, error: "Sem permissão para excluir medições." };
  }
  const alvo = await medicaoDoTenant(ctx.tenant.id, id);
  if (!alvo) return { ok: false, error: "Medição não encontrada." };
  if (alvo.locked) return { ok: false, error: "Versão congelada — exclusão bloqueada." };
  await db
    .delete(schema.medicoes)
    .where(
      and(eq(schema.medicoes.id, id), eq(schema.medicoes.tenantId, ctx.tenant.id)),
    );
  await logAudit({
    tenantId: ctx.tenant.id,
    userId: ctx.userId,
    action: "medicao.delete",
    entity: "medicao",
    entityId: id,
    meta: { competencia: alvo.m.competencia, grupoCode: alvo.m.grupoCode, valor: alvo.m.valor },
  });
  revalidatePath("/medicaolanc");
  revalidatePath("/dre");
  return { ok: true };
}
