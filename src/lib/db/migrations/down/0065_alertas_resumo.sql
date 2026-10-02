-- ROLLBACK da 0065 (ver docs/ROLLBACK.md).
--
-- Remove os parâmetros dos alertas do Resumo. Os alertas por valor somem da
-- tela; o resto do bloco Atenção segue igual. Exporte antes:
--   \copy (SELECT id, alerta_desvio_pct, alerta_desvio_valor, alerta_vencido_dias FROM tenant) TO 'tenant_alertas.csv' CSV HEADER

ALTER TABLE "tenant" DROP COLUMN IF EXISTS "alerta_vencido_dias";
ALTER TABLE "tenant" DROP COLUMN IF EXISTS "alerta_desvio_valor";
ALTER TABLE "tenant" DROP COLUMN IF EXISTS "alerta_desvio_pct";

-- A linha da 0065 precisa sair do journal do drizzle para que a migração seja
-- reaplicada no próximo boot.
DELETE FROM drizzle.__drizzle_migrations
 WHERE hash IN (
   SELECT hash FROM drizzle.__drizzle_migrations ORDER BY created_at DESC LIMIT 1
 );
