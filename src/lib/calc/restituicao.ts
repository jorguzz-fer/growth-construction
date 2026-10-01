/** Status de uma obrigação "paga por terceiro" conforme o valor restituído. */
export function statusRestituicao(
  valorTotal: number,
  restituido: number,
): "Aguardando restituição" | "Parcialmente restituído" | "Restituído" {
  if (restituido <= 0) return "Aguardando restituição";
  if (restituido + 0.01 >= valorTotal) return "Restituído";
  return "Parcialmente restituído";
}

/** Saldo pendente de restituição (nunca negativo). */
export function saldoPendente(valorTotal: number, restituido: number): number {
  return Math.max(0, Math.round((valorTotal - restituido) * 100) / 100);
}

/**
 * Rótulo do status da obrigação na interface (§12).
 *
 * O banco continua gravando "Aguardando restituição" — o valor histórico. A
 * troca é só de vocabulário na tela: nenhum registro antigo é reclassificado,
 * nenhum UPDATE é emitido. Qualquer status desconhecido é devolvido como veio,
 * para nunca esconder um estado que não previmos.
 */
export function rotuloStatusObrigacao(status: string): string {
  // Prompt T, 0 — só o texto da tela muda; o status GRAVADO não é reescrito.
  if (status === "Aguardando restituição") return "Pendente";
  if (status === "Parcialmente restituído") return "Parcialmente ressarcido";
  if (status === "Restituído") return "Ressarcido";
  return status;
}

/**
 * Prompt T, 8 — a coluna Dias distingue: atraso (previsão passada), a vencer
 * (previsão futura), hoje, e sem previsão. Base = previsão de ressarcimento,
 * senão a data do desembolso. `hoje` em ISO (do servidor). Puro.
 */
export type SituacaoDosDias = { tipo: "sem data" } | { tipo: "hoje" } | { tipo: "atraso"; dias: number } | { tipo: "a vencer"; dias: number };

export function situacaoDosDias(base: string | null | undefined, hojeISO: string): SituacaoDosDias {
  const p = (base ?? "").split("/");
  if (p.length !== 3) return { tipo: "sem data" };
  const d = Date.UTC(Number(p[2]), Number(p[0]) - 1, Number(p[1]));
  const [y, m, dd] = hojeISO.split("-").map(Number);
  const h = Date.UTC(y, m - 1, dd);
  if (!Number.isFinite(d) || !Number.isFinite(h)) return { tipo: "sem data" };
  const dias = Math.round((h - d) / 86_400_000);
  if (dias === 0) return { tipo: "hoje" };
  return dias > 0 ? { tipo: "atraso", dias } : { tipo: "a vencer", dias: -dias };
}

export function textoDosDias(s: SituacaoDosDias): string {
  if (s.tipo === "sem data") return "—";
  if (s.tipo === "hoje") return "hoje";
  return s.tipo === "atraso" ? `${s.dias} d em atraso` : `em ${s.dias} d`;
}

/**
 * Prompt T, 5 — busca por PED só pelo número: "70", "000070" e "PED-000070"
 * são a mesma busca (sufixo numérico). Devolve o número ou null quando o
 * termo não tem dígitos (aí a busca é textual no próprio PED, nunca em obs).
 */
export function sufixoNumericoDoPed(termo: string): number | null {
  const m = termo.trim().match(/(\d+)\s*$/);
  if (!m) return null;
  const n = Number(m[1]);
  return Number.isFinite(n) ? n : null;
}

/**
 * Saldo devido a um terceiro: total desembolsado por ele − total já restituído
 * (§13). Diferente de `saldoPendente`, NÃO faz clamp em zero: um saldo negativo
 * significa que se restituiu mais do que se devia e precisa ficar visível, não
 * ser mascarado.
 */
export function saldoDevidoTerceiro(
  totalDesembolsado: number,
  totalRestituido: number,
): number {
  return Math.round((totalDesembolsado - totalRestituido) * 100) / 100;
}

/**
 * A restituição cabe no saldo devido? Tolerância de 1 centavo para
 * arredondamento. Restituir acima do saldo geraria saída de caixa indevida.
 */
export function restituicaoCabe(
  valorTotal: number,
  jaRestituido: number,
  novoValor: number,
): boolean {
  if (!(novoValor > 0)) return false;
  return novoValor <= valorTotal - jaRestituido + 0.01;
}
