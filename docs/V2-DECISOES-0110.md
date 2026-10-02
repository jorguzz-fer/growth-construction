# Decisões do dono — 01/10/2026

As respostas de 01/10 às perguntas em aberto dos Prompts B, D, F, H, V, AH,
E (BE-2), AE (BAE-1) e às quatro chaves. Cada item diz o que foi feito e em
qual PR. Nada aqui altera dado gravado.

## Medição e os indicadores da obra (BV-1, BV-3, BV-4, 3.5)

- **BV-1 · PLS existe; medição por percentual de cada serviço.** Não migra
  agora. A estrutura fica (`servico`, `medicao_servico`,
  `calc/medicao-bdi`) e os **indicadores de evolução física foram
  desligados** no Dashboard: evolução acumulada e do mês, liberação do mês,
  custo estimado e geração de caixa do mês. No lugar, uma nota diz que
  voltam com o cadastro da PLS por obra.
- **"Liberação acumulada" e "Saldo de financiamento" saíram de vez**, sem
  depender de chave: sem medição, mostravam o financiamento do cadastro como
  se já tivesse acontecido. Saíram também da prévia da chave do Dashboard e
  do texto dela.
- Ficam: financiamento (construção, terreno, total), custo e BDI dos
  serviços, custo referencial e serviços fora dos limites — todos de
  cadastro, com "—" quando falta.
- **BV-4 · sem layout de impressão.** O rodapé do relatório de medição
  passou a dizer que o documento oficial é o formulário da Caixa (PLS /
  RAE), assinado pelo responsável técnico, e que o sistema fornece os
  números.
- **3.5 · a coluna fica fora.** Nada a fazer.
- **BV-3 · sem preencher autor pelo log.** Já está assim desde o Prompt V:
  medição sem autor aparece para todos, marcada "autor não registrado".

## Projetos (Prompt B)

- **1 · comparativo por caixa: não.** O cartão continua por competência e o
  título passou a dizer isso: "Orçado x Realizado · competência". Caixa por
  projeto fica no Fluxo de Caixa e no Resumo.
- **2 · título "Projetos".** Já estava assim em todo o app (cabeçalho, menu,
  permissões); não sobrou "Projetos & Unidades" em tela.
- **3 · Excluir saiu do menu `[...]`**, que ficou com Abrir e Copiar link. A
  exclusão mora dentro da tela do projeto, numa faixa própria no fim do
  cadastro, e o botão "Excluir definitivamente" só libera depois de digitar
  o nome do projeto (a mesma confirmação de antes, que o servidor também
  confere). Vale para obras e para matriz/filial.

## Versões (Prompts F e H)

- **6 · trava × situação: não trava ao aprovar.** Contagem de versões com
  `locked = true`: **na base local, 0 de 5**. Em produção, rodar o relatório 1
  de [`sql/decisoes-0110.sql`](./sql/decisoes-0110.sql) e mandar o resultado;
  se der zero, a coluna pode ser descontinuada (decisão sua).
- **7 · a ordem é Rascunho → Concluído → Aprovado.**
  - Aprovar só a partir de Concluído; de Rascunho direto é recusado, com o
    motivo.
  - Sair de Aprovado (para Concluído ou Rascunho) é permitido, mas o
    seletor **pede confirmação** e diz o efeito: com a regra "Rascunho fora
    dos relatórios" ligada, "ela sai dos relatórios agora e os números
    mudam"; desligada, "hoje não muda, mas mudará quando a regra for
    ligada".
  - Erro na troca agora aparece na tela (antes era ignorado em silêncio).
- **8 · teto de 12 previsões:** fica. Nada a fazer.
- **9 · permissão própria `versaoaprova`** ("Aprovar e desaprovar versão",
  módulo Planejamento). Nasce só com owner e admin e aparece na Gestão de
  Acessos como as outras.
  - Entrar ou sair de Aprovado exige essa permissão.
  - Rascunho ↔ Concluído segue o `editar` da tela.
  - A Auditoria registra de → para.
  - **Efeito em produção:** quem aprova hoje só com o `editar` de
    Orçamentos/Previsão (membro com override) deixa de conseguir; precisa
    receber `versaoaprova` na Gestão de Acessos.
- **10 · lista de conferência do Rascunho:** a prévia em `/chaves` já lista
  todas as versões fora de Aprovado com projeto, nome, total de receitas e
  total de despesas. Ela ganha exportação no PR das chaves; o relatório 3
  do SQL é a mesma lista direto do banco.

## Orçamentos (Prompt D)

- **4 · entrada financeira — DIVERGE. Não fechei; preciso da sua decisão.**
  As três telas usam três valores diferentes:

  | Tela | Valor |
  |---|---|
  | Orçamentos, "Receitas do Projeto" (BD-1) | **construção**; soma o terreno **só** quando "terreno fora do caixa" está desmarcado |
  | Dashboard, "% entradas de caixa" e "% margem" | **construção + terreno, sempre** |
  | Resumo, "VGV" | **soma das unidades** da versão — não usa o cadastro |

  Com terreno fora do caixa (o padrão, e o caso das 3 obras locais), o
  Orçamento usa só a construção e o Dashboard soma o terreno. O Resumo é
  outra base. O relatório 2 do SQL mostra, por obra, os três números.
  **Nada foi mudado.** Pergunta: qual vale nas três? (Sugestão: a entrada
  financeira nas duas primeiras, que é o dinheiro que passa pela
  construtora; e o VGV do Resumo continua sendo o das unidades, com o nome
  "VGV" e não "receita do projeto".)
- **5 · "Outras Receitas": não cria.** Nada a fazer.

## Empresa (Prompt AH)

- **15 · os dois avisos entram no checklist.** "Código tributário do
  município" e "Município" (vazio, ou nome sem código IBGE) agora saem de
  `checarProntidaoFiscal`, junto com os outros, como **aviso**. Nenhum
  bloqueio mudou e `emitentePronto` dá o mesmo resultado (teste). A tela e o
  assistente deixaram de concatenar à parte.
- **16 · dado inválido já gravado.**
  - **Resultado na base local:** a única empresa (RMV) tem todos os campos
    fiscais vazios — **nenhum valor preenchido e inválido**. Em produção,
    rodar o 2º relatório de
    [`sql/v2-prompt-ah-diagnostico.sql`](./sql/v2-prompt-ah-diagnostico.sql)
    e me mandar.
  - **Não trava mais a edição.** Antes, o formulário reenviava o valor antigo
    inválido (CEP com 6 dígitos, por exemplo) e o servidor recusava o
    salvamento inteiro — não dava para mudar nem o nome fantasia. Agora o
    campo que volta **igual ao gravado** é mantido exatamente como está no
    banco (sem normalizar) e não é validado; ele segue aparecendo como
    pendência no checklist. Só o campo que o usuário **mudou** é validado.
    Vale para CNPJ, alíquota, CEP, código IBGE e UF.
