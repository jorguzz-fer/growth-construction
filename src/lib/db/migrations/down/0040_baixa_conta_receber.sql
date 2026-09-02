-- ROLLBACK da 0040 (ver docs/ROLLBACK.md).
--
-- Remove APENAS os dois índices criados pela 0040. Como a 0040 não gravou,
-- alterou nem apagou nenhum dado, este rollback é totalmente inócuo do ponto de
-- vista contábil: as baixas já registradas continuam existindo (são linhas de
-- `cash_entry` com `conciliado_conta_receber_id` preenchido) e os saldos das
-- contas a receber permanecem intactos. O único efeito é a tela de Contas a
-- Receber voltar a ficar mais lenta.

DROP INDEX IF EXISTS "cash_entry_conta_receber_idx";
DROP INDEX IF EXISTS "conta_receber_tenant_venc_idx";

-- A linha da 0040 precisa sair do journal do drizzle para que a migração seja
-- reaplicada no próximo boot.
DELETE FROM drizzle.__drizzle_migrations
 WHERE hash IN (
   SELECT hash FROM drizzle.__drizzle_migrations ORDER BY created_at DESC LIMIT 1
 );
