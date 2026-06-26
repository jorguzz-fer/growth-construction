"use server";

import { eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { db, schema } from "@/lib/db";
import { getActiveContext } from "@/lib/context";

export async function addCash(formData: FormData) {
  const ctx = await getActiveContext();
  if (!ctx) return;
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

/** Alterna o estado de conciliação de um lançamento de caixa. */
export async function toggleConciliado(id: string, rec: boolean) {
  await db
    .update(schema.cashEntries)
    .set({ rec })
    .where(eq(schema.cashEntries.id, id));
  revalidatePath("/caixa");
}
