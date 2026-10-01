/**
 * Regras PURAS do ciclo do cartão de crédito (Prompt U, seções 1 e 2).
 * Datas no formato interno "MM/DD/YYYY". Nada aqui lê banco.
 *
 * - Compra ATÉ o dia de fechamento entra na fatura que fecha naquele mês;
 *   DEPOIS, na seguinte (2.1).
 * - Vencimento vem do dia de vencimento do cartão (2.2). Quando o dia de
 *   vencimento é MENOR ou igual ao de fechamento (fecha 28, vence 5), a fatura
 *   vence no MÊS SEGUINTE ao fechamento.
 * - Compra parcelada: a 1ª parcela segue 2.1; as demais, uma por ciclo (2.3).
 * - Dia maior que o mês (31 em fevereiro) cai no último dia do mês.
 */

export interface CicloDoCartao {
  diaFechamento: number;
  diaVencimento: number;
}

/** Uma fatura do ciclo: quando fecha e quando vence ("MM/DD/YYYY"). */
export interface FaturaDoCiclo {
  fechamento: string;
  vencimento: string;
}

interface AnoMes {
  ano: number;
  mes: number; // 1..12
}

const pad = (n: number) => String(n).padStart(2, "0");
const ultimoDia = (ano: number, mes: number) => new Date(Date.UTC(ano, mes, 0)).getUTCDate();
const dia = (ano: number, mes: number, d: number) => Math.min(Math.max(1, d), ultimoDia(ano, mes));
const texto = (am: AnoMes, d: number) => `${pad(am.mes)}/${pad(dia(am.ano, am.mes, d))}/${am.ano}`;
const mesSeguinte = (am: AnoMes): AnoMes => (am.mes === 12 ? { ano: am.ano + 1, mes: 1 } : { ano: am.ano, mes: am.mes + 1 });

function lerData(s: string | null | undefined): { am: AnoMes; d: number } | null {
  const p = (s ?? "").trim().split("/");
  if (p.length !== 3) return null;
  const [mes, d, ano] = p.map(Number);
  if (!ano || !mes || !d || mes < 1 || mes > 12 || d < 1 || d > 31) return null;
  return { am: { ano, mes }, d };
}

/** Mês/ano em que fecha a fatura que recebe uma compra feita na data (2.1). */
function mesDoFechamento(data: string, c: CicloDoCartao): AnoMes | null {
  const l = lerData(data);
  if (!l) return null;
  const fechaEm = dia(l.am.ano, l.am.mes, c.diaFechamento);
  return l.d <= fechaEm ? l.am : mesSeguinte(l.am);
}

/** Fatura do mês de fechamento: fecha nesse mês, vence no mesmo ou no seguinte (2.2). */
function faturaDoMes(am: AnoMes, c: CicloDoCartao): FaturaDoCiclo {
  const venceNoMesSeguinte = c.diaVencimento <= c.diaFechamento;
  return { fechamento: texto(am, c.diaFechamento), vencimento: texto(venceNoMesSeguinte ? mesSeguinte(am) : am, c.diaVencimento) };
}

/** Em que fatura cai uma compra feita na data ("MM/DD/YYYY"); null se a data é inválida. */
export function faturaDaCompra(dataCompra: string, c: CicloDoCartao): FaturaDoCiclo | null {
  const am = mesDoFechamento(dataCompra, c);
  return am ? faturaDoMes(am, c) : null;
}

/** Compra em N parcelas: a 1ª segue `faturaDaCompra`; as demais, uma por ciclo seguinte (2.3). */
export function faturasDasParcelas(dataCompra: string, qtd: number, c: CicloDoCartao): FaturaDoCiclo[] {
  let am = mesDoFechamento(dataCompra, c);
  if (!am) return [];
  const n = Math.max(1, Math.floor(qtd));
  const out: FaturaDoCiclo[] = [];
  for (let i = 0; i < n; i++) {
    out.push(faturaDoMes(am, c));
    am = mesSeguinte(am);
  }
  return out;
}

/** A fatura ABERTA hoje: a que receberia uma compra feita agora. `hoje` em ISO (servidor). */
export function cicloAberto(hojeISO: string, c: CicloDoCartao): FaturaDoCiclo | null {
  const [y, m, d] = hojeISO.split("-");
  return faturaDaCompra(`${m}/${d}/${y}`, c);
}

/** A fatura seguinte à informada (mesmo cartão). */
export function faturaSeguinte(f: FaturaDoCiclo, c: CicloDoCartao): FaturaDoCiclo | null {
  const l = lerData(f.fechamento);
  return l ? faturaDoMes(mesSeguinte(l.am), c) : null;
}

/** Divide o total em N parcelas de centavos exatos; a última absorve o arredondamento (soma fecha sempre). */
export function valoresDasParcelas(total: number, n: number): number[] {
  const qtd = Math.max(1, Math.floor(n));
  const cents = Math.round(total * 100);
  const base = Math.floor(cents / qtd);
  const out = Array.from({ length: qtd }, () => base);
  out[qtd - 1] = cents - base * (qtd - 1);
  return out.map((c) => c / 100);
}

/** Limite disponível = limite − comprometido (ciclo aberto + parcelas futuras); null sem limite cadastrado. */
export function disponivelDoLimite(limite: number | null, comprometido: number): number | null {
  if (limite == null) return null;
  return Math.round((limite - comprometido) * 100) / 100;
}

/**
 * Só os quatro últimos dígitos entram (1.2, teste 17). Receber mais que quatro
 * dígitos é RECUSADO, não truncado: o número completo não passa pelo servidor
 * como dado aceito.
 */
export function somenteUltimos4(entrada: string | null | undefined): { ok: true; ultimos4: string | null } | { ok: false; error: string } {
  const digitos = (entrada ?? "").replace(/\D/g, "");
  if (digitos.length === 0) return { ok: true, ultimos4: null };
  if (digitos.length !== 4) return { ok: false, error: "Informe apenas os 4 últimos dígitos do cartão. O número completo não é guardado em hipótese nenhuma." };
  return { ok: true, ultimos4: digitos };
}

export interface CamposDoCartao {
  apelido: string;
  diaFechamento: number;
  diaVencimento: number;
  limite: number | null;
  taxaRotativo: number | null;
}

/** Motivo para recusar o cadastro, ou null quando está em ordem. */
export function recusaDoCartao(c: CamposDoCartao): string | null {
  if (!c.apelido.trim()) return "Dê um apelido ao cartão (ex.: Itaú final 1234).";
  const diaOk = (d: number) => Number.isInteger(d) && d >= 1 && d <= 31;
  if (!diaOk(c.diaFechamento)) return "Dia de fechamento precisa ser de 1 a 31.";
  if (!diaOk(c.diaVencimento)) return "Dia de vencimento precisa ser de 1 a 31.";
  if (c.limite != null && !(c.limite >= 0)) return "Limite não pode ser negativo.";
  if (c.taxaRotativo != null && !(c.taxaRotativo >= 0 && c.taxaRotativo <= 100)) return "Taxa do rotativo precisa estar entre 0 e 100% ao mês.";
  return null;
}
