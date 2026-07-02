"use server";

import { eq } from "drizzle-orm";
import { db, schema } from "@/lib/db";
import { verifyPassword } from "@/lib/password";
import { mfaEnforced } from "@/lib/mfa";

export interface PrecheckResult {
  ok: boolean;
  /** usuário tem MFA ativo → o login precisa do código na etapa 2. */
  mfaRequired: boolean;
}

/**
 * Etapa 1 do login em duas etapas: valida e-mail+senha SEM criar sessão e
 * informa se o usuário exige código MFA. Não revela nada além do que o
 * formulário de login já revelaria (credencial válida/inválida).
 */
export async function precheckLogin(
  email: string,
  password: string,
): Promise<PrecheckResult> {
  const mail = email.toLowerCase().trim();
  if (!mail || !password) return { ok: false, mfaRequired: false };

  const [u] = await db
    .select({
      passwordHash: schema.users.passwordHash,
      mfaEnabled: schema.users.mfaEnabled,
    })
    .from(schema.users)
    .where(eq(schema.users.email, mail))
    .limit(1);

  if (!u?.passwordHash || !verifyPassword(password, u.passwordHash)) {
    return { ok: false, mfaRequired: false };
  }
  return { ok: true, mfaRequired: mfaEnforced() && u.mfaEnabled };
}
