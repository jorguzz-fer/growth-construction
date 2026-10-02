-- 0065 — Alertas do Resumo Executivo (BAE-1, decisão de 01/10/2026).
--
-- ADITIVA E REVERSÍVEL. Três colunas com valor padrão na empresa: desvio de
-- custo acima de 10% E acima de R$ 5.000 (os dois juntos) e recebível vencido
-- há mais de 15 dias. Um valor só para a empresa toda, editável na tela
-- Empresa. Nenhum valor existente é tocado; as linhas atuais recebem o padrão.
ALTER TABLE "tenant" ADD COLUMN IF NOT EXISTS "alerta_desvio_pct" numeric(6, 2) NOT NULL DEFAULT 10;--> statement-breakpoint
ALTER TABLE "tenant" ADD COLUMN IF NOT EXISTS "alerta_desvio_valor" numeric(15, 2) NOT NULL DEFAULT 5000;--> statement-breakpoint
ALTER TABLE "tenant" ADD COLUMN IF NOT EXISTS "alerta_vencido_dias" integer NOT NULL DEFAULT 15;
