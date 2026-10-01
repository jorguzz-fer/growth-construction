import { simulate, validarSimulacao, type FinancingType, type InccRow, type SimulatorInput, type SimulatorResult } from "@/lib/calc";

/**
 * Análises do assistente do Simulador (Prompt N, seção 5). Tudo PURO, sobre
 * o input e o resultado que a tela já calculou: nada vai a modelo algum, e a
 * renda — dado sensível (BE-2) — fica restrita a `conferir`, que só compara
 * a maior parcela com o limite já calculado; o texto para o cliente (`explicar`)
 * nunca a cita. Nunca afirma aprovação, nunca promete taxa, nunca chama a
 * evolução da obra de avanço real.
 */

const TIPOS: FinancingType[] = ["SAC", "PRICE", "SBPE"];
const brl = (v: number) => new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL", maximumFractionDigits: 0 }).format(v);
const pct = (v: number) => `${v.toFixed(1).replace(".", ",")}%`;

/** 5.1 · Texto para o cliente. Sem renda, sem limite, sem aprovação. */
export function explicarProposta(input: SimulatorInput, r: SimulatorResult): string[] {
  const linhas: string[] = [];
  linhas.push(`Imóvel de ${brl(input.valorImovel)}, plano ${input.tipo}.`);
  const sinais = r.entradaEfetiva - input.entrada;
  linhas.push(
    `Entrada de ${brl(r.entradaEfetiva)} (${pct(r.pctEntrada)} do imóvel)${sinais > 0 ? `, sendo ${brl(input.entrada)} no ato e ${brl(sinais)} em sinais` : ""}.`,
  );
  if (r.recursosFuturos.length > 0) {
    linhas.push(`Recursos futuros de ${brl(r.totalRecursosFuturos)}: ${r.recursosFuturos.map((f) => `${f.nome} de ${brl(f.valor)} no mês ${f.mes}`).join("; ")}.`);
  }
  if (r.financiamento > 0) linhas.push(`Financiamento bancário de ${brl(r.financiamento)}, nas condições que o banco definir.`);
  if (r.meses.length > 0) {
    const primeira = r.meses[0];
    linhas.push(
      `Saldo de ${brl(r.saldoMensal)} em ${r.meses.length} parcelas mensais a partir de ${primeira.mm}: a primeira de ${brl(primeira.parcTotal)} e a maior de ${brl(r.maiorParcela)} (mês ${r.mesDaMaiorParcela}).`,
    );
    linhas.push(`As parcelas são corrigidas pelo INCC a partir da 5ª; a correção acumulada no plano é de ${brl(r.totalCorrecao)}.`);
    linhas.push(`Total pago ao longo do plano: ${brl(r.totalPago)}, dos quais ${brl(r.totalJuros)} de juros pela premissa de ${pct(input.taxaMensal * 100)} ao mês.`);
  }
  linhas.push("Simulação, não proposta: taxas, prazos e aprovação dependem da análise do banco.");
  return linhas;
}

export interface Cenario {
  tipo: FinancingType;
  totalPago: number;
  totalJuros: number;
  maiorParcela: number;
  mesDaMaiorParcela: number;
  primeiraParcela: number;
}

/** 5.2 · SAC × PRICE × SBPE com os mesmos dados. */
export function compararCenarios(input: SimulatorInput, incc: readonly InccRow[]): Cenario[] {
  return TIPOS.map((tipo) => {
    const r = simulate({ ...input, tipo }, incc);
    return { tipo, totalPago: r.totalPago, totalJuros: r.totalJuros, maiorParcela: r.maiorParcela, mesDaMaiorParcela: r.mesDaMaiorParcela, primeiraParcela: r.meses[0]?.parcTotal ?? 0 };
  });
}

export interface Variacao {
  rotulo: string;
  totalPago: number;
  maiorParcela: number;
  /** diferença contra a simulação atual. */
  dTotal: number;
  dMaior: number;
}

const round2 = (v: number) => Math.round(v * 100) / 100;

/** 5.3 · Entrada ±10 %, prazo ±12 parcelas, taxa ±0,25 p.p. — efeito no total e na maior parcela. */
export function testarVariacoes(input: SimulatorInput, incc: readonly InccRow[]): Variacao[] {
  const base = simulate(input, incc);
  const casos: [string, SimulatorInput][] = [
    ["Entrada +10%", { ...input, entrada: round2(input.entrada * 1.1) }],
    ["Entrada −10%", { ...input, entrada: round2(input.entrada * 0.9) }],
    ["Prazo +12 parcelas", { ...input, mensais: input.mensais + 12 }],
    ["Prazo −12 parcelas", { ...input, mensais: input.mensais - 12 }],
    ["Juros +0,25 p.p.", { ...input, taxaMensal: input.taxaMensal + 0.0025 }],
    ["Juros −0,25 p.p.", { ...input, taxaMensal: Math.max(0, input.taxaMensal - 0.0025) }],
  ];
  return casos
    .filter(([, i]) => validarSimulacao(i).length === 0)
    .map(([rotulo, i]) => {
      const r = simulate(i, incc);
      return { rotulo, totalPago: r.totalPago, maiorParcela: r.maiorParcela, dTotal: round2(r.totalPago - base.totalPago), dMaior: round2(r.maiorParcela - base.maiorParcela) };
    });
}

export interface Conferencia {
  nivel: "erro" | "aviso" | "info";
  texto: string;
}

/** 5.4 · Confere a simulação: limite, reforços, correção, parcelas, evolução. */
export function conferirSimulacao(input: SimulatorInput, r: SimulatorResult | null, incc: readonly InccRow[]): Conferencia[] {
  const itens: Conferencia[] = [];
  for (const e of validarSimulacao(input)) itens.push({ nivel: "erro", texto: e });
  if (!r) return itens;
  if (input.renda > 0) {
    itens.push(
      r.dentroLimite
        ? { nivel: "info", texto: `A maior parcela (${brl(r.maiorParcela)}, mês ${r.mesDaMaiorParcela}) cabe no limite de 30% da renda informada. Isso não é aprovação: o banco decide.` }
        : { nivel: "aviso", texto: `A maior parcela (${brl(r.maiorParcela)}, mês ${r.mesDaMaiorParcela}) passa do limite de 30% da renda informada (${brl(r.maxParcela)}). Veja "Testar variações".` },
    );
  } else {
    itens.push({ nivel: "aviso", texto: "Sem renda informada o limite de 30% não é conferido." });
  }
  if (r.saldoMensal === 0 && r.meses.length > 0) itens.push({ nivel: "info", texto: "Entrada, recursos futuros e financiamento cobrem o imóvel: não há saldo a parcelar." });
  const soma = r.entradaEfetiva + r.totalRecursosFuturos + r.financiamento;
  if (soma > input.valorImovel && input.valorImovel > 0) itens.push({ nivel: "aviso", texto: `Entrada, recursos futuros e financiamento somam ${brl(soma)}, mais que o imóvel (${brl(input.valorImovel)}).` });
  if (r.financiamento > input.valorImovel * 0.8 && input.valorImovel > 0) itens.push({ nivel: "aviso", texto: `Financiamento de ${pct((r.financiamento / input.valorImovel) * 100)} do imóvel: acima dos 80% usuais dos bancos. Confirme a condição.` });
  const semIncc = r.meses.filter((m) => m.n > 4 && !incc.some((i) => i.m === m.mm));
  if (semIncc.length > 0) itens.push({ nivel: "aviso", texto: `${semIncc.length} parcela(s) vencem em meses fora da tabela INCC (de ${semIncc[0].mm}): corrigidas por zero, em silêncio.` });
  const projetadas = r.meses.filter((m) => m.n > 4 && incc.find((i) => i.m === m.mm)?.projected).length;
  if (projetadas > 0) itens.push({ nivel: "info", texto: `${projetadas} parcela(s) usam INCC projetado (média móvel), não índice divulgado.` });
  if (r.meses.length > 0 && r.totalCorrecao === 0 && r.meses.length > 4) itens.push({ nivel: "info", texto: "Nenhuma correção INCC incidiu: o acumulado da tabela é zero nos meses do plano." });
  itens.push(
    r.origemDaEvolucao === "obra"
      ? { nivel: "info", texto: "A coluna Obra % vem da janela cadastrada da obra, linear: não é medição." }
      : { nivel: "aviso", texto: "A coluna Obra % é premissa linear nas parcelas: a obra não tem início e fim cadastrados." },
  );
  return itens;
}
