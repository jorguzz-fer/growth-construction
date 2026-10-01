import { statusDaDespesaPorAcumulado } from "@/lib/pagamento-regras";

/**
 * Regras PURAS da conciliação com valor (Prompt L, Partes 2, 3 e 6).
 */

export const TOLERANCIA_CENTAVOS = 0.01;
const r2 = (v: number) => Math.round(v * 100) / 100;

export interface ItemDeVinculo {
  despesaId: string;
  valor: number;
}

/** 2.4 — a soma dos vínculos (existentes + novos) não pode exceder o valor do movimento; cada valor > 0; sem despesa repetida. */
export function recusaDosVinculos(valorDoMovimento: number, jaVinculado: number, novos: readonly ItemDeVinculo[]): string | null {
  if (novos.length === 0) return "Escolha ao menos uma despesa para vincular.";
  if (novos.some((n) => !Number.isFinite(n.valor) || n.valor <= 0)) return "Cada vínculo precisa de um valor maior que zero.";
  if (new Set(novos.map((n) => n.despesaId)).size !== novos.length) return "A mesma despesa aparece mais de uma vez.";
  const soma = r2(jaVinculado + novos.reduce((a, n) => a + n.valor, 0));
  const mov = r2(Math.abs(valorDoMovimento));
  if (soma > mov + TOLERANCIA_CENTAVOS) {
    return `A soma dos vínculos (${soma.toLocaleString("pt-BR", { style: "currency", currency: "BRL" })}) excede o valor do movimento (${mov.toLocaleString("pt-BR", { style: "currency", currency: "BRL" })}). Ajuste o valor de uma despesa ou lance a diferença (multa, juro, tarifa) como despesa própria e vincule-a a este movimento.`;
  }
  return null;
}

/** 3.1 — a conciliação só CONCLUI quando os vínculos somam o valor do movimento. Nada de ajuste automático. */
export function conciliacaoConcluida(valorDoMovimento: number, somaDosVinculos: number): boolean {
  return Math.abs(Math.abs(valorDoMovimento) - somaDosVinculos) <= TOLERANCIA_CENTAVOS;
}

/** O que ainda falta vincular num movimento (natureza 3 de 1.3 quando já há vínculo parcial). */
export function faltaNoMovimento(valorDoMovimento: number, somaDosVinculos: number): number {
  return Math.max(0, r2(Math.abs(valorDoMovimento) - somaDosVinculos));
}

export type EstadoDaDespesa = "Em aberto" | "Baixada" | "Baixada e conciliada" | "Cancelada";

export interface EstadoDaDespesaCalculado {
  estado: EstadoDaDespesa;
  /** 2.5 / BL-3 — status gravado, derivado do pago contra o valor. */
  statusGravado: "A pagar" | "Parcialmente paga" | "Pago";
  pago: number;
  conciliado: number;
  /** 6.4 — baixado SEM vínculo com extrato: o número que denuncia extrato não importado. */
  baixadoSemConciliar: number;
  saldo: number;
}

/**
 * 6.2 / 6.3 — três estados da despesa, derivados, nunca digitados:
 * Em aberto (nada pago), Baixada (pagamento registrado sem vínculo com
 * extrato) e Baixada e conciliada (os vínculos cobrem o pago).
 */
export function estadoDaDespesa(c: { valor: number; cancelado: boolean; principalPago: number; conciliado: number }): EstadoDaDespesaCalculado {
  const pago = r2(c.principalPago);
  const conciliado = r2(Math.min(c.conciliado, pago));
  const baixadoSemConciliar = r2(Math.max(0, pago - conciliado));
  const statusGravado = statusDaDespesaPorAcumulado(c.valor, pago);
  const saldo = Math.max(0, r2(c.valor - pago));
  let estado: EstadoDaDespesa;
  if (c.cancelado) estado = "Cancelada";
  else if (pago <= 0) estado = "Em aberto";
  else if (baixadoSemConciliar <= TOLERANCIA_CENTAVOS) estado = "Baixada e conciliada";
  else estado = "Baixada";
  return { estado, statusGravado, pago, conciliado, baixadoSemConciliar, saldo };
}

export type EstadoDoMovimento = "pendente" | "parcial" | "conciliado" | "conciliado sem vínculo" | "ajuste";

/** 6.6 / BL-2 — o estado do movimento do extrato: `rec` sem nenhum vínculo (nem antigo) é estado próprio, não "conciliado". */
export function estadoDoMovimento(m: { rec: boolean; cat: string | null; valor: number; conciliadoDespesaId: string | null; conciliadoContaReceberId: string | null }, somaDosVinculos: number): EstadoDoMovimento {
  if (m.cat === "ajuste") return "ajuste";
  const temVinculo = somaDosVinculos > 0 || !!m.conciliadoDespesaId || !!m.conciliadoContaReceberId;
  if (m.rec) return temVinculo ? "conciliado" : "conciliado sem vínculo";
  if (somaDosVinculos > 0) return "parcial";
  return "pendente";
}

/** 2.7 — a importação só grava vínculo quando a correspondência é INEQUÍVOCA (um candidato); com mais de um, propõe. */
export function correspondenciaInequivoca<T>(candidatos: readonly T[]): T | null {
  return candidatos.length === 1 ? candidatos[0] : null;
}
