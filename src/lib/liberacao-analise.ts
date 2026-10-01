/**
 * Análises do assistente das Liberações de Obra (Prompt O, 6.2) — código
 * puro, sem modelo de IA. Tudo é conta sobre o que a página já carregou:
 * nada grava, nada sai do sistema.
 *
 * 6.4 — a liberação é ENTRADA DE CAIXA, nunca receita: nenhuma função aqui
 * soma liberação a receita, resultado ou margem, e nenhum rótulo a chama de
 * receita. Até as seções 54/56/57 do Prompt I entrarem em produção, os totais
 * de receita de cinco telas contam a liberação em duplicidade; o assistente
 * não repete esse número.
 */
import { dataGravadaValida } from "@/lib/permuta-regras";

export interface LiberacaoParaAnalise {
  id: string;
  /** MM/DD/YYYY (formato gravado). */
  data: string | null;
  origem: string | null;
  valor: number;
  pct: string | null;
  cancelado: boolean;
}

export interface MedicaoParaAnalise {
  /** "MM/YYYY". */
  competencia: string;
  valor: number;
}

/** "MM/DD/YYYY" → "MM/YYYY"; null quando a data não é válida. */
export function competenciaDaData(data: string | null | undefined): string | null {
  if (!dataGravadaValida(data)) return null;
  const [m, , a] = (data as string).trim().split("/");
  return `${m.padStart(2, "0")}/${a}`;
}

const ordemCompetencia = (c: string) => {
  const [m, a] = c.split("/").map(Number);
  return a * 100 + m;
};

export type ProblemaDoLancamento = "valor_invalido" | "data_invalida" | "origem_em_branco" | "pct_fora_de_faixa";

export interface LancamentoAConferir {
  id: string;
  rotulo: string;
  problemas: ProblemaDoLancamento[];
}

const rotulo = (l: LiberacaoParaAnalise) => `${l.data ?? "sem data"} · ${l.origem?.trim() || "sem origem"} · ${l.valor.toLocaleString("pt-BR", { style: "currency", currency: "BRL" })}`;

/** 6.2 · conferir lançamentos: valor ≤ 0, data ausente/inválida, origem em branco, "%" fora de 0–100 (só se preenchido). */
export function conferirLancamentos(liberacoes: readonly LiberacaoParaAnalise[]): LancamentoAConferir[] {
  const out: LancamentoAConferir[] = [];
  for (const l of liberacoes) {
    if (l.cancelado) continue;
    const problemas: ProblemaDoLancamento[] = [];
    if (!(l.valor > 0)) problemas.push("valor_invalido");
    if (!dataGravadaValida(l.data)) problemas.push("data_invalida");
    if (!l.origem?.trim()) problemas.push("origem_em_branco");
    const pct = (l.pct ?? "").trim();
    if (pct) {
      const n = Number(pct.replace("%", "").replace(",", "."));
      if (!Number.isFinite(n) || n < 0 || n > 100) problemas.push("pct_fora_de_faixa");
    }
    if (problemas.length) out.push({ id: l.id, rotulo: rotulo(l), problemas });
  }
  return out;
}

export interface CompetenciaComparada {
  competencia: string;
  medicao: number;
  liberado: number;
}

/**
 * 6.2 · comparar com a medição: competências com medição lançada e sem
 * liberação, e liberações em competência sem medição. Só competências com
 * valor de um lado e zero do outro.
 */
export function compararComMedicao(
  liberacoes: readonly LiberacaoParaAnalise[],
  medicoes: readonly MedicaoParaAnalise[],
): { medicaoSemLiberacao: CompetenciaComparada[]; liberacaoSemMedicao: CompetenciaComparada[] } {
  const med = new Map<string, number>();
  for (const m of medicoes) if (m.valor > 0) med.set(m.competencia, (med.get(m.competencia) ?? 0) + m.valor);
  const lib = new Map<string, number>();
  for (const l of liberacoes) {
    if (l.cancelado || !(l.valor > 0)) continue;
    const c = competenciaDaData(l.data);
    if (!c) continue;
    lib.set(c, (lib.get(c) ?? 0) + l.valor);
  }
  const medicaoSemLiberacao: CompetenciaComparada[] = [];
  for (const [c, v] of med) if (!(lib.get(c) ?? 0)) medicaoSemLiberacao.push({ competencia: c, medicao: v, liberado: 0 });
  const liberacaoSemMedicao: CompetenciaComparada[] = [];
  for (const [c, v] of lib) if (!(med.get(c) ?? 0)) liberacaoSemMedicao.push({ competencia: c, medicao: 0, liberado: v });
  const ord = (a: CompetenciaComparada, b: CompetenciaComparada) => ordemCompetencia(a.competencia) - ordemCompetencia(b.competencia);
  return { medicaoSemLiberacao: medicaoSemLiberacao.sort(ord), liberacaoSemMedicao: liberacaoSemMedicao.sort(ord) };
}

export interface LiberacaoPorCompetencia {
  competencia: string;
  liberado: number;
  acumulado: number;
}

export interface UnidadeComFinanciamento {
  status: string;
  valorFinanciado: number;
}

/**
 * 6.2 · liberações por competência: o que entrou mês a mês e o acumulado,
 * contra o previsto de financiamento das unidades vendidas (soma de
 * `Banco.valFinanc` das vendidas). É caixa contra previsão de caixa — não
 * receita.
 */
export function liberacoesPorCompetencia(
  liberacoes: readonly LiberacaoParaAnalise[],
  unidades: readonly UnidadeComFinanciamento[],
): { meses: LiberacaoPorCompetencia[]; total: number; previstoFinanciamento: number; percentualLiberado: number | null } {
  const porMes = new Map<string, number>();
  for (const l of liberacoes) {
    // Lançamento sem valor é problema de cadastro (conferir), não liberação.
    if (l.cancelado || !(l.valor > 0)) continue;
    const c = competenciaDaData(l.data);
    if (!c) continue;
    porMes.set(c, (porMes.get(c) ?? 0) + l.valor);
  }
  const meses: LiberacaoPorCompetencia[] = [];
  let acumulado = 0;
  for (const c of [...porMes.keys()].sort((a, b) => ordemCompetencia(a) - ordemCompetencia(b))) {
    acumulado = Math.round((acumulado + (porMes.get(c) ?? 0)) * 100) / 100;
    meses.push({ competencia: c, liberado: Math.round((porMes.get(c) ?? 0) * 100) / 100, acumulado });
  }
  const previsto = Math.round(unidades.filter((u) => (u.status || "").trim() === "Vendido").reduce((s, u) => s + (u.valorFinanciado > 0 ? u.valorFinanciado : 0), 0) * 100) / 100;
  return { meses, total: acumulado, previstoFinanciamento: previsto, percentualLiberado: previsto > 0 ? Math.round((acumulado / previsto) * 1000) / 10 : null };
}

export interface DuplicidadeAparente {
  data: string;
  origem: string;
  valor: number;
  ids: string[];
}

/** 6.2 · duplicidade aparente: mesmo valor, mesma data e mesma origem lançados mais de uma vez (canceladas não contam). */
export function duplicidadesAparentes(liberacoes: readonly LiberacaoParaAnalise[]): DuplicidadeAparente[] {
  const grupos = new Map<string, DuplicidadeAparente>();
  for (const l of liberacoes) {
    if (l.cancelado) continue;
    const origem = (l.origem ?? "").trim().toLowerCase();
    const k = `${(l.data ?? "").trim()}|${origem}|${l.valor.toFixed(2)}`;
    const g = grupos.get(k) ?? { data: (l.data ?? "").trim(), origem: (l.origem ?? "").trim(), valor: l.valor, ids: [] };
    g.ids.push(l.id);
    grupos.set(k, g);
  }
  return [...grupos.values()].filter((g) => g.ids.length > 1).sort((a, b) => b.valor - a.valor);
}

export interface AnaliseDeLiberacoes {
  conferir: LancamentoAConferir[];
  medicaoSemLiberacao: CompetenciaComparada[];
  liberacaoSemMedicao: CompetenciaComparada[];
  porCompetencia: ReturnType<typeof liberacoesPorCompetencia>;
  duplicidades: DuplicidadeAparente[];
  total: number;
}

export function analisarLiberacoes(
  liberacoes: readonly LiberacaoParaAnalise[],
  medicoes: readonly MedicaoParaAnalise[],
  unidades: readonly UnidadeComFinanciamento[],
): AnaliseDeLiberacoes {
  const cmp = compararComMedicao(liberacoes, medicoes);
  return {
    conferir: conferirLancamentos(liberacoes),
    medicaoSemLiberacao: cmp.medicaoSemLiberacao,
    liberacaoSemMedicao: cmp.liberacaoSemMedicao,
    porCompetencia: liberacoesPorCompetencia(liberacoes, unidades),
    duplicidades: duplicidadesAparentes(liberacoes),
    total: liberacoes.filter((l) => !l.cancelado).length,
  };
}

// ───────────── avisos no formulário de cadastro (6.2, parágrafo final) ─────────────

export interface AvisoDoFormulario {
  tipo: "competencia_com_medicao_sem_liberacao" | "lancamento_igual_existente";
  texto: string;
}

/**
 * Antes de salvar: a competência da data digitada tem medição e nenhuma
 * liberação (costuma ser justamente este lançamento), e valor+data+origem
 * coincidem com um lançamento já existente. Avisos, nunca preenchimento.
 */
export function avisosDoFormulario(
  digitado: { data: string | null; origem: string | null; valor: number | null },
  existentes: readonly LiberacaoParaAnalise[],
  medicoes: readonly MedicaoParaAnalise[],
): AvisoDoFormulario[] {
  const out: AvisoDoFormulario[] = [];
  const c = competenciaDaData(digitado.data);
  if (c) {
    const temMedicao = medicoes.some((m) => m.competencia === c && m.valor > 0);
    const temLiberacao = existentes.some((l) => !l.cancelado && competenciaDaData(l.data) === c);
    if (temMedicao && !temLiberacao) out.push({ tipo: "competencia_com_medicao_sem_liberacao", texto: `A competência ${c} tem medição lançada e ainda nenhuma liberação — este lançamento provavelmente é a dela.` });
  }
  const origem = (digitado.origem ?? "").trim().toLowerCase();
  if (digitado.data && origem && digitado.valor && digitado.valor > 0) {
    const igual = existentes.find((l) => !l.cancelado && (l.data ?? "").trim() === digitado.data!.trim() && (l.origem ?? "").trim().toLowerCase() === origem && Math.abs(l.valor - digitado.valor!) < 0.005);
    if (igual) out.push({ tipo: "lancamento_igual_existente", texto: "Já existe uma liberação com este valor, esta data e esta origem. Confira antes de lançar de novo." });
  }
  return out;
}
