import {
  getDespesas,
  getExpenseRows,
  getMonthlyRevenue,
  getParcelasByVersion,
  getPermutas,
  getCash,
  permToResale,
} from "@/lib/queries";
import { permutaCashByMonth } from "@/lib/calc";
import { isBudgetVersion } from "@/lib/budget/config";
import { getRestituicoesPendentesByVersion } from "@/lib/actions/restituicoes";
import type { Version } from "@/lib/context";
// `vencMonth` vive em módulo puro para poder ser testada sem puxar banco/sessão.
import { vencMonth } from "@/lib/calc/mes-caixa";

export { vencMonth };

/**
 * Montagem do Fluxo de Caixa mensal.
 *
 * Extraído da página para poder ser VERIFICADO de forma automatizada — é a
 * função que decide o que entra e o que sai em cada mês, por versão.
 *
 * Regras:
 *  - cada versão traz o que foi lançado NELA;
 *  - Budget/Forecast → planejamento (budget_line), por competência;
 *  - Atual → parcelas e despesas lançadas, pelo mês do VENCIMENTO;
 *  - despesas canceladas não geram saída;
 *  - despesas pagas por terceiro não geram saída na competência (a saída
 *    ocorre na restituição).
 */


/** Mapas de entradas e saídas mensais de uma versão (budget-aware). */
export async function flowMaps(
  version: Version,
  projectId: string,
): Promise<{ entradas: Record<string, number>; saidas: Record<string, number> }> {
  const [entradas, despesas, permutas, parcelas] = await Promise.all([
    getMonthlyRevenue(version.id, projectId),
    getDespesas(version.id),
    getPermutas(version.id),
    getParcelasByVersion(version.id),
  ]);

  // Recebimentos da revenda de bens recebidos em permuta (item 10).
  const permCash = permutaCashByMonth(permToResale(permutas));
  for (const [mm, v] of Object.entries(permCash)) {
    entradas[mm] = (entradas[mm] || 0) + v;
  }

  const saidas: Record<string, number> = {};
  if (isBudgetVersion(version.kind)) {
    // Budget/Forecast: saídas do lançamento simplificado (por competência).
    const expenses = await getExpenseRows(version.id);
    for (const e of expenses) {
      const mm = vencMonth(e.competencia);
      if (mm) saidas[mm] = (saidas[mm] || 0) + e.valor;
    }
  } else {
    // Versão detalhada: despesas pagas por terceiro NÃO geram saída na
    // competência — a saída ocorre só na restituição (Fase 4).
    const { despesaIds: terceiroIds, saidasPrevistas: restPrevistas } =
      await getRestituicoesPendentesByVersion(version.id);
    const excluir = new Set(terceiroIds);
    const comParcela = new Set(parcelas.map((p) => p.despesaId));
    // Despesas CANCELADAS não geram saída. Antes só as parcelas canceladas eram
    // puladas, então uma despesa cancelada seguia inflando o fluxo — enquanto
    // sumia de Contas a Pagar, que filtra cancelado.
    const canceladas = new Set(despesas.filter((d) => d.cancelado).map((d) => d.id));
    for (const p of parcelas) {
      if (
        p.status === "Cancelado" ||
        excluir.has(p.despesaId) ||
        canceladas.has(p.despesaId)
      )
        continue;
      const mm = vencMonth(p.vencimento);
      if (mm) saidas[mm] = (saidas[mm] || 0) + Number(p.valorOriginal);
    }
    for (const d of despesas) {
      if (comParcela.has(d.id) || excluir.has(d.id) || d.cancelado) continue;
      const mm = vencMonth(d.vencimento) ?? vencMonth(d.competencia);
      if (mm) saidas[mm] = (saidas[mm] || 0) + Number(d.valor);
    }
    for (const [mm, v] of Object.entries(restPrevistas)) {
      saidas[mm] = (saidas[mm] || 0) + v;
    }
  }
  return { entradas, saidas };
}


/**
 * Fluxo REALIZADO — RG-01.
 *
 * O `flowMaps` acima monta o fluxo PREVISTO: ele projeta pelo VENCIMENTO das
 * parcelas e das despesas, ou seja, mostra o que se espera pagar e receber.
 * Isso é uma previsão, e continua valendo — é o que a empresa usa para se
 * programar.
 *
 * O que faltava era o outro lado da RG-01: o fluxo montado pela **data de
 * liquidação**, isto é, o dinheiro que de fato passou pela conta. É o que esta
 * função devolve, lendo `cash_entry` (os lançamentos do extrato e as baixas
 * conciliadas) pela data em que ocorreram.
 *
 * As duas visões convivem lado a lado e NENHUM número do previsto muda por
 * causa desta função: ela lê uma fonte diferente e não toca em `flowMaps`.
 *
 * Convenção de sinal de `cash_entry`: positivo entra, negativo sai. Aqui as
 * saídas são devolvidas em módulo, para somar na mesma escala do previsto.
 */
export async function flowMapsRealizado(
  versionId: string,
): Promise<{ entradas: Record<string, number>; saidas: Record<string, number> }> {
  const entradas: Record<string, number> = {};
  const saidas: Record<string, number> = {};
  const lancamentos = await getCash(versionId);
  for (const c of lancamentos) {
    // Sem data não há competência de caixa a atribuir — o lançamento existe,
    // mas não entra em nenhum mês (e some-lo do total seria pior do que
    // reportá-lo em mês errado).
    const mm = vencMonth(c.data);
    if (!mm) continue;
    const v = Number(c.valor);
    if (!Number.isFinite(v) || v === 0) continue;
    if (v > 0) entradas[mm] = (entradas[mm] || 0) + v;
    else saidas[mm] = (saidas[mm] || 0) + Math.abs(v);
  }
  return { entradas, saidas };
}
