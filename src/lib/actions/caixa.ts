"use server";

import { eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { db, schema } from "@/lib/db";
import { getActiveContext } from "@/lib/context";
import { can } from "@/lib/permissions";
import { logAudit } from "@/lib/audit";

export async function addCash(formData: FormData) {
  const ctx = await getActiveContext();
  if (!ctx || !can(ctx.perms, "caixa", "criar")) return;
  await db.insert(schema.cashEntries).values({
    versionId: ctx.version.id,
    tenantId: ctx.tenant.id,
    data: (formData.get("data") as string) || null,
    descricao: (formData.get("descricao") as string) || null,
    valor: (formData.get("valor") as string) || "0",
    cat: (formData.get("cat") as string) || "outro",
    unitCode: (formData.get("unitCode") as string) || null,
    bankAccountId: (formData.get("bankAccountId") as string) || null,
    rec: false,
  });
  revalidatePath("/caixa");
}

export interface ImportCashRow {
  data?: string;
  descricao?: string;
  valor?: number;
  cat?: string;
}

/** Importa lançamentos de caixa de um extrato (XLSX/CSV). */
export async function importCash(
  rows: ImportCashRow[],
): Promise<{ inserted: number }> {
  const ctx = await getActiveContext();
  if (!ctx || !can(ctx.perms, "caixa", "criar")) {
    throw new Error("Sem permissão para importar extrato.");
  }
  const valid = rows.filter((r) => r.valor != null && r.valor !== 0);
  if (valid.length === 0) return { inserted: 0 };
  await db.insert(schema.cashEntries).values(
    valid.map((r) => ({
      versionId: ctx.version.id,
      tenantId: ctx.tenant.id,
      data: r.data || null,
      descricao: r.descricao || null,
      valor: String(r.valor ?? 0),
      cat: r.cat || "extrato",
      rec: false,
    })),
  );
  await logAudit({
    tenantId: ctx.tenant.id,
    userId: ctx.userId,
    action: "cash.import",
    entity: "cash_entry",
    meta: { count: valid.length },
  });
  revalidatePath("/caixa");
  return { inserted: valid.length };
}

/** Alterna o estado de conciliação de um lançamento de caixa. */
export async function toggleConciliado(id: string, rec: boolean) {
  const ctx = await getActiveContext();
  if (!ctx || !can(ctx.perms, "caixa", "editar")) return;
  await db
    .update(schema.cashEntries)
    .set({ rec })
    .where(eq(schema.cashEntries.id, id));
  revalidatePath("/caixa");
}
