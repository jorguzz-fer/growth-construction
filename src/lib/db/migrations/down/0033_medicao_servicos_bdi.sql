-- ---------------------------------------------------------------------------
-- ROLLBACK da migração 0033_medicao_servicos_bdi
--
-- A migração é puramente ADITIVA: cria duas tabelas novas, adiciona colunas
-- anuláveis em "project" e acrescenta um valor ao enum bank_account_type.
-- Nenhum dado pré-existente é tocado por ela — e este rollback também não toca
-- em nada que existia antes.
--
-- ATENÇÃO: executar este script DESCARTA os dados de medição por serviço
-- (tabelas servico / medicao_servico) e os parâmetros de BDI preenchidos no
-- cadastro dos projetos. Faça o snapshot antes (ver docs/ROLLBACK.md).
--
--   psql "$DATABASE_URL" -f src/lib/db/migrations/down/0033_medicao_servicos_bdi.sql
-- ---------------------------------------------------------------------------

BEGIN;

-- 1. Tabelas novas (medicao_servico depende de servico).
DROP TABLE IF EXISTS "medicao_servico";
DROP TABLE IF EXISTS "servico";

-- 2. Colunas acrescentadas em project (todas anuláveis, sem backfill).
ALTER TABLE "project" DROP COLUMN IF EXISTS "cub";
ALTER TABLE "project" DROP COLUMN IF EXISTS "metragem";
ALTER TABLE "project" DROP COLUMN IF EXISTS "parcela_referencia";
ALTER TABLE "project" DROP COLUMN IF EXISTS "pct_bdi";
ALTER TABLE "project" DROP COLUMN IF EXISTS "tipo_executor";
ALTER TABLE "project" DROP COLUMN IF EXISTS "pct_taxa_liberacao";
ALTER TABLE "project" DROP COLUMN IF EXISTS "tipo_obra";

-- 3. Registro da migração no journal do drizzle, para permitir reaplicá-la.
DELETE FROM "drizzle"."__drizzle_migrations"
 WHERE "hash" IN (
   SELECT "hash" FROM "drizzle"."__drizzle_migrations"
    ORDER BY "created_at" DESC LIMIT 1
 );

COMMIT;

-- ---------------------------------------------------------------------------
-- NOTA sobre o enum bank_account_type:
--
-- O Postgres NÃO permite remover um valor de enum (não existe
-- ALTER TYPE ... DROP VALUE). O valor 'Terceiros' permanece disponível após o
-- rollback — o que é INÓCUO: nenhuma conta existente passa a usá-lo
-- automaticamente e nenhum dado é afetado.
--
-- Caso a remoção do valor seja mesmo necessária, é preciso recriar o tipo:
--   1) garantir que nenhuma conta use 'Terceiros'
--      SELECT count(*) FROM bank_account WHERE tipo = 'Terceiros';  -- deve ser 0
--   2) recriar o tipo e reapontar a coluna (operação com risco — só com backup):
--      ALTER TABLE bank_account ALTER COLUMN tipo TYPE text;
--      DROP TYPE bank_account_type;
--      CREATE TYPE bank_account_type AS ENUM ('Imobiliária','Construtora');
--      ALTER TABLE bank_account ALTER COLUMN tipo TYPE bank_account_type
--        USING tipo::bank_account_type;
-- ---------------------------------------------------------------------------
