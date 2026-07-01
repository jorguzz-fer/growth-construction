import { redirect } from "next/navigation";
import { eq } from "drizzle-orm";
import { db, schema } from "@/lib/db";
import { auth } from "@/lib/auth";
import { getOrCreateMfaSetup } from "@/lib/actions/account";
import { MfaEnroll } from "@/components/auth/mfa-enroll";

export const dynamic = "force-dynamic";

/**
 * Enrollment obrigatório do MFA: quem loga sem verificação em duas etapas
 * ativa cai aqui e só entra no painel depois de ativar (gate no layout do app).
 */
export default async function MfaPage() {
  const session = await auth();
  const email = session?.user?.email?.toLowerCase();
  if (!email) redirect("/login");

  const [user] = await db
    .select({ mfaEnabled: schema.users.mfaEnabled })
    .from(schema.users)
    .where(eq(schema.users.email, email))
    .limit(1);
  if (!user) redirect("/login");
  if (user.mfaEnabled) redirect("/dashboard");

  const setup = await getOrCreateMfaSetup();

  // Marca do tenant (se o vínculo já existir), com fallback do produto.
  const [tenant] = await db
    .select({ name: schema.tenants.name })
    .from(schema.memberships)
    .innerJoin(schema.users, eq(schema.users.id, schema.memberships.userId))
    .innerJoin(schema.tenants, eq(schema.tenants.id, schema.memberships.tenantId))
    .where(eq(schema.users.email, email))
    .limit(1);

  return (
    <MfaEnroll
      qr={setup.qr}
      secret={setup.secret}
      otpauth={setup.otpauth}
      brand={tenant?.name ?? "Growth Tools"}
    />
  );
}
