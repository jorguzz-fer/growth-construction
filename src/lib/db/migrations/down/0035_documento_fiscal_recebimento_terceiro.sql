-- ROLLBACK da 0035 (ver docs/ROLLBACK.md).
--
-- ATENÇÃO — leia antes de executar.
--
-- Este script remove TABELAS NOVAS, criadas pela 0035. Nenhuma delas existia
-- antes: documentos fiscais, recebimentos por terceiro e repasses são conceitos
-- introduzidos por esta migração. Rodar o rollback descarta o que tiver sido
-- registrado nelas DEPOIS do deploy.
--
-- Nenhuma tabela pré-existente é tocada: despesas, parcelas, obrigações,
-- restituições, unidades, contas a receber, caixa e documentos do repositório
-- ficam intactos. Do repositório sai apenas a coluna `numero_documento_fiscal`
-- (o arquivo, o vínculo com a despesa e o storage_key permanecem).
--
-- Faça backup antes. Se já houver documentos fiscais lançados e você quiser
-- preservá-los, exporte primeiro:
--   \copy (SELECT * FROM documento_fiscal) TO 'documento_fiscal.csv' CSV HEADER
--   \copy (SELECT * FROM recebimento_terceiro) TO 'recebimento_terceiro.csv' CSV HEADER
--   \copy (SELECT * FROM repasse) TO 'repasse.csv' CSV HEADER

DROP INDEX IF EXISTS "documento_fiscal_despesa_idx";
DROP INDEX IF EXISTS "documento_fiscal_busca_idx";
DROP INDEX IF EXISTS "document_num_fiscal_idx";
DROP INDEX IF EXISTS "recebimento_terceiro_idem_uq";
DROP INDEX IF EXISTS "repasse_idem_uq";
DROP INDEX IF EXISTS "repasse_cash_entry_uq";
DROP INDEX IF EXISTS "recebimento_terceiro_saldo_idx";

DROP TABLE IF EXISTS "repasse";
DROP TABLE IF EXISTS "recebimento_terceiro";
DROP TABLE IF EXISTS "documento_fiscal";

ALTER TABLE "document" DROP COLUMN IF EXISTS "numero_documento_fiscal";

-- A linha da 0035 precisa sair do journal do drizzle para que a migração seja
-- reaplicada no próximo boot.
DELETE FROM drizzle.__drizzle_migrations
 WHERE hash IN (
   SELECT hash FROM drizzle.__drizzle_migrations ORDER BY created_at DESC LIMIT 1
 );
