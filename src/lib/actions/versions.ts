"use server";

import { and, eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { db, schema } from "@/lib/db";
import { getTenantContext, getVersionContext } from "@/lib/context";
import { can } from "@/lib/permissions";
import { logAudit } from "@/lib/audit";

const MAX_VERSIONS = 6;
const PALETTE = ["#8b5cf6", "#ec4899", "#14b8a6", "#f97316", "#0ea5e9"];

/**
 * Duplica uma versão (deep clone): cria uma nova versão "custom" e copia
 * unidades, permutas, reembolsos, caixa e despesas. Limite de 6 versões por
 * projeto. Ver docs/SPEC.md §4.
 */
export async function duplicateVersion(sourceVersionId: string, label: string) {
  const ctx = await getTenantContext();
  if (!ctx || !can(ctx.perms, "versao", "criar")) {
    throw new Error("Sem permissão para criar versões.");
  }
  // A obra é a da versão de origem (Prompt A), validada no tenant — não a do
  // cookie. Limite e cor contam as versões DESSA obra.
  const origem = await getVersionContext(ctx.tenant.id, sourceVersionId);
  if (!origem) throw new Error("Versão de origem não encontrada.");
  const { project, versions, version: source } = origem;
  if (versions.length >= MAX_VERSIONS) {
    throw new Error(`Limite de ${MAX_VERSIONS} versões por projeto atingido.`);
  }

  const color = PALETTE[versions.length % PALETTE.length];
  const key = `custom-${Date.now().toString(36)}`;

  const newId = await db.transaction(async (tx) => {
    const [created] = await tx
      .insert(schema.versions)
      .values({
        projectId: project.id,
        tenantId: ctx.tenant.id,
        key,
        kind: "custom",
        label: label.trim() || `Cópia de ${source.label}`,
        color,
        isDefault: false,
      })
      .returning();

    // units
    const units = await tx
      .select()
      .from(schema.units)
      .where(eq(schema.units.versionId, sourceVersionId));
    if (units.length) {
      await tx.insert(schema.units).values(
        units.map((u) => ({
          versionId: created.id,
          tenantId: u.tenantId,
          code: u.code,
          bloco: u.bloco,
          tipo: u.tipo,
          m2: u.m2,
          andar: u.andar,
          valor: u.valor,
          status: u.status,
          mesVenda: u.mesVenda,
          paymentPlan: u.paymentPlan,
        })),
      );
    }

    // permutas
    const permutas = await tx
      .select()
      .from(schema.permutas)
      .where(eq(schema.permutas.versionId, sourceVersionId));
    if (permutas.length) {
      await tx.insert(schema.permutas).values(
        permutas.map((p) => ({
          versionId: created.id,
          tenantId: p.tenantId,
          unitCode: p.unitCode,
          cliente: p.cliente,
          dataRecebimento: p.dataRecebimento,
          tipo: p.tipo,
          descricao: p.descricao,
          estimado: p.estimado,
          status: p.status,
          dataVenda: p.dataVenda,
          valorVenda: p.valorVenda,
          tipoPermuta: p.tipoPermuta,
          obs: p.obs,
        })),
      );
    }

    // reembolsos
    const reembolsos = await tx
      .select()
      .from(schema.reembolsos)
      .where(eq(schema.reembolsos.versionId, sourceVersionId));
    if (reembolsos.length) {
      await tx.insert(schema.reembolsos).values(
        reembolsos.map((r) => ({
          versionId: created.id,
          tenantId: r.tenantId,
          data: r.data,
          origem: r.origem,
          valor: r.valor,
          pct: r.pct,
          obs: r.obs,
          serial: r.serial,
          status: r.status,
        })),
      );
    }

    // caixa
    const cash = await tx
      .select()
      .from(schema.cashEntries)
      .where(eq(schema.cashEntries.versionId, sourceVersionId));
    if (cash.length) {
      await tx.insert(schema.cashEntries).values(
        cash.map((c) => ({
          versionId: created.id,
          tenantId: c.tenantId,
          bankAccountId: c.bankAccountId,
          data: c.data,
          descricao: c.descricao,
          valor: c.valor,
          cat: c.cat,
          unitCode: c.unitCode,
          rec: c.rec,
        })),
      );
    }

    // despesas
    const despesas = await tx
      .select()
      .from(schema.despesas)
      .where(eq(schema.despesas.versionId, sourceVersionId));
    if (despesas.length) {
      await tx.insert(schema.despesas).values(
        despesas.map((d) => ({
          versionId: created.id,
          tenantId: d.tenantId,
          fornecedorId: d.fornecedorId,
          bancoId: d.bancoId,
          contaCef: d.contaCef,
          categoriaDre: d.categoriaDre,
          competencia: d.competencia,
          vencimento: d.vencimento,
          dataCaixa: d.dataCaixa,
          valor: d.valor,
          status: d.status,
          obs: d.obs,
        })),
      );
    }

    return created.id;
  });

  await logAudit({
    tenantId: ctx.tenant.id,
    userId: ctx.userId,
    action: "version.duplicate",
    entity: "version",
    entityId: newId,
    meta: { from: source.label, label },
  });
  revalidatePath("/", "layout");
}

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
