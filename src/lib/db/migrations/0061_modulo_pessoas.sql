-- 0061 — Módulo Pessoas (Prompt Z): funcionários CLT, equipes de projetos,
-- diárias, folha por competência e documentos do módulo.
--
-- ADITIVA E REVERSÍVEL. Nenhuma tabela existente perde coluna; `time_entry`
-- e as coordenadas de `project` FICAM (a tela /ponto sai, o dado não).
-- Dado pessoal (CPF, PIS, endereço, salário, banco) fica em `funcionario` e
-- é servido só a quem tem a permissão de campo (Prompt M, BM-3).
CREATE TABLE IF NOT EXISTS "funcionario" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "tenant_id" uuid NOT NULL REFERENCES "tenant"("id") ON DELETE CASCADE,
  -- identificação
  "nome" text NOT NULL,
  "nascimento" text,
  "nacionalidade" text,
  "estado_civil" text,
  "nome_mae" text,
  "foto_document_id" uuid,
  -- documentos com número
  "cpf" text,
  "rg" text,
  "rg_orgao" text,
  "rg_uf" text,
  "ctps_numero" text,
  "ctps_serie" text,
  "pis" text,
  "titulo_eleitor" text,
  "reservista" text,
  "cnh" text,
  "cnh_categoria" text,
  "cnh_validade" text,
  -- endereço residencial
  "endereco" text,
  "numero" text,
  "complemento" text,
  "bairro" text,
  "cidade" text,
  "estado" text,
  "cep" text,
  -- contrato
  "admissao" text,
  "cargo" text,
  "setor" text,
  "project_id" uuid REFERENCES "project"("id") ON DELETE SET NULL,
  "tipo_contrato" text,
  "prazo_contrato" text,
  "jornada" text,
  "salario" numeric(15, 2),
  "desligamento" text,
  "motivo_desligamento" text,
  -- dados bancários
  "banco_nome" text,
  "banco_agencia" text,
  "banco_conta" text,
  "banco_tipo_conta" text,
  "pix_tipo" text,
  "pix_chave" text,
  "obs" text,
  "created_at" timestamp NOT NULL DEFAULT now(),
  "updated_at" timestamp NOT NULL DEFAULT now()
);--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "funcionario_tenant_idx" ON "funcionario" ("tenant_id");--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "funcionario_dependente" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "tenant_id" uuid NOT NULL REFERENCES "tenant"("id") ON DELETE CASCADE,
  "funcionario_id" uuid NOT NULL REFERENCES "funcionario"("id") ON DELETE CASCADE,
  "nome" text NOT NULL,
  "nascimento" text,
  "parentesco" text,
  "dependente_ir" boolean NOT NULL DEFAULT false,
  "salario_familia" boolean NOT NULL DEFAULT false
);--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "funcao_equipe" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "tenant_id" uuid NOT NULL REFERENCES "tenant"("id") ON DELETE CASCADE,
  "nome" text NOT NULL,
  "ativo" boolean NOT NULL DEFAULT true,
  "ordem" integer NOT NULL DEFAULT 0
);--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "funcao_equipe_tenant_nome_uq" ON "funcao_equipe" ("tenant_id", lower("nome"));--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "equipe_projeto" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "tenant_id" uuid NOT NULL REFERENCES "tenant"("id") ON DELETE CASCADE,
  "project_id" uuid NOT NULL REFERENCES "project"("id") ON DELETE CASCADE,
  "stakeholder_id" uuid REFERENCES "stakeholder"("id") ON DELETE RESTRICT,
  "funcionario_id" uuid REFERENCES "funcionario"("id") ON DELETE RESTRICT,
  "funcao_id" uuid REFERENCES "funcao_equipe"("id") ON DELETE SET NULL,
  "valor_diaria" numeric(15, 2),
  "entrada" text,
  "saida" text,
  "situacao" text NOT NULL DEFAULT 'ativa',
  "obs" text,
  "created_at" timestamp NOT NULL DEFAULT now(),
  CONSTRAINT "equipe_projeto_origem_unica" CHECK (
    ("stakeholder_id" IS NOT NULL AND "funcionario_id" IS NULL) OR
    ("stakeholder_id" IS NULL AND "funcionario_id" IS NOT NULL)
  )
);--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "equipe_projeto_project_idx" ON "equipe_projeto" ("project_id");--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "equipe_dia" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "tenant_id" uuid NOT NULL REFERENCES "tenant"("id") ON DELETE CASCADE,
  "project_id" uuid NOT NULL REFERENCES "project"("id") ON DELETE CASCADE,
  "data" text NOT NULL,
  "obs" text,
  "created_at" timestamp NOT NULL DEFAULT now()
);--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "equipe_dia_project_data_uq" ON "equipe_dia" ("project_id", "data");--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "diaria" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "tenant_id" uuid NOT NULL REFERENCES "tenant"("id") ON DELETE CASCADE,
  "equipe_dia_id" uuid NOT NULL REFERENCES "equipe_dia"("id") ON DELETE CASCADE,
  "equipe_projeto_id" uuid NOT NULL REFERENCES "equipe_projeto"("id") ON DELETE RESTRICT,
  "quantidade" numeric(4, 2) NOT NULL DEFAULT 1,
  "valor" numeric(15, 2),
  "obs" text,
  "despesa_id" uuid REFERENCES "despesa"("id") ON DELETE SET NULL,
  "registrado_por" text,
  "created_at" timestamp NOT NULL DEFAULT now()
);--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "diaria_dia_membro_uq" ON "diaria" ("equipe_dia_id", "equipe_projeto_id");--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "folha_competencia" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "tenant_id" uuid NOT NULL REFERENCES "tenant"("id") ON DELETE CASCADE,
  "competencia" text NOT NULL,
  "obs" text,
  "despesa_id" uuid REFERENCES "despesa"("id") ON DELETE SET NULL,
  "created_at" timestamp NOT NULL DEFAULT now()
);--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "folha_competencia_uq" ON "folha_competencia" ("tenant_id", "competencia");--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "aso_acesso" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "tenant_id" uuid NOT NULL REFERENCES "tenant"("id") ON DELETE CASCADE,
  "funcionario_id" uuid NOT NULL REFERENCES "funcionario"("id") ON DELETE CASCADE,
  "document_id" uuid,
  "usuario" text,
  "acessado_em" timestamp NOT NULL DEFAULT now()
);--> statement-breakpoint
ALTER TABLE "document" ADD COLUMN IF NOT EXISTS "funcionario_id" uuid REFERENCES "funcionario"("id") ON DELETE SET NULL;--> statement-breakpoint
ALTER TABLE "document" ADD COLUMN IF NOT EXISTS "equipe_dia_id" uuid REFERENCES "equipe_dia"("id") ON DELETE SET NULL;--> statement-breakpoint
ALTER TABLE "document" ADD COLUMN IF NOT EXISTS "folha_id" uuid REFERENCES "folha_competencia"("id") ON DELETE SET NULL;--> statement-breakpoint
ALTER TABLE "document" ADD COLUMN IF NOT EXISTS "validade" text;--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "document_funcionario_idx" ON "document" ("funcionario_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "document_equipe_dia_idx" ON "document" ("equipe_dia_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "document_folha_idx" ON "document" ("folha_id");
