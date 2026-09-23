# V2 · Bloco 0 — os bloqueios, prontos para responder

Os 12 bloqueios dos quatro prompts do Bloco 0 (**AJ, AI, AF, AK**), extraídos de
`PROMPTS.md` e conferidos contra o código em 23/09/2026.

São de dois tipos:

- **3 respondem com dado de produção** — BAJ-1, BAI-3, BAF-1. O SQL está pronto
  em [`docs/sql/v2-bloco0-diagnostico.sql`](./sql/v2-bloco0-diagnostico.sql).
- **9 respondem com decisão** — estão na seção 3, cada uma com as opções e a
  recomendação do próprio prompt.

---

## 1 · ⚠ Achado urgente — vazamento de dado pessoal que já está em produção

O **BAK-2** trata o risco como hipótese:

> Hoje o risco é contido […]. Se **renda** entrar num `meta` de
> `cliente.update`, ela aparece aqui.

**Ela já entra. Hoje.** Três fatos, conferidos no código:

1. O papel **`contador`** — o contador externo — tem acesso ao **Log de
   Auditoria**: `acoes` está em `CONTADOR_VE` (`src/lib/permissions.ts:87`). É a
   única tela de Configurações que ele vê.
2. **`cliente.update`** grava no `meta.changes` **todo campo alterado** do
   cadastro (`src/lib/actions/clientes.ts`, o loop sobre `readCliente`). A lista
   inclui `cpfCnpj`, `nascimento`, `rendaBruta`, `rendaLiquida`,
   `comprometimento`, `saldoFgts`, `scoreCredito` e **`restricoes`**.
3. A tela de auditoria exibe o `meta.changes` campo a campo, `de → para`.

**Consequência:** toda vez que alguém edita um comprador, o contador externo
passa a ver CPF, renda, score e restrições de crédito daquela pessoa. E os
registros de antes já estão lá.

**Por que a correção não é simples:** a regra global 3.4 proíbe alterar
`audit_log` — nem para corrigir registro que o próprio sistema gravou torto.
Então os registros antigos **não podem ser limpos**. A correção tem de ser na
**exibição** (a tela mascara o campo), não no dado.

Isso depende do **BM-3** ("quais campos de cliente são sensíveis") — e, por isso,
não executei nada. Ver a decisão 3.8.

> Nenhuma das minhas alterações recentes criou ou ampliou isso. A correção da
> AK Parte 2 só deixa de gravar log **vazio**; os campos gravados continuam os
> mesmos de antes.

---

## 2 · O SQL — como rodar e como ler

```bash
psql "$DATABASE_URL" -f docs/sql/v2-bloco0-diagnostico.sql > bloco0.txt
```

Tudo roda dentro de `BEGIN TRANSACTION READ ONLY` e termina em `ROLLBACK`. **O
Postgres recusa qualquer escrita** dentro dela — provado abaixo.

**A saída traz dado de todas as empresas** (e-mails de usuários de cada
tenant). Não repassar o resultado bruto a cliente.

| Consulta | Bloqueio | O que responde | Como ler |
|---|---|---|---|
| 1 | BAJ-1 | papel e override de cada membro | `membro` sem override → causa é o default (AJ Parte 1). Override com ~38 chaves → causa é o salvamento total (Partes 1 **e** 2) |
| 2 | BAJ-1 | override que dá tela de Config a quem não é owner/admin | qualquer linha → AJ Parte 3 |
| 3 | BAJ-1 | chaves gravadas que não existem mais | overrides órfãos |
| 4 | BAI-3 | quem **perde** `/usuarios` e `/acessos` quando a AI Parte 0 entrar | **avisar essas pessoas antes** |
| 5 | BAF-1 | PED repetido | qualquer linha → o `UNIQUE` da AF Parte 1 **não entra** sem decisão item a item |
| 6 | BAF-1 | contador × maior número emitido | `next_number` deve ser **maior** que `maior_sufixo_emitido` |
| 7 | BAF-1 | despesas sem número | |
| 8 | BAF-1 | números consumidos e nunca gravados | o custo do RC-N1 |

**A consulta 1 é a entrega obrigatória do BAJ-1** — sem ela não dá para saber
se a AJ Parte 1 resolve sozinha.

### 2.1 · Correções que fiz no SQL dos prompts — e a prova de cada uma

Antes de entregar, subi um **PostgreSQL 16** descartável, apliquei **as 40
migrações do repositório** (o schema de produção) e semeei dados sintéticos com
os casos de borda. Cada correção abaixo foi **reproduzida com o SQL original** e
confirmada com o corrigido.

| # | O que estava errado no prompt | Reprodução com o SQL original | Corrigido |
|---|---|---|---|
| 1 | Um único `permissions` gravado como array derruba a consulta **inteira** | `ERROR: cannot call jsonb_object_keys on an array` | a linha aparece com `chaves` vazio, sem abortar |
| 2 | BAF-1 somava **todos** os dígitos do `num_doc`; o app lê só os **finais** (`/(\d+)\s*$/`, em `numeracao.ts` e `numbering.ts`) | `PED-2026-000123` → **2026000123** | **123**, igual ao app |
| 3 | Um `num_doc` com mais de 18 dígitos estoura o `bigint` | chave de NF colada: `ERROR: value … is out of range for type bigint` | não aborta |
| 4 | A conta de buracos usava `count(*)`: **número duplicado esconde número pulado** | 120, 121, 121, 123 → emitidos 4, faixa 4 → **"0 buracos"** | `count(DISTINCT)` → **1 buraco** (o 122) |

A correção 2 importa mais do que parece: com o SQL original, o BAF-1 diria que o
contador está **dois bilhões atrás** — falso alarme exatamente na pergunta que o
bloqueio existe para responder.

Duas melhorias menores, sem efeito no resultado: coluna `empresa` em todas as
consultas (o prompt AJ misturava tenants sem identificá-los), e `-> … IS NOT
NULL` no lugar do operador `?`, que DBeaver, drivers JDBC e o node-postgres
confundem com parâmetro.

**A trava de leitura também foi provada:** dentro da transação, `UPDATE` e
`DELETE` devolveram `ERROR: cannot execute … in a read-only transaction`, e os
dados ficaram intactos. O banco de teste foi apagado ao fim.

---

## 3 · As nove decisões

Responder na ordem. **3.8 é a mais urgente** — ver a seção 1.

### 3.1 · BAJ-2 — O que o `membro` precisa ver · *trava a AJ inteira*

Que telas uma pessoa de operação precisa alcançar para trabalhar, e com qual
ação. **Enquanto não houver resposta, a AJ Parte 1 não liga** — trocar um
default permissivo por outro adivinhado só move o problema.

| Opção | Telas |
|---|---|
| **1 · Lançamento** | Despesas, Contas a Pagar, Fornecedores, Caixa, Contas Correntes, Medição. Sem relatório de resultado |
| **2 · Lançamento + receita** | a 1, mais Clientes, Unidades, Contas a Receber, Permuta |
| **3 · Operação com leitura** | a 1 ou a 2, mais DRE e Fluxo de Caixa em **ver** |

Para cada tela, dizer a ação: ver · criar · editar · excluir.

**Resposta:**

### 3.2 · BAJ-3 — Falta um papel entre `membro` e `contador`?

Hoje: `membro` cria e edita quase tudo; `contador` lê oito telas; `engenheiro`
só lança medição. Se a 3.1 for "lançamento sem resultado", isso provavelmente é
um **papel novo** (`operacional`), não um `membro` mais magro.

- **a)** ajustar o `membro`
- **b)** criar papel novo; o `membro` passa a ser papel de gestão

Papel novo é migração de enum e **reatribuição de pessoas uma a uma, por
decisão humana** — nunca por script.

**Resposta:**

### 3.3 · BAI-1 — Ligar o MFA para todos?

A decisão mais importante da AI. Sem e-mail no sistema, o MFA é o que garante
que o admin que redefine a senha de alguém **não consegue entrar como essa
pessoa**.

Ao ligar: todo usuário cai no cadastro do autenticador no próximo acesso; **quem
perder o autenticador fica fora**, sem caminho de destravar; e a exigência vale
para a **instância inteira** (não dá por tenant).

- **a)** liga agora
- **b)** liga junto com o Emissor de NFS-e
- **c)** fica em standby

**Recomendação do prompt:** ligar **antes do Prompt AG** — quando o sistema
emite documento fiscal, "quem emitiu" precisa significar alguma coisa.

**Resposta:**

### 3.4 · BAI-2 — O que fazer com quem sai da empresa

Hoje só existe **Remover**, que apaga o vínculo **e os overrides de permissão**.
Readmitir devolve só os defaults do papel.

- **a)** **Inativar** — coluna aditiva, o vínculo e os overrides permanecem, o
  acesso é negado, reversível
- **b)** continuar removendo, com aviso de que os overrides se perdem

**Recomendação do prompt: a)** — é o padrão que Fornecedores já usa. Remover
continua existindo para vínculo criado por engano.

**Resposta:**

### 3.5 · BAF-2 — O que "Numeração automática ativa" deve fazer

A flag é gravada, exibida e auditada — e **nenhum dos 12 caminhos de lançamento
a lê**. Desligar não muda nada.

- **a)** a flag passa a valer (desligada, o número vira digitação manual) —
  **só com o `UNIQUE` já em produção**
- **b)** a flag **sai da tela**

**Recomendação do prompt: b)** — numeração com efeito contábil não é
preferência.

**Resposta:**

### 3.6 · BAF-3 — O contador de PED é da empresa — é isso o desejado?

Hoje é **um contador por empresa**, compartilhado por todos os projetos e
versões: os PEDs de todas as obras saem intercalados da mesma sequência.
Ninguém decidiu isso explicitamente.

- **a)** confirmar: é da empresa
- **b)** deveria ser por projeto — **não entra nesta tarefa**; vira prompt
  próprio (coluna nova na chave única e redistribuição de numeração histórica)

**Resposta:**

### 3.7 · BAK-1 — As 8 actions sem rastro entram na AK, ou no prompt de cada tela?

Confirmei no código: as **13** funções que a AK aponta estão, todas, **sem
`logAudit`**. Cinco já têm prompt (AH e AI). Restam oito:

| Função | Tela | Prompt da tela |
|---|---|---|
| `deleteStockItem` | Estoque | Y |
| `addReembolso` | Liberação de Obra | O |
| `addPermuta` | Permuta | P |
| `saveIncc` | Parâmetros / INCC | Q |
| `toggleConciliado` | Caixa | L |
| `pairMovimento` | Caixa | L |
| `addBankAccount` | Contas Correntes | X |
| `setDefaultVersion` | Configuração da Versão | sem prompt |

> O texto do prompt diz "restam **nove**", mas a tabela tem **oito** — e 13 − 5 =
> 8. É erro de contagem do prompt; nenhuma função está faltando.

**Recomendação do prompt:** entram **todas aqui** — espalhadas por sete prompts,
a cobertura só fecharia quando o último fosse executado.

**Resposta:**

### 3.8 · BAK-2 — O que nunca pode aparecer no log · ⚠ **URGENTE**

Ver a seção 1. Duas respostas:

**a) A lista de campos que nunca aparecem no log.** Proposta, com base na LGPD
(dado pessoal e dado financeiro de pessoa física):

`cpfCnpj` · `nascimento` · `rendaBruta` · `rendaLiquida` · `comprometimento` ·
`saldoFgts` · `scoreCredito` · `restricoes`

A lista é a mesma pergunta do **BM-3** (Prompt M), que também trava a AO.
Responder uma vez responde as três.

**b) O contador continua vendo o log?**

- **i)** continua, com os campos da lista mascarados na tela
- **ii)** deixa de ver o log (tirar `acoes` de `CONTADOR_VE` — é **redução** de
  acesso, permitida pela regra 3.2)

Nos dois casos a correção é **na exibição**: os registros antigos não podem ser
alterados (regra 3.4).

**Resposta:**

### 3.9 · BAK-3 — O log entra no Backup?

O ZIP semestral leva despesas, contas a receber, caixa e documentos. **O
`audit_log` não está entre eles** — e como não tem paginação nem exportação, **a
trilha de auditoria não tem cópia em lugar nenhum**.

- **a)** sim, em arquivo próprio, do período do semestre
- **b)** não

**Recomendação do prompt: a)** — é o único artefato do sistema sem cópia, e o
que existe justamente para quando algo dá errado.

> Atenção: se a resposta da 3.8 não estiver aplicada antes, o backup passaria a
> levar para fora do sistema os mesmos campos sensíveis.

**Resposta:**

---

## 4 · O que já está executado do Bloco 0

| Prompt · Parte | Situação |
|---|---|
| AI · Parte 4 — `updateMemberName` sem filtro de tenant | ✅ em produção (PR #77). Confere com o texto do prompt |
| AK · Parte 2 — log de evento que não aconteceu | ✅ em produção (PR #77), **corrigido** após a leitura do prompt: as três actions certas, e só o log é suprimido |
| AO · Parte 6 — download do backup sem rastro | ✅ em produção (PR #77) |
| Todo o resto do Bloco 0 | aguardando as respostas acima |
