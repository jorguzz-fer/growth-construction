/**
 * Prompt Q2 (Fase 3 · revisão V5, confirmado em 18/10): "o INCC é um só por
 * empresa". Módulo PURO: a comparação entre a série de cada obra e a série da
 * empresa, para a prévia da chave "incc_por_empresa" e para a tela de INCC.
 *
 * BQ2-1: quando as obras têm séries diferentes, qual vira a da empresa? A
 * pessoa ESCOLHE, adotando a série de uma obra (ação explícita, auditada); as
 * séries das obras ficam guardadas como estão, e desligar a chave volta a elas.
 */
import type { InccRow } from "@/lib/calc";

/** Rótulo da série da empresa onde a tela e as actions esperam um projeto. */
export const SERIE_DA_EMPRESA = "empresa";

export interface DiferencaDaSerie {
  /** meses em que a obra tem índice e a empresa também, com acumulado diferente. */
  mesesDiferentes: number;
  /** meses da obra sem índice na série da empresa (a leitura cai em 0%). */
  mesesSemEmpresa: number;
  /** maior diferença de acumulado, em pontos percentuais (empresa − obra). */
  maiorDiferenca: number;
  /** o mês da maior diferença. */
  mesDaMaior: string | null;
}

const r4 = (v: number) => Math.round(v * 10000) / 10000;

/** O que muda numa obra quando ela passa a ler a série da empresa. */
export function diferencaDaSerie(obra: readonly InccRow[], empresa: readonly InccRow[]): DiferencaDaSerie {
  const daEmpresa = new Map(empresa.map((r) => [r.m, r]));
  let mesesDiferentes = 0;
  let mesesSemEmpresa = 0;
  let maiorDiferenca = 0;
  let mesDaMaior: string | null = null;
  for (const r of obra) {
    const e = daEmpresa.get(r.m);
    if (!e) {
      mesesSemEmpresa++;
      continue;
    }
    const d = r4(e.ac - r.ac);
    if (Math.abs(d) > 0.00005) {
      mesesDiferentes++;
      if (Math.abs(d) > Math.abs(maiorDiferenca)) {
        maiorDiferenca = d;
        mesDaMaior = r.m;
      }
    }
  }
  return { mesesDiferentes, mesesSemEmpresa, maiorDiferenca, mesDaMaior };
}

/** A série muda alguma coisa nesta obra? */
export const mudaAlgo = (d: DiferencaDaSerie) => d.mesesDiferentes > 0 || d.mesesSemEmpresa > 0;
