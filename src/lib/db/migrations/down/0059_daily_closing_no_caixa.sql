-- ROLLBACK da 0059 (ver docs/ROLLBACK.md).
--
-- Remove o índice único parcial e as seis colunas novas de daily_closing.
-- Os fechamentos gravados FICAM (as colunas antigas não mudaram). Exporte antes:
--   \copy (SELECT * FROM daily_closing) TO 'daily_closing.csv' CSV HEADER

DROP INDEX IF EXISTS "daily_closing_tenant_dia_aberto_uq";
ALTER TABLE "daily_closing" DROP COLUMN IF EXISTS "saldo_em_conta";
ALTER TABLE "daily_closing" DROP COLUMN IF EXISTS "ajustes";
ALTER TABLE "daily_closing" DROP COLUMN IF EXISTS "naturezas";
ALTER TABLE "daily_closing" DROP COLUMN IF EXISTS "reaberto_em";
ALTER TABLE "daily_closing" DROP COLUMN IF EXISTS "reaberto_por";
ALTER TABLE "daily_closing" DROP COLUMN IF EXISTS "motivo_reabertura";

-- A linha da 0059 precisa sair do journal do drizzle para que a migração seja
-- reaplicada no próximo boot.
DELETE FROM drizzle.__drizzle_migrations
 WHERE hash IN (
   SELECT hash FROM drizzle.__drizzle_migrations ORDER BY created_at DESC LIMIT 1
 );
