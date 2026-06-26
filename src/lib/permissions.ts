import type { Role } from "@/lib/context";

/**
 * Permissões por seção do app (perfil de acesso).
 *
 * Cada membership tem um `role` (perfil) que define permissões padrão por
 * seção; um admin pode sobrescrever por membro via `membership.permissions`.
 * Níveis: "none" (sem acesso) < "view" (somente leitura) < "edit" (edita).
 */

export type AccessLevel = "none" | "view" | "edit";

export interface Section {
  key: string;
  label: string;
  /** rotas (sem barra) que pertencem à seção. */
  routes: string[];
}

/** Seções de permissão (alinhadas aos grupos da sidebar). */
export const SECTIONS: Section[] = [
  {
    key: "receitas",
    label: "Receitas",
    routes: ["unidades", "simulador", "reembolso", "permuta", "parametros"],
  },
  {
    key: "despesas",
    label: "Despesas",
    routes: ["despesas", "fornecedores", "planocontas"],
  },
  {
    key: "reports",
    label: "Reports & Dashboards",
    routes: [
      "dashboard",
      "projecao",
      "consolidado",
      "caixa",
      "dre",
      "fluxocaixa",
      "medicao",
      "rolling",
      "resumo",
    ],
  },
  {
    key: "config",
    label: "Config",
    routes: ["usuarios", "contabilidade", "empresa"],
  },
];

const LEVEL_RANK: Record<AccessLevel, number> = { none: 0, view: 1, edit: 2 };

/** Permissões padrão por perfil (role). */
export function defaultPermissions(role: Role): Record<string, AccessLevel> {
  switch (role) {
    case "owner":
    case "admin":
      return { receitas: "edit", despesas: "edit", reports: "edit", config: "edit" };
    case "membro":
      return { receitas: "edit", despesas: "edit", reports: "view", config: "none" };
    case "contador":
      return { receitas: "view", despesas: "view", reports: "view", config: "none" };
  }
}

/** Permissões efetivas: defaults do role + overrides do membership. */
export function effectivePermissions(
  role: Role,
  overrides?: Record<string, string> | null,
): Record<string, AccessLevel> {
  const base = defaultPermissions(role);
  if (!overrides) return base;
  for (const s of SECTIONS) {
    const v = overrides[s.key];
    if (v === "none" || v === "view" || v === "edit") base[s.key] = v;
  }
  return base;
}

/** A seção a que uma rota pertence (ou null). */
export function sectionOfRoute(route: string): string | null {
  const r = route.replace(/^\//, "");
  return SECTIONS.find((s) => s.routes.includes(r))?.key ?? null;
}

/** Tem pelo menos o nível pedido na seção? */
export function hasLevel(
  perms: Record<string, AccessLevel>,
  section: string,
  needed: AccessLevel,
): boolean {
  const have = perms[section] ?? "none";
  return LEVEL_RANK[have] >= LEVEL_RANK[needed];
}
