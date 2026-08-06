-- ROLLBACK da 0034 (ver docs/ROLLBACK.md).
--
-- Remove APENAS o que a 0034 criou: colunas nuláveis e índices. Nenhum dado de
-- negócio é perdido — as colunas removidas só guardam a chave de idempotência e
-- o vínculo da restituição com o item do extrato. Restituições, obrigações,
-- despesas, valores, competências e números PED permanecem intactos.
--
-- Após rodar este script a 0034 pode ser reaplicada (todas as instruções dela
-- usam IF NOT EXISTS).

DROP INDEX IF EXISTS "despesa_terceiro_despesa_ativa_uq";
DROP INDEX IF EXISTS "despesa_terceiro_idem_uq";
DROP INDEX IF EXISTS "restituicao_idem_uq";

ALTER TABLE "restituicao" DROP CONSTRAINT IF EXISTS "restituicao_cash_entry_id_cash_entry_id_fk";

ALTER TABLE "despesa_terceiro" DROP COLUMN IF EXISTS "idempotency_key";
ALTER TABLE "restituicao" DROP COLUMN IF EXISTS "idempotency_key";
ALTER TABLE "restituicao" DROP COLUMN IF EXISTS "cash_entry_id";

-- A linha da 0034 precisa sair do journal do drizzle para que a migration seja
-- reaplicada no próximo boot.
DELETE FROM drizzle.__drizzle_migrations
 WHERE hash IN (
   SELECT hash FROM drizzle.__drizzle_migrations ORDER BY created_at DESC LIMIT 1
 );
