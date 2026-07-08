"use server";

import { eq } from "drizzle-orm";
import { db, schema } from "@/lib/db";
import { verifyPassword } from "@/lib/password";
import { isSuperAdmin } from "@/lib/tenant/superadmin";

export interface PlatformPrecheck {
  ok: boolean;
  /** credencial válida, porém a conta não é super-admin da plataforma. */
  notAuthorized?: boolean;
}

/**
 * Etapa 1 do login do backoffice: valida e-mail+senha SEM criar sessão e
 * confirma que a conta é super-admin da plataforma. Evita criar sessão para
 * usuários comuns na entrada do backoffice.
 */
export async function precheckPlatformLogin(
  email: string,
  password: string,
): Promise<PlatformPrecheck> {
  const mail = email.toLowerCase().trim();
  if (!mail || !password) return { ok: false };

  const [u] = await db
    .select({ passwordHash: schema.users.passwordHash })
    .from(schema.users)
    .where(eq(schema.users.email, mail))
    .limit(1);

  if (!u?.passwordHash || !verifyPassword(password, u.passwordHash)) {
    return { ok: false };
  }
  if (!isSuperAdmin(mail)) {
    return { ok: false, notAuthorized: true };
  }
  return { ok: true };
}
