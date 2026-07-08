"use server";

import { and, eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { db, schema } from "@/lib/db";
import { getActiveContext } from "@/lib/context";
import { getAtualVersion } from "@/lib/queries";
import { can } from "@/lib/permissions";
import { logAudit } from "@/lib/audit";
import { emptyPlan } from "@/lib/calc/plan";
import type { PaymentPlan, UnitStatus } from "@/lib/calc/types";

export interface SaveUnitInput {
  id?: string;
  /** projeto ao qual a unidade/venda pertence (grava na versão Atual dele). */
  projectId?: string;
  code: string;
  bloco?: string;
  tipo?: string;
  m2?: number;
  andar?: number;
  valor: number;
  status: UnitStatus;
  mesVenda?: string;
  plan: PaymentPlan;
}

export async function saveUnit(input: SaveUnitInput) {
  const ctx = await getActiveContext();
  if (!ctx || !can(ctx.perms, "unidades", input.id ? "editar" : "criar")) {
    throw new Error("Sem permissão para editar unidades.");
  }
  // Sem "versão ativa": a venda é gravada na versão Atual do projeto escolhido.
  const projectId = input.projectId || ctx.project.id;
  const version = await getAtualVersion(ctx.tenant.id, projectId);
  if (!version) throw new Error("Projeto sem versão Atual.");
  if (version.locked) throw new Error("Versão congelada — edição bloqueada.");

  const values = {
    versionId: version.id,
    tenantId: ctx.tenant.id,
    code: input.code.trim() || "SEM CÓDIGO",
    bloco: input.bloco || null,
    tipo: input.tipo || null,
    m2: input.m2 != null ? String(input.m2) : null,
    andar: input.andar ?? null,
    valor: String(input.valor ?? 0),
    status: input.status,
    mesVenda: input.mesVenda || null,
    paymentPlan: input.plan,
    updatedAt: new Date(),
  };

  if (input.id) {
    await db
      .update(schema.units)
      .set(values)
      .where(
        and(
          eq(schema.units.id, input.id),
          eq(schema.units.tenantId, ctx.tenant.id),
        ),
      );
    await logAudit({
      tenantId: ctx.tenant.id,
      userId: ctx.userId,
      action: "unit.update",
      entity: "unit",
      entityId: input.id,
      meta: { code: values.code, status: values.status },
    });
  } else {
    const [row] = await db.insert(schema.units).values(values).returning();
    await logAudit({
      tenantId: ctx.tenant.id,
      userId: ctx.userId,
      action: "unit.create",
      entity: "unit",
      entityId: row.id,
      meta: { code: values.code },
    });
  }

  revalidatePath("/unidades");
  redirect("/unidades");
}

export interface ImportUnitRow {
  code: string;
  bloco?: string;
  tipo?: string;
  m2?: number;
  andar?: number;
  valor?: number;
  status?: UnitStatus;
}

/** Importa unidades em lote (ex.: de uma planilha XLSX). */
export async function importUnits(
  rows: ImportUnitRow[],
  projectId?: string,
): Promise<{ inserted: number }> {
  const ctx = await getActiveContext();
  if (!ctx || !can(ctx.perms, "unidades", "criar")) {
    throw new Error("Sem permissão para importar unidades.");
  }
  const version = await getAtualVersion(ctx.tenant.id, projectId || ctx.project.id);
  if (!version) throw new Error("Projeto sem versão Atual.");
  const valid = rows.filter((r) => r.code && r.code.trim());
  if (valid.length === 0) return { inserted: 0 };

  await db.insert(schema.units).values(
    valid.map((r) => ({
      versionId: version.id,
      tenantId: ctx.tenant.id,
      code: r.code.trim(),
      bloco: r.bloco || null,
      tipo: r.tipo || null,
      m2: r.m2 != null ? String(r.m2) : null,
      andar: r.andar ?? null,
      valor: String(r.valor ?? 0),
      status: r.status ?? "Disponivel",
      paymentPlan: emptyPlan(),
    })),
  );
  await logAudit({
    tenantId: ctx.tenant.id,
    userId: ctx.userId,
    action: "unit.import",
    entity: "unit",
    meta: { count: valid.length },
  });
  revalidatePath("/unidades");
  return { inserted: valid.length };
}

export async function deleteUnit(id: string) {
  const ctx = await getActiveContext();
  if (!ctx || !can(ctx.perms, "unidades", "excluir")) return;
  await db
    .delete(schema.units)
    .where(
      and(eq(schema.units.id, id), eq(schema.units.tenantId, ctx.tenant.id)),
    );
  await logAudit({
    tenantId: ctx.tenant.id,
    userId: ctx.userId,
    action: "unit.delete",
    entity: "unit",
    entityId: id,
  });
  revalidatePath("/unidades");
}
