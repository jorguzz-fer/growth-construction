"use server";

import { and, eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { db, schema } from "@/lib/db";
import { getActiveContext, type Role } from "@/lib/context";
import { can, type PermMatrix } from "@/lib/permissions";
import { hashPassword } from "@/lib/password";
import { logAudit } from "@/lib/audit";

const ROLES: Role[] = ["owner", "admin", "membro", "contador", "engenheiro"];

export interface ActionResult {
  ok: boolean;
  error?: string;
}

/** Conta quantos owners o tenant tem (para proteger o último owner). */
async function countOwners(tenantId: string): Promise<number> {
  const rows = await db
    .select({ userId: schema.memberships.userId })
    .from(schema.memberships)
    .where(
      and(
        eq(schema.memberships.tenantId, tenantId),
        eq(schema.memberships.role, "owner"),
      ),
    );
  return rows.length;
}

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
  const password = ((formData.get("password") as string) || "").trim();
  const role =
    fixedRole ??
    (ROLES.includes(formData.get("role") as Role)
      ? (formData.get("role") as Role)
      : "membro");
  if (!email) return;

  // Senha inicial é opcional; se informada precisa ter no mínimo 8 caracteres.
  const passwordHash =
    password.length >= 8 ? hashPassword(password) : undefined;

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
        .values({ email, name, passwordHash })
        .returning()
    )[0].id;

  // Usuário já existia e foi informada uma senha inicial → define a senha.
  if (existing && passwordHash) {
    await db
      .update(schema.users)
      .set({ passwordHash })
      .where(eq(schema.users.id, userId));
  }

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

export async function changeRole(
  userId: string,
  role: Role,
): Promise<ActionResult> {
  const ctx = await getActiveContext();
  if (!ctx || !can(ctx.perms, "usuarios", "editar"))
    return { ok: false, error: "Sem permissão." };

  // Rebaixar o último owner deixaria o tenant sem dono.
  const [target] = await db
    .select({ role: schema.memberships.role })
    .from(schema.memberships)
    .where(
      and(
        eq(schema.memberships.userId, userId),
        eq(schema.memberships.tenantId, ctx.tenant.id),
      ),
    )
    .limit(1);
  if (target?.role === "owner" && role !== "owner") {
    if ((await countOwners(ctx.tenant.id)) <= 1)
      return { ok: false, error: "O tenant precisa de pelo menos um owner." };
  }

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
  return { ok: true };
}

/** Edita o nome de exibição de um membro. */
export async function updateMemberName(
  userId: string,
  name: string,
): Promise<ActionResult> {
  const ctx = await getActiveContext();
  if (!ctx || !can(ctx.perms, "usuarios", "editar"))
    return { ok: false, error: "Sem permissão." };
  await db
    .update(schema.users)
    .set({ name: name.trim() || null })
    .where(eq(schema.users.id, userId));
  await logAudit({
    tenantId: ctx.tenant.id,
    userId: ctx.userId,
    action: "user.rename",
    entity: "user",
    entityId: userId,
    meta: { name },
  });
  revalidatePath("/usuarios");
  return { ok: true };
}

/**
 * Define/redefine a senha de um membro (admin). A troca só vale para membros
 * do próprio tenant. Mínimo de 8 caracteres.
 */
export async function resetMemberPassword(
  userId: string,
  password: string,
): Promise<ActionResult> {
  const ctx = await getActiveContext();
  if (!ctx || !can(ctx.perms, "usuarios", "editar"))
    return { ok: false, error: "Sem permissão." };
  if ((password ?? "").length < 8)
    return { ok: false, error: "A senha precisa de no mínimo 8 caracteres." };

  // Garante que o alvo é membro deste tenant.
  const [m] = await db
    .select({ userId: schema.memberships.userId })
    .from(schema.memberships)
    .where(
      and(
        eq(schema.memberships.userId, userId),
        eq(schema.memberships.tenantId, ctx.tenant.id),
      ),
    )
    .limit(1);
  if (!m) return { ok: false, error: "Membro não encontrado." };

  await db
    .update(schema.users)
    .set({ passwordHash: hashPassword(password) })
    .where(eq(schema.users.id, userId));
  await logAudit({
    tenantId: ctx.tenant.id,
    userId: ctx.userId,
    action: "user.password_reset",
    entity: "user",
    entityId: userId,
  });
  revalidatePath("/usuarios");
  return { ok: true };
}

/**
 * Remove o vínculo (membership) de um membro com o tenant. Não apaga o usuário
 * global (pode pertencer a outros tenants). Protege o último owner e impede a
 * auto-remoção.
 */
export async function removeMember(userId: string): Promise<ActionResult> {
  const ctx = await getActiveContext();
  if (!ctx || !can(ctx.perms, "usuarios", "excluir"))
    return { ok: false, error: "Sem permissão." };
  if (userId === ctx.userId)
    return { ok: false, error: "Você não pode remover a si mesmo." };

  const [target] = await db
    .select({ role: schema.memberships.role })
    .from(schema.memberships)
    .where(
      and(
        eq(schema.memberships.userId, userId),
        eq(schema.memberships.tenantId, ctx.tenant.id),
      ),
    )
    .limit(1);
  if (!target) return { ok: false, error: "Membro não encontrado." };
  if (target.role === "owner" && (await countOwners(ctx.tenant.id)) <= 1)
    return { ok: false, error: "O tenant precisa de pelo menos um owner." };

  await db
    .delete(schema.memberships)
    .where(
      and(
        eq(schema.memberships.userId, userId),
        eq(schema.memberships.tenantId, ctx.tenant.id),
      ),
    );
  await logAudit({
    tenantId: ctx.tenant.id,
    userId: ctx.userId,
    action: "membership.remove",
    entity: "membership",
    entityId: userId,
    meta: { role: target.role },
  });
  revalidatePath("/usuarios");
  return { ok: true };
}
