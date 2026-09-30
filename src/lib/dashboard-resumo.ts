import type { Version } from "@/lib/context";

/** Indicadores de uma versão exibidos nos KPIs do Dashboard. */
export interface Summary {
  version: Version;
  vgv: number;
  realizado: number;
  receitaProj: number;
  aReceber: number;
  /** contas a pagar não pagas no período (só faz sentido na versão Atual). */
  aPagar: number;
  monthly: Record<string, number>;
  /** entradas realizadas (fechamentos de caixa) por mês "MM/YYYY". */
  realizadoMonthly: Record<string, number>;
}

/**
 * KPIs consolidados de um TIPO de versão (Prompt AA 2.3.4; decisão do usuário
 * em 30/09): soma, obra a obra, a versão daquele tipo — a mesma conta que o
 * Dashboard já faz para uma obra, repetida e somada. Obras sem versão do tipo
 * ficam de fora dessa coluna. Null se nenhuma obra tiver o tipo.
 */
export function somarResumos(kind: string, resumos: Summary[]): Summary | null {
  if (resumos.length === 0) return null;
  const soma = (sel: (s: Summary) => number) => resumos.reduce((a, s) => a + sel(s), 0);
  const juntar = (sel: (s: Summary) => Record<string, number>) => {
    const out: Record<string, number> = {};
    for (const r of resumos)
      for (const [mm, v] of Object.entries(sel(r))) out[mm] = (out[mm] || 0) + v;
    return out;
  };
  return {
    // Nome e cor da versão desse tipo na primeira obra — os mesmos que a tela
    // já mostrava; o id marca que a coluna é a soma.
    version: { ...resumos[0].version, id: `consolidado-${kind}`, kind: kind as Version["kind"] },
    vgv: soma((s) => s.vgv),
    realizado: soma((s) => s.realizado),
    receitaProj: soma((s) => s.receitaProj),
    aReceber: soma((s) => s.aReceber),
    aPagar: 0,
    monthly: juntar((s) => s.monthly),
    realizadoMonthly: juntar((s) => s.realizadoMonthly),
  };
}
