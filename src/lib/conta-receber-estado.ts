/**
 * Contas a Receber — estado DERIVADO, baixa e vínculo (Prompt K, seções 3 e 4).
 * Módulo PURO: a mesma conta vale nas actions, na tela e nos testes.
 *
 * O status deixa de ser digitado (3.2): nasce do que foi recebido contra o que
 * era devido, e do vínculo de cada recebimento com uma linha de extrato.
 */

export const FORMAS_DE_RECEBIMENTO = ["Extrato bancário", "Espécie", "Repasse de terceiro", "Outro"] as const;
export type FormaDeRecebimento = (typeof FORMAS_DE_RECEBIMENTO)[number];

/** Arredondamento de 1 centavo nas comparações de vínculo (RG-08). */
export const TOLERANCIA_CENTAVOS = 0.01;
/**
 * BK-3 — tolerância DECLARADA para a conta fechar com resíduo: R$ 323,97 numa
 * parcela de R$ 324,00 fecha, com a diferença de R$ 0,03 registrada na
 * auditoria. Acima disso a conta fica "Recebida" com saldo em aberto. Valor a
 * confirmar com o dono (Fase 1 do Prompt K, pergunta 4).
 */
export const TOLERANCIA_FECHAMENTO = 0.05;
const round2 = (v: number) => Math.round(v * 100) / 100;

export interface RecebimentoDaConta {
  id?: string;
  valor: number;
  data: string | null;
  /** Presente = conciliado com uma linha do extrato (4.1). */
  cashEntryId: string | null;
  estornado: boolean;
}

/** Os três estados da seção 3.1 (mais "Cancelada", que já existia). */
export type EstadoDaConta = "A receber" | "Recebida" | "Recebida e conciliada" | "Cancelada";

export interface EstadoCalculado {
  estado: EstadoDaConta;
  /** Soma dos recebimentos ativos. */
  recebido: number;
  /** Parte do recebido com linha de extrato. */
  conciliado: number;
  /** 3.5 — recebido SEM extrato: o número que denuncia extrato não importado. */
  naoConciliado: number;
  /** valor − recebido (nunca negativo na exibição). */
  saldo: number;
  /** Diferença dentro da tolerância que fechou a conta (BK-3), ou 0. */
  residuo: number;
  quitada: boolean;
  /** Valor gravado na coluna `status` (cache do derivado, lido pelo Fechamento e pela conciliação). */
  statusGravado: "A receber" | "Parcialmente recebido" | "Recebido" | "Cancelada";
}

export function estadoDaConta(c: { valor: number; cancelado: boolean; recebimentos: readonly RecebimentoDaConta[] }): EstadoCalculado {
  const ativos = c.recebimentos.filter((r) => !r.estornado);
  const recebido = round2(ativos.reduce((a, r) => a + r.valor, 0));
  const conciliado = round2(ativos.filter((r) => r.cashEntryId).reduce((a, r) => a + r.valor, 0));
  const naoConciliado = round2(recebido - conciliado);
  const diferenca = round2(c.valor - recebido);
  const quitada = recebido > 0 && diferenca <= TOLERANCIA_FECHAMENTO;
  const residuo = quitada && diferenca !== 0 ? diferenca : 0;
  const saldo = quitada ? 0 : Math.max(0, diferenca);
  let estado: EstadoDaConta;
  if (c.cancelado) estado = "Cancelada";
  else if (recebido <= 0) estado = "A receber";
  else if (quitada && naoConciliado === 0) estado = "Recebida e conciliada";
  else estado = "Recebida";
  const statusGravado = c.cancelado ? "Cancelada" : recebido <= 0 ? "A receber" : quitada ? "Recebido" : "Parcialmente recebido";
  return { estado, recebido, conciliado, naoConciliado, saldo, residuo, quitada, statusGravado };
}

export function ehFormaDeRecebimento(v: unknown): v is FormaDeRecebimento {
  return typeof v === "string" && (FORMAS_DE_RECEBIMENTO as readonly string[]).includes(v);
}

/** 3.4 — recebimento que não passa pelo banco é documento próprio, com justificativa obrigatória. */
export function formaExigeJustificativa(forma: FormaDeRecebimento): boolean {
  return forma !== "Extrato bancário";
}

export interface NovoRecebimento {
  valor: number;
  data: string | null;
  forma: string;
  justificativa: string | null;
  cashEntryId: string | null;
}

/**
 * Mensagem de recusa de uma baixa, ou null. `saldo` é o que falta receber na
 * conta; `disponivelNoMovimento` é quanto a linha do extrato ainda tem livre
 * (valor do movimento − vínculos já feitos), quando houver extrato (4.2).
 */
export function motivoDeRecusaDoRecebimento(
  r: NovoRecebimento,
  ctx: { saldo: number; disponivelNoMovimento?: number | null },
): string | null {
  if (!Number.isFinite(r.valor) || r.valor <= 0) return "Informe o valor recebido, maior que zero.";
  if (!r.data) return "Informe a data do recebimento.";
  if (!ehFormaDeRecebimento(r.forma)) return `Forma de recebimento inválida. Use: ${FORMAS_DE_RECEBIMENTO.join(", ")}.`;
  if (r.valor > ctx.saldo + TOLERANCIA_CENTAVOS) return `O valor passa do que falta receber (${ctx.saldo.toFixed(2)}).`;
  if (r.forma === "Extrato bancário") {
    if (!r.cashEntryId) return "Conciliar exige uma linha do extrato — escolha o movimento.";
    if (ctx.disponivelNoMovimento != null && r.valor > ctx.disponivelNoMovimento + TOLERANCIA_CENTAVOS) {
      return `A soma dos vínculos passa do valor do movimento (disponível ${ctx.disponivelNoMovimento.toFixed(2)}).`;
    }
  } else {
    if (r.cashEntryId) return "Linha do extrato só com a forma \"Extrato bancário\".";
    if (!(r.justificativa ?? "").trim()) return "Recebimento fora do banco exige justificativa.";
  }
  return null;
}

/** 3.5 — indicador permanente: recebido sem conciliar, em quantas contas e há quantos dias. */
export function indicadorSemConciliar(
  contas: readonly { recebimentos: readonly RecebimentoDaConta[] }[],
  hojeYmd: number,
): { valor: number; contas: number; diasMaisAntigo: number | null } {
  let valor = 0;
  let n = 0;
  let maisAntigo: number | null = null;
  for (const c of contas) {
    const semExtrato = c.recebimentos.filter((r) => !r.estornado && !r.cashEntryId);
    if (semExtrato.length === 0) continue;
    n += 1;
    valor += semExtrato.reduce((a, r) => a + r.valor, 0);
    for (const r of semExtrato) {
      const d = ymdNumero(r.data);
      if (d != null && (maisAntigo == null || d < maisAntigo)) maisAntigo = d;
    }
  }
  return { valor: round2(valor), contas: n, diasMaisAntigo: maisAntigo == null ? null : diasEntre(maisAntigo, hojeYmd) };
}

/** "MM/DD/YYYY" → YYYYMMDD; null se inválida. */
export function ymdNumero(s: string | null | undefined): number | null {
  const m = (s ?? "").trim().match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
  if (!m) return null;
  return Number(m[3]) * 10000 + Number(m[1]) * 100 + Number(m[2]);
}

export function diasEntre(deYmd: number, ateYmd: number): number {
  const d = (n: number) => new Date(Date.UTC(Math.floor(n / 10000), Math.floor((n % 10000) / 100) - 1, n % 100));
  return Math.max(0, Math.round((d(ateYmd).getTime() - d(deYmd).getTime()) / 86400000));
}
