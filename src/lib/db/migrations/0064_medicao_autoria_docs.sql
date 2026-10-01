-- 0064 — Medição de Obra (Prompt V, 0.5.1 e 5.2): autor da medição e
-- documentos anexados à medição.
--
-- ADITIVA E REVERSÍVEL. Duas colunas anuláveis; nenhum valor existente é
-- tocado. "created_by" NÃO recebe backfill (BV-3): medição antiga fica sem
-- autor e continua visível a todos, marcada "autor não registrado".
ALTER TABLE "medicao" ADD COLUMN IF NOT EXISTS "created_by" text REFERENCES "user"("id") ON DELETE SET NULL;--> statement-breakpoint
ALTER TABLE "document" ADD COLUMN IF NOT EXISTS "medicao_id" uuid REFERENCES "medicao"("id") ON DELETE SET NULL;
