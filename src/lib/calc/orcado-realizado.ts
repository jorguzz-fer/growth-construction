/**
 * Orçado x Realizado da tela de Projetos (Prompt B, 19–21). Módulo PURO.
 *
 * Decisão B-2: Orçado = versão `budget` do projeto (as `budget_line`, a
 * mesma fonte da tela de Orçamentos); Realizado = versão `atual`, por
 * COMPETÊNCIA, com a mesma conta da DRE (`waterfall`). As três linhas:
 *   Receita   = linha "Receita" da DRE;
 *   Custo     = tudo o que a DRE deduz (custos, despesas, retiradas,
 *               investimentos, empréstimos, encargos) = Receita − Resultado;
 *   Resultado = "Resultado Final" da DRE (seção 21: regra existente).
 * Ausência não é zero: sem orçamento e sem lançamento são estados próprios.
 */
import { waterfall, type Inputs } from "@/lib/calc/dre-cascata";

export const REGIME_DO_REALIZADO = "Realizado por competência — a mesma regra da DRE";

export interface LadoDoCard {
  receita: number;
  custo: number;
  resultado: number;
}

export type ChaveDoCard = "receita" | "custo" | "resultado";
export type TomDaLinha = "bom" | "alerta" | "neutro";

export interface LinhaDoCard {
  chave: ChaveDoCard;
  rotulo: string;
  orcado: number | null;
  realizado: number | null;
  /** % de execução (realizado / orçado × 100, 1 casa); null sem base. */
  execucao: number | null;
  tom: TomDaLinha;
}

export interface CardOrcadoRealizado {
  linhas: LinhaDoCard[];
  semOrcamento: boolean;
  semLancamentos: boolean;
  regime: string;
}

const r2 = (n: number) => Math.round(n * 100) / 100;

/** Receita, custo (tudo que deduz) e resultado final a partir dos inputs da DRE. */
export function ladoDe(i: Inputs): LadoDoCard {
  const wf = waterfall([i]);
  const resultado = r2(wf.rows.find((r) => r.kind === "final")?.value ?? 0);
  const receita = r2(wf.R);
  return { receita, custo: r2(receita - resultado), resultado };
}

/** % de execução; null quando não há orçado (ou é zero) ou não há realizado. */
export function execucao(orcado: number | null, realizado: number | null): number | null {
  if (orcado == null || realizado == null || Math.abs(orcado) < 0.005) return null;
  return Math.round((realizado / orcado) * 1000) / 10;
}

/**
 * A cor segue o significado, não o percentual (19): receita acima do previsto
 * é bom; custo acima do previsto é alerta; resultado acima é bom, e resultado
 * realizado negativo é alerta. Sem base de comparação, neutro.
 */
export function tomDaLinha(chave: ChaveDoCard, pct: number | null, realizado: number | null): TomDaLinha {
  if (chave === "resultado" && realizado != null && realizado < 0) return "alerta";
  if (pct == null) return "neutro";
  if (chave === "custo") return pct > 100 ? "alerta" : "bom";
  return pct >= 100 ? "bom" : "neutro";
}

const ROTULOS: Record<ChaveDoCard, string> = { receita: "Receita", custo: "Custos e despesas", resultado: "Resultado" };

export function montarCard(orcado: Inputs | null, realizado: Inputs | null): CardOrcadoRealizado {
  const o = orcado ? ladoDe(orcado) : null;
  const re = realizado ? ladoDe(realizado) : null;
  const linhas = (["receita", "custo", "resultado"] as ChaveDoCard[]).map((chave) => {
    const vo = o ? o[chave] : null;
    const vr = re ? re[chave] : null;
    const pct = execucao(vo, vr);
    return { chave, rotulo: ROTULOS[chave], orcado: vo, realizado: vr, execucao: pct, tom: tomDaLinha(chave, pct, vr) };
  });
  return { linhas, semOrcamento: !orcado, semLancamentos: !realizado, regime: REGIME_DO_REALIZADO };
}
