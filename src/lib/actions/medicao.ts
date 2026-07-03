"use server";

import { and, eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { db, schema } from "@/lib/db";
import { getActiveContext } from "@/lib/context";
import { can } from "@/lib/permissions";
import { logAudit } from "@/lib/audit";

/**
 * Lançamentos de medição de obra (engenheiro), por competência e grupo CEF.
 * A soma alimenta o Custo Variável da DRE.
 */

export async function addMedicao(formData: FormData) {
  const ctx = await getActiveContext();
  if (!ctx || !can(ctx.perms, "medicaolanc", "criar")) {
    throw new Error("Sem permissão para lançar medições.");
  }
  if (ctx.version.locked) throw new Error("Versão congelada — lançamentos bloqueados.");
  const competencia = ((formData.get("competencia") as string) || "").trim();
  const grupo = ((formData.get("grupo") as string) || "").trim();
  const valor = (formData.get("valor") as string) || "0";
  if (!competencia) throw new Error("Informe a competência (MM/YYYY).");
  if (!grupo) throw new Error("Selecione o grupo de obra.");
  // "grupoCode|grupoName" vem do select para preservar o nome do grupo.
  const [grupoCode, ...rest] = grupo.split("|");
  const grupoName = rest.join("|") || grupoCode;

  await db.insert(schema.medicoes).values({
    versionId: ctx.version.id,
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
    meta: { competencia, grupoCode: grupoCode.trim(), valor },
  });
  revalidatePath("/medicaolanc");
  revalidatePath("/dre");
}

export async function updateMedicao(
  id: string,
  patch: { competencia?: string; valor?: string; obs?: string },
) {
  const ctx = await getActiveContext();
  if (!ctx || !can(ctx.perms, "medicaolanc", "editar")) return;
  const set: { competencia?: string; valor?: string; obs?: string | null } = {};
  if (patch.competencia && patch.competencia.trim()) set.competencia = patch.competencia.trim();
  if (patch.valor !== undefined) set.valor = patch.valor || "0";
  if (patch.obs !== undefined) set.obs = patch.obs || null;
  if (Object.keys(set).length === 0) return;
  await db
    .update(schema.medicoes)
    .set(set)
    .where(
      and(eq(schema.medicoes.id, id), eq(schema.medicoes.versionId, ctx.version.id)),
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
}

export async function deleteMedicao(id: string) {
  const ctx = await getActiveContext();
  if (!ctx || !can(ctx.perms, "medicaolanc", "excluir")) return;
  await db
    .delete(schema.medicoes)
    .where(
      and(eq(schema.medicoes.id, id), eq(schema.medicoes.versionId, ctx.version.id)),
    );
  await logAudit({
    tenantId: ctx.tenant.id,
    userId: ctx.userId,
    action: "medicao.delete",
    entity: "medicao",
    entityId: id,
  });
  revalidatePath("/medicaolanc");
  revalidatePath("/dre");
}
