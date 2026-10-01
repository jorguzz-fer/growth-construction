-- ROLLBACK da 0057 (ver docs/ROLLBACK.md).
--
-- Remove só a coluna "ativo". Contas inativadas voltam a contar no total.
-- Exporte antes: \copy (SELECT id, banco, cc, ativo FROM bank_account WHERE NOT ativo) TO 'bank_account_inativas.csv' CSV HEADER

ALTER TABLE "bank_account" DROP COLUMN IF EXISTS "ativo";

-- A linha da 0057 precisa sair do journal do drizzle para que a migração seja
-- reaplicada no próximo boot.
DELETE FROM drizzle.__drizzle_migrations
 WHERE hash IN (
   SELECT hash FROM drizzle.__drizzle_migrations ORDER BY created_at DESC LIMIT 1
 );
