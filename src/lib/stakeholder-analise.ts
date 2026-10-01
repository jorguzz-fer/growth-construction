import { PAPEL_PAGADOR_TERCEIRO, chaveDoDocumento, avisoDeTipoIncompativel, formatoDoDocumento, exigeEndereco, semEndereco } from "@/lib/stakeholder-regras";

/**
 * Análises do assistente de Fornecedores & Stakeholders (Prompt W, seção 7).
 * Tudo PURO, sobre o que a página carregou: nada vai a modelo, nada é gravado,
 * nenhum papel é concedido — o painel aponta e o usuário decide na tabela.
 * O documento só aparece onde a própria lista já o mostra; nunca sai daqui
 * para fora.
 */

export interface CadastroParaAnalise {
  id: string;
  nome: string;
  tipo: string;
  doc: string | null;
  papeis: readonly string[];
  ativo: boolean;
  email: string | null;
  tel: string | null;
  whatsapp?: string | null;
  endereco: string | null;
}

/** Uso real, vindo do banco (contagens; nada de valor nem de documento). */
export interface UsoDoCadastro {
  id: string;
  /** despesas em que é o fornecedor. */
  despesas: number;
  /** data (ISO) da despesa mais recente como fornecedor. */
  ultimaDespesa: string | null;
  /** obrigações de terceiro em que é o pagador. */
  obrigacoes: number;
}

export const PAPEIS_DE_FORNECEDOR = ["Fornecedor de Material", "Prestador de Serviço", "Mão de Obra RPA"] as const;
export const JANELA_RECENTE_DIAS = 90;

export interface Duplicidade {
  documento: string;
  cadastros: { id: string; nome: string; tipo: string; ativo: boolean; papeis: readonly string[] }[];
}

export interface Incompleto {
  id: string;
  nome: string;
  faltas: ("documento" | "papel" | "contato" | "endereço")[];
}

export interface Invalido {
  id: string;
  nome: string;
  motivo: string;
}

export interface InativoEmUso {
  id: string;
  nome: string;
  despesasRecentes: number;
  ultimaDespesa: string | null;
  obrigacoes: number;
}

export interface PapelEUso {
  /** marcado como fornecedor e nunca teve despesa. */
  fornecedorSemDespesa: { id: string; nome: string; papeis: readonly string[] }[];
  /** tem despesa como fornecedor e nenhum papel de fornecedor. */
  despesaSemPapel: { id: string; nome: string; despesas: number; papeis: readonly string[] }[];
  /** 1.6 — tem obrigação como pagador e não tem o papel: candidato, decisão humana. */
  pagadorSemPapel: { id: string; nome: string; obrigacoes: number; ativo: boolean }[];
}

export interface AnaliseDeStakeholders {
  total: number;
  duplicados: Duplicidade[];
  incompletos: Incompleto[];
  invalidos: Invalido[];
  inativosEmUso: InativoEmUso[];
  papeis: PapelEUso;
}

/** 7.2 · documentos duplicados — lado a lado, para o usuário decidir. */
export function documentosDuplicados(cadastros: readonly CadastroParaAnalise[]): Duplicidade[] {
  const grupos = new Map<string, CadastroParaAnalise[]>();
  for (const c of cadastros) {
    const k = chaveDoDocumento(c.doc);
    if (!k) continue;
    grupos.set(k, [...(grupos.get(k) ?? []), c]);
  }
  return [...grupos.values()]
    .filter((g) => g.length > 1)
    .map((g) => ({ documento: g[0].doc ?? "", cadastros: g.map((c) => ({ id: c.id, nome: c.nome, tipo: c.tipo, ativo: c.ativo, papeis: c.papeis })) }))
    .sort((a, b) => b.cadastros.length - a.cadastros.length);
}

/** 7.2 · cadastro incompleto — sem documento, sem papel, sem contato (e sem endereço quando obrigatório). */
export function cadastrosIncompletos(cadastros: readonly CadastroParaAnalise[]): Incompleto[] {
  return cadastros
    .filter((c) => c.ativo)
    .map((c) => {
      const faltas: Incompleto["faltas"] = [];
      if (!(c.doc ?? "").trim()) faltas.push("documento");
      if (c.papeis.length === 0) faltas.push("papel");
      if (!(c.email ?? "").trim() && !(c.tel ?? "").trim() && !(c.whatsapp ?? "").trim()) faltas.push("contato");
      if (exigeEndereco(c.tipo, c.papeis) && semEndereco(c.endereco)) faltas.push("endereço");
      return { id: c.id, nome: c.nome, faltas };
    })
    .filter((i) => i.faltas.length > 0)
    .sort((a, b) => (a.faltas.includes("papel") === b.faltas.includes("papel") ? b.faltas.length - a.faltas.length : a.faltas.includes("papel") ? -1 : 1));
}

/** 7.2 · documento inválido — não passa na verificação, ou tipo incompatível. */
export function documentosInvalidos(cadastros: readonly CadastroParaAnalise[]): Invalido[] {
  const out: Invalido[] = [];
  for (const c of cadastros) {
    if (formatoDoDocumento(c.doc) === "invalido") out.push({ id: c.id, nome: c.nome, motivo: "não passa na verificação de CPF/CNPJ" });
    const t = avisoDeTipoIncompativel(c.tipo, c.doc);
    if (t) out.push({ id: c.id, nome: c.nome, motivo: t });
  }
  return out;
}

const diasDesde = (iso: string | null, hoje: Date) => (iso ? Math.floor((hoje.getTime() - new Date(iso).getTime()) / 86_400_000) : Infinity);

/** 7.2 · inativos ainda em uso — despesa recente como fornecedor, ou obrigação como pagador. */
export function inativosEmUso(cadastros: readonly CadastroParaAnalise[], uso: readonly UsoDoCadastro[], hoje = new Date()): InativoEmUso[] {
  const porId = new Map(uso.map((u) => [u.id, u]));
  return cadastros
    .filter((c) => !c.ativo)
    .map((c) => {
      const u = porId.get(c.id);
      const recente = u && diasDesde(u.ultimaDespesa, hoje) <= JANELA_RECENTE_DIAS;
      return { id: c.id, nome: c.nome, despesasRecentes: recente ? u.despesas : 0, ultimaDespesa: u?.ultimaDespesa ?? null, obrigacoes: u?.obrigacoes ?? 0 };
    })
    .filter((i) => i.despesasRecentes > 0 || i.obrigacoes > 0);
}

/** 7.2 · papéis e uso real. */
export function papeisEUsoReal(cadastros: readonly CadastroParaAnalise[], uso: readonly UsoDoCadastro[]): PapelEUso {
  const porId = new Map(uso.map((u) => [u.id, u]));
  const ehFornecedor = (p: readonly string[]) => p.some((x) => (PAPEIS_DE_FORNECEDOR as readonly string[]).includes(x));
  const fornecedorSemDespesa = cadastros
    .filter((c) => c.ativo && ehFornecedor(c.papeis) && (porId.get(c.id)?.despesas ?? 0) === 0)
    .map((c) => ({ id: c.id, nome: c.nome, papeis: c.papeis }));
  const despesaSemPapel = cadastros
    .filter((c) => (porId.get(c.id)?.despesas ?? 0) > 0 && !ehFornecedor(c.papeis))
    .map((c) => ({ id: c.id, nome: c.nome, despesas: porId.get(c.id)!.despesas, papeis: c.papeis }));
  const pagadorSemPapel = cadastros
    .filter((c) => (porId.get(c.id)?.obrigacoes ?? 0) > 0 && !c.papeis.includes(PAPEL_PAGADOR_TERCEIRO))
    .map((c) => ({ id: c.id, nome: c.nome, obrigacoes: porId.get(c.id)!.obrigacoes, ativo: c.ativo }))
    .sort((a, b) => b.obrigacoes - a.obrigacoes);
  return { fornecedorSemDespesa, despesaSemPapel, pagadorSemPapel };
}

export function analisarStakeholders(cadastros: readonly CadastroParaAnalise[], uso: readonly UsoDoCadastro[], hoje = new Date()): AnaliseDeStakeholders {
  return {
    total: cadastros.length,
    duplicados: documentosDuplicados(cadastros),
    incompletos: cadastrosIncompletos(cadastros),
    invalidos: documentosInvalidos(cadastros),
    inativosEmUso: inativosEmUso(cadastros, uso, hoje),
    papeis: papeisEUsoReal(cadastros, uso),
  };
}
