-- ROLLBACK da 0045 (ver docs/ROLLBACK.md).
--
-- Remove APENAS as colunas de cancelamento lógico. Restituições canceladas
-- depois da 0045 voltam a contar nos saldos: exporte antes, se houver alguma:
--   \copy (SELECT id, cancelada_em, cancelada_por, motivo_cancelamento FROM restituicao WHERE cancelada)
--     TO 'restituicao_canceladas.csv' CSV HEADER

ALTER TABLE "restituicao" DROP COLUMN IF EXISTS "motivo_cancelamento";
ALTER TABLE "restituicao" DROP COLUMN IF EXISTS "cancelada_por";
ALTER TABLE "restituicao" DROP COLUMN IF EXISTS "cancelada_em";
ALTER TABLE "restituicao" DROP COLUMN IF EXISTS "cancelada";

-- A linha da 0045 precisa sair do journal do drizzle para que a migração seja
-- reaplicada no próximo boot.
DELETE FROM drizzle.__drizzle_migrations
 WHERE hash IN (
   SELECT hash FROM drizzle.__drizzle_migrations ORDER BY created_at DESC LIMIT 1
 );
