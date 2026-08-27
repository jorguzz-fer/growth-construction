/**
 * Documento → cadastro de fornecedor: contrato da leitura e regra de
 * preenchimento (a mesma ideia de `despesa-doc.ts`, aplicada ao segundo ponto
 * do sistema onde se sobe um arquivo para preencher um formulário).
 *
 * Módulo PURO — testável sem chamar a IA.
 */

import { avaliarCampo, docCompleto, type Alerta } from "@/lib/ai/campos";

/** O que a IA devolve ao ler um cartão CNPJ, contrato ou cabeçalho de nota. */
export interface DadosFornecedorLidos {
  nome: string;
  nomeFantasia: string;
  tipo: "PJ" | "PF" | "";
  doc: string;
  contato: string;
  email: string;
  tel: string;
  whatsapp: string;
  site: string;
  endereco: string;
  numero: string;
  complemento: string;
  bairro: string;
  cidade: string;
  estado: string;
  cep: string;
  papeis: string[];
  /** Campos que a IA identificou com BAIXA confiança. */
  baixaConfianca: string[];
}

export type CampoFornecedor =
  | "nome"
  | "nomeFantasia"
  | "tipo"
  | "doc"
  | "contato"
  | "email"
  | "tel"
  | "whatsapp"
  | "site"
  | "endereco"
  | "numero"
  | "complemento"
  | "bairro"
  | "cidade"
  | "estado"
  | "cep"
  | "papeis";

export const ROTULO_CAMPO_FORNECEDOR: Record<CampoFornecedor, string> = {
  nome: "Nome",
  nomeFantasia: "Nome fantasia",
  tipo: "Tipo",
  doc: "CNPJ / CPF",
  contato: "Pessoa de contato",
  email: "E-mail",
  tel: "Telefone",
  whatsapp: "WhatsApp",
  site: "Site",
  endereco: "Endereço",
  numero: "Número",
  complemento: "Complemento",
  bairro: "Bairro",
  cidade: "Cidade",
  estado: "Estado",
  cep: "CEP",
  papeis: "Papéis",
};

/** Sem estes o cadastro não serve para vincular despesa nem emitir relatório. */
const ESSENCIAIS: CampoFornecedor[] = ["nome", "doc", "papeis"];

const CAMPOS_TEXTO: CampoFornecedor[] = [
  "nome",
  "nomeFantasia",
  "doc",
  "contato",
  "email",
  "tel",
  "whatsapp",
  "site",
  "endereco",
  "numero",
  "complemento",
  "bairro",
  "cidade",
  "estado",
  "cep",
];

export interface PreenchimentoFornecedor {
  /** Só os campos que devem ser aplicados (o resto o usuário já digitou). */
  valores: Partial<Record<CampoFornecedor, string>>;
  papeis: string[] | null;
  alertas: Partial<Record<CampoFornecedor, Alerta>>;
  preenchidos: string[];
}

/**
 * Aplica a leitura sobre o que já está na tela.
 *
 * Nunca sobrescreve campo digitado pelo usuário: quem preencheu à mão sabe
 * mais que a foto do cartão de visita. O que a IA leu e não pôde aplicar (ou
 * leu com dúvida) vira alerta no campo.
 */
export function montarPreenchimentoFornecedor(
  x: DadosFornecedorLidos,
  atuais: Partial<Record<CampoFornecedor, string>>,
  papeisAtuais: string[],
): PreenchimentoFornecedor {
  const baixa = new Set(x.baixaConfianca ?? []);
  const valores: Partial<Record<CampoFornecedor, string>> = {};
  const alertas: Partial<Record<CampoFornecedor, Alerta>> = {};
  const preenchidos: string[] = [];

  for (const campo of CAMPOS_TEXTO) {
    const lido = (x[campo] as string) ?? "";
    const atual = (atuais[campo] ?? "").trim();
    const aplicado = atual || lido;
    if (lido && !atual) {
      valores[campo] = lido;
      preenchidos.push(ROTULO_CAMPO_FORNECEDOR[campo]);
    }
    const alerta = avaliarCampo(
      { valor: lido, confianca: baixa.has(campo) ? "baixa" : "alta", nota: "" },
      { aplicadoVazio: !aplicado, essencial: ESSENCIAIS.includes(campo) },
    );
    if (alerta) alertas[campo] = alerta;
  }

  // CNPJ/CPF pela metade é pior que vazio: casa com o fornecedor errado numa
  // busca por documento. Se veio incompleto, o campo pede conferência mesmo
  // que a IA tenha dito "alta".
  const docFinal = valores.doc ?? atuais.doc ?? "";
  if (docFinal && !docCompleto(docFinal)) {
    alertas.doc = {
      nivel: "conferir",
      motivo: "Documento incompleto ou mascarado no arquivo — confira os dígitos.",
    };
  }

  if (x.tipo && !(atuais.tipo ?? "").trim()) {
    valores.tipo = x.tipo;
    preenchidos.push(ROTULO_CAMPO_FORNECEDOR.tipo);
  }

  let papeis: string[] | null = null;
  if (x.papeis.length > 0 && papeisAtuais.length === 0) {
    papeis = x.papeis;
    preenchidos.push(ROTULO_CAMPO_FORNECEDOR.papeis);
  } else if (x.papeis.length === 0 && papeisAtuais.length === 0) {
    alertas.papeis = {
      nivel: "faltando",
      motivo: "O documento não diz o que este cadastro é (fornecedor, cliente, sócio…) — escolha.",
    };
  }

  return { valores, papeis, alertas, preenchidos };
}
