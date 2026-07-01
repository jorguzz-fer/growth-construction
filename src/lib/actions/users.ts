"use server";

import { and, eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { db, schema } from "@/lib/db";
import { getActiveContext, type Role } from "@/lib/context";
import { can, type PermMatrix } from "@/lib/permissions";
import { logAudit } from "@/lib/audit";

const ROLES: Role[] = ["owner", "admin", "membro", "contador"];

/**
 * Convida um membro para o tenant: garante o usuário (por e-mail) e cria o
 * vínculo com o papel. Sem envio de e-mail ainda — o registro fica pronto para
 * o fluxo de login do Auth.js. Apenas owner/admin podem convidar.
 */
async function invite(formData: FormData, fixedRole?: Role) {
  const ctx = await getActiveContext();
  if (!ctx || !can(ctx.perms, "usuarios", "criar")) return;

  const email = ((formData.get("email") as string) || "").trim().toLowerCase();
  const name = (formData.get("name") as string) || null;
  const role =
    fixedRole ??
    (ROLES.includes(formData.get("role") as Role)
      ? (formData.get("role") as Role)
      : "membro");
  if (!email) return;

  const [existing] = await db
    .select()
    .from(schema.users)
    .where(eq(schema.users.email, email))
    .limit(1);

  const userId =
    existing?.id ??
    (
      await db
        .insert(schema.users)
        .values({ email, name })
        .returning()
    )[0].id;

  await db
    .insert(schema.memberships)
    .values({ userId, tenantId: ctx.tenant.id, role })
    .onConflictDoUpdate({
      target: [schema.memberships.userId, schema.memberships.tenantId],
      set: { role },
    });

  await logAudit({
    tenantId: ctx.tenant.id,
    userId: ctx.userId,
    action: "membership.invite",
    entity: "membership",
    entityId: userId,
    meta: { email, role },
  });
  revalidatePath("/usuarios");
  revalidatePath("/contabilidade");
}

export async function inviteMember(formData: FormData) {
  await invite(formData);
}

export async function inviteContador(formData: FormData) {
  await invite(formData, "contador");
}

/** Define os overrides de permissão granular (tela × ação) de um membro. */
export async function setMemberPermissions(
  userId: string,
  permissions: PermMatrix,
) {
  const ctx = await getActiveContext();
  if (!ctx || !can(ctx.perms, "acessos", "editar")) return;
  await db
    .update(schema.memberships)
    .set({ permissions })
    .where(
      and(
        eq(schema.memberships.userId, userId),
        eq(schema.memberships.tenantId, ctx.tenant.id),
      ),
    );
  await logAudit({
    tenantId: ctx.tenant.id,
    userId: ctx.userId,
    action: "membership.permissions",
    entity: "membership",
    entityId: userId,
    meta: permissions,
  });
  revalidatePath("/usuarios");
}

export async function changeRole(userId: string, role: Role) {
  const ctx = await getActiveContext();
  if (!ctx || !can(ctx.perms, "usuarios", "editar")) return;
  await db
    .update(schema.memberships)
    .set({ role })
    .where(
      and(
        eq(schema.memberships.userId, userId),
        eq(schema.memberships.tenantId, ctx.tenant.id),
      ),
    );
  await logAudit({
    tenantId: ctx.tenant.id,
    userId: ctx.userId,
    action: "membership.role",
    entity: "membership",
    entityId: userId,
    meta: { role },
  });
  revalidatePath("/usuarios");
}
