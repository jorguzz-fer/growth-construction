-- ROLLBACK da 0044 (ver docs/ROLLBACK.md).
--
-- Remove APENAS a chave de idempotência dos pagamentos. Nenhum pagamento,
-- parcela ou movimento de caixa é tocado.

DROP INDEX IF EXISTS "pagamento_idem_uq";
ALTER TABLE "pagamento" DROP COLUMN IF EXISTS "idempotency_key";

-- A linha da 0044 precisa sair do journal do drizzle para que a migração seja
-- reaplicada no próximo boot.
DELETE FROM drizzle.__drizzle_migrations
 WHERE hash IN (
   SELECT hash FROM drizzle.__drizzle_migrations ORDER BY created_at DESC LIMIT 1
 );
