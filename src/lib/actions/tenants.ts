"use server";

import { revalidatePath } from "next/cache";
import { auth } from "@/lib/auth";
import { isSuperAdmin } from "@/lib/tenant/superadmin";
import { provisionTenant, type ProvisionResult } from "@/lib/tenant/provision";
import { logAudit } from "@/lib/audit";

/**
 * Cria uma nova conta (tenant) com a estrutura padrão. Restrito a super-admins
 * da plataforma. Autoriza pela SESSÃO (e-mail), não pelo contexto de tenant —
 * o backoffice é isolado e o super-admin pode não ter vínculo com tenant algum.
 */
export async function createTenantAccount(
  formData: FormData,
): Promise<ProvisionResult> {
  const session = await auth();
  const email = session?.user?.email ?? null;
  const uid = (session?.user as { id?: string } | undefined)?.id ?? null;
  if (!isSuperAdmin(email)) {
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
      userId: uid,
      action: "tenant.create",
      entity: "tenant",
      entityId: res.tenantId,
      meta: { name: tenantName.trim(), by: email },
    });
    revalidatePath("/plataforma");
  }
  return res;
}
