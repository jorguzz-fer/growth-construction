/**
 * Prompt AG, seção 6 — o que o assistente das Notas Fiscais mostra. Módulo
 * PURO e determinístico: nenhuma chamada a modelo de IA, nenhum dado sai do
 * servidor. SOMENTE LEITURA: nunca emite, nunca corrige, nunca sugere
 * alíquota, item da LC 116, município ou retenção — isso é decisão da
 * contabilidade (o mesmo princípio de `calc/nfse.ts`).
 */
import type { EmitenteFiscal } from "@/lib/calc/emitente-fiscal";
import { checarProntidaoFiscal } from "@/lib/calc/emitente-fiscal";
import type { ObraFiscal } from "@/lib/fiscal/nfse-payload";
import { EMITENTE_REPETIDO, conferirAntesDoEnvio, dataDeEmissao, podeEnviar, type NotaParaEmissao } from "@/lib/nota-servico";

export interface NotaParaAnalise extends NotaParaEmissao {
  status: string;
  projectId: string;
  projeto: string;
  enviadaEm: Date | null;
  createdAt: Date;
  mensagemRetorno: string | null;
}

export interface AnaliseDasNotas {
  /** Bloqueios do cadastro da empresa: valem para todas as notas. */
  pendenciasDaEmpresa: string[];
  /** Rascunhos e rejeitadas com o que falta, nota a nota. */
  conferir: { id: string; projeto: string; valor: number; status: string; pendencias: string[] }[];
  /** Rascunhos e rejeitadas sem pendência própria. */
  prontas: number;
  /** Rejeitadas agrupadas pela mensagem do provedor (a mais frequente primeiro). */
  rejeitadas: { motivo: string; quantas: number; ids: string[] }[];
  /** Processando há mais que o limite (a nota não se atualiza sozinha). */
  demoradas: { id: string; projeto: string; valor: number; minutos: number }[];
  limiteMinutos: number;
}

/** 30 minutos: a prefeitura costuma responder em minutos; mais que isso merece consulta. */
export const LIMITE_PROCESSANDO_MIN = 30;

/** A primeira linha da mensagem, sem número de protocolo que mude de nota para nota. */
export function motivoDaRejeicao(m: string | null): string {
  const linha = (m ?? "").split("\n")[0].trim().slice(0, 160);
  return linha || "Sem mensagem do provedor";
}

export function analisarNotas(
  notas: readonly NotaParaAnalise[],
  o: { emitente: EmitenteFiscal; obras: ReadonlyMap<string, ObraFiscal>; agora?: Date; limiteMinutos?: number },
): AnaliseDasNotas {
  const agora = o.agora ?? new Date();
  const limite = o.limiteMinutos ?? LIMITE_PROCESSANDO_MIN;
  const pendenciasDaEmpresa = checarProntidaoFiscal(o.emitente)
    .filter((p) => p.severidade === "bloqueio")
    .map((p) => `${p.label}: ${p.mensagem}`);
  const conferir: AnaliseDasNotas["conferir"] = [];
  let prontas = 0;
  const grupos = new Map<string, string[]>();
  const demoradas: AnaliseDasNotas["demoradas"] = [];
  for (const n of notas) {
    if (podeEnviar(n.status)) {
      const m = conferirAntesDoEnvio(n, o.emitente, o.obras.get(n.projectId) ?? null, dataDeEmissao(agora));
      const proprias = m.erros.filter((e) => !EMITENTE_REPETIDO.test(e));
      if (proprias.length) conferir.push({ id: n.id, projeto: n.projeto, valor: Number(n.valorServicos), status: n.status, pendencias: proprias });
      else prontas++;
    }
    if (n.status === "rejeitada") {
      const k = motivoDaRejeicao(n.mensagemRetorno);
      grupos.set(k, [...(grupos.get(k) ?? []), n.id]);
    }
    if (n.status === "processando") {
      const desde = n.enviadaEm ?? n.createdAt;
      const minutos = Math.floor((agora.getTime() - desde.getTime()) / 60_000);
      if (minutos >= limite) demoradas.push({ id: n.id, projeto: n.projeto, valor: Number(n.valorServicos), minutos });
    }
  }
  return {
    pendenciasDaEmpresa,
    conferir,
    prontas,
    rejeitadas: [...grupos.entries()].map(([motivo, ids]) => ({ motivo, quantas: ids.length, ids })).sort((a, b) => b.quantas - a.quantas),
    demoradas: demoradas.sort((a, b) => b.minutos - a.minutos),
    limiteMinutos: limite,
  };
}

/** Como o sistema faz a conta — o mesmo texto para qualquer nota (seção 6, "explicar o cálculo"). */
export const EXPLICACAO_DO_CALCULO: readonly string[] = [
  "Base de cálculo do ISS = valor dos serviços − deduções − desconto incondicionado.",
  "ISS = base de cálculo × alíquota informada. Se o tomador retém o ISS, ele entra no total retido.",
  "Cada retenção federal (PIS, COFINS, CSLL, IRRF, INSS) = alíquota informada × valor dos serviços, ou × a base própria quando você a informa (comum no INSS: só a mão de obra).",
  "Total retido = ISS retido (se houver) + retenções federais + outras retenções.",
  "Valor líquido a receber = valor dos serviços − desconto incondicionado − total retido. É o que deve cair na conta.",
  "O desconto condicionado não entra no líquido: ele só vale se se concretizar.",
  "O sistema só faz a conta. Quais tributos incidem, a alíquota, o item da LC 116 e o município são decisão da contabilidade — o assistente não sugere nenhum deles.",
];
