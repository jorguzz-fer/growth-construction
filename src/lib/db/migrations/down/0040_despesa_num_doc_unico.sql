-- ROLLBACK da 0040 (ver docs/ROLLBACK.md).
--
-- Remove APENAS o índice único de número de despesa. Nenhuma despesa, número
-- ou sequência é tocada: some só a garantia do banco contra PED repetido
-- (a trava da tela de Numeração continua valendo).

DROP INDEX IF EXISTS "despesa_tenant_num_doc_uq";

-- A linha da 0040 precisa sair do journal do drizzle para que a migração seja
-- reaplicada no próximo boot.
DELETE FROM drizzle.__drizzle_migrations
 WHERE hash IN (
   SELECT hash FROM drizzle.__drizzle_migrations ORDER BY created_at DESC LIMIT 1
 );
