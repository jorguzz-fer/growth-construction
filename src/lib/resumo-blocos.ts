/**
 * Resumo Executivo por pergunta (Prompt AE, Parte 1) — chave
 * "resumo_definicao_nova". Módulo PURO: recebe o que a página já leu do
 * banco e monta os blocos prontos. Os blocos que dependem de decisão aberta
 * entram com o MOTIVO escrito, nunca com número provisório (1.9).
 */
import type { VersionTotals } from "@/lib/calc/types";
import { ymd } from "@/lib/utils";

export const STATUS_DE_UNIDADE = ["Disponivel", "Reservado", "Vendido", "Permutado"] as const;

export interface UnidadeDoResumo {
  status: string;
  valor: number;
  mesVenda: string | null;
  /** O plano de pagamento tem alguma fonte com valor? */
  temPlano: boolean;
}

export type Vso =
  | { estado: "sem_periodo" }
  | { estado: "sem_data"; vendidasSemData: number }
  | { estado: "sem_oferta" }
  | { estado: "ok"; vendidasNoPeriodo: number; ofertaNoInicio: number; pct: number };

export interface BlocoVendas {
  vgvTotal: number;
  vgvVendido: number;
  porStatus: Record<(typeof STATUS_DE_UNIDADE)[number], number>;
  /** Contagem de TODAS as unidades (2.3: não é a soma de três filtros). */
  total: number;
  vso: Vso;
}

/** 1.4 · Vendas. VGV total conta todas; VGV vendido, só as Vendidas. */
export function blocoVendas(unidades: readonly UnidadeDoResumo[], de: string, ate: string): BlocoVendas {
  const porStatus = { Disponivel: 0, Reservado: 0, Vendido: 0, Permutado: 0 };
  for (const u of unidades) if (u.status in porStatus) porStatus[u.status as keyof typeof porStatus]++;
  return {
    vgvTotal: unidades.reduce((a, u) => a + u.valor, 0),
    vgvVendido: unidades.filter((u) => u.status === "Vendido").reduce((a, u) => a + u.valor, 0),
    porStatus,
    total: unidades.length,
    vso: vso(unidades, de, ate),
  };
}

/**
 * BAE-3 · VSO = vendidas no período ÷ oferta no início do período (as que
 * ainda não estavam vendidas). Sem período, ou com vendida sem data, NÃO é
 * calculado — a ausência é dita, nunca aproximada.
 */
export function vso(unidades: readonly UnidadeDoResumo[], de: string, ate: string): Vso {
  if (!de && !ate) return { estado: "sem_periodo" };
  const vendidas = unidades.filter((u) => u.status === "Vendido");
  const semData = vendidas.filter((u) => ymd(u.mesVenda) == null).length;
  if (semData > 0) return { estado: "sem_data", vendidasSemData: semData };
  const ini = ymd(de);
  const fim = ymd(ate);
  const vendidaAntes = (u: UnidadeDoResumo) => u.status === "Vendido" && ini != null && (ymd(u.mesVenda) as number) < ini;
  const oferta = unidades.filter((u) => u.status !== "Permutado" && !vendidaAntes(u)).length;
  if (oferta === 0) return { estado: "sem_oferta" };
  const noPeriodo = vendidas.filter((u) => {
    const d = ymd(u.mesVenda) as number;
    return (ini == null || d >= ini) && (fim == null || d <= fim);
  }).length;
  return { estado: "ok", vendidasNoPeriodo: noPeriodo, ofertaNoInicio: oferta, pct: (noPeriodo / oferta) * 100 };
}

export interface ContaEmAberto {
  saldo: number;
  vencida: boolean;
}

export interface BlocoExposicao {
  aReceber: { porVencer: number; vencido: number; contas: number } | null;
  aPagar: { porVencer: number; vencido: number; contas: number } | null;
  financiamento: { aprovado: number; liberado: number };
  permutaEmEstoque: number;
}

const somar = (xs: readonly ContaEmAberto[]) => {
  const abertas = xs.filter((x) => x.saldo > 0);
  return {
    porVencer: abertas.filter((x) => !x.vencida).reduce((a, x) => a + x.saldo, 0),
    vencido: abertas.filter((x) => x.vencida).reduce((a, x) => a + x.saldo, 0),
    contas: abertas.length,
  };
};

/**
 * 1.6 · Exposição — pelo SALDO, nunca o valor cheio. `null` quando o leitor
 * não tem permissão da tela de origem (5.4): ausência, não zero.
 */
export function blocoExposicao(o: {
  receber: readonly ContaEmAberto[] | null;
  pagar: readonly ContaEmAberto[] | null;
  totals: VersionTotals;
  permutas: readonly { status: string | null; estimado: number }[];
}): BlocoExposicao {
  return {
    aReceber: o.receber ? somar(o.receber) : null,
    aPagar: o.pagar ? somar(o.pagar) : null,
    financiamento: { aprovado: o.totals.banco, liberado: o.totals.reemb },
    // Permuta em estoque: recebida e ainda não vendida, pelo valor de entrada.
    permutaEmEstoque: o.permutas.filter((p) => (p.status ?? "") !== "Vendido").reduce((a, p) => a + p.estimado, 0),
  };
}

export interface LinhaDeAtencao {
  texto: string;
  href: string;
}

/** 1.7 · Atenção — só exceções CATEGÓRICAS (BAE-1 sem resposta). Nunca causa. */
export function blocoAtencao(o: {
  obra: string;
  projectId: string;
  temAtual: boolean;
  unidades: readonly UnidadeDoResumo[];
  despesasSemClassificacao: number | null;
}): LinhaDeAtencao[] {
  const out: LinhaDeAtencao[] = [];
  if (!o.temAtual) out.push({ texto: `${o.obra} não tem versão Atual: nenhum valor contratado a mostrar.`, href: `/projeto?proj=${o.projectId}` });
  const semPlano = o.unidades.filter((u) => u.status === "Vendido" && !u.temPlano);
  if (semPlano.length) out.push({ texto: `${semPlano.length} unidade(s) vendida(s) sem plano de pagamento — ${o.obra}.`, href: `/unidades?proj=${o.projectId}` });
  const semData = o.unidades.filter((u) => u.status === "Vendido" && ymd(u.mesVenda) == null);
  if (semData.length) out.push({ texto: `${semData.length} unidade(s) vendida(s) sem data de venda — o VSO não é calculável.`, href: `/unidades?proj=${o.projectId}` });
  if (o.despesasSemClassificacao)
    out.push({ texto: `${o.despesasSemClassificacao} despesa(s) da Atual sem categoria DRE ou sem competência.`, href: `/conferencia?proj=${o.projectId}` });
  return out;
}

/** 1.9 · Os blocos que ainda não entram, com o motivo que a tela escreve. */
export const BLOCOS_PENDENTES = {
  resultado:
    "Resultado (competência): depende da correção da receita no Prompt I (seções 54 a 58). Enquanto a receita tiver várias origens e leituras do plano, a margem não é confiável — por isso o bloco não mostra número.",
  caixa:
    "Caixa (regime de caixa): o saldo de hoje e a exposição máxima projetada dependem da decisão do ponto de partida do saldo (BAD-1, chave do Fluxo de Caixa). Até lá, veja o Fluxo de Caixa.",
  execucao: "Execução (físico × financeiro) fica fora da tela até a decisão da medição por serviço (BV-1).",
  comparativo: "Comparativo entre projetos: aparece quando a tela somar mais de um projeto; hoje o Resumo é de uma obra por vez.",
} as const;

/** O plano tem alguma fonte com valor? (sinal, periódicas, FGTS, subsídio ou financiamento) */
export function temPlanoDePagamento(plano: unknown): boolean {
  if (!plano || typeof plano !== "object") return false;
  return Object.values(plano as Record<string, unknown>).some((sec) => {
    if (!sec || typeof sec !== "object") return false;
    const s = sec as { val?: unknown; valFinanc?: unknown };
    return Number(s.val) > 0 || Number(s.valFinanc) > 0;
  });
}
