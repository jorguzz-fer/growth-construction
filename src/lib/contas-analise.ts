import { rotuloDaAtualizacao } from "@/lib/contas-regras";

/**
 * Análises do assistente de Contas Correntes (Prompt X, seção 7; Prompt E).
 * Tudo PURO e SOMENTE LEITURA, sobre o que a página carregou: nada vai a
 * modelo, nada é gravado. Nunca cadastra, altera saldo, inativa ou exclui
 * conta (7.2) — o painel aponta e o usuário decide na tabela.
 */

export interface ContaParaAnalise {
  id: string;
  banco: string;
  ag: string | null;
  cc: string | null;
  tipo: string;
  saldo: number;
  saldoSource: string;
  openFinanceId: string | null;
  /** última alteração do saldo (manual ou extrato); null = nunca. */
  lastSync: string | null;
  ativo: boolean;
}

/** Uso real, vindo do banco: lançamentos de caixa por conta. */
export interface UsoDaConta {
  id: string;
  lancamentos: number;
  /** data ISO (YYYY-MM-DD) do último lançamento; null sem lançamento. */
  ultimoLancamento: string | null;
}

export const JANELA_SEM_MOVIMENTO_DIAS = 180;
export const JANELA_SALDO_PARADO_DIAS = 90;

export interface AnaliseDeContas {
  naoParecemConta: { id: string; banco: string; motivo: string; saldo: number }[];
  semMovimento: { id: string; banco: string; lancamentos: number; ultimoLancamento: string | null }[];
  saldoParado: { id: string; banco: string; saldo: number; lastSync: string | null; dias: number | null }[];
  autoNaoConectada: { id: string; banco: string }[];
  total: number;
}

const nome = (c: ContaParaAnalise) => `${c.banco}${c.cc ? " · " + c.cc : ""}`;
const dias = (iso: string | null, hojeISO: string): number | null => {
  if (!iso) return null;
  const a = Date.parse(iso.slice(0, 10));
  const h = Date.parse(hojeISO);
  if (!Number.isFinite(a) || !Number.isFinite(h)) return null;
  return Math.max(0, Math.round((h - a) / 86_400_000));
};

/** 7.1 — a varredura que originou a tarefa: sem agência ou sem número. */
export function cadastrosQueNaoParecemConta(contas: readonly ContaParaAnalise[]): AnaliseDeContas["naoParecemConta"] {
  return contas
    .filter((c) => c.ativo && (!(c.ag ?? "").trim() || !(c.cc ?? "").trim()))
    .map((c) => ({ id: c.id, banco: nome(c), motivo: !(c.ag ?? "").trim() && !(c.cc ?? "").trim() ? "sem agência e sem número" : !(c.ag ?? "").trim() ? "sem agência" : "sem número", saldo: c.saldo }));
}

/** 7.1 — cadastradas e sem lançamento vinculado em período relevante. */
export function contasSemMovimento(contas: readonly ContaParaAnalise[], uso: readonly UsoDaConta[], hojeISO: string): AnaliseDeContas["semMovimento"] {
  const porId = new Map(uso.map((u) => [u.id, u]));
  return contas
    .filter((c) => c.ativo)
    .map((c) => ({ c, u: porId.get(c.id) }))
    .filter(({ u }) => !u || u.lancamentos === 0 || (dias(u.ultimoLancamento, hojeISO) ?? Infinity) > JANELA_SEM_MOVIMENTO_DIAS)
    .map(({ c, u }) => ({ id: c.id, banco: nome(c), lancamentos: u?.lancamentos ?? 0, ultimoLancamento: u?.ultimoLancamento ?? null }));
}

/** 7.1 — saldo não atualizado há muito tempo (ou nunca), com a data da última alteração. */
export function saldosParados(contas: readonly ContaParaAnalise[], hojeISO: string): AnaliseDeContas["saldoParado"] {
  return contas
    .filter((c) => c.ativo)
    .map((c) => ({ c, d: dias(c.lastSync, hojeISO) }))
    .filter(({ d }) => d == null || d > JANELA_SALDO_PARADO_DIAS)
    .map(({ c, d }) => ({ id: c.id, banco: nome(c), saldo: c.saldo, lastSync: c.lastSync, dias: d }))
    .sort((a, b) => (b.dias ?? Infinity) - (a.dias ?? Infinity));
}

/** 7.1 / BX-3 — marcadas como automáticas e sem conexão. */
export function automaticasNaoConectadas(contas: readonly ContaParaAnalise[]): AnaliseDeContas["autoNaoConectada"] {
  return contas.filter((c) => c.ativo && rotuloDaAtualizacao(c).conectada === false).map((c) => ({ id: c.id, banco: nome(c) }));
}

export function analisarContas(contas: readonly ContaParaAnalise[], uso: readonly UsoDaConta[], hojeISO: string): AnaliseDeContas {
  return {
    naoParecemConta: cadastrosQueNaoParecemConta(contas),
    semMovimento: contasSemMovimento(contas, uso, hojeISO),
    saldoParado: saldosParados(contas, hojeISO),
    autoNaoConectada: automaticasNaoConectadas(contas),
    total: contas.filter((c) => c.ativo).length,
  };
}
