import { cnpjValido } from "@/lib/calc/emitente-fiscal";
import { PAPEIS_STAKEHOLDER } from "@/lib/calc/constants";

/**
 * Regras puras do cadastro de Fornecedores & Stakeholders (Prompt W).
 *
 * Documento (seção 3): CNPJ pelo `cnpjValido` que já existe (alfanumérico,
 * DV); CPF por `cpfValido`, criado aqui ao lado. Validar é **bloqueio** só
 * para o que acaba de ser digitado; tipo incompatível (3.4) e documento
 * repetido (3.5) são **avisos**, nunca bloqueio — há cadastro antigo nessas
 * condições, e recusar a edição travaria a correção. Sem `UNIQUE` no banco.
 */

export const PAPEL_PAGADOR_TERCEIRO: (typeof PAPEIS_STAKEHOLDER)[number] = "Pagador por Terceiro";
/** 3-A.3 — papéis que, em PF, exigem endereço residencial (RPA e recibo). */
export const PAPEIS_QUE_EXIGEM_ENDERECO = ["Prestador de Serviço", "Mão de Obra RPA", "Mão de Obra CLT"] as const;

/** Só dígitos; `null` quando não sobra nada. */
export function digitosDoDocumento(doc: string | null | undefined): string | null {
  const d = (doc ?? "").replace(/\D/g, "");
  return d || null;
}

/** CPF: 11 dígitos, dois DV (módulo 11), sequência repetida recusada. */
export function cpfValido(cpf: string | null | undefined): boolean {
  const d = digitosDoDocumento(cpf);
  if (!d || d.length !== 11) return false;
  if (/^(\d)\1{10}$/.test(d)) return false;
  const dv = (n: number) => {
    let soma = 0;
    for (let i = 0; i < n; i++) soma += Number(d[i]) * (n + 1 - i);
    const r = (soma * 10) % 11;
    return r === 10 ? 0 : r;
  };
  return dv(9) === Number(d[9]) && dv(10) === Number(d[10]);
}

export type FormatoDoDocumento = "vazio" | "cpf" | "cnpj" | "invalido";

/**
 * O que o documento gravado é, pelo que ele tem: 11 dígitos que conferem é
 * CPF; CNPJ é pelo `cnpjValido` (aceita alfanumérico); o resto é inválido.
 */
export function formatoDoDocumento(doc: string | null | undefined): FormatoDoDocumento {
  const t = (doc ?? "").trim();
  if (!t) return "vazio";
  if (cpfValido(t)) return "cpf";
  if (cnpjValido(t)) return "cnpj";
  return "invalido";
}

/** 3.3 — bloqueio na entrada: só o que não é CPF nem CNPJ válido. */
export function motivoDeRecusaDoDocumento(doc: string | null | undefined): string | null {
  const f = formatoDoDocumento(doc);
  if (f !== "invalido") return null;
  const n = digitosDoDocumento(doc)?.length ?? 0;
  if (n === 11) return "CPF inválido: os dígitos verificadores não conferem.";
  if (n === 14 || /^[A-Za-z0-9.\-/ ]{14,18}$/.test((doc ?? "").trim())) return "CNPJ inválido: os dígitos verificadores não conferem.";
  return "Documento fora do padrão: informe um CPF (11 dígitos) ou um CNPJ (14 caracteres).";
}

/** 3.4 — aviso, sem bloquear: PJ com CPF ou PF com CNPJ. */
export function avisoDeTipoIncompativel(tipo: string, doc: string | null | undefined): string | null {
  const f = formatoDoDocumento(doc);
  if (tipo === "PJ" && f === "cpf") return "O documento é um CPF, mas o cadastro está como PJ. Confira o tipo.";
  if (tipo === "PF" && f === "cnpj") return "O documento é um CNPJ, mas o cadastro está como PF. Confira o tipo.";
  return null;
}

/**
 * 3.5 — aviso, sem bloquear: o mesmo documento (pelos dígitos, ou pelo texto
 * normalizado quando não há dígito) já está em outro cadastro. Devolve os
 * nomes para a tela mostrar qual é.
 */
export function duplicatasDoDocumento(
  doc: string | null | undefined,
  outros: readonly { id: string; nome: string; doc: string | null }[],
  ignorarId?: string | null,
): { id: string; nome: string }[] {
  const chave = chaveDoDocumento(doc);
  if (!chave) return [];
  return outros.filter((o) => o.id !== ignorarId && chaveDoDocumento(o.doc) === chave).map((o) => ({ id: o.id, nome: o.nome }));
}

export function chaveDoDocumento(doc: string | null | undefined): string | null {
  const t = (doc ?? "").trim().toUpperCase();
  if (!t) return null;
  const d = t.replace(/\D/g, "");
  return d.length >= 11 ? d : t.replace(/[^A-Z0-9]/g, "") || null;
}

export function avisoDeDuplicidade(duplicatas: readonly { nome: string }[]): string | null {
  if (duplicatas.length === 0) return null;
  return `Este documento já está em outro cadastro: ${duplicatas.map((d) => d.nome).join(", ")}. Confira se é a mesma pessoa.`;
}

/** 3-A.3 — PF com papel de serviço ou mão de obra precisa de endereço. */
export function exigeEndereco(tipo: string, papeis: readonly string[]): boolean {
  return tipo === "PF" && papeis.some((p) => (PAPEIS_QUE_EXIGEM_ENDERECO as readonly string[]).includes(p));
}

export function semEndereco(endereco: string | null | undefined): boolean {
  return !(endereco ?? "").trim();
}

/**
 * BW-2 — papéis gravados fora da lista. A edição reenvia só os marcados; sem
 * isto, um papel de importação sumiria em silêncio. A tela mostra o papel
 * desconhecido como opção marcada, e o reenvia.
 */
export function papeisForaDaLista(papeis: readonly string[]): string[] {
  const lista = new Set<string>(PAPEIS_STAKEHOLDER);
  return papeis.filter((p) => !lista.has(p));
}

/** Sinalização discreta na listagem (3.6, 3-A.4) — nada é erro. */
export interface SinaisDoCadastro {
  documentoInvalido: boolean;
  tipoIncompativel: boolean;
  documentoDuplicado: { id: string; nome: string }[];
  semEnderecoObrigatorio: boolean;
  semPapel: boolean;
  papeisDesconhecidos: string[];
}

export function sinaisDoCadastro(
  s: { id: string; tipo: string; doc: string | null; papeis: readonly string[]; endereco: string | null },
  todos: readonly { id: string; nome: string; doc: string | null }[],
): SinaisDoCadastro {
  const f = formatoDoDocumento(s.doc);
  return {
    documentoInvalido: f === "invalido",
    tipoIncompativel: avisoDeTipoIncompativel(s.tipo, s.doc) != null,
    documentoDuplicado: duplicatasDoDocumento(s.doc, todos, s.id),
    semEnderecoObrigatorio: exigeEndereco(s.tipo, s.papeis) && semEndereco(s.endereco),
    semPapel: s.papeis.length === 0,
    papeisDesconhecidos: papeisForaDaLista(s.papeis),
  };
}

// ─────────────────────────── Exclusão (seção 2) ───────────────────────────

/** 2.1 — as SEIS tabelas que apontam para `stakeholder`. */
export interface VinculosDoStakeholder {
  despesas: number;
  obrigacoesTerceiro: number;
  recebimentosTerceiro: number;
  acertos: number;
  compensacoes: number;
  documentos: number;
}

export const SEM_VINCULOS: VinculosDoStakeholder = { despesas: 0, obrigacoesTerceiro: 0, recebimentosTerceiro: 0, acertos: 0, compensacoes: 0, documentos: 0 };

/**
 * 2.4 — cada vínculo que impede, com a contagem. Cinco das FKs são
 * `SET NULL`: sem esta lista a exclusão não falharia, só apagaria o nome em
 * silêncio; a sexta (`document`) é `CASCADE` e apagaria o registro do arquivo.
 */
export function bloqueiosDeExclusaoDoStakeholder(v: VinculosDoStakeholder): string[] {
  const m: string[] = [];
  if (v.despesas > 0) m.push(`${v.despesas} despesa(s) como fornecedor`);
  if (v.obrigacoesTerceiro > 0) m.push(`${v.obrigacoesTerceiro} obrigação(ões) como pagador por terceiro`);
  if (v.recebimentosTerceiro > 0) m.push(`${v.recebimentosTerceiro} recebimento(s) por terceiro`);
  if (v.acertos > 0) m.push(`${v.acertos} acerto(s) como favorecido`);
  if (v.compensacoes > 0) m.push(`${v.compensacoes} compensação(ões)`);
  if (v.documentos > 0) m.push(`${v.documentos} documento(s) anexado(s)`);
  return m;
}

export function totalDeVinculos(v: VinculosDoStakeholder): number {
  return v.despesas + v.obrigacoesTerceiro + v.recebimentosTerceiro + v.acertos + v.compensacoes + v.documentos;
}

// ───────────────────── Seletores (seção 4 e 1.5) ─────────────────────

export interface OpcaoDeCadastro {
  id: string;
  nome: string;
}

/**
 * 4.2 — o que um seletor de escolha oferece: só os ATIVOS, mantendo visível o
 * que já está vinculado (senão editar um lançamento antigo perderia o
 * fornecedor). O vinculado inativo aparece marcado como tal. Segue o
 * comportamento de `getSocios`, que já filtrava `ativo`.
 */
export function opcoesDeSelecao(
  todos: readonly { id: string; nome: string; ativo: boolean }[],
  manter: readonly (string | null | undefined)[] = [],
): OpcaoDeCadastro[] {
  const ids = new Set(manter.filter((x): x is string => !!x));
  return todos
    .filter((s) => s.ativo || ids.has(s.id))
    .map((s) => ({ id: s.id, nome: s.ativo ? s.nome : `${s.nome} (inativo)` }));
}

/** 1.5 — "Quem desembolsou": só quem tem o papel de Pagador por Terceiro, ativo. */
export function pagadoresPorTerceiro(
  todos: readonly { id: string; nome: string; ativo: boolean; papeis: readonly string[] }[],
  manter: readonly (string | null | undefined)[] = [],
): OpcaoDeCadastro[] {
  const ids = new Set(manter.filter((x): x is string => !!x));
  return todos
    .filter((s) => (s.ativo && s.papeis.includes(PAPEL_PAGADOR_TERCEIRO)) || ids.has(s.id))
    .map((s) => ({ id: s.id, nome: s.ativo ? s.nome : `${s.nome} (inativo)` }));
}

// ───────────────────────── Listagem (seção 6) ─────────────────────────

const semAcento = (v: string | null | undefined) =>
  (v ?? "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .trim();

/**
 * 6.1 — busca por nome (e nome fantasia) e documento, e filtro por papel.
 * Cada termo precisa aparecer no nome ou no documento (dígitos ou texto),
 * sem diferenciar acento e caixa. Puro: a tela filtra o que já carregou.
 */
export function filtrarCadastros<T extends { nome: string; nomeFantasia?: string | null; doc: string | null; papeis: readonly string[]; ativo: boolean }>(
  lista: readonly T[],
  f: { busca?: string; papel?: string; mostrarInativos?: boolean },
): T[] {
  const termos = semAcento(f.busca).split(/\s+/).filter(Boolean).slice(0, 8);
  return lista.filter((s) => {
    if (!f.mostrarInativos && !s.ativo) return false;
    if (f.papel && !s.papeis.includes(f.papel)) return false;
    if (termos.length === 0) return true;
    const nome = semAcento(`${s.nome} ${s.nomeFantasia ?? ""}`);
    const doc = semAcento(s.doc);
    const digitos = doc.replace(/\D/g, "");
    return termos.every((t) => nome.includes(t) || doc.includes(t) || (digitos && digitos.includes(t.replace(/\D/g, "")) && t.replace(/\D/g, "").length > 0));
  });
}
