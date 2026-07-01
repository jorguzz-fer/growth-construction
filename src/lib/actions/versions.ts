"use server";

import { eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { db, schema } from "@/lib/db";
import { getActiveContext } from "@/lib/context";
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
  const ctx = await getActiveContext();
  if (!ctx || !can(ctx.perms, "versao", "criar")) {
    throw new Error("Sem permissão para criar versões.");
  }
  if (ctx.versions.length >= MAX_VERSIONS) {
    throw new Error(`Limite de ${MAX_VERSIONS} versões por projeto atingido.`);
  }
  const source = ctx.versions.find((v) => v.id === sourceVersionId);
  if (!source) throw new Error("Versão de origem não encontrada.");

  const color = PALETTE[ctx.versions.length % PALETTE.length];
  const key = `custom-${Date.now().toString(36)}`;

  const newId = await db.transaction(async (tx) => {
    const [created] = await tx
      .insert(schema.versions)
      .values({
        projectId: ctx.project.id,
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
