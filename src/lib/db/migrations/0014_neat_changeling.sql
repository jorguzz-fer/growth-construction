ALTER TYPE "public"."dre_category" ADD VALUE 'Despesas Financeiras';--> statement-breakpoint
CREATE TABLE "pagamento" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"parcela_id" uuid,
	"despesa_id" uuid,
	"valor_original" numeric(15, 2) DEFAULT '0' NOT NULL,
	"desconto" numeric(15, 2) DEFAULT '0' NOT NULL,
	"multa" numeric(15, 2) DEFAULT '0' NOT NULL,
	"juros" numeric(15, 2) DEFAULT '0' NOT NULL,
	"outros_acrescimos" numeric(15, 2) DEFAULT '0' NOT NULL,
	"valor_total_pago" numeric(15, 2) DEFAULT '0' NOT NULL,
	"data_pagamento" text,
	"bank_account_id" uuid,
	"categoria_encargos" text DEFAULT 'Despesas Financeiras' NOT NULL,
	"obs" text,
	"usuario_id" text,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "pagamento" ADD CONSTRAINT "pagamento_tenant_id_tenant_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenant"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "pagamento" ADD CONSTRAINT "pagamento_parcela_id_despesa_parcela_id_fk" FOREIGN KEY ("parcela_id") REFERENCES "public"."despesa_parcela"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "pagamento" ADD CONSTRAINT "pagamento_despesa_id_despesa_id_fk" FOREIGN KEY ("despesa_id") REFERENCES "public"."despesa"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "pagamento" ADD CONSTRAINT "pagamento_bank_account_id_bank_account_id_fk" FOREIGN KEY ("bank_account_id") REFERENCES "public"."bank_account"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "pagamento" ADD CONSTRAINT "pagamento_usuario_id_user_id_fk" FOREIGN KEY ("usuario_id") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;