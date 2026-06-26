"use server";

import { revalidatePath } from "next/cache";
import { db, schema } from "@/lib/db";
import { canEdit, getActiveContext } from "@/lib/context";
import { hasLevel } from "@/lib/permissions";
import { isR2Configured, putObject } from "@/lib/storage/r2";
import { logAudit } from "@/lib/audit";
import type { CategoriaDRE } from "@/lib/calc/constants";

export async function addStakeholder(formData: FormData) {
  const ctx = await getActiveContext();
  if (!ctx) return;
  const papeis = formData.getAll("papeis").map(String).filter(Boolean);
  await db.insert(schema.stakeholders).values({
    tenantId: ctx.tenant.id,
    nome: (formData.get("nome") as string) || "Sem nome",
    tipo: (formData.get("tipo") as "PJ" | "PF") || "PJ",
    doc: (formData.get("doc") as string) || null,
    papeis,
    email: (formData.get("email") as string) || null,
    tel: (formData.get("tel") as string) || null,
  });
  revalidatePath("/fornecedores");
}

export async function addBankAccount(formData: FormData) {
  const ctx = await getActiveContext();
  if (!ctx) return;
  await db.insert(schema.bankAccounts).values({
    tenantId: ctx.tenant.id,
    banco: (formData.get("banco") as string) || "Banco",
    ag: (formData.get("ag") as string) || null,
    op: (formData.get("op") as string) || null,
    cc: (formData.get("cc") as string) || null,
    tipo:
      (formData.get("tipo") as "Imobiliária" | "Construtora") || "Construtora",
  });
  revalidatePath("/fornecedores");
}

export async function addDespesa(formData: FormData) {
  const ctx = await getActiveContext();
  if (!ctx || !canEdit(ctx.role)) return;
  const [row] = await db
    .insert(schema.despesas)
    .values({
      versionId: ctx.version.id,
      tenantId: ctx.tenant.id,
      fornecedorId: (formData.get("fornecedorId") as string) || null,
      bancoId: (formData.get("bancoId") as string) || null,
      contaCef: (formData.get("contaCef") as string) || null,
      categoriaDre: (formData.get("categoriaDre") as CategoriaDRE) || null,
      competencia: (formData.get("competencia") as string) || null,
      vencimento: (formData.get("vencimento") as string) || null,
      valor: (formData.get("valor") as string) || "0",
      status: (formData.get("status") as string) || "A pagar",
    })
    .returning();
  await logAudit({
    tenantId: ctx.tenant.id,
    userId: ctx.userId,
    action: "despesa.create",
    entity: "despesa",
    entityId: row.id,
    meta: { valor: row.valor, contaCef: row.contaCef },
  });
  revalidatePath("/despesas");
}

/** Anexa um documento (NF/contrato) a uma despesa, no R2. */
export async function uploadDespesaDoc(formData: FormData) {
  const ctx = await getActiveContext();
  if (!ctx || !hasLevel(ctx.perms, "despesas", "edit")) {
    throw new Error("Sem permissão.");
  }
  if (!isR2Configured()) {
    throw new Error("Storage (R2) não configurado — defina as variáveis R2_*.");
  }
  const despesaId = (formData.get("despesaId") as string) || null;
  const file = formData.get("file") as File | null;
  if (!file || file.size === 0) throw new Error("Selecione um arquivo.");
  if (file.size > 10 * 1024 * 1024) throw new Error("Arquivo deve ter até 10 MB.");

  const safe = file.name.replace(/[^\w.\-]+/g, "_");
  const key = `tenants/${ctx.tenant.id}/docs/${Date.now()}_${safe}`;
  await putObject(key, new Uint8Array(await file.arrayBuffer()), file.type || "application/octet-stream");

  await db.insert(schema.documents).values({
    tenantId: ctx.tenant.id,
    despesaId,
    storageKey: key,
    filename: file.name,
    contentType: file.type || null,
    size: file.size,
  });
  await logAudit({
    tenantId: ctx.tenant.id,
    userId: ctx.userId,
    action: "document.upload",
    entity: "document",
    meta: { filename: file.name, despesaId },
  });
  revalidatePath("/despesas");
}
