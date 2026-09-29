"use server";

import { eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { db, schema } from "@/lib/db";
import { auth, unstable_update } from "@/lib/auth";
import { hashPassword, verifyPassword } from "@/lib/password";
import { generateSecret, otpauthUrl, qrDataUrl, verifyTotp } from "@/lib/totp";

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

/**
 * Troca da senha pela PRÓPRIA pessoa. Limpa a marca de senha provisória e
 * encerra as outras sessões dela (AI 1.1 e 1.3) — inclusive a de quem tenha
 * entrado com a senha provisória. A sessão atual é renovada e continua.
 *
 * Devolve `{ ok, error }`: exceção de Server Action não chega à tela em
 * produção.
 */
export async function changePassword(
  formData: FormData,
): Promise<{ ok: boolean; error?: string }> {
  const u = await currentUser();
  if (!u) return { ok: false, error: "Não autenticado." };
  const current = String(formData.get("current") ?? "");
  const next = String(formData.get("next") ?? "");
  if (next.length < 8) return { ok: false, error: "A nova senha deve ter ao menos 8 caracteres." };
  if (u.passwordHash && !verifyPassword(current, u.passwordHash)) {
    return { ok: false, error: "Senha atual incorreta." };
  }
  if (u.passwordHash && verifyPassword(next, u.passwordHash)) {
    return { ok: false, error: "A nova senha precisa ser diferente da atual." };
  }
  await db
    .update(schema.users)
    .set({
      passwordHash: hashPassword(next),
      mustChangePassword: false,
      passwordChangedAt: new Date(),
    })
    .where(eq(schema.users.id, u.id));
  // Renova o login DESTA sessão depois do instante gravado acima.
  await unstable_update({});
  revalidatePath("/", "layout");
  return { ok: true };
}

export interface MfaSetupData {
  qr: string;
  /** segredo base32 para digitação manual. */
  secret: string;
  /** otpauth:// para "Abrir no app autenticador". */
  otpauth: string;
}

/**
 * Retorna os dados de enrollment do MFA para o usuário logado. Reaproveita um
 * segredo pendente (gerado mas ainda não confirmado) para que recarregar a
 * página não invalide o QR já escaneado; gera um novo apenas se não houver.
 */
export async function getOrCreateMfaSetup(): Promise<MfaSetupData> {
  const u = await currentUser();
  if (!u) throw new Error("Não autenticado.");
  let secret = !u.mfaEnabled && u.mfaSecret ? u.mfaSecret : null;
  if (!secret) {
    secret = generateSecret();
    await db
      .update(schema.users)
      .set({ mfaSecret: secret, mfaEnabled: false })
      .where(eq(schema.users.id, u.id));
  }
  const label = u.email ?? "conta";
  return {
    qr: await qrDataUrl(secret, label),
    secret,
    otpauth: otpauthUrl(secret, label),
  };
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
  // Libera o gate do layout (que redireciona p/ /mfa enquanto não ativado).
  revalidatePath("/", "layout");
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
