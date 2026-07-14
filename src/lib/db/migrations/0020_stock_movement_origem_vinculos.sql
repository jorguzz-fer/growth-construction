ALTER TABLE "stock_movement" ADD COLUMN "origem" text;--> statement-breakpoint
ALTER TABLE "stock_movement" ADD COLUMN "despesa_id" uuid;--> statement-breakpoint
ALTER TABLE "stock_movement" ADD COLUMN "permuta_id" uuid;--> statement-breakpoint
ALTER TABLE "stock_movement" ADD COLUMN "responsavel" text;--> statement-breakpoint
ALTER TABLE "stock_movement" ADD CONSTRAINT "stock_movement_despesa_id_despesa_id_fk" FOREIGN KEY ("despesa_id") REFERENCES "public"."despesa"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "stock_movement" ADD CONSTRAINT "stock_movement_permuta_id_permuta_id_fk" FOREIGN KEY ("permuta_id") REFERENCES "public"."permuta"("id") ON DELETE set null ON UPDATE no action;