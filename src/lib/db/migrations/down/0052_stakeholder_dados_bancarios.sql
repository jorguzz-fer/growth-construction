-- ROLLBACK da 0052 (ver docs/ROLLBACK.md).
--
-- Remove APENAS as colunas de dados bancários e PIX. Exporte antes, se houver algo:
--   \copy (SELECT id, nome, banco_nome, banco_agencia, banco_conta, banco_tipo_conta, banco_titular, pix_tipo, pix_chave FROM stakeholder WHERE pix_chave IS NOT NULL OR banco_conta IS NOT NULL)
--     TO 'stakeholder_dados_bancarios.csv' CSV HEADER

ALTER TABLE "stakeholder" DROP COLUMN IF EXISTS "pix_chave";
ALTER TABLE "stakeholder" DROP COLUMN IF EXISTS "pix_tipo";
ALTER TABLE "stakeholder" DROP COLUMN IF EXISTS "banco_titular";
ALTER TABLE "stakeholder" DROP COLUMN IF EXISTS "banco_tipo_conta";
ALTER TABLE "stakeholder" DROP COLUMN IF EXISTS "banco_conta";
ALTER TABLE "stakeholder" DROP COLUMN IF EXISTS "banco_agencia";
ALTER TABLE "stakeholder" DROP COLUMN IF EXISTS "banco_nome";

-- A linha da 0052 precisa sair do journal do drizzle para que a migração seja
-- reaplicada no próximo boot.
DELETE FROM drizzle.__drizzle_migrations
 WHERE hash IN (
   SELECT hash FROM drizzle.__drizzle_migrations ORDER BY created_at DESC LIMIT 1
 );
