-- ROLLBACK da 0068 (ver docs/ROLLBACK.md).
--
-- Apaga a série da empresa (linhas sem projeto) e volta a exigir o projeto.
-- As séries por projeto não são afetadas. Desligue antes a chave
-- "incc_por_empresa". Exporte antes, se quiser guardar a série da empresa:
--   \copy (SELECT * FROM incc_rate WHERE project_id IS NULL) TO 'incc_empresa.csv' CSV HEADER

DROP INDEX IF EXISTS "incc_empresa_mes_uq";
DELETE FROM "incc_rate" WHERE "project_id" IS NULL;
ALTER TABLE "incc_rate" ALTER COLUMN "project_id" SET NOT NULL;

DELETE FROM drizzle.__drizzle_migrations
 WHERE hash IN (
   SELECT hash FROM drizzle.__drizzle_migrations ORDER BY created_at DESC LIMIT 1
 );
