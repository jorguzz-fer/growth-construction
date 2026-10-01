/**
 * Análises do painel do assistente na tela de Permuta (Prompt P, 7.5) —
 * código puro, sem modelo de IA. Tudo é conta sobre o que a página já
 * carregou: nada grava, nada sai do sistema. Linguagem (7.7): ativo, caixa e
 * resultado — nunca "receita".
 */
import type { LinhaDoInventario } from "@/lib/permuta-inventario";
import { resultadoDaRevenda } from "@/lib/calc/permuta-ganho";

export interface AtivoParaAnalise {
  id: string;
  unitCode: string | null;
  clienteNome: string | null;
  tipo: string | null;
  descricao: string | null;
  estimado: number;
  status: string | null;
  dataVenda: string | null;
  valorVenda: number;
  cancelado: boolean;
}

const rotulo = (a: { unitCode: string | null; descricao: string | null; tipo: string | null }) =>
  [a.unitCode ? `Un. ${a.unitCode}` : null, a.descricao || a.tipo || "ativo"].filter(Boolean).join(" · ");

export interface AtivoParado extends LinhaDoInventario {
  /** Mediana de dias em estoque do mesmo tipo (o "normal"). */
  normalDoTipo: number;
}

/** Limite absoluto de dias que, mesmo sem comparação, já é "parado". */
export const DIAS_PARADO = 180;

/**
 * 7.5 · ativos parados: em estoque há mais tempo que o normal do seu tipo
 * (mais de 1,5× a mediana do tipo, com ao menos 2 ativos no tipo) ou acima de
 * 180 dias. Devolve do mais parado ao menos.
 */
export function ativosParados(inventario: readonly LinhaDoInventario[]): AtivoParado[] {
  const porTipo = new Map<string, number[]>();
  for (const l of inventario) if (l.diasEmEstoque != null) porTipo.set(l.tipo, [...(porTipo.get(l.tipo) ?? []), l.diasEmEstoque]);
  const mediana = (v: number[]) => {
    const o = [...v].sort((a, b) => a - b);
    const m = Math.floor(o.length / 2);
    return o.length % 2 ? o[m] : (o[m - 1] + o[m]) / 2;
  };
  const out: AtivoParado[] = [];
  for (const l of inventario) {
    if (l.diasEmEstoque == null) continue;
    const dias = porTipo.get(l.tipo) ?? [];
    const normal = dias.length ? mediana(dias) : 0;
    const acimaDoNormal = dias.length >= 2 && l.diasEmEstoque > normal * 1.5;
    if (acimaDoNormal || l.diasEmEstoque > DIAS_PARADO) out.push({ ...l, normalDoTipo: normal });
  }
  return out.sort((a, b) => (b.diasEmEstoque ?? 0) - (a.diasEmEstoque ?? 0));
}

export type TipoDeFalta = "sem_estimado" | "sem_unidade" | "sem_cliente" | "vendido_sem_data" | "vendido_sem_valor";

export interface CadastroIncompleto {
  id: string;
  rotulo: string;
  faltas: TipoDeFalta[];
}

/** 7.5 · cadastro incompleto: sem estimado, sem unidade, sem cliente, vendido sem data ou valor. */
export function cadastroIncompleto(ativos: readonly AtivoParaAnalise[]): CadastroIncompleto[] {
  const out: CadastroIncompleto[] = [];
  for (const a of ativos) {
    if (a.cancelado) continue;
    const faltas: TipoDeFalta[] = [];
    if (!(a.estimado > 0)) faltas.push("sem_estimado");
    if (!a.unitCode?.trim()) faltas.push("sem_unidade");
    if (!a.clienteNome?.trim()) faltas.push("sem_cliente");
    if ((a.status ?? "").trim() === "Vendido") {
      if (!a.dataVenda?.trim()) faltas.push("vendido_sem_data");
      if (!(a.valorVenda > 0)) faltas.push("vendido_sem_valor");
    }
    if (faltas.length) out.push({ id: a.id, rotulo: rotulo(a), faltas });
  }
  return out;
}

export interface VendaAbaixoDaEntrada {
  id: string;
  rotulo: string;
  estimado: number;
  valorVenda: number;
  resultado: number;
}

/** 7.5 · ativos revendidos por menos que o valor de entrada, com o resultado de cada um. */
export function vendaAbaixoDaEntrada(ativos: readonly AtivoParaAnalise[]): VendaAbaixoDaEntrada[] {
  return ativos
    .filter((a) => !a.cancelado && (a.status ?? "").trim() === "Vendido" && a.valorVenda > 0 && a.valorVenda < a.estimado)
    .map((a) => ({ id: a.id, rotulo: rotulo(a), estimado: a.estimado, valorVenda: a.valorVenda, resultado: resultadoDaRevenda({ estimado: a.estimado, valorVenda: a.valorVenda, status: "Vendido" }) }))
    .sort((a, b) => a.resultado - b.resultado);
}

export interface UnidadeComPermutaNoPlano {
  code: string;
  permutaNoPlano: number;
}

export interface DuplicidadeComPlano {
  unitCode: string;
  permutaNoPlano: number;
  ativos: { id: string; rotulo: string; estimado: number }[];
  somaDosAtivos: number;
}

/**
 * 7.5 / 1.5 / §57.8-AA · unidades cuja linha "Permuta" do plano tem valor E
 * que também têm ativo registrado nesta tela — o mesmo bem contado duas vezes
 * (dentro do preço da unidade e como ativo). Só reporta.
 */
export function duplicidadeComPlano(ativos: readonly AtivoParaAnalise[], unidades: readonly UnidadeComPermutaNoPlano[]): DuplicidadeComPlano[] {
  const out: DuplicidadeComPlano[] = [];
  for (const u of unidades) {
    if (!(u.permutaNoPlano > 0)) continue;
    const code = u.code.trim().toLowerCase();
    const encontrados = ativos.filter((a) => !a.cancelado && (a.unitCode ?? "").trim().toLowerCase() === code);
    if (encontrados.length === 0) continue;
    out.push({
      unitCode: u.code,
      permutaNoPlano: u.permutaNoPlano,
      ativos: encontrados.map((a) => ({ id: a.id, rotulo: rotulo(a), estimado: a.estimado })),
      somaDosAtivos: Math.round(encontrados.reduce((s, a) => s + a.estimado, 0) * 100) / 100,
    });
  }
  return out.sort((a, b) => b.permutaNoPlano - a.permutaNoPlano);
}

export interface AnaliseDePermutas {
  parados: AtivoParado[];
  incompletos: CadastroIncompleto[];
  abaixoDaEntrada: VendaAbaixoDaEntrada[];
  duplicidades: DuplicidadeComPlano[];
  total: number;
}

export function analisarPermutas(ativos: readonly AtivoParaAnalise[], inventario: readonly LinhaDoInventario[], unidades: readonly UnidadeComPermutaNoPlano[]): AnaliseDePermutas {
  return {
    parados: ativosParados(inventario),
    incompletos: cadastroIncompleto(ativos),
    abaixoDaEntrada: vendaAbaixoDaEntrada(ativos),
    duplicidades: duplicidadeComPlano(ativos, unidades),
    total: ativos.filter((a) => !a.cancelado).length,
  };
}
