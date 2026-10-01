import { cpfValido } from "@/lib/stakeholder-regras";
import { mascararDocumento } from "@/lib/clientes-sensivel";
import { MARCA_PROTEGIDO } from "@/lib/audit-mask";

/**
 * Regras do cadastro de Funcionários (Prompt Z, Parte 2). PURO: tela, action
 * e consulta leem daqui. Registro, não folha (BZ-2): nada calcula encargo.
 *
 * Dado pessoal (7): CPF mascarado na listagem; endereço, salário, jornada,
 * dados bancários e dependentes atrás da permissão de CAMPO
 * `funcionariosdados` — quem não a tem NÃO RECEBE os valores do servidor.
 * O log registra que o campo mudou, não o valor (7.3).
 */

export const TELA_FUNCIONARIOS = "funcionarios";
export const TELA_DADOS_FUNCIONARIO = "funcionariosdados";
export const TELA_ASO = "funcionariosaso";

export const TIPOS_CONTRATO = ["Indeterminado", "Determinado", "Experiência", "Aprendiz", "Temporário", "Intermitente"] as const;
export const ESTADOS_CIVIS = ["Solteiro(a)", "Casado(a)", "União estável", "Divorciado(a)", "Viúvo(a)"] as const;
export const PARENTESCOS = ["Cônjuge/companheiro(a)", "Filho(a)", "Enteado(a)", "Pai/Mãe", "Outro"] as const;
export const TIPOS_CONTA_BANCARIA = ["Corrente", "Poupança", "Salário", "Pagamento"] as const;
export const TIPOS_PIX = ["CPF", "E-mail", "Telefone", "Chave aleatória"] as const;

/** Campos que exigem `funcionariosdados:ver` para sair do servidor e `:editar` para gravar (7.2). */
export const CAMPOS_SENSIVEIS_FUNCIONARIO = [
  "endereco", "numero", "complemento", "bairro", "cidade", "estado", "cep",
  "salario", "jornada",
  "bancoNome", "bancoAgencia", "bancoConta", "bancoTipoConta", "pixTipo", "pixChave",
] as const;
export type CampoSensivelFuncionario = (typeof CAMPOS_SENSIVEIS_FUNCIONARIO)[number];
const SENSIVEIS = new Set<string>(CAMPOS_SENSIVEIS_FUNCIONARIO);
export const campoSensivelFuncionario = (k: string) => SENSIVEIS.has(k);

/** Documentos com número: aparecem na ficha (quem vê o funcionário), mascarados na lista e sem valor no log. */
export const CAMPOS_DOCUMENTO = ["cpf", "rg", "ctpsNumero", "ctpsSerie", "pis", "tituloEleitor", "reservista", "cnh"] as const;
const DOCS = new Set<string>(CAMPOS_DOCUMENTO);

/** Remove os campos sensíveis de um objeto quando quem pede não tem a permissão (7.2 — no servidor, não na interface). */
export function semSensiveis<T extends Record<string, unknown>>(obj: T, podeVer: boolean): T {
  if (podeVer) return obj;
  const out: Record<string, unknown> = { ...obj };
  for (const k of CAMPOS_SENSIVEIS_FUNCIONARIO) if (k in out) out[k] = null;
  return out as T;
}

/** Só grava o que quem salva pode editar; vazio em campo sensível NÃO apaga (igual a clientes). */
export function soCamposPermitidos<T extends Record<string, unknown>>(dados: T, podeEditarSensivel: boolean): Partial<T> {
  if (podeEditarSensivel) return dados;
  const out: Record<string, unknown> = { ...dados };
  for (const k of CAMPOS_SENSIVEIS_FUNCIONARIO) delete out[k];
  return out as Partial<T>;
}

/** 7.3 — `changes` do log sem valor de documento, endereço, salário ou banco: registra que mudou. */
export function changesSemValorPessoal(changes: Record<string, { de: unknown; para: unknown }>): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(changes)) out[k] = SENSIVEIS.has(k) || DOCS.has(k) || k === "nascimento" || k === "nomeMae" ? { de: MARCA_PROTEGIDO, para: MARCA_PROTEGIDO, protegido: true } : v;
  return out;
}

export const soDigitos = (s: string | null | undefined) => (s ?? "").replace(/\D/g, "");

export interface FuncionarioParaValidar {
  nome: string | null | undefined;
  cpf: string | null | undefined;
  admissao?: string | null;
  desligamento?: string | null;
  salario?: number | null;
}

/** 2.5 — nome obrigatório; CPF validado no formato (validador do Prompt W); salário não negativo. */
export function recusaDoFuncionario(f: FuncionarioParaValidar): string | null {
  if (!(f.nome ?? "").trim()) return "Informe o nome completo.";
  const cpf = soDigitos(f.cpf);
  if (cpf && !cpfValido(cpf)) return "CPF inválido: confira os dígitos.";
  if (f.salario != null && (!Number.isFinite(f.salario) || f.salario < 0)) return "Salário não pode ser negativo.";
  if (f.admissao && f.desligamento && f.desligamento < f.admissao) return "A data de desligamento não pode ser anterior à admissão.";
  return null;
}

/** 2.5 / 6.1 — duplicidade de CPF AVISA, não bloqueia: entre funcionários e contra fornecedores PF. */
export function avisoDeCpfDuplicado(cpf: string | null | undefined, outros: readonly { origem: "funcionario" | "fornecedor"; nome: string; cpf: string | null }[], ignorarId?: { origem: "funcionario"; nome: string }): string | null {
  const d = soDigitos(cpf);
  if (!d) return null;
  const iguais = outros.filter((o) => soDigitos(o.cpf) === d && !(ignorarId && o.origem === ignorarId.origem && o.nome === ignorarId.nome));
  if (iguais.length === 0) return null;
  const partes = iguais.map((o) => `${o.nome} (${o.origem === "funcionario" ? "funcionário" : "fornecedor"})`);
  return `Este CPF já consta em: ${partes.join(", ")}. Pode ser a mesma pessoa (autônomo que virou CLT) — confira antes de seguir.`;
}

export type SituacaoFuncionario = "Ativo" | "Desligado";
/** 2.4 — desligado não some: tem data de desligamento e sai das listas de alocação. */
export function situacaoDoFuncionario(f: { desligamento: string | null }): SituacaoFuncionario {
  return f.desligamento ? "Desligado" : "Ativo";
}

/** 2.4 — excluir só sem alocação, com o nome digitado. */
export function recusaDaExclusao(f: { nome: string }, alocacoes: number, nomeDigitado: string): string | null {
  if (alocacoes > 0) return `${f.nome} tem ${alocacoes} alocação(ões) em equipes. Não se exclui: desligue o funcionário (ele sai das listas e o histórico fica).`;
  if (nomeDigitado.trim().toLowerCase() !== f.nome.trim().toLowerCase()) return "Para excluir, digite o nome completo exatamente como está no cadastro.";
  return null;
}

/** 7.1 — CPF mascarado na listagem (a ficha mostra completo a quem vê o funcionário). */
export const cpfMascarado = (cpf: string | null | undefined) => mascararDocumento(cpf ?? null);
