"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { signOut } from "next-auth/react";
import { useState } from "react";
import { can, type PermMatrix } from "@/lib/permissions";

interface NavItem {
  href: string;
  label: string;
  badge?: number;
}
interface NavSection {
  title: string;
  items: NavItem[];
}

export interface SidebarProps {
  tenantName: string;
  userName: string;
  userRole: string;
  perms: PermMatrix;
  badges: { unidades: number; reembolso: number; permuta: number };
}

export function Sidebar({
  tenantName,
  userName,
  userRole,
  perms,
  badges,
}: SidebarProps) {
  const pathname = usePathname();
  const [open, setOpen] = useState(false);
  const close = () => setOpen(false);

  const allSections: NavSection[] = [
    {
      title: "Módulo Receitas",
      items: [
        { href: "/unidades", label: "Unidades / Vendas", badge: badges.unidades },
        { href: "/budget", label: "Lançamento Budget" },
        { href: "/forecast", label: "Lançamento Forecast" },
        { href: "/clientes", label: "Clientes (Compradores)" },
        { href: "/simulador", label: "Simulador" },
        { href: "/reembolso", label: "Reembolso", badge: badges.reembolso },
        { href: "/permuta", label: "Permuta", badge: badges.permuta },
        { href: "/parametros", label: "Parâmetros / INCC" },
      ],
    },
    {
      title: "Módulo Despesas",
      items: [
        { href: "/despesas", label: "Despesas / Lançamentos" },
        { href: "/restituicoes", label: "Restituições" },
        { href: "/medicaolanc", label: "Lançamento de Medição" },
        { href: "/fornecedores", label: "Fornecedores" },
        { href: "/contas", label: "Contas Correntes" },
        { href: "/planocontas", label: "Plano de Contas" },
      ],
    },
    {
      title: "Reports & Dashboards",
      items: [
        { href: "/dashboard", label: "Dashboard" },
        { href: "/projecao", label: "Projeção de Receitas" },
        { href: "/consolidado", label: "Consolidado" },
        { href: "/caixa", label: "Caixa" },
        { href: "/dre", label: "DRE" },
        { href: "/fluxocaixa", label: "Fluxo de Caixa" },
        { href: "/medicao", label: "Medição de Obra" },
        { href: "/rolling", label: "Rolling Forecast" },
        { href: "/resumo", label: "Resumo Executivo" },
      ],
    },
    {
      title: "Config",
      items: [
        { href: "/projeto", label: "Projetos" },
        { href: "/numeracao", label: "Numeração de Despesas" },
        { href: "/empresa", label: "Empresa" },
        { href: "/usuarios", label: "Usuários & Acessos" },
        { href: "/acessos", label: "Gestão de Acessos" },
        { href: "/acoes", label: "Log de Auditoria" },
        { href: "/contabilidade", label: "Acesso Contabilidade" },
      ],
    },
  ];

  // Mostra só os itens com permissão de "Ver"; oculta seções vazias.
  const sections = allSections
    .map((s) => ({
      ...s,
      items: s.items.filter((it) => can(perms, it.href.replace(/^\//, ""), "ver")),
    }))
    .filter((s) => s.items.length > 0);

  return (
    <>
      {/* Barra superior mobile com hambúrguer */}
      <div className="fixed inset-x-0 top-0 z-40 flex h-14 items-center gap-3 border-b border-white/10 bg-[var(--color-ink)] px-4 lg:hidden">
        <button
          onClick={() => setOpen((o) => !o)}
          aria-label="Menu"
          className="flex h-9 w-9 items-center justify-center rounded-[8px] text-white hover:bg-white/10"
        >
          <span className="text-xl leading-none">≡</span>
        </button>
        <span className="font-[family-name:var(--font-serif)] text-sm text-white">
          {tenantName}
        </span>
      </div>

      {/* Backdrop do drawer */}
      {open && (
        <div
          onClick={close}
          className="fixed inset-0 z-40 bg-black/40 lg:hidden"
        />
      )}

      <aside
        className={`fixed inset-y-0 left-0 z-50 flex w-[238px] min-w-[238px] flex-col overflow-y-auto bg-[var(--color-ink)] text-white transition-transform duration-200 lg:static lg:translate-x-0 ${
          open ? "translate-x-0" : "-translate-x-full"
        }`}
      >
      <div className="border-b border-white/10 px-4 py-4">
        <div className="font-[family-name:var(--font-serif)] text-[15px]">
          Growth Tools
        </div>
        <div className="mt-0.5 font-[family-name:var(--font-mono)] text-[9px] uppercase tracking-[0.12em] text-white/30">
          Construction App
        </div>
      </div>

      <Link
        href="/empresa"
        onClick={close}
        className="block border-b border-white/10 px-4 py-3 hover:bg-white/5"
        title="Editar empresa"
      >
        <div className="font-[family-name:var(--font-mono)] text-[8.5px] uppercase tracking-[0.12em] text-white/25">
          Empresa
        </div>
        <div className="flex items-center gap-1.5 text-[13px] font-semibold text-white/90">
          {tenantName}
          <span className="text-[10px] text-white/40">✎</span>
        </div>
      </Link>

      <nav className="flex-1 py-1">
        {sections.map((sec) => (
          <div key={sec.title}>
            <div className="px-4 pb-1 pt-3 font-[family-name:var(--font-mono)] text-[8.5px] uppercase tracking-[0.12em] text-white/20">
              {sec.title}
            </div>
            {sec.items.map((it) => {
              const active = pathname === it.href;
              return (
                <Link
                  key={it.href}
                  href={it.href}
                  onClick={close}
                  className={`flex items-center gap-2 border-l-2 px-4 py-2 text-[12.5px] transition-colors ${
                    active
                      ? "border-[var(--color-accent2)] bg-[var(--color-accent2)]/20 text-white"
                      : "border-transparent text-white/50 hover:bg-white/5 hover:text-white/85"
                  }`}
                >
                  <span className="flex-1">{it.label}</span>
                  {it.badge != null && it.badge > 0 && (
                    <span className="rounded-full bg-[var(--color-accent2)]/30 px-1.5 py-0.5 font-[family-name:var(--font-mono)] text-[10px] text-[var(--color-accent3)]">
                      {it.badge}
                    </span>
                  )}
                </Link>
              );
            })}
          </div>
        ))}
      </nav>

      <div className="mt-auto border-t border-white/10 p-3">
        <Link
          href="/perfil"
          onClick={close}
          className="flex items-center gap-2 rounded-[8px] px-1 py-1 hover:bg-white/5"
        >
          <div className="flex h-7 w-7 items-center justify-center rounded-full bg-[var(--color-accent2)]/40 text-[10px] font-semibold">
            {userName.slice(0, 2).toUpperCase()}
          </div>
          <div>
            <div className="text-[12px] font-medium text-white/75">
              {userName}
            </div>
            <div className="font-[family-name:var(--font-mono)] text-[9px] text-white/30">
              {userRole}
            </div>
          </div>
        </Link>
        <button
          onClick={async () => {
            // Redirect no cliente (relativo): atrás do proxy, o callbackUrl
            // resolvido no servidor apontava para o host interno (0.0.0.0).
            await signOut({ redirect: false });
            window.location.href = "/login";
          }}
          className="mt-1 w-full rounded-[8px] px-2 py-1.5 text-left text-[11px] text-white/40 hover:bg-white/5 hover:text-white/70"
        >
          Sair
        </button>
      </div>
      </aside>
    </>
  );
}
