-- ============================================================================
-- SNAPSHOT DE CONFERÊNCIA — Seção 7.1 do pacote de Controladoria
--
-- Rode ANTES e DEPOIS de cada módulo/migração e compare os dois resultados.
-- Qualquer divergência precisa ser explicada, quantificada e aprovada antes do
-- deploy. Divergência não explicada = rollback.
--
--   psql "$DATABASE_URL" -f scripts/snapshot_conferencia.sql > antes.txt
--   ... aplicar a migração ...
--   psql "$DATABASE_URL" -f scripts/snapshot_conferencia.sql > depois.txt
--   diff antes.txt depois.txt
--
-- SOMENTE LEITURA. Este script não altera nenhum dado — só SELECTs.
-- ============================================================================

\pset pager off
\pset footer off

\echo '=== 1. LANÇAMENTOS POR COMPETÊNCIA E POR OBRA ==============================='
-- Critério: contagem IDÊNTICA antes/depois.
SELECT p.name              AS obra,
       d.competencia,
       count(*)            AS qtd,
       sum(d.valor)::numeric(18,2) AS total
  FROM despesa d
  JOIN version v ON v.id = d.version_id
  JOIN project p ON p.id = v.project_id
 GROUP BY 1, 2
 ORDER BY 1, 2;

\echo ''
\echo '=== 2. VALORES POR CATEGORIA DRE E COMPETÊNCIA =============================='
-- Critério: idêntico, salvo correção documentada em impacto_correcao_contabil.md.
SELECT coalesce(d.categoria_dre::text, '(sem categoria)') AS categoria_dre,
       d.competencia,
       count(*)                                          AS qtd,
       sum(d.valor)::numeric(18,2)                       AS total
  FROM despesa d
 WHERE d.cancelado = false
 GROUP BY 1, 2
 ORDER BY 1, 2;

\echo ''
\echo '=== 3. DRE POR COMPETÊNCIA (despesas por categoria) ========================='
-- Linha a linha, por versão — é o que a contabilidade confere.
SELECT v.kind        AS versao,
       p.name        AS obra,
       d.competencia,
       d.categoria_dre::text AS categoria,
       sum(d.valor)::numeric(18,2) AS total
  FROM despesa d
  JOIN version v ON v.id = d.version_id
  JOIN project p ON p.id = v.project_id
 WHERE d.cancelado = false
 GROUP BY 1, 2, 3, 4
 ORDER BY 1, 2, 3, 4;

\echo ''
\echo '=== 4. SALDO DE CAIXA POR CONTA BANCÁRIA E POR MÊS =========================='
-- Critério: IDÊNTICO. Nenhum módulo deste pacote pode mover caixa histórico.
SELECT coalesce(b.banco, '(sem conta)') AS conta,
       substring(c.data from 1 for 2) || '/' || substring(c.data from 7 for 4) AS mes,
       count(*)                    AS lancamentos,
       sum(c.valor)::numeric(18,2) AS total
  FROM cash_entry c
  LEFT JOIN bank_account b ON b.id = c.bank_account_id
 WHERE c.data IS NOT NULL AND length(c.data) = 10
 GROUP BY 1, 2
 ORDER BY 1, 2;

\echo ''
\echo '=== 5. SALDO POR TERCEIRO (devido / restituído / em aberto) ================='
-- Critério: IDÊNTICO. RG-03 — restituição não pode virar receita nem despesa.
SELECT coalesce(s.nome, '(não identificado)')            AS terceiro,
       count(dt.id)                                      AS obrigacoes,
       sum(dt.valor_total)::numeric(18,2)                AS total_devido,
       sum(dt.valor_restituido)::numeric(18,2)           AS total_restituido,
       (sum(dt.valor_total) - sum(dt.valor_restituido))::numeric(18,2) AS saldo_em_aberto
  FROM despesa_terceiro dt
  LEFT JOIN stakeholder s ON s.id = dt.pagador_terceiro_id
 WHERE dt.status <> 'Cancelado'
 GROUP BY 1
 ORDER BY 1;

\echo ''
\echo '=== 6. RECEBÍVEIS POR UNIDADE (planos de venda) ============================='
-- Critério: IDÊNTICO. CA-38 — planos contratados não mudam de parcela nem valor.
-- O plano é JSON; conferimos o conteúdo bruto por unidade.
SELECT p.name  AS obra,
       u.code  AS unidade,
       u.status,
       md5(coalesce(u.payment_plan::text, '')) AS hash_plano,
       length(coalesce(u.payment_plan::text, '')) AS tamanho_plano
  FROM unit u
  JOIN version v ON v.id = u.version_id
  JOIN project p ON p.id = v.project_id
 ORDER BY 1, 2;

\echo ''
\echo '=== 7. CONTAS A RECEBER LANÇADAS ==========================================='
SELECT p.name AS obra,
       cr.status,
       count(*)                     AS qtd,
       sum(cr.valor)::numeric(18,2) AS total
  FROM conta_receber cr
  JOIN project p ON p.id = cr.project_id
 WHERE cr.cancelado = false
 GROUP BY 1, 2
 ORDER BY 1, 2;

\echo ''
\echo '=== 8. REPOSITÓRIO: ARQUIVOS E VÍNCULOS ===================================='
-- Critério: contagem IDÊNTICA OU MAIOR, nunca menor (CA-37).
SELECT count(*)                                          AS arquivos,
       count(*) FILTER (WHERE despesa_id IS NOT NULL)    AS vinculados_a_despesa,
       count(*) FILTER (WHERE despesa_id IS NULL)        AS sem_vinculo_despesa,
       count(DISTINCT despesa_id)                        AS despesas_com_anexo
  FROM document;

\echo ''
\echo '=== 9. PEDs EMITIDOS ======================================================='
-- Critério: o conjunto anterior tem de estar INTEGRALMENTE contido no posterior
-- (CA-36). Nenhum PED existente pode sumir ou mudar de número/valor.
SELECT count(*)        AS total_peds,
       min(num_doc)    AS menor,
       max(num_doc)    AS maior,
       md5(string_agg(num_doc || '|' || valor::text, ',' ORDER BY num_doc)) AS hash_peds
  FROM despesa
 WHERE num_doc IS NOT NULL;

\echo ''
\echo '--- 9b. lista completa de PEDs (para diff linha a linha) ---'
SELECT num_doc, valor::numeric(18,2), competencia, cancelado
  FROM despesa
 WHERE num_doc IS NOT NULL
 ORDER BY num_doc;

\echo ''
\echo '=== 10. TOTAIS GERAIS POR TABELA ==========================================='
-- Visão de uma linha só: a primeira coisa a comparar no diff.
SELECT 'despesa'          AS tabela, count(*) AS linhas, sum(valor)::numeric(18,2) AS soma FROM despesa
UNION ALL SELECT 'despesa_parcela',  count(*), sum(valor_original)::numeric(18,2) FROM despesa_parcela
UNION ALL SELECT 'despesa_terceiro', count(*), sum(valor_total)::numeric(18,2)    FROM despesa_terceiro
UNION ALL SELECT 'restituicao',      count(*), sum(valor)::numeric(18,2)          FROM restituicao
UNION ALL SELECT 'pagamento',        count(*), sum(valor_total_pago)::numeric(18,2) FROM pagamento
UNION ALL SELECT 'cash_entry',       count(*), sum(valor)::numeric(18,2)          FROM cash_entry
UNION ALL SELECT 'conta_receber',    count(*), sum(valor)::numeric(18,2)          FROM conta_receber
UNION ALL SELECT 'unit',             count(*), NULL                               FROM unit
UNION ALL SELECT 'document',         count(*), NULL                               FROM document
UNION ALL SELECT 'budget_line',      count(*), sum(valor)::numeric(18,2)          FROM budget_line
 ORDER BY 1;

\echo ''
\echo '=== FIM DO SNAPSHOT ========================================================'
