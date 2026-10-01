/**
 * Assistente do Fluxo de Caixa (Prompt AD, Parte 4; Prompt E, Etapa 1).
 * Módulo PURO, SOMENTE LEITURA.
 *
 * Regra que sustenta tudo (4.2): o assistente NÃO calcula por conta própria.
 * Os mapas vêm de `flowMaps`/`flowMapsRealizado` (os mesmos da tabela), e
 * linhas, desvio e total vêm de `linhasDoFluxo`/`totalDoDesvio` — as mesmas
 * funções que montam a coluna "Desvio". Aqui só se escolhe, ordena e escreve.
 * Nunca afirma causa, nunca compara com versão ausente, nunca projeta saldo e
 * nunca grava. Nada daqui vai a modelo de IA.
 */
import { linhasDoFluxo, totalDoDesvio, type LinhaDoFluxo, type Mapas, type TotalDoDesvio } from "@/lib/fluxo-tela";

export type CenarioDoFluxo = "budget" | "forecast";
/** BAD-3 — as duas leituras nunca aparecem sob o mesmo rótulo. */
export type Leitura = "caixa_x_plano" | "previsao_x_plano";

export const ROTULO_LEITURA: Record<Leitura, string> = {
  caixa_x_plano: "Caixa realizado × plano",
  previsao_x_plano: "Previsão de hoje × plano",
};

/** 4.5.1 — o regime dos dois lados, dito sempre. */
export const REGIME: Record<Leitura, string> = {
  caixa_x_plano:
    "Realizado é caixa, pela data de liquidação, da versão Atual; o plano é planejamento, por competência. A comparação atravessa regimes.",
  previsao_x_plano:
    "Os dois lados são previsão: a da Atual (o que se espera hoje), pelo vencimento das parcelas; a do plano aprovado, por competência.",
};

/** O que o servidor entrega de cada cenário (já validado contra o tenant). */
export interface LadoDoCenario {
  cenario: CenarioDoFluxo;
  nome: string;
  /** 4.5.2 — o rótulo que o usuário deu (um projeto) ou "de cada projeto". */
  versao: string | null;
  /** 4.5.3 — "Orçamento: 2 de 3 projetos; 1 sem Orçamento fica fora dos dois lados." */
  cobertura: string | null;
  /** Por que NÃO há comparação. Preenchido ⇒ mapas nulos (4.6). */
  ausente: string | null;
  plano: Mapas | null;
  /** Realizado da Atual, só dos projetos que têm o cenário. */
  realizado: Mapas | null;
  /** Previsto da Atual, dos mesmos projetos. */
  previstoAtual: Mapas | null;
}

export interface MaiorDesvio {
  mm: string;
  valor: number;
  pct: number | null;
}

export interface Comparacao {
  leitura: Leitura;
  linhas: LinhaDoFluxo[];
  total: TotalDoDesvio;
  /** Meses com os dois lados, do maior desvio absoluto para o menor. */
  ordenadas: MaiorDesvio[];
}

/** Compara um lado com o plano pelas MESMAS funções da tabela. */
export function comparar(leitura: Leitura, plano: Mapas, lado: Mapas, meses: readonly string[]): Comparacao {
  // O saldo acumulado não é lido aqui — o assistente não projeta saldo (4.6).
  const linhas = linhasDoFluxo(meses, meses, plano, lado, 0);
  const total = totalDoDesvio(linhas);
  const ordenadas = linhas
    .filter((l) => l.desvio.estado === "ambos" && l.desvio.valor !== 0)
    .map((l) => ({ mm: l.mm, valor: l.desvio.valor as number, pct: l.desvio.pct }))
    .sort((a, b) => Math.abs(b.valor) - Math.abs(a.valor));
  return { leitura, linhas, total, ordenadas };
}

export interface AnaliseDoCenario {
  cenario: CenarioDoFluxo;
  nome: string;
  versao: string | null;
  cobertura: string | null;
  ausente: string | null;
  caixa: Comparacao | null;
  previsao: Comparacao | null;
}

export function analisarCenario(lado: LadoDoCenario, meses: readonly string[]): AnaliseDoCenario {
  const base = { cenario: lado.cenario, nome: lado.nome, versao: lado.versao, cobertura: lado.cobertura, ausente: lado.ausente };
  if (lado.ausente || !lado.plano) return { ...base, caixa: null, previsao: null };
  return {
    ...base,
    caixa: lado.realizado ? comparar("caixa_x_plano", lado.plano, lado.realizado, meses) : null,
    previsao: lado.previstoAtual ? comparar("previsao_x_plano", lado.plano, lado.previstoAtual, meses) : null,
  };
}

export interface Formatos {
  pct: (n: number) => string;
  brl: (n: number) => string;
}

/**
 * 4.3 — a frase de abertura traz o achado, gerada do desvio já calculado.
 * Declara a versão e o período (4.5.2, 4.5.4) e o regime (4.5.1). Sem o que
 * dizer, diz isso — nunca inventa destaque.
 */
export function fraseDeAbertura(a: AnaliseDoCenario, periodo: string, f: Formatos): string {
  if (a.ausente) return `Sem comparação com ${a.nome}: ${a.ausente} Comparar com zero seria afirmar que o planejado é zero.`;
  const c = a.caixa;
  if (!c) return `Sem caixa realizado da Atual para comparar com ${a.nome}.`;
  const versao = a.versao ? ` (${a.versao})` : "";
  if (c.total.mesesComparados === 0 && c.total.soPrevisto === 0) {
    return `${a.nome}${versao} não tem nenhum valor planejado em ${periodo} — não há o que comparar.`;
  }
  if (c.total.mesesComparados === 0) {
    return `${periodo}: nenhum mês tem caixa realizado e ${a.nome}${versao} ao mesmo tempo — não há desvio a apontar.`;
  }
  const v = c.total.valor;
  const quanto =
    v === 0
      ? "igual ao"
      : c.total.pct != null
        ? `${f.pct(Math.abs(c.total.pct))} ${v < 0 ? "abaixo do" : "acima do"}`
        : `${f.brl(Math.abs(v))} ${v < 0 ? "abaixo do" : "acima do"}`;
  const onde = c.ordenadas.slice(0, 2).map((m) => m.mm);
  const conc = onde.length ? ` A diferença se concentra em ${onde.join(" e ")}.` : "";
  return `O caixa realizado de ${periodo} está ${quanto} ${a.nome}${versao}, somando os ${c.total.mesesComparados} mês(es) com os dois lados.${conc}`;
}

const idx = (mm: string) => {
  const [m, y] = mm.split("/").map(Number);
  return (y || 0) * 12 + ((m || 1) - 1);
};

export interface VencidoAindaPrevisto {
  mm: string;
  previsto: number;
  realizado: number;
}

/**
 * 4.4 · "O que já aconteceu e continua previsto" (achado 3.2): meses JÁ
 * FECHADOS (antes do mês corrente) que seguem com previsto na tabela. Lê as
 * linhas da tabela; o previsto aqui é dito como vencido, nunca como previsão.
 */
export function vencidoAindaPrevisto(linhas: readonly LinhaDoFluxo[], mesAtual: string): VencidoAindaPrevisto[] {
  const corte = idx(mesAtual);
  return linhas
    .filter((l) => idx(l.mm) < corte && l.liquido != null)
    .map((l) => ({ mm: l.mm, previsto: l.liquido as number, realizado: l.realE - l.realS }));
}

export interface SemPrevisao {
  mm: string;
  entradas: number;
  saidas: number;
}

/** 4.4 · "Movimento sem previsão" (achado 3.1): meses que só têm realizado. */
export function movimentoSemPrevisao(linhas: readonly LinhaDoFluxo[]): SemPrevisao[] {
  return linhas.filter((l) => l.desvio.estado === "so_realizado").map((l) => ({ mm: l.mm, entradas: l.realE, saidas: l.realS }));
}

/** Tudo que o painel mostra, já pronto e serializável — o cliente não calcula. */
export interface AnaliseDoFluxo {
  periodo: string;
  /** 4.5.4 — de onde veio o recorte. */
  origemDoPeriodo: string;
  cenarios: AnaliseDoCenario[];
  /** Achados 3.1 e 3.2, lidos das linhas da tabela (previsto de referência × realizado da Atual). */
  referencia: string;
  vencidos: VencidoAindaPrevisto[];
  semPrevisao: SemPrevisao[];
  /** Quando o realizado da tabela não é o da Atual (chave desligada, outra versão primeiro). */
  avisoDoRealizado: string | null;
}

export function analisarFluxo(input: {
  periodo: string;
  origemDoPeriodo: string;
  meses: readonly string[];
  lados: readonly LadoDoCenario[];
  referencia: string;
  linhasDaTabela: readonly LinhaDoFluxo[];
  mesAtual: string;
  avisoDoRealizado: string | null;
}): AnaliseDoFluxo {
  return {
    periodo: input.periodo,
    origemDoPeriodo: input.origemDoPeriodo,
    cenarios: input.lados.map((l) => analisarCenario(l, input.meses)),
    referencia: input.referencia,
    vencidos: vencidoAindaPrevisto(input.linhasDaTabela, input.mesAtual),
    semPrevisao: movimentoSemPrevisao(input.linhasDaTabela),
    avisoDoRealizado: input.avisoDoRealizado,
  };
}
