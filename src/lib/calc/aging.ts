import { calcularAging, type FaixasAging } from "@/lib/calc/acerto";

/**
 * Prompt T, 2-A — aging das obrigações com terceiros, em UM lugar: usado pelo
 * preview do ressarcimento em lote, pela conta corrente por terceiro e pelo
 * total do topo. Data-base = previsão de ressarcimento, senão a data do
 * desembolso (a mesma da coluna Dias, 2-A.3). `hoje` em ISO (do servidor).
 */
export type { FaixasAging };

export interface ObrigacaoParaAging {
  saldo: number;
  dataPrevistaRestituicao: string | null;
  dataPagamentoOriginal: string | null;
}

/** Dias entre uma data interna "MM/DD/YYYY" e hoje (ISO); nunca negativo; sem data = 0. */
export function diasEmAberto(base: string | null | undefined, hojeISO: string): number {
  const p = (base ?? "").split("/");
  if (p.length !== 3) return 0;
  const d = Date.UTC(Number(p[2]), Number(p[0]) - 1, Number(p[1]));
  const [y, m, dd] = hojeISO.split("-").map(Number);
  const h = Date.UTC(y, m - 1, dd);
  if (!Number.isFinite(d) || !Number.isFinite(h)) return 0;
  return Math.max(0, Math.round((h - d) / 86_400_000));
}

export function dataBaseDoAging(o: Pick<ObrigacaoParaAging, "dataPrevistaRestituicao" | "dataPagamentoOriginal">): string | null {
  return o.dataPrevistaRestituicao ?? o.dataPagamentoOriginal;
}

export function agingDasObrigacoes(obrigacoes: readonly ObrigacaoParaAging[], hojeISO: string): FaixasAging {
  return calcularAging(obrigacoes.map((o) => ({ saldo: o.saldo, diasEmAberto: diasEmAberto(dataBaseDoAging(o), hojeISO) })));
}

export function somarAging(faixas: readonly FaixasAging[]): FaixasAging {
  const r = (v: number) => Math.round(v * 100) / 100;
  return faixas.reduce(
    (a, f) => ({ ate30: r(a.ate30 + f.ate30), de31a60: r(a.de31a60 + f.de31a60), de61a90: r(a.de61a90 + f.de61a90), acima90: r(a.acima90 + f.acima90) }),
    { ate30: 0, de31a60: 0, de61a90: 0, acima90: 0 },
  );
}
