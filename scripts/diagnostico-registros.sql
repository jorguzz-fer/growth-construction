-- ---------------------------------------------------------------------------
-- DIAGNÓSTICO dos registros suspeitos (Fase 2) — SOMENTE LEITURA.
--
-- Este script NÃO altera, NÃO apaga e NÃO inativa nada. Ele apenas produz o
-- relatório exigido antes de qualquer correção:
--   (a) registro "26178" — aparece em Contas a Pagar mas não em Despesas;
--   (b) PED-000070..073 — exibidos como "receitas pagas de valor zero";
--   (c) varredura geral de valores zerados e de despesas fora da versão atual.
--
--   psql "$DATABASE_URL" -f scripts/diagnostico-registros.sql > diagnostico.txt
-- ---------------------------------------------------------------------------

\echo '=== (A) REGISTRO 26178 — busca ampla por num_doc/obs ==='
-- Hipótese da auditoria de código: a despesa existe, porém numa versão cujo
-- kind != 'atual'. getContasPagar não filtra kind (mostra), enquanto a tela de
-- Despesas é escopada à versão atual (esconde) — e o deep-link ?edit= falha.
SELECT d.id,
       d.num_doc,
       d.valor,
       d.status,
       d.cancelado,
       d.competencia,
       d.vencimento,
       d.categoria_dre,
       v.kind        AS version_kind,
       v.id          AS version_id,
       p.name        AS projeto,
       p.kind        AS projeto_kind,
       s.nome        AS fornecedor,
       d.created_at
FROM despesa d
JOIN version v ON v.id = d.version_id
JOIN project p ON p.id = v.project_id
LEFT JOIN stakeholder s ON s.id = d.fornecedor_id
WHERE d.num_doc ILIKE '%26178%'
   OR d.obs     ILIKE '%26178%'
ORDER BY d.created_at;

\echo ''
\echo '--- (A2) A versão dessa despesa é a MESMA "atual" do projeto? ---'
-- Se version_kind <> 'atual', a causa-raiz está confirmada: o registro é
-- invisível na tela de Despesas por escopo de versão, não por exclusão.
SELECT d.num_doc,
       v.kind                              AS versao_da_despesa,
       (SELECT va.id FROM version va
         WHERE va.project_id = v.project_id AND va.kind = 'atual'
         ORDER BY va.created_at LIMIT 1)    AS versao_atual_do_projeto,
       d.version_id                         AS versao_gravada_na_despesa,
       CASE WHEN d.version_id = (SELECT va.id FROM version va
                                  WHERE va.project_id = v.project_id AND va.kind='atual'
                                  ORDER BY va.created_at LIMIT 1)
            THEN 'VISÍVEL em Despesas'
            ELSE 'INVISÍVEL em Despesas (causa-raiz confirmada)'
       END AS diagnostico
FROM despesa d
JOIN version v ON v.id = d.version_id
WHERE d.num_doc ILIKE '%26178%' OR d.obs ILIKE '%26178%';

\echo ''
\echo '--- (A3) Dependências do registro (nada pode ser apagado sem revisar) ---'
SELECT d.num_doc,
       (SELECT count(*) FROM document        x WHERE x.despesa_id = d.id) AS anexos,
       (SELECT count(*) FROM pagamento       x WHERE x.despesa_id = d.id) AS pagamentos,
       (SELECT count(*) FROM despesa_terceiro x WHERE x.despesa_id = d.id) AS obrig_terceiros,
       (SELECT count(*) FROM cash_entry      x WHERE x.conciliado_despesa_id = d.id) AS mov_conciliados
FROM despesa d
WHERE d.num_doc ILIKE '%26178%' OR d.obs ILIKE '%26178%';

\echo ''
\echo '=== (B) PED-000070..073 — receitas pagas de valor zero ==='
-- "PED" é o prefixo de numeração de DESPESA. Uma despesa com
-- categoria_dre='Receita' é contabilizada como receita na DRE.
SELECT d.id, d.num_doc, d.valor, d.status, d.categoria_dre, d.cancelado,
       d.competencia, d.vencimento, d.obs,
       v.kind AS version_kind, p.name AS projeto,
       d.created_at
FROM despesa d
JOIN version v ON v.id = d.version_id
JOIN project p ON p.id = v.project_id
WHERE d.num_doc IN ('PED-000070','PED-000071','PED-000072','PED-000073')
ORDER BY d.num_doc;

\echo ''
\echo '--- (B2) Foram criados em lote? (indício do loop de despesa recorrente) ---'
-- Se os created_at forem quase idênticos, confirma geração automática pelo
-- laço "recorrente" de addDespesa, que replica o mesmo valor (inclusive 0).
SELECT date_trunc('second', d.created_at) AS criado_em,
       count(*)                            AS qtd,
       min(d.num_doc) AS de, max(d.num_doc) AS ate,
       array_agg(DISTINCT d.valor)         AS valores,
       array_agg(DISTINCT d.categoria_dre) AS categorias
FROM despesa d
WHERE d.num_doc IN ('PED-000070','PED-000071','PED-000072','PED-000073')
GROUP BY 1 ORDER BY 1;

\echo ''
\echo '--- (B3) Dependências dos PED zerados (antes de inativar) ---'
SELECT d.num_doc,
       (SELECT count(*) FROM document         x WHERE x.despesa_id = d.id) AS anexos,
       (SELECT count(*) FROM pagamento        x WHERE x.despesa_id = d.id) AS pagamentos,
       (SELECT count(*) FROM despesa_terceiro x WHERE x.despesa_id = d.id) AS obrig_terceiros,
       (SELECT count(*) FROM cash_entry       x WHERE x.conciliado_despesa_id = d.id) AS mov_conciliados
FROM despesa d
WHERE d.num_doc IN ('PED-000070','PED-000071','PED-000072','PED-000073');

\echo ''
\echo '=== (C) VARREDURA GERAL DE VALORES ZERADOS ==='
\echo '--- (C1) Todas as despesas com valor 0 (não apenas as citadas) ---'
SELECT d.num_doc, d.valor, d.status, d.categoria_dre, d.cancelado,
       p.name AS projeto, d.created_at
FROM despesa d
JOIN version v ON v.id = d.version_id
JOIN project p ON p.id = v.project_id
WHERE d.valor = 0 AND d.cancelado = false
ORDER BY d.created_at DESC
LIMIT 200;

\echo ''
\echo '--- (C2) Contas a receber com valor 0 ---'
-- Caminho de código suspeito: criarContaFromExtrato trata "valor = 0" no ramo
-- ELSE (entrada) e cria conta a receber "Recebido" de valor zero.
SELECT cr.id, cr.descricao, cr.valor, cr.valor_recebido, cr.status,
       cr.origem_cash_entry_id, cr.created_at
FROM conta_receber cr
WHERE cr.valor = 0 AND cr.cancelado = false
ORDER BY cr.created_at DESC
LIMIT 200;

\echo ''
\echo '--- (C3) Resumo: quantos zerados existem por origem ---'
SELECT 'despesa valor=0 (ativas)'            AS origem, count(*) AS qtd FROM despesa       WHERE valor = 0 AND cancelado = false
UNION ALL SELECT 'despesa valor=0 categoria Receita', count(*) FROM despesa WHERE valor = 0 AND cancelado = false AND categoria_dre = 'Receita'
UNION ALL SELECT 'conta_receber valor=0 (ativas)',    count(*) FROM conta_receber WHERE valor = 0 AND cancelado = false
UNION ALL SELECT 'cash_entry valor=0',                count(*) FROM cash_entry    WHERE valor = 0;

\echo ''
\echo '=== (D) DESPESAS FORA DA VERSÃO ATUAL (mesmo sintoma da 26178) ==='
-- Toda linha aqui é um registro visível em Contas a Pagar e invisível/inelegível
-- para edição na tela de Despesas. Mostra a dimensão real do problema.
SELECT p.name AS projeto, v.kind AS version_kind,
       count(*) AS despesas, COALESCE(sum(d.valor),0) AS total
FROM despesa d
JOIN version v ON v.id = d.version_id
JOIN project p ON p.id = v.project_id
WHERE v.kind <> 'atual' AND d.cancelado = false
GROUP BY p.name, v.kind
ORDER BY total DESC;
