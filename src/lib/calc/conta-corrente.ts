/**
 * Conta corrente de terceiros — UMA lógica de movimentos (Prompt I, §26).
 *
 * Dois lados por terceiro:
 *   - **a restituir** (a empresa deve a ele): desembolso (+), restituição (−),
 *     estorno de restituição cancelada (+), compensação (−);
 *   - **a repassar** (ele deve à empresa): recebimento pelo terceiro (+),
 *     repasse (−), compensação (−).
 *
 * A compensação baixa os dois lados pelo mesmo valor, sem DRE e sem caixa, e
 * aparece no extrato. Tudo puro: as telas e a conferência usam esta função, e
 * o saldo aqui tem de bater com `valorTotal − valorRestituido` das obrigações
 * (e `valorTotal − valorRepassado` dos recebimentos), que já incluem
 * compensações. Restituição cancelada entra como par (saída e estorno) para a
 * trilha ficar visível, com efeito líquido zero.
 */
import { ymd } from "@/lib/utils";

const round2 = (v: number) => Math.round(v * 100) / 100;

export type TipoMovimento = "desembolso" | "restituicao" | "estorno" | "recebimento" | "repasse" | "compensacao";

export interface MovimentoTerceiro {
  id: string;
  tipo: TipoMovimento;
  data: string | null;
  descricao: string;
  numDoc: string | null;
  valor: number;
  /** Efeito no lado "a restituir" (empresa deve): +valor, −valor ou 0. */
  efeitoRestituir: number;
  /** Efeito no lado "a repassar" (terceiro deve): +valor, −valor ou 0. */
  efeitoRepassar: number;
  /** Saldo a restituir acumulado APÓS este movimento. */
  saldoAcumulado: number;
  /** Saldo a repassar acumulado APÓS este movimento. */
  saldoRepassarAcumulado: number;
}

export interface ContaCorrenteTerceiro {
  pagadorId: string | null;
  pagador: string;
  totalDesembolsado: number;
  totalRestituido: number;
  totalCompensado: number;
  totalRecebido: number;
  totalRepassado: number;
  /** = a restituir: desembolsado − restituído − compensado. */
  saldoDevido: number;
  saldoARepassar: number;
  movimentos: MovimentoTerceiro[];
}

export interface FontesContaCorrente {
  obrigacoes: readonly {
    id: string;
    pagadorId: string | null;
    pagador: string | null;
    valorTotal: number;
    data: string | null;
    numDoc: string | null;
    cancelada: boolean;
  }[];
  restituicoes: readonly {
    id: string;
    despesaTerceiroId: string;
    valor: number;
    data: string | null;
    cancelada: boolean;
    canceladaEm: string | null;
    conciliada: boolean;
  }[];
  recebimentos: readonly {
    id: string;
    recebedorId: string | null;
    recebedor: string | null;
    valorTotal: number;
    data: string | null;
    cancelado: boolean;
  }[];
  repasses: readonly { id: string; recebimentoId: string; valor: number; data: string | null }[];
  compensacoes: readonly { id: string; terceiroId: string | null; valor: number; data: string | null; numDoc: string | null }[];
}

const ORDEM_TIPO: Record<TipoMovimento, number> = {
  desembolso: 0,
  recebimento: 1,
  restituicao: 2,
  repasse: 3,
  compensacao: 4,
  estorno: 5,
};

/** Data → número comparável; sem data vai para o fim. */
const ordData = (d: string | null) => ymd(d) ?? Number.MAX_SAFE_INTEGER;

export function montarContaCorrente(f: FontesContaCorrente): ContaCorrenteTerceiro[] {
  const contas = new Map<string, ContaCorrenteTerceiro>();
  const abrir = (id: string | null, nome: string | null): ContaCorrenteTerceiro => {
    const k = id ?? "—";
    let c = contas.get(k);
    if (!c) {
      c = {
        pagadorId: id,
        pagador: nome ?? "Não identificado",
        totalDesembolsado: 0,
        totalRestituido: 0,
        totalCompensado: 0,
        totalRecebido: 0,
        totalRepassado: 0,
        saldoDevido: 0,
        saldoARepassar: 0,
        movimentos: [],
      };
      contas.set(k, c);
    }
    return c;
  };
  const mov = (c: ContaCorrenteTerceiro, m: Omit<MovimentoTerceiro, "saldoAcumulado" | "saldoRepassarAcumulado">) =>
    c.movimentos.push({ ...m, saldoAcumulado: 0, saldoRepassarAcumulado: 0 });

  const obrigacoesAtivas = f.obrigacoes.filter((o) => !o.cancelada);
  const obrigacaoPorId = new Map(obrigacoesAtivas.map((o) => [o.id, o]));
  for (const o of obrigacoesAtivas) {
    const c = abrir(o.pagadorId, o.pagador);
    c.totalDesembolsado += o.valorTotal;
    mov(c, {
      id: o.id,
      tipo: "desembolso",
      data: o.data,
      descricao: "Pagamento a fornecedor pela empresa",
      numDoc: o.numDoc,
      valor: o.valorTotal,
      efeitoRestituir: o.valorTotal,
      efeitoRepassar: 0,
    });
  }
  for (const r of f.restituicoes) {
    const o = obrigacaoPorId.get(r.despesaTerceiroId);
    if (!o) continue;
    const c = abrir(o.pagadorId, o.pagador);
    if (!r.cancelada) c.totalRestituido += r.valor;
    mov(c, {
      id: r.id,
      tipo: "restituicao",
      data: r.data,
      descricao: r.cancelada ? "Restituição (cancelada)" : r.conciliada ? "Restituição (conciliada no extrato)" : "Restituição",
      numDoc: o.numDoc,
      valor: r.valor,
      efeitoRestituir: -r.valor,
      efeitoRepassar: 0,
    });
    if (r.cancelada) {
      mov(c, {
        id: `${r.id}:estorno`,
        tipo: "estorno",
        data: r.canceladaEm ?? r.data,
        descricao: "Estorno de restituição cancelada",
        numDoc: o.numDoc,
        valor: r.valor,
        efeitoRestituir: r.valor,
        efeitoRepassar: 0,
      });
    }
  }

  const recebimentosAtivos = f.recebimentos.filter((r) => !r.cancelado);
  const recebimentoPorId = new Map(recebimentosAtivos.map((r) => [r.id, r]));
  for (const r of recebimentosAtivos) {
    const c = abrir(r.recebedorId, r.recebedor);
    c.totalRecebido += r.valorTotal;
    mov(c, {
      id: r.id,
      tipo: "recebimento",
      data: r.data,
      descricao: "Recebido do cliente em nome da empresa",
      numDoc: null,
      valor: r.valorTotal,
      efeitoRestituir: 0,
      efeitoRepassar: r.valorTotal,
    });
  }
  for (const p of f.repasses) {
    const r = recebimentoPorId.get(p.recebimentoId);
    if (!r) continue;
    const c = abrir(r.recebedorId, r.recebedor);
    c.totalRepassado += p.valor;
    mov(c, {
      id: p.id,
      tipo: "repasse",
      data: p.data,
      descricao: "Repasse à empresa",
      numDoc: null,
      valor: p.valor,
      efeitoRestituir: 0,
      efeitoRepassar: -p.valor,
    });
  }
  for (const k of f.compensacoes) {
    const c = contas.get(k.terceiroId ?? "—");
    if (!c) continue;
    c.totalCompensado += k.valor;
    mov(c, {
      id: k.id,
      tipo: "compensacao",
      data: k.data,
      descricao: "Encontro de contas (sem caixa, sem DRE)",
      numDoc: k.numDoc,
      valor: k.valor,
      efeitoRestituir: -k.valor,
      efeitoRepassar: -k.valor,
    });
  }

  for (const c of contas.values()) {
    c.movimentos.sort((a, b) => ordData(a.data) - ordData(b.data) || ORDEM_TIPO[a.tipo] - ORDEM_TIPO[b.tipo] || a.id.localeCompare(b.id));
    let restituir = 0;
    let repassar = 0;
    for (const m of c.movimentos) {
      restituir = round2(restituir + m.efeitoRestituir);
      repassar = round2(repassar + m.efeitoRepassar);
      m.saldoAcumulado = restituir;
      m.saldoRepassarAcumulado = repassar;
    }
    c.totalDesembolsado = round2(c.totalDesembolsado);
    c.totalRestituido = round2(c.totalRestituido);
    c.totalCompensado = round2(c.totalCompensado);
    c.totalRecebido = round2(c.totalRecebido);
    c.totalRepassado = round2(c.totalRepassado);
    c.saldoDevido = round2(c.totalDesembolsado - c.totalRestituido - c.totalCompensado);
    c.saldoARepassar = round2(c.totalRecebido - c.totalRepassado - c.totalCompensado);
  }
  return [...contas.values()].sort((a, b) => b.saldoDevido - a.saldoDevido || b.saldoARepassar - a.saldoARepassar);
}

/** Rótulo e cor do movimento na tela — uma tabela só. */
export function rotuloDoMovimento(t: TipoMovimento): { rotulo: string; tom: "warning" | "success" | "info" | "neutral" | "danger" } {
  switch (t) {
    case "desembolso":
      return { rotulo: "Desembolso", tom: "warning" };
    case "restituicao":
      return { rotulo: "Restituição", tom: "success" };
    case "estorno":
      return { rotulo: "Estorno", tom: "danger" };
    case "recebimento":
      return { rotulo: "Recebimento", tom: "info" };
    case "repasse":
      return { rotulo: "Repasse", tom: "success" };
    case "compensacao":
      return { rotulo: "Compensação", tom: "neutral" };
  }
}
