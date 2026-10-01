-- 0047 — Documento anexado a uma conta a receber (Prompt K, 6.1).
--
-- ADITIVA E REVERSÍVEL. Uma coluna anulável em "document"; nenhuma linha
-- existente muda. Apagar a conta a receber (cascata do projeto) desvincula o
-- documento (SET NULL) em vez de apagá-lo, como os vínculos de projeto.
ALTER TABLE "document" ADD COLUMN IF NOT EXISTS "conta_receber_id" uuid REFERENCES "conta_receber"("id") ON DELETE SET NULL;--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "document_conta_receber_idx" ON "document" ("conta_receber_id");
