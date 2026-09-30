-- ROLLBACK da 0043 (ver docs/ROLLBACK.md).
--
-- Remove APENAS a tabela de chaves por empresa. Toda chave volta a valer como
-- desligada — o comportamento de antes. Nenhum lançamento é tocado. Para
-- guardar o estado das chaves antes:
--   \copy (SELECT * FROM tenant_flag) TO 'tenant_flag.csv' CSV HEADER

DROP TABLE IF EXISTS "tenant_flag";

-- A linha da 0043 precisa sair do journal do drizzle para que a migração seja
-- reaplicada no próximo boot.
DELETE FROM drizzle.__drizzle_migrations
 WHERE hash IN (
   SELECT hash FROM drizzle.__drizzle_migrations ORDER BY created_at DESC LIMIT 1
 );
