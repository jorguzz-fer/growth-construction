ALTER TABLE "cash_entry" ADD COLUMN "conciliado_despesa_id" uuid;--> statement-breakpoint
ALTER TABLE "cash_entry" ADD COLUMN "conciliado_por" text;--> statement-breakpoint
ALTER TABLE "cash_entry" ADD COLUMN "conciliado_em" text;--> statement-breakpoint
ALTER TABLE "cash_entry" ADD CONSTRAINT "cash_entry_conciliado_despesa_id_despesa_id_fk" FOREIGN KEY ("conciliado_despesa_id") REFERENCES "public"."despesa"("id") ON DELETE set null ON UPDATE no action;