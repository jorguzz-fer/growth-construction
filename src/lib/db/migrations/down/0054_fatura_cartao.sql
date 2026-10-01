-- ROLLBACK da 0054 (ver docs/ROLLBACK.md).
--
-- Remove o vínculo compra→fatura e a tabela de faturas. As compras (despesas e
-- parcelas) FICAM; só perdem o vínculo com a fatura. Exporte antes:
--   \copy (SELECT * FROM fatura_cartao) TO 'fatura_cartao.csv' CSV HEADER
--   \copy (SELECT id, despesa_id, fatura_id FROM despesa_parcela WHERE fatura_id IS NOT NULL) TO 'despesa_parcela_fatura.csv' CSV HEADER
--   \copy (SELECT id, cartao_id FROM despesa WHERE cartao_id IS NOT NULL) TO 'despesa_cartao.csv' CSV HEADER

ALTER TABLE "despesa_parcela" DROP COLUMN IF EXISTS "fatura_id";
ALTER TABLE "despesa" DROP COLUMN IF EXISTS "cartao_id";
DROP TABLE IF EXISTS "fatura_cartao";

-- A linha da 0054 precisa sair do journal do drizzle para que a migração seja
-- reaplicada no próximo boot.
DELETE FROM drizzle.__drizzle_migrations
 WHERE hash IN (
   SELECT hash FROM drizzle.__drizzle_migrations ORDER BY created_at DESC LIMIT 1
 );
