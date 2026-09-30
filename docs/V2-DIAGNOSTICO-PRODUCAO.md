# Diagnóstico da base de produção — 30/09/2026

Resultado das três consultas somente leitura (`docs/sql/v2-prompt-i-diagnostico.sql`,
`docs/sql/v2-bloco2-diagnostico.sql`, `docs/sql/v2-status-contrato.sql`), rodadas
pelo dono no Postgres de produção. **Nenhum registro foi alterado.**

A base tem três empresas: **BMV Construções** (16 obras), **RMV Empreendimentos**
(2 obras) e **Growth Tools** (1 obra).

## Prompt I, seção 43 — o que a base tem hoje

| Item | Resultado | O que significa | Ação |
|---|---|---|---|
| **A** · despesas fora da Atual | BMV: 5 despesas na Previsão, R$ 13.710,98. RMV: 1 no Orçamento e 1 na Previsão, as duas com R$ 0 | Lançamento real dentro de versão de planejamento — o que o BI-3 proíbe daqui em diante. A importação já não faz mais isso (PR #102); o lançamento pela tela vai para a Atual desde o Prompt A | **Ficam como estão.** Aparecem na tela de conferência quando ela existir (Prompt I, §43). Nada é movido |
| **B** · caixa em Orçamento/Previsão | nenhum | — | — |
| **C** · medições fora da Atual | nenhuma | — | — |
| **D** · pagamento ligado a parcela de outra despesa | nenhum | — | — |
| **E** · parcelas de despesas fora da Atual | nenhuma | — | — |
| **F** · despesas "Pago" sem pagamento, parcela paga ou caixa | **BMV: 277 despesas, R$ 375.407,80** | Marcadas como pagas direto no cadastro, sem registro de pagamento por trás. Provavelmente lançamentos antigos ou importados | **Ficam como estão.** O Prompt I (§13) passa a exigir registro de pagamento daqui em diante; as antigas vão para conferência, item a item, por decisão humana |
| **G** · parcialmente paga com saldo incoerente | nenhuma | — | — |
| **H** · parcelas quitadas com despesa aberta | nenhuma | — | — |
| **I** · soma das parcelas ≠ valor do PED | **BMV: 6 despesas** | O parcelamento não fecha com o total | Ficam. O Prompt I (§15, saldo real) mostra a diferença; nada é recalculado. Detalhe abaixo |
| **J** · "pago por terceiro" sem registro | nenhum | — | — |
| **K** · terceiro com despesa ainda em aberto | nenhum | — | — |
| **N** · caixa conciliado com despesa de outra obra | nenhum | — | — |
| **O/P/Q** · obra sem Orçamento, Previsão ou Atual | nenhuma | toda obra tem as três | — |
| **R** · mais de uma versão do mesmo tipo | BMV: DESPESAS GERAIS ITANHAÉM tem 2 Previsões; OBRA 28 tem 4 | **Não é problema.** Várias Previsões por obra é recurso do app ("Duplicar atual"), mantido por decisão de 30/09 | — |
| **S** · unidade com código repetido na mesma versão | nenhuma | — | a trava de código único (Prompt J, 4.1) **pode ser criada** |
| **V** · unidade vendida sem data de venda ou com valor zero | **RMV: 2 unidades** | Entrariam no rateio de receita (§54) sem data | Preencher a data ou o valor na tela de Unidades, à mão. Detalhe abaixo |
| **X** · obra sem data de início ou de fim | **19 obras** (16 da BMV, 2 da RMV, 1 da Growth Tools) | Sem a janela, **não há rateio de receita possível** (§55). É pré-requisito da seção 54 | Preencher início e fim em **Projetos**, obra por obra, antes de ligar a chave da receita |
| **Y** · conta a receber com unidade (dupla contagem) | nenhuma | — | — |

**Um dado importante:** a tabela de **Contas a Receber está vazia** em produção
(consulta 2b). Ninguém lançou conta a receber à mão. Isso tira o peso de BK-3,
BK-4 e de parte de BI-2: não há legado para conferir.

Os itens L, M, T, U e W dependem de regras de cálculo do app e saem num script
próprio, na Fase 1 do Prompt I.

### Detalhes para quando for corrigir à mão

```sql
-- I · as 6 despesas cuja soma das parcelas não fecha com o PED
SELECT t.name AS empresa, d.num_doc, d.valor AS ped, s.soma AS parcelas, s.soma - d.valor AS diferenca
FROM despesa d JOIN tenant t ON t.id = d.tenant_id
JOIN (SELECT despesa_id, sum(valor_original) AS soma FROM despesa_parcela GROUP BY 1) s ON s.despesa_id = d.id
WHERE NOT d.cancelado AND abs(s.soma - d.valor) > 0.01
ORDER BY 1, 2;

-- V · as 2 unidades vendidas sem data ou com valor zero
SELECT t.name AS empresa, p.name AS obra, u.code AS unidade, u.valor, u.mes_venda
FROM unit u JOIN version v ON v.id = u.version_id JOIN project p ON p.id = v.project_id JOIN tenant t ON t.id = u.tenant_id
WHERE v.kind = 'atual' AND u.status::text ILIKE 'vendid%'
  AND (coalesce(trim(u.mes_venda), '') = '' OR u.valor = 0)
ORDER BY 1, 2, 3;
```

## Bloco 2 — os levantamentos que os prompts pediam

| Bloqueio | Resultado | Consequência |
|---|---|---|
| **BJ-2** · unidades repetidas | nenhuma | A trava de código único pode entrar no Prompt J sem decisão caso a caso |
| **BK-4** · contas "Recebido" sem caixa | nenhuma (a tabela está vazia) | Nada a conferir |
| **BP-1** · permuta já no Estoque | nenhuma | Nenhum dado a migrar. Recomendação segue: o inventário é o Estoque |
| **BP-2** · permuta gerando receita sem estar vendida | nenhuma | Fazer o status governar **não muda número hoje**. Entra atrás da chave mesmo assim |
| **BO-2** · campo "%" das Liberações | RMV: 1 liberação, com "30" | Um único uso, numa empresa que pode ser de teste (ver pergunta abaixo) |

## Prompt M, 6.2 — status do contrato em uso

| Empresa | Status | Clientes |
|---|---|---|
| BMV Construções | ATIVO | 10 |

Só um valor em uso. **Proposta de lista fechada:** Ativo · Distratado ·
Cancelado. "ATIVO" já gravado continua valendo como "Ativo" (a comparação
ignora maiúsculas) e **não é convertido**.

## Perguntas que saem daqui

1. **RMV Empreendimentos e Growth Tools são empresas de teste?** Se forem, os
   itens A (2 despesas de R$ 0), V (2 unidades), X (3 obras) e BO-2 (o "30")
   perdem importância e a base real é só a BMV.
2. **Status do contrato:** a lista Ativo · Distratado · Cancelado basta, ou
   quer mais opções (por exemplo Assinado, Em análise, Reservado)?
3. **BO-2:** com um único uso do "%", a recomendação é **tirar o campo da
   tela** (a coluna fica no banco, nada é apagado). De acordo?
4. **As 19 obras sem data de início e fim** precisam ser preenchidas em
   Projetos antes de a receita por rateio (§54) poder ser ligada. Isso é
   trabalho de cadastro, não de código. Quem preenche, e quando?

## O que destrava agora, sem decisão

- **Prompt J (Unidades):** BJ-1 respondido (data invertida na lista), BJ-2
  sem duplicatas, BJ-3 decidido. Pode começar.
- **Prompt I, Fase 1:** o inventário de arquivos e o script dos itens L, M,
  T, U e W. Só leitura.
