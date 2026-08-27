/**
 * O texto que vai para a IA na leitura de uma despesa — separado em duas
 * partes, e a separação é o ponto deste módulo.
 *
 * A conta da API é cobrada por token, e a maior parte do que enviamos em cada
 * leitura NÃO muda: os fornecedores cadastrados, o plano de contas, as obras,
 * as regras. Só o documento muda. Colocando o que é estável no `system` e
 * marcando um ponto de cache, essa parte passa a ser cobrada ~10% nas leituras
 * seguintes (a janela de cache é curta, mas o uso real é lançar vários
 * documentos em sequência — exatamente o caso que ela cobre).
 *
 * Para o cache valer, o prefixo precisa ser IDÊNTICO byte a byte entre as
 * chamadas: por isso as listas são ordenadas aqui, e não na consulta ao banco.
 * Qualquer variação de ordem invalidaria o cache em silêncio.
 *
 * Módulo PURO: testado em `despesa-prompt.test.ts`.
 */

export interface ContextoLeituraDespesa {
  fornecedores: { nome: string; doc: string | null }[];
  contas: { code: string; name: string }[];
  projetos: { nome: string }[];
  categorias: readonly string[];
  tiposDocumento: readonly { id: string; label: string }[];
  /** A própria empresa — para NÃO ser confundida com o fornecedor. */
  empresa: { nome: string; cnpj: string | null };
}

/** Tetos de listagem: o que passa disso não cabe no prompt sem virar custo. */
const MAX_FORNECEDORES = 200;
const MAX_CONTAS = 400;

const porTexto = (a: string, b: string) => a.localeCompare(b, "pt-BR");

/**
 * Parte ESTÁVEL do prompt (vai em `system`, com ponto de cache): quem é a
 * empresa, o que existe cadastrado e as regras de leitura. Só muda quando o
 * cadastro do tenant muda.
 */
export function promptSistemaDespesa(ctx: ContextoLeituraDespesa): string {
  const fornList =
    [...ctx.fornecedores]
      .sort((a, b) => porTexto(a.nome, b.nome))
      .slice(0, MAX_FORNECEDORES)
      .map((f) => `- ${f.nome}${f.doc ? ` (${f.doc})` : ""}`)
      .join("\n") || "(nenhum cadastrado)";
  const contaList =
    [...ctx.contas]
      .sort((a, b) => a.code.localeCompare(b.code, undefined, { numeric: true }))
      .slice(0, MAX_CONTAS)
      .map((c) => `- ${c.code} — ${c.name}`)
      .join("\n") || "(nenhum cadastrado)";
  const projList =
    [...ctx.projetos]
      .sort((a, b) => porTexto(a.nome, b.nome))
      .map((p) => `- ${p.nome}`)
      .join("\n") || "(nenhum cadastrado)";
  const tipoList = ctx.tiposDocumento.map((t) => `- ${t.id} = ${t.label}`).join("\n");

  return (
    "Você lê documentos de compra de uma construtora (nota fiscal, cupom, boleto, " +
    "comprovante de pagamento, recibo, foto de papel) e preenche o lançamento da despesa.\n\n" +
    `EMPRESA QUE ESTÁ LANÇANDO (é a PAGADORA — nunca a fornecedora): ${ctx.empresa.nome}` +
    (ctx.empresa.cnpj ? ` — CNPJ ${ctx.empresa.cnpj}` : "") +
    ".\nEm comprovante de Pix/TED, o fornecedor é o RECEBEDOR, não o pagador. " +
    "Nunca devolva os dados da empresa acima como fornecedor.\n\n" +
    `OBRAS/PROJETOS cadastrados:\n${projList}\n\n` +
    `FORNECEDORES já cadastrados (use exatamente o nome quando corresponder):\n${fornList}\n\n` +
    `PLANO DE CONTAS (escolha o código mais adequado):\n${contaList}\n\n` +
    `TIPOS DE DOCUMENTO FISCAL aceitos:\n${tipoList}\n\n` +
    "REGRAS:\n" +
    "- Datas SEMPRE em ISO: YYYY-MM-DD (e YYYY-MM na competência). O documento brasileiro escreve DD/MM/AAAA — converta.\n" +
    "- Valor numérico em reais, com ponto decimal, já líquido de desconto (se o cupom mostra Mercadorias, Desconto e Total, use o Total).\n" +
    "- Nunca invente: o que não estiver no documento volta vazio, com confianca=baixa e a nota explicando.\n" +
    '- Use confianca="alta" só para o que está escrito e legível; "media" para o que você deduziu; "baixa" para o que está ilegível, cortado, mascarado ou é palpite.\n' +
    "- A nota é lida pelo usuário na tela, em português, curta e útil (ex.: 'CPF mascarado no comprovante', 'competência deduzida da data do Pix').\n" +
    "- Comprovante de pagamento não é nota fiscal: docFiscalTipo=SEM_DOC, e pago=true."
  );
}

/**
 * Parte VOLÁTIL: o que muda a cada leitura. Fica depois do ponto de cache e
 * por isso precisa ser curta — cada token aqui é cobrado inteiro, sempre.
 */
export function instrucaoLeituraDespesa(quantidadeDeArquivos: number): string {
  return (
    (quantidadeDeArquivos > 1
      ? `São ${quantidadeDeArquivos} arquivos da MESMA compra (ex.: a nota e o comprovante do pagamento): combine as informações. ` +
        "Se perceber que tratam de despesas diferentes, use os dados do documento principal e registre isso em observacoes. "
      : "") + "Extraia os dados e chame a ferramenta preencher_despesa."
  );
}
