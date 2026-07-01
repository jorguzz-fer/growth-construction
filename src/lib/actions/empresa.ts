"use server";

import { eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { db, schema } from "@/lib/db";
import { getActiveContext } from "@/lib/context";
import { can } from "@/lib/permissions";
import { isR2Configured, putObject } from "@/lib/storage/r2";
import { logAudit } from "@/lib/audit";

/** Faz upload do logo da empresa para o R2 e salva a chave no tenant. */
export async function uploadLogo(formData: FormData) {
  const ctx = await getActiveContext();
  if (!ctx || !can(ctx.perms, "empresa", "editar")) {
    throw new Error("Sem permissão.");
  }
  if (!isR2Configured()) {
    throw new Error(
      "Storage (Cloudflare R2) não configurado — defina as variáveis R2_*.",
    );
  }
  const file = formData.get("logo") as File | null;
  if (!file || file.size === 0) throw new Error("Selecione um arquivo.");
  if (file.size > 2 * 1024 * 1024) throw new Error("Logo deve ter até 2 MB.");

  const ext = (file.name.split(".").pop() || "png").toLowerCase();
  const key = `tenants/${ctx.tenant.id}/logo.${ext}`;
  const bytes = new Uint8Array(await file.arrayBuffer());
  await putObject(key, bytes, file.type || "image/png");

  await db
    .update(schema.tenants)
    .set({ logoKey: key })
    .where(eq(schema.tenants.id, ctx.tenant.id));

  await logAudit({
    tenantId: ctx.tenant.id,
    userId: ctx.userId,
    action: "tenant.logo",
    entity: "tenant",
    entityId: ctx.tenant.id,
    meta: { key },
  });
  revalidatePath("/", "layout");
}

export async function renameTenant(formData: FormData) {
  const ctx = await getActiveContext();
  if (!ctx || !can(ctx.perms, "empresa", "editar")) return;
  const name = ((formData.get("name") as string) || "").trim();
  if (!name) return;
  await db
    .update(schema.tenants)
    .set({ name })
    .where(eq(schema.tenants.id, ctx.tenant.id));
  revalidatePath("/", "layout");
}
