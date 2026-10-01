-- 0048 — Recebimentos de conta a receber (Prompt K, seções 3 e 4; BK-1).
--
-- ADITIVA E REVERSÍVEL. Tabela nova; nenhuma linha de "conta_receber" ou
-- "cash_entry" muda. Uma linha por recebimento (baixa manual ou conciliação),
-- com valor próprio: um depósito pode quitar várias contas e uma conta pode
-- ser recebida em vários depósitos. O vínculo antigo 1:1
-- ("conta_receber.origem_cash_entry_id", "cash_entry.conciliado_conta_receber_id")
-- é preservado como está (4.5).
CREATE TABLE IF NOT EXISTS "conta_receber_recebimento" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "tenant_id" uuid NOT NULL REFERENCES "tenant"("id") ON DELETE CASCADE,
  "conta_receber_id" uuid NOT NULL REFERENCES "conta_receber"("id") ON DELETE CASCADE,
  "valor" numeric(15, 2) NOT NULL DEFAULT '0',
  "data" text,
  "forma" text NOT NULL DEFAULT 'Extrato bancário',
  "cash_entry_id" uuid REFERENCES "cash_entry"("id") ON DELETE SET NULL,
  "justificativa" text,
  "estornado" boolean NOT NULL DEFAULT false,
  "estornado_em" text,
  "estornado_por" text,
  "motivo_estorno" text,
  "idempotency_key" text,
  "created_by" text,
  "created_at" timestamp NOT NULL DEFAULT now()
);--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "cr_receb_conta_idx" ON "conta_receber_recebimento" ("conta_receber_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "cr_receb_cash_idx" ON "conta_receber_recebimento" ("cash_entry_id");--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "cr_receb_idem_uq"
  ON "conta_receber_recebimento" ("tenant_id", "idempotency_key")
  WHERE "idempotency_key" IS NOT NULL;
