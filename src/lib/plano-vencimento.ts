/**
 * Dia de vencimento que não existe em algum mês da série (Prompt AN, Parte 6).
 * Módulo PURO, SOMENTE LEITURA.
 *
 * A verificação saiu da Conferência de planos e veio para o cadastro do plano
 * da unidade, no momento de preencher o 1º vencimento (6.3). Ela é a MESMA de
 * antes: séries Mensais (passo 1), Semestrais (6) e Anuais (12); dia até 28 é
 * ignorado (existe em todo mês); o teste é na SÉRIE inteira, não só na
 * primeira data — 31/01 quebra em fevereiro, 31/03 quebra em junho.
 *
 * É AVISO, não recusa (BAN-3): o expansor de recebíveis (`serieVencimentos`,
 * em `calc/carencia.ts`, que este módulo só LÊ) já encolhe o dia para o
 * último do mês. O aviso diz qual parcela, qual mês e o dia que será usado.
 */
import { avancaMeses, formatDataInterna, parseDataInterna } from "@/lib/calc/carencia";

export const SERIES_PERIODICAS = [
  { chave: "Mensais", nome: "mensal", passo: 1 },
  { chave: "Semestrais", nome: "semestral", passo: 6 },
  { chave: "Anuais", nome: "anual", passo: 12 },
] as const;

const MESES = ["janeiro", "fevereiro", "março", "abril", "maio", "junho", "julho", "agosto", "setembro", "outubro", "novembro", "dezembro"];

export interface DiaInexistente {
  /** Posição na série, começando em 1. */
  parcela: number;
  mes: number;
  ano: number;
  /** Data que o sistema usará (último dia do mês), "MM/DD/YYYY". */
  dataUsada: string;
}

/** Parcelas da série cujo dia de vencimento não existe no mês. */
export function diasInexistentes(venc: string | null | undefined, qtd: number, passo: number): DiaInexistente[] {
  const base = parseDataInterna(venc);
  if (!base || base.d <= 28) return [];
  const n = Math.max(1, Math.floor(Number(qtd) || 1));
  const out: DiaInexistente[] = [];
  for (let i = 0; i < n; i++) {
    const usada = avancaMeses(base, i * passo, base.d);
    if (usada.d !== base.d) out.push({ parcela: i + 1, mes: usada.mo, ano: usada.yr, dataUsada: formatDataInterna(usada) });
  }
  return out;
}

const dataBR = (mdY: string) => {
  const [m, d, y] = mdY.split("/");
  return `${d}/${m}/${y}`;
};

/**
 * Mensagem do cadastro (6.3): diz o dia, o mês que quebra, a parcela e o dia
 * que será usado. Uma linha; com mais ocorrências, diz quantas são.
 * Ex.: "Dia 31 não existe em fevereiro/2027 — a 2ª mensal cai em 28/02/2027 (último dia do mês)."
 */
export function avisoDeDiaInexistente(venc: string | null | undefined, qtd: number, passo: number, nome: string): string | null {
  const lista = diasInexistentes(venc, qtd, passo);
  if (lista.length === 0) return null;
  const dia = parseDataInterna(venc)!.d;
  const p = lista[0];
  const mais = lista.length > 1 ? ` Outras ${lista.length - 1} parcela(s) desta série também caem no último dia do mês.` : "";
  return `Dia ${dia} não existe em ${MESES[p.mes - 1]}/${p.ano} — a ${p.parcela}ª ${nome} cai em ${dataBR(p.dataUsada)} (último dia do mês).${mais}`;
}
