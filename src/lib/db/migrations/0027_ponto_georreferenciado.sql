CREATE TABLE "time_entry" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"project_id" uuid NOT NULL,
	"user_id" text,
	"funcionario" text,
	"tipo" text NOT NULL,
	"data" text NOT NULL,
	"hora" text NOT NULL,
	"server_at" timestamp DEFAULT now() NOT NULL,
	"latitude" numeric(10, 7),
	"longitude" numeric(10, 7),
	"precisao_metros" integer,
	"distancia_metros" integer,
	"dentro_raio" boolean DEFAULT false NOT NULL,
	"dispositivo" text,
	"justificativa" text,
	"despesa_id" uuid
);
--> statement-breakpoint
ALTER TABLE "project" ADD COLUMN "endereco" text;--> statement-breakpoint
ALTER TABLE "project" ADD COLUMN "latitude" numeric(10, 7);--> statement-breakpoint
ALTER TABLE "project" ADD COLUMN "longitude" numeric(10, 7);--> statement-breakpoint
ALTER TABLE "project" ADD COLUMN "ponto_raio_metros" integer DEFAULT 100 NOT NULL;--> statement-breakpoint
ALTER TABLE "time_entry" ADD CONSTRAINT "time_entry_tenant_id_tenant_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenant"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "time_entry" ADD CONSTRAINT "time_entry_project_id_project_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."project"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "time_entry" ADD CONSTRAINT "time_entry_despesa_id_despesa_id_fk" FOREIGN KEY ("despesa_id") REFERENCES "public"."despesa"("id") ON DELETE set null ON UPDATE no action;