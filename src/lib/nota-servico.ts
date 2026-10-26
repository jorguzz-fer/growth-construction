/**
 * Emissor de NFS-e (Prompt AG) — as regras da nota EMITIDA. Módulo PURO.
 *
 * Decisões do dono (26/10/2026):
 * - BAG-1: estreia com serviço AVULSO (valor digitado e conferido), que pode
 *   APONTAR para a conta a receber já lançada (opção b).
 * - BAG-2: a nota NÃO cria receita, conta a receber nem lançamento. É
 *   documento do fato; o vínculo é só referência.
 * - BAG-3: um CNPJ só — emite apenas o tenant declarado em `NFSE_TENANT_ID`.
 * - BAG-4: nota de homologação fica marcada para sempre e fora de relatório.
 *
 * O cálculo, a validação e o payload NÃO são refeitos aqui: vêm de
 * `calc/nfse.ts` e `fiscal/nfse-payload.ts`, que já têm teste (10.2).
 */
import type { EntradaNfse, RetencoesFederais } from "@/lib/calc/nfse";
import type { EmitenteFiscal } from "@/lib/calc/emitente-fiscal";
import { cepValido, codigoMunicipioValido, ufValida } from "@/lib/calc/emitente-fiscal";
import { cpfValido } from "@/lib/stakeholder-regras";
import { montarPayloadNfse, type DadosEmissaoNfse, type MontagemNfse, type ObraFiscal } from "@/lib/fiscal/nfse-payload";
import { refDaNota, refValida, type AmbienteFiscal, type StatusNota } from "@/lib/fiscal/tipos";

// ── Ciclo de vida (seção 2) ───────────────────────────────────────────────
export const SITUACOES_DA_NOTA = ["rascunho", "processando", "autorizada", "rejeitada", "cancelada"] as const;
export type SituacaoDaNota = (typeof SITUACOES_DA_NOTA)[number];

export const ROTULO_DA_SITUACAO: Record<SituacaoDaNota, string> = {
  rascunho: "Rascunho",
  processando: "Processando",
  autorizada: "Autorizada",
  rejeitada: "Rejeitada",
  cancelada: "Cancelada",
};

/** Rascunho e rejeitada são corrigíveis; o resto, nunca (2.1, 2.2). */
export const podeEditar = (s: string) => s === "rascunho" || s === "rejeitada";
export const podeEnviar = podeEditar;
/** Só autorizada cancela (5.6). */
export const podeCancelar = (s: string) => s === "autorizada";
/** Só faz sentido consultar o que foi enviado e ainda não fechou. */
export const podeConsultar = (s: string) => s === "processando";

/**
 * Transições permitidas. Nenhuma situação volta (2.4): autorizada não vira
 * rascunho, cancelada não vira autorizada.
 */
const TRANSICOES: Record<SituacaoDaNota, readonly SituacaoDaNota[]> = {
  rascunho: ["processando"],
  rejeitada: ["processando"],
  processando: ["processando", "autorizada", "rejeitada"],
  autorizada: ["cancelada"],
  cancelada: [],
};
export function transicaoPermitida(de: string, para: SituacaoDaNota): boolean {
  return (TRANSICOES[de as SituacaoDaNota] ?? []).includes(para);
}

/**
 * Situação nossa a partir da resposta do provedor. `nao_encontrada` não muda
 * nada (null): o provedor ainda não conhece a ref — esperar e consultar.
 */
export function situacaoDoRetorno(s: StatusNota): SituacaoDaNota | null {
  switch (s) {
    case "processando":
      return "processando";
    case "autorizado":
      return "autorizada";
    case "erro":
      return "rejeitada";
    case "cancelado":
      return "cancelada";
    default:
      return null;
  }
}

// ── Idempotência (seção 3) ────────────────────────────────────────────────
/**
 * A `ref` da nota NESTA tentativa: o id do registro (sem hífens, como
 * `refDaNota`) + "t" + o número da tentativa.
 *
 * - Mesma tentativa ⇒ mesma ref: duplo clique ou reenvio depois de falha de
 *   rede devolve a nota já recebida pelo provedor, não emite outra (3.2).
 * - Nova tentativa só depois de REJEIÇÃO ⇒ nova ref; sem isso o provedor
 *   devolveria a rejeição antiga (3.2).
 */
export function refDaTentativa(notaId: string, tentativa: number): string {
  const ref = `${refDaNota(notaId)}t${tentativa}`;
  if (!refValida(ref)) throw new Error("Referência da nota inválida.");
  return ref;
}

// ── Um CNPJ só (BAG-3) ────────────────────────────────────────────────────
/** Recusa (texto) quando este tenant não é o declarado para emitir; null = pode. */
export function recusaDoTenant(tenantId: string, tenantDeclarado: string | null | undefined): string | null {
  const d = (tenantDeclarado ?? "").trim();
  if (!d) return "A emissão de NFS-e ainda não foi habilitada no servidor (NFSE_TENANT_ID não definido).";
  if (d !== tenantId) return "A emissão de NFS-e está habilitada para outra empresa deste servidor. Por enquanto o sistema emite para um CNPJ só.";
  return null;
}

// ── Homologação (BAG-4) ───────────────────────────────────────────────────
export const ROTULO_DO_AMBIENTE: Record<AmbienteFiscal, string> = {
  homologacao: "Homologação — sem valor fiscal",
  producao: "Produção",
};

/** Nome do arquivo baixado: a marcação de homologação vai junto, para sempre (5.5). */
export function nomeDoArquivoDaNota(n: { ambiente: string; numero: string | null; id: string }, tipo: "pdf" | "xml"): string {
  const id = n.numero ? `NFSe-${n.numero}` : `NFSe-${n.id.slice(0, 8)}`;
  const marca = n.ambiente === "producao" ? "" : "HOMOLOGACAO-SEM-VALOR-FISCAL-";
  return `${marca}${id}.${tipo}`;
}

// ── Da linha gravada para o cálculo e o payload ───────────────────────────
export interface NotaParaEmissao {
  id: string;
  discriminacao: string;
  competencia: string | null;
  itemListaServico: string | null;
  codigoTributarioMunicipio: string | null;
  valorServicos: string | number;
  valorDeducoes: string | number;
  descontoIncondicionado: string | number;
  descontoCondicionado: string | number;
  aliquotaIss: string | number;
  issRetido: boolean;
  retencoes: Record<string, { aliquota: number; base?: number }> | null;
  outrasRetencoes: string | number;
  tomadorCpfCnpj: string | null;
  tomadorNome: string | null;
  tomadorInscricaoMunicipal: string | null;
  tomadorEmail: string | null;
  tomadorTelefone: string | null;
  tomadorLogradouro: string | null;
  tomadorNumero: string | null;
  tomadorComplemento: string | null;
  tomadorBairro: string | null;
  tomadorCodigoMunicipio: string | null;
  tomadorUf: string | null;
  tomadorCep: string | null;
}

const RETENCOES = ["pis", "cofins", "csll", "ir", "inss"] as const;

/** A entrada de `calcularNfse`. Retenção só existe se informada — nenhuma presumida. */
export function entradaDaNota(n: NotaParaEmissao): EntradaNfse {
  const ret: RetencoesFederais = {};
  for (const k of RETENCOES) {
    const r = n.retencoes?.[k];
    if (r && Number(r.aliquota) > 0) ret[k] = { aliquota: Number(r.aliquota), ...(r.base != null ? { base: Number(r.base) } : {}) };
  }
  return {
    valorServicos: Number(n.valorServicos),
    valorDeducoes: Number(n.valorDeducoes) || 0,
    descontoIncondicionado: Number(n.descontoIncondicionado) || 0,
    descontoCondicionado: Number(n.descontoCondicionado) || 0,
    aliquotaIss: Number(n.aliquotaIss),
    issRetido: n.issRetido,
    retencoes: ret,
    outrasRetencoes: Number(n.outrasRetencoes) || 0,
  };
}

const soDigitos = (v: string | null | undefined) => (v ?? "").replace(/\D/g, "");

/** Os dados que `montarPayloadNfse` recebe. O tomador sai da NOTA (copiado), não do cadastro (1.4). */
export function dadosDaEmissao(n: NotaParaEmissao, emitente: EmitenteFiscal, obra: ObraFiscal | null, dataEmissao: string): DadosEmissaoNfse {
  const doc = soDigitos(n.tomadorCpfCnpj);
  const temEndereco = [n.tomadorLogradouro, n.tomadorCodigoMunicipio, n.tomadorCep].some((x) => (x ?? "").trim());
  return {
    emitente,
    obra,
    dataEmissao,
    tomador: {
      cnpj: doc.length === 14 ? doc : null,
      cpf: doc.length === 11 ? doc : null,
      razaoSocial: n.tomadorNome,
      inscricaoMunicipal: n.tomadorInscricaoMunicipal,
      email: n.tomadorEmail,
      telefone: n.tomadorTelefone,
      endereco: temEndereco
        ? {
            logradouro: n.tomadorLogradouro,
            numero: n.tomadorNumero,
            complemento: n.tomadorComplemento,
            bairro: n.tomadorBairro,
            codigoMunicipio: n.tomadorCodigoMunicipio,
            uf: n.tomadorUf,
            cep: n.tomadorCep,
          }
        : null,
    },
    servico: {
      discriminacao: n.discriminacao,
      valores: entradaDaNota(n),
      itemListaServico: n.itemListaServico,
      codigoTributarioMunicipio: n.codigoTributarioMunicipio,
    },
  };
}

/**
 * 4.3 — tudo o que se confere ANTES de sair: o que `montarPayloadNfse` já
 * recusa, mais o que ele não olha (CPF, código IBGE, UF e CEP do tomador,
 * competência). A recusa aparece na tela, não no retorno do provedor.
 */
export function conferirAntesDoEnvio(n: NotaParaEmissao, emitente: EmitenteFiscal, obra: ObraFiscal | null, dataEmissao: string): MontagemNfse {
  const m = montarPayloadNfse(dadosDaEmissao(n, emitente, obra, dataEmissao));
  const erros = [...m.erros];
  const doc = soDigitos(n.tomadorCpfCnpj);
  if (doc && doc.length !== 11 && doc.length !== 14) erros.push("O documento do tomador precisa ter 11 (CPF) ou 14 (CNPJ) dígitos.");
  if (doc.length === 11 && !cpfValido(doc)) erros.push("CPF do tomador inválido.");
  if (!(n.tomadorNome ?? "").trim()) erros.push("Informe o nome ou a razão social do tomador.");
  if ((n.tomadorCodigoMunicipio ?? "").trim() && !codigoMunicipioValido(soDigitos(n.tomadorCodigoMunicipio)))
    erros.push("Código IBGE do município do tomador inválido (7 dígitos).");
  if ((n.tomadorUf ?? "").trim() && !ufValida(n.tomadorUf)) erros.push("UF do tomador inválida.");
  if ((n.tomadorCep ?? "").trim() && !cepValido(n.tomadorCep)) erros.push("CEP do tomador inválido.");
  if (n.competencia && !/^(0[1-9]|1[0-2])\/\d{4}$/.test(n.competencia)) erros.push("Competência no formato MM/AAAA.");
  const unicos = [...new Set(erros)];
  return unicos.length ? { erros: unicos } : m;
}

// ── Leitura do formulário do rascunho ─────────────────────────────────────
/** "5.000,00", "5000,5", "5000.5" e "5.000" — ponto só é milhar em grupos de três. */
export function numeroBR(x: unknown): number {
  if (typeof x !== "string" || !x.trim()) return 0;
  const t = x.trim().replace(/^R\$\s*/, "").replace(/%$/, "").trim();
  if (t.includes(",")) return Number(t.replace(/\./g, "").replace(",", "."));
  return /^\d{1,3}(\.\d{3})+$/.test(t) ? Number(t.replace(/\./g, "")) : Number(t);
}
