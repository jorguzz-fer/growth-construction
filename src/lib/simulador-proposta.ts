/**
 * Prompt N2 (Fase 3 · revisão V5): "o Simulador descaracterizou — é um
 * simulador de parcelamento de sinal e entrada, vindo da planilha do cliente;
 * o chat ajuda a fazer um relatório para passar ao cliente final". Módulo PURO.
 *
 *  - `resumoDaProposta`: as linhas do plano de pagamento como o cliente lê
 *    (ato, sinais, anuais, mensais, FGTS, subsídio, financiamento nas chaves);
 *  - `dadosDoSimuladorParaCris`: o que a Cris recebe — SEM renda e SEM
 *    cliente (dado pessoal não vai ao modelo, BE-2);
 *  - `formularioDoSimulador` / `parametrosDaProposta`: o vendedor dita a
 *    simulação e a Cris preenche os campos; nada é gravado (BN-1).
 */
import type { FormularioDaTela } from "@/lib/cris";
import type { FinancingType, SimulatorInput, SimulatorResult } from "@/lib/calc";

export interface LinhaDaProposta {
  rotulo: string;
  /** "mês 1", "meses 1 a 90", "nas chaves"… */
  quando: string;
  valor: number;
}

export interface UnidadeParaSimular {
  id: string;
  /** "A-101 · 2 dorm." — o que a tela e a Cris mostram. */
  rotulo: string;
  valor: number;
}

const r2 = (v: number) => Math.round(v * 100) / 100;

/** As linhas do plano, na ordem em que o cliente paga. */
export function resumoDaProposta(input: SimulatorInput, result: SimulatorResult): { linhas: LinhaDaProposta[]; total: number } {
  const linhas: LinhaDaProposta[] = [];
  if (input.entrada > 0) linhas.push({ rotulo: "Ato (assinatura)", quando: "mês 1", valor: input.entrada });
  const reforcos: [string, { valor: number; mes: number }][] = [
    ["Sinal 1", input.s1],
    ["Sinal 2", input.s2],
    ["Sinal 3", input.s3],
    ["Anual 1", input.anual1],
    ["Anual 2", input.anual2],
    ["FGTS", input.fgts],
    ["Subsídio", input.subsidio],
  ];
  for (const [rotulo, r] of reforcos) if (r.valor > 0) linhas.push({ rotulo, quando: `mês ${r.mes}`, valor: r.valor });
  const n = result.meses.length;
  if (n > 0) {
    const somaMensais = r2(result.meses.reduce((a, m) => a + m.parcTotal, 0));
    linhas.push({ rotulo: `${n} mensais`, quando: n === 1 ? "mês 1" : `meses 1 a ${n}`, valor: somaMensais });
  }
  if (input.financiamento > 0) linhas.push({ rotulo: "Financiamento bancário", quando: "nas chaves", valor: input.financiamento });
  return { linhas, total: r2(linhas.reduce((a, l) => a + l.valor, 0)) };
}

/** O resumo da simulação para a Cris. Renda e cliente ficam de fora. */
export function dadosDoSimuladorParaCris(input: SimulatorInput, result: SimulatorResult | null, extra: { obra: string; unidade: string | null }) {
  if (!result) return { obra: extra.obra, unidade: extra.unidade, situacao: "sem simulação: informe o valor do imóvel e o número de mensais" };
  const { linhas, total } = resumoDaProposta(input, result);
  return {
    obra: extra.obra,
    unidade: extra.unidade,
    tipo: input.tipo,
    valorDoImovel: input.valorImovel,
    planoDePagamento: linhas,
    totalDoPlano: total,
    entradaEfetiva: result.entradaEfetiva,
    percentualDeEntrada: Math.round(result.pctEntrada * 10) / 10,
    primeiraMensal: result.meses[0]?.parcTotal ?? 0,
    maiorMensal: result.maiorParcela,
    mesDaMaiorMensal: result.mesDaMaiorParcela,
    correcaoIncc: result.totalCorrecao,
    juros: result.totalJuros,
    juroMensalPremissa: input.tipo === "SBPE" ? null : input.taxaMensal * 100,
    primeiraParcelaEm: input.dataInicio,
    regra: "Mensais corrigidas pelo INCC acumulado do mês a partir da 5ª parcela. Simulação: não é contrato e nada é gravado.",
  };
}

const TIPOS: FinancingType[] = ["SAC", "PRICE", "SBPE"];

export function formularioDoSimulador(unidades: readonly UnidadeParaSimular[]): FormularioDaTela {
  const reforco = (nome: string, rotulo: string, mes: string) => [
    { nome, rotulo: `${rotulo} (R$)`, tipo: "numero" as const },
    { nome: `${nome}Mes`, rotulo: `${rotulo}: mês do plano`, tipo: "numero" as const, dica: `padrão ${mes}` },
  ];
  return {
    id: "simulador-parametros",
    titulo: "Parâmetros da simulação (a renda é digitada na tela)",
    campos: [
      ...(unidades.length ? [{ nome: "unidade", rotulo: "Unidade", tipo: "opcao" as const, opcoes: unidades.map((u) => u.rotulo) }] : []),
      { nome: "tipo", rotulo: "Tipo", tipo: "opcao", opcoes: TIPOS },
      { nome: "valorImovel", rotulo: "Valor do imóvel (R$)", tipo: "numero" },
      { nome: "ato", rotulo: "Ato de assinatura (R$)", tipo: "numero" },
      ...reforco("s1", "Sinal 1", "2"),
      ...reforco("s2", "Sinal 2", "3"),
      ...reforco("s3", "Sinal 3", "4"),
      ...reforco("anual1", "Anual 1", "12"),
      ...reforco("anual2", "Anual 2", "24"),
      { nome: "fgts", rotulo: "FGTS (R$)", tipo: "numero" },
      { nome: "subsidio", rotulo: "Subsídio (R$)", tipo: "numero" },
      { nome: "financiamento", rotulo: "Financiamento bancário nas chaves (R$)", tipo: "numero" },
      { nome: "mensais", rotulo: "Nº de mensais", tipo: "numero" },
      { nome: "dataInicio", rotulo: "Data da 1ª parcela", tipo: "texto", dica: "AAAA-MM-DD" },
      { nome: "juros", rotulo: "Juros ao mês % (SAC/PRICE)", tipo: "numero" },
    ],
  };
}

export type ParametrosDoSimulador = Partial<{
  unidadeId: string;
  tipo: FinancingType;
  valorImovel: string;
  ato: string;
  mensais: string;
  financiamento: string;
  dataInicio: string;
  juros: string;
  reforcos: Partial<Record<"s1" | "s2" | "s3" | "anual1" | "anual2" | "fgts" | "subsidio", { valor?: string; mes?: string }>>;
}>;

/** Os valores da proposta nos campos da tela; o que não dá para usar fica de fora, com aviso. */
export function parametrosDaProposta(valores: Record<string, string>, unidades: readonly UnidadeParaSimular[]): { parametros: ParametrosDoSimulador; avisos: string[] } {
  const p: ParametrosDoSimulador = {};
  const avisos: string[] = [];
  const nao_negativo = (k: string) => {
    const v = valores[k];
    if (v == null || v === "") return undefined;
    const n = Number(v);
    if (Number.isFinite(n) && n >= 0) return String(n);
    avisos.push(`${k}: valor inválido.`);
    return undefined;
  };
  if (valores.unidade) {
    const u = unidades.find((x) => x.rotulo === valores.unidade);
    if (u) {
      p.unidadeId = u.id;
      p.valorImovel = String(u.valor);
    }
  }
  if (valores.tipo && (TIPOS as string[]).includes(valores.tipo)) p.tipo = valores.tipo as FinancingType;
  const valor = nao_negativo("valorImovel");
  if (valor) p.valorImovel = valor;
  for (const k of ["ato", "financiamento", "juros"] as const) {
    const v = nao_negativo(k);
    if (v) p[k] = v;
  }
  const m = valores.mensais;
  if (m) {
    const n = Number(m);
    if (Number.isInteger(n) && n > 0) p.mensais = String(n);
    else avisos.push("Nº de mensais: informe um inteiro maior que zero.");
  }
  if (valores.dataInicio) {
    if (/^\d{4}-\d{2}-\d{2}$/.test(valores.dataInicio)) p.dataInicio = valores.dataInicio;
    else avisos.push(`Data da 1ª parcela "${valores.dataInicio}" não entendida (AAAA-MM-DD).`);
  }
  for (const k of ["s1", "s2", "s3", "anual1", "anual2", "fgts", "subsidio"] as const) {
    const v = nao_negativo(k);
    const mesBruto = valores[`${k}Mes`];
    const mes = mesBruto && Number.isInteger(Number(mesBruto)) && Number(mesBruto) >= 1 ? String(Number(mesBruto)) : undefined;
    if (mesBruto && !mes) avisos.push(`${k}: mês inválido.`);
    if (v != null || mes) (p.reforcos ??= {})[k] = { ...(v != null ? { valor: v } : {}), ...(mes ? { mes } : {}) };
  }
  return { parametros: p, avisos };
}

/** Formulário do texto da proposta ao cliente (a Cris escreve; a pessoa confere). */
export const FORMULARIO_DA_PROPOSTA: FormularioDaTela = {
  id: "simulador-proposta",
  titulo: "Texto da proposta ao cliente (sem renda nem dado pessoal)",
  campos: [
    { nome: "mensagem", rotulo: "Mensagem ao cliente", tipo: "texto", dica: "até 3 parágrafos curtos, em linguagem simples" },
    { nome: "validade", rotulo: "Validade da proposta", tipo: "texto", dica: 'ex.: "7 dias"' },
  ],
};
