-- ROLLBACK da 0039 (ver docs/ROLLBACK.md).
--
-- Remove APENAS as colunas fiscais que a 0039 criou em `tenant` e `project`.
-- Nome do tenant, logo, projetos, versões, despesas e receitas não são tocados:
-- some só o cadastro fiscal do emitente e os dados fiscais da obra.
--
-- Se o cadastro fiscal já tiver sido preenchido e você quiser preservá-lo,
-- exporte antes:
--   \copy (SELECT id, name, cnpj, inscricao_municipal, inscricao_estadual,
--                 regime_tributario, regime_especial, item_lista_servico,
--                 codigo_tributario_municipio, cnae, aliquota_iss, logradouro,
--                 numero_endereco, complemento, bairro, codigo_municipio,
--                 municipio, uf, cep, telefone, email_fiscal, fiscal_ambiente
--            FROM tenant WHERE cnpj IS NOT NULL)
--     TO 'tenant_fiscal.csv' CSV HEADER
--   \copy (SELECT id, name, codigo_municipio_obra, municipio_obra, uf_obra,
--                 codigo_obra, art
--            FROM project WHERE codigo_municipio_obra IS NOT NULL)
--     TO 'project_fiscal.csv' CSV HEADER

ALTER TABLE "project" DROP COLUMN IF EXISTS "art";
ALTER TABLE "project" DROP COLUMN IF EXISTS "codigo_obra";
ALTER TABLE "project" DROP COLUMN IF EXISTS "uf_obra";
ALTER TABLE "project" DROP COLUMN IF EXISTS "municipio_obra";
ALTER TABLE "project" DROP COLUMN IF EXISTS "codigo_municipio_obra";

ALTER TABLE "tenant" DROP COLUMN IF EXISTS "fiscal_ambiente";
ALTER TABLE "tenant" DROP COLUMN IF EXISTS "email_fiscal";
ALTER TABLE "tenant" DROP COLUMN IF EXISTS "telefone";
ALTER TABLE "tenant" DROP COLUMN IF EXISTS "cep";
ALTER TABLE "tenant" DROP COLUMN IF EXISTS "uf";
ALTER TABLE "tenant" DROP COLUMN IF EXISTS "municipio";
ALTER TABLE "tenant" DROP COLUMN IF EXISTS "codigo_municipio";
ALTER TABLE "tenant" DROP COLUMN IF EXISTS "bairro";
ALTER TABLE "tenant" DROP COLUMN IF EXISTS "complemento";
ALTER TABLE "tenant" DROP COLUMN IF EXISTS "numero_endereco";
ALTER TABLE "tenant" DROP COLUMN IF EXISTS "logradouro";
ALTER TABLE "tenant" DROP COLUMN IF EXISTS "aliquota_iss";
ALTER TABLE "tenant" DROP COLUMN IF EXISTS "cnae";
ALTER TABLE "tenant" DROP COLUMN IF EXISTS "codigo_tributario_municipio";
ALTER TABLE "tenant" DROP COLUMN IF EXISTS "item_lista_servico";
ALTER TABLE "tenant" DROP COLUMN IF EXISTS "regime_especial";
ALTER TABLE "tenant" DROP COLUMN IF EXISTS "regime_tributario";
ALTER TABLE "tenant" DROP COLUMN IF EXISTS "inscricao_estadual";
ALTER TABLE "tenant" DROP COLUMN IF EXISTS "inscricao_municipal";
ALTER TABLE "tenant" DROP COLUMN IF EXISTS "cnpj";
ALTER TABLE "tenant" DROP COLUMN IF EXISTS "nome_fantasia";

-- A linha da 0039 precisa sair do journal do drizzle para que a migração seja
-- reaplicada no próximo boot.
DELETE FROM drizzle.__drizzle_migrations
 WHERE hash IN (
   SELECT hash FROM drizzle.__drizzle_migrations ORDER BY created_at DESC LIMIT 1
 );
