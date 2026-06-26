"use server";

import { eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { db, schema } from "@/lib/db";
import { auth } from "@/lib/auth";
import { hashPassword, verifyPassword } from "@/lib/password";
import { generateSecret, qrDataUrl, verifyTotp } from "@/lib/totp";

async function currentUser() {
  const session = await auth();
  const email = session?.user?.email?.toLowerCase();
  if (!email) return null;
  const [u] = await db
    .select()
    .from(schema.users)
    .where(eq(schema.users.email, email))
    .limit(1);
  return u ?? null;
}

export async function changePassword(formData: FormData) {
  const u = await currentUser();
  if (!u) throw new Error("Não autenticado.");
  const current = String(formData.get("current") ?? "");
  const next = String(formData.get("next") ?? "");
  if (next.length < 8) throw new Error("A nova senha deve ter ao menos 8 caracteres.");
  if (u.passwordHash && !verifyPassword(current, u.passwordHash)) {
    throw new Error("Senha atual incorreta.");
  }
  await db
    .update(schema.users)
    .set({ passwordHash: hashPassword(next) })
    .where(eq(schema.users.id, u.id));
  revalidatePath("/perfil");
}

/** Gera um segredo TOTP (ainda não habilitado) e retorna o QR para escanear. */
export async function beginMfa(): Promise<{ qr: string }> {
  const u = await currentUser();
  if (!u) throw new Error("Não autenticado.");
  const secret = generateSecret();
  await db
    .update(schema.users)
    .set({ mfaSecret: secret, mfaEnabled: false })
    .where(eq(schema.users.id, u.id));
  return { qr: await qrDataUrl(secret, u.email ?? "conta") };
}

/** Confirma o código e ativa o MFA. */
export async function confirmMfa(formData: FormData) {
  const u = await currentUser();
  if (!u || !u.mfaSecret) throw new Error("Inicie a configuração do MFA primeiro.");
  const code = String(formData.get("code") ?? "");
  if (!verifyTotp(u.mfaSecret, code)) throw new Error("Código inválido.");
  await db
    .update(schema.users)
    .set({ mfaEnabled: true })
    .where(eq(schema.users.id, u.id));
  revalidatePath("/perfil");
}

export async function disableMfa() {
  const u = await currentUser();
  if (!u) throw new Error("Não autenticado.");
  await db
    .update(schema.users)
    .set({ mfaEnabled: false, mfaSecret: null })
    .where(eq(schema.users.id, u.id));
  revalidatePath("/perfil");
}
