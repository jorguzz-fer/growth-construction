-- ROLLBACK da 0046 (ver docs/ROLLBACK.md).
--
-- Remove APENAS o índice único de (version_id, code). Nenhuma linha de "unit"
-- foi tocada pela 0046, então nada a exportar.

DROP INDEX IF EXISTS "unit_version_code_uq";

-- A linha da 0046 precisa sair do journal do drizzle para que a migração seja
-- reaplicada no próximo boot.
DELETE FROM drizzle.__drizzle_migrations
 WHERE hash IN (
   SELECT hash FROM drizzle.__drizzle_migrations ORDER BY created_at DESC LIMIT 1
 );
