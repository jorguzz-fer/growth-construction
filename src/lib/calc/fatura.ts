import { ymd } from "@/lib/utils";
import { STATUS_VENCIDA } from "@/lib/despesa-status";
import { linhasPorObrigacao, type ParcelaParaLinha } from "@/lib/contas-pagar-regras";

/**
 * Regras PURAS da fatura de cartão (Prompt U, seções 2.5–2.9; Prompt R, 1.6).
 *
 * O estado é DERIVADO, não gravado: aberta enquanto hoje ≤ fechamento;
 * fechada depois; paga / paga parcialmente pelos pagamentos. Assim a mesma
 * linha muda de prevista para firme sem nascer uma segunda (2.9).
 *
 * Em Contas a Pagar a obrigação é a FATURA, nunca as compras: compra com
 * cartão sai da lista e quem fica é a fatura (2.6). A fatura aberta aparece
 * como obrigação PREVISTA, pelo acumulado do ciclo, sem estimativa de juros
 * (2.7, 2.8).
 */

export type EstadoDaFatura = "aberta" | "fechada" | "paga" | "paga parcialmente";

export interface FaturaParaEstado {
  fechamento: string;
  vencimento: string;
  /** soma das parcelas das compras vinculadas (sem juro estimado). */
  valorCompras: number;
  /** soma dos pagamentos já feitos (0 até o pagamento existir). */
  valorPago: number;
  /** 3.3 — saldo não pago das faturas anteriores (pagas parcialmente) que esta fatura traz. */
  rotativoAnterior?: number;
  /** 6.2 — créditos de estorno ainda não aplicados num pagamento: reduzem o que falta pagar. */
  creditos?: number;
}

const r2 = (v: number) => Math.round(v * 100) / 100;
const hojeYmd = (hojeISO: string) => Number(hojeISO.replace(/-/g, ""));

/** Total devido de uma fatura: compras do ciclo + rotativo que ela traz (2.8; sem estimativa de juros). */
export function totalDaFatura(f: Pick<FaturaParaEstado, "valorCompras" | "rotativoAnterior">): number {
  return r2(f.valorCompras + (f.rotativoAnterior ?? 0));
}

export function saldoDaFatura(f: Pick<FaturaParaEstado, "valorCompras" | "valorPago" | "rotativoAnterior" | "creditos">): number {
  return Math.max(0, r2(totalDaFatura(f) - f.valorPago - (f.creditos ?? 0)));
}

export function estadoDaFatura(f: FaturaParaEstado, hojeISO: string): EstadoDaFatura {
  const fecha = ymd(f.fechamento) ?? 0;
  if (fecha >= hojeYmd(hojeISO)) return "aberta";
  if (totalDaFatura(f) > 0 && saldoDaFatura(f) === 0) return "paga";
  if (f.valorPago > 0) return "paga parcialmente";
  return "fechada";
}

/** Rótulo de Contas a Pagar: aberta = "Prevista"; fechada = "A pagar" ou "Vencida"; paga = "Pago". */
export function statusDaFatura(f: FaturaParaEstado, hojeISO: string): string {
  const e = estadoDaFatura(f, hojeISO);
  if (e === "aberta") return "Prevista";
  if (e === "paga") return "Pago";
  // 3.3 — paga parcialmente: o saldo foi levado à fatura seguinte (que tem o
  // próprio vencimento); esta não fica "Vencida".
  if (e === "paga parcialmente") return "Parcialmente paga";
  const vencida = (ymd(f.vencimento) ?? 0) < hojeYmd(hojeISO);
  return vencida ? STATUS_VENCIDA : "A pagar";
}

export interface FaturaParaLinha extends FaturaParaEstado {
  id: string;
  cartaoId: string;
  cartaoNome: string;
  qtdCompras: number;
}

/**
 * 3.3 — o saldo não pago de uma fatura paga PARCIALMENTE vira rotativo e a
 * fatura seguinte o traz. Calcula, por cartão e em ordem de fechamento, o
 * rotativo que cada fatura recebe das anteriores: enquanto a fatura seguinte
 * não paga esse saldo, ele continua rolando. Puro.
 */
export function comRotativo<T extends FaturaParaLinha>(faturas: readonly T[], hojeISO: string): (T & { rotativoAnterior: number })[] {
  const porCartao = new Map<string, T[]>();
  for (const f of faturas) porCartao.set(f.cartaoId, [...(porCartao.get(f.cartaoId) ?? []), f]);
  const out: (T & { rotativoAnterior: number })[] = [];
  for (const lista of porCartao.values()) {
    let carry = 0;
    for (const f of emOrdem(lista)) {
      const g = { ...f, rotativoAnterior: r2(carry) };
      out.push(g);
      carry = proximoCarry(g, hojeISO);
    }
  }
  return out;
}

const emOrdem = <T extends { fechamento: string }>(lista: readonly T[]) => [...lista].sort((a, b) => (ymd(a.fechamento) ?? 0) - (ymd(b.fechamento) ?? 0));

/** O que fica em aberto numa fatura fechada com pagamento parcial rola para a seguinte — o saldo já inclui o rotativo que ela mesma trazia. */
function proximoCarry(f: FaturaParaEstado, hojeISO: string): number {
  return estadoDaFatura(f, hojeISO) === "paga parcialmente" ? saldoDaFatura(f) : 0;
}

/** 4.1 — o rotativo que o ciclo que fecha em `fechamentoDoCiclo` recebe das faturas anteriores do MESMO cartão (mesmo cálculo de `comRotativo`). */
export function rotativoParaOCiclo(faturasDoCartao: readonly FaturaParaLinha[], fechamentoDoCiclo: string, hojeISO: string): number {
  const limite = ymd(fechamentoDoCiclo) ?? 0;
  let carry = 0;
  for (const f of emOrdem(faturasDoCartao)) {
    if ((ymd(f.fechamento) ?? 0) >= limite) break;
    carry = proximoCarry({ ...f, rotativoAnterior: carry }, hojeISO);
  }
  return r2(carry);
}

/**
 * 4.1 — projeção do ciclo em curso, para a tela do cartão. Só o juro é
 * ESTIMATIVA (4.2), e só existe com taxa cadastrada (BU-3); nunca entra no
 * valor de Contas a Pagar (4.3). Puro.
 */
export interface ProjecaoDoCiclo {
  comprasDoCiclo: number;
  parcelasAnteriores: number;
  rotativoAnterior: number;
  /** o que Contas a Pagar mostra: compras + parcelas + rotativo, sem juro. */
  totalPrevisto: number;
  /** null sem taxa (BU-3): a tela diz que não projeta. */
  juroEstimado: number | null;
  /** totalPrevisto + juroEstimado (ou igual ao previsto, sem taxa). */
  totalProjetado: number;
}

export function projecaoDoCiclo(p: { comprasDoCiclo: number; parcelasAnteriores: number; rotativoAnterior: number; taxaRotativo: number | null }): ProjecaoDoCiclo {
  const totalPrevisto = r2(p.comprasDoCiclo + p.parcelasAnteriores + p.rotativoAnterior);
  const juroEstimado = p.taxaRotativo != null && p.rotativoAnterior > 0 ? r2((p.rotativoAnterior * p.taxaRotativo) / 100) : p.taxaRotativo != null ? 0 : null;
  return { comprasDoCiclo: r2(p.comprasDoCiclo), parcelasAnteriores: r2(p.parcelasAnteriores), rotativoAnterior: r2(p.rotativoAnterior), totalPrevisto, juroEstimado, totalProjetado: r2(totalPrevisto + (juroEstimado ?? 0)) };
}

/** 3.1/3.3 — distribui um pagamento pelas parcelas em aberto, na ordem recebida (FIFO); devolve os abatimentos e a sobra. Puro. */
export function distribuirPagamento<T extends { id: string; saldo: number }>(valor: number, parcelas: readonly T[]): { abatimentos: (T & { abatido: number })[]; sobra: number } {
  let resta = Math.round(valor * 100);
  const abatimentos: (T & { abatido: number })[] = [];
  for (const p of parcelas) {
    if (resta <= 0) break;
    const saldo = Math.round(p.saldo * 100);
    if (saldo <= 0) continue;
    const x = Math.min(saldo, resta);
    abatimentos.push({ ...p, abatido: x / 100 });
    resta -= x;
  }
  return { abatimentos, sobra: resta / 100 };
}

export interface LinhaDeFatura {
  id: string;
  numDoc: string | null;
  fornecedorNome: string | null;
  descricao: string | null;
  categoriaDre: string | null;
  contaCef: string | null;
  valor: number;
  saldo: number;
  versionKind: string;
  versionLabel: string;
  vencimento: string | null;
  competencia: string | null;
  dataPagamento: string | null;
  formaPagamento: string | null;
  status: string | null;
  projectId: string;
  projectName: string;
  clienteId: string | null;
  clienteNome: string | null;
  origem: "fatura";
  faturaId: string;
  cartaoId: string;
  /** true enquanto o ciclo está aberto: obrigação prevista, o valor ainda cresce. */
  prevista: boolean;
}

const pad = (n: number) => String(n).padStart(2, "0");
const dataBR = (s: string) => {
  const p = s.split("/");
  return p.length === 3 ? `${pad(Number(p[1]))}/${pad(Number(p[0]))}/${p[2]}` : s;
};

/** Uma fatura como linha de Contas a Pagar (1.6/1.7): fornecedor = o cartão; link vai para /cartoes. */
export function linhaDaFatura(f: FaturaParaLinha, hojeISO: string): LinhaDeFatura {
  const estado = estadoDaFatura(f, hojeISO);
  const rotativo = f.rotativoAnterior ?? 0;
  // 3.3 — paga parcialmente: o saldo foi levado à fatura seguinte; aqui a
  // linha fica com saldo zero para o mesmo dinheiro não aparecer duas vezes.
  const parcial = estado === "paga parcialmente";
  const partes = [`${f.qtdCompras} compra(s)`, `fecha ${dataBR(f.fechamento)}`];
  if (estado === "aberta") partes.push("ainda recebe compras");
  if (rotativo > 0) partes.push(`traz rotativo de ${rotativo.toLocaleString("pt-BR", { style: "currency", currency: "BRL" })}`);
  if ((f.creditos ?? 0) > 0) partes.push(`crédito de estorno de ${(f.creditos ?? 0).toLocaleString("pt-BR", { style: "currency", currency: "BRL" })}`);
  if (parcial) partes.push(`saldo de ${saldoDaFatura(f).toLocaleString("pt-BR", { style: "currency", currency: "BRL" })} levado à fatura seguinte`);
  return {
    id: `fatura:${f.id}`,
    numDoc: null,
    fornecedorNome: `Fatura · ${f.cartaoNome}`,
    descricao: partes.join(" · "),
    categoriaDre: null,
    contaCef: null,
    valor: totalDaFatura(f),
    saldo: parcial ? 0 : saldoDaFatura(f),
    versionKind: "atual",
    versionLabel: "Atual",
    vencimento: f.vencimento,
    competencia: null,
    dataPagamento: null,
    formaPagamento: "Cartão de crédito",
    status: statusDaFatura(f, hojeISO),
    projectId: `cartao:${f.cartaoId}`,
    projectName: `Cartão · ${f.cartaoNome}`,
    clienteId: null,
    clienteNome: null,
    origem: "fatura",
    faturaId: f.id,
    cartaoId: f.cartaoId,
    prevista: estado === "aberta",
  };
}

/**
 * A composição da lista de Contas a Pagar com cartão (2.6 / R 1.6): compras
 * no cartão (despesa com `cartaoId`) SAEM, inclusive as parcelas delas; as
 * faturas ENTRAM, uma linha cada. Faturas sem compra (vazias) ficam de fora.
 */
export function linhasComFaturas<T extends { id: string; cartaoId?: string | null; origem?: string; valor: number; saldo?: number; status: string | null; vencimento: string | null; dataPagamento: string | null; descricao: string | null }>(
  despesas: readonly T[],
  parcelas: readonly ParcelaParaLinha[],
  faturas: readonly FaturaParaLinha[],
  hojeISO: string,
): { compras: ReturnType<typeof linhasPorObrigacao<T>>; faturas: LinhaDeFatura[] } {
  const semCartao = despesas.filter((d) => !d.cartaoId);
  return {
    compras: linhasPorObrigacao(semCartao, parcelas),
    faturas: comRotativo(faturas, hojeISO)
      .filter((f) => f.qtdCompras > 0 || f.valorPago > 0 || f.rotativoAnterior > 0)
      .map((f) => linhaDaFatura(f, hojeISO)),
  };
}
