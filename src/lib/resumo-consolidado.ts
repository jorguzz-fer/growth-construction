/**
 * Resumo Executivo com várias obras (decisão de 01/10/2026). Módulo PURO.
 *
 * - Seletor de projeto igual ao do Dashboard: uma obra, ou Todos / Ativos /
 *   Finalizados.
 * - Uma coluna por tipo de versão (Atual, Orçamento, Previsão Atualizada),
 *   somando as obras do escopo. Obra SEM aquele tipo sai da coluna — não entra
 *   como zero — e a coluna declara a cobertura ("2 de 3 projetos").
 * - Valores somam; percentual se RECALCULA dos totais, nunca é média.
 * - O comparativo por obra só aparece com mais de uma obra.
 */
import { ROTULO_DA_NATUREZA } from "@/lib/dashboard-tela";
import type { IndicadorDoResumo } from "@/lib/resumo-tela";

/** Mesma ordem do consolidado do Dashboard. */
export const TIPOS_DO_RESUMO = ["atual", "budget", "forecast"] as const;
export type TipoDoResumo = (typeof TIPOS_DO_RESUMO)[number];

/** A versão de cada tipo numa obra: a mais antiga do tipo, como no Dashboard. */
export function versaoDoTipo<V extends { kind: string }>(versoes: readonly V[], tipo: TipoDoResumo): V | null {
  return versoes.find((v) => v.kind === tipo) ?? null;
}

/**
 * Soma indicador a indicador (pelo rótulo, na ordem da primeira lista). Fica
 * "vazio" só quando TODAS as obras da coluna estão vazias naquele indicador.
 */
export function somarIndicadores(listas: readonly (readonly IndicadorDoResumo[])[]): IndicadorDoResumo[] {
  const ordem: string[] = [];
  const acc = new Map<string, IndicadorDoResumo>();
  for (const lista of listas)
    for (const i of lista) {
      const a = acc.get(i.label);
      if (!a) {
        ordem.push(i.label);
        acc.set(i.label, { ...i });
      } else {
        a.value += i.value;
        a.vazio = a.vazio && i.vazio;
      }
    }
  return ordem.map((l) => acc.get(l)!);
}

export interface UnidadesSomadas {
  disp: number;
  res: number;
  vend: number;
  /** Todas as unidades cadastradas (inclui Permutadas). */
  total: number;
}

export function somarUnidades(xs: readonly UnidadesSomadas[]): UnidadesSomadas {
  return xs.reduce((a, x) => ({ disp: a.disp + x.disp, res: a.res + x.res, vend: a.vend + x.vend, total: a.total + x.total }), { disp: 0, res: 0, vend: 0, total: 0 });
}

/** "Previsão Atualizada: 2 de 3 projetos". */
export function textoDaCobertura(tipo: string, comTipo: number, total: number): string {
  return `${ROTULO_DA_NATUREZA[tipo] ?? tipo}: ${comTipo} de ${total} projeto${total === 1 ? "" : "s"}`;
}

/** Percentual a partir de numerador e denominador SOMADOS; null sem base. */
export function percentual(num: number, den: number): number | null {
  return den > 0 ? (num / den) * 100 : null;
}

export interface LinhaComparativa {
  obra: string;
  projectId: string;
  /** null = a obra não tem versão Atual (fica fora dos totais). */
  vgv: number | null;
  vgvVendido: number | null;
  vendidas: number | null;
  unidades: number | null;
  /** Custo até o mês corrente; null = sem permissão ou sem Atual. */
  custoRealizado: number | null;
  /** null = sem Orçamento para comparar. */
  custoOrcado: number | null;
}

export interface TotalComparativo {
  vgv: number;
  vgvVendido: number;
  vendidas: number;
  unidades: number;
  /** % de unidades vendidas, recalculado das somas. */
  pctVendidas: number | null;
  /** Só obras COM Orçamento entram no desvio — os dois lados nas mesmas obras. */
  custoRealizadoComOrcamento: number;
  custoOrcado: number;
  desvio: number | null;
  pctDesvio: number | null;
  obrasComAtual: number;
  obrasComOrcamento: number;
}

export function totalDoComparativo(linhas: readonly LinhaComparativa[]): TotalComparativo {
  const comAtual = linhas.filter((l) => l.vgv != null);
  const comOrcamento = linhas.filter((l) => l.custoOrcado != null && l.custoRealizado != null);
  const s = (xs: readonly LinhaComparativa[], f: (l: LinhaComparativa) => number | null) => xs.reduce((a, l) => a + (f(l) ?? 0), 0);
  const vendidas = s(comAtual, (l) => l.vendidas);
  const unidades = s(comAtual, (l) => l.unidades);
  const real = s(comOrcamento, (l) => l.custoRealizado);
  const orc = s(comOrcamento, (l) => l.custoOrcado);
  return {
    vgv: s(comAtual, (l) => l.vgv),
    vgvVendido: s(comAtual, (l) => l.vgvVendido),
    vendidas,
    unidades,
    pctVendidas: percentual(vendidas, unidades),
    custoRealizadoComOrcamento: real,
    custoOrcado: orc,
    desvio: comOrcamento.length ? real - orc : null,
    pctDesvio: comOrcamento.length ? percentual(real - orc, orc) : null,
    obrasComAtual: comAtual.length,
    obrasComOrcamento: comOrcamento.length,
  };
}
