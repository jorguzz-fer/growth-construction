ALTER TABLE "document" ADD COLUMN "stakeholder_id" uuid;--> statement-breakpoint
ALTER TABLE "stakeholder" ADD COLUMN "nome_fantasia" text;--> statement-breakpoint
ALTER TABLE "stakeholder" ADD COLUMN "contato" text;--> statement-breakpoint
ALTER TABLE "stakeholder" ADD COLUMN "whatsapp" text;--> statement-breakpoint
ALTER TABLE "stakeholder" ADD COLUMN "site" text;--> statement-breakpoint
ALTER TABLE "stakeholder" ADD COLUMN "endereco" text;--> statement-breakpoint
ALTER TABLE "stakeholder" ADD COLUMN "numero" text;--> statement-breakpoint
ALTER TABLE "stakeholder" ADD COLUMN "complemento" text;--> statement-breakpoint
ALTER TABLE "stakeholder" ADD COLUMN "bairro" text;--> statement-breakpoint
ALTER TABLE "stakeholder" ADD COLUMN "cidade" text;--> statement-breakpoint
ALTER TABLE "stakeholder" ADD COLUMN "estado" text;--> statement-breakpoint
ALTER TABLE "stakeholder" ADD COLUMN "cep" text;--> statement-breakpoint
ALTER TABLE "document" ADD CONSTRAINT "document_stakeholder_id_stakeholder_id_fk" FOREIGN KEY ("stakeholder_id") REFERENCES "public"."stakeholder"("id") ON DELETE cascade ON UPDATE no action;