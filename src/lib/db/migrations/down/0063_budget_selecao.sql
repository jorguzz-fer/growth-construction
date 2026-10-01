-- ROLLBACK da 0063 (ver docs/ROLLBACK.md).
--
-- Remove a tabela de seleção de linhas. Os orçamentos voltam a mostrar os
-- grupos padrão; budget_account e budget_line não são tocados. Exporte antes:
--   \copy (SELECT version_id, kind, row_key, ordem FROM budget_selecao) TO 'budget_selecao.csv' CSV HEADER

DROP INDEX IF EXISTS "budget_selecao_version_idx";
DROP TABLE IF EXISTS "budget_selecao";

-- A linha da 0063 precisa sair do journal do drizzle para que a migração seja
-- reaplicada no próximo boot.
DELETE FROM drizzle.__drizzle_migrations
 WHERE hash IN (
   SELECT hash FROM drizzle.__drizzle_migrations ORDER BY created_at DESC LIMIT 1
 );
