import { cicloAberto, disponivelDoLimite } from "@/lib/calc/cartao-ciclo";
import { comRotativo, estadoDaFatura, projecaoDoCiclo, rotativoParaOCiclo, saldoDaFatura, type ProjecaoDoCiclo } from "@/lib/calc/fatura";
import type { Conferencia } from "@/lib/calc/conferencia-cartao";
import { ymd } from "@/lib/utils";

/**
 * Análises do assistente de Cartões (Prompt U, seção 7; Prompt E). Tudo
 * PURO e SOMENTE LEITURA, sobre o que a página carregou: nada vai a modelo,
 * nada é gravado. Nunca lança despesa, paga fatura, registra estorno nem
 * projeta juro sem taxa (BU-3). Números de cartão não entram: só apelido e
 * quatro últimos dígitos.
 */

export interface CartaoParaAnalise {
  id: string;
  apelido: string;
  ultimos4: string | null;
  limite: number | null;
  diaFechamento: number;
  diaVencimento: number;
  taxaRotativo: number | null;
  ativo: boolean;
}

export interface FaturaParaAnalise {
  id: string;
  cartaoId: string;
  cartaoNome: string;
  fechamento: string;
  vencimento: string;
  valorCompras: number;
  valorPago: number;
  qtdCompras: number;
  valorNovas: number;
  valorParceladas: number;
  creditos: number;
}

export interface CompraParaAnalise {
  despesaId: string;
  numDoc: string | null;
  descricao: string | null;
  projectId: string | null;
  projectName: string | null;
  fornecedorNome: string | null;
  valor: number;
  numero: number;
  total: number;
  faturaFechamento: string;
  cartaoId: string;
}

export interface ProjecaoDoCartao {
  cartaoId: string;
  nome: string;
  fechamento: string | null;
  vencimento: string | null;
  projecao: ProjecaoDoCiclo;
  /** parcelas de compras já feitas que caem em ciclos DEPOIS do aberto. */
  aindaCai: number;
  /** total esperado = ciclo aberto (sem juro) + o que ainda cai. */
  totalEsperado: number;
}

export interface LimiteDoCartao {
  cartaoId: string;
  nome: string;
  limite: number | null;
  cicloAberto: number;
  parcelasFuturas: number;
  comprometido: number;
  disponivel: number | null;
  /** % do limite comprometido; null sem limite. */
  pct: number | null;
}

export interface CompraSemObra {
  despesaId: string;
  numDoc: string | null;
  descricao: string | null;
  valor: number;
  cartao: string;
}

export interface AnaliseDeCartoes {
  projecoes: ProjecaoDoCartao[];
  limites: LimiteDoCartao[];
  semObra: CompraSemObra[];
  /** só quando a página carregou a conferência de um cartão. */
  extrato: { cartao: string; semLancamento: number; semExtrato: number; divergentes: number; creditosSemEstorno: number; valorSemLancamento: number } | null;
  totalCartoes: number;
}

const r2 = (v: number) => Math.round(v * 100) / 100;
const nome = (c: CartaoParaAnalise) => `${c.apelido}${c.ultimos4 ? " •••• " + c.ultimos4 : ""}`;

/** 7 — projeção do ciclo: o que já caiu (compras + parcelas + rotativo), o que ainda cai (parcelas futuras) e o total esperado. */
export function projecoesDosCartoes(cartoes: readonly CartaoParaAnalise[], faturas: readonly FaturaParaAnalise[], hojeISO: string): ProjecaoDoCartao[] {
  return cartoes
    .filter((c) => c.ativo)
    .map((c) => {
      const ciclo = cicloAberto(hojeISO, c);
      const doCartao = faturas.filter((f) => f.cartaoId === c.id);
      const aberta = ciclo ? doCartao.find((f) => f.fechamento === ciclo.fechamento) : null;
      const rotativo = ciclo ? rotativoParaOCiclo(doCartao, ciclo.fechamento, hojeISO) : 0;
      const projecao = projecaoDoCiclo({ comprasDoCiclo: aberta?.valorNovas ?? 0, parcelasAnteriores: aberta?.valorParceladas ?? 0, rotativoAnterior: rotativo, taxaRotativo: c.taxaRotativo });
      const limite = ciclo ? ymd(ciclo.fechamento) ?? 0 : 0;
      const aindaCai = r2(doCartao.filter((f) => (ymd(f.fechamento) ?? 0) > limite).reduce((a, f) => a + f.valorCompras, 0));
      return { cartaoId: c.id, nome: nome(c), fechamento: ciclo?.fechamento ?? null, vencimento: ciclo?.vencimento ?? null, projecao, aindaCai, totalEsperado: r2(projecao.totalPrevisto + aindaCai) };
    });
}

/** 7 — limite: comprometido pelo ciclo aberto (saldo) e pelas parcelas futuras. */
export function limitesDosCartoes(cartoes: readonly CartaoParaAnalise[], faturas: readonly FaturaParaAnalise[], hojeISO: string): LimiteDoCartao[] {
  const todas = comRotativo(faturas, hojeISO);
  return cartoes
    .filter((c) => c.ativo)
    .map((c) => {
      const ciclo = cicloAberto(hojeISO, c);
      const limiteYmd = ciclo ? ymd(ciclo.fechamento) ?? 0 : 0;
      const doCartao = todas.filter((f) => f.cartaoId === c.id);
      // Tudo que ainda não foi pago até o ciclo aberto, inclusive faturas
      // fechadas em aberto. A paga parcialmente não entra pelo próprio saldo:
      // ele já mora na seguinte como rotativo (3.3) — contar os dois dobraria.
      const emAberto = (f: (typeof doCartao)[number]) => (estadoDaFatura(f, hojeISO) === "paga parcialmente" ? 0 : saldoDaFatura(f));
      const cicloAbertoValor = r2(doCartao.filter((f) => (ymd(f.fechamento) ?? 0) <= limiteYmd).reduce((a, f) => a + emAberto(f), 0));
      const parcelasFuturas = r2(doCartao.filter((f) => (ymd(f.fechamento) ?? 0) > limiteYmd).reduce((a, f) => a + emAberto(f), 0));
      const comprometido = r2(cicloAbertoValor + parcelasFuturas);
      const disponivel = disponivelDoLimite(c.limite, comprometido);
      return { cartaoId: c.id, nome: nome(c), limite: c.limite, cicloAberto: cicloAbertoValor, parcelasFuturas, comprometido, disponivel, pct: c.limite ? Math.round((comprometido / c.limite) * 1000) / 10 : null };
    })
    .sort((a, b) => (b.pct ?? -1) - (a.pct ?? -1));
}

/** 7 — compras no cartão sem obra vinculada (uma por despesa). */
export function comprasSemObra(compras: readonly CompraParaAnalise[], cartoes: readonly CartaoParaAnalise[]): CompraSemObra[] {
  const porCartao = new Map(cartoes.map((c) => [c.id, nome(c)]));
  const vistas = new Set<string>();
  const out: CompraSemObra[] = [];
  for (const c of compras) {
    if (c.projectId || vistas.has(c.despesaId)) continue;
    vistas.add(c.despesaId);
    out.push({ despesaId: c.despesaId, numDoc: c.numDoc, descricao: c.descricao, valor: r2(c.valor * Math.max(1, c.total)), cartao: porCartao.get(c.cartaoId) ?? "—" });
  }
  return out;
}

export function analisarCartoes(cartoes: readonly CartaoParaAnalise[], faturas: readonly FaturaParaAnalise[], compras: readonly CompraParaAnalise[], conferencia: { cartao: string; resultado: Conferencia } | null, hojeISO: string): AnaliseDeCartoes {
  return {
    projecoes: projecoesDosCartoes(cartoes, faturas, hojeISO),
    limites: limitesDosCartoes(cartoes, faturas, hojeISO),
    semObra: comprasSemObra(compras, cartoes),
    extrato: conferencia
      ? {
          cartao: conferencia.cartao,
          semLancamento: conferencia.resultado.semLancamento.length,
          semExtrato: conferencia.resultado.semExtrato.length,
          divergentes: conferencia.resultado.divergentes.length,
          creditosSemEstorno: conferencia.resultado.creditos.filter((c) => !c.estorno).length,
          valorSemLancamento: r2(conferencia.resultado.semLancamento.reduce((a, i) => a + i.valor, 0)),
        }
      : null,
    totalCartoes: cartoes.filter((c) => c.ativo).length,
  };
}
