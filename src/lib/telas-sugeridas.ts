/**
 * Prompt AI2 (Fase 3 · revisão V5): "ao escolher o papel do usuário novo,
 * sugerir as telas, editável". Módulo PURO.
 *
 * A sugestão é o padrão do papel EM VIGOR na empresa (com a chave do membro
 * como estiver). A pessoa desmarca ou marca telas; o que diverge do padrão
 * vira override, pelo mesmo caminho da Gestão de Acessos
 * (`overridesDivergentes`). Fora da lista: telas só de owner/admin, só da
 * plataforma, telas de dado sensível (ficam na Gestão de Acessos, ação por
 * ação) e telas que acompanham outra.
 */
import type { Role } from "@/lib/context";
import {
  HERDA_DE,
  SCREENS,
  TELAS_SENSIVEIS,
  TELAS_SO_ADMIN,
  TELAS_SO_PLATAFORMA,
  defaultPermissions,
  temTetoDeLeitura,
  type OpcoesPermissao,
  type PermMatrix,
} from "@/lib/permissions";

export interface TelaSugerida {
  id: string;
  label: string;
  modulo: string;
  /** O papel alcança a tela por padrão. */
  sugerida: boolean;
}

/** Owner e admin têm acesso total: não há o que escolher. */
export const acessoTotal = (role: Role) => role === "owner" || role === "admin";

export function telasConfiguraveis() {
  return SCREENS.filter((s) => !TELAS_SO_ADMIN.has(s.id) && !TELAS_SO_PLATAFORMA.has(s.id) && !TELAS_SENSIVEIS.has(s.id) && !HERDA_DE[s.id]);
}

export function telasSugeridas(role: Role, opts: OpcoesPermissao = {}): TelaSugerida[] {
  if (acessoTotal(role)) return [];
  const padrao = defaultPermissions(role, opts);
  return telasConfiguraveis().map((s) => ({ id: s.id, label: s.label, modulo: s.modulo, sugerida: !!padrao[s.id]?.ver }));
}

/**
 * A matriz que a escolha representa: tela marcada que o padrão já dá fica
 * como o padrão; marcada que o padrão não dá ganha ver (e, fora do contador,
 * criar e editar; excluir só pela Gestão de Acessos); desmarcada fica sem
 * acesso. Telas fora da lista ficam como o padrão.
 */
export function matrizDaEscolha(role: Role, escolhidas: ReadonlySet<string>, opts: OpcoesPermissao = {}): PermMatrix {
  const padrao = defaultPermissions(role, opts);
  const out: PermMatrix = {};
  const leitura = temTetoDeLeitura(role);
  for (const s of telasConfiguraveis()) {
    const p = padrao[s.id];
    if (escolhidas.has(s.id)) out[s.id] = p.ver ? { ...p } : { ver: true, criar: !leitura, editar: !leitura, excluir: false };
    else out[s.id] = { ver: false, criar: false, editar: false, excluir: false };
  }
  return out;
}

/** Lê a escolha enviada pelo formulário (lista de ids separados por vírgula); id desconhecido cai. */
export function lerEscolha(bruto: unknown): Set<string> | null {
  if (typeof bruto !== "string") return null;
  const validos = new Set(telasConfiguraveis().map((s) => s.id));
  return new Set(bruto.split(",").map((s) => s.trim()).filter((s) => validos.has(s)));
}
