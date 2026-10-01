/**
 * Situação da versão de planejamento × relatórios (Prompt H). Módulo PURO.
 *
 * Regra 1.1: versão de `kind` budget ou forecast com `status` diferente de
 * "Aprovado" não é considerada nos relatórios — **quando a chave da empresa
 * está ligada**. Regra 1.2 (BH-2): a versão `atual` nunca é filtrada.
 * "Concluído" é etapa intermediária e também não entra (BF-2 / Prompt H).
 */
export const CHAVE_RASCUNHO = "rascunho_fora_dos_relatorios" as const;
export const SITUACAO_QUE_ENTRA = "Aprovado";

export interface VersaoComSituacao {
  kind: string;
  status: string;
}

export function ehPlanejamento(v: { kind: string }): boolean {
  return v.kind === "budget" || v.kind === "forecast";
}

/** A versão alimenta relatórios? `atual` sempre; planejamento só Aprovado (com a chave ligada). */
export function entraNosRelatorios(v: VersaoComSituacao, chaveLigada: boolean): boolean {
  if (!ehPlanejamento(v)) return true;
  if (!chaveLigada) return true;
  return v.status === SITUACAO_QUE_ENTRA;
}

/** BH-3 (opção 2): selo no seletor de versões dos relatórios; null = sem selo. */
export function avisoNoSeletor(v: VersaoComSituacao, chaveLigada: boolean): string | null {
  if (entraNosRelatorios(v, chaveLigada)) return null;
  return `${v.status} — não entra nos totais`;
}

/** 5.2: aviso nas telas de Orçamentos e Previsão para versão não Aprovada. */
export function avisoNaEdicao(v: VersaoComSituacao, chaveLigada: boolean): string | null {
  if (!ehPlanejamento(v) || v.status === SITUACAO_QUE_ENTRA) return null;
  return chaveLigada
    ? "Esta versão não entra nos relatórios (DRE, Fluxo, Dashboard…) até ser Aprovada. Nada foi apagado: ela continua inteira aqui."
    : "Quando a regra “Rascunho fora dos relatórios” for ligada em Chaves de mudança, esta versão deixará de aparecer nos relatórios até ser Aprovada.";
}

/** BH-4: o que a troca de situação passa a significar com a chave ligada. */
export function efeitoDaTrocaDeSituacao(chaveLigada: boolean): string | null {
  if (!chaveLigada) return null;
  return "Aprovar faz a versão entrar nos relatórios; voltar a Rascunho ou Concluído a tira. Toda troca fica na Auditoria.";
}
