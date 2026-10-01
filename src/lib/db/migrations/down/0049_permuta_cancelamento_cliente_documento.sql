-- ROLLBACK da 0049 (ver docs/ROLLBACK.md).
--
-- Remove APENAS as colunas novas. Ativos cancelados voltam a aparecer como
-- ativos (o cancelamento é só uma marca); documentos ficam, só perdem o
-- vínculo com a permuta. Exporte antes, se houver algo:
--   \copy (SELECT id, cancelado, cancelado_em, cancelado_por, motivo_cancelamento, cliente_id FROM permuta WHERE cancelado OR cliente_id IS NOT NULL)
--     TO 'permuta_0049.csv' CSV HEADER
--   \copy (SELECT id, permuta_id, filename, storage_key FROM document WHERE permuta_id IS NOT NULL)
--     TO 'document_permuta.csv' CSV HEADER

DROP INDEX IF EXISTS "document_permuta_idx";
ALTER TABLE "document" DROP COLUMN IF EXISTS "permuta_id";
DROP INDEX IF EXISTS "permuta_cliente_idx";
ALTER TABLE "permuta" DROP COLUMN IF EXISTS "cliente_id";
ALTER TABLE "permuta" DROP COLUMN IF EXISTS "motivo_cancelamento";
ALTER TABLE "permuta" DROP COLUMN IF EXISTS "cancelado_por";
ALTER TABLE "permuta" DROP COLUMN IF EXISTS "cancelado_em";
ALTER TABLE "permuta" DROP COLUMN IF EXISTS "cancelado";

-- A linha da 0049 precisa sair do journal do drizzle para que a migração seja
-- reaplicada no próximo boot.
DELETE FROM drizzle.__drizzle_migrations
 WHERE hash IN (
   SELECT hash FROM drizzle.__drizzle_migrations ORDER BY created_at DESC LIMIT 1
 );
