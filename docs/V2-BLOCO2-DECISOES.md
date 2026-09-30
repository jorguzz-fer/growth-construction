# Bloco 2 · A receita — o que precisa de resposta antes do código

Os sete prompts do Bloco 2 (I, J, K, P, O, Q, N) mexem em **receita**. Na
maioria das telas, uma mudança aqui altera número de relatório. Por isso cada
prompt abre com perguntas que o próprio texto manda **responder antes de
escrever código**.

Este documento separa três grupos:

1. o que **já está respondido**, pelo pacote ou pelo código;
2. o que depende de um **levantamento em produção**, com o SQL pronto e
   somente leitura;
3. o que é **decisão sua**, com uma recomendação para cada item.

## O que já dá para fazer sem resposta

| Item | O que é | Por que não depende de decisão |
|---|---|---|
| **BI-3** | Parar de criar versão por cópia (`duplicateVersion`). A importação por planilha passa a recusar despesa, caixa, unidade, permuta e liberação fora da versão Atual | O pacote já registra a decisão. As versões que existem continuam como estão |
| **§43** | Diagnóstico da base | Só leitura: `docs/sql/v2-prompt-i-diagnostico.sql` |
| **BJ-1** | A data da venda aparece certa na lista de Unidades? | Respondido pelo código, abaixo |

### BJ-1 · respondido: a lista de Unidades mostra a data da venda invertida

A data é guardada como `MM/DD/AAAA`. O formulário converte para `DD/MM/AAAA`,
mas a **lista mostra o texto cru**. Uma venda em 25/09/2026 aparece como
"09/25/2026". Uma venda em 05/09/2026 aparece como "09/05/2026", que se lê
como 9 de maio. Ninguém nota quando dia e mês são os dois até 12.

**É erro de exibição**, e nenhum dado está errado. A correção entra no
Prompt J (3.2).

## Levantamentos em produção (somente leitura)

| Arquivo | Responde |
|---|---|
| `docs/sql/v2-prompt-i-diagnostico.sql` | §43 do Prompt I: despesa, caixa e medição fora da Atual; pagamentos incoerentes; "Pago" sem pagamento; obras sem versão ou sem data de início e fim; unidades repetidas; contas a receber que podem ser contadas duas vezes |
| `docs/sql/v2-bloco2-diagnostico.sql` | **BJ-2**: unidades repetidas. **BK-4**: contas "Recebido" sem caixa. **BP-1**: permuta já no Estoque. **BP-2**: permuta gerando receita sem estar vendida. **BO-2**: o campo "%" das Liberações |
| `docs/sql/v2-status-contrato.sql` | Status do contrato de cliente (Prompt M, 6.2) |

**Rodados em 30/09/2026.** Resultado e leitura em [`V2-DIAGNOSTICO-PRODUCAO.md`](./V2-DIAGNOSTICO-PRODUCAO.md).

## Decisões suas

**Situação (30/09/2026):** enviadas ao PO. Aguardando.

**Legenda:**
- **Muda número?** Sim, quando a escolha altera o valor que algum relatório
  mostra hoje. Esses entram atrás de uma chave por empresa, desligada até
  você aprovar a prévia (ver B4).
- **Contador:** marcado quando a regra é contábil e convém confirmar com o
  contador da empresa.

### Prompt I · arquitetura de versões (documento central)

| | Pergunta | Opções | Recomendação | Muda número? |
|---|---|---|---|---|
| **BI-1.2** | Unidade vendida no meio da obra: como reconhecer a receita? | (a) reconhece de uma vez os meses já passados e segue mês a mês; (b) espalha o valor cheio só pelos meses que faltam | **(a)**: não distorce os meses futuros | Sim |
| **BI-1.3** | A obra passou do prazo cadastrado: a receita continua? | (a) para no último mês do prazo; (b) acompanha até o fim real | **(a)**: estender exigiria refazer os meses anteriores | Sim |
| **BI-2** | As parcelas do plano de pagamento viram contas a receber de verdade? | (1) continuam calculadas na hora, só como previsão; (2) viram registros, com baixa e conciliação | **(1) por enquanto.** A (2) só depois das seções 54, 56 e 57 (ver BK-0), e obra por obra, com prévia | Não, com (1) |
| **§58** | Unificar os três cálculos de recebíveis | O pacote diz que essa seção **não foi escrita** | Escrever antes da etapa 10. **Trava AA, AC, AD, AE e AN** | — |

**Contador:** BI-1.2 e BI-1.3.

### Prompt J · Unidades

| | Pergunta | Situação |
|---|---|---|
| **BJ-1** | Data da venda exibida certa? | **Respondido acima**: está invertida na lista |
| **BJ-2** | Há unidades repetidas? | **Respondido (30/09): nenhuma.** A trava de código único pode entrar |
| **BJ-3** | Escrita assistida por IA | Já decidido no pacote |

### Prompt K · Contas a Receber

| | Pergunta | Recomendação |
|---|---|---|
| **BK-0** | Transformar parcelas em registros antes das seções 54, 56 e 57 do Prompt I? | **Não.** Se fizer antes, a mesma venda entra **três vezes** na DRE |
| **BK-1** | Como ligar recebimento ao caixa | Ler o código do Caixa primeiro (tarefa minha). Já decidido: valor por vínculo, e o vínculo antigo é preservado |
| **BK-2** | INCC nas parcelas registradas | **Gravar o valor nominal e corrigir na leitura**, como a Projeção já faz |
| **BK-3** | Entrou R$ 323,97 numa parcela de R$ 324,00 | **Mesmo conceito do Acerto Contábil**: tolerância declarada e a diferença registrada |
| **BK-4** | Contas marcadas "Recebido" à mão | **Respondido (30/09): nenhuma** — a tabela de contas a receber está vazia em produção |

### Prompt P · Permuta

| | Pergunta | Recomendação | Muda número? |
|---|---|---|---|
| **BP-1** | O bem recebido em permuta fica no Estoque ou num inventário próprio da tela? | **No Estoque.** Hoje o Estoque já grava entrada "Permuta" ligada à permuta. A tela de Permuta só lê de lá | Não |
| **BP-2** | O status governa a receita? Hoje, permuta "Disponível" com valor e data de venda **já gera receita** | **Sim.** Levantamento de 30/09: nenhuma permuta nessa situação — hoje não muda número. Entra atrás da chave mesmo assim | Hoje, não |
| **BP-3** | Escambo (troca por outro bem) é venda? | (1) realiza o ganho, sem caixa (como hoje); (2) é só troca de ativo, sem resultado até vender | Sim |

**Contador:** BP-3.

### Prompt O · Liberações de Obra

| | Pergunta | Recomendação |
|---|---|---|
| **BO-1** | Soma em dobro na DRE | Já respondido: a correção é do Prompt I, §56 |
| **BO-2** | O campo "%" serve para algo? | **Decidido (30/09): sai da tela.** Um único uso em produção; a coluna fica no banco e o valor gravado não muda |

### Prompt Q · Parâmetros e INCC

| | Pergunta | O que preciso |
|---|---|---|
| **BQ-1** | Qual INCC os contratos usam: INCC-DI, INCC-M ou INCC-10? | A variante que está nos contratos. Se variar por contrato, avisar |
| **BQ-2** | Receita com ou sem correção? Hoje a DRE sai **sem** INCC e o Caixa sai **com** | Decisão da §57 do Prompt I: o reconhecimento é sobre o valor nominal ou o corrigido? |
| **BQ-3** | A correção começa na 5ª parcela para todos os contratos? | Regra única da construtora, ou varia por contrato? |

**Contador:** BQ-2.

### Prompt N · Simulador

| | Pergunta | Opções | Recomendação |
|---|---|---|---|
| **BN-1** | A simulação passa a ser gravada? | (1) continua calculadora; (2) salva, com rastro do que foi proposto; (3) salva e vira o plano da unidade | **(2)** agora. A (3) só depois de corrigir os cálculos do simulador, porque ele passaria a gerar receita da DRE |
| **BN-2** | Qual a taxa de juros real? Hoje é 1% ao mês fixo no código | Valor padrão, e se varia por faixa, obra ou tipo de financiamento | — |
| **BN-3** | A renda vem do cadastro do cliente? | (1) continua digitada; (2) vem do cadastro só para quem tem a permissão de dados sensíveis | **(2)** |

## Antes de tudo isso: B4, a chave por empresa

A regra 3.3 do pacote diz que mudança que altera número em produção entra
**atrás de uma chave por empresa, desligada**. Você vê a prévia antes de
ligar. Com a chave desligada, os números ficam exatamente como hoje.

Esse mecanismo **não existe no código**, e o roteiro não reserva uma etapa
para construí-lo.

**Proposta:** construir antes do Bloco 2:
- uma tabela nova (sem mexer em nada que existe);
- a leitura da chave no código;
- o padrão de "prévia";
- a tela para ligar e desligar em Configurações.

É a primeira coisa que BI-1, BP-2 e BQ-2 vão precisar.
