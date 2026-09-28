"use client";

import { useCallback, useState } from "react";
import type { PermMatrix } from "@/lib/permissions";
import type { NavBadges } from "@/lib/nav-menu";
import { Sidebar } from "@/components/app/sidebar";
import { AppHeader } from "@/components/app/app-header";

/**
 * Moldura V2: barra lateral fixa + cabeçalho fixo; só o conteúdo rola.
 * O único estado aqui é o drawer do celular, compartilhado pelo botão do
 * cabeçalho e pela barra lateral.
 */
export function AppShell({
  tenantName,
  logoUrl,
  userName,
  userRole,
  perms,
  badges,
  children,
}: {
  tenantName: string;
  logoUrl: string | null;
  userName: string;
  userRole: string;
  perms: PermMatrix;
  badges: NavBadges;
  children: React.ReactNode;
}) {
  const [mobileOpen, setMobileOpen] = useState(false);
  const closeMobile = useCallback(() => setMobileOpen(false), []);

  return (
    <div className="flex h-screen overflow-hidden">
      <Sidebar
        perms={perms}
        badges={badges}
        mobileOpen={mobileOpen}
        onCloseMobile={closeMobile}
      />
      <div className="flex min-w-0 flex-1 flex-col">
        <AppHeader
          tenantName={tenantName}
          logoUrl={logoUrl}
          userName={userName}
          userRole={userRole}
          onOpenMenu={() => setMobileOpen(true)}
        />
        <main className="flex-1 overflow-y-auto">{children}</main>
      </div>
    </div>
  );
}
