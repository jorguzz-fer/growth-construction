/**
 * Assistente da tela Empresa (Prompt AH, Parte 6; Prompt E, Etapa 1).
 * Módulo PURO, SOMENTE LEITURA.
 *
 * Papel estreito: traduzir exigência fiscal em linguagem de quem preenche.
 * NUNCA sugere CNPJ, inscrição, alíquota, item da LC 116, CNAE ou código de
 * município (6.2); nunca preenche campo; nunca afirma que o cadastro está
 * correto — diz, no máximo, que não há pendência aberta. Nada daqui vai a
 * modelo de IA: é cálculo local sobre o que a tela já carregou, e token,
 * secrets e variáveis de ambiente nem chegam a este módulo (6.3).
 */
import { checarProntidaoFiscal, codigoMunicipioValido, optantePeloSimples, type EmitenteFiscal, type PendenciaFiscal } from "@/lib/calc/emitente-fiscal";

/** 6.1 · onde encontrar cada dado — a FONTE, nunca o valor. */
export const ONDE_ENCONTRAR: Record<string, { onde: string; esforco: 1 | 2 | 3 }> = {
  razaoSocial: { onde: "Contrato social ou cartão CNPJ (site da Receita Federal).", esforco: 1 },
  cnpj: { onde: "Cartão CNPJ, emitido no site da Receita Federal.", esforco: 1 },
  endereco: { onde: "Cartão CNPJ ou contrato social (endereço da sede prestadora).", esforco: 1 },
  cep: { onde: "Cartão CNPJ ou busca de CEP dos Correios.", esforco: 1 },
  uf: { onde: "Cartão CNPJ (endereço da sede).", esforco: 1 },
  email: { onde: "O e-mail que a empresa usa para assuntos fiscais.", esforco: 1 },
  codigoMunicipio: { onde: "Tabela de códigos de municípios do IBGE (site do IBGE), pelo município da sede.", esforco: 2 },
  municipio: { onde: "Cartão CNPJ (município da sede).", esforco: 1 },
  regimeTributario: { onde: "Contabilidade da empresa (ou consulta ao Simples Nacional no Portal do Simples).", esforco: 2 },
  inscricaoMunicipal: { onde: "Cadastro mobiliário da prefeitura do município da sede (ou documento de inscrição).", esforco: 3 },
  itemListaServico: { onde: "Lei Complementar 116/2003 (lista de serviços) — escolha com a contabilidade.", esforco: 3 },
  aliquotaIss: { onde: "Legislação do ISS do município, para o item de serviço escolhido — confirme com a contabilidade.", esforco: 3 },
  cnae: { onde: "Cartão CNPJ (atividades econômicas) — confirme qual se aplica ao serviço com a contabilidade.", esforco: 2 },
  codigoTributarioMunicipio: { onde: "Prefeitura (manual da NFS-e do município) ou contabilidade.", esforco: 3 },
};

const DESTRAVA: Record<string, string> = {
  razaoSocial: "o corpo da nota",
  cnpj: "o cadastro do emitente no provedor de emissão",
  inscricaoMunicipal: "a aceitação da NFS-e pela prefeitura",
  regimeTributario: "o cálculo do ISS e das retenções",
  itemListaServico: "a alíquota e o município de incidência",
  aliquotaIss: "o valor do ISS da nota",
  codigoMunicipio: "a identificação do município pela API",
  endereco: "o endereço do prestador na nota",
  cep: "o endereço do prestador na nota",
  uf: "o endereço do prestador na nota",
};

export interface PassoParaEmitir {
  campo: string;
  label: string;
  porque: string;
  destrava: string;
  onde: string;
  esforco: 1 | 2 | 3;
}

/** 6.1 · o que falta para emitir — os BLOQUEIOS do checklist, em ordem de esforço (o que está à mão primeiro). */
export function oQueFaltaParaEmitir(bloqueios: readonly PendenciaFiscal[]): PassoParaEmitir[] {
  return bloqueios
    .map((p) => {
      const o = ONDE_ENCONTRAR[p.campo] ?? { onde: "Contabilidade da empresa.", esforco: 3 as const };
      return { campo: p.campo, label: p.label, porque: p.mensagem, destrava: DESTRAVA[p.campo] ?? "a emissão", onde: o.onde, esforco: o.esforco };
    })
    .sort((a, b) => a.esforco - b.esforco);
}

export interface Divergencia {
  campo: string;
  texto: string;
}

/**
 * 6.1 · conferir o que está preenchido — divergências ENTRE campos. Diz o que
 * conferir; não diz qual seria o valor certo.
 */
export function conferirPreenchido(e: EmitenteFiscal): Divergencia[] {
  const out: Divergencia[] = [];
  const tem = (v: string | null | undefined) => !!v && !!v.trim();
  if (tem(e.municipio) && !codigoMunicipioValido(e.codigoMunicipio)) {
    out.push({ campo: "municipio", texto: "Município preenchido sem código IBGE válido: a nota identifica o município pelo código, não pelo nome." });
  }
  if (e.aliquotaIss != null && e.aliquotaIss < 2 && !optantePeloSimples(e.regimeTributario)) {
    out.push({ campo: "aliquotaIss", texto: "Alíquota abaixo de 2% fora do Simples Nacional: só é correta em regime especial. Confirme com a contabilidade." });
  }
  const cnae = (e.cnae ?? "").replace(/\D/g, "");
  const item = (e.itemListaServico ?? "").trim();
  if (cnae && /^7\./.test(item) && !/^4[123]/.test(cnae)) {
    out.push({ campo: "cnae", texto: "O item de serviço é do grupo 7 (construção civil), mas o CNAE informado não é da divisão de construção (41 a 43). Confira com a contabilidade qual atividade se aplica." });
  }
  if (cnae && /^4[123]/.test(cnae) && item && !/^7\./.test(item)) {
    out.push({ campo: "itemListaServico", texto: "O CNAE é de construção, mas o item de serviço não é do grupo 7 da LC 116. Confira com a contabilidade." });
  }
  return out;
}

export interface MudancaFiscal {
  quando: Date;
  quem: string | null;
  acao: string;
  campos: string[];
}

export interface AnaliseDaEmpresa {
  passos: PassoParaEmitir[];
  avisos: PendenciaFiscal[];
  divergencias: Divergencia[];
  historico: MudancaFiscal[];
  /** sem bloqueio aberto — NÃO quer dizer "cadastro correto" (6.2). */
  semPendenciaAberta: boolean;
}

export function analisarEmpresa(e: EmitenteFiscal, historico: readonly MudancaFiscal[]): AnaliseDaEmpresa {
  const pend = checarProntidaoFiscal(e);
  const bloqueios = pend.filter((p) => p.severidade === "bloqueio");
  return {
    passos: oQueFaltaParaEmitir(bloqueios),
    avisos: pend.filter((p) => p.severidade === "aviso"),
    divergencias: conferirPreenchido(e),
    historico: [...historico],
    semPendenciaAberta: bloqueios.length === 0,
  };
}

/** Rótulos dos campos para o histórico (nomes, nunca valores). */
export const ROTULO_CAMPO: Record<string, string> = {
  name: "Razão social",
  nomeFantasia: "Nome fantasia",
  cnpj: "CNPJ",
  inscricaoMunicipal: "Inscrição municipal",
  inscricaoEstadual: "Inscrição estadual",
  regimeTributario: "Regime tributário",
  regimeEspecial: "Regime especial",
  itemListaServico: "Item da LC 116",
  codigoTributarioMunicipio: "Código tributário do município",
  cnae: "CNAE",
  aliquotaIss: "Alíquota de ISS",
  logradouro: "Logradouro",
  numeroEndereco: "Número",
  complemento: "Complemento",
  bairro: "Bairro",
  codigoMunicipio: "Código IBGE",
  municipio: "Município",
  uf: "UF",
  cep: "CEP",
  telefone: "Telefone",
  emailFiscal: "E-mail fiscal",
  fiscalAmbiente: "Ambiente de emissão",
};
