"use client";

import Link from "next/link";
import Image from "next/image";
import { usePathname } from "next/navigation";
import { useState, useTransition } from "react";
import type { Project, Version } from "@/lib/context";
import { setActiveProject, setActiveVersion } from "@/lib/actions/context";
import { duplicateVersion } from "@/lib/actions/versions";
import { hasLevel, type AccessLevel } from "@/lib/permissions";

interface NavItem {
  href: string;
  label: string;
  badge?: number;
}
interface NavSection {
  title: string;
  /** chave de permissão da seção. */
  permKey: string;
  items: NavItem[];
}

export interface SidebarProps {
  logoUrl: string | null;
  tenantName: string;
  project: Project;
  projects: Project[];
  version: Version;
  versions: Version[];
  userName: string;
  userRole: string;
  perms: Record<string, AccessLevel>;
  badges: { unidades: number; reembolso: number; permuta: number };
}

export function Sidebar({
  logoUrl,
  tenantName,
  project,
  projects,
  version,
  versions,
  userName,
  userRole,
  perms,
  badges,
}: SidebarProps) {
  const pathname = usePathname();
  const [pending, startTransition] = useTransition();
  const [open, setOpen] = useState(false);
  const close = () => setOpen(false);

  const allSections: NavSection[] = [
    {
      title: "Módulo Receitas",
      permKey: "receitas",
      items: [
        { href: "/unidades", label: "Unidades", badge: badges.unidades },
        { href: "/simulador", label: "Simulador" },
        { href: "/reembolso", label: "Reembolso", badge: badges.reembolso },
        { href: "/permuta", label: "Permuta", badge: badges.permuta },
        { href: "/parametros", label: "Parâmetros / INCC" },
      ],
    },
    {
      title: "Módulo Despesas",
      permKey: "despesas",
      items: [
        { href: "/despesas", label: "Lançamentos" },
        { href: "/fornecedores", label: "Fornecedores" },
        { href: "/planocontas", label: "Plano de Contas" },
      ],
    },
    {
      title: "Reports & Dashboards",
      permKey: "reports",
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
      permKey: "config",
      items: [
        { href: "/empresa", label: "Empresa" },
        { href: "/usuarios", label: "Usuários & Acessos" },
        { href: "/contabilidade", label: "Acesso Contabilidade" },
      ],
    },
  ];

  // Mostra só as seções em que o usuário tem ao menos visualização.
  const sections = allSections.filter((s) => hasLevel(perms, s.permKey, "view"));

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
        {logoUrl ? (
          <Image
            src={logoUrl}
            alt={tenantName}
            width={160}
            height={40}
            unoptimized
            className="mb-1 max-h-10 w-auto object-contain"
          />
        ) : (
          <div className="font-[family-name:var(--font-serif)] text-[15px]">
            Growth Tools
          </div>
        )}
        <div className="mt-0.5 font-[family-name:var(--font-mono)] text-[9px] uppercase tracking-[0.12em] text-white/30">
          Construction App
        </div>
      </div>

      <div className="border-b border-white/10 px-4 py-3">
        <div className="font-[family-name:var(--font-mono)] text-[8.5px] uppercase tracking-[0.12em] text-white/25">
          Empresa
        </div>
        <div className="text-[13px] font-semibold text-white/90">
          {tenantName}
        </div>
      </div>

      {/* Seletor de projeto */}
      <div className="border-b border-white/10 px-4 py-2.5">
        <div className="font-[family-name:var(--font-mono)] text-[8.5px] uppercase tracking-[0.12em] text-white/25">
          Projeto
        </div>
        <select
          value={project.id}
          disabled={pending}
          onChange={(e) =>
            startTransition(() => setActiveProject(e.target.value))
          }
          className="mt-1 w-full rounded-[8px] border border-white/10 bg-white/5 px-2 py-1 text-[12.5px] text-white outline-none"
        >
          {projects.map((p) => (
            <option key={p.id} value={p.id} className="text-black">
              {p.name}
            </option>
          ))}
        </select>
      </div>

      {/* Seletor de versão */}
      <div className="border-b border-white/10 px-4 py-2.5">
        <div className="font-[family-name:var(--font-mono)] text-[8.5px] uppercase tracking-[0.12em] text-white/25">
          Versão ativa
        </div>
        <div className="mt-1.5 flex flex-col gap-1">
          {versions.map((v) => {
            const active = v.id === version.id;
            return (
              <button
                key={v.id}
                disabled={pending}
                onClick={() =>
                  startTransition(() => setActiveVersion(v.id))
                }
                className={`flex items-center gap-2 rounded-[8px] px-2 py-1.5 text-left text-[12px] transition-colors ${
                  active
                    ? "bg-[var(--color-accent2)]/20 text-white"
                    : "text-white/50 hover:bg-white/5 hover:text-white/85"
                }`}
              >
                <span
                  className="inline-block h-2.5 w-2.5 rounded-full"
                  style={{ background: v.color }}
                />
                {v.label}
              </button>
            );
          })}
        </div>
        {versions.length < 6 && (
          <button
            disabled={pending}
            onClick={() => {
              const label = window.prompt(
                "Nome da nova versão:",
                `Cópia de ${version.label}`,
              );
              if (label)
                startTransition(() => duplicateVersion(version.id, label));
            }}
            className="mt-1.5 flex w-full items-center gap-1.5 rounded-[8px] border border-dashed border-white/15 px-2 py-1.5 text-[11px] text-white/40 transition-colors hover:border-white/30 hover:text-white/70 disabled:opacity-50"
          >
            + Nova versão (duplicar atual)
          </button>
        )}
        <div className="mt-1 font-[family-name:var(--font-mono)] text-[9.5px] text-white/20">
          {versions.length}/6 versões
        </div>
      </div>

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
        <div className="flex items-center gap-2 px-1 py-1">
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
        </div>
      </div>
      </aside>
    </>
  );
}
