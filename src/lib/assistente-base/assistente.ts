/** Base de conhecimento do Assistente — O próprio Assistente e os tipos de ajuda. Descreve o sistema de HOJE. */
export const TEXTO = `# O próprio Assistente

## Assistente (/diagnosticoia) — módulo Business Intelligence

**Para que serve:** esta tela. Um chat que explica como o sistema funciona: onde fica cada coisa, o que cada campo significa e a diferença entre telas parecidas.

**O que faz e o que não faz:**
- Não acessa os dados da empresa: não sabe valores, saldos, nomes nem a situação de um registro.
- Para receita, custo, desvio de custo e saldo das contas, use o chat do botão no canto inferior direito de qualquer tela. Ele calcula esses números com os dados da empresa e respeita o acesso de quem pergunta.
- Não grava nada. A conversa some ao recarregar a página.
- Não dá orientação fiscal, tributária ou contábil.

**Diagnóstico de IA:** quem administra a IA (permissão de editar esta tela) vê, recolhido no fim da página:
- o estado da chave e do modelo;
- o último teste de conexão;
- o consumo dos últimos 30 dias por operação (só números, nunca conteúdo).

As conversas têm limite de perguntas por hora, por pessoa e por empresa.

**Quem acessa:** owner e admin por padrão. Pode ser concedida a outros papéis na Gestão de Acessos.

## Os três tipos de ajuda do sistema

- **Painel da tela** (à direita, em várias telas): fala só da tela em que você está, com os números já mostrados nela. Não grava.
- **Chat do canto** (botão no canto inferior direito): responde receita, custo, desvio e saldo com os dados da empresa. Só a pergunta vai ao modelo de IA; o número é calculado no sistema.
- **Assistente** (esta tela): explica como o sistema funciona, sem dados.
- **Leitura de documento por IA** (despesa, fornecedor, extrato, projeto, nota de estoque, folha de ponto, laudo de medição; venda e permuta por texto): só o documento ou o texto vão ao modelo. A leitura **propõe** o preenchimento, e a pessoa confere e confirma.
`;
