# CONTEXTO-REVISAO — inventário do Growth Construction

Levantamento do estado do código em `main` (commit `45f4ce3`), para servir de
base a uma revisão tela a tela.

Inventário: descreve o que existe, não o que deveria existir. Sem opinião e sem
sugestão de melhoria. Onde o código diverge do que o nome de uma coluna sugere,
o inventário registra o que o código faz.

| | |
|---|---|
| Arquivos em `src/app` | 68 — 53 `page.tsx`, 11 `route.ts`, 3 `layout.tsx`, 1 CSS |
| Páginas no grupo `(app)` (autenticado) | 48 |
| Tabelas | 44 |
| Colunas | 588 |
| Colunas de data/tempo | 84 |
| Migrações aplicadas | 40 (`0000`–`0039`) |
| Arquivos de teste | 35 |

---

## 1. Árvore de rotas (`src/app`)

Agrupada pelos route groups do App Router. O grupo `(app)` exige sessão e
resolve tenant/projeto/versão; `(auth)` é público; `plataforma` é o console de
super-admin; `api` não passa pelo layout autenticado.

### `(app)` — aplicação autenticada

| Rota | Arquivo | O que a página faz |
|---|---|---|
| `/acerto` | `(app)/acerto/page.tsx` | Acerto Contábil: um pagamento único quitando várias despesas, inclusive de obras diferentes; a diferença vai para despesa/receita financeira |
| `/acessos` | `(app)/acessos/page.tsx` | Matriz de permissões granulares por usuário — telas × ações (Ver/Criar/Editar/Excluir) |
| `/acoes` | `(app)/acoes/page.tsx` | Log de auditoria: eventos recentes, quem alterou o quê |
| `/backup` | `(app)/backup/page.tsx` | Backup & arquivamento por semestre |
| `/balancodia` | `(app)/balancodia/page.tsx` | Balanço do dia: fechamentos operacionais diários, filtráveis por período, obra e cliente |
| `/budget` | `(app)/budget/page.tsx` | Lançamento do Budget — renderiza `BudgetPlanningScreen` na versão `budget` |
| `/caixa` | `(app)/caixa/page.tsx` | Controle de Caixa: movimentação real do período, importação de extrato e conciliação |
| `/clientes` | `(app)/clientes/page.tsx` | Lista de clientes compradores |
| `/clientes/[id]` | `(app)/clientes/[id]/page.tsx` | Ficha de um cliente comprador |
| `/clientes/novo` | `(app)/clientes/novo/page.tsx` | Cadastro de novo cliente comprador |
| `/consolidado` | `(app)/consolidado/page.tsx` | Consolidado: comparativo de versões, total por fonte (reembolso incluído no total) |
| `/contabilidade` | `(app)/contabilidade/page.tsx` | Acesso Contabilidade: visão somente-leitura de balancetes e demonstrativos |
| `/contas` | `(app)/contas/page.tsx` | Contas correntes bancárias e saldo total |
| `/contaspagar` | `(app)/contaspagar/page.tsx` | Contas a pagar de todas as obras, com filtros e ordenação por cabeçalho |
| `/contasreceber` | `(app)/contasreceber/page.tsx` | Recebíveis das vendas (derivados do plano de pagamento) + contas a receber lançadas à mão |
| `/dashboard` | `(app)/dashboard/page.tsx` | Dashboard de indicadores físico-financeiros da obra |
| `/despesas` | `(app)/despesas/page.tsx` | Lançamentos de despesas: formulário, listagem e total |
| `/diagnostico/categorias-invertidas` | `(app)/diagnostico/categorias-invertidas/page.tsx` | Conferência: despesas com categoria de receita, sem categoria ou com valor zero. Somente leitura |
| `/diagnostico/planos-recebiveis` | `(app)/diagnostico/planos-recebiveis/page.tsx` | Conferência: planos com carência divergente ou dia de vencimento inexistente em algum mês |
| `/diagnosticoia` | `(app)/diagnosticoia/page.tsx` | Diagnóstico da configuração de IA |
| `/dre` | `(app)/dre/page.tsx` | DRE — demonstração de resultado por competência |
| `/empresa` | `(app)/empresa/page.tsx` | Identidade do tenant e cadastro fiscal do emitente |
| `/estoque` | `(app)/estoque/page.tsx` | Almoxarifado da obra: entrada e baixa, saldo, mínimo e vínculo à despesa ou permuta de origem |
| `/fechamento` | `(app)/fechamento/page.tsx` | Fechamento de caixa: contas a pagar do dia × receitas a receber do dia; pendências passam para o dia seguinte |
| `/fluxocaixa` | `(app)/fluxocaixa/page.tsx` | Fluxo de caixa mensal — Previsto (por vencimento) e Realizado (por liquidação) |
| `/forecast` | `(app)/forecast/page.tsx` | Lançamento do Forecast; também renderiza o comparativo Budget × Forecast |
| `/fornecedores` | `(app)/fornecedores/page.tsx` | Fornecedores & stakeholders — registro global do tenant |
| `/medicao` | `(app)/medicao/page.tsx` | Medição de obra, relatório CEF: orçado (Budget) × realizado (lançamento de medição) |
| `/medicaolanc` | `(app)/medicaolanc/page.tsx` | Lançamento de medição — alimenta o Custo Variável da DRE |
| `/numeracao` | `(app)/numeracao/page.tsx` | Sequência automática dos lançamentos: prefixo, dígitos e próximo número |
| `/parametros` | `(app)/parametros/page.tsx` | Tabela INCC por projeto — correção a partir da 5ª parcela |
| `/perfil` | `(app)/perfil/page.tsx` | Perfil do usuário logado |
| `/permuta` | `(app)/permuta/page.tsx` | Inventário de ativos recebidos em permuta |
| `/permuta/novo` | `(app)/permuta/novo/page.tsx` | Cadastro de ativo de permuta; VENDIDO gera receita na Projeção |
| `/planocontas` | `(app)/planocontas/page.tsx` | Plano de contas com dupla classificação: grupo CEF/obra + categoria DRE |
| `/ponto` | `(app)/ponto/page.tsx` | Ponto da obra: registro georreferenciado com validação de raio; a apuração gera conta a pagar |
| `/projecao` | `(app)/projecao/page.tsx` | Projeção de receitas por fonte, comparando versões |
| `/projeto` | `(app)/projeto/page.tsx` | Projetos & unidades, com seletor de projeto no topo |
| `/reembolso` | `(app)/reembolso/page.tsx` | Reembolsos — data real + serial automático |
| `/reembolso/novo` | `(app)/reembolso/novo/page.tsx` | Cadastro de reembolso |
| `/restituicoes` | `(app)/restituicoes/page.tsx` | Restituições de valores pagos por terceiro; a despesa entra 1× na DRE e o caixa sai só na restituição |
| `/resumo` | `(app)/resumo/page.tsx` | Resumo executivo: indicadores gerais por versão (valores contratados) |
| `/simulador` | `(app)/simulador/page.tsx` | Simulador de unidade: SAC/PRICE/SBPE, fluxo de 36 meses com correção INCC |
| `/unidades` | `(app)/unidades/page.tsx` | Unidades do empreendimento |
| `/unidades/[id]` | `(app)/unidades/[id]/page.tsx` | Edição de uma unidade |
| `/unidades/nova` | `(app)/unidades/nova/page.tsx` | Cadastro de nova unidade |
| `/usuarios` | `(app)/usuarios/page.tsx` | Membros do tenant e seus papéis |
| `/versao` | `(app)/versao/page.tsx` | Configuração da versão: nome, planilha modelo e importação de dados |

### `(app)` — route handlers (download/exportação)

| Rota | Arquivo | O que faz |
|---|---|---|
| `/backup/download` | `(app)/backup/download/route.ts` | ZIP do backup de um semestre (`?sem=YYYY-H1`): planilha do período + documentos. Não remove nada |
| `/lancamento/export` | `(app)/lancamento/export/route.ts` | Exporta o lançamento simplificado (receitas + despesas) de uma versão em `.xlsx` |
| `/versao/export` | `(app)/versao/export/route.ts` | Exporta os dados da versão em `.xlsx` |
| `/versao/template` | `(app)/versao/template/route.ts` | Download da planilha modelo `.xlsx` no formato padrão |

### `(auth)` — público

| Rota | Arquivo | O que faz |
|---|---|---|
| `/login` | `(auth)/login/page.tsx` | Login por e-mail e senha (Auth.js, provider de credenciais) |
| `/mfa` | `(auth)/mfa/page.tsx` | Segundo fator; redireciona conforme o estado da sessão |

### `plataforma` — console de super-admin

| Rota | Arquivo | O que faz |
|---|---|---|
| `/plataforma` | `plataforma/(console)/page.tsx` | Lista de contas (tenants): criação e visão geral da plataforma |
| `/plataforma/login` | `plataforma/login/page.tsx` | Login do super-admin da plataforma |

### `api` — endpoints

| Rota | Arquivo | O que faz |
|---|---|---|
| `/api/agent/contas-pagar` | `api/agent/contas-pagar/route.ts` | Leitura de contas a pagar para o agente de WhatsApp; `?hoje=1` responde no fuso de São Paulo |
| `/api/agent/contas-receber` | `api/agent/contas-receber/route.ts` | Recebíveis previstos, expandindo o plano de pagamento das unidades vendidas |
| `/api/agent/projetos` | `api/agent/projetos/route.ts` | Obras/projetos do tenant — rota de tradução de nome para id |
| `/api/agent/unidades` | `api/agent/unidades/route.ts` | Unidades do empreendimento; lê sempre a versão `atual`, nunca budget/forecast |
| `/api/agent/eco` | `api/agent/eco/route.ts` | Diagnóstico do agente; não retorna dado de negócio |
| `/api/auth/[...nextauth]` | `api/auth/[...nextauth]/route.ts` | Handler do Auth.js |
| `/api/health/r2` | `api/health/r2/route.ts` | Round-trip PUT→GET→DELETE no Cloudflare R2 para validar variáveis de ambiente |

### Layouts e auxiliares

| Arquivo | O que faz |
|---|---|
| `layout.tsx` | Layout raiz: fontes e providers |
| `page.tsx` | Landing pública |
| `(app)/layout.tsx` | Layout autenticado: redireciona sem sessão, monta sidebar e seletores de projeto/versão |
| `plataforma/(console)/layout.tsx` | Layout do console; redireciona quem não for super-admin |

---

## 2. Schema

44 tabelas. **Nenhum índice é declarado no `schema.ts`** — os índices existem
apenas no SQL das migrações, e é de lá que a lista abaixo foi extraída.

Convenções observadas em todo o schema:

- Chave primária: `uuid` com `defaultRandom()`.
- Dinheiro: `numeric(15,2)`. Não há coluna monetária em `real`/`double`.
- Datas de negócio: `text`, não `date`/`timestamp` (ver seção 3).
- `created_at`: `timestamp(mode: "date")` com `defaultNow()`.

Marcação de escopo em cada tabela: **tenant** = tem `tenant_id`;
**versão** = tem `version_id`; projeto = tem `project_id`.

**Resumo do escopo** — 39 das 44 tabelas têm `tenant_id`. As 5 sem:
`user`, `account`, `session`, `verificationToken` (tabelas do Auth.js) e
`tenant` (é a própria raiz).

As 8 tabelas com `version_id`, isto é, cujo dado pertence a um cenário
(`atual` / `budget` / `forecast`): `unit`, `permuta`, `reembolso`, `despesa`,
`medicao`, `cash_entry`, `budget_line`, `budget_account`.

### `user`

Escopo: global (sem tenant) — 8 colunas

| coluna | tipo | nulo | default | FK |
|---|---|---|---|---|
| `id` | text | não | PK |  |
| `name` | text | sim |  |  |
| `email` | text | sim |  |  |
| `emailVerified` | timestamp(date) | sim |  |  |
| `image` | text | sim |  |  |
| `password_hash` | text | sim |  |  |
| `mfa_secret` | text | sim |  |  |
| `mfa_enabled` | boolean | não | false |  |

Índices e constraints:

- `user_email_unique UNIQUE(email)`

### `account`

Escopo: global (sem tenant) — 11 colunas

| coluna | tipo | nulo | default | FK |
|---|---|---|---|---|
| `userId` | text | não |  | `user.id` ON DELETE cascade |
| `type` | text | não |  |  |
| `provider` | text | não |  |  |
| `providerAccountId` | text | não |  |  |
| `refresh_token` | text | sim |  |  |
| `access_token` | text | sim |  |  |
| `expires_at` | integer | sim |  |  |
| `token_type` | text | sim |  |  |
| `scope` | text | sim |  |  |
| `id_token` | text | sim |  |  |
| `session_state` | text | sim |  |  |

### `session`

Escopo: global (sem tenant) — 3 colunas

| coluna | tipo | nulo | default | FK |
|---|---|---|---|---|
| `sessionToken` | text | não | PK |  |
| `userId` | text | não |  | `user.id` ON DELETE cascade |
| `expires` | timestamp(date) | não |  |  |

### `verificationToken`

Escopo: global (sem tenant) — 3 colunas

| coluna | tipo | nulo | default | FK |
|---|---|---|---|---|
| `identifier` | text | não |  |  |
| `token` | text | não |  |  |
| `expires` | timestamp(date) | não |  |  |

### `tenant`

Escopo: global (sem tenant) — 25 colunas

| coluna | tipo | nulo | default | FK |
|---|---|---|---|---|
| `id` | uuid | não | random() · PK |  |
| `name` | text | não |  |  |
| `logo_key` | text | sim |  |  |
| `nome_fantasia` | text | sim |  |  |
| `cnpj` | text | sim |  |  |
| `inscricao_municipal` | text | sim |  |  |
| `inscricao_estadual` | text | sim |  |  |
| `regime_tributario` | text | sim |  |  |
| `regime_especial` | text | sim |  |  |
| `item_lista_servico` | text | sim |  |  |
| `codigo_tributario_municipio` | text | sim |  |  |
| `cnae` | text | sim |  |  |
| `aliquota_iss` | numeric(8,4) | sim |  |  |
| `logradouro` | text | sim |  |  |
| `numero_endereco` | text | sim |  |  |
| `complemento` | text | sim |  |  |
| `bairro` | text | sim |  |  |
| `codigo_municipio` | text | sim |  |  |
| `municipio` | text | sim |  |  |
| `uf` | text | sim |  |  |
| `cep` | text | sim |  |  |
| `telefone` | text | sim |  |  |
| `email_fiscal` | text | sim |  |  |
| `fiscal_ambiente` | text | não | "homologacao" |  |
| `created_at` | timestamp(date) | não | now() |  |

### `membership`

Escopo: **tenant** — 4 colunas

| coluna | tipo | nulo | default | FK |
|---|---|---|---|---|
| `user_id` | text | não |  | `user.id` ON DELETE cascade |
| `tenant_id` | uuid | não | "membro" | `tenant.id` ON DELETE cascade |
| `permissions` | jsonb | sim |  |  |
| `created_at` | timestamp(date) | não | now() |  |

### `project`

Escopo: **tenant** — 36 colunas

| coluna | tipo | nulo | default | FK |
|---|---|---|---|---|
| `id` | uuid | não | random() · PK |  |
| `tenant_id` | uuid | não |  | `tenant.id` ON DELETE cascade |
| `name` | text | não | "proj" |  |
| `duration_months` | integer | sim |  |  |
| `start_date` | text | sim |  |  |
| `end_date` | text | sim |  |  |
| `mes_inicial` | text | sim |  |  |
| `mes_final` | text | sim |  |  |
| `cliente_id` | uuid | sim |  | `cliente.id` ON DELETE set null |
| `custo_construcao` | numeric(15,2) | sim |  |  |
| `custo_terreno` | numeric(15,2) | sim |  |  |
| `valor_construcao` | numeric(15,2) | sim |  |  |
| `valor_terreno` | numeric(15,2) | sim |  |  |
| `forma_pagamento_terreno` | text | sim |  |  |
| `proprietario_terreno` | text | sim |  |  |
| `financiamento_construcao` | numeric(15,2) | sim |  |  |
| `financiamento_terreno` | numeric(15,2) | sim |  |  |
| `recursos_proprios` | numeric(15,2) | sim |  |  |
| `terreno_fora_caixa` | boolean | não | true |  |
| `endereco` | text | sim |  |  |
| `latitude` | numeric(10,7) | sim |  |  |
| `longitude` | numeric(10,7) | sim |  |  |
| `codigo_municipio_obra` | text | sim |  |  |
| `municipio_obra` | text | sim |  |  |
| `uf_obra` | text | sim |  |  |
| `codigo_obra` | text | sim |  |  |
| `art` | text | sim |  |  |
| `ponto_raio_metros` | integer | não | 100 |  |
| `cub` | numeric(15,2) | sim |  |  |
| `metragem` | numeric(12,2) | sim |  |  |
| `parcela_referencia` | numeric(15,2) | sim |  |  |
| `pct_bdi` | numeric(8,4) | sim |  |  |
| `tipo_executor` | text | sim |  |  |
| `pct_taxa_liberacao` | numeric(8,4) | sim |  |  |
| `tipo_obra` | text | sim |  |  |
| `created_at` | timestamp(date) | não | now() |  |

### `time_entry`

Escopo: **tenant** · projeto — 17 colunas

| coluna | tipo | nulo | default | FK |
|---|---|---|---|---|
| `id` | uuid | não | random() · PK |  |
| `tenant_id` | uuid | não |  | `tenant.id` ON DELETE cascade |
| `project_id` | uuid | não |  | `project.id` ON DELETE cascade |
| `user_id` | text | sim |  |  |
| `funcionario` | text | sim |  |  |
| `tipo` | text | não |  |  |
| `data` | text | não |  |  |
| `hora` | text | não |  |  |
| `server_at` | timestamp(date) | não | now() |  |
| `latitude` | numeric(10,7) | sim |  |  |
| `longitude` | numeric(10,7) | sim |  |  |
| `precisao_metros` | integer | sim |  |  |
| `distancia_metros` | integer | sim |  |  |
| `dentro_raio` | boolean | não | false |  |
| `dispositivo` | text | sim |  |  |
| `justificativa` | text | sim |  |  |
| `despesa_id` | uuid | sim |  | `despesa.id` ON DELETE set null |

### `version`

Escopo: **tenant** · projeto — 11 colunas

| coluna | tipo | nulo | default | FK |
|---|---|---|---|---|
| `id` | uuid | não | random() · PK |  |
| `project_id` | uuid | não |  | `project.id` ON DELETE cascade |
| `tenant_id` | uuid | não |  | `tenant.id` ON DELETE cascade |
| `key` | text | não |  |  |
| `label` | text | não |  |  |
| `color` | text | não |  |  |
| `is_default` | boolean | não | false |  |
| `locked` | boolean | não | false |  |
| `status` | text | não | "Rascunho" |  |
| `source_version_id` | uuid | sim |  | `version.id` ON DELETE set null |
| `created_at` | timestamp(date) | não | now() |  |

Índices e constraints:

- `version_project_key_uq UNIQUE(project_id, key)`

### `unit`

Escopo: **tenant** · **versão** — 13 colunas

| coluna | tipo | nulo | default | FK |
|---|---|---|---|---|
| `id` | uuid | não | random() · PK |  |
| `version_id` | uuid | não |  | `version.id` ON DELETE cascade |
| `tenant_id` | uuid | não |  | `tenant.id` ON DELETE cascade |
| `code` | text | não |  |  |
| `bloco` | text | sim |  |  |
| `tipo` | text | sim |  |  |
| `m2` | numeric(8,2) | sim |  |  |
| `andar` | integer | sim |  |  |
| `valor` | numeric(15,2) | não | "0" |  |
| `mes_venda` | text | sim |  |  |
| `payment_plan` | jsonb | sim |  |  |
| `created_at` | timestamp(date) | não | now() |  |
| `updated_at` | timestamp(date) | não | now() |  |

### `permuta`

Escopo: **tenant** · **versão** — 18 colunas

| coluna | tipo | nulo | default | FK |
|---|---|---|---|---|
| `id` | uuid | não | random() · PK |  |
| `version_id` | uuid | não |  | `version.id` ON DELETE cascade |
| `tenant_id` | uuid | não |  | `tenant.id` ON DELETE cascade |
| `unit_code` | text | sim |  |  |
| `cliente` | text | sim |  |  |
| `data_recebimento` | text | sim |  |  |
| `tipo` | text | sim |  |  |
| `descricao` | text | sim |  |  |
| `estimado` | numeric(15,2) | sim |  |  |
| `status` | text | sim |  |  |
| `data_venda` | text | sim |  |  |
| `valor_venda` | numeric(15,2) | sim |  |  |
| `tipo_permuta` | text | sim |  |  |
| `forma_venda` | text | sim |  |  |
| `parcelas` | integer | sim |  |  |
| `periodicidade` | text | sim |  |  |
| `data_prim_parcela` | text | sim |  |  |
| `obs` | text | sim |  |  |

### `reembolso`

Escopo: **tenant** · **versão** — 10 colunas

| coluna | tipo | nulo | default | FK |
|---|---|---|---|---|
| `id` | uuid | não | random() · PK |  |
| `version_id` | uuid | não |  | `version.id` ON DELETE cascade |
| `tenant_id` | uuid | não |  | `tenant.id` ON DELETE cascade |
| `data` | text | sim |  |  |
| `origem` | text | sim |  |  |
| `valor` | numeric(15,2) | sim |  |  |
| `pct` | text | sim |  |  |
| `obs` | text | sim |  |  |
| `serial` | integer | sim |  |  |
| `status` | text | sim |  |  |

### `stakeholder`

Escopo: **tenant** — 20 colunas

| coluna | tipo | nulo | default | FK |
|---|---|---|---|---|
| `id` | uuid | não | random() · PK |  |
| `tenant_id` | uuid | não |  | `tenant.id` ON DELETE cascade |
| `nome` | text | não | "PJ" |  |
| `doc` | text | sim |  |  |
| `papeis` | text | não | [] |  |
| `email` | text | sim |  |  |
| `tel` | text | sim |  |  |
| `obs` | text | sim |  |  |
| `nome_fantasia` | text | sim |  |  |
| `contato` | text | sim |  |  |
| `whatsapp` | text | sim |  |  |
| `site` | text | sim |  |  |
| `endereco` | text | sim |  |  |
| `numero` | text | sim |  |  |
| `complemento` | text | sim |  |  |
| `bairro` | text | sim |  |  |
| `cidade` | text | sim |  |  |
| `estado` | text | sim |  |  |
| `cep` | text | sim |  |  |
| `ativo` | boolean | não | true |  |

### `bank_account`

Escopo: **tenant** — 10 colunas

| coluna | tipo | nulo | default | FK |
|---|---|---|---|---|
| `id` | uuid | não | random() · PK |  |
| `tenant_id` | uuid | não |  | `tenant.id` ON DELETE cascade |
| `banco` | text | não |  |  |
| `ag` | text | sim |  |  |
| `op` | text | sim |  |  |
| `cc` | text | não | "Construtora" |  |
| `saldo` | numeric(15,2) | não | "0" |  |
| `saldo_source` | text | não | "manual" |  |
| `open_finance_id` | text | sim |  |  |
| `last_sync` | timestamp(date) | sim |  |  |

### `chart_account`

Escopo: **tenant** — 8 colunas

| coluna | tipo | nulo | default | FK |
|---|---|---|---|---|
| `id` | uuid | não | random() · PK |  |
| `tenant_id` | uuid | não |  | `tenant.id` ON DELETE cascade |
| `code` | text | não |  |  |
| `name` | text | não |  |  |
| `group_code` | text | não |  |  |
| `group_name` | text | não |  |  |
| `natureza` | text | não | "despesa" |  |
| `ativo` | boolean | não | true |  |

Índices e constraints:

- `chart_account_tenant_code_uq UNIQUE(tenant_id, code)`

### `despesa`

Escopo: **tenant** · **versão** — 35 colunas

| coluna | tipo | nulo | default | FK |
|---|---|---|---|---|
| `id` | uuid | não | random() · PK |  |
| `version_id` | uuid | não |  | `version.id` ON DELETE cascade |
| `tenant_id` | uuid | não |  | `tenant.id` ON DELETE cascade |
| `num_doc` | text | sim |  |  |
| `fornecedor_id` | uuid | sim |  | `stakeholder.id` ON DELETE set null |
| `banco_id` | uuid | sim |  | `bank_account.id` ON DELETE set null |
| `conta_cef` | text | sim |  |  |
| `competencia` | text | sim |  |  |
| `vencimento` | text | sim |  |  |
| `data_caixa` | text | sim |  |  |
| `valor` | numeric(15,2) | não | "0" |  |
| `status` | text | sim |  |  |
| `obs` | text | sim |  |  |
| `forma_pagamento` | text | sim |  |  |
| `forma_pagamento_desc` | text | sim |  |  |
| `condicao_pagamento` | text | sim |  |  |
| `qtd_parcelas` | integer | sim |  |  |
| `data_emissao` | text | sim |  |  |
| `boleto_linha_digitavel` | text | sim |  |  |
| `boleto_codigo_barras` | text | sim |  |  |
| `boleto_banco` | text | sim |  |  |
| `cheque_numero` | text | sim |  |  |
| `cheque_banco` | text | sim |  |  |
| `cheque_ag` | text | sim |  |  |
| `cheque_conta` | text | sim |  |  |
| `cheque_emitente` | text | sim |  |  |
| `cheque_data_emissao` | text | sim |  |  |
| `cheque_data_compensacao` | text | sim |  |  |
| `cheque_status` | text | sim |  |  |
| `pago_por_terceiro` | boolean | não | false |  |
| `cancelado` | boolean | não | false |  |
| `cancelado_em` | text | sim |  |  |
| `cancelado_por` | text | sim |  |  |
| `motivo_cancelamento` | text | sim |  |  |
| `created_at` | timestamp(date) | não | now() |  |

### `despesa_terceiro`

Escopo: **tenant** — 13 colunas

| coluna | tipo | nulo | default | FK |
|---|---|---|---|---|
| `id` | uuid | não | random() · PK |  |
| `tenant_id` | uuid | não |  | `tenant.id` ON DELETE cascade |
| `despesa_id` | uuid | não |  | `despesa.id` ON DELETE cascade |
| `pagador_terceiro_id` | uuid | sim |  | `stakeholder.id` ON DELETE set null |
| `empresa_responsavel_id` | uuid | sim |  | `project.id` ON DELETE set null |
| `valor_total` | numeric(15,2) | não | "0" |  |
| `valor_restituido` | numeric(15,2) | não | "0" |  |
| `data_pagamento_original` | text | sim |  |  |
| `data_prevista_restituicao` | text | sim |  |  |
| `status` | text | não | "Aguardando restituição" |  |
| `obs` | text | sim |  |  |
| `idempotency_key` | text | sim |  |  |
| `created_at` | timestamp(date) | não | now() |  |

Índices e constraints:

- `despesa_terceiro_idem_uq` — UNIQUE INDEX ("tenant_id", "idempotency_key") WHERE "idempotency_key" IS NOT NULL · mig 0034
- `despesa_terceiro_despesa_ativa_uq` — UNIQUE INDEX ("despesa_id") WHERE status <> 'Cancelado' · mig 0034

### `restituicao`

Escopo: **tenant** — 12 colunas

| coluna | tipo | nulo | default | FK |
|---|---|---|---|---|
| `id` | uuid | não | random() · PK |  |
| `tenant_id` | uuid | não |  | `tenant.id` ON DELETE cascade |
| `despesa_terceiro_id` | uuid | não |  | `despesa_terceiro.id` ON DELETE cascade |
| `valor` | numeric(15,2) | não | "0" |  |
| `data_restituicao` | text | sim |  |  |
| `bank_account_id` | uuid | sim |  | `bank_account.id` ON DELETE set null |
| `comprovante` | text | sim |  |  |
| `obs` | text | sim |  |  |
| `cash_entry_id` | uuid | sim |  | `cash_entry.id` ON DELETE set null |
| `idempotency_key` | text | sim |  |  |
| `usuario_id` | text | sim |  | `user.id` ON DELETE set null |
| `created_at` | timestamp(date) | não | now() |  |

Índices e constraints:

- `restituicao_idem_uq` — UNIQUE INDEX ("tenant_id", "idempotency_key") WHERE "idempotency_key" IS NOT NULL · mig 0034

### `documento_fiscal`

Escopo: **tenant** — 9 colunas

| coluna | tipo | nulo | default | FK |
|---|---|---|---|---|
| `id` | uuid | não | random() · PK |  |
| `tenant_id` | uuid | não |  | `tenant.id` ON DELETE cascade |
| `despesa_id` | uuid | não |  | `despesa.id` ON DELETE cascade |
| `tipo` | text | não | "SEM_DOC" |  |
| `numero` | text | sim |  |  |
| `serie` | text | sim |  |  |
| `chave_acesso` | text | sim |  |  |
| `data_emissao` | text | sim |  |  |
| `created_at` | timestamp(date) | não | now() |  |

Índices e constraints:

- `documento_fiscal_despesa_idx` — INDEX ("despesa_id") · mig 0035
- `documento_fiscal_busca_idx` — INDEX ("tenant_id", "tipo", "serie", "numero") · mig 0035

### `recebimento_terceiro`

Escopo: **tenant** · projeto — 15 colunas

| coluna | tipo | nulo | default | FK |
|---|---|---|---|---|
| `id` | uuid | não | random() · PK |  |
| `tenant_id` | uuid | não |  | `tenant.id` ON DELETE cascade |
| `recebedor_terceiro_id` | uuid | sim |  | `stakeholder.id` ON DELETE set null |
| `project_id` | uuid | sim |  | `project.id` ON DELETE set null |
| `conta_receber_id` | uuid | sim |  | `conta_receber.id` ON DELETE set null |
| `cliente_id` | uuid | sim |  | `cliente.id` ON DELETE set null |
| `unit_code` | text | sim |  |  |
| `valor_total` | numeric(15,2) | não | "0" |  |
| `valor_repassado` | numeric(15,2) | não | "0" |  |
| `data_recebimento` | text | sim |  |  |
| `data_prevista_repasse` | text | sim |  |  |
| `status` | text | não | "Aguardando repasse" |  |
| `obs` | text | sim |  |  |
| `idempotency_key` | text | sim |  |  |
| `created_at` | timestamp(date) | não | now() |  |

Índices e constraints:

- `recebimento_terceiro_idem_uq` — UNIQUE INDEX ("tenant_id", "idempotency_key") WHERE "idempotency_key" IS NOT NULL · mig 0035
- `recebimento_terceiro_saldo_idx` — INDEX ("tenant_id", "recebedor_terceiro_id", "status") · mig 0035

### `repasse`

Escopo: **tenant** — 12 colunas

| coluna | tipo | nulo | default | FK |
|---|---|---|---|---|
| `id` | uuid | não | random() · PK |  |
| `tenant_id` | uuid | não |  | `tenant.id` ON DELETE cascade |
| `recebimento_terceiro_id` | uuid | não |  | `recebimento_terceiro.id` ON DELETE cascade |
| `valor` | numeric(15,2) | não | "0" |  |
| `data_repasse` | text | sim |  |  |
| `bank_account_id` | uuid | sim |  | `bank_account.id` ON DELETE set null |
| `cash_entry_id` | uuid | sim |  | `cash_entry.id` ON DELETE set null |
| `comprovante` | text | sim |  |  |
| `obs` | text | sim |  |  |
| `idempotency_key` | text | sim |  |  |
| `usuario_id` | text | sim |  | `user.id` ON DELETE set null |
| `created_at` | timestamp(date) | não | now() |  |

Índices e constraints:

- `repasse_idem_uq` — UNIQUE INDEX ("tenant_id", "idempotency_key") WHERE "idempotency_key" IS NOT NULL · mig 0035
- `repasse_cash_entry_uq` — UNIQUE INDEX ("cash_entry_id") WHERE "cash_entry_id" IS NOT NULL · mig 0035

### `acerto`

Escopo: **tenant** — 20 colunas

| coluna | tipo | nulo | default | FK |
|---|---|---|---|---|
| `id` | uuid | não | random() · PK |  |
| `tenant_id` | uuid | não |  | `tenant.id` ON DELETE cascade |
| `num_doc` | text | sim |  |  |
| `data_pagamento` | text | sim |  |  |
| `bank_account_id` | uuid | sim |  | `bank_account.id` ON DELETE set null |
| `valor_transferido` | numeric(15,2) | não | "0" |  |
| `forma_pagamento` | text | sim |  |  |
| `favorecido_id` | uuid | sim |  | `stakeholder.id` ON DELETE set null |
| `comprovante_document_id` | uuid | sim |  | `document.id` ON DELETE set null |
| `diferenca_valor` | numeric(15,2) | não | "0" |  |
| `diferenca_tipo` | text | não | "NENHUMA" |  |
| `diferenca_despesa_id` | uuid | sim |  | `despesa.id` ON DELETE set null |
| `cash_entry_id` | uuid | sim |  | `cash_entry.id` ON DELETE set null |
| `obs` | text | sim |  |  |
| `estornado` | boolean | não | false |  |
| `estornado_em` | text | sim |  |  |
| `estornado_por` | text | sim |  |  |
| `idempotency_key` | text | sim |  |  |
| `usuario_id` | text | sim |  | `user.id` ON DELETE set null |
| `created_at` | timestamp(date) | não | now() |  |

Índices e constraints:

- `acerto_idem_uq` — UNIQUE INDEX ("tenant_id", "idempotency_key") WHERE "idempotency_key" IS NOT NULL · mig 0037
- `acerto_periodo_idx` — INDEX ("tenant_id", "data_pagamento") · mig 0037

### `acerto_item`

Escopo: **tenant** — 7 colunas

| coluna | tipo | nulo | default | FK |
|---|---|---|---|---|
| `id` | uuid | não | random() · PK |  |
| `tenant_id` | uuid | não |  | `tenant.id` ON DELETE cascade |
| `acerto_id` | uuid | não |  | `acerto.id` ON DELETE cascade |
| `despesa_id` | uuid | não |  | `despesa.id` ON DELETE cascade |
| `valor_abatido` | numeric(15,2) | não | "0" |  |
| `status_anterior` | text | sim |  |  |
| `created_at` | timestamp(date) | não | now() |  |

Índices e constraints:

- `acerto_item_uq` — UNIQUE INDEX ("acerto_id", "despesa_id") · mig 0037
- `acerto_item_despesa_idx` — INDEX ("despesa_id") · mig 0037

### `rateio_obra`

Escopo: **tenant** · projeto — 10 colunas

| coluna | tipo | nulo | default | FK |
|---|---|---|---|---|
| `id` | uuid | não | random() · PK |  |
| `tenant_id` | uuid | não |  | `tenant.id` ON DELETE cascade |
| `acerto_id` | uuid | sim |  | `acerto.id` ON DELETE cascade |
| `project_id` | uuid | sim |  | `project.id` ON DELETE set null |
| `despesa_id` | uuid | sim |  | `despesa.id` ON DELETE set null |
| `valor` | numeric(15,2) | não | "0" |  |
| `percentual` | numeric(9,4) | não | "0" |  |
| `base_rateio` | text | sim |  |  |
| `memoria_calculo` | jsonb | sim |  |  |
| `created_at` | timestamp(date) | não | now() |  |

Índices e constraints:

- `rateio_obra_projeto_idx` — INDEX ("tenant_id", "project_id") · mig 0037

### `restituicao_item`

Escopo: **tenant** — 6 colunas

| coluna | tipo | nulo | default | FK |
|---|---|---|---|---|
| `id` | uuid | não | random() · PK |  |
| `tenant_id` | uuid | não |  | `tenant.id` ON DELETE cascade |
| `restituicao_id` | uuid | não |  | `restituicao.id` ON DELETE cascade |
| `despesa_terceiro_id` | uuid | não |  | `despesa_terceiro.id` ON DELETE cascade |
| `valor_abatido` | numeric(15,2) | não | "0" |  |
| `created_at` | timestamp(date) | não | now() |  |

Índices e constraints:

- `restituicao_item_uq` — UNIQUE INDEX ("restituicao_id", "despesa_terceiro_id") · mig 0037
- `restituicao_item_origem_idx` — INDEX ("despesa_terceiro_id") · mig 0037

### `compensacao`

Escopo: **tenant** — 12 colunas

| coluna | tipo | nulo | default | FK |
|---|---|---|---|---|
| `id` | uuid | não | random() · PK |  |
| `tenant_id` | uuid | não |  | `tenant.id` ON DELETE cascade |
| `num_doc` | text | sim |  |  |
| `terceiro_id` | uuid | sim |  | `stakeholder.id` ON DELETE set null |
| `valor` | numeric(15,2) | não | "0" |  |
| `data` | text | sim |  |  |
| `saldo_restituir_antes` | numeric(15,2) | não | "0" |  |
| `saldo_repassar_antes` | numeric(15,2) | não | "0" |  |
| `obs` | text | sim |  |  |
| `idempotency_key` | text | sim |  |  |
| `usuario_id` | text | sim |  | `user.id` ON DELETE set null |
| `created_at` | timestamp(date) | não | now() |  |

Índices e constraints:

- `compensacao_idem_uq` — UNIQUE INDEX ("tenant_id", "idempotency_key") WHERE "idempotency_key" IS NOT NULL · mig 0037

### `despesa_parcela`

Escopo: **tenant** — 21 colunas

| coluna | tipo | nulo | default | FK |
|---|---|---|---|---|
| `id` | uuid | não | random() · PK |  |
| `tenant_id` | uuid | não |  | `tenant.id` ON DELETE cascade |
| `despesa_id` | uuid | não |  | `despesa.id` ON DELETE cascade |
| `numero_parcela` | integer | não |  |  |
| `vencimento` | text | sim |  |  |
| `valor_original` | numeric(15,2) | não | "0" |  |
| `valor_pago` | numeric(15,2) | não | "0" |  |
| `multa` | numeric(15,2) | não | "0" |  |
| `juros` | numeric(15,2) | não | "0" |  |
| `desconto` | numeric(15,2) | não | "0" |  |
| `outros_acrescimos` | numeric(15,2) | não | "0" |  |
| `data_pagamento` | text | sim |  |  |
| `forma_pagamento` | text | sim |  |  |
| `bank_account_id` | uuid | sim |  | `bank_account.id` ON DELETE set null |
| `status` | text | não | "Pendente" |  |
| `obs` | text | sim |  |  |
| `numero_cheque` | text | sim |  |  |
| `emitente_cheque` | text | sim |  |  |
| `data_emissao_cheque` | text | sim |  |  |
| `data_bom_para` | text | sim |  |  |
| `created_at` | timestamp(date) | não | now() |  |

Índices e constraints:

- `despesa_parcela_uq UNIQUE(despesa_id, numero_parcela)`
- `despesa_parcela_cheque_idx` — INDEX ("tenant_id", "bank_account_id", "numero_cheque") WHERE "numero_cheque" IS NOT NULL · mig 0038

### `pagamento`

Escopo: **tenant** — 16 colunas

| coluna | tipo | nulo | default | FK |
|---|---|---|---|---|
| `id` | uuid | não | random() · PK |  |
| `tenant_id` | uuid | não |  | `tenant.id` ON DELETE cascade |
| `parcela_id` | uuid | sim |  | `despesa_parcela.id` ON DELETE cascade |
| `despesa_id` | uuid | sim |  | `despesa.id` ON DELETE cascade |
| `valor_original` | numeric(15,2) | não | "0" |  |
| `desconto` | numeric(15,2) | não | "0" |  |
| `multa` | numeric(15,2) | não | "0" |  |
| `juros` | numeric(15,2) | não | "0" |  |
| `outros_acrescimos` | numeric(15,2) | não | "0" |  |
| `valor_total_pago` | numeric(15,2) | não | "0" |  |
| `data_pagamento` | text | sim |  |  |
| `bank_account_id` | uuid | sim |  | `bank_account.id` ON DELETE set null |
| `categoria_encargos` | text | não | "Despesas Financeiras" |  |
| `obs` | text | sim |  |  |
| `usuario_id` | text | sim |  | `user.id` ON DELETE set null |
| `created_at` | timestamp(date) | não | now() |  |

### `document`

Escopo: **tenant** · projeto — 16 colunas

| coluna | tipo | nulo | default | FK |
|---|---|---|---|---|
| `id` | uuid | não | random() · PK |  |
| `tenant_id` | uuid | não |  | `tenant.id` ON DELETE cascade |
| `despesa_id` | uuid | sim |  | `despesa.id` ON DELETE cascade |
| `cliente_id` | uuid | sim |  | `cliente.id` ON DELETE cascade |
| `stakeholder_id` | uuid | sim |  | `stakeholder.id` ON DELETE cascade |
| `unit_code` | text | sim |  |  |
| `project_id` | uuid | sim |  | `project.id` ON DELETE set null |
| `storage_key` | text | não |  |  |
| `filename` | text | não |  |  |
| `content_type` | text | sim |  |  |
| `size` | integer | sim |  |  |
| `tipo` | text | sim |  |  |
| `numero_documento_fiscal` | text | sim |  |  |
| `versao` | integer | não | 1 |  |
| `uploaded_by` | text | sim |  |  |
| `uploaded_at` | timestamp(date) | não | now() |  |

Índices e constraints:

- `document_num_fiscal_idx` — INDEX ("tenant_id", "numero_documento_fiscal") · mig 0035

### `servico`

Escopo: **tenant** · projeto — 9 colunas

| coluna | tipo | nulo | default | FK |
|---|---|---|---|---|
| `id` | uuid | não | random() · PK |  |
| `tenant_id` | uuid | não |  | `tenant.id` ON DELETE cascade |
| `project_id` | uuid | não |  | `project.id` ON DELETE cascade |
| `ordem` | integer | não | 0 |  |
| `nome` | text | não |  |  |
| `custo_proposto` | numeric(15,2) | não | "0" |  |
| `limite_min` | numeric(8,4) | sim |  |  |
| `limite_max` | numeric(8,4) | sim |  |  |
| `created_at` | timestamp(date) | não | now() |  |

### `medicao_servico`

Escopo: **tenant** — 7 colunas

| coluna | tipo | nulo | default | FK |
|---|---|---|---|---|
| `id` | uuid | não | random() · PK |  |
| `tenant_id` | uuid | não |  | `tenant.id` ON DELETE cascade |
| `servico_id` | uuid | não |  | `servico.id` ON DELETE cascade |
| `competencia` | text | não |  |  |
| `pct_executado_acum` | numeric(8,4) | não | "0" |  |
| `obs` | text | sim |  |  |
| `created_at` | timestamp(date) | não | now() |  |

### `medicao`

Escopo: **tenant** · **versão** — 9 colunas

| coluna | tipo | nulo | default | FK |
|---|---|---|---|---|
| `id` | uuid | não | random() · PK |  |
| `version_id` | uuid | não |  | `version.id` ON DELETE cascade |
| `tenant_id` | uuid | não |  | `tenant.id` ON DELETE cascade |
| `competencia` | text | não |  |  |
| `grupo_code` | text | não |  |  |
| `grupo_name` | text | não |  |  |
| `valor` | numeric(15,2) | não | "0" |  |
| `obs` | text | sim |  |  |
| `created_at` | timestamp(date) | não | now() |  |

### `cliente`

Escopo: **tenant** — 39 colunas

| coluna | tipo | nulo | default | FK |
|---|---|---|---|---|
| `id` | uuid | não | random() · PK |  |
| `tenant_id` | uuid | não |  | `tenant.id` ON DELETE cascade |
| `unit_code` | text | sim |  |  |
| `status_contrato` | text | sim |  |  |
| `nome_completo` | text | não |  |  |
| `cpf_cnpj` | text | sim |  |  |
| `nascimento` | text | sim |  |  |
| `nacionalidade` | text | sim |  |  |
| `estado_civil` | text | sim |  |  |
| `endereco` | text | sim |  |  |
| `cidade_estado` | text | sim |  |  |
| `cep` | text | sim |  |  |
| `email_principal` | text | sim |  |  |
| `email_secundario` | text | sim |  |  |
| `celular` | text | sim |  |  |
| `telefone` | text | sim |  |  |
| `banco_financ` | text | sim |  |  |
| `renda_bruta` | numeric(15,2) | sim |  |  |
| `renda_liquida` | numeric(15,2) | sim |  |  |
| `comprometimento` | text | sim |  |  |
| `possui_fgts` | text | sim |  |  |
| `saldo_fgts` | numeric(15,2) | sim |  |  |
| `score_credito` | integer | sim |  |  |
| `restricoes` | text | sim |  |  |
| `morar_ou_investir` | text | sim |  |  |
| `ramo_atividade` | text | sim |  |  |
| `cargo_funcao` | text | sim |  |  |
| `area_atuacao` | text | sim |  |  |
| `empresa` | text | sim |  |  |
| `regime_trabalho` | text | sim |  |  |
| `local_trabalho` | text | sim |  |  |
| `tempo_empresa` | text | sim |  |  |
| `possui_imovel` | text | sim |  |  |
| `motivacao_compra` | text | sim |  |  |
| `como_conheceu` | text | sim |  |  |
| `indicado_por` | text | sim |  |  |
| `interesse` | integer | sim |  |  |
| `obs_estrategicas` | text | sim |  |  |
| `created_at` | timestamp(date) | não | now() |  |

### `cash_entry`

Escopo: **tenant** · **versão** — 16 colunas

| coluna | tipo | nulo | default | FK |
|---|---|---|---|---|
| `id` | uuid | não | random() · PK |  |
| `version_id` | uuid | não |  | `version.id` ON DELETE cascade |
| `tenant_id` | uuid | não |  | `tenant.id` ON DELETE cascade |
| `bank_account_id` | uuid | sim |  | `bank_account.id` ON DELETE set null |
| `data` | text | sim |  |  |
| `descricao` | text | sim |  |  |
| `valor` | numeric(15,2) | não | "0" |  |
| `cat` | text | sim |  |  |
| `unit_code` | text | sim |  |  |
| `doc` | text | sim |  |  |
| `import_hash` | text | sim |  |  |
| `rec` | boolean | não | false |  |
| `conciliado_despesa_id` | uuid | sim |  | `despesa.id` ON DELETE set null |
| `conciliado_conta_receber_id` | uuid | sim |  |  |
| `conciliado_por` | text | sim |  |  |
| `conciliado_em` | text | sim |  |  |

### `conta_receber`

Escopo: **tenant** · projeto — 17 colunas

| coluna | tipo | nulo | default | FK |
|---|---|---|---|---|
| `id` | uuid | não | random() · PK |  |
| `tenant_id` | uuid | não |  | `tenant.id` ON DELETE cascade |
| `project_id` | uuid | não |  | `project.id` ON DELETE cascade |
| `unit_code` | text | sim |  |  |
| `cliente_id` | uuid | sim |  | `cliente.id` ON DELETE set null |
| `descricao` | text | sim |  |  |
| `tipo` | text | não | "Outros" |  |
| `valor` | numeric(15,2) | não | "0" |  |
| `vencimento` | text | sim |  |  |
| `data_recebimento` | text | sim |  |  |
| `valor_recebido` | numeric(15,2) | não | "0" |  |
| `status` | text | não | "A receber" |  |
| `banco_id` | uuid | sim |  | `bank_account.id` ON DELETE set null |
| `origem_cash_entry_id` | uuid | sim |  | `cash_entry.id` ON DELETE set null |
| `cancelado` | boolean | não | false |  |
| `created_by` | text | sim |  |  |
| `created_at` | timestamp(date) | não | now() |  |

### `incc_rate`

Escopo: **tenant** · projeto — 8 colunas

| coluna | tipo | nulo | default | FK |
|---|---|---|---|---|
| `id` | uuid | não | random() · PK |  |
| `project_id` | uuid | não |  | `project.id` ON DELETE cascade |
| `tenant_id` | uuid | não |  | `tenant.id` ON DELETE cascade |
| `mes` | text | não |  |  |
| `monthly` | numeric(8,4) | não |  |  |
| `accumulated` | numeric(8,4) | não |  |  |
| `ordem` | integer | não |  |  |
| `projected` | boolean | não | false |  |

Índices e constraints:

- `incc_project_mes_uq UNIQUE(project_id, mes)`

### `audit_log`

Escopo: **tenant** — 8 colunas

| coluna | tipo | nulo | default | FK |
|---|---|---|---|---|
| `id` | uuid | não | random() · PK |  |
| `tenant_id` | uuid | não |  | `tenant.id` ON DELETE cascade |
| `user_id` | text | sim |  | `user.id` ON DELETE set null |
| `action` | text | não |  |  |
| `entity` | text | não |  |  |
| `entity_id` | text | sim |  |  |
| `meta` | jsonb | sim |  |  |
| `created_at` | timestamp(date) | não | now() |  |

### `number_sequence`

Escopo: **tenant** — 9 colunas

| coluna | tipo | nulo | default | FK |
|---|---|---|---|---|
| `id` | uuid | não | random() · PK |  |
| `tenant_id` | uuid | não |  | `tenant.id` ON DELETE cascade |
| `entity` | text | não | "despesa" |  |
| `prefix` | text | não | "PED" |  |
| `use_prefix` | boolean | não | true |  |
| `digits` | integer | não | 6 |  |
| `next_number` | bigint | não | 1 |  |
| `active` | boolean | não | true |  |
| `updated_at` | timestamp(date) | não | now() |  |

Índices e constraints:

- `number_sequence_tenant_entity_uq UNIQUE(tenant_id, entity)`

### `budget_line`

Escopo: **tenant** · **versão** — 9 colunas

| coluna | tipo | nulo | default | FK |
|---|---|---|---|---|
| `id` | uuid | não | random() · PK |  |
| `tenant_id` | uuid | não |  | `tenant.id` ON DELETE cascade |
| `version_id` | uuid | não |  | `version.id` ON DELETE cascade |
| `kind` | text | não |  |  |
| `row_key` | text | não |  |  |
| `dre_category` | text | sim |  |  |
| `mes` | text | não |  |  |
| `valor` | numeric(15,2) | não | "0" |  |
| `pct` | numeric(7,4) | sim |  |  |

Índices e constraints:

- `budget_line_uq UNIQUE(version_id, kind, row_key, mes)`

### `budget_account`

Escopo: **tenant** · **versão** — 7 colunas

| coluna | tipo | nulo | default | FK |
|---|---|---|---|---|
| `id` | uuid | não | random() · PK |  |
| `tenant_id` | uuid | não |  | `tenant.id` ON DELETE cascade |
| `version_id` | uuid | não |  | `version.id` ON DELETE cascade |
| `kind` | text | não |  |  |
| `row_key` | text | não |  |  |
| `dre_category` | text | sim |  |  |
| `total` | numeric(15,2) | não | "0" |  |

Índices e constraints:

- `budget_account_uq UNIQUE(version_id, kind, row_key)`

### `daily_closing`

Escopo: **tenant** · projeto — 13 colunas

| coluna | tipo | nulo | default | FK |
|---|---|---|---|---|
| `id` | uuid | não | random() · PK |  |
| `tenant_id` | uuid | não |  | `tenant.id` ON DELETE cascade |
| `project_id` | uuid | sim |  | `project.id` ON DELETE set null |
| `dia` | text | não |  |  |
| `saldo_inicial` | numeric(15,2) | não | "0" |  |
| `total_entradas` | numeric(15,2) | não | "0" |  |
| `total_saidas` | numeric(15,2) | não | "0" |  |
| `saldo_final` | numeric(15,2) | não | "0" |  |
| `divergencias` | numeric(15,2) | não | "0" |  |
| `responsavel_id` | text | sim |  | `user.id` ON DELETE set null |
| `responsavel_nome` | text | sim |  |  |
| `obs` | text | sim |  |  |
| `closed_at` | timestamp(date) | não | now() |  |

### `carry_over`

Escopo: **tenant** — 11 colunas

| coluna | tipo | nulo | default | FK |
|---|---|---|---|---|
| `id` | uuid | não | random() · PK |  |
| `tenant_id` | uuid | não |  | `tenant.id` ON DELETE cascade |
| `closing_id` | uuid | sim |  | `daily_closing.id` ON DELETE cascade |
| `tipo` | text | não |  |  |
| `ref_id` | text | sim |  |  |
| `descricao` | text | sim |  |  |
| `valor` | numeric(15,2) | não | "0" |  |
| `vencimento` | text | sim |  |  |
| `from_dia` | text | não |  |  |
| `to_dia` | text | não |  |  |
| `created_at` | timestamp(date) | não | now() |  |

### `stock_item`

Escopo: **tenant** — 10 colunas

| coluna | tipo | nulo | default | FK |
|---|---|---|---|---|
| `id` | uuid | não | random() · PK |  |
| `tenant_id` | uuid | não |  | `tenant.id` ON DELETE cascade |
| `sku` | text | sim |  |  |
| `nome` | text | não |  |  |
| `unidade` | text | não | "un" |  |
| `categoria` | text | sim |  |  |
| `custo_unit` | numeric(15,2) | não | "0" |  |
| `minimo` | numeric(15,3) | não | "0" |  |
| `obs` | text | sim |  |  |
| `created_at` | timestamp(date) | não | now() |  |

### `stock_movement`

Escopo: **tenant** · projeto — 15 colunas

| coluna | tipo | nulo | default | FK |
|---|---|---|---|---|
| `id` | uuid | não | random() · PK |  |
| `tenant_id` | uuid | não |  | `tenant.id` ON DELETE cascade |
| `item_id` | uuid | não |  | `stock_item.id` ON DELETE cascade |
| `project_id` | uuid | sim |  | `project.id` ON DELETE set null |
| `tipo` | text | não |  |  |
| `origem` | text | sim |  |  |
| `quantidade` | numeric(15,3) | não | "0" |  |
| `custo_unit` | numeric(15,2) | não | "0" |  |
| `data` | text | sim |  |  |
| `doc` | text | sim |  |  |
| `despesa_id` | uuid | sim |  | `despesa.id` ON DELETE set null |
| `permuta_id` | uuid | sim |  | `permuta.id` ON DELETE set null |
| `responsavel` | text | sim |  |  |
| `obs` | text | sim |  |  |
| `created_at` | timestamp(date) | não | now() |  |

---

## 3. Colunas de data e tempo

Três formatos convivem no banco, e a distinção importa porque a DRE lê
competência e o fluxo de caixa lê liquidação:

| Formato | Tipo no banco | Onde aparece |
|---|---|---|
| `MM/DD/YYYY` | `text` | datas de negócio com dia — vencimento, pagamento, emissão |
| `MM/YYYY` | `text` | competências e períodos de planejamento |
| timestamp UTC | `timestamp(mode: "date")` | carimbos de criação/atualização (auditoria) |

A coluna `cash_entry.conciliado_em` foge dos três: é `text` com ISO-8601
(`new Date().toISOString()`).

Coluna cujo nome engana: **`unit.mes_venda` guarda `MM/DD/YYYY`**, não `MM/YYYY`
— o comentário do schema diz `"MM/DD/YYYY" como no protótipo`.

O papel na coluna "papel" abaixo segue a leitura do código, não o nome:

- `COMPETÊNCIA` — alimenta a DRE
- `VENCIMENTO` — alimenta o fluxo Previsto
- `LIQUIDAÇÃO` — alimenta o fluxo Realizado e o caixa
- `EMISSÃO` — data do documento, não entra em regime
- `AUDITORIA` — carimbo técnico
- `ESTORNO` — marca quando um registro foi anulado

**`user`**

| coluna | tipo | formato | papel |
|---|---|---|---|
| `emailVerified` | timestamp(date) | timestamp UTC | AUDITORIA |

**`account`**

| coluna | tipo | formato | papel |
|---|---|---|---|
| `expires_at` | integer | epoch (s) | — |

**`session`**

| coluna | tipo | formato | papel |
|---|---|---|---|
| `expires` | timestamp(date) | timestamp UTC | AUDITORIA |

**`verificationToken`**

| coluna | tipo | formato | papel |
|---|---|---|---|
| `expires` | timestamp(date) | timestamp UTC | AUDITORIA |

**`tenant`**

| coluna | tipo | formato | papel |
|---|---|---|---|
| `created_at` | timestamp(date) | timestamp UTC | AUDITORIA |

**`membership`**

| coluna | tipo | formato | papel |
|---|---|---|---|
| `created_at` | timestamp(date) | timestamp UTC | AUDITORIA |

**`project`**

| coluna | tipo | formato | papel |
|---|---|---|---|
| `start_date` | text | texto `MM/DD/YYYY` | — |
| `end_date` | text | texto `MM/DD/YYYY` | — |
| `mes_inicial` | text | texto `MM/YYYY` | COMPETÊNCIA |
| `mes_final` | text | texto `MM/YYYY` | COMPETÊNCIA |
| `created_at` | timestamp(date) | timestamp UTC | AUDITORIA |

**`time_entry`**

| coluna | tipo | formato | papel |
|---|---|---|---|
| `data` | text | texto `MM/DD/YYYY` | LIQUIDAÇÃO |
| `server_at` | timestamp(date) | timestamp UTC | AUDITORIA |

**`version`**

| coluna | tipo | formato | papel |
|---|---|---|---|
| `created_at` | timestamp(date) | timestamp UTC | AUDITORIA |

**`unit`**

| coluna | tipo | formato | papel |
|---|---|---|---|
| `mes_venda` | text | texto `MM/DD/YYYY` | — |
| `created_at` | timestamp(date) | timestamp UTC | AUDITORIA |
| `updated_at` | timestamp(date) | timestamp UTC | AUDITORIA |

**`permuta`**

| coluna | tipo | formato | papel |
|---|---|---|---|
| `data_recebimento` | text | texto `MM/DD/YYYY` | LIQUIDAÇÃO |
| `data_venda` | text | texto `MM/DD/YYYY` | — |
| `data_prim_parcela` | text | texto `MM/DD/YYYY` | — |

**`reembolso`**

| coluna | tipo | formato | papel |
|---|---|---|---|
| `data` | text | texto `MM/DD/YYYY` | LIQUIDAÇÃO |

**`bank_account`**

| coluna | tipo | formato | papel |
|---|---|---|---|
| `last_sync` | timestamp(date) | timestamp UTC | AUDITORIA |

**`despesa`**

| coluna | tipo | formato | papel |
|---|---|---|---|
| `competencia` | text | texto `MM/YYYY` | COMPETÊNCIA |
| `vencimento` | text | texto `MM/DD/YYYY` | VENCIMENTO |
| `data_caixa` | text | texto `MM/DD/YYYY` | LIQUIDAÇÃO |
| `data_emissao` | text | texto `MM/DD/YYYY` | EMISSÃO |
| `cheque_data_emissao` | text | texto `MM/DD/YYYY` | — |
| `cheque_data_compensacao` | text | texto `MM/DD/YYYY` | — |
| `cancelado_em` | text | texto `MM/DD/YYYY` | ESTORNO |
| `created_at` | timestamp(date) | timestamp UTC | AUDITORIA |

**`despesa_terceiro`**

| coluna | tipo | formato | papel |
|---|---|---|---|
| `data_pagamento_original` | text | texto `MM/DD/YYYY` | LIQUIDAÇÃO |
| `data_prevista_restituicao` | text | texto `MM/DD/YYYY` | VENCIMENTO |
| `created_at` | timestamp(date) | timestamp UTC | AUDITORIA |

**`restituicao`**

| coluna | tipo | formato | papel |
|---|---|---|---|
| `data_restituicao` | text | texto `MM/DD/YYYY` | LIQUIDAÇÃO |
| `created_at` | timestamp(date) | timestamp UTC | AUDITORIA |

**`documento_fiscal`**

| coluna | tipo | formato | papel |
|---|---|---|---|
| `data_emissao` | text | texto `MM/DD/YYYY` | EMISSÃO |
| `created_at` | timestamp(date) | timestamp UTC | AUDITORIA |

**`recebimento_terceiro`**

| coluna | tipo | formato | papel |
|---|---|---|---|
| `data_recebimento` | text | texto `MM/DD/YYYY` | LIQUIDAÇÃO |
| `data_prevista_repasse` | text | texto `MM/DD/YYYY` | VENCIMENTO |
| `created_at` | timestamp(date) | timestamp UTC | AUDITORIA |

**`repasse`**

| coluna | tipo | formato | papel |
|---|---|---|---|
| `data_repasse` | text | texto `MM/DD/YYYY` | LIQUIDAÇÃO |
| `created_at` | timestamp(date) | timestamp UTC | AUDITORIA |

**`acerto`**

| coluna | tipo | formato | papel |
|---|---|---|---|
| `data_pagamento` | text | texto `MM/DD/YYYY` | LIQUIDAÇÃO |
| `estornado_em` | text | texto `MM/DD/YYYY` | ESTORNO |
| `created_at` | timestamp(date) | timestamp UTC | AUDITORIA |

**`acerto_item`**

| coluna | tipo | formato | papel |
|---|---|---|---|
| `created_at` | timestamp(date) | timestamp UTC | AUDITORIA |

**`rateio_obra`**

| coluna | tipo | formato | papel |
|---|---|---|---|
| `created_at` | timestamp(date) | timestamp UTC | AUDITORIA |

**`restituicao_item`**

| coluna | tipo | formato | papel |
|---|---|---|---|
| `created_at` | timestamp(date) | timestamp UTC | AUDITORIA |

**`compensacao`**

| coluna | tipo | formato | papel |
|---|---|---|---|
| `data` | text | texto `MM/DD/YYYY` | LIQUIDAÇÃO |
| `created_at` | timestamp(date) | timestamp UTC | AUDITORIA |

**`despesa_parcela`**

| coluna | tipo | formato | papel |
|---|---|---|---|
| `vencimento` | text | texto `MM/DD/YYYY` | VENCIMENTO |
| `data_pagamento` | text | texto `MM/DD/YYYY` | LIQUIDAÇÃO |
| `data_emissao_cheque` | text | texto `MM/DD/YYYY` | EMISSÃO |
| `data_bom_para` | text | texto `MM/DD/YYYY` | VENCIMENTO |
| `created_at` | timestamp(date) | timestamp UTC | AUDITORIA |

**`pagamento`**

| coluna | tipo | formato | papel |
|---|---|---|---|
| `data_pagamento` | text | texto `MM/DD/YYYY` | LIQUIDAÇÃO |
| `created_at` | timestamp(date) | timestamp UTC | AUDITORIA |

**`document`**

| coluna | tipo | formato | papel |
|---|---|---|---|
| `uploaded_at` | timestamp(date) | timestamp UTC | AUDITORIA |

**`servico`**

| coluna | tipo | formato | papel |
|---|---|---|---|
| `created_at` | timestamp(date) | timestamp UTC | AUDITORIA |

**`medicao_servico`**

| coluna | tipo | formato | papel |
|---|---|---|---|
| `competencia` | text | texto `MM/YYYY` | COMPETÊNCIA |
| `created_at` | timestamp(date) | timestamp UTC | AUDITORIA |

**`medicao`**

| coluna | tipo | formato | papel |
|---|---|---|---|
| `competencia` | text | texto `MM/YYYY` | COMPETÊNCIA |
| `created_at` | timestamp(date) | timestamp UTC | AUDITORIA |

**`cliente`**

| coluna | tipo | formato | papel |
|---|---|---|---|
| `created_at` | timestamp(date) | timestamp UTC | AUDITORIA |

**`cash_entry`**

| coluna | tipo | formato | papel |
|---|---|---|---|
| `data` | text | texto `MM/DD/YYYY` | LIQUIDAÇÃO |
| `conciliado_em` | text | texto ISO-8601 | AUDITORIA |

**`conta_receber`**

| coluna | tipo | formato | papel |
|---|---|---|---|
| `vencimento` | text | texto `MM/DD/YYYY` | VENCIMENTO |
| `data_recebimento` | text | texto `MM/DD/YYYY` | LIQUIDAÇÃO |
| `created_at` | timestamp(date) | timestamp UTC | AUDITORIA |

**`incc_rate`**

| coluna | tipo | formato | papel |
|---|---|---|---|
| `mes` | text | texto `MM/YYYY` | COMPETÊNCIA |

**`audit_log`**

| coluna | tipo | formato | papel |
|---|---|---|---|
| `created_at` | timestamp(date) | timestamp UTC | AUDITORIA |

**`number_sequence`**

| coluna | tipo | formato | papel |
|---|---|---|---|
| `updated_at` | timestamp(date) | timestamp UTC | AUDITORIA |

**`budget_line`**

| coluna | tipo | formato | papel |
|---|---|---|---|
| `mes` | text | texto `MM/YYYY` | COMPETÊNCIA |

**`daily_closing`**

| coluna | tipo | formato | papel |
|---|---|---|---|
| `dia` | text | texto `MM/DD/YYYY` | — |
| `closed_at` | timestamp(date) | timestamp UTC | AUDITORIA |

**`carry_over`**

| coluna | tipo | formato | papel |
|---|---|---|---|
| `vencimento` | text | texto `MM/DD/YYYY` | VENCIMENTO |
| `from_dia` | text | texto `MM/DD/YYYY` | — |
| `to_dia` | text | texto `MM/DD/YYYY` | — |
| `created_at` | timestamp(date) | timestamp UTC | AUDITORIA |

**`stock_item`**

| coluna | tipo | formato | papel |
|---|---|---|---|
| `created_at` | timestamp(date) | timestamp UTC | AUDITORIA |

**`stock_movement`**

| coluna | tipo | formato | papel |
|---|---|---|---|
| `data` | text | texto `MM/DD/YYYY` | LIQUIDAÇÃO |
| `created_at` | timestamp(date) | timestamp UTC | AUDITORIA |

### As três datas do mesmo evento, lado a lado

`despesa` é a tabela onde a distinção fica mais visível — carrega as três ao
mesmo tempo:

| Coluna | Formato | Papel |
|---|---|---|
| `competencia` | `MM/YYYY` | mês a que o custo pertence — é o que a DRE lê |
| `vencimento` | `MM/DD/YYYY` | quando se espera pagar — fluxo Previsto |
| `data_caixa` | `MM/DD/YYYY` | quando de fato saiu — fluxo Realizado |
| `data_emissao` | `MM/DD/YYYY` | data do documento fiscal |

Em `despesa_parcela`, a mesma separação aparece como `vencimento` (previsto) e
`data_pagamento` (realizado). Em `conta_receber`, como `vencimento` e
`data_recebimento`. `cash_entry.data` é sempre liquidação — a tabela só existe
para o regime de caixa.

`cash_entry` **não tem** coluna de competência.

---

## 4. Onde o filtro de tenant é aplicado

**Consulta a consulta.** Não há camada central de isolamento.

O que não existe:

- Row Level Security no Postgres — nenhuma migração emite `ENABLE ROW LEVEL SECURITY` ou `CREATE POLICY`; os snapshots do drizzle registram `"isRLSEnabled": false` em todas as tabelas.
- Wrapper de conexão por tenant, `set_config`/`SET LOCAL`, ou cliente drizzle derivado com filtro embutido.
- Filtro no `src/middleware.ts` — ele trata sessão e rota, não tenant.

O que existe:

1. **`getActiveContext()`** (`src/lib/context.ts`) resolve o tenant uma vez por
   request: sessão do Auth.js → e-mail → `user` → `membership` (o primeiro, por
   `createdAt`) → `tenant`. Devolve também projetos, versões e a matriz de
   permissões. Projeto e versão ativos vêm dos cookies `gtc_project` e
   `gtc_version`, com fallback.

2. **Cada consulta aplica o filtro à mão**, passando `ctx.tenant.id` para um
   `eq(schema.<tabela>.tenantId, ...)` dentro de um `and(...)`. Há **164
   ocorrências** desse padrão, espalhadas por **25 arquivos** entre
   `src/lib/queries.ts` e `src/lib/actions/`.

Padrão típico de uma leitura:

```ts
const ctx = await getActiveContext();
if (!ctx) return null;
if (!can(ctx.perms, "contasreceber", "ver")) return <AccessDenied />;
const rows = await db.select().from(schema.contasReceber)
  .where(and(
    eq(schema.contasReceber.tenantId, ctx.tenant.id),
    eq(schema.contasReceber.cancelado, false),
  ));
```

E de uma escrita:

```ts
await db.update(schema.contasReceber).set(set)
  .where(and(
    eq(schema.contasReceber.id, id),
    eq(schema.contasReceber.tenantId, ctx.tenant.id),
  ));
```

Consequência estrutural: o isolamento depende de o filtro estar presente em cada
consulta. Uma consulta escrita sem ele não é barrada por nenhuma camada abaixo.

**Autorização** é separada do isolamento e também é por chamada:
`can(ctx.perms, "<recurso>", "<ação>")`, onde as ações são `ver`/`criar`/
`editar`/`excluir`. As permissões efetivas saem do papel (`owner`, `admin`,
`membro`, `contador`, `engenheiro`) combinado com overrides gravados em
`membership.permissions`.

**Escopo de versão** segue a mesma mecânica: `ctx.version.id` é passado
explicitamente nas consultas às 8 tabelas versionadas.

---

## 5. Como o estorno é materializado

Não há mecanismo único. **Quatro formas diferentes convivem**, e nenhuma tabela
dedicada a estorno existe no schema.

### a) Flag no próprio registro — sem lançamento espelho

| Tabela | Colunas |
|---|---|
| `despesa` | `cancelado` (bool, default false), `cancelado_em` (text), `cancelado_por` (text), `motivo_cancelamento` (text) |
| `conta_receber` | `cancelado` (bool, default false) — sem data, autor ou motivo |

`cancelarDespesa` (`src/lib/actions/despesas.ts:694`) e
`cancelarContaReceber` (`src/lib/actions/contas-receber.ts:122`) fazem apenas um
`UPDATE` marcando a flag. As consultas de listagem filtram `cancelado = false`.
Nenhuma linha nova é criada.

### b) Flag + lançamento espelho no caixa

`acerto` tem `estornado` (bool), `estornado_em` (text), `estornado_por` (text).

`estornarAcerto` (`src/lib/actions/acerto.ts:381`), numa transação:
1. devolve cada despesa ao `statusAnterior` guardado em `acerto_item` e limpa `data_caixa`;
2. insere um `cash_entry` de sinal oposto ao original, com `cat: "ajuste"`;
3. marca a flag no acerto.

O acerto original permanece legível.

### c) DELETE físico + lançamento espelho condicional

`restituicao` **não tem** coluna de estorno.
`cancelarRestituicao` (`src/lib/actions/restituicoes.ts:503`), numa transação:
1. reduz `despesa_terceiro.valor_restituido` e recalcula o status;
2. **`DELETE` da linha de `restituicao`**;
3. quanto ao caixa, bifurca:
   - se a restituição apontava para um `cash_entry` vindo do extrato (`rest.cashEntryId` preenchido), apenas desmarca `rec = false` — comentário no código: *"Lançar um estorno aqui inventaria uma entrada que nunca aconteceu no banco"*;
   - se a saída foi criada pelo próprio sistema, insere um `cash_entry` de entrada com `descricao: "Estorno de restituição"` e `cat: "ajuste"`.

O registro da restituição deixa de existir na tabela; resta o `audit_log`.

### d) Desfazer vínculo — sem flag e sem espelho

`desfazerConciliacao` (`src/lib/actions/caixa.ts:491`) devolve `cash_entry` ao
estado não conciliado: `rec = false`, `conciliado_despesa_id = NULL`,
`conciliado_conta_receber_id = NULL`, `conciliado_por`/`conciliado_em` limpos —
e reverte o status do lado ligado (despesa volta a "A pagar" com `data_caixa`
nula; conta a receber tem `valor_recebido` reduzido). O movimento do extrato é
preservado, porque é fato do banco.

### Resumo

| Fluxo | Flag | Espelho no caixa | Registro original |
|---|---|---|---|
| Despesa | `cancelado` + em/por/motivo | não | preservado |
| Conta a receber | `cancelado` | não | preservado |
| Acerto contábil | `estornado` + em/por | sim, `cat: "ajuste"` | preservado |
| Restituição | nenhuma | condicional, `cat: "ajuste"` | **removido (DELETE)** |
| Conciliação de caixa | `rec` volta a false | não | preservado |

Categorias (`cash_entry.cat`) usadas por lançamentos de correção/estorno:
`"ajuste"`. Outras categorias em uso: `"despesa"`, `"restituicao"`, `"repasse"`,
`"acerto"`, `"extrato"`.

Em todos os cinco fluxos há chamada a `logAudit`.

---

## 6. Migrações, em ordem

40 migrações (`0000`–`0039`), forward-only, executadas no boot do contêiner.
As de `0000` a `0032` foram geradas pelo drizzle-kit e trazem nome automático;
a partir de `0033` os nomes são descritivos e há arquivo de rollback em
`src/lib/db/migrations/down/`.

**Só as 7 últimas têm `down`.** As 33 primeiras não têm arquivo de rollback.

| # | Nome | `down` | O que fez |
|---|---|---|---|
| 0000 | `windy_sister_grimm` | — | Cria a base do Auth.js e do multi-tenant: `user`, `account`, `session`, `verificationToken`, `tenant`, `membership` |
| 0001 | `tan_misty_knight` | — | Cria o núcleo do domínio: `project`, `version`, `unit`, `despesa`, `cash_entry`, `bank_account`, `chart_account`, `stakeholder`, `permuta`, `reembolso`, `incc_rate`, `document`, mais 8 enums |
| 0002 | `perpetual_captain_britain` | — | Cria `audit_log` |
| 0003 | `useful_onslaught` | — | +5 colunas em `user`, `tenant`, `membership` |
| 0004 | `sparkling_roughhouse` | — | +2 colunas em `despesa` e `version` |
| 0005 | `slimy_wonder_man` | — | +1 coluna em `project` |
| 0006 | `early_enchantress` | — | Cria `medicao` |
| 0007 | `familiar_vision` | — | +2 colunas em `bank_account` |
| 0008 | `fine_starbolt` | — | Cria `cliente` |
| 0009 | `confused_smiling_tiger` | — | Acrescenta o valor `'Empréstimos'` ao enum `dre_category` |
| 0010 | `sharp_harpoon` | — | +1 coluna em `incc_rate` |
| 0011 | `absent_skaar` | — | +4 colunas em `permuta` |
| 0012 | `condemned_shiver_man` | — | Cria `number_sequence` (sequência do PED) |
| 0013 | `daily_tag` | — | Cria `despesa_parcela`; +16 colunas em `despesa` (parcelamento e cheque no cabeçalho) |
| 0014 | `neat_changeling` | — | Cria `pagamento` |
| 0015 | `flawless_roland_deschain` | — | Cria `despesa_terceiro` e `restituicao`; +1 coluna em `despesa` |
| 0016 | `colorful_wrecker` | — | Cria `budget_line` |
| 0017 | `projeto_datas_cliente_unit_tipo` | — | +4 colunas em `project` e `unit`; novo enum |
| 0018 | `fechamento_balanco_carryover` | — | Cria `daily_closing` e `carry_over` |
| 0019 | `estoque` | — | Cria `stock_item` e `stock_movement` |
| 0020 | `stock_movement_origem_vinculos` | — | +4 colunas em `stock_movement` (vínculo com despesa/permuta de origem) |
| 0021 | `cash_entry_import_dedup` | — | +2 colunas em `cash_entry` (`doc`, `import_hash`) para deduplicar extrato |
| 0022 | `despesa_cancelamento_logico` | — | +4 colunas em `despesa`: `cancelado`, `cancelado_em`, `cancelado_por`, `motivo_cancelamento` |
| 0023 | `project_terreno_valor_global` | — | +7 colunas em `project` |
| 0024 | `document_tipo_uploader` | — | +2 colunas em `document` |
| 0025 | `stakeholder_ativo` | — | +1 coluna em `stakeholder` |
| 0026 | `document_cliente_unit_vinculos` | — | +4 colunas em `document` |
| 0027 | `ponto_georreferenciado` | — | Cria `time_entry`; +4 colunas em `project` (raio e coordenadas) |
| 0028 | `fornecedor_dados_complementares` | — | +12 colunas em `stakeholder` e `document` |
| 0029 | `conciliacao_vinculo` | — | +3 colunas em `cash_entry` (`conciliado_despesa_id`, `conciliado_por`, `conciliado_em`) |
| 0030 | `contas_receber` | — | Cria `conta_receber`; +1 coluna em `cash_entry` (`conciliado_conta_receber_id`) |
| 0031 | `planejamento_budget_forecast` | — | Cria `budget_account`; +7 colunas em `budget_line`, `chart_account`, `project`, `version` |
| 0032 | `planejamento_recursos_proprios` | — | +3 colunas em `project` |
| 0033 | `medicao_servicos_bdi` | down | Cria `servico` e `medicao_servico`; +7 colunas em `project` (BDI e provisionamento) |
| 0034 | `terceiro_idempotencia_conciliacao` | down | Despesa paga por terceiro: chaves de idempotência e conciliação; +3 colunas em `despesa_terceiro` e `restituicao` |
| 0035 | `documento_fiscal_recebimento_terceiro` | down | Cria `documento_fiscal`, `recebimento_terceiro` e `repasse` (RG-02/RG-04); +1 coluna em `document` |
| 0036 | `contas_controladoria` | down | Só dados: `INSERT ... ON CONFLICT DO NOTHING` das contas F.6–F.9 no `chart_account` de cada tenant (juros/multas, descontos obtidos, terceiros a restituir, valores a receber de terceiros) |
| 0037 | `acerto_restituicao_lote` | down | Cria `acerto`, `acerto_item`, `rateio_obra`, `restituicao_item` e `compensacao` |
| 0038 | `parcela_cheque` | down | +4 colunas em `despesa_parcela` (cheque por parcela) e índice de busca de cheque repetido |
| 0039 | `emitente_fiscal` | down | +26 colunas em `tenant` e `project` (cadastro fiscal do emitente, preparação da NFS-e) |

### Índices criados por migração

19 índices, todos em migrações de `0034` em diante — as tabelas criadas até
`0033` têm apenas as chaves primárias e as constraints `UNIQUE` declaradas no
`CREATE TABLE`.

| Constraint / índice | Tabela | Definição |
|---|---|---|
| `user_email_unique` | `user` | UNIQUE(`email`) |
| `version_project_key_uq` | `version` | UNIQUE(`project_id`, `key`) |
| `chart_account_tenant_code_uq` | `chart_account` | UNIQUE(`tenant_id`, `code`) |
| `number_sequence_tenant_entity_uq` | `number_sequence` | UNIQUE(`tenant_id`, `entity`) |
| `despesa_parcela_uq` | `despesa_parcela` | UNIQUE(`despesa_id`, `numero_parcela`) |
| `incc_project_mes_uq` | `incc_rate` | UNIQUE(`project_id`, `mes`) |
| `budget_line_uq` | `budget_line` | UNIQUE(`version_id`, `kind`, `row_key`, `mes`) |
| `budget_account_uq` | `budget_account` | UNIQUE(`version_id`, `kind`, `row_key`) |
| `acerto_idem_uq` | `acerto` | UNIQUE INDEX("tenant_id", "idempotency_key") WHERE "idempotency_key" IS NOT NULL — mig 0037 |
| `acerto_periodo_idx` | `acerto` | INDEX("tenant_id", "data_pagamento") — mig 0037 |
| `acerto_item_uq` | `acerto_item` | UNIQUE INDEX("acerto_id", "despesa_id") — mig 0037 |
| `acerto_item_despesa_idx` | `acerto_item` | INDEX("despesa_id") — mig 0037 |
| `compensacao_idem_uq` | `compensacao` | UNIQUE INDEX("tenant_id", "idempotency_key") WHERE "idempotency_key" IS NOT NULL — mig 0037 |
| `despesa_parcela_cheque_idx` | `despesa_parcela` | INDEX("tenant_id", "bank_account_id", "numero_cheque") WHERE "numero_cheque" IS NOT NULL — mig 0038 |
| `despesa_terceiro_idem_uq` | `despesa_terceiro` | UNIQUE INDEX("tenant_id", "idempotency_key") WHERE "idempotency_key" IS NOT NULL — mig 0034 |
| `despesa_terceiro_despesa_ativa_uq` | `despesa_terceiro` | UNIQUE INDEX("despesa_id") WHERE status <> 'Cancelado' — mig 0034 |
| `document_num_fiscal_idx` | `document` | INDEX("tenant_id", "numero_documento_fiscal") — mig 0035 |
| `documento_fiscal_despesa_idx` | `documento_fiscal` | INDEX("despesa_id") — mig 0035 |
| `documento_fiscal_busca_idx` | `documento_fiscal` | INDEX("tenant_id", "tipo", "serie", "numero") — mig 0035 |
| `rateio_obra_projeto_idx` | `rateio_obra` | INDEX("tenant_id", "project_id") — mig 0037 |
| `recebimento_terceiro_idem_uq` | `recebimento_terceiro` | UNIQUE INDEX("tenant_id", "idempotency_key") WHERE "idempotency_key" IS NOT NULL — mig 0035 |
| `recebimento_terceiro_saldo_idx` | `recebimento_terceiro` | INDEX("tenant_id", "recebedor_terceiro_id", "status") — mig 0035 |
| `repasse_idem_uq` | `repasse` | UNIQUE INDEX("tenant_id", "idempotency_key") WHERE "idempotency_key" IS NOT NULL — mig 0035 |
| `repasse_cash_entry_uq` | `repasse` | UNIQUE INDEX("cash_entry_id") WHERE "cash_entry_id" IS NOT NULL — mig 0035 |
| `restituicao_idem_uq` | `restituicao` | UNIQUE INDEX("tenant_id", "idempotency_key") WHERE "idempotency_key" IS NOT NULL — mig 0034 |
| `restituicao_item_uq` | `restituicao_item` | UNIQUE INDEX("restituicao_id", "despesa_terceiro_id") — mig 0037 |
| `restituicao_item_origem_idx` | `restituicao_item` | INDEX("despesa_terceiro_id") — mig 0037 |
