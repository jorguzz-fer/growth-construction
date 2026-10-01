-- 0049 — Permuta: cancelamento lógico, cliente por id e documento do ativo
-- (Prompt P, 2.3, 3.6 e 6.1).
--
-- ADITIVA E REVERSÍVEL. Só colunas anuláveis ou com default que preserva o
-- comportamento de hoje: todo ativo existente nasce NÃO cancelado; o cliente
-- gravado por nome continua na coluna "cliente"; nenhum documento é
-- revinculado. Apagar o cliente ou a permuta desvincula (SET NULL), não apaga.
ALTER TABLE "permuta" ADD COLUMN IF NOT EXISTS "cancelado" boolean NOT NULL DEFAULT false;--> statement-breakpoint
ALTER TABLE "permuta" ADD COLUMN IF NOT EXISTS "cancelado_em" text;--> statement-breakpoint
ALTER TABLE "permuta" ADD COLUMN IF NOT EXISTS "cancelado_por" text;--> statement-breakpoint
ALTER TABLE "permuta" ADD COLUMN IF NOT EXISTS "motivo_cancelamento" text;--> statement-breakpoint
ALTER TABLE "permuta" ADD COLUMN IF NOT EXISTS "cliente_id" uuid REFERENCES "cliente"("id") ON DELETE SET NULL;--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "permuta_cliente_idx" ON "permuta" ("cliente_id");--> statement-breakpoint
ALTER TABLE "document" ADD COLUMN IF NOT EXISTS "permuta_id" uuid REFERENCES "permuta"("id") ON DELETE SET NULL;--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "document_permuta_idx" ON "document" ("permuta_id");
