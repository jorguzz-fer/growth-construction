-- 0035 — Documento fiscal (item 1.2) e recebimento por terceiro (RG-02/RG-04).
--
-- ADITIVA E REVERSÍVEL. Cria três tabelas NOVAS e uma coluna NULÁVEL. Não
-- apaga, não altera e não reclassifica nenhum registro existente: as despesas,
-- os valores, as competências e os números PED ficam exatamente como estão.
-- Toda instrução usa IF NOT EXISTS / guarda DO $$, para poder ser reaplicada
-- após um rollback (as migrações rodam no boot do contêiner).
--
-- A tabela `documento_fiscal` é 1:N com despesa e nasce VAZIA: uma despesa sem
-- nota simplesmente não tem linha aqui. Nenhum dado é migrado do campo de nº do
-- pedido nesta migração — essa migração é separada, em duas fases, e só roda
-- após conferência humana do CSV (ver scripts/migracao-pedido-para-nf.ts).

CREATE TABLE IF NOT EXISTS "documento_fiscal" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"despesa_id" uuid NOT NULL,
	"tipo" text DEFAULT 'SEM_DOC' NOT NULL,
	"numero" text,
	"serie" text,
	"chave_acesso" text,
	"data_emissao" text,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "recebimento_terceiro" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"recebedor_terceiro_id" uuid,
	"project_id" uuid,
	"conta_receber_id" uuid,
	"cliente_id" uuid,
	"unit_code" text,
	"valor_total" numeric(15, 2) DEFAULT '0' NOT NULL,
	"valor_repassado" numeric(15, 2) DEFAULT '0' NOT NULL,
	"data_recebimento" text,
	"data_prevista_repasse" text,
	"status" text DEFAULT 'Aguardando repasse' NOT NULL,
	"obs" text,
	"idempotency_key" text,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "repasse" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"recebimento_terceiro_id" uuid NOT NULL,
	"valor" numeric(15, 2) DEFAULT '0' NOT NULL,
	"data_repasse" text,
	"bank_account_id" uuid,
	"cash_entry_id" uuid,
	"comprovante" text,
	"obs" text,
	"idempotency_key" text,
	"usuario_id" text,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "document" ADD COLUMN IF NOT EXISTS "numero_documento_fiscal" text;--> statement-breakpoint
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'documento_fiscal_tenant_id_tenant_id_fk') THEN
    ALTER TABLE "documento_fiscal" ADD CONSTRAINT "documento_fiscal_tenant_id_tenant_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenant"("id") ON DELETE cascade ON UPDATE no action;
  END IF;
END $$;--> statement-breakpoint
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'documento_fiscal_despesa_id_despesa_id_fk') THEN
    ALTER TABLE "documento_fiscal" ADD CONSTRAINT "documento_fiscal_despesa_id_despesa_id_fk" FOREIGN KEY ("despesa_id") REFERENCES "public"."despesa"("id") ON DELETE cascade ON UPDATE no action;
  END IF;
END $$;--> statement-breakpoint
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'recebimento_terceiro_tenant_id_tenant_id_fk') THEN
    ALTER TABLE "recebimento_terceiro" ADD CONSTRAINT "recebimento_terceiro_tenant_id_tenant_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenant"("id") ON DELETE cascade ON UPDATE no action;
  END IF;
END $$;--> statement-breakpoint
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'recebimento_terceiro_recebedor_terceiro_id_stakeholder_id_fk') THEN
    ALTER TABLE "recebimento_terceiro" ADD CONSTRAINT "recebimento_terceiro_recebedor_terceiro_id_stakeholder_id_fk" FOREIGN KEY ("recebedor_terceiro_id") REFERENCES "public"."stakeholder"("id") ON DELETE set null ON UPDATE no action;
  END IF;
END $$;--> statement-breakpoint
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'recebimento_terceiro_project_id_project_id_fk') THEN
    ALTER TABLE "recebimento_terceiro" ADD CONSTRAINT "recebimento_terceiro_project_id_project_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."project"("id") ON DELETE set null ON UPDATE no action;
  END IF;
END $$;--> statement-breakpoint
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'recebimento_terceiro_conta_receber_id_conta_receber_id_fk') THEN
    ALTER TABLE "recebimento_terceiro" ADD CONSTRAINT "recebimento_terceiro_conta_receber_id_conta_receber_id_fk" FOREIGN KEY ("conta_receber_id") REFERENCES "public"."conta_receber"("id") ON DELETE set null ON UPDATE no action;
  END IF;
END $$;--> statement-breakpoint
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'recebimento_terceiro_cliente_id_cliente_id_fk') THEN
    ALTER TABLE "recebimento_terceiro" ADD CONSTRAINT "recebimento_terceiro_cliente_id_cliente_id_fk" FOREIGN KEY ("cliente_id") REFERENCES "public"."cliente"("id") ON DELETE set null ON UPDATE no action;
  END IF;
END $$;--> statement-breakpoint
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'repasse_tenant_id_tenant_id_fk') THEN
    ALTER TABLE "repasse" ADD CONSTRAINT "repasse_tenant_id_tenant_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenant"("id") ON DELETE cascade ON UPDATE no action;
  END IF;
END $$;--> statement-breakpoint
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'repasse_recebimento_terceiro_id_recebimento_terceiro_id_fk') THEN
    ALTER TABLE "repasse" ADD CONSTRAINT "repasse_recebimento_terceiro_id_recebimento_terceiro_id_fk" FOREIGN KEY ("recebimento_terceiro_id") REFERENCES "public"."recebimento_terceiro"("id") ON DELETE cascade ON UPDATE no action;
  END IF;
END $$;--> statement-breakpoint
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'repasse_bank_account_id_bank_account_id_fk') THEN
    ALTER TABLE "repasse" ADD CONSTRAINT "repasse_bank_account_id_bank_account_id_fk" FOREIGN KEY ("bank_account_id") REFERENCES "public"."bank_account"("id") ON DELETE set null ON UPDATE no action;
  END IF;
END $$;--> statement-breakpoint
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'repasse_cash_entry_id_cash_entry_id_fk') THEN
    ALTER TABLE "repasse" ADD CONSTRAINT "repasse_cash_entry_id_cash_entry_id_fk" FOREIGN KEY ("cash_entry_id") REFERENCES "public"."cash_entry"("id") ON DELETE set null ON UPDATE no action;
  END IF;
END $$;--> statement-breakpoint
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'repasse_usuario_id_user_id_fk') THEN
    ALTER TABLE "repasse" ADD CONSTRAINT "repasse_usuario_id_user_id_fk" FOREIGN KEY ("usuario_id") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;
  END IF;
END $$;

-- Índices de consulta (RNF de performance) e de idempotência (§16).
CREATE INDEX IF NOT EXISTS "documento_fiscal_despesa_idx"
  ON "documento_fiscal" ("despesa_id");--> statement-breakpoint

-- Alerta de duplicidade do item 1.2 usa esta busca: tenant + tipo + série + nº.
-- É ÍNDICE, não constraint: numeração de NF é sequencial por emitente e série,
-- então bloquear geraria falso positivo legítimo. O alerta fica na aplicação.
CREATE INDEX IF NOT EXISTS "documento_fiscal_busca_idx"
  ON "documento_fiscal" ("tenant_id", "tipo", "serie", "numero");--> statement-breakpoint

CREATE INDEX IF NOT EXISTS "document_num_fiscal_idx"
  ON "document" ("tenant_id", "numero_documento_fiscal");--> statement-breakpoint

CREATE UNIQUE INDEX IF NOT EXISTS "recebimento_terceiro_idem_uq"
  ON "recebimento_terceiro" ("tenant_id", "idempotency_key")
  WHERE "idempotency_key" IS NOT NULL;--> statement-breakpoint

CREATE UNIQUE INDEX IF NOT EXISTS "repasse_idem_uq"
  ON "repasse" ("tenant_id", "idempotency_key")
  WHERE "idempotency_key" IS NOT NULL;--> statement-breakpoint

-- Um item do extrato não pode lastrear dois repasses (entrada de caixa dupla).
CREATE UNIQUE INDEX IF NOT EXISTS "repasse_cash_entry_uq"
  ON "repasse" ("cash_entry_id")
  WHERE "cash_entry_id" IS NOT NULL;--> statement-breakpoint

CREATE INDEX IF NOT EXISTS "recebimento_terceiro_saldo_idx"
  ON "recebimento_terceiro" ("tenant_id", "recebedor_terceiro_id", "status");
