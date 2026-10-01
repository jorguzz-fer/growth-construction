-- ROLLBACK da 0064 (ver docs/ROLLBACK.md).
--
-- Remove o autor da medição e o vínculo documento → medição. Os documentos
-- FICAM em document, sem o vínculo. Exporte antes:
--   \copy (SELECT id, created_by FROM medicao WHERE created_by IS NOT NULL) TO 'medicao_autor.csv' CSV HEADER
--   \copy (SELECT id, medicao_id FROM document WHERE medicao_id IS NOT NULL) TO 'document_medicao.csv' CSV HEADER

ALTER TABLE "document" DROP COLUMN IF EXISTS "medicao_id";
ALTER TABLE "medicao" DROP COLUMN IF EXISTS "created_by";

-- A linha da 0064 precisa sair do journal do drizzle para que a migração seja
-- reaplicada no próximo boot.
DELETE FROM drizzle.__drizzle_migrations
 WHERE hash IN (
   SELECT hash FROM drizzle.__drizzle_migrations ORDER BY created_at DESC LIMIT 1
 );
