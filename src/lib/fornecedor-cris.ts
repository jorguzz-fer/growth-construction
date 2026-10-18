/**
 * Prompt W2 (Fase 3 · revisão V5): "Fornecedores e Parceiros: o chat lê
 * arquivo". Módulo PURO. A pessoa anexa o cartão CNPJ, o contrato ou a nota
 * na conversa com a Cris (ou dita os dados); a proposta vira a mesma
 * `DadosFornecedorLidos` da leitura por upload e passa pela mesma regra de
 * preenchimento e alertas (`montarPreenchimentoFornecedor`).
 *
 * Dados de recebimento (banco, agência, conta, PIX) ficam FORA do formulário
 * da Cris: são preenchidos à mão. Quem cadastra é o botão da tela.
 */
import type { FormularioDaTela } from "@/lib/cris";
import type { DadosFornecedorLidos } from "@/lib/ai/fornecedor-doc";

const TEXTOS = [
  ["nome", "Nome / razão social"],
  ["nomeFantasia", "Nome fantasia"],
  ["doc", "CNPJ / CPF"],
  ["contato", "Pessoa de contato"],
  ["email", "E-mail"],
  ["tel", "Telefone"],
  ["whatsapp", "WhatsApp"],
  ["site", "Site"],
  ["endereco", "Endereço (logradouro)"],
  ["numero", "Número"],
  ["complemento", "Complemento"],
  ["bairro", "Bairro"],
  ["cidade", "Cidade"],
  ["estado", "Estado (UF)"],
  ["cep", "CEP"],
] as const;

export function formularioDoFornecedor(papeis: readonly string[]): FormularioDaTela {
  return {
    id: "fornecedor-novo",
    titulo: "Novo cadastro de Fornecedores e Parceiros (a Cris lê o documento anexado)",
    campos: [
      { nome: "tipo", rotulo: "Tipo", tipo: "opcao", opcoes: ["PJ", "PF"] },
      ...TEXTOS.map(([nome, rotulo]) => ({ nome, rotulo, tipo: "texto" as const })),
      { nome: "papeis", rotulo: "Papéis", tipo: "texto", dica: `separados por vírgula, entre: ${papeis.join(", ")}` },
    ],
  };
}

/** Os valores da proposta no formato da leitura de documento. Papel fora da lista cai. */
export function lidosDaProposta(valores: Record<string, string>, papeis: readonly string[]): DadosFornecedorLidos {
  const t = (k: string) => (valores[k] ?? "").trim();
  const porNome = new Map(papeis.map((p) => [p.toLowerCase(), p]));
  const escolhidos = t("papeis")
    .split(/[,;\n]/)
    .map((p) => porNome.get(p.trim().toLowerCase()))
    .filter((p): p is string => !!p);
  const tipo = t("tipo");
  const out = {
    tipo: tipo === "PJ" || tipo === "PF" ? tipo : "",
    papeis: [...new Set(escolhidos)],
    baixaConfianca: [],
  } as unknown as DadosFornecedorLidos;
  for (const [k] of TEXTOS) (out as unknown as Record<string, string>)[k] = t(k);
  return out;
}

/**
 * Os valores da tela com os campos que a Cris propôs esvaziados: assim a
 * proposta substitui o que estava neles, e os outros campos continuam valendo
 * (e não viram alerta de "faltando").
 */
export function manterSoNaoPropostos<T extends Record<string, string>>(atuais: T, propostos: ReadonlySet<string>): T {
  return Object.fromEntries(Object.entries(atuais).map(([k, v]) => [k, propostos.has(k) ? "" : v])) as T;
}
