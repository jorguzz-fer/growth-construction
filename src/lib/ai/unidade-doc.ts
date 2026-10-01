/**
 * Descrição em texto → formulário de unidade/venda (Prompt J, 6.3; BJ-3).
 *
 * Contrato do que a IA devolve e a regra que transforma isso numa PROPOSTA de
 * preenchimento: valores para o formulário + alerta por campo. Nada aqui
 * grava — quem grava é o usuário, pelo botão do formulário, pela mesma
 * `saveUnit` com a mesma permissão. Módulo PURO, testável sem chamar a IA.
 */
import { avaliarCampo, isoParaDataInterna, type Alerta } from "@/lib/ai/campos";
import { emptyPlan } from "@/lib/calc/plan";
import { calcUnitTotal } from "@/lib/calc/projection";
import type { PaymentPlan, UnitStatus } from "@/lib/calc/types";
import { saldoFecha } from "@/lib/unidade-exibicao";
import { brl, dateBR } from "@/lib/utils";

/** Uma fonte parcelada do plano (AS, sinais, mensais, semestrais, anuais). */
export interface FonteLida {
  valor: number;
  parcelas: number;
  /** ISO (YYYY-MM-DD) ou "". */
  primeiroVencimento: string;
}

export interface DadosVendaLidos {
  code: string;
  itemType: "unidade" | "condominio" | "";
  tipo: string;
  bloco: string;
  m2: number | null;
  andar: number | null;
  valor: number | null;
  status: UnitStatus | "";
  /** ISO ou "". */
  dataVenda: string;
  AS: FonteLida | null;
  S1: FonteLida | null;
  S2: FonteLida | null;
  S3: FonteLida | null;
  Mensais: FonteLida | null;
  Semestrais: FonteLida | null;
  Anuais: FonteLida | null;
  FGTS: { valor: number; dataPrevista: string } | null;
  Subsidio: { valor: number; dataPrevista: string } | null;
  Permuta: { valor: number; descricao: string; dataPrevista: string } | null;
  Banco: { valorFinanciado: number | null; dataEntrada: string; dataPrimeiraParcela: string; restante: boolean } | null;
  /** Nomes de campos ou fontes que a IA preencheu com baixa confiança. */
  baixaConfianca: string[];
  observacoes: string[];
}

export type CampoUnidade = "code" | "itemType" | "tipo" | "bloco" | "m2" | "andar" | "valor" | "status" | "mesVenda" | "plano";

/**
 * Onde o painel deixa a proposta para o formulário ler (sessionStorage do
 * navegador — só neste separador, some ao fechar). A proposta nunca passa
 * pelo servidor até o usuário clicar em "Salvar unidade".
 */
export const CHAVE_PROPOSTA_UNIDADE = "gt:proposta-unidade";

export interface PropostaGuardada {
  projectId: string;
  proposta: PropostaDeUnidade;
}

export const ROTULO_CAMPO_UNIDADE: Record<CampoUnidade, string> = {
  code: "Código",
  itemType: "Tipo de cadastro",
  tipo: "Tipo",
  bloco: "Bloco",
  m2: "m²",
  andar: "Andar",
  valor: "VGV (valor)",
  status: "Status",
  mesVenda: "Data da venda",
  plano: "Plano de pagamento",
};

export interface ValoresPropostos {
  itemType: "unidade" | "condominio";
  code: string;
  bloco: string;
  tipo: string;
  m2: string;
  andar: string;
  valor: string;
  status: UnitStatus;
  /** Interno MM/DD/YYYY ou "". */
  mesVenda: string;
  plan: PaymentPlan;
}

export interface PropostaDeUnidade {
  valores: ValoresPropostos;
  alertas: Partial<Record<CampoUnidade, Alerta>>;
  preenchidos: string[];
  observacoes: string[];
  /** Uma frase para o topo do formulário. */
  resumo: string;
}

const FONTES_PARCELADAS = ["AS", "S1", "S2", "S3", "Mensais", "Semestrais", "Anuais"] as const;
const round2 = (v: number) => Math.round(v * 100) / 100;
const num = (v: number | null | undefined) => (typeof v === "number" && Number.isFinite(v) && v > 0 ? v : 0);

/** Data ISO → interna; registra alerta quando veio algo que não é data. */
function dataInterna(iso: string, onInvalida: () => void): string {
  if (!iso) return "";
  const d = isoParaDataInterna(iso);
  if (!d) onInvalida();
  return d;
}

export function montarPropostaDeUnidade(x: DadosVendaLidos): PropostaDeUnidade {
  const alertas: Partial<Record<CampoUnidade, Alerta>> = {};
  const preenchidos: string[] = [];
  const baixa = new Set(x.baixaConfianca ?? []);
  const conferir = (campo: CampoUnidade, motivo: string) => {
    alertas[campo] = { nivel: "conferir", motivo };
  };

  // ── plano ──────────────────────────────────────────────────────────────
  const plan = emptyPlan();
  const datasRuins: string[] = [];
  const motivosPlano: string[] = [];
  const presente = (f: FonteLida | null | undefined) => !!f && num(f.valor) > 0;
  /** {val, venc, n} de uma fonte parcelada lida; `minimo` = 1 nos sinais (pagamento único), 0 nas periódicas. */
  const fonte = (k: (typeof FONTES_PARCELADAS)[number], minimo: 0 | 1) => {
    const f = x[k];
    if (!presente(f)) return null;
    const venc = dataInterna(f!.primeiroVencimento, () => datasRuins.push(k));
    const n = Math.max(0, Math.trunc(f!.parcelas || 0));
    preenchidos.push(rotuloFonte(k));
    return { val: num(f!.valor), venc, n: n || minimo };
  };
  const as = fonte("AS", 1);
  if (as) plan.AS = { ...plan.AS, ...as };
  const s1 = fonte("S1", 1);
  if (s1) plan.S1 = { ...plan.S1, ...s1 };
  const s2 = fonte("S2", 1);
  if (s2) plan.S2 = { ...plan.S2, ...s2 };
  const s3 = fonte("S3", 1);
  if (s3) plan.S3 = { ...plan.S3, ...s3 };
  const mensais = fonte("Mensais", 0);
  if (mensais) plan.Mensais = { ...plan.Mensais, ...mensais };
  const semestrais = fonte("Semestrais", 0);
  if (semestrais) plan.Semestrais = { ...plan.Semestrais, ...semestrais };
  const anuais = fonte("Anuais", 0);
  if (anuais) plan.Anuais = { ...plan.Anuais, ...anuais };
  if (x.FGTS && num(x.FGTS.valor) > 0) {
    plan.FGTS = { ...plan.FGTS, val: num(x.FGTS.valor), dataPrev: dataInterna(x.FGTS.dataPrevista, () => datasRuins.push("FGTS")) };
    preenchidos.push("FGTS");
  }
  if (x.Subsidio && num(x.Subsidio.valor) > 0) {
    plan.Subsidio = { ...plan.Subsidio, val: num(x.Subsidio.valor), dataPrev: dataInterna(x.Subsidio.dataPrevista, () => datasRuins.push("Subsídio")) };
    preenchidos.push("Subsídio");
  }
  if (x.Permuta && num(x.Permuta.valor) > 0) {
    plan.Permuta = { ...plan.Permuta, val: num(x.Permuta.valor), desc: (x.Permuta.descricao ?? "").trim(), dataPrev: dataInterna(x.Permuta.dataPrevista, () => datasRuins.push("Permuta")) };
    preenchidos.push("Permuta");
  }
  const valor = num(x.valor);
  if (x.Banco) {
    const outras = calcUnitTotal({ ...plan, code: "", status: "Vendido", valor });
    let financiado = num(x.Banco.valorFinanciado);
    if (!financiado && x.Banco.restante && valor > 0) {
      financiado = round2(valor - outras);
      if (financiado > 0) motivosPlano.push(`Financiamento calculado como o restante: ${brl(valor)} − ${brl(outras)} = ${brl(financiado)}.`);
      else financiado = 0;
    }
    if (financiado > 0) {
      plan.Banco = {
        ...plan.Banco,
        valFinanc: financiado,
        dataEntrada: dataInterna(x.Banco.dataEntrada, () => datasRuins.push("Banco")),
        dataPrimParc: dataInterna(x.Banco.dataPrimeiraParcela, () => datasRuins.push("Banco")),
      };
      preenchidos.push("Financiamento bancário");
    }
  }
  // Flags da cascata: só sinalização na tela (o cálculo soma tudo).
  plan.usarAS = plan.AS.val > 0;
  plan.AS.usarS1 = plan.S1.val > 0;
  plan.S1.usarS2 = plan.S2.val > 0;
  plan.S2.usarS3 = plan.S3.val > 0;
  plan.S3.usarMens = plan.Mensais.val > 0;
  plan.Mensais.usarSem = plan.Semestrais.val > 0;
  plan.Semestrais.usarAnu = plan.Anuais.val > 0;
  plan.Anuais.usarFGTS = plan.FGTS.val > 0;
  plan.FGTS.usarSub = plan.Subsidio.val > 0;
  plan.Subsidio.usarPer = plan.Permuta.val > 0;
  plan.Permuta.usarFinanc = plan.Banco.valFinanc > 0;
  const temPlano = calcUnitTotal({ ...plan, code: "", status: "Vendido", valor }) > 0;

  // ── campos simples ─────────────────────────────────────────────────────
  const code = (x.code ?? "").trim();
  if (code) preenchidos.push(ROTULO_CAMPO_UNIDADE.code);
  const itemType = x.itemType === "condominio" ? "condominio" : "unidade";
  const tipo = (x.tipo ?? "").trim();
  if (tipo) preenchidos.push(ROTULO_CAMPO_UNIDADE.tipo);
  const bloco = (x.bloco ?? "").trim();
  if (bloco) preenchidos.push(ROTULO_CAMPO_UNIDADE.bloco);
  const m2 = num(x.m2);
  if (m2) preenchidos.push(ROTULO_CAMPO_UNIDADE.m2);
  const andar = typeof x.andar === "number" && Number.isFinite(x.andar) ? Math.trunc(x.andar) : null;
  if (andar !== null) preenchidos.push(ROTULO_CAMPO_UNIDADE.andar);
  if (valor) preenchidos.push(ROTULO_CAMPO_UNIDADE.valor);
  const mesVenda = dataInterna(x.dataVenda ?? "", () => datasRuins.push("Data da venda"));
  if (mesVenda) preenchidos.push(ROTULO_CAMPO_UNIDADE.mesVenda);

  let status: UnitStatus;
  let statusDeduzido = false;
  if (x.status === "Disponivel" || x.status === "Reservado" || x.status === "Vendido" || x.status === "Permutado") {
    status = x.status;
  } else {
    status = mesVenda || temPlano ? "Vendido" : "Disponivel";
    statusDeduzido = true;
  }
  preenchidos.push(ROTULO_CAMPO_UNIDADE.status);

  // ── alertas ────────────────────────────────────────────────────────────
  const essencial = (campo: CampoUnidade, vazio: boolean, faltando: string) => {
    const a = avaliarCampo(
      { valor: "", confianca: baixa.has(campo) ? "baixa" : "alta", nota: faltando },
      { aplicadoVazio: vazio, essencial: true },
    );
    if (a) alertas[campo] = a;
  };
  essencial("code", !code, "A descrição não diz o código da unidade — preencha.");
  essencial("valor", !valor, "A descrição não diz o valor (VGV) — preencha.");
  if (statusDeduzido) conferir("status", `Status deduzido (${status}) — a descrição não o diz.`);
  else if (baixa.has("status")) conferir("status", "Status lido com baixa confiança — confira.");
  if (status === "Vendido" && !mesVenda) alertas.mesVenda = { nivel: "faltando", motivo: "Unidade vendida sem data da venda — informe." };
  else if (baixa.has("mesVenda") || baixa.has("dataVenda")) conferir("mesVenda", "Data lida com baixa confiança — confira.");
  for (const campo of ["tipo", "bloco", "m2", "andar", "itemType"] as const) {
    if (baixa.has(campo)) conferir(campo, "Lido com baixa confiança — confira.");
  }
  if (datasRuins.length) motivosPlano.push(`Data ilegível em: ${[...new Set(datasRuins)].join(", ")} — preencha à mão.`);
  if ([...baixa].some((b) => (FONTES_PARCELADAS as readonly string[]).includes(b) || /fgts|subsidio|subsídio|permuta|banco|plano/i.test(b))) {
    motivosPlano.push("Alguma fonte foi lida com baixa confiança — confira as linhas do plano.");
  }
  if (status === "Vendido" && !temPlano) {
    alertas.plano = { nivel: "faltando", motivo: "Venda sem plano de pagamento — informe as fontes (sinal, parcelas, financiamento…)." };
  } else {
    if (status === "Vendido") {
      const total = calcUnitTotal({ ...plan, code, status, valor });
      if (valor && !saldoFecha(total - valor)) {
        motivosPlano.push(`As fontes somam ${brl(total)} e o valor é ${brl(valor)} (diferença de ${brl(total - valor)}) — ajuste antes de gravar.`);
      }
    }
    if (motivosPlano.length) conferir("plano", motivosPlano.join(" "));
  }

  const resumo = [
    `Unidade ${code || "(sem código)"}`,
    status,
    valor ? brl(valor) : "sem valor",
    mesVenda ? `venda em ${dateBR(mesVenda)}` : null,
  ]
    .filter(Boolean)
    .join(" · ");

  return {
    valores: {
      itemType,
      code,
      bloco,
      tipo,
      m2: m2 ? String(m2) : "",
      andar: andar !== null ? String(andar) : "",
      valor: valor ? String(valor) : "",
      status,
      mesVenda,
      plan,
    },
    alertas,
    preenchidos,
    observacoes: (x.observacoes ?? []).map((o) => String(o).trim()).filter(Boolean),
    resumo,
  };
}

function rotuloFonte(k: (typeof FONTES_PARCELADAS)[number]): string {
  switch (k) {
    case "AS":
      return "Ato de assinatura";
    case "S1":
      return "Sinal 1";
    case "S2":
      return "Sinal 2";
    case "S3":
      return "Sinal 3";
    default:
      return k;
  }
}
