-- 0051 — INCC: variante do índice e origem do valor informado (Prompt Q, 5.1 e 5.3).
--
-- ADITIVA E REVERSÍVEL. Quatro colunas anuláveis em "incc_rate"; nenhuma
-- linha muda. A variante (INCC-DI / INCC-M / INCC-10) fica em branco até ser
-- confirmada (BQ-1) — a tela diz "variante a confirmar". Quem informou e
-- quando passam a ser gravados daqui para frente; o histórico fica em branco
-- e a auditoria continua sendo a fonte.
ALTER TABLE "incc_rate" ADD COLUMN IF NOT EXISTS "variante" text;--> statement-breakpoint
ALTER TABLE "incc_rate" ADD COLUMN IF NOT EXISTS "fonte" text;--> statement-breakpoint
ALTER TABLE "incc_rate" ADD COLUMN IF NOT EXISTS "informado_por" text;--> statement-breakpoint
ALTER TABLE "incc_rate" ADD COLUMN IF NOT EXISTS "informado_em" text;
