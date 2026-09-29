-- ROLLBACK da 0042 (ver docs/ROLLBACK.md).
--
-- Remove APENAS a situação Ativo/Finalizado. `project.status`, nomes, datas,
-- versões e todos os lançamentos não são tocados. Se já houver classificação
-- feita e você quiser preservá-la, exporte antes:
--   \copy (SELECT id, name, situacao FROM project WHERE situacao IS NOT NULL)
--     TO 'project_situacao.csv' CSV HEADER

ALTER TABLE "project" DROP CONSTRAINT IF EXISTS "project_situacao_ck";
ALTER TABLE "project" DROP COLUMN IF EXISTS "situacao";

-- A linha da 0042 precisa sair do journal do drizzle para que a migração seja
-- reaplicada no próximo boot.
DELETE FROM drizzle.__drizzle_migrations
 WHERE hash IN (
   SELECT hash FROM drizzle.__drizzle_migrations ORDER BY created_at DESC LIMIT 1
 );
