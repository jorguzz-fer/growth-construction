import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import { isSuperAdmin } from "@/lib/tenant/superadmin";
import { PlatformSignOut } from "@/components/app/platform-signout";

export const dynamic = "force-dynamic";

/**
 * Layout do Backoffice / Plataforma. Área ISOLADA do app de tenant: gate por
 * super-admin da sessão (não depende de vínculo com tenant). Chrome próprio,
 * sem a sidebar do cliente.
 */
export default async function PlataformaLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const session = await auth();
  const email = session?.user?.email ?? null;
  if (!email) redirect("/plataforma/login");
  if (!isSuperAdmin(email)) redirect("/plataforma/login?error=forbidden");

  const name = session?.user?.name || email;

  return (
    <div className="min-h-screen bg-[var(--color-surface2)]">
      <header className="sticky top-0 z-30 flex items-center justify-between border-b border-white/10 bg-[#14141d] px-5 py-3">
        <div>
          <div className="font-[family-name:var(--font-serif)] text-[15px] text-white">
            Growth Tools
          </div>
          <div className="font-[family-name:var(--font-mono)] text-[8.5px] uppercase tracking-[0.14em] text-[var(--color-accent3)]/70">
            Backoffice · Plataforma
          </div>
        </div>
        <div className="flex items-center gap-3">
          <span className="hidden text-[12px] text-white/50 sm:inline">
            {name}
          </span>
          <PlatformSignOut />
        </div>
      </header>
      <main className="mx-auto max-w-5xl px-4 py-8 sm:px-6">{children}</main>
    </div>
  );
}
