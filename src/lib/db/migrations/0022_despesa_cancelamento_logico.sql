ALTER TABLE "despesa" ADD COLUMN "cancelado" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "despesa" ADD COLUMN "cancelado_em" text;--> statement-breakpoint
ALTER TABLE "despesa" ADD COLUMN "cancelado_por" text;--> statement-breakpoint
ALTER TABLE "despesa" ADD COLUMN "motivo_cancelamento" text;