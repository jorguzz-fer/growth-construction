-- ROLLBACK da 0053 (ver docs/ROLLBACK.md).
--
-- Remove a tabela de cartões. Cartões cadastrados depois da 0053 se perdem.
-- Exporte antes:
--   \copy (SELECT * FROM cartao_credito) TO 'cartao_credito.csv' CSV HEADER

DROP TABLE IF EXISTS "cartao_credito";

-- A linha da 0053 precisa sair do journal do drizzle para que a migração seja
-- reaplicada no próximo boot.
DELETE FROM drizzle.__drizzle_migrations
 WHERE hash IN (
   SELECT hash FROM drizzle.__drizzle_migrations ORDER BY created_at DESC LIMIT 1
 );
