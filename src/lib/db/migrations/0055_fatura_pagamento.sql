-- 0055 — Pagamento da fatura de cartão e juro cobrado (Prompt U, seção 3).
--
-- ADITIVA E REVERSÍVEL. Tabela nova "fatura_pagamento" (um registro por
-- pagamento, parcial ou total, com a saída de caixa que ele gerou e a chave de
-- idempotência) e uma coluna ANULÁVEL em "fatura_cartao": a despesa
-- financeira criada quando o juro do rotativo vem cobrado (3.4). Nenhuma
-- despesa, parcela, pagamento ou caixa existente muda.
CREATE TABLE IF NOT EXISTS "fatura_pagamento" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "tenant_id" uuid NOT NULL REFERENCES "tenant"("id") ON DELETE CASCADE,
  "fatura_id" uuid NOT NULL REFERENCES "fatura_cartao"("id") ON DELETE CASCADE,
  "valor" numeric(15, 2) NOT NULL,
  "data" text NOT NULL,
  "bank_account_id" uuid REFERENCES "bank_account"("id") ON DELETE SET NULL,
  "project_id" uuid REFERENCES "project"("id") ON DELETE SET NULL,
  "cash_entry_id" uuid REFERENCES "cash_entry"("id") ON DELETE SET NULL,
  "idempotency_key" text,
  "usuario_id" text,
  "obs" text,
  "created_at" timestamp NOT NULL DEFAULT now()
);--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "fatura_pagamento_fatura_idx" ON "fatura_pagamento" ("fatura_id");--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "fatura_pagamento_idem_uq"
  ON "fatura_pagamento" ("tenant_id", "idempotency_key")
  WHERE "idempotency_key" IS NOT NULL;--> statement-breakpoint
ALTER TABLE "fatura_cartao" ADD COLUMN IF NOT EXISTS "juros_despesa_id" uuid REFERENCES "despesa"("id") ON DELETE SET NULL;
