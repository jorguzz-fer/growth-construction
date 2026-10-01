-- 0056 — Extrato do cartão e estorno (Prompt U, seções 5 e 6).
--
-- ADITIVA E REVERSÍVEL. Duas tabelas novas. "extrato_cartao" guarda só o
-- registro do extrato subido (5.4), com "import_hash" para o mesmo arquivo
-- não duplicar nada (5.3, mesmo padrão de cash_entry). "estorno_cartao" é o
-- lançamento PRÓPRIO do estorno (6.2): a compra não é apagada nem editada;
-- o crédito reduz a fatura e é aplicado no pagamento. Nenhuma despesa,
-- parcela, pagamento ou caixa existente muda.
CREATE TABLE IF NOT EXISTS "extrato_cartao" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "tenant_id" uuid NOT NULL REFERENCES "tenant"("id") ON DELETE CASCADE,
  "cartao_id" uuid NOT NULL REFERENCES "cartao_credito"("id") ON DELETE CASCADE,
  "import_hash" text,
  "data" text,
  "descricao" text,
  "valor" numeric(15, 2) NOT NULL,
  "created_at" timestamp NOT NULL DEFAULT now()
);--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "extrato_cartao_hash_uq"
  ON "extrato_cartao" ("tenant_id", "import_hash")
  WHERE "import_hash" IS NOT NULL;--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "extrato_cartao_cartao_idx" ON "extrato_cartao" ("cartao_id");--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "estorno_cartao" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "tenant_id" uuid NOT NULL REFERENCES "tenant"("id") ON DELETE CASCADE,
  "cartao_id" uuid NOT NULL REFERENCES "cartao_credito"("id") ON DELETE CASCADE,
  "despesa_id" uuid REFERENCES "despesa"("id") ON DELETE SET NULL,
  "fatura_id" uuid REFERENCES "fatura_cartao"("id") ON DELETE SET NULL,
  "valor" numeric(15, 2) NOT NULL,
  "data" text,
  "origem" text NOT NULL DEFAULT 'antecipado',
  "extrato_item_id" uuid REFERENCES "extrato_cartao"("id") ON DELETE SET NULL,
  "aplicado_em" text,
  "fatura_pagamento_id" uuid REFERENCES "fatura_pagamento"("id") ON DELETE SET NULL,
  "obs" text,
  "usuario_id" text,
  "created_at" timestamp NOT NULL DEFAULT now()
);--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "estorno_cartao_cartao_idx" ON "estorno_cartao" ("cartao_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "estorno_cartao_fatura_idx" ON "estorno_cartao" ("fatura_id");
