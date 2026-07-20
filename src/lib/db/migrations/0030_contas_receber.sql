CREATE TABLE "conta_receber" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"project_id" uuid NOT NULL,
	"unit_code" text,
	"cliente_id" uuid,
	"descricao" text,
	"tipo" text DEFAULT 'Outros' NOT NULL,
	"valor" numeric(15, 2) DEFAULT '0' NOT NULL,
	"vencimento" text,
	"data_recebimento" text,
	"valor_recebido" numeric(15, 2) DEFAULT '0' NOT NULL,
	"status" text DEFAULT 'A receber' NOT NULL,
	"banco_id" uuid,
	"origem_cash_entry_id" uuid,
	"cancelado" boolean DEFAULT false NOT NULL,
	"created_by" text,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "cash_entry" ADD COLUMN "conciliado_conta_receber_id" uuid;--> statement-breakpoint
ALTER TABLE "conta_receber" ADD CONSTRAINT "conta_receber_tenant_id_tenant_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenant"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "conta_receber" ADD CONSTRAINT "conta_receber_project_id_project_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."project"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "conta_receber" ADD CONSTRAINT "conta_receber_cliente_id_cliente_id_fk" FOREIGN KEY ("cliente_id") REFERENCES "public"."cliente"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "conta_receber" ADD CONSTRAINT "conta_receber_banco_id_bank_account_id_fk" FOREIGN KEY ("banco_id") REFERENCES "public"."bank_account"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "conta_receber" ADD CONSTRAINT "conta_receber_origem_cash_entry_id_cash_entry_id_fk" FOREIGN KEY ("origem_cash_entry_id") REFERENCES "public"."cash_entry"("id") ON DELETE set null ON UPDATE no action;