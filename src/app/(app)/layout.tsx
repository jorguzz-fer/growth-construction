import Link from "next/link";
import Image from "next/image";
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { mfaEnforced } from "@/lib/mfa";
import { eq } from "drizzle-orm";
import { db, schema } from "@/lib/db";
import { getActiveContext } from "@/lib/context";
import { can, screenIdOfPath } from "@/lib/permissions";
import { isR2Configured, readUrl } from "@/lib/storage/r2";
import { Sidebar } from "@/components/app/sidebar";
import { AccessDenied } from "@/components/app/access-denied";

export const dynamic = "force-dynamic";

export default async function AppLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const ctx = await getActiveContext();

  if (!ctx) {
    return (
      <div className="flex min-h-screen items-center justify-center px-6 text-center">
        <div className="max-w-md">
          <h1 className="font-[family-name:var(--font-serif)] text-2xl">
            Banco vazio
          </h1>
          <p className="mt-2 text-sm text-[var(--color-ink3)]">
            Nenhum tenant encontrado. As migrações rodam no deploy; para popular
            o tenant de demonstração, rode no terminal do container:
          </p>
          <pre className="mt-3 rounded-[8px] bg-[var(--color-ink)] p-3 text-left text-xs text-white">
            node seed.mjs
          </pre>
          <Link
            href="/"
            className="mt-4 inline-block text-sm text-[var(--color-accent2)] hover:underline"
          >
            ← voltar
          </Link>
        </div>
      </div>
    );
  }

  const vid = ctx.version.id;
  const [unidades, reembolso, permuta] = await Promise.all([
    db
      .select({ id: schema.units.id })
      .from(schema.units)
      .where(eq(schema.units.versionId, vid))
      .then((r) => r.length),
    db
      .select({ id: schema.reembolsos.id })
      .from(schema.reembolsos)
      .where(eq(schema.reembolsos.versionId, vid))
      .then((r) => r.length),
    db
      .select({ id: schema.permutas.id })
      .from(schema.permutas)
      .where(eq(schema.permutas.versionId, vid))
      .then((r) => r.length),
  ]);

  const logoUrl =
    ctx.tenant.logoKey && isR2Configured()
      ? await readUrl(ctx.tenant.logoKey)
      : null;

  const [me] = ctx.userId
    ? await db
        .select({
          name: schema.users.name,
          email: schema.users.email,
          mfaEnabled: schema.users.mfaEnabled,
        })
        .from(schema.users)
        .where(eq(schema.users.id, ctx.userId))
        .limit(1)
    : [];

  // MFA obrigatório (quando exigido por env): força o enrollment se não ativo.
  // Em standby (fase de testes), não redireciona.
  if (mfaEnforced() && me && !me.mfaEnabled) redirect("/mfa");

  const userName = me?.name || me?.email || "Usuário";

  // Enforcement central de "Ver": mapeia a rota atual para a tela governada.
  const pathname = (await headers()).get("x-pathname");
  const screenId = screenIdOfPath(pathname);
  const denied = screenId ? !can(ctx.perms, screenId, "ver") : false;

  return (
    <div className="flex h-screen overflow-hidden">
      <Sidebar
        tenantName={ctx.tenant.name}
        project={ctx.project}
        projects={ctx.projects}
        version={ctx.version}
        versions={ctx.versions}
        userName={userName}
        userRole={ctx.role}
        perms={ctx.perms}
        badges={{ unidades, reembolso, permuta }}
      />
      <main className="flex-1 overflow-y-auto">
        {logoUrl && (
          <div className="sticky top-0 z-30 hidden justify-end border-b border-[var(--color-accent2)]/12 bg-[var(--color-surface2)]/85 px-6 py-2 backdrop-blur lg:flex">
            <Image
              src={logoUrl}
              alt={ctx.tenant.name}
              width={130}
              height={32}
              unoptimized
              className="max-h-8 w-auto object-contain"
            />
          </div>
        )}
        <div className="mx-auto max-w-6xl px-4 pb-10 pt-20 sm:px-6 lg:pt-8">
          {denied ? <AccessDenied /> : children}
        </div>
      </main>
    </div>
  );
}
