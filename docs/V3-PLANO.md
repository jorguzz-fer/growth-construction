# PLANO DA FASE 3 — GROWTH TOOLS · CONSTRUCTION APP

Montado em 15/10/2026 a partir da revisão do Thiago de 14/10
([`V3-REVISAO-1410.md`](./V3-REVISAO-1410.md)) e das decisões do dono de 15/10
([`V3-DECISOES-1510.md`](./V3-DECISOES-1510.md)). Segue o mesmo formato do
[`v2/PROMPTS.md`](./v2/PROMPTS.md): cada prompt tem bloqueios, e **nenhum é
executado sem responder os seus**. Os prompts em si ainda não estão escritos;
este arquivo é o índice e o inventário que cada um vai receber.

As quatro regras dos 42 prompts da V2 continuam: nenhum dado inputado pela
empresa é alterado; nenhuma mudança amplia acesso; mudança que altera número
em produção entra atrás de chave desligada; nada vindo de mockup entra no
código.

---

# 1. O QUE A REVISÃO PEDE E O QUE JÁ EXISTE

Levantamento feito sobre o `main` depois do PR #260. "Feito" é o que o código
já faz; "parcial" é o que existe em parte; "novo" é o que não existe.

## Transversal

| Pedido | Situação | Onde está / o que falta |
|---|---|---|
| Versões como Orçamento, Previsão Atualizada e Atual | **Parcial** | Menu, DRE (`dre.ts`), Dashboard e chat já usam os nomes novos. Sobram "Budget"/"Forecast" no seletor da DRE (`dre-controls.tsx`), em `lancamento-screen.tsx`, no botão "Importar do Budget" (`budget-matrix.tsx`), no `budget-planning-screen.tsx` e no console da plataforma. Na DRE o terceiro cenário se chama "Realizado", não "Atual". |
| Assistente de IA em toda tela | **Parcial** | 23 painéis somente leitura (Prompt E, Etapa 1) e o chat flutuante (Etapa 2). Nenhum escreve; nenhum faz simulação; nenhum recebe número da tela. |
| IA lê documento e preenche por voz ou texto | **Parcial** | Leitura de documento existe para despesa, fornecedor, unidade, permuta, medição, folha de ponto, estoque, extrato e projeto (`src/lib/ai/*-extract.ts`), sempre como proposta. **Voz não existe em lugar nenhum**: sem captura de áudio nem transcrição. |

## Business Intelligence

| Pedido | Situação | Onde está / o que falta |
|---|---|---|
| Dashboard: dois gráficos centrais | **Novo** | Prompt AA, Parte 4-A, não feita. Bloqueada pelo Prompt I §54–57 (linha de receita) e pelo critério de conciliação do caixa (Prompt L, Parte 7). `charts.tsx` existe como componente. |
| Dashboard: IA gera PDF com indicadores escolhidos | **Novo** | Não há geração de PDF em nenhuma tela. |
| Relatórios Customizados com chat próprio | **Novo** | Prompt AA, Parte 7: "nada foi criado". É quem absorve a pergunta do Consolidado (BAB-1). |
| Assistente sai | **A fazer** | `/diagnosticoia` é o chat que explica o produto (Prompt AM). Decisão 4 de 15/10 libera. Destino da ajuda: em aberto. |
| DRE Mensal e DRE Anual, versões por checkbox | **Parcial** | A DRE já tem visão mensal (`?view=mensal`), análise vertical e seleção de cenários lado a lado (`cenario-multiselect.tsx`, botões). Falta separar em duas telas e trocar botões por checkbox. |
| DRE Analítica: drill-down até o plano de contas, vertical | **Novo** | A DRE para na categoria. Depende do de-para CEF → DRE para o custo de obra. |
| Fluxo de Caixa mensal e semanal | **Parcial** | Só mensal (`fluxocaixa/page.tsx`). Semanal é novo. |
| Fluxo de Caixa Analítico: grupo CEF, subgrupo, plano de contas, vertical | **Novo** | Nada abre por grupo. Candidato a herdar a visão "por fonte" da Projeção de Receitas (BAB-1). |
| Resumo Executivo com indicadores selecionáveis (custo/m², VGV vendido) | **Parcial** | VGV total e VGV vendido existem (`resumo/page.tsx`). Custo/m² não existe e precisa de área no cadastro do projeto. Seleção de indicadores é nova. |

## Planejamento

| Pedido | Situação | Onde está / o que falta |
|---|---|---|
| Projetos: chat lê documento e preenche o cadastro | **Feito** | Prompt B, 25–26: `projeto-doc.ts`, `projetos-assistente.ts`. Proposta campo a campo, Salvar grava com `origem: "assistente"`. |
| Projetos: alterações por comando ("mudar o projeto 28") | **Novo** | Depende da Etapa 3 (decisão 1). |
| Projetos pré-preenche datas, custo e receita em Orçamentos | **Novo** | `projeto/page.tsx` não toca em `budget_line`. |
| Orçamentos: IA ativa por voz e por arquivo | **Novo** | Painel atual é somente leitura. Pré-condição 4.1.1 cumprida (gravação não destrutiva). 4.1.3 pendente: `budget.ts` e `planning.ts` ainda lançam erro. |
| Previsão Atualizada parecida com Orçamentos; IA traz Atual e Orçamento mês a mês | **Parcial** | A tela já é a mesma grade (`budget-planning-screen.tsx`) e o assistente já propõe reprojeção, "você confirma" (Prompt F). Falta o ajuste mês a mês guiado pelo Atual. |
| Plano de Contas: chat para inserir departamentos, áreas e subáreas | **Bloqueado** | Prompt G 8.2.1 veda escrita assistida nesta tela "permanentemente". Decisão 2 pendente. |
| De-para CEF → categoria da DRE, fixo e editável na tela | **Novo** | Só há heurística em `planocontas-analise.ts` e `natureza-dre`. Tabela de entrada é tarefa do Thiago. |

## Telas canceladas (Etapas 1 e 2)

| Tela | Decisão | Situação |
|---|---|---|
| Projeção de Receitas | Removida | **Não saiu.** Prompt AB, Fase 1: pergunta "por fonte" sem dono. |
| Consolidado | Removida | **Não saiu.** Sem dono até Relatórios Customizados. |
| Balanço do Dia | Removida | **Não saiu.** Único leitor de `daily_closing`. |
| Acesso Contabilidade | Removida | Feito (Prompt AL). |
| Conferência de Planos | Removida | Feito (Prompt AN). |
| Configuração da Versão | Removida | Feito (Prompt AP). |
| Ponto da Obra | Substituída por Pessoas | Feito (Prompt Z). |
| Fechamento de Caixa | Removida | Feito (Prompt L, Parte 9). |
| Acerto Contábil | Aba "Acertos" em Despesas | **Não feito.** Ainda é tela própria no menu de Despesas. Prompt S adiou até o L. |
| Duas telas de medição | Uma tela com abas | Feito (Prompt V). |
| Duas telas de diagnóstico/conferência | Uma tela com abas | Feito (Prompt AN). |

---

# 2. ÍNDICE DOS PROMPTS DA FASE 3

Os códigos reaproveitam a letra do prompt da V2 que é dono da tela, com o
sufixo "2" (ou "3" para a tela nova que nasce ao lado). Prompts sem
antecedente ganham código próprio.

## Bloco 0 · Arquitetura e limpeza

| # | Prompt | Tela | Bloqueios | Observação |
|---|---|---|---|---|
| 1 | **NOM** | Nomenclatura das versões | — | Só rótulo; rota e `kind` não mudam. **Pode ir já.** Decide se o cenário "Realizado" da DRE vira "Atual". |
| 2 | **E2** | Assistente de IA — arquitetura da Fase 3 | BE2-1 · BE2-2 · BE2-3 | Reabre BE-2 (decisão 3) e libera a Etapa 3 (decisão 1). **Todo prompt dos Blocos 2 e 3 depende dele.** |
| 3 | **VOZ** | Entrada por voz | BV2-1 · BV2-2 | Infraestrutura: captura no navegador e transcrição. Nada grava; o texto transcrito entra no mesmo caminho do texto digitado. Depende de E2. |
| 4 | **PDF** | Geração de PDF | BPDF-1 | Infraestrutura: um gerador no servidor para Dashboard e, depois, outras telas. Independente de IA. |

## Bloco 1 · O que sai

| # | Prompt | Tela | Bloqueios | Observação |
|---|---|---|---|---|
| 5 | **AM2** | Assistente sai | BAM2-1 | Tira `/diagnosticoia` do menu e as menções (importação de extrato, regras de uso de IA). Redirecionamento, sem apagar. |
| 6 | **S2** | Acerto Contábil vira aba "Acertos" em Despesas | BS2-1 | Somente leitura na aba; a action de acerto continua onde está. |
| 7 | **AB2** | Projeção, Consolidado e Balanço do Dia saem | BAB-1 · BAB-3 (ainda abertos) | Projeção e Balanço do Dia podem sair assim que BAB-1 e BAB-3 forem respondidos. **Consolidado só depois de RC.** |

## Bloco 2 · Relatórios

| # | Prompt | Tela | Bloqueios | Observação |
|---|---|---|---|---|
| 8 | **DP** | De-para CEF → DRE | BDP-1 · BDP-2 | Tela fixa e editável, com a tabela do Thiago como carga inicial. **Pré-requisito de AC3 e AD3.** Altera número da DRE: entra atrás de chave. |
| 9 | **AC2** | DRE Mensal e DRE Anual | BAC2-1 | Reorganiza o que existe; checkbox de versões. Pode ir antes de E2. |
| 10 | **AC3** | DRE Analítica (nova) | BAC3-1 | Drill-down categoria → grupo → plano de contas, com análise vertical. Depende de DP. |
| 11 | **AD2** | Fluxo de Caixa mensal e semanal | BAD2-1 | Semanal exige regra para parcela sem dia (só competência). Pode ir antes de E2. |
| 12 | **AD3** | Fluxo de Caixa Analítico (novo) | BAD3-1 | Grupo CEF, subgrupo e plano de contas, vertical. Depende de DP. Candidato a absorver "por fonte" (AB2). |
| 13 | **AA2** | Dashboard: gráficos e PDF | BAA-1 (I §54–57) · critério de conciliação · PDF | Os dois gráficos do mockup. O PDF pela IA depende de PDF e E2. |
| 14 | **RC** | Relatórios Customizados (nova) | BRC-1 · BRC-2 | Tela com chat próprio que monta o relatório. Depende de E2. **Libera a saída do Consolidado.** |
| 15 | **AE2** | Resumo Executivo: indicadores selecionáveis | BAE2-1 | VGV vendido pronto; custo/m² precisa de área no cadastro (Prompt B). |
| 16 | **IAR** | Assistente dos relatórios: análise e simulação | — | Troca os painéis somente leitura das telas de relatório pela nova regra de E2. Vai por último no bloco, tela a tela. |

## Bloco 3 · Planejamento (escrita assistida)

| # | Prompt | Tela | Bloqueios | Observação |
|---|---|---|---|---|
| 17 | **D2** | Orçamentos: IA ativa por voz e arquivo | BD2-1 · 4.1.3 | **Estreia da Etapa 3** (4.2.5: gravação não destrutiva, sem efeito contábil). Antes, `budget.ts` e `planning.ts` passam a devolver `{ ok, error }`. Depende de E2 e VOZ. Inclui o teste da tela que o Thiago pediu. |
| 18 | **B2** | Projetos: comando por texto e pré-preenchimento de Orçamentos | BB2-1 · BB2-2 | Leitura de documento já existe. "Mudar o projeto 28" é Etapa 3 com confirmação. O pré-preenchimento cria `budget_line` por proposta, nunca direto. Depende de D2. |
| 19 | **F2** | Previsão Atualizada: ajuste mês a mês com Atual e Orçamento | BF2-1 | Estende a reprojeção que existe. Depende de D2. |
| 20 | **G2** | Plano de Contas: chat para departamentos, áreas e subáreas | **Decisão 2 pendente** | Não entra enquanto a regra 8.2.1 do Prompt G não for revogada. |

---

# 3. OS BLOQUEIOS, EM UMA LISTA

Perguntas que precisam de resposta do dono (ou do Thiago) antes do prompt
correspondente ser escrito. As que exigem SQL somente leitura recebem a
consulta dentro do próprio prompt.

- **BE2-1** · O que de cada tela de relatório vai ao modelo: só os agregados
  que o usuário vê, ou também as linhas? Nome de obra vai?
- **BE2-2** · Limite de uso por empresa para análises e simulações (hoje
  `ia-uso-regras.ts` limita as conversas).
- **BE2-3** · A simulação grava algo (cenário salvo) ou vive só na aba?
- **BV2-1** · Transcrição: no provedor atual de IA, ou em serviço à parte?
  Retenção do áudio.
- **BV2-2** · Voz em todas as telas de input ou só em Orçamentos, Previsão e
  Projetos nesta fase?
- **BPDF-1** · O PDF é gerado no servidor (biblioteca) ou pelo navegador
  (imprimir)? Marca d'água e cabeçalho da empresa?
- **BAM2-1** · A função "explicar o produto" acaba ou vira ajuda no menu?
  (pergunta do Thiago).
- **BS2-1** · Confirmar que a decisão da Etapa 1 (aba "Acertos", somente
  leitura) vale. Quem precisa criar acerto continua fazendo onde?
- **BAB-1 / BAB-3** · As três perguntas do Prompt AB, Fase 1: "por fonte",
  histórico de `daily_closing`, e quem recebe os CSVs.
- **BDP-1** · A tabela de de-para chega pronta do Thiago? Com que colunas
  (grupo CEF → categoria da DRE, e subgrupo?).
- **BDP-2** · Grupo CEF sem de-para: fica fora da DRE Analítica e é nomeado,
  ou cai em "Não classificado"?
- **BAC2-1** · DRE Anual soma os 12 meses do ano civil ou do período do
  projeto?
- **BAC3-1** · O drill-down mostra lançamento individual no último nível, ou
  para no plano de contas?
- **BAD2-1** · Semana começa na segunda? Parcela sem dia de vencimento vai
  para qual semana?
- **BAD3-1** · O Fluxo Analítico herda a visão "por fonte" da Projeção? (liga
  com BAB-1).
- **BRC-1** · O relatório customizado é salvo (nome, dono, compartilhado) ou
  só exportado?
- **BRC-2** · O chat do RC monta o relatório a partir do catálogo (métricas
  existentes) ou pode consultar qualquer tabela?
- **BAE2-1** · Área construída para custo/m²: entra no cadastro do projeto ou
  vem de outro lugar?
- **BD2-1** · Lançamento por voz: o assistente propõe uma linha por vez, ou um
  bloco inteiro?
- **BB2-1** · "Mudar o projeto 28": que campos podem ser alterados por
  comando? Período e status entram?
- **BB2-2** · O pré-preenchimento de Orçamentos cria uma versão nova ou
  preenche a Orçamento existente vazia?
- **BF2-1** · O ajuste mês a mês substitui a reprojeção atual ou é mais um
  botão?

---

# 4. ORDEM SUGERIDA

O que pode começar agora, sem resposta pendente: **NOM**, **AC2**, **AD2** e
a parte de infraestrutura de **PDF**. Em seguida **E2**, que destrava os dois
blocos maiores. **DP** assim que o Thiago entregar a tabela. **AM2** e **S2**
assim que BAM2-1 e BS2-1 forem respondidos. **G2** espera a conversa de 16/10.

Dependências que mandam na ordem:

```
NOM ─┐
E2 ──┼─► VOZ ─► D2 ─► B2, F2
     ├─► IAR, RC ─► AB2 (Consolidado)
     └─► AA2 (com PDF)
DP ──► AC3, AD3
AC2, AD2, PDF: independentes
```
