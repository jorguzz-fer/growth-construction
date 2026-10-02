-- ROLLBACK da 0066 (ver docs/ROLLBACK.md).
--
-- Remove o registro de consumo da IA. Nenhum dado de negócio é afetado. Exporte
-- antes, se quiser guardar o histórico de consumo:
--   \copy (SELECT * FROM ia_uso) TO 'ia_uso.csv' CSV HEADER

DROP TABLE IF EXISTS "ia_uso";

-- A linha da 0066 precisa sair do journal do drizzle para que a migração seja
-- reaplicada no próximo boot.
DELETE FROM drizzle.__drizzle_migrations
 WHERE hash IN (
   SELECT hash FROM drizzle.__drizzle_migrations ORDER BY created_at DESC LIMIT 1
 );
