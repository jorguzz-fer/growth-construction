/**
 * Baixa (confirmação de recebimento) de uma conta a receber.
 *
 * REGRA CONTÁBIL CENTRAL (RG-01 — competência ≠ caixa): a baixa é um evento de
 * CAIXA, e só. Ela registra que o dinheiro entrou — move o valor de "a receber"
 * para o banco — e aparece no Caixa Diário e no Fluxo de Caixa Realizado.
 *
 * O reconhecimento da receita é OUTRO eixo e não passa por aqui: a DRE apura a
 * receita por competência, a partir do plano de pagamento da venda
 * (`getMonthlyRevenue` → `expandUnitReceivables`), no mês do vencimento. Por
 * isso `impactoDreDaBaixa()` devolve 0, sempre — se a baixa somasse receita, o
 * mesmo dinheiro apareceria duas vezes: uma na competência, outra no caixa.
 *
 * Funções puras, sem I/O — testáveis isoladamente.
 */

/** Arredonda para centavos, evitando resíduo de ponto flutuante. */
function cent(n: number): number {
  return Math.round(n * 100) / 100;
}

/** Tolerância de 1 centavo para comparações de fechamento. */
const TOL = 0.01;

/** Saldo ainda a receber. Nunca negativo — recebimento a maior não vira crédito aqui. */
export function saldoAReceber(valor: number, valorRecebido: number): number {
  return Math.max(0, cent(valor - valorRecebido));
}

/**
 * A baixa cabe no saldo? Recusa valor zero/negativo e recebimento acima do
 * saldo — que criaria entrada de caixa sem lastro na conta.
 */
export function baixaCabe(
  valor: number,
  jaRecebido: number,
  novoValor: number,
): boolean {
  if (!Number.isFinite(novoValor) || novoValor <= 0) return false;
  return novoValor <= valor - jaRecebido + TOL;
}

/** Status da conta depois de acumular `totalRecebido`. */
export function statusAposBaixa(
  valor: number,
  totalRecebido: number,
): "A receber" | "Parcialmente recebido" | "Recebido" {
  if (totalRecebido <= 0) return "A receber";
  if (totalRecebido + TOL >= valor) return "Recebido";
  return "Parcialmente recebido";
}

/**
 * Impacto da baixa na DRE: ZERO, em qualquer cenário (RG-01).
 *
 * Existe como função — e não como comentário — para que o teste automatizado
 * trave a regra: se alguém um dia fizer a baixa lançar receita, o teste quebra.
 */
export function impactoDreDaBaixa(): number {
  return 0;
}

/** Impacto da baixa no CAIXA: entrada positiva pelo valor recebido. */
export function impactoCaixaDaBaixa(valorRecebido: number): number {
  return cent(Math.abs(valorRecebido));
}

/**
 * Categoria (`cat`) do lançamento de caixa gerado pela baixa manual. É o que
 * distingue, na volta, uma baixa feita nesta tela de um movimento que veio do
 * extrato bancário — o segundo não pode ser apagado daqui.
 */
export const CAT_BAIXA_RECEBER = "recebimento";

/** Uma baixa já registrada (movimento de caixa vinculado à conta a receber). */
export interface BaixaRegistrada {
  cashEntryId: string;
  data: string | null;
  valor: number;
  cat: string | null;
}

/**
 * De onde veio a baixa. "manual" é a que esta tela criou (e pode estornar);
 * "caixa" é conciliação com o extrato/Caixa Diário — o movimento é do banco e
 * só se desfaz na tela do Caixa, onde o extrato vive.
 */
export function origemDaBaixa(cat: string | null): "manual" | "caixa" {
  return cat === CAT_BAIXA_RECEBER ? "manual" : "caixa";
}

/** Total efetivamente baixado (soma dos movimentos de caixa vinculados). */
export function totalBaixado(baixas: BaixaRegistrada[]): number {
  return cent(baixas.reduce((a, b) => a + Math.abs(b.valor), 0));
}

/**
 * A conta tem alguma baixa originada no Caixa Diário (conciliação com extrato)?
 * É o que a tela usa para mostrar "Conciliada no caixa" em vez de "Baixa manual".
 */
export function conciliadaNoCaixa(baixas: BaixaRegistrada[]): boolean {
  return baixas.some((b) => origemDaBaixa(b.cat) === "caixa");
}

/**
 * Rótulo de conferência quando o status gravado na conta e a soma das baixas
 * divergem. NÃO corrige nada — devolve a divergência para aparecer na tela e
 * ser tratada por gente (as regras novas não são retroativas, e contas antigas
 * podem ter sido marcadas "Recebido" à mão, antes de existir baixa).
 */
export function divergenciaDeBaixa(
  valorRecebido: number,
  baixas: BaixaRegistrada[],
): number {
  return cent(valorRecebido - totalBaixado(baixas));
}

/**
 * A conta pode receber baixa? Cancelada não, sem saldo não. Devolve o motivo
 * para a tela explicar por que o botão está desabilitado.
 */
export function podeBaixar(
  valor: number,
  valorRecebido: number,
  cancelado: boolean,
): { ok: true } | { ok: false; motivo: string } {
  if (cancelado) return { ok: false, motivo: "Conta cancelada." };
  if (saldoAReceber(valor, valorRecebido) <= 0) {
    return { ok: false, motivo: "Conta já totalmente recebida." };
  }
  return { ok: true };
}

/**
 * Estado da conta após ESTORNAR uma baixa de `valor`. Espelho exato de
 * `statusAposBaixa` — o estorno devolve a conta ao estado anterior, nunca a um
 * estado inventado. Faz clamp em zero: estornar mais do que se recebeu não
 * pode gerar recebido negativo.
 */
export function aposEstorno(
  valor: number,
  valorRecebido: number,
  valorEstornado: number,
): { valorRecebido: number; status: "A receber" | "Parcialmente recebido" | "Recebido" } {
  const novo = Math.max(0, cent(valorRecebido - Math.abs(valorEstornado)));
  return { valorRecebido: novo, status: statusAposBaixa(valor, novo) };
}
