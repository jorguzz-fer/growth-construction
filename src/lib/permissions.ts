import type { Role } from "@/lib/context";

/**
 * Permissões GRANULARES por tela × ação (Ver / Criar / Editar / Excluir),
 * portado do protótipo v0.4 (Gestão de Acessos). Cada membership tem um `role`
 * (perfil) que define permissões padrão; um admin pode sobrescrever por membro
 * via `membership.permissions` (matriz completa).
 */

export type PermAction = "ver" | "criar" | "editar" | "excluir";
export interface ScreenPerm {
  ver: boolean;
  criar: boolean;
  editar: boolean;
  excluir: boolean;
}
export type PermMatrix = Record<string, ScreenPerm>;

export type Modulo = "Planejamento" | "Receitas" | "Despesas" | "Reports" | "Config";

export interface Screen {
  id: string; // = primeiro segmento da rota (ex.: "unidades")
  label: string;
  modulo: Modulo;
}

/** Todas as telas governadas (rota → tela). `perfil` é pessoal e não entra aqui. */
export const SCREENS: Screen[] = [
  { id: "dashboard", label: "Dashboard", modulo: "Reports" },
  { id: "projecao", label: "Projeção de Receitas", modulo: "Reports" },
  { id: "consolidado", label: "Consolidado", modulo: "Reports" },
  { id: "caixa", label: "Controle de Caixa", modulo: "Reports" },
  { id: "fechamento", label: "Fechamento de Caixa", modulo: "Reports" },
  { id: "balancodia", label: "Balanço do Dia", modulo: "Reports" },
  { id: "dre", label: "DRE", modulo: "Reports" },
  { id: "fluxocaixa", label: "Fluxo de Caixa", modulo: "Reports" },
  { id: "medicao", label: "Medição de Obra", modulo: "Reports" },
  { id: "rolling", label: "Rolling Forecast", modulo: "Reports" },
  { id: "resumo", label: "Resumo Executivo", modulo: "Reports" },
  { id: "unidades", label: "Unidades / Dados de Venda", modulo: "Receitas" },
  { id: "budget", label: "Lançamento Budget", modulo: "Planejamento" },
  { id: "forecast", label: "Lançamento Forecast", modulo: "Planejamento" },
  { id: "clientes", label: "Clientes (Compradores)", modulo: "Receitas" },
  { id: "medicaolanc", label: "Lançamento de Medição", modulo: "Despesas" },
  { id: "simulador", label: "Simulador", modulo: "Receitas" },
  { id: "reembolso", label: "Reembolso", modulo: "Receitas" },
  { id: "permuta", label: "Inventário de Permuta", modulo: "Receitas" },
  { id: "parametros", label: "Parâmetros / INCC", modulo: "Receitas" },
  { id: "despesas", label: "Lançamentos de Despesas", modulo: "Despesas" },
  { id: "contaspagar", label: "Contas a Pagar", modulo: "Despesas" },
  { id: "restituicoes", label: "Restituições (pago por terceiro)", modulo: "Despesas" },
  { id: "fornecedores", label: "Fornecedores & Stakeholders", modulo: "Despesas" },
  { id: "planocontas", label: "Plano de Contas", modulo: "Despesas" },
  { id: "contas", label: "Contas Correntes", modulo: "Despesas" },
  { id: "estoque", label: "Controle de Estoques", modulo: "Despesas" },
  { id: "ponto", label: "Controle de Ponto", modulo: "Despesas" },
  { id: "usuarios", label: "Usuários & Acessos", modulo: "Config" },
  { id: "acessos", label: "Gestão de Acessos", modulo: "Config" },
  { id: "acoes", label: "Log de Auditoria", modulo: "Config" },
  { id: "contabilidade", label: "Acesso Contabilidade", modulo: "Config" },
  { id: "empresa", label: "Empresa", modulo: "Config" },
  { id: "projeto", label: "Projetos", modulo: "Config" },
  { id: "numeracao", label: "Numeração de Despesas", modulo: "Config" },
  { id: "versao", label: "Configuração da Versão", modulo: "Config" },
];

export const SCREEN_IDS = SCREENS.map((s) => s.id);

const NONE: ScreenPerm = { ver: false, criar: false, editar: false, excluir: false };
const VIEW: ScreenPerm = { ver: true, criar: false, editar: false, excluir: false };
const FULL: ScreenPerm = { ver: true, criar: true, editar: true, excluir: true };
const EDIT: ScreenPerm = { ver: true, criar: true, editar: true, excluir: false };

/** Telas que o perfil "contador" (somente leitura) enxerga. */
const CONTADOR_VE = new Set([
  "dre",
  "fluxocaixa",
  "medicao",
  "resumo",
  "consolidado",
  "planocontas",
  "despesas",
  "acoes",
]);

/** Permissões padrão por perfil (role). */
export function defaultPermissions(role: Role): PermMatrix {
  const out: PermMatrix = {};
  for (const s of SCREENS) {
    if (role === "owner" || role === "admin") {
      out[s.id] = { ...FULL };
    } else if (role === "membro") {
      out[s.id] = s.modulo === "Config" ? { ...NONE } : { ...EDIT };
    } else if (role === "engenheiro") {
      // engenheiro: acesso apenas ao Lançamento de Medição
      out[s.id] = s.id === "medicaolanc" ? { ...FULL } : { ...NONE };
    } else {
      // contador: somente leitura de um subconjunto
      out[s.id] = CONTADOR_VE.has(s.id) ? { ...VIEW } : { ...NONE };
    }
  }
  return out;
}

/** Permissões efetivas: overrides do membro (se houver) por tela, senão default. */
export function effectivePermissions(
  role: Role,
  overrides?: PermMatrix | null,
): PermMatrix {
  const base = defaultPermissions(role);
  if (!overrides) return base;
  for (const s of SCREENS) {
    const o = overrides[s.id];
    if (o) base[s.id] = { ...base[s.id], ...o };
  }
  return base;
}

/** O usuário pode executar `action` na `screenId`? */
export function can(
  perms: PermMatrix,
  screenId: string,
  action: PermAction,
): boolean {
  return perms[screenId]?.[action] ?? false;
}

/** Primeiro segmento da rota → id de tela (ou null se não governada). */
export function screenIdOfPath(pathname: string | null | undefined): string | null {
  if (!pathname) return null;
  const seg = pathname.replace(/^\//, "").split("/")[0];
  return SCREEN_IDS.includes(seg) ? seg : null;
}
