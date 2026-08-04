--> IDEMPOTÊNCIA: o Postgres não permite remover valor de enum, então após um
--> rollback o rótulo 'Terceiros' permanece. Sem "IF NOT EXISTS", reaplicar esta
--> migração falharia com 'enum label already exists' — e o entrypoint do
--> container roda as migrações a cada boot.
ALTER TYPE "public"."bank_account_type" ADD VALUE IF NOT EXISTS 'Terceiros';--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "medicao_servico" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"servico_id" uuid NOT NULL,
	"competencia" text NOT NULL,
	"pct_executado_acum" numeric(8, 4) DEFAULT '0' NOT NULL,
	"obs" text,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "servico" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"project_id" uuid NOT NULL,
	"ordem" integer DEFAULT 0 NOT NULL,
	"nome" text NOT NULL,
	"custo_proposto" numeric(15, 2) DEFAULT '0' NOT NULL,
	"limite_min" numeric(8, 4),
	"limite_max" numeric(8, 4),
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "project" ADD COLUMN IF NOT EXISTS "cub" numeric(15, 2);--> statement-breakpoint
ALTER TABLE "project" ADD COLUMN IF NOT EXISTS "metragem" numeric(12, 2);--> statement-breakpoint
ALTER TABLE "project" ADD COLUMN IF NOT EXISTS "parcela_referencia" numeric(15, 2);--> statement-breakpoint
ALTER TABLE "project" ADD COLUMN IF NOT EXISTS "pct_bdi" numeric(8, 4);--> statement-breakpoint
ALTER TABLE "project" ADD COLUMN IF NOT EXISTS "tipo_executor" text;--> statement-breakpoint
ALTER TABLE "project" ADD COLUMN IF NOT EXISTS "pct_taxa_liberacao" numeric(8, 4);--> statement-breakpoint
ALTER TABLE "project" ADD COLUMN IF NOT EXISTS "tipo_obra" text;--> statement-breakpoint
ALTER TABLE "medicao_servico" ADD CONSTRAINT "medicao_servico_tenant_id_tenant_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenant"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "medicao_servico" ADD CONSTRAINT "medicao_servico_servico_id_servico_id_fk" FOREIGN KEY ("servico_id") REFERENCES "public"."servico"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "servico" ADD CONSTRAINT "servico_tenant_id_tenant_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenant"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "servico" ADD CONSTRAINT "servico_project_id_project_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."project"("id") ON DELETE cascade ON UPDATE no action;