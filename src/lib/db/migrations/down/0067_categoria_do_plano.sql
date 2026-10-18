-- ROLLBACK da 0067 (ver docs/ROLLBACK.md).
--
-- Remove a categoria da DRE escolhida por conta. As despesas não são afetadas
-- (a coluna delas é outra). Exporte antes, se quiser guardar as escolhas:
--   \copy (SELECT tenant_id, code, dre_category FROM chart_account WHERE dre_category IS NOT NULL) TO 'categoria_do_plano.csv' CSV HEADER

ALTER TABLE "chart_account" DROP COLUMN IF EXISTS "dre_category";

DELETE FROM drizzle.__drizzle_migrations
 WHERE hash IN (
   SELECT hash FROM drizzle.__drizzle_migrations ORDER BY created_at DESC LIMIT 1
 );
