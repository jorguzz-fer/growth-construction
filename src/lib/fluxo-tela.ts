/**
 * Regras da tabela do Fluxo de Caixa (Prompt AD). Módulo PURO.
 *
 * `flowMaps` (previsto, por vencimento) e `flowMapsRealizado` (realizado, por
 * liquidação) continuam separados e nenhum corrige o outro (RG-01). Aqui só
 * se monta o que a tabela mostra a partir dos dois — e o assistente (Parte 4)
 * lê ESTE resultado, nunca calcula por conta própria (4.2).
 */

export interface Mapas {
  entradas: Record<string, number>;
  saidas: Record<string, number>;
}

function mesIdx(mm: string): number {
  const [m, y] = mm.split("/").map(Number);
  return (y || 0) * 12 + ((m || 1) - 1);
}

/** Eixo (3.1): os meses dados MAIS os do previsto E os do realizado. */
export function eixoDoFluxo(base: Iterable<string>, previstos: readonly Mapas[], realizado: Mapas): string[] {
  const s = new Set<string>(base);
  for (const m of [...previstos, realizado]) for (const k of [...Object.keys(m.entradas), ...Object.keys(m.saidas)]) s.add(k);
  return [...s].filter((k) => /^\d{1,2}\/\d{4}$/.test(k)).sort((a, b) => mesIdx(a) - mesIdx(b));
}

export type EstadoDoDesvio = "ambos" | "so_previsto" | "so_realizado" | "nenhum";

export interface Desvio {
  estado: EstadoDoDesvio;
  /** realizado − previsto, no saldo do mês; só quando há os dois lados (5.3). */
  valor: number | null;
  /** sobre o |previsto| do mês; null sem previsto. */
  pct: number | null;
}

/**
 * Desvio do mês (Parte 5): realizado MENOS previsto, no saldo do mês, com o
 * sinal preservado — realizado maior que previsto é informação, não erro.
 * Só existe onde os dois lados existem (5.3): com um lado só, o estado diz
 * qual, e nenhum valor cheio é apresentado como desvio.
 */
export function desvioDoMes(prevE: number, prevS: number, realE: number, realS: number): Desvio {
  const temPrev = prevE !== 0 || prevS !== 0;
  const temReal = realE !== 0 || realS !== 0;
  if (!temPrev && !temReal) return { estado: "nenhum", valor: null, pct: null };
  if (!temReal) return { estado: "so_previsto", valor: null, pct: null };
  if (!temPrev) return { estado: "so_realizado", valor: null, pct: null };
  const prev = prevE - prevS;
  const valor = realE - realS - prev;
  return { estado: "ambos", valor, pct: prev !== 0 ? (valor / Math.abs(prev)) * 100 : null };
}

export const TEXTO_ESTADO: Record<EstadoDoDesvio, string> = {
  ambos: "",
  so_previsto: "sem realizado",
  so_realizado: "sem previsto",
  nenhum: "—",
};

export interface LinhaDoFluxo {
  mm: string;
  e: number;
  s: number;
  /** null em mês sem nenhum previsto (3.4: "—", não R$ 0). */
  liquido: number | null;
  realE: number;
  realS: number;
  desvio: Desvio;
  /** Saldo acumulado ao fim do mês. */
  saldo: number;
}

/**
 * As linhas da tabela para os meses pedidos, com o acumulado correndo desde o
 * saldo inicial sobre TODO o eixo (como antes: pelo previsto).
 */
export function linhasDoFluxo(
  eixo: readonly string[],
  meses: readonly string[],
  previsto: Mapas,
  realizado: Mapas,
  saldoInicial: number,
): LinhaDoFluxo[] {
  let acumulado = saldoInicial;
  const acum: Record<string, number> = {};
  for (const mm of eixo) {
    acumulado += (previsto.entradas[mm] || 0) - (previsto.saidas[mm] || 0);
    acum[mm] = acumulado;
  }
  return meses.map((mm) => {
    const e = previsto.entradas[mm] || 0;
    const s = previsto.saidas[mm] || 0;
    const realE = realizado.entradas[mm] || 0;
    const realS = realizado.saidas[mm] || 0;
    return {
      mm,
      e,
      s,
      liquido: e === 0 && s === 0 ? null : e - s,
      realE,
      realS,
      desvio: desvioDoMes(e, s, realE, realS),
      saldo: acum[mm] ?? saldoInicial,
    };
  });
}

export interface TotalDoDesvio {
  /** Soma do desvio só dos meses com os dois lados (5.2). */
  valor: number;
  pct: number | null;
  mesesComparados: number;
  soPrevisto: number;
  soRealizado: number;
}

export function totalDoDesvio(linhas: readonly LinhaDoFluxo[]): TotalDoDesvio {
  const comparados = linhas.filter((l) => l.desvio.estado === "ambos");
  const valor = comparados.reduce((a, l) => a + (l.desvio.valor ?? 0), 0);
  const prev = comparados.reduce((a, l) => a + (l.e - l.s), 0);
  return {
    valor,
    pct: prev !== 0 ? (valor / Math.abs(prev)) * 100 : null,
    mesesComparados: comparados.length,
    soPrevisto: linhas.filter((l) => l.desvio.estado === "so_previsto").length,
    soRealizado: linhas.filter((l) => l.desvio.estado === "so_realizado").length,
  };
}
