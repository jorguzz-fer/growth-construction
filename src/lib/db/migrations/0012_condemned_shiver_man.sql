CREATE TABLE "number_sequence" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"entity" text DEFAULT 'despesa' NOT NULL,
	"prefix" text DEFAULT 'PED' NOT NULL,
	"use_prefix" boolean DEFAULT true NOT NULL,
	"digits" integer DEFAULT 6 NOT NULL,
	"next_number" bigint DEFAULT 1 NOT NULL,
	"active" boolean DEFAULT true NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "number_sequence_tenant_entity_uq" UNIQUE("tenant_id","entity")
);
--> statement-breakpoint
ALTER TABLE "number_sequence" ADD CONSTRAINT "number_sequence_tenant_id_tenant_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenant"("id") ON DELETE cascade ON UPDATE no action;