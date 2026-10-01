import { agingDasObrigacoes, type FaixasAging } from "@/lib/calc/aging";

/**
 * Análises do assistente de Ressarcimentos (Prompt T, seção 10; Prompt E).
 * Tudo PURO e SOMENTE LEITURA, sobre o que a página já carregou: nada vai a
 * modelo, nada é gravado. O painel aponta; registrar, compensar, cancelar e
 * conceder papel continuam sendo decisões do usuário nos cards da tela.
 *
 * Os tipos de entrada são deliberadamente estreitos: não existe campo de
 * banco, agência, conta ou chave PIX aqui (12d). Quem chama entrega só
 * nome, valores e datas.
 */

export interface ObrigacaoParaAnalise {
  id: string;
  numDoc: string | null;
  pagador: string | null;
  projectName: string;
  valorTotal: number;
  valorRestituido: number;
  saldoPendente: number;
  dataPagamentoOriginal: string | null;
  dataPrevistaRestituicao: string | null;
  status: string;
}

export interface SaldoDoTerceiroParaAnalise {
  terceiro: string;
  /** quanto a empresa deve a ele. */
  saldoARestituir: number;
  /** quanto ele deve à empresa. */
  saldoARepassar: number;
}

export interface AgingDoTerceiro {
  terceiro: string;
  faixas: FaixasAging;
  total: number;
  /** soma do que passou de 30 dias. */
  acimaDe30: number;
}

export interface EncontroDisponivel {
  terceiro: string;
  aRestituir: number;
  aRepassar: number;
  /** o menor dos dois lados: quanto um encontro de contas poderia abater. */
  compensavel: number;
}

export type MotivoDeConferencia = "sem previsão" | "sem pagador" | "saldo negativo";

export interface ObrigacaoAConferir {
  id: string;
  numDoc: string | null;
  terceiro: string;
  obra: string;
  valor: number;
  motivos: MotivoDeConferencia[];
}

export interface Concentracao {
  totalDevido: number;
  /** maiores credores até cobrir 80% do total (ou todos, se forem poucos). */
  principais: { terceiro: string; saldo: number; fatia: number }[];
  /** a maior fatia, em %, quando passa de metade do total. */
  dominante: { terceiro: string; fatia: number } | null;
}

export interface AnaliseDeRessarcimentos {
  aging: AgingDoTerceiro[];
  encontros: EncontroDisponivel[];
  conferir: ObrigacaoAConferir[];
  concentracao: Concentracao;
  totalObrigacoes: number;
}

const r2 = (v: number) => Math.round(v * 100) / 100;
const emAberto = (o: ObrigacaoParaAnalise) => o.status !== "Cancelado" && o.saldoPendente > 0;
const nomeDo = (o: ObrigacaoParaAnalise) => o.pagador ?? "Sem pagador";

/** Aging por terceiro — a MESMA função e a mesma data-base do lote e da conta corrente (2-A). */
export function agingPorTerceiro(obrigacoes: readonly ObrigacaoParaAnalise[], hojeISO: string): AgingDoTerceiro[] {
  const grupos = new Map<string, ObrigacaoParaAnalise[]>();
  for (const o of obrigacoes) {
    if (!emAberto(o)) continue;
    const k = nomeDo(o);
    grupos.set(k, [...(grupos.get(k) ?? []), o]);
  }
  return [...grupos.entries()]
    .map(([terceiro, lista]) => {
      const faixas = agingDasObrigacoes(lista.map((o) => ({ saldo: o.saldoPendente, dataPrevistaRestituicao: o.dataPrevistaRestituicao, dataPagamentoOriginal: o.dataPagamentoOriginal })), hojeISO);
      return { terceiro, faixas, total: r2(faixas.ate30 + faixas.de31a60 + faixas.de61a90 + faixas.acima90), acimaDe30: r2(faixas.de31a60 + faixas.de61a90 + faixas.acima90) };
    })
    .sort((a, b) => b.acimaDe30 - a.acimaDe30 || b.total - a.total);
}

/** Terceiros com saldo nos dois lados que ainda não compensaram. */
export function encontrosDisponiveis(saldos: readonly SaldoDoTerceiroParaAnalise[]): EncontroDisponivel[] {
  return saldos
    .filter((s) => s.saldoARestituir > 0.005 && s.saldoARepassar > 0.005)
    .map((s) => ({ terceiro: s.terceiro, aRestituir: r2(s.saldoARestituir), aRepassar: r2(s.saldoARepassar), compensavel: r2(Math.min(s.saldoARestituir, s.saldoARepassar)) }))
    .sort((a, b) => b.compensavel - a.compensavel);
}

/** Sem previsão de ressarcimento, sem pagador identificado, ou restituído a mais que o devido. */
export function obrigacoesAConferir(obrigacoes: readonly ObrigacaoParaAnalise[]): ObrigacaoAConferir[] {
  const out: ObrigacaoAConferir[] = [];
  for (const o of obrigacoes) {
    if (o.status === "Cancelado") continue;
    const motivos: MotivoDeConferencia[] = [];
    const negativo = o.valorRestituido > o.valorTotal + 0.005;
    if (negativo) motivos.push("saldo negativo");
    if (o.saldoPendente > 0 && !o.dataPrevistaRestituicao) motivos.push("sem previsão");
    if (!o.pagador && (o.saldoPendente > 0 || negativo)) motivos.push("sem pagador");
    if (motivos.length) out.push({ id: o.id, numDoc: o.numDoc, terceiro: nomeDo(o), obra: o.projectName, valor: negativo ? r2(o.valorRestituido - o.valorTotal) : o.saldoPendente, motivos });
  }
  return out.sort((a, b) => b.motivos.length - a.motivos.length || b.valor - a.valor);
}

/** Quem representa a maior parte do saldo devido. */
export function concentracaoDoSaldo(saldos: readonly SaldoDoTerceiroParaAnalise[]): Concentracao {
  const positivos = saldos.filter((s) => s.saldoARestituir > 0.005).sort((a, b) => b.saldoARestituir - a.saldoARestituir);
  const totalDevido = r2(positivos.reduce((a, s) => a + s.saldoARestituir, 0));
  if (totalDevido <= 0) return { totalDevido: 0, principais: [], dominante: null };
  const principais: Concentracao["principais"] = [];
  let acumulado = 0;
  for (const s of positivos) {
    principais.push({ terceiro: s.terceiro, saldo: r2(s.saldoARestituir), fatia: Math.round((s.saldoARestituir / totalDevido) * 1000) / 10 });
    acumulado += s.saldoARestituir;
    if (acumulado / totalDevido >= 0.8) break;
  }
  const maior = principais[0];
  return { totalDevido, principais, dominante: maior && maior.fatia > 50 ? { terceiro: maior.terceiro, fatia: maior.fatia } : null };
}

export function analisarRessarcimentos(obrigacoes: readonly ObrigacaoParaAnalise[], saldos: readonly SaldoDoTerceiroParaAnalise[], hojeISO: string): AnaliseDeRessarcimentos {
  return {
    aging: agingPorTerceiro(obrigacoes, hojeISO),
    encontros: encontrosDisponiveis(saldos),
    conferir: obrigacoesAConferir(obrigacoes),
    concentracao: concentracaoDoSaldo(saldos),
    totalObrigacoes: obrigacoes.filter(emAberto).length,
  };
}
