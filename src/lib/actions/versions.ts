"use server";

import { and, eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { db, schema } from "@/lib/db";
import { getTenantContext, getVersionContext } from "@/lib/context";
import { can } from "@/lib/permissions";
import { logAudit } from "@/lib/audit";

// `duplicateVersion` foi descontinuada (Prompt I, BI-3): não se cria mais
// versão por cópia. Ela copiava despesas, caixa e unidades — lançamentos reais —
// para dentro de orçamentos. As versões já criadas por ela ficam como estão.

/**
 * Permissão + a versão com a obra dela (Prompt A): a versão precisa ser do
 * tenant — de QUALQUER obra dele, não só da obra do cookie.
 */
async function guardVersionEdit(versionId: string) {
  const ctx = await getTenantContext();
  if (!ctx || !can(ctx.perms, "versao", "editar")) return null;
  const alvo = await getVersionContext(ctx.tenant.id, versionId);
  if (!alvo) return null;
  return { ...ctx, ...alvo };
}

export async function updateVersion(
  versionId: string,
  patch: { label?: string; color?: string },
) {
  const ctx = await guardVersionEdit(versionId);
  if (!ctx) return;
  const set: { label?: string; color?: string } = {};
  if (patch.label && patch.label.trim()) set.label = patch.label.trim();
  if (patch.color) set.color = patch.color;
  if (Object.keys(set).length === 0) return;
  await db.update(schema.versions).set(set).where(eq(schema.versions.id, versionId));
  await logAudit({
    tenantId: ctx.tenant.id,
    userId: ctx.userId,
    action: "version.update",
    entity: "version",
    entityId: versionId,
    meta: set,
  });
  revalidatePath("/", "layout");
}

export async function toggleVersionLock(versionId: string, locked: boolean) {
  const ctx = await guardVersionEdit(versionId);
  if (!ctx) return;
  await db.update(schema.versions).set({ locked }).where(eq(schema.versions.id, versionId));
  await logAudit({
    tenantId: ctx.tenant.id,
    userId: ctx.userId,
    action: "version.lock",
    entity: "version",
    entityId: versionId,
    meta: { locked },
  });
  revalidatePath("/", "layout");
}

export async function setDefaultVersion(versionId: string) {
  const ctx = await guardVersionEdit(versionId);
  if (!ctx) return;
  const anterior = ctx.versions.find((v) => v.isDefault) ?? null;
  const nova = ctx.version;
  await db.transaction(async (tx) => {
    await tx
      .update(schema.versions)
      .set({ isDefault: false })
      .where(
        and(
          eq(schema.versions.projectId, ctx.project.id),
          eq(schema.versions.tenantId, ctx.tenant.id),
        ),
      );
    await tx
      .update(schema.versions)
      .set({ isDefault: true })
      .where(eq(schema.versions.id, versionId));
    // AK Parte 1 — dentro da transação da escrita (1.3).
    await logAudit(
      {
        tenantId: ctx.tenant.id,
        userId: ctx.userId,
        action: "version.setDefault",
        entity: "version",
        entityId: versionId,
        meta: {
          projeto: ctx.project.name,
          de: anterior ? { id: anterior.id, label: anterior.label } : null,
          para: nova ? { id: nova.id, label: nova.label } : null,
        },
      },
      tx,
    );
  });
  revalidatePath("/", "layout");
}

export async function deleteVersion(versionId: string) {
  const ctx = await getTenantContext();
  if (!ctx || !can(ctx.perms, "versao", "excluir")) return;
  const target = (await getVersionContext(ctx.tenant.id, versionId))?.version;
  if (!target) return;
  if (target.kind !== "custom") throw new Error("Só versões customizadas podem ser excluídas.");
  await db.delete(schema.versions).where(eq(schema.versions.id, versionId));
  await logAudit({
    tenantId: ctx.tenant.id,
    userId: ctx.userId,
    action: "version.delete",
    entity: "version",
    entityId: versionId,
    meta: { label: target.label },
  });
  revalidatePath("/", "layout");
}
