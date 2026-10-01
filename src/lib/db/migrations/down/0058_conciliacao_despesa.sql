-- ROLLBACK da 0058 (ver docs/ROLLBACK.md).
--
-- Remove a tabela de vínculos com valor. Os "pagamento" gerados pelos vínculos
-- e as quatro colunas antigas de cash_entry FICAM. Exporte antes:
--   \copy (SELECT * FROM conciliacao_despesa) TO 'conciliacao_despesa.csv' CSV HEADER

DROP TABLE IF EXISTS "conciliacao_despesa";

-- A linha da 0058 precisa sair do journal do drizzle para que a migração seja
-- reaplicada no próximo boot.
DELETE FROM drizzle.__drizzle_migrations
 WHERE hash IN (
   SELECT hash FROM drizzle.__drizzle_migrations ORDER BY created_at DESC LIMIT 1
 );
