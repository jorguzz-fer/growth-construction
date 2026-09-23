# V2 — bloqueios e conflitos encontrados na leitura do pacote

Leitura de `SPEC-GROWTH-CONSTRUCTION.md`, `ROTEIRO-EXECUCAO.md` e
`mockup-growth_7.html` contra o código em produção, em 22/09/2026.

O pacote descreve 42 prompts em 50 etapas. **Sete coisas impedem executá-lo como
está.** Cinco são falta de insumo, duas são decisões de negócio. Este documento
existe para que nenhuma delas seja resolvida por adivinhação — e porque o
sistema está em produção, onde chute vira perda de dado ou número errado em
relatório.

---

## B1 · Os 42 prompts não estão disponíveis · **trava quase tudo**

A própria Spec define os papéis dos três artefatos:

> | **Os 42 prompts** `PROMPT-*.md` | a instrução de execução de cada tela, com
> bloqueios, testes e relatório obrigatório | quem implementa |

E logo abaixo: **"Nenhum prompt é executado sem responder os seus bloqueios.
Eles não são formalidade: cada um existe porque uma resposta errada ali produz
perda de dado ou número errado em relatório."**

Chegaram a Spec e o Roteiro — que são o **mapa** — e o mockup. Os arquivos
`PROMPT-*.md` não. Sem eles não existem: o escopo exato de cada tela, os
bloqueios `B*-n` citados o tempo todo (BAJ-2, BM-3, BV-1, BAG-1, BAD-1, BAP-1,
BS-1, BN-1, BAA-1, BAF-3, BAE-2, BAI-1, BAO-2, BAK-2), os testes de aceite e o
conteúdo do relatório obrigatório de cada tarefa.

Executar "AJ · Gestão de Acessos, Partes 1 e 2" tendo só a linha de resumo da
tabela significa inventar o que são as Partes 1 e 2. Numa tela de permissão, num
sistema em produção, isso é exatamente o que a regra 3.2 proíbe.

**O que destrava:** enviar os 42 arquivos.

---

## B2 · Três prompts não existem nem do lado de quem escreveu

Declarado nos dois documentos. Não é falta de envio — não foram escritos:

| O que falta | Trava |
|---|---|
| **Prompt I, seção 58** — unificar `expandUnitReceivables`, `calcProjectionBySource` e `calcTotals` | **AA, AC, AD, AE, AN** |
| **Prompt dos helpers de data** — `dateInRange` × `monthInRange`, e a data inválida | toda tela com filtro de período |
| **Prompt das rotas `/api/agent/*`** | AA, AG |

A seção 58 é a etapa **10** do roteiro, logo no começo do Bloco 2. O Bloco 6
inteiro (Leitura: DRE, Fluxo de Caixa, Dashboard, Resumo) depende dela.

---

## B3 · O Bloco 0 é "vai agora" e está travado por uma pergunta de negócio

O Roteiro abre o Bloco 0 com **"Vai agora. Há relato de produção, e há vazamento
entre tenants."** Mas a própria lista de perguntas diz:

> | **Que telas o `membro` precisa ver, e com qual ação?** | BAJ-2 — e com ele o
> Bloco 0 |

Das seis etapas do Bloco 0, cinco passam por AJ ou por AI e dependem dessa
resposta. **A sexta não** — e foi executada (ver "O que já foi feito").

**O que destrava:** a lista de telas × ação para o papel `membro`.

---

## B4 · Não existe o mecanismo de chave por tenant que seis prompts exigem

A regra 3.3 é categórica:

> **Mudança que altera número em produção entra atrás de chave por tenant,
> desligada**, com prévia apresentada antes de ligar. Com a chave desligada, o
> sistema devolve exatamente os números de hoje.

O Roteiro nomeia quem depende disso: **H, AA, AC, AD, AE** e as chaves das seções
54, 56, 57 e 58 do **I**.

**No código não há nada disso.** Não existe tabela de flags por tenant, nem
helper de leitura, nem tela para ligar. E o roteiro não agenda a construção
desse mecanismo em etapa nenhuma — ele é pressuposto pronto a partir da etapa
12.

Isto é uma lacuna do plano, não uma decisão: sem a chave, ou se descumpre a
regra 3.3, ou se para na etapa 12. **Proposta:** construir o mecanismo como
etapa própria antes do Bloco 2 (tabela aditiva `tenant_flag`, helper de leitura,
padrão de "prévia" e a tela de ativação em Configurações).

---

## B5 · Seis telas em produção não têm destino declarado

A Spec §7 lista 8 telas que saem e 4 que entram. O menu do mockup tem 8 módulos
e 41 telas. Cruzando com as rotas que existem hoje, **sobram estas, que não
estão no mockup nem na lista de remoção**:

| Rota hoje | Tela | Situação |
|---|---|---|
| `/acerto` | Acerto Contábil | sem menção |
| `/reembolso` | Reembolso | sem menção — possivelmente virou "Liberações de Obra" |
| `/lancamento` | Lançamento Budget/Forecast simplificado | sem menção |
| `/diagnosticoia` | Diagnóstico de IA | sem menção |
| `/medicaolanc` | Lançamento de Medição | a fusão com `/medicao` é o Prompt V |
| `/diagnostico/*` | Categorias invertidas, planos de recebíveis | sem menção |

Sumir do menu não é o mesmo que sair do sistema, e a Spec exige que remoção
redirecione com aviso e preserve o registro. **Não vou remover nem esconder
nenhuma tela que o pacote não mande remover explicitamente.**

**O que destrava:** para cada uma — fica como está, sai (com redirecionamento),
ou foi renomeada para algo do mockup?

---

## B6 · ~~"Liberações de Obra" — tela nova ou renomeação de "Reembolso"?~~ · **RESPONDIDO**

**Resposta (23/09/2026): é renomeação.** "A antiga sessão reembolso irá se chamar
Liberação de Obra."

Executado apenas o que é **rótulo**. Três coisas mantiveram o nome antigo de
propósito, e nenhuma delas aparece para o usuário:

| O que | Por que não muda |
|---|---|
| `SCREENS.id = "reembolso"` | é a chave gravada em `membership.permissions`. Trocar o id órfãozaria **toda permissão já salva** |
| A rota `/reembolso` | o id da tela é, por convenção do arquivo, o primeiro segmento da rota — e link salvo pelo usuário continua abrindo |
| `rowKey === "Reembolso"` e a aba `Reembolso` do XLSX | são **valor de dado**: o rowKey está gravado em `budget_line`, e o nome da aba é o contrato com as planilhas que o cliente já tem. Renomear quebraria toda importação existente |

Fora do escopo por ora, para não conflitar com prompts que ainda vêm: os rótulos
em **Projeção** e **Consolidado** (telas que saem pelo Prompt AB) e em **Resumo
Executivo** (reorganizado pelo Prompt AE).

---

## B6-orig · texto original da pergunta

O mockup traz **Liberações de Obra** (`s10`, com a tela de cadastro `s15`) em
Receitas, e a Spec tem o **Prompt O · Liberações de Obra**, com a decisão
"liberação de obra é caixa, não receita".

Hoje existe `/reembolso`, com a tabela `reembolso`. Os dois podem ser a mesma
coisa com nome novo, ou coisas diferentes.

A diferença é material: se for renomeação, os dados existentes continuam e a
tela muda de rótulo; se for tela nova, `reembolso` precisa de destino próprio
(cai em B5). **Renomear a coisa errada é perder o vínculo de dado lançado.**

---

## B7 · O redesenho visual é transversal e não está no roteiro

O mockup não é ajuste de layout — é outra identidade visual:

| | Hoje | Mockup |
|---|---|---|
| Barra lateral | clara | **escura** (`--nav:#0F1B2E`) |
| Cor de marca | `--color-accent` | **`--brand:#2563EB`** |
| Fundo da página | `--color-surface` | **`--page:#F4F6FA`** |
| Tokens | `--color-ink/ink2/ink3/ink4` | `--ink/--ink-2/--ink-3` + famílias green/red/blue/lilac com `bg`/`line`/`tile` |
| Módulos do menu | 9, começando em Planejamento | **8, começando em Business Intelligence** |

O menu do mockup, que é o Prompt C:

```
Business Intelligence · Planejamento · Receitas · Despesas
Caixa · Obra · Pessoas · Configurações
```

O roteiro trata disso só na etapa 8 (Prompt C, barra lateral) e não menciona a
troca de paleta em lugar nenhum — mas ela alcança **todas as 41 telas**.

**Ponto a favor:** essa é a única frente grande que **não depende de nenhuma
decisão de negócio nem dos 42 prompts**. Os tokens e a estrutura do menu estão
inteiramente no mockup. É o que dá para fazer enquanto as respostas não chegam.

---

## O que já foi feito nesta sessão

As três tarefas que **os dois documentos** marcam como livres de qualquer
decisão pendente (Spec §13, Roteiro "O QUE PODE IR SOZINHO, HOJE"):

| Item | O que era | Onde |
|---|---|---|
| **AI, Parte 4** | `updateMemberName` atualizava `user` só pelo id. `user` é tabela global: um admin que soubesse o id renomeava usuário de **outra empresa**. A permissão `usuarios.editar` não protegia — ela é do tenant de quem edita, não do alvo | `src/lib/actions/users.ts` |
| **AK, Parte 2** | `houveMudanca` existia e nenhuma action usava. Salvar sem alterar nada gravava evento no log | `actions/despesas.ts`, `actions/empresa.ts`, `actions/projects.ts` |
| **AO, Parte 6** | Download do backup — um semestre inteiro de dados da empresa saindo num arquivo — não deixava rastro | `app/(app)/backup/download/route.ts` |

Nenhuma delas altera dado lançado, amplia acesso, muda número de relatório ou
exige migração. `updateProject` passou a registrar `de → para` (`diffAudit`) em
vez do valor novo solto; linhas antigas do `audit_log` não foram tocadas — a
tela de auditoria já lê os dois formatos.

---

## Recomendação de sequência

1. **Enviar os 42 prompts** (B1) — sem isso, 39 das 50 etapas ficam paradas.
2. **Responder B3, B5 e B6** — destravam o Bloco 0 e definem o que não pode
   sumir.
3. **Enquanto isso:** o redesenho visual (B7) — tokens do mockup e o menu de 8
   módulos —, que não depende de nenhuma resposta.
4. **Antes do Bloco 2:** o mecanismo de chave por tenant (B4).
