-- 0045 — Restituição cancelada em vez de apagada (Prompt I, §24).
--
-- ADITIVA E REVERSÍVEL. Quatro colunas novas; `cancelada` nasce false para
-- todas as linhas existentes (nenhuma restituição já gravada muda de estado).
ALTER TABLE "restituicao" ADD COLUMN IF NOT EXISTS "cancelada" boolean NOT NULL DEFAULT false;--> statement-breakpoint
ALTER TABLE "restituicao" ADD COLUMN IF NOT EXISTS "cancelada_em" text;--> statement-breakpoint
ALTER TABLE "restituicao" ADD COLUMN IF NOT EXISTS "cancelada_por" text;--> statement-breakpoint
ALTER TABLE "restituicao" ADD COLUMN IF NOT EXISTS "motivo_cancelamento" text;
