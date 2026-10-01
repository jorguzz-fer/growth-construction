/**
 * Leitura do laudo de medição (Prompt V, 6.2 "Ler o laudo anexado"). PURO:
 * o contrato do que a IA devolve e a COMPARAÇÃO com o que foi lançado.
 * Aponta divergência; NÃO preenche nada (6.3).
 */
export interface ItemDoLaudo {
  /** código do grupo CEF ("1".."10"), ou "" quando o laudo não o identifica. */
  grupo: string;
  /** nome do serviço/grupo como está no laudo. */
  descricao: string;
  /** % executado declarado no laudo (acumulado ou do período, como estiver escrito). null se não houver. */
  percentual: number | null;
  /** valor em R$ do laudo, se houver. */
  valor: number | null;
}

export interface LaudoLido {
  competencia: string;
  itens: ItemDoLaudo[];
  observacoes: string[];
}

export type TipoDeDivergencia = "grupo_sem_lancamento" | "lancamento_sem_laudo" | "valor_diferente" | "percentual_diferente" | "competencia_diferente";

export interface Divergencia {
  tipo: TipoDeDivergencia;
  grupo: string;
  descricao: string;
  /** o que o laudo diz. */
  laudo: string;
  /** o que está lançado. */
  lancado: string;
}

export interface ComparacaoDoLaudo {
  competencia: { laudo: string; medicao: string; igual: boolean };
  divergencias: Divergencia[];
  /** itens do laudo que bateram com o lançado. */
  conferem: number;
  observacoes: string[];
}

const r2 = (n: number) => Math.round(n * 100) / 100;
const brl = (n: number) => n.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });

/**
 * Compara o laudo com as medições LANÇADAS na mesma competência (por grupo)
 * e, quando há orçado por grupo, traduz o % do laudo em valor para conferir.
 * Tolerância de 1% no valor. Nunca sugere o que lançar: só diz o que difere.
 */
export function compararLaudoComLancado(laudo: LaudoLido, lancadas: readonly { grupoCode: string; competencia: string; valor: number }[], orcadoPorGrupo: Readonly<Record<string, number>>): ComparacaoDoLaudo {
  const divergencias: Divergencia[] = [];
  const porGrupo = new Map<string, number>();
  const competenciaMedicao = lancadas[0]?.competencia ?? "";
  for (const m of lancadas) porGrupo.set(m.grupoCode, (porGrupo.get(m.grupoCode) ?? 0) + m.valor);
  const vistos = new Set<string>();
  let conferem = 0;
  for (const it of laudo.itens) {
    if (!it.grupo) continue;
    vistos.add(it.grupo);
    const lancado = porGrupo.get(it.grupo);
    if (lancado == null) {
      divergencias.push({ tipo: "grupo_sem_lancamento", grupo: it.grupo, descricao: it.descricao, laudo: it.percentual != null ? `${it.percentual}%` : it.valor != null ? brl(it.valor) : "citado", lancado: "nada lançado" });
      continue;
    }
    if (it.valor != null) {
      if (Math.abs(it.valor - lancado) > Math.max(0.01, lancado * 0.01)) divergencias.push({ tipo: "valor_diferente", grupo: it.grupo, descricao: it.descricao, laudo: brl(it.valor), lancado: brl(lancado) });
      else conferem += 1;
      continue;
    }
    const orcado = orcadoPorGrupo[it.grupo];
    if (it.percentual != null && orcado > 0) {
      const valorDoLaudo = r2((orcado * it.percentual) / 100);
      if (Math.abs(valorDoLaudo - lancado) > Math.max(0.01, lancado * 0.01)) divergencias.push({ tipo: "percentual_diferente", grupo: it.grupo, descricao: it.descricao, laudo: `${it.percentual}% do orçado = ${brl(valorDoLaudo)}`, lancado: brl(lancado) });
      else conferem += 1;
      continue;
    }
    conferem += 1;
  }
  for (const [grupo, valor] of porGrupo) if (!vistos.has(grupo)) divergencias.push({ tipo: "lancamento_sem_laudo", grupo, descricao: "", laudo: "não consta no laudo", lancado: brl(valor) });
  const igual = !laudo.competencia || !competenciaMedicao || laudo.competencia === competenciaMedicao;
  if (!igual) divergencias.unshift({ tipo: "competencia_diferente", grupo: "", descricao: "competência", laudo: laudo.competencia, lancado: competenciaMedicao });
  return { competencia: { laudo: laudo.competencia, medicao: competenciaMedicao, igual }, divergencias, conferem, observacoes: laudo.observacoes };
}
