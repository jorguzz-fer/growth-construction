-- 0044 — Idempotência de pagamentos (Prompt I, §13 e §14).
--
-- ADITIVA E REVERSÍVEL. Coluna nova, anulável, sem default: nenhum pagamento
-- já gravado é escrito. Índice PARCIAL: só linhas com chave participam; as
-- antigas (chave nula) não são afetadas nem exigidas.
ALTER TABLE "pagamento" ADD COLUMN IF NOT EXISTS "idempotency_key" text;--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "pagamento_idem_uq"
  ON "pagamento" ("tenant_id", "idempotency_key")
  WHERE "idempotency_key" IS NOT NULL;
