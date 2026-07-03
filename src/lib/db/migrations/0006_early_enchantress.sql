ALTER TYPE "public"."role" ADD VALUE 'engenheiro';--> statement-breakpoint
CREATE TABLE "medicao" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"version_id" uuid NOT NULL,
	"tenant_id" uuid NOT NULL,
	"competencia" text NOT NULL,
	"grupo_code" text NOT NULL,
	"grupo_name" text NOT NULL,
	"valor" numeric(15, 2) DEFAULT '0' NOT NULL,
	"obs" text,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "medicao" ADD CONSTRAINT "medicao_version_id_version_id_fk" FOREIGN KEY ("version_id") REFERENCES "public"."version"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "medicao" ADD CONSTRAINT "medicao_tenant_id_tenant_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenant"("id") ON DELETE cascade ON UPDATE no action;