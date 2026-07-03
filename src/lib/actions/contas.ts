"use server";

import { and, eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { db, schema } from "@/lib/db";
import { getActiveContext } from "@/lib/context";
import { can } from "@/lib/permissions";
import { logAudit } from "@/lib/audit";

/**
 * Cadastro de contas correntes do tenant. As contas serão acessadas
 * automaticamente via Open Finance (Fase 4) e/ou atualizadas pelo upload de
 * extrato na tela Caixa; o saldo também pode ser lançado manualmente.
 */

export async function addConta(formData: FormData) {
  const ctx = await getActiveContext();
  if (!ctx || !can(ctx.perms, "contas", "criar")) {
    throw new Error("Sem permissão para cadastrar contas.");
  }
  await db.insert(schema.bankAccounts).values({
    tenantId: ctx.tenant.id,
    banco: ((formData.get("banco") as string) || "Banco").trim(),
    ag: (formData.get("ag") as string) || null,
    op: (formData.get("op") as string) || null,
    cc: (formData.get("cc") as string) || null,
    tipo:
      (formData.get("tipo") as "Imobiliária" | "Construtora") || "Construtora",
    saldo: (formData.get("saldo") as string) || "0",
    saldoSource:
      (formData.get("saldoSource") as string) === "auto" ? "auto" : "manual",
    openFinanceId: (formData.get("openFinanceId") as string) || null,
  });
  await logAudit({
    tenantId: ctx.tenant.id,
    userId: ctx.userId,
    action: "conta.create",
    entity: "bank_account",
  });
  revalidatePath("/contas");
  revalidatePath("/caixa");
}

export async function updateConta(
  id: string,
  patch: {
    banco?: string;
    ag?: string;
    op?: string;
    cc?: string;
    tipo?: string;
    saldo?: string;
    saldoSource?: string;
  },
) {
  const ctx = await getActiveContext();
  if (!ctx || !can(ctx.perms, "contas", "editar")) return;
  const set: Record<string, unknown> = {};
  if (patch.banco?.trim()) set.banco = patch.banco.trim();
  if (patch.ag !== undefined) set.ag = patch.ag || null;
  if (patch.op !== undefined) set.op = patch.op || null;
  if (patch.cc !== undefined) set.cc = patch.cc || null;
  if (patch.tipo === "Imobiliária" || patch.tipo === "Construtora") set.tipo = patch.tipo;
  if (patch.saldo !== undefined) {
    set.saldo = patch.saldo || "0";
    set.lastSync = new Date();
  }
  if (patch.saldoSource === "auto" || patch.saldoSource === "manual") {
    set.saldoSource = patch.saldoSource;
  }
  if (Object.keys(set).length === 0) return;
  await db
    .update(schema.bankAccounts)
    .set(set)
    .where(
      and(
        eq(schema.bankAccounts.id, id),
        eq(schema.bankAccounts.tenantId, ctx.tenant.id),
      ),
    );
  await logAudit({
    tenantId: ctx.tenant.id,
    userId: ctx.userId,
    action: "conta.update",
    entity: "bank_account",
    entityId: id,
    meta: set,
  });
  revalidatePath("/contas");
  revalidatePath("/caixa");
}

export async function deleteConta(id: string) {
  const ctx = await getActiveContext();
  if (!ctx || !can(ctx.perms, "contas", "excluir")) return;
  await db
    .delete(schema.bankAccounts)
    .where(
      and(
        eq(schema.bankAccounts.id, id),
        eq(schema.bankAccounts.tenantId, ctx.tenant.id),
      ),
    );
  await logAudit({
    tenantId: ctx.tenant.id,
    userId: ctx.userId,
    action: "conta.delete",
    entity: "bank_account",
    entityId: id,
  });
  revalidatePath("/contas");
  revalidatePath("/caixa");
}
