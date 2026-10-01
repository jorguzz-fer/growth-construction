import { consumoPorObra, type ConsumoDaObra, type MovimentoParaObra } from "@/lib/calc/estoque-obra";
import { isoDe } from "@/lib/calc/cadeia-caixa";
import { UNIDADES } from "@/lib/estoque-regras";

/**
 * Assistente do Estoque (Prompt Y, seção 7; Prompt E). PURO: analisa o que a
 * página carregou e PROPÕE. Nunca (7.4): lança movimento sem confirmação,
 * exclui item, estorna movimento, cria material sozinho. Este módulo não
 * importa ação nem banco.
 */

export interface MaterialParaAnalise {
  id: string;
  nome: string;
  sku: string | null;
  unidade: string;
  custoUnit: number;
  minimo: number;
  saldo: number;
  ativo: boolean;
}

export interface ItemLido {
  descricao: string;
  quantidade: number;
  unidade: string;
  valorUnitario: number;
  valorTotal: number;
  materialCadastrado: string;
  confianca: "alta" | "media" | "baixa";
  nota: string;
}

export interface PropostaDeEntrada {
  descricaoNaNota: string;
  quantidade: number;
  unidadeNaNota: string;
  custoNaNota: number;
  confianca: "alta" | "media" | "baixa";
  nota: string;
  /** material do cadastro casado (null = propor cadastro, 7.2). */
  materialId: string | null;
  materialNome: string | null;
  custoCadastro: number | null;
  /** quanto o custo da nota difere do cadastro (|Δ| / cadastro), null sem base. */
  desvioDeCusto: number | null;
  /** 7.2 — sugestão de cadastro quando não casou. */
  cadastroProposto: { nome: string; unidade: string; custoUnit: number } | null;
}

const norm = (s: string | null | undefined) => (s ?? "").toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/[^a-z0-9 ]+/g, " ").replace(/\s+/g, " ").trim();
const tokens = (s: string) => norm(s).split(" ").filter((t) => t.length >= 3);
const r2 = (v: number) => Math.round(v * 100) / 100;

/** unidade da nota → unidade da lista (UN → un, M2 → m², PC → pç…); fora da lista cai em "un". */
export function unidadeDaLista(u: string): (typeof UNIDADES)[number] {
  const k = norm(u).replace(/\s/g, "");
  const mapa: Record<string, (typeof UNIDADES)[number]> = { un: "un", und: "un", unid: "un", pc: "pç", pç: "pç", pec: "pç", peca: "pç", kg: "kg", g: "g", t: "t", ton: "t", m: "m", mt: "m", m2: "m²", m3: "m³", l: "L", lt: "L", sc: "sc", saco: "sc", sacos: "sc", cx: "cx", caixa: "cx", rolo: "rolo", rl: "rolo", lata: "lata", lt18: "lata", galao: "galão", gl: "galão", barra: "barra", br: "barra", par: "par", jg: "jg", jogo: "jg" };
  return mapa[k] ?? (UNIDADES as readonly string[]).find((x) => norm(x) === k) as (typeof UNIDADES)[number] | undefined ?? "un";
}

/** 7.1 / 7.2 — casa cada item lido com o cadastro (nome exato dado pela IA, SKU ou sobreposição de palavras); sem par, propõe cadastro. */
export function casarItensComCadastro(itens: readonly ItemLido[], materiais: readonly MaterialParaAnalise[]): PropostaDeEntrada[] {
  const ativos = materiais.filter((m) => m.ativo);
  return itens.map((it) => {
    let m: MaterialParaAnalise | undefined;
    if (it.materialCadastrado) m = ativos.find((x) => norm(x.nome) === norm(it.materialCadastrado));
    if (!m) {
      const d = norm(it.descricao);
      m = ativos.find((x) => x.sku && d.includes(norm(x.sku))) ?? ativos.find((x) => norm(x.nome) && d.includes(norm(x.nome)));
    }
    if (!m) {
      const tk = new Set(tokens(it.descricao));
      let melhor: { m: MaterialParaAnalise; score: number } | null = null;
      for (const x of ativos) {
        const tx = tokens(x.nome);
        if (tx.length === 0) continue;
        const comum = tx.filter((t) => tk.has(t)).length;
        const score = comum / tx.length;
        if (comum >= 1 && score >= 0.6 && (!melhor || score > melhor.score)) melhor = { m: x, score };
      }
      m = melhor?.m;
    }
    const custoNaNota = it.valorUnitario > 0 ? it.valorUnitario : it.quantidade > 0 && it.valorTotal > 0 ? r2(it.valorTotal / it.quantidade) : 0;
    return {
      descricaoNaNota: it.descricao,
      quantidade: it.quantidade,
      unidadeNaNota: it.unidade,
      custoNaNota,
      confianca: it.confianca,
      nota: it.nota,
      materialId: m?.id ?? null,
      materialNome: m?.nome ?? null,
      custoCadastro: m ? m.custoUnit : null,
      desvioDeCusto: m && m.custoUnit > 0 && custoNaNota > 0 ? r2(Math.abs(custoNaNota - m.custoUnit) / m.custoUnit) : null,
      cadastroProposto: m ? null : { nome: it.descricao, unidade: unidadeDaLista(it.unidade), custoUnit: custoNaNota },
    };
  });
}

export interface MovimentoParaAnalise extends MovimentoParaObra {
  data: string | null;
  docs: number;
}

export interface AnaliseDoEstoque {
  abaixoDoMinimo: { id: string; nome: string; unidade: string; saldo: number; minimo: number; consumoMedioMensal: number; falta: number }[];
  semMovimento: { id: string; nome: string; ultimo: string | null; dias: number | null }[];
  consumoPorObra: ConsumoDaObra[];
  entradaSemOrigem: { id: string; itemNome: string; quantidade: number; unidade: string; data: string | null }[];
  divergenciaDeValor: { despesaId: string; numDoc: string | null; valor: number; entradasSoma: number; diferenca: number }[];
  entradaSemComprovacao: { mes: string; quantidade: number; valor: number }[];
}

export const JANELA_SEM_MOVIMENTO_DIAS = 180;
export const JANELA_CONSUMO_DIAS = 90;

const dias = (iso: string | null, hojeISO: string) => (iso ? Math.max(0, Math.round((Date.parse(hojeISO) - Date.parse(iso)) / 86_400_000)) : null);

/** 7.3 — as seis análises, em código puro. */
export function analisarEstoque(p: { materiais: readonly MaterialParaAnalise[]; movimentos: readonly MovimentoParaAnalise[]; despesas: readonly { id: string; numDoc: string | null; valor: number; entradasSoma: number }[]; hojeISO: string }): AnaliseDoEstoque {
  const ativos = p.materiais.filter((m) => m.ativo);
  const inicioJanela = new Date(Date.parse(p.hojeISO) - JANELA_CONSUMO_DIAS * 86_400_000).toISOString().slice(0, 10);
  const consumoPorItem = new Map<string, number>();
  const ultimoPorItem = new Map<string, string>();
  for (const m of p.movimentos) {
    const iso = isoDe(m.data);
    if (iso && (!ultimoPorItem.has(m.itemId) || iso > ultimoPorItem.get(m.itemId)!)) ultimoPorItem.set(m.itemId, iso);
    if (m.tipo === "saida" && !m.despesaId && !m.permutaId && iso && iso >= inicioJanela) consumoPorItem.set(m.itemId, (consumoPorItem.get(m.itemId) ?? 0) + m.quantidade);
    if (m.tipo === "entrada" && m.estornoDeId && iso && iso >= inicioJanela) consumoPorItem.set(m.itemId, (consumoPorItem.get(m.itemId) ?? 0) - m.quantidade);
  }
  const porMes = new Map<string, { quantidade: number; valor: number }>();
  for (const m of p.movimentos) {
    if (m.tipo !== "entrada" || m.estornoDeId || m.docs > 0) continue;
    const mes = (isoDe(m.data) ?? "sem data").slice(0, 7);
    const g = porMes.get(mes) ?? { quantidade: 0, valor: 0 };
    g.quantidade++;
    g.valor = r2(g.valor + m.valor);
    porMes.set(mes, g);
  }
  return {
    abaixoDoMinimo: ativos
      .filter((m) => m.minimo > 0 && m.saldo <= m.minimo)
      .map((m) => {
        const consumoMedioMensal = r2(((consumoPorItem.get(m.id) ?? 0) / JANELA_CONSUMO_DIAS) * 30);
        return { id: m.id, nome: m.nome, unidade: m.unidade, saldo: m.saldo, minimo: m.minimo, consumoMedioMensal, falta: r2(m.minimo - m.saldo) };
      })
      .sort((a, b) => b.falta - a.falta),
    semMovimento: ativos
      .map((m) => ({ id: m.id, nome: m.nome, ultimo: ultimoPorItem.get(m.id) ?? null, dias: dias(ultimoPorItem.get(m.id) ?? null, p.hojeISO) }))
      .filter((x) => x.dias == null || x.dias > JANELA_SEM_MOVIMENTO_DIAS)
      .sort((a, b) => (b.dias ?? 1e9) - (a.dias ?? 1e9)),
    consumoPorObra: consumoPorObra(p.movimentos),
    entradaSemOrigem: p.movimentos.filter((m) => m.tipo === "entrada" && !m.despesaId && !m.permutaId && !m.estornoDeId).map((m) => ({ id: m.id, itemNome: m.itemNome, quantidade: m.quantidade, unidade: m.unidade, data: m.data })),
    divergenciaDeValor: p.despesas
      .filter((d) => d.entradasSoma > 0 && Math.abs(d.entradasSoma - d.valor) > Math.max(1, d.valor * 0.02))
      .map((d) => ({ despesaId: d.id, numDoc: d.numDoc, valor: d.valor, entradasSoma: d.entradasSoma, diferenca: r2(d.entradasSoma - d.valor) }))
      .sort((a, b) => Math.abs(b.diferenca) - Math.abs(a.diferenca)),
    entradaSemComprovacao: [...porMes.entries()].sort(([a], [b]) => a.localeCompare(b)).map(([mes, g]) => ({ mes, ...g })),
  };
}
