CREATE TABLE "carry_over" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"closing_id" uuid,
	"tipo" text NOT NULL,
	"ref_id" text,
	"descricao" text,
	"valor" numeric(15, 2) DEFAULT '0' NOT NULL,
	"vencimento" text,
	"from_dia" text NOT NULL,
	"to_dia" text NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "daily_closing" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"project_id" uuid,
	"dia" text NOT NULL,
	"saldo_inicial" numeric(15, 2) DEFAULT '0' NOT NULL,
	"total_entradas" numeric(15, 2) DEFAULT '0' NOT NULL,
	"total_saidas" numeric(15, 2) DEFAULT '0' NOT NULL,
	"saldo_final" numeric(15, 2) DEFAULT '0' NOT NULL,
	"divergencias" numeric(15, 2) DEFAULT '0' NOT NULL,
	"responsavel_id" text,
	"responsavel_nome" text,
	"obs" text,
	"closed_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "carry_over" ADD CONSTRAINT "carry_over_tenant_id_tenant_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenant"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "carry_over" ADD CONSTRAINT "carry_over_closing_id_daily_closing_id_fk" FOREIGN KEY ("closing_id") REFERENCES "public"."daily_closing"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "daily_closing" ADD CONSTRAINT "daily_closing_tenant_id_tenant_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenant"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "daily_closing" ADD CONSTRAINT "daily_closing_project_id_project_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."project"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "daily_closing" ADD CONSTRAINT "daily_closing_responsavel_id_user_id_fk" FOREIGN KEY ("responsavel_id") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;