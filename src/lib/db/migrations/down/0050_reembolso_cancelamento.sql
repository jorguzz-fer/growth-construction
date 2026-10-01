-- ROLLBACK da 0050 (ver docs/ROLLBACK.md).
--
-- Remove APENAS as colunas de cancelamento. Liberações canceladas voltam a
-- contar como ativas (o cancelamento é só uma marca). Exporte antes:
--   \copy (SELECT id, cancelado_em, cancelado_por, motivo_cancelamento FROM reembolso WHERE cancelado)
--     TO 'reembolso_cancelados.csv' CSV HEADER

ALTER TABLE "reembolso" DROP COLUMN IF EXISTS "motivo_cancelamento";
ALTER TABLE "reembolso" DROP COLUMN IF EXISTS "cancelado_por";
ALTER TABLE "reembolso" DROP COLUMN IF EXISTS "cancelado_em";
ALTER TABLE "reembolso" DROP COLUMN IF EXISTS "cancelado";

-- A linha da 0050 precisa sair do journal do drizzle para que a migração seja
-- reaplicada no próximo boot.
DELETE FROM drizzle.__drizzle_migrations
 WHERE hash IN (
   SELECT hash FROM drizzle.__drizzle_migrations ORDER BY created_at DESC LIMIT 1
 );
