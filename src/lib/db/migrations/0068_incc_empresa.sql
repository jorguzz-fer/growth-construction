-- 0068 — INCC da empresa (Prompt Q2, Fase 3 · revisão V5).
--
-- ADITIVA E REVERSÍVEL. A tabela incc_rate passa a aceitar a série DA
-- EMPRESA: linha sem projeto (project_id vazio), uma por empresa e mês. As
-- séries por projeto que já existem não são tocadas. Nenhuma linha é criada
-- aqui: a série da empresa nasce quando alguém adota a série de uma obra na
-- tela de INCC, e só é lida pelos relatórios com a chave "incc_por_empresa"
-- ligada.
ALTER TABLE "incc_rate" ALTER COLUMN "project_id" DROP NOT NULL;
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "incc_empresa_mes_uq" ON "incc_rate" ("tenant_id", "mes") WHERE "project_id" IS NULL;
