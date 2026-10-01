/**
 * Regras da tela Empresa (Prompt AH). Módulo PURO.
 *
 * Complementa `calc/emitente-fiscal.ts` SEM alterá-lo (9.4): os dois avisos
 * da Parte 4 vivem aqui e a tela os concatena ao checklist; `emitentePronto`
 * continua contando só bloqueios. A validação de gravação (Parte 2) chama os
 * validadores que já existem — nada é reescrito.
 */
import { cepValido, codigoMunicipioValido, ufValida, type PendenciaFiscal } from "@/lib/calc/emitente-fiscal";

export const TELA_EMPRESA = "empresa" as const;

/**
 * Parte 1 — ajuda dos campos: o placeholder nunca sugere um número que pareça
 * valor (1.3, opção 1) e o valor típico do setor vai em texto FORA do campo
 * (opção 2). Nenhum deles vira `defaultValue` (1.4).
 */
export const AJUDA_CAMPO = {
  codigoMunicipio: { placeholder: "7 dígitos, sem ponto", ajuda: "Código do município na tabela do IBGE. É ele, e não o nome, que a nota usa." },
  aliquotaIss: { placeholder: "0 a 5", ajuda: "Alíquota do município para o serviço, em %. Confirme com a contabilidade." },
  itemListaServico: { placeholder: "", ajuda: "Item da LC 116/2003. Construção civil costuma ser 7.02 (obra) ou 7.05 (reforma) — confirme com a contabilidade." },
  cnae: { placeholder: "", ajuda: "Construção de edifícios costuma ser 4120-4/00 (grave só os dígitos). Alguns municípios exigem." },
} as const;

/** Parte 4.2 — os cinco campos sem pendência, declarados opcionais na tela. */
export const CAMPOS_OPCIONAIS = ["nomeFantasia", "inscricaoEstadual", "regimeEspecial", "complemento", "telefone"] as const;

/**
 * Parte 2 — o que a action recusa ALÉM de CNPJ e alíquota: CEP, código IBGE
 * e UF preenchidos e inválidos. Vazio continua passando (gravação parcial,
 * 2.3). A mensagem diz o campo e o porquê (2.4). Primeira recusa encontrada.
 */
export function recusaDoCadastroFiscal(v: { cep: string | null; codigoMunicipio: string | null; uf: string | null }): string | null {
  if (v.cep && !cepValido(v.cep)) return "CEP: informe os 8 dígitos (a prefeitura recusa CEP incompleto). Deixe em branco para preencher depois.";
  if (v.codigoMunicipio && !codigoMunicipioValido(v.codigoMunicipio)) return "Código IBGE do município: são 7 dígitos (código errado emite a nota no município errado). Deixe em branco para preencher depois.";
  if (v.uf && !ufValida(v.uf)) return "UF: use a sigla de um dos 27 estados (ex.: SP). Deixe em branco para preencher depois.";
  return null;
}

/**
 * Parte 4.1 — avisos complementares ao checklist (nunca bloqueio):
 * `codigoTributarioMunicipio` entra no payload da nota e alguns municípios o
 * exigem; `municipio` é o nome que o usuário acha que informou — a nota usa o
 * código IBGE, e os dois precisam andar juntos. Sem tabela de municípios não
 * há checagem de coerência nome × código (4.3).
 */
export function avisosComplementares(e: { codigoTributarioMunicipio?: string | null; municipio?: string | null; codigoMunicipio?: string | null }): PendenciaFiscal[] {
  const p: PendenciaFiscal[] = [];
  const falta = (v: string | null | undefined) => !v || !v.trim();
  if (falta(e.codigoTributarioMunicipio)) {
    p.push({ campo: "codigoTributarioMunicipio", label: "Código tributário do município", mensagem: "Vai no corpo da nota; alguns municípios exigem, outros não. Confira com a prefeitura ou a contabilidade.", severidade: "aviso" });
  }
  if (falta(e.municipio)) {
    p.push({ campo: "municipio", label: "Município", mensagem: "A nota usa o código IBGE, mas o nome é o que você confere na tela e no documento impresso — preencha os dois.", severidade: "aviso" });
  } else if (!codigoMunicipioValido(e.codigoMunicipio)) {
    p.push({ campo: "municipio", label: "Município", mensagem: "Nome preenchido sem o código IBGE: para a emissão só o código vale. Informe o código do mesmo município.", severidade: "aviso" });
  }
  return p;
}

/** Parte 5 — o selo do R2 diz o que mede: variáveis presentes ≠ conexão provada. */
export type EstadoDoSelo = "nao_configurado" | "configurado" | "testado_ok" | "testado_falhou";

export interface UltimoTesteR2 {
  ok: boolean;
  quando: Date;
  etapa?: string | null;
}

export function estadoDoSeloR2(configurado: boolean, ultimo: UltimoTesteR2 | null): EstadoDoSelo {
  if (!configurado) return "nao_configurado";
  if (!ultimo) return "configurado";
  return ultimo.ok ? "testado_ok" : "testado_falhou";
}

export function rotuloDoSeloR2(estado: EstadoDoSelo): { texto: string; tom: "success" | "neutral" | "warning" | "danger" } {
  switch (estado) {
    case "nao_configurado":
      return { texto: "R2 não configurado", tom: "neutral" };
    case "configurado":
      return { texto: "R2 configurado (sem teste)", tom: "warning" };
    case "testado_ok":
      return { texto: "R2 testado", tom: "success" };
    case "testado_falhou":
      return { texto: "R2 com falha no teste", tom: "danger" };
  }
}

/** Parte 3 — o nome vai no corpo da nota: a recusa diz por quê. */
export function recusaDoNome(nome: string): string | null {
  const n = nome.trim();
  if (!n) return "Informe o nome da empresa: a razão social vai no corpo da nota.";
  if (n.length > 200) return "Nome da empresa com mais de 200 caracteres.";
  return null;
}
