"use client";

import Image from "next/image";
import Link from "next/link";
import { signOut } from "next-auth/react";
import { useEffect, useRef, useState } from "react";
import { ChevronDown, LogOut, Menu, UserRound } from "lucide-react";
import { roleLabel } from "@/lib/nav-menu";

export interface AppHeaderProps {
  tenantName: string;
  logoUrl: string | null;
  userName: string;
  userRole: string;
  onOpenMenu: () => void;
}

/**
 * Cabeçalho da moldura V2. Mostra a empresa (sem trocar de tenant — B-C3, por
 * isso sem chevron) e o usuário REAL da sessão. Busca, notificações e ajuda do
 * mockup ficam fora (B-C2). Perfil e Sair ficam a dois cliques: avatar → item.
 */
export function AppHeader({ tenantName, logoUrl, userName, userRole, onOpenMenu }: AppHeaderProps) {
  const [menuOpen, setMenuOpen] = useState(false);
  const boxRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!menuOpen) return;
    const onDown = (e: MouseEvent) => {
      if (boxRef.current && !boxRef.current.contains(e.target as Node)) setMenuOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setMenuOpen(false);
    };
    document.addEventListener("mousedown", onDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [menuOpen]);

  const initials =
    userName
      .split(/\s+/)
      .filter(Boolean)
      .slice(0, 2)
      .map((p) => p[0])
      .join("")
      .toUpperCase() || "?";

  return (
    <header className="sticky top-0 z-30 flex h-[66px] flex-none items-center gap-3 border-b border-[var(--color-line)] bg-white px-4 font-[family-name:var(--font-inter)] text-[var(--color-v2-ink)] sm:gap-[18px] sm:px-[26px] print:hidden">
      <button
        type="button"
        onClick={onOpenMenu}
        aria-label="Abrir menu"
        aria-controls="app-sidebar"
        className="grid h-9 w-9 flex-none place-items-center rounded-[9px] text-[var(--color-v2-ink2)] hover:bg-[#F2F5FA] lg:hidden"
      >
        <Menu className="h-5 w-5" aria-hidden="true" />
      </button>

      <div className="min-w-0">
        <div className="text-[11px] leading-[1.2] text-[var(--color-v2-ink3)]">Empresa</div>
        <div className="truncate text-[15px] font-semibold leading-[1.2]">{tenantName}</div>
      </div>

      <div className="ml-auto flex items-center gap-3 sm:gap-[18px]">
        {logoUrl && (
          <Image
            src={logoUrl}
            alt={tenantName}
            width={130}
            height={32}
            unoptimized
            className="hidden max-h-8 w-auto object-contain md:block"
          />
        )}
        {logoUrl && <div className="hidden h-[26px] w-px bg-[var(--color-line)] md:block" />}

        <div ref={boxRef} className="relative">
          <button
            type="button"
            onClick={() => setMenuOpen((o) => !o)}
            aria-haspopup="menu"
            aria-expanded={menuOpen}
            className="flex items-center gap-2.5 rounded-[9px] px-1 py-1 outline-none hover:bg-[#F2F5FA] focus-visible:ring-2 focus-visible:ring-[var(--color-brand-soft)]"
          >
            <span className="grid h-9 w-9 flex-none place-items-center rounded-full bg-[var(--color-brand)] text-[13px] font-bold tracking-[0.5px] text-white">
              {initials}
            </span>
            <span className="hidden text-left sm:block">
              <span className="block max-w-[180px] truncate text-[14px] font-semibold leading-[1.25]">
                {userName}
              </span>
              <span className="block text-[11.5px] leading-[1.25] text-[var(--color-v2-ink3)]">
                {roleLabel(userRole)}
              </span>
            </span>
            <ChevronDown className="h-[15px] w-[15px] text-[var(--color-v2-ink3)]" strokeWidth={2.2} aria-hidden="true" />
          </button>

          {menuOpen && (
            <div
              role="menu"
              className="absolute right-0 top-[calc(100%+6px)] z-50 w-52 overflow-hidden rounded-[10px] border border-[var(--color-line)] bg-white py-1 shadow-[0_1px_2px_rgba(22,35,59,.05),0_6px_18px_rgba(22,35,59,.08)]"
            >
              <div className="border-b border-[var(--color-line)] px-3 py-2 sm:hidden">
                <div className="truncate text-[13px] font-semibold">{userName}</div>
                <div className="text-[11.5px] text-[var(--color-v2-ink3)]">{roleLabel(userRole)}</div>
              </div>
              <Link
                href="/perfil"
                role="menuitem"
                onClick={() => setMenuOpen(false)}
                className="flex items-center gap-2 px-3 py-2 text-[13.5px] hover:bg-[#F2F5FA]"
              >
                <UserRound className="h-4 w-4 text-[var(--color-v2-ink2)]" aria-hidden="true" />
                Meu perfil
              </Link>
              <button
                type="button"
                role="menuitem"
                onClick={async () => {
                  // Redirect no cliente (relativo): atrás do proxy, o callbackUrl
                  // resolvido no servidor apontava para o host interno (0.0.0.0).
                  await signOut({ redirect: false });
                  window.location.href = "/login";
                }}
                className="flex w-full items-center gap-2 px-3 py-2 text-left text-[13.5px] hover:bg-[#F2F5FA]"
              >
                <LogOut className="h-4 w-4 text-[var(--color-v2-ink2)]" aria-hidden="true" />
                Sair
              </button>
            </div>
          )}
        </div>
      </div>
    </header>
  );
}
