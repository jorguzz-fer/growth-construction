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
  if (ctx.version.locked) throw new Error("Versão congelada.");

  // Tipo de lançamento define o sinal do valor e a categoria:
  //  - receita: entrada (+), categoria escolhida (mensais/AS/…);
  //  - despesa: saída (−), lançamento avulso do extrato sem contraparte;
  //  - ajuste:  ajuste manual de caixa, + ou − conforme "sinal".
  // Entradas de ajuste e avulsas do extrato já nascem conciliadas (não têm
  // contraparte nos módulos de receita/despesa para casar).
  const tipo = ((formData.get("tipo") as string) || "receita").toLowerCase();
  const magnitude = Math.abs(Number(formData.get("valor")) || 0);

  let sign = 1;
  let cat = (formData.get("cat") as string) || "outro";
  let rec = false;
  if (tipo === "despesa") {
    sign = -1;
    cat = "despesa_extrato";
    rec = true;
  } else if (tipo === "ajuste") {
    sign = (formData.get("sinal") as string) === "menos" ? -1 : 1;
    cat = "ajuste";
    rec = true;
  } else if (tipo === "receita" && cat === "extrato") {
    // Receita avulsa do extrato (sem categoria de receita conhecida).
    cat = "receita_extrato";
    rec = true;
  }

  const [row] = await db
    .insert(schema.cashEntries)
    .values({
      versionId: ctx.version.id,
      tenantId: ctx.tenant.id,
      data: (formData.get("data") as string) || null,
      descricao: (formData.get("descricao") as string) || null,
      valor: String(sign * magnitude),
      cat,
      unitCode: (formData.get("unitCode") as string) || null,
      bankAccountId: (formData.get("bankAccountId") as string) || null,
      rec,
    })
    .returning();

  await logAudit({
    tenantId: ctx.tenant.id,
    userId: ctx.userId,
    action: tipo === "ajuste" ? "cash.adjust" : "cash.create",
    entity: "cash_entry",
    entityId: row.id,
    meta: { tipo, cat, valor: row.valor },
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
