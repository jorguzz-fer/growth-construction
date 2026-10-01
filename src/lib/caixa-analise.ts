import type { CadeiaDeSaldo, DiaDaCadeia, MovimentoDeCaixa, Natureza } from "@/lib/calc/cadeia-caixa";
import { ROTULO_NATUREZA, LIMITE_ATUALIZACAO_DIAS, isoDe } from "@/lib/calc/cadeia-caixa";

/**
 * Assistente do Caixa (Prompt L, Parte 8-A; Prompt E). Tudo PURO: analisa o
 * que a página carregou e PROPÕE. O vínculo só existe depois que a pessoa
 * confirma (8-A.1) — este módulo não grava nada e não importa ação alguma.
 *
 * Nunca (8-A.7): conciliar sozinho, dar baixa, lançar ajuste, alterar valor
 * de despesa ou movimento do extrato. O ajuste é o ponto mais sensível: o
 * painel não tem caminho para ele.
 */

export type Grau = "alta" | "media" | "baixa";

export interface SugestaoParaAnalise {
  despesaId: string;
  numDoc: string | null;
  fornecedor: string | null;
  valor: number;
  vencimento: string | null;
  grau: Grau;
}
export interface PendenteParaAnalise {
  cashEntryId: string;
  data: string | null;
  descricao: string | null;
  valor: number;
  vinculado: number;
  sugestoes: readonly SugestaoParaAnalise[];
}
export interface ContaAbertaParaAnalise {
  despesaId: string;
  numDoc: string | null;
  fornecedor: string | null;
  /** o que falta pagar. */
  saldo: number;
  vencimento: string | null;
}

export interface ParProposto {
  cashEntryId: string;
  data: string | null;
  descricao: string | null;
  valor: number;
  despesaId: string;
  numDoc: string | null;
  fornecedor: string | null;
  valorVinculo: number;
  grau: Grau;
  /** 8-A.2 — por que o assistente propõe este par. */
  motivo: string;
  /** só uma candidata de grau alto, e a despesa não é candidata alta de outro movimento. */
  inequivoco: boolean;
}

const r2 = (v: number) => Math.round(v * 100) / 100;
const norm = (s: string | null | undefined) => (s ?? "").toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "").trim();
const diasEntre = (a: string | null, b: string | null): number | null => {
  const ia = isoDe(a);
  const ib = isoDe(b);
  if (!ia || !ib) return null;
  return Math.abs(Math.round((Date.parse(ia) - Date.parse(ib)) / 86_400_000));
};
const primeiroNome = (fornecedor: string | null) => norm(fornecedor).split(/\s+/).find((t) => t.length >= 4) ?? "";
const historicoCita = (descricao: string | null, fornecedor: string | null) => {
  const n = primeiroNome(fornecedor);
  return !!n && norm(descricao).includes(n);
};
const restante = (m: PendenteParaAnalise) => r2(Math.abs(m.valor) - m.vinculado);

/** 8-A.2 — o motivo, pelos dados, não pelo grau. */
export function motivoDoPar(m: PendenteParaAnalise, s: SugestaoParaAnalise): string {
  const falta = restante(m);
  const exato = Math.abs(Math.abs(s.valor) - falta) <= 0.005;
  const dias = diasEntre(m.data, s.vencimento);
  const dataExata = dias === 0;
  const dataProxima = dias != null && dias <= 5;
  const nome = historicoCita(m.descricao, s.fornecedor);
  if (exato && dataExata) return "valor e data exatos";
  if (exato && nome) return "valor exato e fornecedor citado no histórico";
  if (exato && dataProxima) return `valor exato e data próxima (${dias} dia${dias === 1 ? "" : "s"})`;
  if (exato) return "valor exato";
  if (nome) return "valor aproximado com histórico compatível";
  if (dataProxima) return "valor aproximado e data próxima";
  return "valor aproximado";
}

/** 8-A.2 — um par por movimento (a melhor candidata), com grau, motivo e se é inequívoco. */
export function paresPropostos(pendentes: readonly PendenteParaAnalise[]): ParProposto[] {
  const altasPorDespesa = new Map<string, number>();
  for (const m of pendentes) for (const s of m.sugestoes) if (s.grau === "alta") altasPorDespesa.set(s.despesaId, (altasPorDespesa.get(s.despesaId) ?? 0) + 1);
  const out: ParProposto[] = [];
  for (const m of pendentes) {
    const s = m.sugestoes[0];
    if (!s) continue;
    const altas = m.sugestoes.filter((x) => x.grau === "alta");
    const falta = restante(m);
    out.push({
      cashEntryId: m.cashEntryId,
      data: m.data,
      descricao: m.descricao,
      valor: m.valor,
      despesaId: s.despesaId,
      numDoc: s.numDoc,
      fornecedor: s.fornecedor,
      valorVinculo: r2(Math.min(falta, Math.abs(s.valor))),
      grau: s.grau,
      motivo: motivoDoPar(m, s),
      inequivoco: s.grau === "alta" && altas.length === 1 && (altasPorDespesa.get(s.despesaId) ?? 0) === 1 && Math.abs(Math.abs(s.valor) - falta) <= 0.005,
    });
  }
  return out;
}

export interface AgrupamentoProposto {
  cashEntryId: string;
  data: string | null;
  descricao: string | null;
  valor: number;
  fornecedor: string | null;
  despesas: ContaAbertaParaAnalise[];
  soma: number;
  /** soma − o que falta no movimento (0 = fecha). */
  diferenca: number;
}

/** subconjunto cuja soma mais se aproxima do alvo (até 6 itens, listas de até 12). */
function melhorSubconjunto(itens: readonly ContaAbertaParaAnalise[], alvo: number): ContaAbertaParaAnalise[] | null {
  const lista = [...itens].sort((a, b) => b.saldo - a.saldo).slice(0, 12);
  let melhor: { sel: ContaAbertaParaAnalise[]; dif: number } | null = null;
  const tolerancia = Math.max(1, alvo * 0.005);
  const dfs = (i: number, sel: ContaAbertaParaAnalise[], soma: number) => {
    if (sel.length >= 2) {
      const dif = Math.abs(r2(soma - alvo));
      if (dif <= tolerancia && (!melhor || dif < melhor.dif)) melhor = { sel: [...sel], dif };
    }
    if (melhor?.dif === 0 || sel.length === 6 || i >= lista.length) return;
    for (let k = i; k < lista.length; k++) {
      if (soma + lista[k].saldo > alvo + tolerancia) continue;
      sel.push(lista[k]);
      dfs(k + 1, sel, r2(soma + lista[k].saldo));
      sel.pop();
    }
  };
  dfs(0, [], 0);
  return melhor ? (melhor as { sel: ContaAbertaParaAnalise[] }).sel : null;
}

/** 8-A.3 — um movimento que corresponde a VÁRIAS despesas do mesmo fornecedor. */
export function agrupamentosPropostos(pendentes: readonly PendenteParaAnalise[], abertas: readonly ContaAbertaParaAnalise[]): AgrupamentoProposto[] {
  const porFornecedor = new Map<string, ContaAbertaParaAnalise[]>();
  for (const c of abertas) {
    const k = norm(c.fornecedor);
    if (!k || c.saldo <= 0) continue;
    porFornecedor.set(k, [...(porFornecedor.get(k) ?? []), c]);
  }
  const out: AgrupamentoProposto[] = [];
  for (const m of pendentes) {
    const falta = restante(m);
    if (falta <= 0) continue;
    // já tem candidata que fecha sozinha: não é caso de agrupamento
    if (m.sugestoes.some((s) => Math.abs(Math.abs(s.valor) - falta) <= 0.005)) continue;
    let melhor: AgrupamentoProposto | null = null;
    for (const [, itens] of porFornecedor) {
      if (itens.length < 2) continue;
      // só fornecedores com alguma pista: citado no histórico ou presente nas sugestões
      const pista = historicoCita(m.descricao, itens[0].fornecedor) || m.sugestoes.some((s) => norm(s.fornecedor) === norm(itens[0].fornecedor));
      if (!pista) continue;
      const sel = melhorSubconjunto(itens, falta);
      if (!sel) continue;
      const soma = r2(sel.reduce((a, c) => a + c.saldo, 0));
      const cand = { cashEntryId: m.cashEntryId, data: m.data, descricao: m.descricao, valor: m.valor, fornecedor: itens[0].fornecedor, despesas: sel, soma, diferenca: r2(soma - falta) };
      if (!melhor || Math.abs(cand.diferenca) < Math.abs(melhor.diferenca)) melhor = cand;
    }
    if (melhor) out.push(melhor);
  }
  return out;
}

export interface ExplicacaoDoDia {
  /** "YYYY-MM-DD" */
  dia: string;
  diferenca: number;
  frase: string;
  linhas: { natureza: Natureza; rotulo: string; id: string; data: string | null; valor: number }[];
}

// espaço comum no lugar do NBSP do Intl, para a frase ser legível e comparável
const brl = (v: number) => new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(v).replace(/\u00a0/g, " ");

/** 8-A.4 — por que os dois saldos não batem: as linhas, não o total. */
export function explicacaoDoDia(d: DiaDaCadeia): ExplicacaoDoDia | null {
  if (d.diferenca == null || Math.abs(d.diferenca) <= 0.005) return null;
  const linhas: ExplicacaoDoDia["linhas"] = [];
  for (const k of Object.keys(d.naturezas) as Natureza[]) for (const it of d.naturezas[k].itens) linhas.push({ natureza: k, rotulo: ROTULO_NATUREZA[k], id: it.id, data: it.data, valor: it.valor });
  const partes: string[] = [];
  const n = d.naturezas;
  const conta = (k: Natureza, texto: (qtd: number, total: number) => string) => {
    if (n[k].itens.length) partes.push(texto(n[k].itens.length, n[k].valor));
  };
  conta("extratoSemLancamento", (q, t) => `${q} ${t < 0 ? "débito" : "crédito"}${q > 1 ? "s" : ""} de ${brl(Math.abs(t))} no extrato sem lançamento`);
  conta("lancamentoSemExtrato", (q, t) => `${q} lançamento${q > 1 ? "s" : ""} de ${brl(Math.abs(t))} sem movimento no extrato`);
  conta("valorDivergente", (q, t) => `${q} vínculo${q > 1 ? "s" : ""} com valor divergente (${brl(Math.abs(t))})`);
  conta("dataTrocada", (q, t) => `${q} movimento${q > 1 ? "s" : ""} em data trocada (${brl(Math.abs(t))})`);
  const sobraOuFalta = d.diferenca > 0 ? "Sobram" : "Faltam";
  const frase = `${sobraOuFalta} ${brl(Math.abs(d.diferenca))} em ${d.dia.split("-").reverse().join("/")}: ${partes.length ? partes.join(", e ") : "nenhuma linha explica — veja movimentos de outros dias ou o saldo da conta"}.`;
  return { dia: d.dia, diferenca: d.diferenca, frase, linhas };
}

export interface Encaminhamento {
  cashEntryId: string;
  data: string | null;
  descricao: string | null;
  valor: number;
  /** o que o assistente acha que é; null = sem pista. */
  parece: string | null;
}

/** 8-A.5 — movimento sem contraparte: o que parece ser, para lançar na tela certa. */
export function encaminhamentos(pendentes: readonly PendenteParaAnalise[], abertas: readonly ContaAbertaParaAnalise[], hojeISO: string): Encaminhamento[] {
  const fornecedores = [...new Set(abertas.map((c) => c.fornecedor).filter((x): x is string => !!x))];
  return pendentes
    .filter((m) => m.sugestoes.length === 0)
    .map((m) => {
      const citado = fornecedores.find((f) => historicoCita(m.descricao, f));
      const falta = restante(m);
      const vencida = abertas.find((c) => Math.abs(c.saldo - falta) <= 0.005 && (isoDe(c.vencimento) ?? "9999") < hojeISO);
      const parece = citado ? `fornecedor conhecido pelo histórico: ${citado}` : vencida ? `valor compatível com a conta vencida ${vencida.numDoc ?? ""} de ${vencida.fornecedor ?? "—"}`.trim() : null;
      return { cashEntryId: m.cashEntryId, data: m.data, descricao: m.descricao, valor: m.valor, parece };
    });
}

export interface Recorrencia {
  chave: string;
  descricao: string;
  valorMedio: number;
  meses: string[];
  ultimaData: string | null;
}

/** 8-A.6 — movimentos que se repetem todo mês (≥ 3 meses distintos, mesmo histórico e valor ±2%). */
export function recorrencias(movimentos: readonly MovimentoDeCaixa[], descricoes: ReadonlyMap<string, string | null>): Recorrencia[] {
  const grupos = new Map<string, { descricao: string; valores: number[]; meses: Set<string>; ultima: string | null }>();
  for (const m of movimentos) {
    if (m.cat === "ajuste") continue;
    const iso = isoDe(m.data);
    if (!iso) continue;
    const texto = norm(descricoes.get(m.id)).replace(/\d+/g, " ").replace(/\s+/g, " ").trim();
    if (texto.length < 4) continue;
    const faixa = Math.round(Math.log(Math.max(1, Math.abs(m.valor))) / Math.log(1.02));
    const chave = `${texto}|${m.valor < 0 ? "-" : "+"}|${faixa}`;
    const g = grupos.get(chave) ?? { descricao: descricoes.get(m.id) ?? texto, valores: [], meses: new Set<string>(), ultima: null };
    g.valores.push(Math.abs(m.valor));
    g.meses.add(iso.slice(0, 7));
    if (!g.ultima || iso > g.ultima) g.ultima = iso;
    grupos.set(chave, g);
  }
  return [...grupos.entries()]
    .filter(([, g]) => g.meses.size >= 3)
    .map(([chave, g]) => ({ chave, descricao: g.descricao, valorMedio: r2(g.valores.reduce((a, v) => a + v, 0) / g.valores.length), meses: [...g.meses].sort(), ultimaData: g.ultima }))
    .sort((a, b) => b.meses.length - a.meses.length);
}

export interface AnaliseDoCaixa {
  pares: ParProposto[];
  agrupamentos: AgrupamentoProposto[];
  explicacoes: ExplicacaoDoDia[];
  encaminhamentos: Encaminhamento[];
  diasQueNaoFecham: { dia: string; diferenca: number; pendentes: number }[];
  conciliadoSemVinculo: { mes: string; quantidade: number; valor: number }[];
  baixadoSemConciliar: { total: number; despesas: number; dias: number | null };
  extratoNaoImportado: { id: string; nome: string; dias: number | null }[];
  diasNaoFechados: { dia: string; motivo: "conciliado sem fechamento" | "aberto antes de um fechado" }[];
  recorrencias: Recorrencia[];
}

export function analisarCaixa(p: {
  pendentes: readonly PendenteParaAnalise[];
  abertas: readonly ContaAbertaParaAnalise[];
  cadeia: CadeiaDeSaldo;
  conciliadosSemVinculo: readonly { data: string | null; valor: number }[];
  baixado: { total: number; despesas: number; dias: number | null };
  contas: readonly { id: string; nome: string; diasDesde: number | null }[];
  movimentos: readonly MovimentoDeCaixa[];
  descricoes: ReadonlyMap<string, string | null>;
  hojeISO: string;
}): AnaliseDoCaixa {
  const realizados = p.cadeia.dias.filter((d) => d.rotulo !== "Projeção");
  const porMes = new Map<string, { quantidade: number; valor: number }>();
  for (const c of p.conciliadosSemVinculo) {
    const mes = (isoDe(c.data) ?? "sem data").slice(0, 7);
    const g = porMes.get(mes) ?? { quantidade: 0, valor: 0 };
    g.quantidade++;
    g.valor = r2(g.valor + c.valor);
    porMes.set(mes, g);
  }
  return {
    pares: paresPropostos(p.pendentes),
    agrupamentos: agrupamentosPropostos(p.pendentes, p.abertas),
    explicacoes: realizados.map(explicacaoDoDia).filter((x): x is ExplicacaoDoDia => !!x),
    encaminhamentos: encaminhamentos(p.pendentes, p.abertas, p.hojeISO),
    // do mais antigo para o mais recente: o primeiro costuma explicar os seguintes
    diasQueNaoFecham: realizados.filter((d) => d.diferenca != null && Math.abs(d.diferenca) > 0.005).map((d) => ({ dia: d.dia, diferenca: d.diferenca as number, pendentes: d.pendentes })),
    conciliadoSemVinculo: [...porMes.entries()].sort(([a], [b]) => a.localeCompare(b)).map(([mes, g]) => ({ mes, ...g })),
    baixadoSemConciliar: p.baixado,
    extratoNaoImportado: p.contas.filter((c) => c.diasDesde == null || c.diasDesde > LIMITE_ATUALIZACAO_DIAS).map((c) => ({ id: c.id, nome: c.nome, dias: c.diasDesde })),
    diasNaoFechados: realizados.filter((d) => d.dia < p.hojeISO && !d.fechado).map((d) => ({ dia: d.dia, motivo: d.buraco ? ("aberto antes de um fechado" as const) : ("conciliado sem fechamento" as const) })).filter((x) => x.motivo === "aberto antes de um fechado" || realizados.find((d) => d.dia === x.dia)?.pendentes === 0),
    recorrencias: recorrencias(p.movimentos, p.descricoes),
  };
}
