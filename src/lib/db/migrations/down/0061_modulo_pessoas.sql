-- ROLLBACK da 0061 (ver docs/ROLLBACK.md).
--
-- Remove as tabelas do módulo Pessoas e as quatro colunas de document.
-- Documentos anexados a funcionário/dia/folha FICAM em document, sem o
-- vínculo. Exporte antes:
--   \copy (SELECT * FROM funcionario) TO 'funcionario.csv' CSV HEADER
--   \copy (SELECT * FROM equipe_projeto) TO 'equipe_projeto.csv' CSV HEADER
--   \copy (SELECT * FROM diaria) TO 'diaria.csv' CSV HEADER

ALTER TABLE "document" DROP COLUMN IF EXISTS "validade";
ALTER TABLE "document" DROP COLUMN IF EXISTS "folha_id";
ALTER TABLE "document" DROP COLUMN IF EXISTS "equipe_dia_id";
ALTER TABLE "document" DROP COLUMN IF EXISTS "funcionario_id";
DROP TABLE IF EXISTS "aso_acesso";
DROP TABLE IF EXISTS "folha_competencia";
DROP TABLE IF EXISTS "diaria";
DROP TABLE IF EXISTS "equipe_dia";
DROP TABLE IF EXISTS "equipe_projeto";
DROP TABLE IF EXISTS "funcao_equipe";
DROP TABLE IF EXISTS "funcionario_dependente";
DROP TABLE IF EXISTS "funcionario";

-- A linha da 0061 precisa sair do journal do drizzle para que a migração seja
-- reaplicada no próximo boot.
DELETE FROM drizzle.__drizzle_migrations
 WHERE hash IN (
   SELECT hash FROM drizzle.__drizzle_migrations ORDER BY created_at DESC LIMIT 1
 );
