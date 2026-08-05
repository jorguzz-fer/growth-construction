-- ---------------------------------------------------------------------------
-- DIAGNÓSTICO do Fluxo de Caixa — SOMENTE LEITURA.
--
-- Mostra, com os dados REAIS, exatamente o que alimenta as entradas e saídas de
-- cada mês, por projeto e por versão. Serve para responder "por que o mês X
-- está vazio?" sem depender de suposição.
--
--   psql "$DATABASE_URL" -f scripts/diagnostico-fluxo.sql > fluxo.txt
-- ---------------------------------------------------------------------------

\echo '=== (1) PANORAMA POR PROJETO ==='
-- Se "contas_receber" for 0, a tela Contas a Receber mostrará "0 lançadas" e a
-- receita virá SÓ dos planos de pagamento das unidades vendidas.
SELECT p.name AS projeto,
       (SELECT count(*) FROM unit u JOIN version v ON v.id = u.version_id
         WHERE v.project_id = p.id AND u.status = 'Vendido')        AS unidades_vendidas,
       (SELECT count(*) FROM unit u JOIN version v ON v.id = u.version_id
         WHERE v.project_id = p.id AND u.status <> 'Vendido')       AS unidades_nao_vendidas,
       (SELECT count(*) FROM conta_receber c
         WHERE c.project_id = p.id AND c.cancelado = false)         AS contas_receber,
       (SELECT COALESCE(sum(c.valor),0) FROM conta_receber c
         WHERE c.project_id = p.id AND c.cancelado = false)         AS total_contas_receber
FROM project p
ORDER BY p.name;

\echo ''
\echo '=== (2) CONTAS A RECEBER POR MÊS DE VENCIMENTO ==='
-- É exatamente o que getMonthlyRevenue soma na versão Atual.
-- Vencimento vazio ou fora do formato MM/DD/AAAA NÃO entra em mês nenhum.
SELECT p.name AS projeto,
       CASE WHEN c.vencimento ~ '^\d{2}/\d{2}/\d{4}$'
            THEN split_part(c.vencimento,'/',1) || '/' || split_part(c.vencimento,'/',3)
            ELSE '(SEM VENCIMENTO VÁLIDO)' END AS competencia,
       count(*) AS qtd,
       sum(c.valor) AS total
FROM conta_receber c
JOIN project p ON p.id = c.project_id
WHERE c.cancelado = false
GROUP BY 1,2
ORDER BY 1,2;

\echo ''
\echo '--- (2b) CONTAS A RECEBER SEM VENCIMENTO (invisíveis no Fluxo) ---'
SELECT p.name AS projeto, c.descricao, c.valor, c.vencimento, c.status
FROM conta_receber c
JOIN project p ON p.id = c.project_id
WHERE c.cancelado = false
  AND (c.vencimento IS NULL OR c.vencimento !~ '^\d{2}/\d{2}/\d{4}$');

\echo ''
\echo '=== (3) UNIDADES QUE NÃO GERAM RECEBÍVEL ==='
-- Só unidades "Vendido" com plano de pagamento geram receita. Cada linha aqui
-- é uma venda que NÃO aparece em nenhum relatório.
SELECT p.name AS projeto, u.code AS unidade, u.status,
       CASE WHEN u.payment_plan IS NULL THEN 'SEM PLANO' ELSE 'com plano' END AS plano
FROM unit u
JOIN version v ON v.id = u.version_id
JOIN project p ON p.id = v.project_id
WHERE u.status <> 'Vendido' OR u.payment_plan IS NULL
ORDER BY p.name, u.code;

\echo ''
\echo '=== (4) DESPESAS POR MÊS (saídas do Fluxo) ==='
-- O Fluxo usa o VENCIMENTO; sem vencimento, cai na competência. Canceladas e
-- pagas por terceiro não geram saída.
SELECT p.name AS projeto, v.kind AS versao,
       COALESCE(
         CASE WHEN d.vencimento ~ '^\d{2}/\d{2}/\d{4}$'
              THEN split_part(d.vencimento,'/',1) || '/' || split_part(d.vencimento,'/',3) END,
         d.competencia, '(SEM DATA)') AS competencia,
       count(*) AS qtd, sum(d.valor) AS total
FROM despesa d
JOIN version v ON v.id = d.version_id
JOIN project p ON p.id = v.project_id
WHERE d.cancelado = false AND d.pago_por_terceiro = false
GROUP BY 1,2,3
ORDER BY 1,2,3;

\echo ''
\echo '=== (5) VERSÕES POR PROJETO (a Atual é a mais antiga do tipo) ==='
-- Unidades e despesas são gravadas na versão ATUAL do projeto. Se houver mais
-- de uma versão "atual", os lançamentos podem estar espalhados entre elas.
SELECT p.name AS projeto, v.kind, v.label, v.created_at,
       (SELECT count(*) FROM unit u WHERE u.version_id = v.id)    AS unidades,
       (SELECT count(*) FROM despesa d WHERE d.version_id = v.id) AS despesas
FROM version v
JOIN project p ON p.id = v.project_id
ORDER BY p.name, v.kind, v.created_at;

\echo ''
\echo '=== (6) SALDO DAS CONTAS CORRENTES (ponto de partida do acumulado) ==='
SELECT banco, tipo, saldo, saldo_source
FROM bank_account
ORDER BY banco;
