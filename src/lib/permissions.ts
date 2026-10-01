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

export type Modulo =
  | "Planejamento"
  | "Receitas"
  | "Despesas"
  | "Conciliação de Caixa"
  | "Reports"
  | "Backup"
  | "Config";

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
  { id: "caixa", label: "Controle de Caixa", modulo: "Conciliação de Caixa" },
  { id: "fechamento", label: "Fechamento de Caixa", modulo: "Conciliação de Caixa" },
  { id: "balancodia", label: "Balanço do Dia", modulo: "Reports" },
  { id: "dre", label: "DRE", modulo: "Reports" },
  { id: "fluxocaixa", label: "Fluxo de Caixa", modulo: "Reports" },
  { id: "medicao", label: "Medição de Obra", modulo: "Reports" },
  { id: "resumo", label: "Resumo Executivo", modulo: "Reports" },
  { id: "unidades", label: "Unidades / Dados de Venda", modulo: "Receitas" },
  { id: "budget", label: "Lançamento Budget", modulo: "Planejamento" },
  { id: "forecast", label: "Lançamento Forecast", modulo: "Planejamento" },
  { id: "clientes", label: "Clientes (Compradores)", modulo: "Receitas" },
  // Permissão de CAMPO, não de rota (Prompt M, 5.4 · BM-3): renda, FGTS, score,
  // restrições, estado civil e inteligência de mercado do comprador. Nasce só
  // com owner e admin — ver TELAS_SENSIVEIS.
  { id: "clientesdados", label: "Clientes — dados financeiros e de perfil", modulo: "Receitas" },
  { id: "contasreceber", label: "Contas a Receber", modulo: "Receitas" },
  { id: "medicaolanc", label: "Lançamento de Medição", modulo: "Despesas" },
  { id: "simulador", label: "Simulador", modulo: "Receitas" },
  // O `id` continua "reembolso" DE PROPÓSITO: ele é a chave gravada em
  // `membership.permissions` e o primeiro segmento da rota. Trocar o id
  // órfãozaria toda permissão já salva — o rótulo é o que mudou de nome.
  { id: "reembolso", label: "Liberações de Obra", modulo: "Receitas" },
  { id: "permuta", label: "Inventário de Permuta", modulo: "Receitas" },
  { id: "parametros", label: "Parâmetros / INCC", modulo: "Receitas" },
  { id: "despesas", label: "Lançamentos de Despesas", modulo: "Despesas" },
  { id: "contaspagar", label: "Contas a Pagar", modulo: "Despesas" },
  { id: "restituicoes", label: "Ressarcimentos (pago por terceiro)", modulo: "Despesas" },
  { id: "cartoes", label: "Cartões de Crédito", modulo: "Despesas" },
  { id: "fornecedores", label: "Fornecedores & Stakeholders", modulo: "Despesas" },
  { id: "planocontas", label: "Plano de Contas", modulo: "Planejamento" },
  { id: "contas", label: "Contas Correntes", modulo: "Despesas" },
  { id: "estoque", label: "Controle de Estoques", modulo: "Despesas" },
  { id: "ponto", label: "Controle de Ponto", modulo: "Despesas" },
  { id: "backup", label: "Backup & Arquivamento", modulo: "Backup" },
  { id: "usuarios", label: "Usuários & Acessos", modulo: "Config" },
  { id: "acessos", label: "Gestão de Acessos", modulo: "Config" },
  { id: "acoes", label: "Log de Auditoria", modulo: "Config" },
  { id: "contabilidade", label: "Acesso Contabilidade", modulo: "Config" },
  { id: "empresa", label: "Empresa", modulo: "Config" },
  { id: "projeto", label: "Projetos", modulo: "Config" },
  { id: "numeracao", label: "Numeração de Despesas", modulo: "Config" },
  // Chaves de mudança por empresa (B4): ligar muda número ou acesso em
  // produção. Só owner e admin, qualquer que seja o override.
  { id: "chaves", label: "Chaves de mudança", modulo: "Config" },
  { id: "versao", label: "Configuração da Versão", modulo: "Config" },
  { id: "diagnosticoia", label: "Diagnóstico de IA", modulo: "Config" },
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

/**
 * Telas do `membro` no padrão NOVO (Prompt AJ, Parte 1 · decisão BAJ-2 =
 * "lançamento + receita", 28/09/2026): ver, criar e editar; excluir fica com
 * owner e admin. Critério POSITIVO — tela que não está aqui nasce negada para
 * o membro, inclusive toda tela nova de `SCREENS` (1.5).
 *
 * "Medição" entra com as duas rotas (relatório e lançamento): o Prompt V as
 * funde num item só, e hoje o membro já alcança as duas.
 */
export const MEMBRO_TELAS = new Set([
  "despesas",
  "contaspagar",
  "fornecedores",
  "caixa",
  "contas",
  "medicao",
  "medicaolanc",
  "clientes",
  "unidades",
  "contasreceber",
  "permuta",
]);

/**
 * Telas restritas a owner e admin, qualquer que seja o override (Prompt AJ,
 * Parte 3 = Prompt AI, Parte 0). Quem alcança Usuários troca papéis; quem
 * alcança Gestão de Acessos concede telas — inclusive a si mesmo; quem alcança
 * Chaves de mudança liga regra nova para a empresa inteira (B4).
 */
export const TELAS_SO_ADMIN = new Set(["usuarios", "acessos", "chaves"]);

/**
 * Telas que nenhum padrão de papel concede além de owner/admin — mas que,
 * diferente de TELAS_SO_ADMIN, podem ser dadas a alguém por override na Gestão
 * de Acessos (BM-3: "quem recebe a permissão nova por padrão: só owner e
 * admin").
 */
export const TELAS_SENSIVEIS = new Set(["clientesdados"]);

export interface OpcoesPermissao {
  /**
   * Padrão novo do `membro` ligado para o tenant (chave por tenant, AJ 1.4).
   * Desligado = comportamento de antes, célula por célula.
   */
  membroRestrito?: boolean;
}

/** Permissões padrão por perfil (role). */
export function defaultPermissions(role: Role, opts: OpcoesPermissao = {}): PermMatrix {
  const out: PermMatrix = {};
  for (const s of SCREENS) {
    if (role === "owner" || role === "admin") {
      out[s.id] = { ...FULL };
    } else if (TELAS_SENSIVEIS.has(s.id)) {
      out[s.id] = { ...NONE };
    } else if (role === "membro") {
      if (opts.membroRestrito) {
        out[s.id] = MEMBRO_TELAS.has(s.id) ? { ...EDIT } : { ...NONE };
      } else {
        // Padrão ANTIGO (critério negativo): tudo fora de Config com EDIT.
        // Vale enquanto a chave do tenant estiver desligada.
        out[s.id] = s.modulo === "Config" ? { ...NONE } : { ...EDIT };
      }
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

/**
 * Permissões efetivas: overrides do membro (se houver) por tela, senão
 * default — e, POR ÚLTIMO, o clamp de papel (AJ 3.1 e 3.3):
 *  - owner e admin: acesso total, mesmo com override restritivo gravado (o
 *    que a matriz sempre prometeu passa a ser verdade no módulo);
 *  - demais papéis: Usuários e Gestão de Acessos negadas, mesmo com override.
 */
export function effectivePermissions(
  role: Role,
  overrides?: PermMatrix | null,
  opts: OpcoesPermissao = {},
): PermMatrix {
  const base = defaultPermissions(role, opts);
  if (overrides) {
    for (const s of SCREENS) {
      const o = overrides[s.id];
      if (o) base[s.id] = { ...base[s.id], ...o };
    }
  }
  const total = role === "owner" || role === "admin";
  for (const s of SCREENS) {
    if (total) base[s.id] = { ...FULL };
    else if (TELAS_SO_ADMIN.has(s.id)) base[s.id] = { ...NONE };
  }
  return base;
}

/**
 * O que gravar como override (AJ, Parte 2): só as telas que divergem do
 * padrão do papel EM VIGOR no tenant. Tela igual ao padrão volta a ser
 * governada pelo papel — inclusive quando o padrão mudar (é assim que a Parte 1
 * alcança quem já salvou a matriz).
 *
 * Um cuidado a mais, só enquanto convivem os dois padrões do membro: uma NEGAÇÃO
 * que o admin viu também é gravada se o outro padrão a concederia. Sem isso,
 * salvar "DRE negada" com a chave ligada não gravaria nada (igual ao padrão
 * novo), e desligar a chave devolveria a DRE — ampliar o que o admin decidiu.
 * O inverso (concessão igual ao padrão antigo) NÃO é gravado: some ao ligar a
 * chave, que é exatamente o efeito aprovado na prévia.
 */
export function overridesDivergentes(
  role: Role,
  matriz: PermMatrix,
  opts: OpcoesPermissao = {},
): PermMatrix {
  const vigente = defaultPermissions(role, opts);
  const outro = defaultPermissions(role, { membroRestrito: !opts.membroRestrito });
  const acoes: PermAction[] = ["ver", "criar", "editar", "excluir"];
  const out: PermMatrix = {};
  for (const s of SCREENS) {
    const m = matriz[s.id];
    if (!m) continue;
    const difereDoVigente = acoes.some((a) => m[a] !== vigente[s.id][a]);
    const negaOQueOOutroDaria = acoes.some((a) => !m[a] && outro[s.id][a]);
    if (!difereDoVigente && !negaOQueOOutroDaria) continue;
    out[s.id] = { ver: m.ver, criar: m.criar, editar: m.editar, excluir: m.excluir };
  }
  return out;
}

/**
 * Validação do payload da Gestão de Acessos no servidor (AJ, Parte 4): chave
 * fora de `SCREENS`, valor não booleano, ação sem "ver" e concessão de tela
 * restrita a owner/admin são recusados. Devolve a mensagem, ou null se ok.
 */
export function validarMatriz(payload: unknown): string | null {
  if (!payload || typeof payload !== "object" || Array.isArray(payload)) {
    return "Matriz de permissões inválida.";
  }
  const ids = new Set(SCREEN_IDS);
  for (const [tela, v] of Object.entries(payload as Record<string, unknown>)) {
    if (!ids.has(tela)) return `Tela desconhecida: "${tela}".`;
    if (!v || typeof v !== "object") return `Permissão inválida em "${tela}".`;
    const p = v as Record<string, unknown>;
    for (const k of Object.keys(p)) {
      if (!["ver", "criar", "editar", "excluir"].includes(k)) return `Ação desconhecida em "${tela}": "${k}".`;
    }
    for (const a of ["ver", "criar", "editar", "excluir"]) {
      if (typeof p[a] !== "boolean") return `Valor não booleano em "${tela}.${a}".`;
    }
    if (!p.ver && (p.criar || p.editar || p.excluir)) {
      return `"${tela}": criar, editar ou excluir exigem "ver".`;
    }
    if (TELAS_SO_ADMIN.has(tela) && (p.ver || p.criar || p.editar || p.excluir)) {
      return `"${tela}" é exclusiva de owner e admin e não pode ser concedida por override.`;
    }
  }
  return null;
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
