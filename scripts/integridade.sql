-- ---------------------------------------------------------------------------
-- Relatório de INTEGRIDADE (Fase 1) — somente leitura.
--
-- Rode ANTES e DEPOIS de cada migração/correção e compare as duas saídas.
-- Requisito do projeto: comprovar zero perda de dados e conferir que os totais
-- financeiros não mudaram. Qualquer divergência não intencional = rollback.
--
--   psql "$DATABASE_URL" -f scripts/integridade.sql > antes.txt
--   ... aplica a migração ...
--   psql "$DATABASE_URL" -f scripts/integridade.sql > depois.txt
--   diff antes.txt depois.txt
-- ---------------------------------------------------------------------------

\echo '=== 1. CONTAGEM DE REGISTROS POR TABELA ==='
SELECT 'despesa'          AS tabela, count(*) AS registros FROM despesa
UNION ALL SELECT 'document',         count(*) FROM document
UNION ALL SELECT 'conta_receber',    count(*) FROM conta_receber
UNION ALL SELECT 'cash_entry',       count(*) FROM cash_entry
UNION ALL SELECT 'despesa_terceiro', count(*) FROM despesa_terceiro
UNION ALL SELECT 'restituicao',      count(*) FROM restituicao
UNION ALL SELECT 'pagamento',        count(*) FROM pagamento
UNION ALL SELECT 'bank_account',     count(*) FROM bank_account
UNION ALL SELECT 'unit',             count(*) FROM unit
UNION ALL SELECT 'cliente',          count(*) FROM cliente
UNION ALL SELECT 'stakeholder',      count(*) FROM stakeholder
UNION ALL SELECT 'project',          count(*) FROM project
UNION ALL SELECT 'version',          count(*) FROM version
UNION ALL SELECT 'medicao',          count(*) FROM medicao
UNION ALL SELECT 'daily_closing',    count(*) FROM daily_closing
UNION ALL SELECT 'permuta',          count(*) FROM permuta
UNION ALL SELECT 'reembolso',        count(*) FROM reembolso
ORDER BY tabela;

\echo ''
\echo '=== 2. TOTAIS FINANCEIROS (devem permanecer idênticos) ==='
SELECT 'despesa: soma valor'              AS metrica, COALESCE(sum(valor),0) AS total FROM despesa
UNION ALL SELECT 'despesa: soma NAO cancelada', COALESCE(sum(valor),0) FROM despesa WHERE cancelado = false
UNION ALL SELECT 'conta_receber: soma valor',   COALESCE(sum(valor),0) FROM conta_receber
UNION ALL SELECT 'conta_receber: recebido',     COALESCE(sum(valor_recebido),0) FROM conta_receber
UNION ALL SELECT 'cash_entry: soma valor',      COALESCE(sum(valor),0) FROM cash_entry
UNION ALL SELECT 'cash_entry: entradas',        COALESCE(sum(valor),0) FROM cash_entry WHERE valor > 0
UNION ALL SELECT 'cash_entry: saidas',          COALESCE(sum(valor),0) FROM cash_entry WHERE valor < 0
UNION ALL SELECT 'restituicao: soma valor',     COALESCE(sum(valor),0) FROM restituicao
UNION ALL SELECT 'despesa_terceiro: total',     COALESCE(sum(valor_total),0) FROM despesa_terceiro
UNION ALL SELECT 'despesa_terceiro: restituido',COALESCE(sum(valor_restituido),0) FROM despesa_terceiro
UNION ALL SELECT 'bank_account: saldo',         COALESCE(sum(saldo),0) FROM bank_account
UNION ALL SELECT 'medicao: soma valor',         COALESCE(sum(valor),0) FROM medicao;

\echo ''
\echo '=== 3. VÍNCULOS DE ANEXOS (nenhum arquivo pode se desvincular) ==='
SELECT count(*) AS documentos_total,
       count(*) FILTER (WHERE despesa_id IS NOT NULL) AS vinculados_a_despesa,
       count(*) FILTER (WHERE despesa_id IS NULL)     AS sem_despesa,
       count(DISTINCT despesa_id)                     AS despesas_com_anexo
FROM document;

\echo ''
\echo '=== 4. REGISTROS ÓRFÃOS (esperado: zero em todas as linhas) ==='
SELECT 'despesa sem version'  AS problema, count(*) AS qtd
  FROM despesa d LEFT JOIN version v ON v.id = d.version_id WHERE v.id IS NULL
UNION ALL
SELECT 'document.despesa_id inexistente', count(*)
  FROM document dc LEFT JOIN despesa d ON d.id = dc.despesa_id
  WHERE dc.despesa_id IS NOT NULL AND d.id IS NULL
UNION ALL
SELECT 'cash_entry sem version', count(*)
  FROM cash_entry c LEFT JOIN version v ON v.id = c.version_id WHERE v.id IS NULL
UNION ALL
SELECT 'restituicao sem despesa_terceiro', count(*)
  FROM restituicao r LEFT JOIN despesa_terceiro t ON t.id = r.despesa_terceiro_id
  WHERE t.id IS NULL
UNION ALL
SELECT 'despesa_terceiro sem despesa', count(*)
  FROM despesa_terceiro t LEFT JOIN despesa d ON d.id = t.despesa_id WHERE d.id IS NULL
UNION ALL
SELECT 'version sem project', count(*)
  FROM version v LEFT JOIN project p ON p.id = v.project_id WHERE p.id IS NULL;

\echo ''
\echo '=== 5. DESPESAS POR KIND DE VERSÃO (diagnostica o caso 26178) ==='
-- Despesas fora da versão "atual" aparecem em Contas a Pagar mas somem da tela
-- de Despesas/Lançamentos (que é escopada à versão atual).
SELECT v.kind, count(*) AS despesas, COALESCE(sum(d.valor),0) AS total
FROM despesa d JOIN version v ON v.id = d.version_id
GROUP BY v.kind ORDER BY v.kind;
