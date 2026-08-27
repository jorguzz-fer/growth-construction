/**
 * Tradução das falhas da API de IA em mensagens acionáveis, em português.
 *
 * O que vem da API é um JSON em inglês ("Your credit balance is too low...").
 * Quem lê isso na tela de Diagnóstico conclui o que for — normalmente "a chave
 * está errada" — e vai mexer na configuração errada. Cada caso aqui existe
 * porque alguém precisou saber O QUE FAZER, não o que aconteceu.
 *
 * Módulo PURO (sem SDK, sem rede): testado em `erros.test.ts`.
 */

export interface FalhaIa {
  /** Status HTTP, quando houver. */
  status?: number;
  /** Mensagem original (normalmente já com o corpo JSON da API). */
  mensagem: string;
  /** O SDK classificou como falha de conexão? */
  semConexao?: boolean;
}

export function mensagemDeErroIa({ status, mensagem, semConexao }: FalhaIa): string {
  // Saldo/créditos vem ANTES do status: a API responde 400, que sozinho seria
  // lido como "requisição inválida" e mandaria mexer no código ou no modelo —
  // quando o que falta é crédito na conta.
  if (/credit balance is too low|purchase credits|Plans & Billing/i.test(mensagem)) {
    return (
      "A conta da API de IA está sem créditos. A chave e o modelo estão corretos — " +
      "adicione créditos em console.anthropic.com (Plans & Billing) e teste novamente."
    );
  }
  if (status === 401 || status === 403) {
    return "Chave de IA inválida ou sem permissão (verifique ANTHROPIC_API_KEY).";
  }
  if (status === 404) {
    return (
      "O modelo configurado não existe ou não está liberado para esta conta. " +
      "Confira ANTHROPIC_MODEL — ela aceita o identificador (ex.: claude-sonnet-5), não o nome comercial."
    );
  }
  if (status === 429) {
    return "Limite de uso da IA atingido — tente novamente em instantes.";
  }
  if (semConexao || /fetch failed|ENOTFOUND|ECONNREFUSED|ETIMEDOUT|network/i.test(mensagem)) {
    return "Sem conexão com a API da IA — verifique a rede/egress do servidor.";
  }
  return `Falha na leitura por IA: ${mensagem}`;
}
