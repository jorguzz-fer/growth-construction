-- ROLLBACK da 0056 (ver docs/ROLLBACK.md).
--
-- Remove o registro dos extratos de cartão e os estornos. Exporte antes:
--   \copy (SELECT * FROM estorno_cartao) TO 'estorno_cartao.csv' CSV HEADER
--   \copy (SELECT * FROM extrato_cartao) TO 'extrato_cartao.csv' CSV HEADER

DROP TABLE IF EXISTS "estorno_cartao";
DROP TABLE IF EXISTS "extrato_cartao";

-- A linha da 0056 precisa sair do journal do drizzle para que a migração seja
-- reaplicada no próximo boot.
DELETE FROM drizzle.__drizzle_migrations
 WHERE hash IN (
   SELECT hash FROM drizzle.__drizzle_migrations ORDER BY created_at DESC LIMIT 1
 );
