/**
 * Cadeia de saldo do caixa (Prompt L, Parte 1) — PURA. Nada aqui lê banco.
 *
 * Dois saldos por dia (1.1):
 *  - EM CONTA: o do extrato, fato do banco. Só existe até hoje. O saldo em
 *    conta ao fim do dia D é o saldo atual da conta MENOS os movimentos
 *    importados do extrato com data posterior a D — calculado para trás,
 *    nunca somando movimento já refletido no saldo (1.4).
 *  - CONCILIADO: o que os lançamentos sustentam: conciliado anterior
 *    + entradas conciliadas − saídas conciliadas + ajustes (1.1), encadeado
 *    dia a dia. O saldo inicial de um dia é, por definição, o saldo final
 *    do dia anterior (1.4-A).
 *
 * O ponto de partida da janela é o `saldo_final` gravado no fechamento do
 * dia anterior a ela (9.2); sem fechamento, o saldo em conta calculado
 * daquele dia (7.3: sem marco inicial — o que vinha antes é absorvido).
 *
 * A diferença entre os dois é classificada em quatro naturezas (1.3).
 */

export interface MovimentoDeCaixa {
  id: string;
  /** "MM/DD/YYYY" */
  data: string | null;
  valor: number;
  rec: boolean;
  cat: string | null;
  /** veio do extrato (tem `import_hash`) — é fato do banco. */
  importado: boolean;
  bankAccountId: string | null;
}

export interface FechamentoGravado {
  /** "MM/DD/YYYY" */
  dia: string;
  saldoFinal: number;
}

export type Natureza = "extratoSemLancamento" | "lancamentoSemExtrato" | "valorDivergente" | "dataTrocada";

export interface ItemDaNatureza {
  id: string;
  data: string | null;
  valor: number;
}

export type Rotulo = "Realizado · conciliado" | "Realizado · pendente" | "Hoje" | "Projeção";

export interface DiaDaCadeia {
  /** "YYYY-MM-DD" */
  dia: string;
  rotulo: Rotulo;
  entradas: number;
  saidas: number;
  entradasConciliadas: number;
  saidasConciliadas: number;
  ajustes: number;
  /** null em dia futuro: o banco ainda não registrou nada (1.4-A.5). */
  emConta: { inicial: number; final: number } | null;
  conciliado: { inicial: number; final: number };
  /** em conta − conciliado ao fim do dia; null em dia futuro. */
  diferenca: number | null;
  naturezas: Record<Natureza, { valor: number; itens: ItemDaNatureza[] }>;
  /** quantos movimentos do dia ainda explicam diferença. */
  pendentes: number;
  fechado: boolean;
}

export interface CadeiaDeSaldo {
  dias: DiaDaCadeia[];
  inicio: { dia: string; emConta: number; conciliado: number; fonte: "fechamento" | "calculado" };
}

const r2 = (v: number) => Math.round(v * 100) / 100;

/** "MM/DD/YYYY" → "YYYY-MM-DD"; inválida → null. */
export function isoDe(data: string | null | undefined): string | null {
  if (!data) return null;
  const p = data.trim().split("/");
  if (p.length !== 3) return null;
  const [m, d, y] = p;
  if (!m || !d || !y) return null;
  return `${y}-${m.padStart(2, "0")}-${d.padStart(2, "0")}`;
}

/** "YYYY-MM-DD" → "MM/DD/YYYY". */
export function brDe(iso: string): string {
  const [y, m, d] = iso.split("-");
  return `${m}/${d}/${y}`;
}

export function somarDias(iso: string, n: number): string {
  const [y, m, d] = iso.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d + n)).toISOString().slice(0, 10);
}

const difDias = (a: string, b: string) => Math.round((Date.parse(a) - Date.parse(b)) / 86_400_000);

export interface ParametrosDaCadeia {
  movimentos: readonly MovimentoDeCaixa[];
  /** saldo atual em conta (extrato) — da conta, ou a soma das contas da empresa. */
  saldoEmContaAtual: number;
  fechamentos?: readonly FechamentoGravado[];
  /** "YYYY-MM-DD" (do servidor). */
  hojeISO: string;
  diasPassados?: number;
  diasFuturos?: number;
  /** 1.3 (3) — divergências de valor dentro de um vínculo (Parte 2); vazio até existirem. */
  divergenciasDeVinculo?: readonly ItemDaNatureza[];
}

/**
 * 1.3 (4) — movimento em data trocada: a mesma linha aparece num dia como
 * movimento do extrato sem lançamento e, até 3 dias antes ou depois, como
 * lançamento sem movimento no extrato, com o mesmo valor. Pareia os dois.
 */
export function pareamentoPorData(movimentos: readonly MovimentoDeCaixa[]): Map<string, string> {
  const extrato = movimentos.filter((m) => m.importado && !m.rec && isoDe(m.data));
  const lancados = movimentos.filter((m) => !m.importado && m.rec && m.cat !== "ajuste" && isoDe(m.data));
  const pares = new Map<string, string>();
  const usados = new Set<string>();
  for (const e of extrato) {
    const alvo = lancados.find((l) => !usados.has(l.id) && Math.abs(l.valor - e.valor) <= 0.005 && Math.abs(difDias(isoDe(l.data)!, isoDe(e.data)!)) <= 3 && isoDe(l.data) !== isoDe(e.data));
    if (alvo) {
      usados.add(alvo.id);
      pares.set(e.id, alvo.id);
      pares.set(alvo.id, e.id);
    }
  }
  return pares;
}

export function cadeiaDeSaldo(p: ParametrosDaCadeia): CadeiaDeSaldo {
  const passados = p.diasPassados ?? 2;
  const futuros = p.diasFuturos ?? 7;
  const primeiro = somarDias(p.hojeISO, -passados);
  const anterior = somarDias(primeiro, -1);
  const porDia = new Map<string, MovimentoDeCaixa[]>();
  for (const m of p.movimentos) {
    const iso = isoDe(m.data);
    if (!iso) continue;
    porDia.set(iso, [...(porDia.get(iso) ?? []), m]);
  }
  // Saldo em conta ao fim de um dia: saldo atual − importados posteriores (nunca soma o que já está no saldo).
  const emContaFinal = (dia: string) => r2(p.saldoEmContaAtual - p.movimentos.filter((m) => m.importado && (isoDe(m.data) ?? "") > dia).reduce((a, m) => a + m.valor, 0));
  const fechados = new Map((p.fechamentos ?? []).map((f) => [isoDe(f.dia) ?? f.dia, f.saldoFinal]));
  const emContaInicio = emContaFinal(anterior);
  const fechamentoAnterior = fechados.get(anterior);
  const inicio: CadeiaDeSaldo["inicio"] = { dia: anterior, emConta: emContaInicio, conciliado: fechamentoAnterior ?? emContaInicio, fonte: fechamentoAnterior != null ? "fechamento" : "calculado" };
  const pares = pareamentoPorData(p.movimentos);
  const divergencias = new Map<string, ItemDaNatureza[]>();
  for (const d of p.divergenciasDeVinculo ?? []) {
    const iso = isoDe(d.data);
    if (!iso) continue;
    divergencias.set(iso, [...(divergencias.get(iso) ?? []), d]);
  }

  const dias: DiaDaCadeia[] = [];
  let conciliadoAnterior = inicio.conciliado;
  let emContaAnterior = inicio.emConta;
  for (let i = 0; i <= passados + futuros; i++) {
    const dia = somarDias(primeiro, i);
    const movs = porDia.get(dia) ?? [];
    const futuro = dia > p.hojeISO;
    const soma = (f: (m: MovimentoDeCaixa) => boolean) => r2(movs.filter(f).reduce((a, m) => a + m.valor, 0));
    const entradas = soma((m) => m.valor > 0);
    const saidas = -soma((m) => m.valor < 0);
    const entradasConciliadas = soma((m) => m.valor > 0 && m.rec && m.cat !== "ajuste");
    const saidasConciliadas = -soma((m) => m.valor < 0 && m.rec && m.cat !== "ajuste");
    const ajustes = soma((m) => m.cat === "ajuste");
    // Dia futuro: projeção com tudo que está lançado para ele (1.4-A.5).
    const deltaConciliado = futuro ? r2(entradas - saidas) : r2(entradasConciliadas - saidasConciliadas + ajustes);
    const conciliado = { inicial: conciliadoAnterior, final: r2(conciliadoAnterior + deltaConciliado) };
    const emConta = futuro ? null : { inicial: emContaAnterior, final: emContaFinal(dia) };
    const vazia = () => ({ valor: 0, itens: [] as ItemDaNatureza[] });
    const naturezas: DiaDaCadeia["naturezas"] = { extratoSemLancamento: vazia(), lancamentoSemExtrato: vazia(), valorDivergente: vazia(), dataTrocada: vazia() };
    if (!futuro) {
      for (const m of movs) {
        const item = { id: m.id, data: m.data, valor: m.valor };
        if (pares.has(m.id)) naturezas.dataTrocada.itens.push(item);
        else if (m.importado && !m.rec) naturezas.extratoSemLancamento.itens.push(item);
        else if (!m.importado && m.rec && m.cat !== "ajuste") naturezas.lancamentoSemExtrato.itens.push(item);
      }
      naturezas.valorDivergente.itens.push(...(divergencias.get(dia) ?? []));
      for (const k of Object.keys(naturezas) as Natureza[]) naturezas[k].valor = r2(naturezas[k].itens.reduce((a, x) => a + x.valor, 0));
    }
    const pendentes = futuro ? 0 : naturezas.extratoSemLancamento.itens.length + naturezas.lancamentoSemExtrato.itens.length + naturezas.valorDivergente.itens.length + naturezas.dataTrocada.itens.length;
    const rotulo: Rotulo = futuro ? "Projeção" : dia === p.hojeISO ? "Hoje" : pendentes > 0 ? "Realizado · pendente" : "Realizado · conciliado";
    dias.push({ dia, rotulo, entradas, saidas, entradasConciliadas, saidasConciliadas, ajustes, emConta, conciliado, diferenca: emConta ? r2(emConta.final - conciliado.final) : null, naturezas, pendentes, fechado: fechados.has(dia) });
    conciliadoAnterior = conciliado.final;
    if (emConta) emContaAnterior = emConta.final;
  }
  return { dias, inicio };
}

/** 1.4-A.6 — a identidade da cadeia: o inicial de cada dia é exatamente o final do anterior. Devolve os dias que quebram. */
export function quebrasDaCadeia(c: CadeiaDeSaldo): string[] {
  const out: string[] = [];
  for (let i = 1; i < c.dias.length; i++) {
    const a = c.dias[i - 1];
    const b = c.dias[i];
    if (Math.abs(b.conciliado.inicial - a.conciliado.final) > 0.005) out.push(b.dia);
    else if (a.emConta && b.emConta && Math.abs(b.emConta.inicial - a.emConta.final) > 0.005) out.push(b.dia);
  }
  return out;
}

export const ROTULO_NATUREZA: Record<Natureza, string> = {
  extratoSemLancamento: "movimento no extrato sem lançamento",
  lancamentoSemExtrato: "lançamento sem movimento no extrato",
  valorDivergente: "divergência de valor no vínculo",
  dataTrocada: "movimento em data trocada",
};

/** 1.0.2 — alerta quando a última atualização do saldo em conta passou do limite. */
export const LIMITE_ATUALIZACAO_DIAS = 7;
export function diasDesdeAtualizacao(atualizadoEm: string | null, hojeISO: string): number | null {
  if (!atualizadoEm) return null;
  const t = Date.parse(atualizadoEm);
  if (!Number.isFinite(t)) return null;
  return Math.max(0, Math.round((Date.parse(hojeISO) - Date.UTC(new Date(t).getUTCFullYear(), new Date(t).getUTCMonth(), new Date(t).getUTCDate())) / 86_400_000));
}
