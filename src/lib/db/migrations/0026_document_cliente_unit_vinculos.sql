ALTER TABLE "document" ADD COLUMN "cliente_id" uuid;--> statement-breakpoint
ALTER TABLE "document" ADD COLUMN "unit_code" text;--> statement-breakpoint
ALTER TABLE "document" ADD COLUMN "project_id" uuid;--> statement-breakpoint
ALTER TABLE "document" ADD COLUMN "versao" integer DEFAULT 1 NOT NULL;--> statement-breakpoint
ALTER TABLE "document" ADD CONSTRAINT "document_cliente_id_cliente_id_fk" FOREIGN KEY ("cliente_id") REFERENCES "public"."cliente"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "document" ADD CONSTRAINT "document_project_id_project_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."project"("id") ON DELETE set null ON UPDATE no action;