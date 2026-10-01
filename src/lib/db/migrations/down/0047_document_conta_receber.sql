-- ROLLBACK da 0047 (ver docs/ROLLBACK.md).
--
-- Remove APENAS a coluna de vínculo com conta a receber. Os documentos ficam;
-- só perdem o vínculo. Exporte antes, se houver algum:
--   \copy (SELECT id, conta_receber_id, filename, storage_key FROM document WHERE conta_receber_id IS NOT NULL)
--     TO 'document_conta_receber.csv' CSV HEADER

DROP INDEX IF EXISTS "document_conta_receber_idx";
ALTER TABLE "document" DROP COLUMN IF EXISTS "conta_receber_id";

-- A linha da 0047 precisa sair do journal do drizzle para que a migração seja
-- reaplicada no próximo boot.
DELETE FROM drizzle.__drizzle_migrations
 WHERE hash IN (
   SELECT hash FROM drizzle.__drizzle_migrations ORDER BY created_at DESC LIMIT 1
 );
