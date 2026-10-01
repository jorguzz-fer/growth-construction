-- 0054 — Faturas de cartão e vínculo da compra (Prompt U, seção 2; Prompt S, 3-B.4/3-B.6).
--
-- ADITIVA E REVERSÍVEL. Tabela nova "fatura_cartao" (uma por cartão e data de
-- fechamento) e duas colunas ANULÁVEIS: "despesa.cartao_id" (a compra foi no
-- cartão) e "despesa_parcela.fatura_id" (em que fatura a parcela cai).
-- Nenhuma despesa ou parcela existente é vinculada retroativamente (seção 9):
-- isso é decisão humana, se for o caso.
CREATE TABLE IF NOT EXISTS "fatura_cartao" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "tenant_id" uuid NOT NULL REFERENCES "tenant"("id") ON DELETE CASCADE,
  "cartao_id" uuid NOT NULL REFERENCES "cartao_credito"("id") ON DELETE CASCADE,
  "fechamento" text NOT NULL,
  "vencimento" text NOT NULL,
  "created_at" timestamp NOT NULL DEFAULT now()
);--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "fatura_cartao_ciclo_uq" ON "fatura_cartao" ("cartao_id", "fechamento");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "fatura_cartao_tenant_idx" ON "fatura_cartao" ("tenant_id");--> statement-breakpoint
ALTER TABLE "despesa" ADD COLUMN IF NOT EXISTS "cartao_id" uuid REFERENCES "cartao_credito"("id") ON DELETE SET NULL;--> statement-breakpoint
ALTER TABLE "despesa_parcela" ADD COLUMN IF NOT EXISTS "fatura_id" uuid REFERENCES "fatura_cartao"("id") ON DELETE SET NULL;--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "despesa_parcela_fatura_idx" ON "despesa_parcela" ("fatura_id");
