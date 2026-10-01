import { can, type PermMatrix } from "@/lib/permissions";

/**
 * Menu da moldura V2 (Prompt C): módulos → subitens.
 *
 * É SÓ apresentação. A rota de cada item é a de sempre (seção 22 do Prompt C:
 * rótulo muda, URL não), e a permissão é a mesma chave de `SCREENS` que a
 * página já verifica no servidor. Esconder item aqui é conveniência — o
 * controle de acesso continua no layout (`screenIdOfPath`) e em cada página.
 *
 * Os agrupamentos NÃO se confundem com `Screen.modulo` em permissions.ts: lá o
 * módulo decide o padrão de permissão por papel (ex.: membro não vê "Config");
 * aqui decide só onde o item aparece. Mover um item de módulo neste arquivo não
 * muda quem o enxerga.
 */

export type ModuleIcon =
  | "bi"
  | "planejamento"
  | "receitas"
  | "despesas"
  | "caixa"
  | "obra"
  | "config";

export interface NavItem {
  href: string;
  label: string;
  /**
   * Chave de permissão (id em `SCREENS`), quando não coincide com o primeiro
   * segmento da rota. As conferências de /diagnostico reaproveitam as
   * permissões de Despesas e Unidades, como já faziam no menu antigo.
   */
  perm?: string;
}

export interface NavModule {
  id: string;
  label: string;
  icon: ModuleIcon;
  items: NavItem[];
}

/**
 * Ordem dos módulos e rótulos seguem o mockup V2. Telas que o mockup desenha
 * mas que ainda não existem (Relatórios customizados, Assistente, Notas
 * Fiscais, Cartões de Crédito, Pessoas) não entram: o menu não cria tela.
 * Telas que existem e o mockup não mostra (Consolidado, Projeção, Balanço do
 * Dia, Fechamento, Acerto, Ponto, Acesso do contador) continuam aqui até o
 * prompt dono de cada uma decidir — tirar do menu seria perder a tela.
 */
export const NAV_MENU: NavModule[] = [
  {
    id: "bi",
    label: "Business Intelligence",
    icon: "bi",
    items: [
      { href: "/dashboard", label: "Dashboard" },
      { href: "/dre", label: "DRE" },
      { href: "/fluxocaixa", label: "Fluxo de Caixa" },
      { href: "/resumo", label: "Resumo Executivo" },
      { href: "/consolidado", label: "Consolidado" },
      { href: "/diagnosticoia", label: "Diagnóstico de IA" },
    ],
  },
  {
    id: "planejamento",
    label: "Planejamento",
    icon: "planejamento",
    items: [
      { href: "/projeto", label: "Projetos" },
      { href: "/budget", label: "Orçamentos" },
      { href: "/forecast", label: "Previsão Atualizada" },
      { href: "/planocontas", label: "Plano de Contas" },
    ],
  },
  {
    id: "receitas",
    label: "Receitas",
    icon: "receitas",
    items: [
      { href: "/clientes", label: "Clientes" },
      { href: "/unidades", label: "Unidades" },
      { href: "/simulador", label: "Simulador" },
      { href: "/contasreceber", label: "Contas a Receber" },
      { href: "/reembolso", label: "Liberações de Obra" },
      { href: "/permuta", label: "Permuta" },
      { href: "/projecao", label: "Projeção de Receitas" },
    ],
  },
  {
    id: "despesas",
    label: "Despesas",
    icon: "despesas",
    items: [
      { href: "/despesas", label: "Despesas / Lançamentos" },
      { href: "/contaspagar", label: "Contas a Pagar" },
      { href: "/restituicoes", label: "Ressarcimentos" },
      { href: "/cartoes", label: "Cartões de Crédito" },
      // Pagamento único quitando várias despesas — governado por Despesas.
      { href: "/acerto", label: "Acerto Contábil", perm: "despesas" },
      { href: "/fornecedores", label: "Fornecedores" },
    ],
  },
  {
    id: "caixa",
    label: "Caixa",
    icon: "caixa",
    items: [
      { href: "/caixa", label: "Caixa" },
      { href: "/contas", label: "Contas Correntes" },
      { href: "/balancodia", label: "Balanço do Dia" },
    ],
  },
  {
    id: "obra",
    label: "Obra",
    icon: "obra",
    items: [
      // Duas entradas até o Prompt V fundir as telas em uma com abas.
      { href: "/medicao", label: "Medição de Obra" },
      { href: "/medicaolanc", label: "Lançamento de Medição" },
      { href: "/estoque", label: "Estoque" },
      { href: "/ponto", label: "Ponto" },
      { href: "/parametros", label: "Parâmetros / INCC" },
    ],
  },
  {
    id: "config",
    label: "Configurações",
    icon: "config",
    items: [
      { href: "/empresa", label: "Empresa" },
      { href: "/usuarios", label: "Usuários" },
      { href: "/acessos", label: "Gestão de Acessos" },
      { href: "/acoes", label: "Auditoria" },
      { href: "/numeracao", label: "Numeração de despesas" },
      { href: "/chaves", label: "Chaves de mudança" },
      { href: "/backup", label: "Backup" },
      { href: "/contabilidade", label: "Acesso do contador" },
      {
        href: "/diagnostico/categorias-invertidas",
        label: "Conferência de lançamentos",
        perm: "despesas",
      },
      {
        href: "/diagnostico/planos-recebiveis",
        label: "Conferência de planos",
        perm: "unidades",
      },
    ],
  },
];

/** Chave de permissão que governa o item. */
export function permOf(item: NavItem): string {
  return item.perm ?? item.href.replace(/^\//, "").split("/")[0];
}

/**
 * Só os itens com "ver"; módulo sem nenhum item visível some inteiro
 * (seção 21). Mesma regra do menu antigo — não amplia nem reduz acesso.
 */
export function visibleMenu(perms: PermMatrix, menu: NavModule[] = NAV_MENU): NavModule[] {
  return menu
    .map((m) => ({ ...m, items: m.items.filter((it) => can(perms, permOf(it), "ver")) }))
    .filter((m) => m.items.length > 0);
}

/**
 * O item está ativo na rota atual? Casamento por prefixo NA FRONTEIRA DE
 * SEGMENTO (seção 12): `/clientes/novo` ativa Clientes, mas `/contaspagar` não
 * ativa `/contas`, nem `/medicaolanc` ativa `/medicao`.
 */
export function isItemActive(pathname: string | null | undefined, href: string): boolean {
  if (!pathname) return false;
  return pathname === href || pathname.startsWith(href + "/");
}

/** Módulo que contém a rota atual (o que precisa ficar aberto), ou null. */
export function activeModuleId(
  pathname: string | null | undefined,
  menu: NavModule[] = NAV_MENU,
): string | null {
  for (const m of menu) {
    if (m.items.some((it) => isItemActive(pathname, it.href))) return m.id;
  }
  return null;
}

const ROLE_LABEL: Record<string, string> = {
  owner: "Proprietário",
  admin: "Administrador",
  membro: "Membro",
  contador: "Contador",
  engenheiro: "Engenheiro",
};

/** Rótulo do papel para o cabeçalho; papel desconhecido aparece como veio. */
export function roleLabel(role: string): string {
  return ROLE_LABEL[role] ?? role;
}
