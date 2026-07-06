"use server";

import { revalidatePath } from "next/cache";
import { getActiveContext } from "@/lib/context";
import { isSuperAdmin } from "@/lib/tenant/superadmin";
import { provisionTenant, type ProvisionResult } from "@/lib/tenant/provision";
import { logAudit } from "@/lib/audit";

/**
 * Cria uma nova conta (tenant) com a estrutura padrão. Restrito a super-admins
 * da plataforma — ver src/lib/tenant/superadmin.ts.
 */
export async function createTenantAccount(
  formData: FormData,
): Promise<ProvisionResult> {
  const ctx = await getActiveContext();
  if (!ctx || !isSuperAdmin(ctx.userEmail)) {
    return { ok: false, error: "Acesso restrito a super-admins da plataforma." };
  }

  const tenantName = String(formData.get("tenantName") ?? "");
  const res = await provisionTenant({
    tenantName,
    ownerName: String(formData.get("ownerName") ?? ""),
    ownerEmail: String(formData.get("ownerEmail") ?? ""),
    ownerPassword: String(formData.get("ownerPassword") ?? ""),
    projectName: String(formData.get("projectName") ?? ""),
  });

  if (res.ok && res.tenantId) {
    await logAudit({
      tenantId: res.tenantId,
      userId: ctx.userId,
      action: "tenant.create",
      entity: "tenant",
      entityId: res.tenantId,
      meta: { name: tenantName.trim(), by: ctx.userEmail },
    });
    revalidatePath("/superadmin");
  }
  return res;
}
