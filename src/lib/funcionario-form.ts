/**
 * Valores do formulário da ficha (Prompt Z). Módulo PURO, sem "use client":
 * a página (servidor) e os componentes (cliente) importam daqui. Importar um
 * objeto de um módulo "use client" no servidor devolve uma referência de
 * cliente vazia — foi o que deixou a ficha em branco.
 */
export type ValoresFuncionario = Record<string, string>;

export const VALORES_VAZIOS: ValoresFuncionario = {
  nome: "", nascimento: "", nacionalidade: "Brasileira", estadoCivil: "", nomeMae: "",
  cpf: "", rg: "", rgOrgao: "", rgUf: "", ctpsNumero: "", ctpsSerie: "", pis: "", tituloEleitor: "", reservista: "", cnh: "", cnhCategoria: "", cnhValidade: "",
  endereco: "", numero: "", complemento: "", bairro: "", cidade: "", estado: "", cep: "",
  admissao: "", cargo: "", setor: "", projectId: "", tipoContrato: "Indeterminado", prazoContrato: "", jornada: "", salario: "",
  bancoNome: "", bancoAgencia: "", bancoConta: "", bancoTipoConta: "", pixTipo: "", pixChave: "", obs: "",
};

export function fdDe(v: ValoresFuncionario): FormData {
  const fd = new FormData();
  for (const [k, x] of Object.entries(v)) fd.set(k, x);
  return fd;
}

/** Linha do banco → valores do formulário (string vazia para nulo). */
export function valoresDe(f: Record<string, unknown>): ValoresFuncionario {
  const out: ValoresFuncionario = { ...VALORES_VAZIOS };
  for (const k of Object.keys(VALORES_VAZIOS)) {
    const x = f[k];
    out[k] = x == null ? "" : String(x);
  }
  return out;
}
