/**
 * Status exibido da despesa (Prompt I, §16) — uma função só para exibição,
 * filtro, ordenação e contadores. "Vencida" continua derivada da data, sem
 * persistir; "Cancelada", "Pago" e "Parcialmente paga" têm prioridade.
 */

/** "MM/DD/YYYY" → "YYYY-MM-DD" (comparável). Vazio quando a data não é válida. */
export function dataBRParaISO(d: string | null | undefined): string {
  if (!d) return "";
  const p = d.split("/");
  if (p.length !== 3) return "";
  const [m, dia, ano] = p;
  if (!/^\d{4}$/.test(ano) || !/^\d{1,2}$/.test(m) || !/^\d{1,2}$/.test(dia)) return "";
  return `${ano}-${m.padStart(2, "0")}-${dia.padStart(2, "0")}`;
}

/**
 * Hoje no formato ISO. Prompt R, 4.5 — a tela recebe este valor do SERVIDOR
 * (prop), nunca o calcula no navegador: relógio ou fuso errado na máquina do
 * usuário não pode mudar o conjunto de vencidas.
 */
export function hojeISO(agora: Date = new Date()): string {
  return `${agora.getFullYear()}-${String(agora.getMonth() + 1).padStart(2, "0")}-${String(agora.getDate()).padStart(2, "0")}`;
}

export const STATUS_VENCIDA = "Vencida";
export const STATUS_CANCELADA = "Cancelada";

/**
 * O status que a tela mostra, filtra, ordena e conta. Prioridade: cancelada →
 * pago / parcialmente paga (fato registrado) → vencida (data anterior a hoje)
 * → status gravado → "Em aberto".
 */
export function statusExibido(
  d: { status: string | null; vencimento: string | null; cancelado?: boolean },
  hoje: string = hojeISO(),
): string {
  if (d.cancelado) return STATUS_CANCELADA;
  if (d.status === "Pago" || d.status === STATUS_CANCELADA) return d.status;
  const iso = dataBRParaISO(d.vencimento);
  // Prompt R, 4.6 — parcialmente paga com vencimento passado está devendo o
  // saldo: é vencida (critério único para exibição, filtro, ordenação e
  // contadores). Vale nas duas telas que usam esta função.
  if (iso && iso < hoje) return STATUS_VENCIDA;
  return d.status || "Em aberto";
}

export function estaVencida(d: { status: string | null; vencimento: string | null; cancelado?: boolean }, hoje: string = hojeISO()): boolean {
  return statusExibido(d, hoje) === STATUS_VENCIDA;
}

/** Cor do selo pelo status exibido — a mesma nas duas telas. */
export function tomDoStatus(s: string): "success" | "danger" | "neutral" | "warning" {
  if (s === "Pago") return "success";
  if (s === STATUS_VENCIDA) return "danger";
  if (s === STATUS_CANCELADA) return "neutral";
  return "warning";
}
