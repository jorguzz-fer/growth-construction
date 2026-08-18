-- ROLLBACK da 0038 (ver docs/ROLLBACK.md).
--
-- Remove APENAS as quatro colunas que a 0038 criou, mais o índice de busca.
-- Nenhuma parcela, despesa, valor, vencimento ou status é tocado — some só o
-- detalhamento do cheque (número, emitente, emissão e "bom para").
--
-- Se já houver cheques lançados por parcela e você quiser preservá-los,
-- exporte antes:
--   \copy (SELECT id, despesa_id, numero_parcela, numero_cheque, emitente_cheque,
--                 data_emissao_cheque, data_bom_para
--            FROM despesa_parcela WHERE numero_cheque IS NOT NULL)
--     TO 'parcelas_cheque.csv' CSV HEADER

DROP INDEX IF EXISTS "despesa_parcela_cheque_idx";

ALTER TABLE "despesa_parcela" DROP COLUMN IF EXISTS "numero_cheque";
ALTER TABLE "despesa_parcela" DROP COLUMN IF EXISTS "emitente_cheque";
ALTER TABLE "despesa_parcela" DROP COLUMN IF EXISTS "data_emissao_cheque";
ALTER TABLE "despesa_parcela" DROP COLUMN IF EXISTS "data_bom_para";

-- A linha da 0038 precisa sair do journal do drizzle para que a migração seja
-- reaplicada no próximo boot.
DELETE FROM drizzle.__drizzle_migrations
 WHERE hash IN (
   SELECT hash FROM drizzle.__drizzle_migrations ORDER BY created_at DESC LIMIT 1
 );
