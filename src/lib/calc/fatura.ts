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
}

const r2 = (v: number) => Math.round(v * 100) / 100;
const hojeYmd = (hojeISO: string) => Number(hojeISO.replace(/-/g, ""));

export function saldoDaFatura(f: Pick<FaturaParaEstado, "valorCompras" | "valorPago">): number {
  return Math.max(0, r2(f.valorCompras - f.valorPago));
}

export function estadoDaFatura(f: FaturaParaEstado, hojeISO: string): EstadoDaFatura {
  const fecha = ymd(f.fechamento) ?? 0;
  if (fecha >= hojeYmd(hojeISO)) return "aberta";
  if (f.valorCompras > 0 && saldoDaFatura(f) === 0) return "paga";
  if (f.valorPago > 0) return "paga parcialmente";
  return "fechada";
}

/** Rótulo de Contas a Pagar: aberta = "Prevista"; fechada = "A pagar" ou "Vencida"; paga = "Pago". */
export function statusDaFatura(f: FaturaParaEstado, hojeISO: string): string {
  const e = estadoDaFatura(f, hojeISO);
  if (e === "aberta") return "Prevista";
  if (e === "paga") return "Pago";
  const vencida = (ymd(f.vencimento) ?? 0) < hojeYmd(hojeISO);
  if (e === "paga parcialmente") return vencida ? STATUS_VENCIDA : "Parcialmente paga";
  return vencida ? STATUS_VENCIDA : "A pagar";
}

export interface FaturaParaLinha extends FaturaParaEstado {
  id: string;
  cartaoId: string;
  cartaoNome: string;
  qtdCompras: number;
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
  return {
    id: `fatura:${f.id}`,
    numDoc: null,
    fornecedorNome: `Fatura · ${f.cartaoNome}`,
    descricao: `${f.qtdCompras} compra(s) · fecha ${dataBR(f.fechamento)}${estado === "aberta" ? " · ainda recebe compras" : ""}`,
    categoriaDre: null,
    contaCef: null,
    valor: r2(f.valorCompras),
    saldo: saldoDaFatura(f),
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
    faturas: faturas.filter((f) => f.qtdCompras > 0 || f.valorPago > 0).map((f) => linhaDaFatura(f, hojeISO)),
  };
}
