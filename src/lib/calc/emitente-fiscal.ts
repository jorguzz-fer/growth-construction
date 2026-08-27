/**
 * Dados fiscais do EMITENTE — pré-requisito de qualquer emissão de nota.
 *
 * Antes de falar com API de emissão nenhuma (Focus NFe, PlugNotas, NFE.io), o
 * tenant precisa estar cadastrado com o que a prefeitura exige do prestador:
 * CNPJ, inscrição municipal, regime tributário, item da lista de serviço e
 * endereço com código IBGE do município. Este módulo concentra a validação
 * desses campos e produz o CHECKLIST de prontidão que a tela mostra.
 *
 * Princípio: nada aqui bloqueia o cadastro parcial. O tenant pode salvar o que
 * já tem e completar depois — o checklist é que diz se dá para emitir. Enquanto
 * houver pendência bloqueante, a emissão não deve nem ser oferecida.
 *
 * O que este módulo NÃO faz: presumir alíquota, regime ou item de serviço. A
 * tributação varia por município e por contrato, e chutar valor padrão aqui
 * produziria nota errada com aparência de nota certa.
 */

// ───────────────────────────────── CNPJ ─────────────────────────────────

/**
 * CNPJ pode ser ALFANUMÉRICO desde julho/2026 (IN RFB 2.229/2024): os 12
 * primeiros caracteres aceitam letras e dígitos, e só os 2 dígitos
 * verificadores continuam numéricos. O cálculo do DV passou a usar o valor
 * ASCII do caractere menos 48 — para dígitos isso devolve o próprio número, o
 * que mantém todo CNPJ numérico antigo válido pela mesma conta.
 */
const PESOS_DV1 = [5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2];
const PESOS_DV2 = [6, 5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2];

/** Só o que interessa: A–Z e 0–9, em maiúsculas. */
export function normalizarCnpj(cnpj: string | null | undefined): string | null {
  if (!cnpj) return null;
  const limpo = cnpj.toUpperCase().replace(/[^A-Z0-9]/g, "");
  return limpo || null;
}

function valorAscii(ch: string): number {
  return ch.charCodeAt(0) - 48;
}

function dvCnpj(base: string, pesos: number[]): number {
  const soma = pesos.reduce((acc, peso, i) => acc + valorAscii(base[i]) * peso, 0);
  const resto = soma % 11;
  return resto < 2 ? 0 : 11 - resto;
}

/**
 * CNPJ válido (numérico ou alfanumérico), conferindo os dois dígitos.
 *
 * Vazio devolve `false` — quem quer permitir campo em branco checa isso antes.
 * Sequência de caractere repetido é recusada: `00000000000000` passa no módulo
 * 11 e não é CNPJ de ninguém.
 */
export function cnpjValido(cnpj: string | null | undefined): boolean {
  const v = normalizarCnpj(cnpj);
  if (!v || v.length !== 14) return false;
  if (/^(.)\1{13}$/.test(v)) return false;
  // Os dois últimos caracteres são os DV e continuam sendo dígitos.
  if (!/^[A-Z0-9]{12}\d{2}$/.test(v)) return false;

  const base = v.slice(0, 12);
  const dv1 = dvCnpj(base, PESOS_DV1);
  const dv2 = dvCnpj(base + String(dv1), PESOS_DV2);
  return v.slice(12) === `${dv1}${dv2}`;
}

/** `12.345.678/0001-95` — máscara só para exibição. */
export function formatarCnpj(cnpj: string | null | undefined): string {
  const v = normalizarCnpj(cnpj);
  if (!v || v.length !== 14) return cnpj ?? "";
  return `${v.slice(0, 2)}.${v.slice(2, 5)}.${v.slice(5, 8)}/${v.slice(8, 12)}-${v.slice(12)}`;
}

// ────────────────────────── Endereço e município ─────────────────────────

/** CEP: 8 dígitos. Devolve só os dígitos, ou `null` quando vazio. */
export function normalizarCep(cep: string | null | undefined): string | null {
  if (!cep) return null;
  const d = cep.replace(/\D/g, "");
  return d || null;
}

export function cepValido(cep: string | null | undefined): boolean {
  const d = normalizarCep(cep);
  return !!d && d.length === 8;
}

/**
 * Código IBGE do município: 7 dígitos.
 *
 * É o campo que amarra a nota ao município certo — tanto o do prestador quanto
 * o de incidência do ISS. Nome de cidade em texto livre não serve para emissão:
 * a API quer o código.
 */
export function codigoMunicipioValido(codigo: string | null | undefined): boolean {
  if (!codigo) return false;
  return /^\d{7}$/.test(codigo.replace(/\D/g, ""));
}

export function normalizarCodigoMunicipio(
  codigo: string | null | undefined,
): string | null {
  if (!codigo) return null;
  const d = codigo.replace(/\D/g, "");
  return d || null;
}

const UFS = new Set([
  "AC", "AL", "AP", "AM", "BA", "CE", "DF", "ES", "GO", "MA", "MT", "MS",
  "MG", "PA", "PB", "PR", "PE", "PI", "RJ", "RN", "RS", "RO", "RR", "SC",
  "SP", "SE", "TO",
]);

export function ufValida(uf: string | null | undefined): boolean {
  return !!uf && UFS.has(uf.trim().toUpperCase());
}

// ─────────────────────────── Regime tributário ───────────────────────────

/**
 * Regimes que o cadastro aceita.
 *
 * A lista espelha o que a API de emissão precisa saber (o Focus NFe usa os
 * códigos 1 a 4 no cadastro da empresa), incluindo o caso do Simples que
 * estourou o sublimite — ele existe no cadastro do provedor e sem ele o
 * de-para ficaria incompleto. A tradução para o código do provedor mora no
 * adaptador, não aqui.
 */
export const REGIMES_TRIBUTARIOS = [
  { id: "SIMPLES", label: "Simples Nacional" },
  { id: "SIMPLES_EXCESSO", label: "Simples Nacional — excesso de sublimite" },
  { id: "LUCRO_PRESUMIDO", label: "Lucro Presumido" },
  { id: "LUCRO_REAL", label: "Lucro Real" },
  { id: "MEI", label: "MEI" },
] as const;

export type RegimeTributario = (typeof REGIMES_TRIBUTARIOS)[number]["id"];

const REGIME_IDS = new Set<string>(REGIMES_TRIBUTARIOS.map((r) => r.id));

export function ehRegimeTributario(v: string | null | undefined): v is RegimeTributario {
  return !!v && REGIME_IDS.has(v);
}

export function rotuloRegime(id: string | null | undefined): string {
  return REGIMES_TRIBUTARIOS.find((r) => r.id === id)?.label ?? "—";
}

/**
 * O regime implica optante pelo Simples Nacional?
 *
 * A NFS-e tem um campo booleano só para isso, separado do regime. Derivar do
 * regime evita que os dois campos discordem no cadastro.
 */
export function optantePeloSimples(regime: string | null | undefined): boolean {
  return regime === "SIMPLES" || regime === "SIMPLES_EXCESSO" || regime === "MEI";
}

/**
 * Regime ESPECIAL de tributação — outro campo, opcional, da própria nota
 * (microempresa municipal, estimativa, sociedade de profissionais, cooperativa,
 * MEI, ME/EPP do Simples). Vários municípios ignoram; alguns rejeitam a nota
 * sem ele. Fica no cadastro para não ter que ser redigitado a cada emissão.
 */
export const REGIMES_ESPECIAIS = [
  { id: "1", label: "Microempresa municipal" },
  { id: "2", label: "Estimativa" },
  { id: "3", label: "Sociedade de profissionais" },
  { id: "4", label: "Cooperativa" },
  { id: "5", label: "MEI — Simples Nacional" },
  { id: "6", label: "ME/EPP — Simples Nacional" },
] as const;

export type RegimeEspecial = (typeof REGIMES_ESPECIAIS)[number]["id"];

export function ehRegimeEspecial(v: string | null | undefined): v is RegimeEspecial {
  return !!v && REGIMES_ESPECIAIS.some((r) => r.id === v);
}

/**
 * Alíquota de ISS aceitável (%).
 *
 * A Constituição fixa o teto em 5% (EC 37/2002 fixou também o piso de 2%). Fora
 * de 0–5 é erro de digitação — vírgula trocada por ponto, tipicamente. Abaixo
 * de 2% não é recusado aqui porque existem regimes especiais e o Simples
 * Nacional recolhe por outra sistemática; vira AVISO no checklist.
 */
export function aliquotaIssValida(aliquota: number | null | undefined): boolean {
  if (aliquota === null || aliquota === undefined) return false;
  return Number.isFinite(aliquota) && aliquota >= 0 && aliquota <= 5;
}

// ──────────────────────────── Checklist fiscal ───────────────────────────

export interface EmitenteFiscal {
  razaoSocial?: string | null;
  nomeFantasia?: string | null;
  cnpj?: string | null;
  inscricaoMunicipal?: string | null;
  inscricaoEstadual?: string | null;
  regimeTributario?: string | null;
  regimeEspecial?: string | null;
  itemListaServico?: string | null;
  codigoTributarioMunicipio?: string | null;
  cnae?: string | null;
  aliquotaIss?: number | null;
  logradouro?: string | null;
  numero?: string | null;
  complemento?: string | null;
  bairro?: string | null;
  codigoMunicipio?: string | null;
  municipio?: string | null;
  uf?: string | null;
  cep?: string | null;
  telefone?: string | null;
  email?: string | null;
}

export type SeveridadePendencia = "bloqueio" | "aviso";

export interface PendenciaFiscal {
  campo: string;
  label: string;
  mensagem: string;
  severidade: SeveridadePendencia;
}

/**
 * O que ainda falta para o tenant conseguir emitir.
 *
 * `bloqueio` = a API de emissão vai recusar ou a prefeitura vai rejeitar.
 * `aviso`    = dá para emitir, mas alguém precisa confirmar se está certo.
 *
 * A separação existe para a tela não gritar em campo que é legitimamente
 * opcional (inscrição estadual de prestador de serviço, por exemplo).
 */
export function checarProntidaoFiscal(e: EmitenteFiscal): PendenciaFiscal[] {
  const p: PendenciaFiscal[] = [];
  const falta = (v: string | null | undefined) => !v || !v.trim();

  if (falta(e.razaoSocial)) {
    p.push({
      campo: "razaoSocial",
      label: "Razão social",
      mensagem: "A razão social vai no corpo da nota e não pode ficar em branco.",
      severidade: "bloqueio",
    });
  }

  if (falta(e.cnpj)) {
    p.push({
      campo: "cnpj",
      label: "CNPJ",
      mensagem: "Sem CNPJ não há emitente a cadastrar na API de emissão.",
      severidade: "bloqueio",
    });
  } else if (!cnpjValido(e.cnpj)) {
    p.push({
      campo: "cnpj",
      label: "CNPJ",
      mensagem: "Os dígitos verificadores não conferem — revise o número.",
      severidade: "bloqueio",
    });
  }

  if (falta(e.inscricaoMunicipal)) {
    p.push({
      campo: "inscricaoMunicipal",
      label: "Inscrição municipal",
      mensagem:
        "É a inscrição do prestador na prefeitura; a NFS-e é recusada sem ela.",
      severidade: "bloqueio",
    });
  }

  if (!ehRegimeTributario(e.regimeTributario)) {
    p.push({
      campo: "regimeTributario",
      label: "Regime tributário",
      mensagem: "Define como o ISS e as retenções são apurados na nota.",
      severidade: "bloqueio",
    });
  }

  if (falta(e.itemListaServico)) {
    p.push({
      campo: "itemListaServico",
      label: "Item da lista de serviço",
      mensagem:
        "Item da LC 116/2003 (construção civil costuma ser 7.02 ou 7.05). Determina a alíquota e o município de incidência.",
      severidade: "bloqueio",
    });
  }

  if (!aliquotaIssValida(e.aliquotaIss)) {
    p.push({
      campo: "aliquotaIss",
      label: "Alíquota de ISS",
      mensagem: "Informe a alíquota do município (0 a 5%).",
      severidade: "bloqueio",
    });
  } else if ((e.aliquotaIss ?? 0) < 2 && !optantePeloSimples(e.regimeTributario)) {
    p.push({
      campo: "aliquotaIss",
      label: "Alíquota de ISS",
      mensagem:
        "Abaixo do piso de 2% (EC 37/2002). Só é correto em regime especial — confirme com a contabilidade.",
      severidade: "aviso",
    });
  }

  if (!codigoMunicipioValido(e.codigoMunicipio)) {
    p.push({
      campo: "codigoMunicipio",
      label: "Código IBGE do município",
      mensagem:
        "A API identifica o município pelo código de 7 dígitos, não pelo nome.",
      severidade: "bloqueio",
    });
  }

  if (falta(e.logradouro) || falta(e.numero) || falta(e.bairro)) {
    p.push({
      campo: "endereco",
      label: "Endereço",
      mensagem: "Logradouro, número e bairro compõem o endereço do prestador.",
      severidade: "bloqueio",
    });
  }

  if (!cepValido(e.cep)) {
    p.push({
      campo: "cep",
      label: "CEP",
      mensagem: "Informe os 8 dígitos do CEP.",
      severidade: "bloqueio",
    });
  }

  if (!ufValida(e.uf)) {
    p.push({
      campo: "uf",
      label: "UF",
      mensagem: "Informe a sigla do estado.",
      severidade: "bloqueio",
    });
  }

  if (falta(e.cnae)) {
    p.push({
      campo: "cnae",
      label: "CNAE",
      mensagem:
        "Alguns municípios exigem o CNAE do serviço prestado na NFS-e.",
      severidade: "aviso",
    });
  }

  if (falta(e.email)) {
    p.push({
      campo: "email",
      label: "E-mail",
      mensagem: "Usado pela prefeitura e pelo provedor para enviar a nota.",
      severidade: "aviso",
    });
  }

  return p;
}

/** Dá para emitir? Só quando não sobrou nenhuma pendência bloqueante. */
export function emitentePronto(e: EmitenteFiscal): boolean {
  return !checarProntidaoFiscal(e).some((p) => p.severidade === "bloqueio");
}
