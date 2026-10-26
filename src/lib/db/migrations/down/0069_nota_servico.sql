-- ROLLBACK da 0069 (ver docs/ROLLBACK.md).
--
-- ATENÇÃO: nota AUTORIZADA é documento fiscal emitido. Antes de remover,
-- exporte as duas tabelas — o registro precisa ser guardado:
--   \copy (SELECT * FROM nota_servico) TO 'nota_servico.csv' CSV HEADER
--   \copy (SELECT * FROM nota_servico_evento) TO 'nota_servico_evento.csv' CSV HEADER
-- Nenhuma outra tabela depende destas.

DROP TABLE IF EXISTS "nota_servico_evento";
DROP TABLE IF EXISTS "nota_servico";

-- A linha da 0069 precisa sair do journal do drizzle para que a migração seja
-- reaplicada no próximo boot.
DELETE FROM drizzle.__drizzle_migrations
 WHERE hash IN (
   SELECT hash FROM drizzle.__drizzle_migrations ORDER BY created_at DESC LIMIT 1
 );
