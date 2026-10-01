/**
 * Prompt Y, 4.4 / 4.6 — consumo por obra e confronto compra × consumo.
 * PURO e só leitura. A saída não realoca custo (BY-1): isto é informação de
 * gestão — material comprado numa obra e usado em outra —, nunca correção.
 */

export interface MovimentoParaObra {
  id: string;
  tipo: "entrada" | "saida" | string;
  /** quantidade × custo gravado. */
  valor: number;
  quantidade: number;
  /** obra do movimento (destino da saída; opcional na entrada). */
  projectId: string | null;
  despesaId: string | null;
  permutaId: string | null;
  /** obra da despesa de origem (a compra "pertence" a ela). */
  despesaProjectId: string | null;
  estornoDeId: string | null;
  itemId: string;
  itemNome: string;
  unidade: string;
}

const r2 = (v: number) => Math.round(v * 100) / 100;
const r3 = (v: number) => Math.round(v * 1000) / 1000;

export interface ConsumoDaObra {
  projectId: string;
  valor: number;
  itens: { itemId: string; itemNome: string; unidade: string; quantidade: number; valor: number }[];
}

/** 4.4 — quanto cada obra retirou (saídas de consumo; o estorno de uma saída devolve). */
export function consumoPorObra(movs: readonly MovimentoParaObra[]): ConsumoDaObra[] {
  const porObra = new Map<string, ConsumoDaObra>();
  for (const m of movs) {
    if (m.despesaId || m.permutaId) continue; // entradas de origem (e seus estornos) não são consumo
    if (!m.projectId) continue;
    const sinal = m.tipo === "saida" ? 1 : m.estornoDeId ? -1 : 0; // entrada sem origem só existe como estorno de saída
    if (sinal === 0) continue;
    const o = porObra.get(m.projectId) ?? { projectId: m.projectId, valor: 0, itens: [] };
    o.valor = r2(o.valor + sinal * m.valor);
    let it = o.itens.find((x) => x.itemId === m.itemId);
    if (!it) {
      it = { itemId: m.itemId, itemNome: m.itemNome, unidade: m.unidade, quantidade: 0, valor: 0 };
      o.itens.push(it);
    }
    it.quantidade = r3(it.quantidade + sinal * m.quantidade);
    it.valor = r2(it.valor + sinal * m.valor);
    porObra.set(m.projectId, o);
  }
  return [...porObra.values()].map((o) => ({ ...o, itens: o.itens.filter((i) => Math.abs(i.quantidade) > 0.0005).sort((a, b) => b.valor - a.valor) })).sort((a, b) => b.valor - a.valor);
}

export interface ConfrontoDaObra {
  projectId: string;
  /** entradas a custo cuja despesa é desta obra (estorno de entrada desconta). */
  comprou: number;
  /** saídas de consumo com destino nesta obra (estorno devolve). */
  consumiu: number;
  /** comprou − consumiu: positivo = comprou mais do que usou (foi para outra obra ou está no almoxarifado). */
  diferenca: number;
}

/** 4.6 — por obra: quanto COMPROU (pela despesa) e quanto CONSUMIU (pela saída). Leitura, nunca correção. */
export function confrontoCompraConsumo(movs: readonly MovimentoParaObra[]): ConfrontoDaObra[] {
  const comprou = new Map<string, number>();
  for (const m of movs) {
    if (!m.despesaId || !m.despesaProjectId) continue;
    const sinal = m.tipo === "entrada" ? 1 : -1; // saída com despesa = estorno da entrada
    comprou.set(m.despesaProjectId, r2((comprou.get(m.despesaProjectId) ?? 0) + sinal * m.valor));
  }
  const consumiu = new Map(consumoPorObra(movs).map((c) => [c.projectId, c.valor]));
  const obras = new Set([...comprou.keys(), ...consumiu.keys()]);
  return [...obras]
    .map((projectId) => {
      const c = comprou.get(projectId) ?? 0;
      const u = consumiu.get(projectId) ?? 0;
      return { projectId, comprou: c, consumiu: u, diferenca: r2(c - u) };
    })
    .sort((a, b) => Math.abs(b.diferenca) - Math.abs(a.diferenca));
}
