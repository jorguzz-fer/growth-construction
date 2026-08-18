-- ROLLBACK da 0037 (ver docs/ROLLBACK.md).
--
-- ATENÇÃO — remove TABELAS NOVAS, criadas pela 0037. Nenhuma delas existia
-- antes: acertos contábeis, rateios entre obras, itens de restituição em lote e
-- compensações são conceitos introduzidos por esta migração. Rodar o rollback
-- descarta o que tiver sido registrado nelas DEPOIS do deploy.
--
-- Nenhuma tabela pré-existente é tocada: despesas, parcelas, obrigações,
-- restituições, unidades, contas a receber, caixa e documentos ficam intactos.
--
-- IMPORTANTE: se houver acertos já concluídos, as despesas que eles quitaram
-- permanecem com status "Pago" — o rollback não as reabre, porque reabrir
-- lançamento pago automaticamente seria reinterpretar dado. Estorne os acertos
-- pela interface ANTES de rodar este script, se quiser as despesas reabertas.
--
-- Exporte antes, se quiser preservar:
--   \copy (SELECT * FROM acerto) TO 'acerto.csv' CSV HEADER
--   \copy (SELECT * FROM acerto_item) TO 'acerto_item.csv' CSV HEADER
--   \copy (SELECT * FROM rateio_obra) TO 'rateio_obra.csv' CSV HEADER
--   \copy (SELECT * FROM restituicao_item) TO 'restituicao_item.csv' CSV HEADER
--   \copy (SELECT * FROM compensacao) TO 'compensacao.csv' CSV HEADER

DROP INDEX IF EXISTS "acerto_idem_uq";
DROP INDEX IF EXISTS "compensacao_idem_uq";
DROP INDEX IF EXISTS "acerto_item_uq";
DROP INDEX IF EXISTS "restituicao_item_uq";
DROP INDEX IF EXISTS "acerto_item_despesa_idx";
DROP INDEX IF EXISTS "restituicao_item_origem_idx";
DROP INDEX IF EXISTS "acerto_periodo_idx";
DROP INDEX IF EXISTS "rateio_obra_projeto_idx";

DROP TABLE IF EXISTS "rateio_obra";
DROP TABLE IF EXISTS "acerto_item";
DROP TABLE IF EXISTS "acerto";
DROP TABLE IF EXISTS "restituicao_item";
DROP TABLE IF EXISTS "compensacao";

-- A linha da 0037 precisa sair do journal do drizzle para que a migração seja
-- reaplicada no próximo boot.
DELETE FROM drizzle.__drizzle_migrations
 WHERE hash IN (
   SELECT hash FROM drizzle.__drizzle_migrations ORDER BY created_at DESC LIMIT 1
 );
