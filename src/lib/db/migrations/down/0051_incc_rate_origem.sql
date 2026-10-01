-- ROLLBACK da 0051 (ver docs/ROLLBACK.md).
--
-- Remove APENAS as colunas de variante e origem. Nenhum índice muda. Exporte
-- antes, se houver algo:
--   \copy (SELECT project_id, mes, variante, fonte, informado_por, informado_em FROM incc_rate WHERE informado_por IS NOT NULL OR variante IS NOT NULL)
--     TO 'incc_rate_origem.csv' CSV HEADER

ALTER TABLE "incc_rate" DROP COLUMN IF EXISTS "informado_em";
ALTER TABLE "incc_rate" DROP COLUMN IF EXISTS "informado_por";
ALTER TABLE "incc_rate" DROP COLUMN IF EXISTS "fonte";
ALTER TABLE "incc_rate" DROP COLUMN IF EXISTS "variante";

-- A linha da 0051 precisa sair do journal do drizzle para que a migração seja
-- reaplicada no próximo boot.
DELETE FROM drizzle.__drizzle_migrations
 WHERE hash IN (
   SELECT hash FROM drizzle.__drizzle_migrations ORDER BY created_at DESC LIMIT 1
 );
