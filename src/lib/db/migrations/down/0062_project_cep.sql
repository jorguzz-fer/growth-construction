-- ROLLBACK da 0062 (ver docs/ROLLBACK.md).
--
-- Remove a coluna "cep" de project. O que foi digitado nela se perde — exporte
-- antes:
--   \copy (SELECT id, name, cep FROM project WHERE cep IS NOT NULL) TO 'project_cep.csv' CSV HEADER

ALTER TABLE "project" DROP COLUMN IF EXISTS "cep";

-- A linha da 0062 precisa sair do journal do drizzle para que a migração seja
-- reaplicada no próximo boot.
DELETE FROM drizzle.__drizzle_migrations
 WHERE hash IN (
   SELECT hash FROM drizzle.__drizzle_migrations ORDER BY created_at DESC LIMIT 1
 );
