CREATE TABLE "despesa_terceiro" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"despesa_id" uuid NOT NULL,
	"pagador_terceiro_id" uuid,
	"empresa_responsavel_id" uuid,
	"valor_total" numeric(15, 2) DEFAULT '0' NOT NULL,
	"valor_restituido" numeric(15, 2) DEFAULT '0' NOT NULL,
	"data_pagamento_original" text,
	"data_prevista_restituicao" text,
	"status" text DEFAULT 'Aguardando restituição' NOT NULL,
	"obs" text,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "restituicao" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"despesa_terceiro_id" uuid NOT NULL,
	"valor" numeric(15, 2) DEFAULT '0' NOT NULL,
	"data_restituicao" text,
	"bank_account_id" uuid,
	"comprovante" text,
	"obs" text,
	"usuario_id" text,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "despesa" ADD COLUMN "pago_por_terceiro" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "despesa_terceiro" ADD CONSTRAINT "despesa_terceiro_tenant_id_tenant_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenant"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "despesa_terceiro" ADD CONSTRAINT "despesa_terceiro_despesa_id_despesa_id_fk" FOREIGN KEY ("despesa_id") REFERENCES "public"."despesa"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "despesa_terceiro" ADD CONSTRAINT "despesa_terceiro_pagador_terceiro_id_stakeholder_id_fk" FOREIGN KEY ("pagador_terceiro_id") REFERENCES "public"."stakeholder"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "despesa_terceiro" ADD CONSTRAINT "despesa_terceiro_empresa_responsavel_id_project_id_fk" FOREIGN KEY ("empresa_responsavel_id") REFERENCES "public"."project"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "restituicao" ADD CONSTRAINT "restituicao_tenant_id_tenant_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenant"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "restituicao" ADD CONSTRAINT "restituicao_despesa_terceiro_id_despesa_terceiro_id_fk" FOREIGN KEY ("despesa_terceiro_id") REFERENCES "public"."despesa_terceiro"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "restituicao" ADD CONSTRAINT "restituicao_bank_account_id_bank_account_id_fk" FOREIGN KEY ("bank_account_id") REFERENCES "public"."bank_account"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "restituicao" ADD CONSTRAINT "restituicao_usuario_id_user_id_fk" FOREIGN KEY ("usuario_id") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;