-- 0050 — Liberações de obra: cancelamento lógico (Prompt O, 4.2).
--
-- ADITIVA E REVERSÍVEL. Quatro colunas com default que preserva o
-- comportamento de hoje: toda liberação existente nasce NÃO cancelada e
-- continua somando onde somava. Nenhuma linha muda.
ALTER TABLE "reembolso" ADD COLUMN IF NOT EXISTS "cancelado" boolean NOT NULL DEFAULT false;--> statement-breakpoint
ALTER TABLE "reembolso" ADD COLUMN IF NOT EXISTS "cancelado_em" text;--> statement-breakpoint
ALTER TABLE "reembolso" ADD COLUMN IF NOT EXISTS "cancelado_por" text;--> statement-breakpoint
ALTER TABLE "reembolso" ADD COLUMN IF NOT EXISTS "motivo_cancelamento" text;
