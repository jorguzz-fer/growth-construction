CREATE TYPE "public"."account_kind" AS ENUM('cef', 'complementar');--> statement-breakpoint
CREATE TYPE "public"."bank_account_type" AS ENUM('Imobiliária', 'Construtora');--> statement-breakpoint
CREATE TYPE "public"."dre_category" AS ENUM('Receita', 'Custo Variável', 'Custo Fixo', 'Despesa Variável', 'Despesa Fixa', 'Retiradas', 'Investimento');--> statement-breakpoint
CREATE TYPE "public"."project_kind" AS ENUM('proj', 'office');--> statement-breakpoint
CREATE TYPE "public"."project_status" AS ENUM('Em andamento', 'Planejamento');--> statement-breakpoint
CREATE TYPE "public"."stakeholder_type" AS ENUM('PJ', 'PF');--> statement-breakpoint
CREATE TYPE "public"."unit_status" AS ENUM('Disponivel', 'Reservado', 'Vendido');--> statement-breakpoint
CREATE TYPE "public"."version_kind" AS ENUM('budget', 'forecast', 'atual', 'custom');--> statement-breakpoint
CREATE TABLE "bank_account" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"banco" text NOT NULL,
	"ag" text,
	"op" text,
	"cc" text,
	"tipo" "bank_account_type" DEFAULT 'Construtora' NOT NULL,
	"open_finance_id" text,
	"last_sync" timestamp
);
--> statement-breakpoint
CREATE TABLE "cash_entry" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"version_id" uuid NOT NULL,
	"tenant_id" uuid NOT NULL,
	"bank_account_id" uuid,
	"data" text,
	"descricao" text,
	"valor" numeric(15, 2) DEFAULT '0' NOT NULL,
	"cat" text,
	"unit_code" text,
	"rec" boolean DEFAULT false NOT NULL
);
--> statement-breakpoint
CREATE TABLE "chart_account" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"code" text NOT NULL,
	"name" text NOT NULL,
	"group_code" text NOT NULL,
	"group_name" text NOT NULL,
	"kind" "account_kind" NOT NULL,
	CONSTRAINT "chart_account_tenant_code_uq" UNIQUE("tenant_id","code")
);
--> statement-breakpoint
CREATE TABLE "despesa" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"version_id" uuid NOT NULL,
	"tenant_id" uuid NOT NULL,
	"fornecedor_id" uuid,
	"banco_id" uuid,
	"conta_cef" text,
	"categoria_dre" "dre_category",
	"competencia" text,
	"vencimento" text,
	"data_caixa" text,
	"valor" numeric(15, 2) DEFAULT '0' NOT NULL,
	"status" text,
	"obs" text,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "document" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"despesa_id" uuid,
	"storage_key" text NOT NULL,
	"filename" text NOT NULL,
	"content_type" text,
	"size" integer,
	"uploaded_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "incc_rate" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"project_id" uuid NOT NULL,
	"tenant_id" uuid NOT NULL,
	"mes" text NOT NULL,
	"monthly" numeric(8, 4) NOT NULL,
	"accumulated" numeric(8, 4) NOT NULL,
	"ordem" integer NOT NULL,
	CONSTRAINT "incc_project_mes_uq" UNIQUE("project_id","mes")
);
--> statement-breakpoint
CREATE TABLE "permuta" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"version_id" uuid NOT NULL,
	"tenant_id" uuid NOT NULL,
	"unit_code" text,
	"cliente" text,
	"data_recebimento" text,
	"tipo" text,
	"descricao" text,
	"estimado" numeric(15, 2),
	"status" text,
	"data_venda" text,
	"valor_venda" numeric(15, 2),
	"tipo_permuta" text,
	"obs" text
);
--> statement-breakpoint
CREATE TABLE "project" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"name" text NOT NULL,
	"kind" "project_kind" DEFAULT 'proj' NOT NULL,
	"status" "project_status" DEFAULT 'Planejamento' NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "reembolso" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"version_id" uuid NOT NULL,
	"tenant_id" uuid NOT NULL,
	"data" text,
	"origem" text,
	"valor" numeric(15, 2),
	"pct" text,
	"obs" text,
	"serial" integer,
	"status" text
);
--> statement-breakpoint
CREATE TABLE "stakeholder" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"nome" text NOT NULL,
	"tipo" "stakeholder_type" DEFAULT 'PJ' NOT NULL,
	"doc" text,
	"papeis" text[] DEFAULT '{}' NOT NULL,
	"email" text,
	"tel" text,
	"obs" text
);
--> statement-breakpoint
CREATE TABLE "unit" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"version_id" uuid NOT NULL,
	"tenant_id" uuid NOT NULL,
	"code" text NOT NULL,
	"bloco" text,
	"tipo" text,
	"m2" numeric(8, 2),
	"andar" integer,
	"valor" numeric(15, 2) DEFAULT '0' NOT NULL,
	"status" "unit_status" DEFAULT 'Disponivel' NOT NULL,
	"mes_venda" text,
	"payment_plan" jsonb,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "version" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"project_id" uuid NOT NULL,
	"tenant_id" uuid NOT NULL,
	"key" text NOT NULL,
	"kind" "version_kind" NOT NULL,
	"label" text NOT NULL,
	"color" text NOT NULL,
	"is_default" boolean DEFAULT false NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "version_project_key_uq" UNIQUE("project_id","key")
);
--> statement-breakpoint
ALTER TABLE "bank_account" ADD CONSTRAINT "bank_account_tenant_id_tenant_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenant"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "cash_entry" ADD CONSTRAINT "cash_entry_version_id_version_id_fk" FOREIGN KEY ("version_id") REFERENCES "public"."version"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "cash_entry" ADD CONSTRAINT "cash_entry_tenant_id_tenant_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenant"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "cash_entry" ADD CONSTRAINT "cash_entry_bank_account_id_bank_account_id_fk" FOREIGN KEY ("bank_account_id") REFERENCES "public"."bank_account"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "chart_account" ADD CONSTRAINT "chart_account_tenant_id_tenant_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenant"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "despesa" ADD CONSTRAINT "despesa_version_id_version_id_fk" FOREIGN KEY ("version_id") REFERENCES "public"."version"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "despesa" ADD CONSTRAINT "despesa_tenant_id_tenant_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenant"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "despesa" ADD CONSTRAINT "despesa_fornecedor_id_stakeholder_id_fk" FOREIGN KEY ("fornecedor_id") REFERENCES "public"."stakeholder"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "despesa" ADD CONSTRAINT "despesa_banco_id_bank_account_id_fk" FOREIGN KEY ("banco_id") REFERENCES "public"."bank_account"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "document" ADD CONSTRAINT "document_tenant_id_tenant_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenant"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "document" ADD CONSTRAINT "document_despesa_id_despesa_id_fk" FOREIGN KEY ("despesa_id") REFERENCES "public"."despesa"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "incc_rate" ADD CONSTRAINT "incc_rate_project_id_project_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."project"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "incc_rate" ADD CONSTRAINT "incc_rate_tenant_id_tenant_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenant"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "permuta" ADD CONSTRAINT "permuta_version_id_version_id_fk" FOREIGN KEY ("version_id") REFERENCES "public"."version"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "permuta" ADD CONSTRAINT "permuta_tenant_id_tenant_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenant"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "project" ADD CONSTRAINT "project_tenant_id_tenant_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenant"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "reembolso" ADD CONSTRAINT "reembolso_version_id_version_id_fk" FOREIGN KEY ("version_id") REFERENCES "public"."version"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "reembolso" ADD CONSTRAINT "reembolso_tenant_id_tenant_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenant"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "stakeholder" ADD CONSTRAINT "stakeholder_tenant_id_tenant_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenant"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "unit" ADD CONSTRAINT "unit_version_id_version_id_fk" FOREIGN KEY ("version_id") REFERENCES "public"."version"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "unit" ADD CONSTRAINT "unit_tenant_id_tenant_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenant"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "version" ADD CONSTRAINT "version_project_id_project_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."project"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "version" ADD CONSTRAINT "version_tenant_id_tenant_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenant"("id") ON DELETE cascade ON UPDATE no action;