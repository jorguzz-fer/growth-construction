CREATE TABLE "despesa_parcela" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"despesa_id" uuid NOT NULL,
	"numero_parcela" integer NOT NULL,
	"vencimento" text,
	"valor_original" numeric(15, 2) DEFAULT '0' NOT NULL,
	"valor_pago" numeric(15, 2) DEFAULT '0' NOT NULL,
	"multa" numeric(15, 2) DEFAULT '0' NOT NULL,
	"juros" numeric(15, 2) DEFAULT '0' NOT NULL,
	"desconto" numeric(15, 2) DEFAULT '0' NOT NULL,
	"outros_acrescimos" numeric(15, 2) DEFAULT '0' NOT NULL,
	"data_pagamento" text,
	"forma_pagamento" text,
	"bank_account_id" uuid,
	"status" text DEFAULT 'Pendente' NOT NULL,
	"obs" text,
	"created_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "despesa_parcela_uq" UNIQUE("despesa_id","numero_parcela")
);
--> statement-breakpoint
ALTER TABLE "despesa" ADD COLUMN "forma_pagamento" text;--> statement-breakpoint
ALTER TABLE "despesa" ADD COLUMN "forma_pagamento_desc" text;--> statement-breakpoint
ALTER TABLE "despesa" ADD COLUMN "condicao_pagamento" text;--> statement-breakpoint
ALTER TABLE "despesa" ADD COLUMN "qtd_parcelas" integer;--> statement-breakpoint
ALTER TABLE "despesa" ADD COLUMN "data_emissao" text;--> statement-breakpoint
ALTER TABLE "despesa" ADD COLUMN "boleto_linha_digitavel" text;--> statement-breakpoint
ALTER TABLE "despesa" ADD COLUMN "boleto_codigo_barras" text;--> statement-breakpoint
ALTER TABLE "despesa" ADD COLUMN "boleto_banco" text;--> statement-breakpoint
ALTER TABLE "despesa" ADD COLUMN "cheque_numero" text;--> statement-breakpoint
ALTER TABLE "despesa" ADD COLUMN "cheque_banco" text;--> statement-breakpoint
ALTER TABLE "despesa" ADD COLUMN "cheque_ag" text;--> statement-breakpoint
ALTER TABLE "despesa" ADD COLUMN "cheque_conta" text;--> statement-breakpoint
ALTER TABLE "despesa" ADD COLUMN "cheque_emitente" text;--> statement-breakpoint
ALTER TABLE "despesa" ADD COLUMN "cheque_data_emissao" text;--> statement-breakpoint
ALTER TABLE "despesa" ADD COLUMN "cheque_data_compensacao" text;--> statement-breakpoint
ALTER TABLE "despesa" ADD COLUMN "cheque_status" text;--> statement-breakpoint
ALTER TABLE "despesa_parcela" ADD CONSTRAINT "despesa_parcela_tenant_id_tenant_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenant"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "despesa_parcela" ADD CONSTRAINT "despesa_parcela_despesa_id_despesa_id_fk" FOREIGN KEY ("despesa_id") REFERENCES "public"."despesa"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "despesa_parcela" ADD CONSTRAINT "despesa_parcela_bank_account_id_bank_account_id_fk" FOREIGN KEY ("bank_account_id") REFERENCES "public"."bank_account"("id") ON DELETE set null ON UPDATE no action;