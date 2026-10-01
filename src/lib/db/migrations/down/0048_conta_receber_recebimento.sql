-- ROLLBACK da 0048 (ver docs/ROLLBACK.md).
--
-- Remove a tabela de recebimentos. Recebimentos feitos depois da 0048 se
-- perdem (a coluna "valor_recebido" de conta_receber continua com o cache
-- da soma). Exporte antes:
--   \copy (SELECT * FROM conta_receber_recebimento) TO 'conta_receber_recebimento.csv' CSV HEADER

DROP TABLE IF EXISTS "conta_receber_recebimento";

-- A linha da 0048 precisa sair do journal do drizzle para que a migração seja
-- reaplicada no próximo boot.
DELETE FROM drizzle.__drizzle_migrations
 WHERE hash IN (
   SELECT hash FROM drizzle.__drizzle_migrations ORDER BY created_at DESC LIMIT 1
 );
