-- ROLLBACK da 0060 (ver docs/ROLLBACK.md).
--
-- Remove as três colunas e os índices. Movimentos de estorno (linhas de
-- stock_movement) FICAM; só perdem a ligação com o original. Documentos de
-- movimento FICAM em document, sem o vínculo. Exporte antes:
--   \copy (SELECT id, estorno_de_id FROM stock_movement WHERE estorno_de_id IS NOT NULL) TO 'estornos.csv' CSV HEADER
--   \copy (SELECT id, stock_movement_id FROM document WHERE stock_movement_id IS NOT NULL) TO 'docs_estoque.csv' CSV HEADER

DROP INDEX IF EXISTS "document_stock_movement_idx";
DROP INDEX IF EXISTS "stock_movement_estorno_idx";
ALTER TABLE "document" DROP COLUMN IF EXISTS "stock_movement_id";
ALTER TABLE "stock_movement" DROP COLUMN IF EXISTS "estorno_de_id";
ALTER TABLE "stock_item" DROP COLUMN IF EXISTS "ativo";

-- A linha da 0060 precisa sair do journal do drizzle para que a migração seja
-- reaplicada no próximo boot.
DELETE FROM drizzle.__drizzle_migrations
 WHERE hash IN (
   SELECT hash FROM drizzle.__drizzle_migrations ORDER BY created_at DESC LIMIT 1
 );
