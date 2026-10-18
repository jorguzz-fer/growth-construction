/**
 * Prompt AK2 (Fase 3 · revisão V5): "Auditoria: o chat filtra (só o que o
 * Messias lançou)". Módulo PURO: os filtros da tela, lidos da URL. A Cris
 * preenche o formulário de filtro; quem filtra é o botão "Filtrar".
 */
export interface FiltrosDaAuditoria {
  /** id do usuário, ou "sistema" (eventos sem usuário). */
  usuario: string | null;
  entidade: string | null;
  /** trecho da ação (ex.: "despesa", "incc.update"). */
  acao: string | null;
  /** "AAAA-MM-DD", inclusive. */
  de: string | null;
  ate: string | null;
}

const ISO = /^\d{4}-\d{2}-\d{2}$/;
const limpo = (v: unknown, max = 80) => (typeof v === "string" && v.trim() ? v.trim().slice(0, max) : null);

export function lerFiltrosDaAuditoria(sp: Record<string, string | undefined>, usuariosValidos: ReadonlySet<string>): FiltrosDaAuditoria {
  const usuario = limpo(sp.usuario);
  const de = limpo(sp.de);
  const ate = limpo(sp.ate);
  return {
    usuario: usuario && (usuario === "sistema" || usuariosValidos.has(usuario)) ? usuario : null,
    entidade: limpo(sp.entidade, 60),
    acao: limpo(sp.acao, 60),
    de: de && ISO.test(de) ? de : null,
    ate: ate && ISO.test(ate) ? ate : null,
  };
}

export const temFiltro = (f: FiltrosDaAuditoria) => Object.values(f).some((v) => v != null);

/** Data de hoje e do 1º do mês, para as sugestões da Cris ("só deste mês"). */
export function intervaloDoMes(hojeIso: string): { de: string; ate: string } {
  return { de: `${hojeIso.slice(0, 7)}-01`, ate: hojeIso };
}
