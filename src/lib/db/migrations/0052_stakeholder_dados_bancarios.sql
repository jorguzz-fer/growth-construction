-- 0052 — Fornecedores & Stakeholders: dados de recebimento do pagador terceiro (Prompt T, BT-2).
--
-- ADITIVA E REVERSÍVEL. Sete colunas anuláveis em "stakeholder"; nenhuma
-- linha muda. Ressarcir é transferir, e até aqui o banco e a chave PIX de quem
-- pagou pela empresa não existiam em lugar nenhum. Dado sensível: só na tela,
-- nunca no assistente, nunca em claro no audit_log.
ALTER TABLE "stakeholder" ADD COLUMN IF NOT EXISTS "banco_nome" text;--> statement-breakpoint
ALTER TABLE "stakeholder" ADD COLUMN IF NOT EXISTS "banco_agencia" text;--> statement-breakpoint
ALTER TABLE "stakeholder" ADD COLUMN IF NOT EXISTS "banco_conta" text;--> statement-breakpoint
ALTER TABLE "stakeholder" ADD COLUMN IF NOT EXISTS "banco_tipo_conta" text;--> statement-breakpoint
ALTER TABLE "stakeholder" ADD COLUMN IF NOT EXISTS "banco_titular" text;--> statement-breakpoint
ALTER TABLE "stakeholder" ADD COLUMN IF NOT EXISTS "pix_tipo" text;--> statement-breakpoint
ALTER TABLE "stakeholder" ADD COLUMN IF NOT EXISTS "pix_chave" text;
