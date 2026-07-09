CREATE TYPE "public"."unit_item_type" AS ENUM('unidade', 'condominio');--> statement-breakpoint
ALTER TABLE "project" ADD COLUMN "start_date" text;--> statement-breakpoint
ALTER TABLE "project" ADD COLUMN "end_date" text;--> statement-breakpoint
ALTER TABLE "project" ADD COLUMN "cliente_id" uuid;--> statement-breakpoint
ALTER TABLE "unit" ADD COLUMN "item_type" "unit_item_type" DEFAULT 'unidade' NOT NULL;--> statement-breakpoint
ALTER TABLE "project" ADD CONSTRAINT "project_cliente_id_cliente_id_fk" FOREIGN KEY ("cliente_id") REFERENCES "public"."cliente"("id") ON DELETE set null ON UPDATE no action;