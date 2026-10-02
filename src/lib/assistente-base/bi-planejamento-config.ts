/** Base de conhecimento do Assistente — Business Intelligence, Planejamento e Configurações. Descreve o sistema de HOJE. */
export const TEXTO = `# Base de conhecimento — Business Intelligence, Planejamento e Configurações

Regras gerais:

- **Obra na URL.** Cada tela guarda a obra escolhida no endereço. Sem obra, a aba reabre a última usada nela; sem memória, os relatórios consolidáveis abrem em "Todos" e as demais telas pedem a escolha. Nunca se escolhe "a primeira obra".
- **Todos / Ativos / Finalizados** seguem o Status do projeto (em Projetos). A obra sem status fica fora desses filtros, e a tela avisa.
- **Versões:** Atual (movimento real), Orçamento e Previsão Atualizada. O projeto novo nasce com uma de cada.
- **Permissões padrão:**
  - Owner e admin têm tudo, sempre.
  - O membro, com a chave "Padrão novo do membro" desligada, vê, cria e edita toda tela fora do grupo Config, mas não exclui. Com a chave ligada, fica só com lançamento e receita.
  - O contador é só leitura. Por padrão, vê DRE, Fluxo, Medição, Resumo, Consolidado, Plano de Contas, Despesas/Conferência e Auditoria.
  - O engenheiro só lança medição.
  - Ajustes por pessoa são feitos em Gestão de Acessos.
- **Assistente:** várias telas têm um painel à direita que só lê os números da tela. As exceções estão indicadas abaixo.

---

## Dashboard (/dashboard) — módulo Business Intelligence

**Para que serve:** visão geral de uma obra ou de várias somadas.

**O que se faz:**
- Seletor de projeto (com Todos, Ativos e Finalizados) e período De/Até.
- Com uma obra, até 3 versões. O padrão é a Atual + o Orçamento e a Previsão mais recentes que não sejam cópia. Ao tentar marcar a quarta, a tela avisa e não troca.
- Com várias obras, uma coluna por tipo de versão ("soma de N obra(s)").
- Quatro cartões no topo: VGV total, Realizado acum., A receber e A pagar. Abaixo: Status atual, Margem e produtividade e Indicadores da obra (financiamento, BDI, custo referencial).
- Assistente: explicar indicador, o que mudou desde a última visita, divergências e obras que merecem atenção.

**O que confunde:**
- Só os **quatro de cima** seguem a versão e o período. Status e margem somam do começo da obra até hoje. Os Indicadores da obra vêm do cadastro.
- **A receber** no planejamento é receita planejada − realizado, nunca negativo. É saldo a realizar, não recebível.
- **A pagar** só existe na Atual: é o saldo das contas em aberto de todas as versões da obra.
- **Entradas de caixa** somam toda entrada, de todas as versões.
- **% executado** = despesas da Atual ÷ **soma de todos** os Orçamentos.
- Os percentuais de entradas e de margem usam a receita do cadastro (construção + terreno).
- Evolução física e liberação por medição estão desligadas até a PLS de cada obra ser cadastrada.

**Não faz:** não calcula o caixa projetado (isso fica no Fluxo de Caixa) e não edita nada.

**Chaves:**
- "Dashboard pela definição nova" ligada: entradas só da Atual, Executado dividido por um único Orçamento, VGV da Atual em toda coluna, "A receber" pode ficar negativo e Status/margem passam a seguir o período.
- "Contas a Pagar só com a Atual" ligada: o planejamento sai de A pagar.
- "Rascunho fora dos relatórios" ligada: planejamento não Aprovado sai.

**Quem acessa:** owner e admin. O membro, com a chave do membro desligada. O contador não.

---

## DRE (/dre) — módulo Business Intelligence

**Para que serve:** resultado em cascata, de Receita até Resultado Final, de uma obra, de um escritório ou da empresa.

**O que se faz:**
- Escopo: projeto (inclusive Matriz/Filial), Empresa toda, Ativos ou Finalizados.
- Período: Acumulado, um ano ou Personalizado, o mesmo para todas as colunas.
- Visão: Consolidado (com "% Receita") ou Mensal.
- Com um projeto, compara **versões**. Com vários, compara **cenários** (Orçamento, Previsão, Realizado).

**O que confunde:**
- "—" significa nenhum lançamento. "R$ 0" é uma soma que deu zero.
- Regime de cada bloco:
  - despesas pela competência;
  - receita de venda e contas a receber pelo vencimento;
  - liberações e permutas pela liquidação;
  - multa e juros pelo pagamento.
- O **rodapé amarelo** conta o que ficou fora da cascata (sem categoria, sem competência, categoria fora da lista) e traz um link para a Conferência. Lançamento sem competência só aparece no Acumulado.
- Retiradas, Investimentos e Empréstimos estão na cascata. A tela diz que a classificação delas aguarda decisão. Para uma leitura contábil formal, confirme com a sua contabilidade.
- Na Empresa toda, o projeto sem o cenário entra com outra versão (Realizado, senão a padrão), e a linha de cobertura declara isso.

**Não faz:** não grava, não reclassifica e não exporta.

**Chaves:**
- "DRE pela definição nova" ligada: despesa classificada como "Receita" sai da receita, encargos vão para a competência da despesa de origem e o projeto sem o cenário fica fora da coluna.
- Rascunho ligada: planejamento não Aprovado sai.

**Quem acessa:** owner e admin, o membro (chave desligada) e o contador (leitura).

---

## Fluxo de Caixa (/fluxocaixa) — módulo Business Intelligence

**Para que serve:** entradas e saídas por mês, com saldo acumulado. O previsto vem pelo vencimento e o realizado pela liquidação.

**O que se faz:**
- Projeto (com Todos, Ativos e Finalizados), período e ano. O período tem prioridade sobre o ano. O ano padrão é o atual, se tiver movimento; senão, o primeiro que tiver.
- Com uma obra, até 3 versões. A primeira é a referência, e o padrão é a Atual. Com várias obras, aparece uma coluna "Atual" somada.
- Tabela: entradas, saídas, saldo do mês, Realizado ↑/↓, Desvio, Desvio % e Saldo acumulado.

**O que confunde:**
- **Saldo do período** não inclui o saldo inicial.
- **Saldo acumulado** parte do saldo das **contas correntes da empresa** (todas as obras), não do caixa da obra, e corre pelo previsto.
- **Realizado** é o da **primeira versão selecionada**.
- **Desvio** só aparece nos meses com os dois lados.
- Despesa paga por terceiro só sai na restituição.

**Não faz:** não lança nem concilia (isso é no Caixa) e não mostra a competência (isso é na DRE).

**Chaves:**
- "Fluxo pela definição nova" ligada: realizado sempre da Atual, permuta fora do planejamento e saldo partindo do caixa da obra, pelo realizado nos meses fechados.
- Rascunho ligada: planejamento não Aprovado sai.

**Quem acessa:** owner e admin, o membro (chave desligada) e o contador (leitura).

---

## Resumo Executivo (/resumo) — módulo Business Intelligence

**Para que serve:** indicadores de vendas e fontes de recurso: VGV, sinais, parcelas, FGTS, subsídio, permuta e liberações.

**O que se faz:**
- **Uma obra**: tabela Indicadores Gerais e os cartões Unidades (Disponíveis/Reservadas/Vendidas/Total) e Financiamento Banco. Com um período informado, aparece também "Recebimentos previstos no período".
- **2–3 versões**: tabela comparativa, sem o filtro de período.
- **Todos/Ativos/Finalizados**: uma coluna por tipo de versão, com a cobertura. Com mais de uma obra, aparece o comparativo entre projetos. Custo realizado × orçado só para quem vê Despesas.

**O que confunde:**
- Os indicadores são **acumulados da versão**. O período só afeta o cartão de recebimentos.
- O VGV conta todas as unidades. Sinais e parcelas contam só as **Vendidas**.
- Os valores são nominais, sem INCC. O Financiamento Banco não entra nos totais.
- Se a versão não é a Atual, a tela avisa que aquilo é planejamento, não o contratado.

**Não faz:** não edita unidades nem planos de pagamento (isso fica em Receitas → Unidades).

**Chaves:**
- "Resumo pela definição nova" ligada: sinais × quantidade, permuta e liberação canceladas fora dos totais, linha "Permuta de outros tipos" e os blocos Vendas, Exposição e Atenção. Os limites do bloco Atenção ficam em Configurações → Empresa.
- Rascunho ligada: planejamento não Aprovado fica fora no consolidado.

**Quem acessa:** owner e admin, o membro (chave desligada) e o contador (leitura).

---

## Consolidado (/consolidado) — módulo Business Intelligence

**Para que serve:** a receita projetada de **uma obra**, por fonte, ao longo do tempo. Apesar do nome, não soma obras.

**O que se faz:**
- Uma obra (sem "Todos"), período e versões.
- Periodicidade Mensal/Trimestral/Semestral/Anual, com o ano.
- Linhas: AS/Sinais, Mensais, Semestrais, Anuais, FGTS, Subsídio, Permuta, Liberações de Obra e TOTAL.
- Com 2–3 versões, mostra o comparativo do total por fonte.

**O que confunde:** as liberações entram no TOTAL, e uma célula zerada aparece como "—".

**Não faz:** não mostra despesa, resultado nem várias obras. Para isso, use Dashboard, DRE, Fluxo ou Resumo em "Todos".

**Chaves:** com Rascunho ligada, planejamento não Aprovado sai dos números.

**Quem acessa:** owner e admin, o membro (chave desligada) e o contador (leitura).

---

## Projetos (/projeto) — módulo Planejamento

**Para que serve:** cadastro das obras e das unidades/escritórios, que alimenta datas, valores, financiamento e metragem dos relatórios.

**O que se faz:**
- **Todos**: cards, busca, Novo projeto e Nova unidade / escritório. O menu "…" tem Abrir e Copiar link.
- **Um projeto**: o cadastro completo e mais quatro blocos:
  - dados: nome, datas, Status, cliente, endereço/IBGE, CNO/CEI, ART/RRT;
  - valores: Receitas, Custos e Estrutura financeira;
  - documentos;
  - o cartão **Orçado x Realizado · competência**;
  - versões, com o botão de travar e destravar;
  - planilha da Atual (modelo, exportar, importar).
- O Status grava na hora. Projeto novo nasce Ativo.
- **Excluir** fica numa zona separada e exige digitar o nome. A exclusão apaga junto versões, unidades, despesas, caixa, medições, orçamentos e recebíveis, sem como desfazer.
- Assistente: cadastro incompleto, inconsistências, funding e documentos. Com IA configurada, ele lê um documento e **propõe** o preenchimento, sem gravar.

**O que confunde:**
- As **datas de início e fim** definem o período de Orçamentos e Previsão.
- A importação da planilha só grava na Atual, em tipos ainda vazios. Se houver conflito, é recusada inteira.
- **Trava** impede editar. A **situação** (Rascunho/Concluído/Aprovado) não trava.
- O bloco de município mostra onde o sistema entende que a NFS-e seria tributada. Confirme com a sua contabilidade.

**Não faz:** não lança orçamento e não cria versões.

**Quem acessa:** owner e admin. Membro e contador não, salvo concessão em Gestão de Acessos. Travar exige a permissão "Travar e destravar versão".

---

## Orçamentos (/budget) — módulo Planejamento

**Para que serve:** planejar receitas e despesas do projeto mês a mês, dentro do período do cadastro.

**O que se faz:**
- No topo:
  - seletores de projeto (inclui Matriz/Filial) e de versão;
  - período e número de competências;
  - Situação e trava;
  - cartões Receitas, Despesas, Resultado e Recursos próprios.
- **Receitas**: o total vem do cadastro. Só a distribuição mensal se edita.
- **Despesas**: total da linha + % por mês. O valor mensal é calculado, e a soma não pode passar de 100%.
- Ações:
  - incluir linha do Plano de Contas;
  - remover linha (pede confirmação se tiver valor);
  - exportar e importar planilha;
  - Salvar, que é separado por bloco.
- Matriz/Filial usa o ano atual + 5 anos.

**O que confunde:**
- **Aprovar** só a partir de Concluído e exige "Aprovar e desaprovar versão". Sair de Aprovado pede confirmação.
- Com a chave de Rascunho desligada, a situação não muda número de relatório.

**Não faz:** não lança despesa real (isso fica em Despesas) e não cria outra versão de Orçamento. Sem as datas, a tela leva ao cadastro do projeto.

**Chaves:** com "Rascunho fora dos relatórios" ligada, a versão não Aprovada some dos relatórios, e a tela avisa.

**Quem acessa:** owner e admin, e o membro com a chave desligada (sem excluir). O contador não. Aprovar e travar: só owner e admin, salvo concessão.

---

## Previsão Atualizada (/forecast) — módulo Planejamento

**Para que serve:** redistribuir mês a mês o que foi orçado, sem mudar os totais.

**O que se faz:**
- **Criar Previsão**: escolha o Orçamento base e dê um nome (obrigatório).
- **Duplicar atual** e **Comparar com o Orçamento**.
- Limite: 12 previsões por projeto.
- A grade é igual à de Orçamentos, mas os totais e as linhas são **herdados** do Orçamento. Só os % mensais se editam.
- Assistente: analisa a distribuição e os desvios. "Reprojetar em uma revisão nova" cria **outra** previsão.

**Não faz:** não muda totais, não inclui linhas (isso se faz no Orçamento) e não tem botão de excluir previsão.

**Quem acessa:** igual a Orçamentos. Criar e duplicar exigem "criar" em Previsão.

---

## Plano de Contas (/planocontas) — módulo Planejamento

**Para que serve:** manter os grupos e subitens que classificam orçamento e despesas. A classificação é dupla: Grupo CEF/Obra + Categoria DRE.

**O que se faz:**
- Grupos CEF / Obra e Grupos Complementares.
- Criar grupo ou subitem (código, nome, natureza Despesa/Receita), renomear o grupo, editar, inativar ou excluir.
- As Categorias DRE ficam ao lado e são **fixas**.

**O que confunde:**
- A Natureza define o bloco da linha em Orçamentos.
- Só dá para **excluir** se nenhum Orçamento ou Previsão usa o código. Se usa, **Inative**: a conta some dos novos lançamentos e os valores ficam.

**Não faz:** não edita as categorias DRE e não reclassifica despesas (isso fica na Conferência).

**Quem acessa:** owner e admin, o membro com a chave desligada (sem excluir) e o contador (leitura).

---

## Empresa (/empresa) — módulo Configurações

**Para que serve:** identidade da empresa e cadastro do emitente fiscal.

**O que se faz:**
- Nome e logo. O upload só funciona com armazenamento configurado.
- **Dados fiscais**: CNPJ, inscrições, regime, item de serviço, CNAE, alíquota de ISS, ambiente (Homologação/Produção), endereço e código IBGE. Um checklist mostra o que "falta" e o que é para "confira".
- **Alertas do Resumo Executivo**: % e valor de desvio de custo (só alerta quando passa dos dois) e dias de recebível vencido.

**O que confunde:** os alertas só aparecem com a chave do Resumo ligada. Confira os dados fiscais com a sua contabilidade.

**Não faz:** não emite nota e não configura o provedor de emissão, que fica no servidor.

**Quem acessa:** owner e admin, salvo concessão.

---

## Usuários (/usuarios) — módulo Configurações

**Para que serve:** adicionar pessoas e definir o papel de cada uma.

**O que se faz:**
- Novo usuário: nome, e-mail, papel (admin, membro, contador, engenheiro) e senha opcional. Sem senha, o acesso fica pendente. A senha definida aqui é provisória.
- Na tabela: trocar o papel, Editar, Senha e Remover.
- Promover a owner pede confirmação.
- Quem tem telas personalizadas, ao trocar de papel, escolhe entre manter as personalizações ou voltar ao padrão.
- Ninguém remove a si mesmo.

**Não faz:** não ajusta tela a tela (isso é na Gestão de Acessos) e não cria owner direto.

**Quem acessa:** só owner e admin, sem concessão possível.

---

## Gestão de Acessos (/acessos) — módulo Configurações

**Para que serve:** definir Ver/Criar/Editar/Excluir por tela, para cada pessoa.

**O que se faz:**
- Matriz por membro, com Salvar e "Voltar ao padrão do papel".
- Marcar uma ação liga o Ver, e tirar o Ver tira o resto.
- Com a chave do membro desligada, há uma prévia do que cada membro perderia se ela fosse ligada.

**O que confunde:**
- A matriz de owner e admin não se edita ("acesso total"), e ninguém edita a própria.
- O contador só recebe "Ver".
- A Conferência acompanha Despesas.
- Usuários, Gestão de Acessos e Chaves nunca são concedidas.
- Os grupos da matriz (Reports, Config…) não são os módulos do menu.

**Não faz:** não troca o papel da pessoa (isso é em Usuários).

**Quem acessa:** só owner e admin.

---

## Auditoria (/acoes) — módulo Configurações

**Para que serve:** ver quem alterou o quê.

**O que mostra:** os **200 eventos mais recentes**, com data, usuário, ação, entidade e "de → para".

**O que confunde:** quem não é owner nem admin vê os dados pessoais de compradores apenas como "alterado".

**Não faz:** não filtra, não busca, não exporta e não mostra eventos além dos 200.

**Quem acessa:** owner e admin, e o contador. O membro só por concessão.

---

## Numeração de despesas (/numeracao) — módulo Configurações

**Para que serve:** configurar o número automático (PED) das despesas: prefixo, próximo número e dígitos.

**O que confunde:**
- A tela recusa um número já usado.
- Para salvar abaixo do maior emitido, é preciso digitar CONFIRMO.
- Número de despesa excluída não volta a ser usado.

**Não faz:** não renumera despesas antigas.

**Quem acessa:** owner e admin, salvo concessão.

---

## Chaves de mudança (/chaves) — módulo Configurações

**Para que serve:** ligar, para a empresa, regras novas que mudam número de relatório ou acesso. Todas nascem **desligadas**, e desligada nada muda.

**O que se faz:**
- Um cartão por chave, com efeito, estado, última troca e link da prévia. As chaves são:
  - membro
  - Contas a Pagar só Atual
  - restituição
  - Rascunho
  - Dashboard
  - Fluxo
  - Resumo
  - DRE
- **Para ligar:** marque "Conferi a prévia" e clique em Ligar. Nas chaves com prévia nesta tela (Rascunho, Dashboard, Fluxo, Resumo, DRE), exporte antes a prévia (.xlsx). A exportação vale por 7 dias.
- A ordem Dashboard → Fluxo → Resumo → DRE, com alguns dias entre elas, é só **aviso**: não bloqueia.
- Desligar volta ao comportamento anterior. Tudo vai para a Auditoria.

**Não faz:** não apaga nem regrava dados.

**Quem acessa:** só owner e admin.

---

## Backup de dados (/backup) — módulo Configurações

**Para que serve:** baixar um ZIP por semestre, com a planilha de Despesas, Contas a Receber e Caixa mais os documentos do período.

**O que se faz:**
- Lista de semestres com as contagens, a coluna "Último backup" (quando e quem baixou) e o botão "Baixar ZIP".
- Aviso do semestre encerrado: aparece quando o último semestre encerrado tem dados e ainda não foi baixado depois do fim dele. Depois do download, o aviso some.
- Cada download vai para a Auditoria, com o que o pacote continha.

**Campos que confundem:** "Encerrado" é só calendário. Semestre encerrado continua recebendo lançamento; um backup baixado e depois alterado fica desatualizado.

**Não faz:** não apaga, não arquiva e **não restaura**. O backup do banco de dados e dos arquivos é outro, feito pela infraestrutura.

**Quem acessa:** owner e admin, e o membro com a chave do membro desligada. O contador não.

---

## Conferência de lançamentos (/conferencia) — módulo Configurações

**Para que serve:** listar despesas com categoria de receita, sem categoria, com valor zero ou sem competência.

**O que se faz:**
- Filtros por projeto, competência e fornecedor.
- Nova categoria linha a linha, ou em lote, quando os marcados são do mesmo fornecedor ou da mesma conta CEF.
- Prévia "Conferir antes de aplicar".
- **Só a categoria muda**: valor, competência, vencimento, status e PED ficam.

**O que confunde:** a lista vazia não garante que está tudo certo. Despesas canceladas não podem ser selecionadas.

**Não faz:** não corrige sozinha e não preenche a competência (isso se faz abrindo a despesa).

**Quem acessa:** quem vê Despesas, ou seja, owner, admin e o membro (em qualquer posição da chave). O contador só vê. Reclassificar exige "editar" em Despesas.

---

## Diferenças entre telas parecidas

- **Orçamentos × Previsão Atualizada:** o Orçamento define linhas e totais. A Previsão nasce dele, herda tudo e só redistribui os % mensais (até 12 por projeto).
- **DRE × Fluxo de Caixa:** a DRE é resultado (competência e vencimento) até o Resultado Final. O Fluxo é dinheiro: previsto pelo vencimento, realizado pela liquidação e saldo a partir das contas correntes.
- **Dashboard × Resumo Executivo × Consolidado:**
  - o Dashboard é o painel geral (VGV, realizado, a receber, a pagar, margem);
  - o Resumo detalha vendas e fontes de recurso e as unidades por status;
  - o Consolidado é a receita de **uma** obra por fonte e período.
- **Usuários × Gestão de Acessos:** papel × ajuste fino por tela.
- **Situação × Trava:** a situação documenta a etapa e, com a chave de Rascunho, decide se a versão entra nos relatórios. A trava impede editar.
- **Rodapé da DRE × Conferência:** o rodapé conta o que ficou fora. A Conferência lista e corrige a categoria.

## Caminhos comuns

- Para cadastrar uma obra, vá em **Planejamento → Projetos → Novo projeto**.
- Para habilitar o Orçamento de uma obra, vá em **Planejamento → Projetos**, abra a obra e preencha as datas de início e fim.
- Para criar uma revisão, vá em **Planejamento → Previsão Atualizada**, escolha a base, dê um nome e clique em Criar Previsão.
- Para aprovar uma versão, vá em **Planejamento → Orçamentos** (ou Previsão) e mude a Situação para Concluído e depois Aprovado.
- Para comparar orçado e real, vá em **Business Intelligence → DRE** e marque as versões. Também dá para usar o cartão Orçado x Realizado em Projetos.
- Para corrigir despesas sem categoria, vá em **Configurações → Conferência de lançamentos**.
- Para dar acesso a uma tela, vá em **Configurações → Gestão de Acessos**, escolha a pessoa, marque a tela e clique em Salvar.
- Para trocar o papel ou a senha de alguém, vá em **Configurações → Usuários**.
- Para ligar uma regra nova, vá em **Configurações → Chaves de mudança**, exporte a prévia, marque "Conferi a prévia" e clique em Ligar.
- Para baixar a cópia de um semestre, vá em **Configurações → Backup → Baixar ZIP**.
`;
