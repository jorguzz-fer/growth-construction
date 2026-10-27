-- ROLLBACK da 0071 (ver docs/ROLLBACK.md). Só remove índices: nenhum dado é tocado.
DROP INDEX IF EXISTS "despesa_version_idx";
DROP INDEX IF EXISTS "pagamento_despesa_idx";
DROP INDEX IF EXISTS "conta_receber_project_idx";
DROP INDEX IF EXISTS "permuta_version_idx";
DROP INDEX IF EXISTS "reembolso_version_idx";

-- A linha da 0071 precisa sair do journal do drizzle para que a migração seja
-- reaplicada no próximo boot.
DELETE FROM drizzle.__drizzle_migrations
 WHERE hash IN (
   SELECT hash FROM drizzle.__drizzle_migrations ORDER BY created_at DESC LIMIT 1
 );
