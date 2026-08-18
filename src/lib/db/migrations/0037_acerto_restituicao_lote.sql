-- 0037 — Acerto Contábil (Módulo 5), restituição em lote (item 4.2) e
-- compensação/encontro de contas (RG-05).
--
-- ADITIVA E REVERSÍVEL. Só cria TABELAS NOVAS — nenhuma coluna é removida ou
-- alterada, nenhum lançamento é tocado. Despesas, parcelas, obrigações,
-- restituições, unidades, contas a receber e caixa ficam exatamente como estão.
-- Todas as instruções usam IF NOT EXISTS / guarda DO $$, para poderem ser
-- reaplicadas após um rollback (as migrações rodam no boot do contêiner).

CREATE TABLE IF NOT EXISTS "acerto_item" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"acerto_id" uuid NOT NULL,
	"despesa_id" uuid NOT NULL,
	"valor_abatido" numeric(15, 2) DEFAULT '0' NOT NULL,
	"status_anterior" text,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "acerto" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"num_doc" text,
	"data_pagamento" text,
	"bank_account_id" uuid,
	"valor_transferido" numeric(15, 2) DEFAULT '0' NOT NULL,
	"forma_pagamento" text,
	"favorecido_id" uuid,
	"comprovante_document_id" uuid,
	"diferenca_valor" numeric(15, 2) DEFAULT '0' NOT NULL,
	"diferenca_tipo" text DEFAULT 'NENHUMA' NOT NULL,
	"diferenca_despesa_id" uuid,
	"cash_entry_id" uuid,
	"obs" text,
	"estornado" boolean DEFAULT false NOT NULL,
	"estornado_em" text,
	"estornado_por" text,
	"idempotency_key" text,
	"usuario_id" text,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "compensacao" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"num_doc" text,
	"terceiro_id" uuid,
	"valor" numeric(15, 2) DEFAULT '0' NOT NULL,
	"data" text,
	"saldo_restituir_antes" numeric(15, 2) DEFAULT '0' NOT NULL,
	"saldo_repassar_antes" numeric(15, 2) DEFAULT '0' NOT NULL,
	"obs" text,
	"idempotency_key" text,
	"usuario_id" text,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "rateio_obra" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"acerto_id" uuid,
	"project_id" uuid,
	"despesa_id" uuid,
	"valor" numeric(15, 2) DEFAULT '0' NOT NULL,
	"percentual" numeric(9, 4) DEFAULT '0' NOT NULL,
	"base_rateio" text,
	"memoria_calculo" jsonb,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "restituicao_item" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"restituicao_id" uuid NOT NULL,
	"despesa_terceiro_id" uuid NOT NULL,
	"valor_abatido" numeric(15, 2) DEFAULT '0' NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'acerto_item_tenant_id_tenant_id_fk') THEN
    ALTER TABLE "acerto_item" ADD CONSTRAINT "acerto_item_tenant_id_tenant_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenant"("id") ON DELETE cascade ON UPDATE no action;
  END IF;
END $$;--> statement-breakpoint
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'acerto_item_acerto_id_acerto_id_fk') THEN
    ALTER TABLE "acerto_item" ADD CONSTRAINT "acerto_item_acerto_id_acerto_id_fk" FOREIGN KEY ("acerto_id") REFERENCES "public"."acerto"("id") ON DELETE cascade ON UPDATE no action;
  END IF;
END $$;--> statement-breakpoint
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'acerto_item_despesa_id_despesa_id_fk') THEN
    ALTER TABLE "acerto_item" ADD CONSTRAINT "acerto_item_despesa_id_despesa_id_fk" FOREIGN KEY ("despesa_id") REFERENCES "public"."despesa"("id") ON DELETE cascade ON UPDATE no action;
  END IF;
END $$;--> statement-breakpoint
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'acerto_tenant_id_tenant_id_fk') THEN
    ALTER TABLE "acerto" ADD CONSTRAINT "acerto_tenant_id_tenant_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenant"("id") ON DELETE cascade ON UPDATE no action;
  END IF;
END $$;--> statement-breakpoint
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'acerto_bank_account_id_bank_account_id_fk') THEN
    ALTER TABLE "acerto" ADD CONSTRAINT "acerto_bank_account_id_bank_account_id_fk" FOREIGN KEY ("bank_account_id") REFERENCES "public"."bank_account"("id") ON DELETE set null ON UPDATE no action;
  END IF;
END $$;--> statement-breakpoint
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'acerto_favorecido_id_stakeholder_id_fk') THEN
    ALTER TABLE "acerto" ADD CONSTRAINT "acerto_favorecido_id_stakeholder_id_fk" FOREIGN KEY ("favorecido_id") REFERENCES "public"."stakeholder"("id") ON DELETE set null ON UPDATE no action;
  END IF;
END $$;--> statement-breakpoint
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'acerto_comprovante_document_id_document_id_fk') THEN
    ALTER TABLE "acerto" ADD CONSTRAINT "acerto_comprovante_document_id_document_id_fk" FOREIGN KEY ("comprovante_document_id") REFERENCES "public"."document"("id") ON DELETE set null ON UPDATE no action;
  END IF;
END $$;--> statement-breakpoint
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'acerto_diferenca_despesa_id_despesa_id_fk') THEN
    ALTER TABLE "acerto" ADD CONSTRAINT "acerto_diferenca_despesa_id_despesa_id_fk" FOREIGN KEY ("diferenca_despesa_id") REFERENCES "public"."despesa"("id") ON DELETE set null ON UPDATE no action;
  END IF;
END $$;--> statement-breakpoint
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'acerto_cash_entry_id_cash_entry_id_fk') THEN
    ALTER TABLE "acerto" ADD CONSTRAINT "acerto_cash_entry_id_cash_entry_id_fk" FOREIGN KEY ("cash_entry_id") REFERENCES "public"."cash_entry"("id") ON DELETE set null ON UPDATE no action;
  END IF;
END $$;--> statement-breakpoint
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'acerto_usuario_id_user_id_fk') THEN
    ALTER TABLE "acerto" ADD CONSTRAINT "acerto_usuario_id_user_id_fk" FOREIGN KEY ("usuario_id") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;
  END IF;
END $$;--> statement-breakpoint
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'compensacao_tenant_id_tenant_id_fk') THEN
    ALTER TABLE "compensacao" ADD CONSTRAINT "compensacao_tenant_id_tenant_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenant"("id") ON DELETE cascade ON UPDATE no action;
  END IF;
END $$;--> statement-breakpoint
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'compensacao_terceiro_id_stakeholder_id_fk') THEN
    ALTER TABLE "compensacao" ADD CONSTRAINT "compensacao_terceiro_id_stakeholder_id_fk" FOREIGN KEY ("terceiro_id") REFERENCES "public"."stakeholder"("id") ON DELETE set null ON UPDATE no action;
  END IF;
END $$;--> statement-breakpoint
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'compensacao_usuario_id_user_id_fk') THEN
    ALTER TABLE "compensacao" ADD CONSTRAINT "compensacao_usuario_id_user_id_fk" FOREIGN KEY ("usuario_id") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;
  END IF;
END $$;--> statement-breakpoint
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'rateio_obra_tenant_id_tenant_id_fk') THEN
    ALTER TABLE "rateio_obra" ADD CONSTRAINT "rateio_obra_tenant_id_tenant_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenant"("id") ON DELETE cascade ON UPDATE no action;
  END IF;
END $$;--> statement-breakpoint
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'rateio_obra_acerto_id_acerto_id_fk') THEN
    ALTER TABLE "rateio_obra" ADD CONSTRAINT "rateio_obra_acerto_id_acerto_id_fk" FOREIGN KEY ("acerto_id") REFERENCES "public"."acerto"("id") ON DELETE cascade ON UPDATE no action;
  END IF;
END $$;--> statement-breakpoint
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'rateio_obra_project_id_project_id_fk') THEN
    ALTER TABLE "rateio_obra" ADD CONSTRAINT "rateio_obra_project_id_project_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."project"("id") ON DELETE set null ON UPDATE no action;
  END IF;
END $$;--> statement-breakpoint
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'rateio_obra_despesa_id_despesa_id_fk') THEN
    ALTER TABLE "rateio_obra" ADD CONSTRAINT "rateio_obra_despesa_id_despesa_id_fk" FOREIGN KEY ("despesa_id") REFERENCES "public"."despesa"("id") ON DELETE set null ON UPDATE no action;
  END IF;
END $$;--> statement-breakpoint
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'restituicao_item_tenant_id_tenant_id_fk') THEN
    ALTER TABLE "restituicao_item" ADD CONSTRAINT "restituicao_item_tenant_id_tenant_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenant"("id") ON DELETE cascade ON UPDATE no action;
  END IF;
END $$;--> statement-breakpoint
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'restituicao_item_restituicao_id_restituicao_id_fk') THEN
    ALTER TABLE "restituicao_item" ADD CONSTRAINT "restituicao_item_restituicao_id_restituicao_id_fk" FOREIGN KEY ("restituicao_id") REFERENCES "public"."restituicao"("id") ON DELETE cascade ON UPDATE no action;
  END IF;
END $$;--> statement-breakpoint
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'restituicao_item_despesa_terceiro_id_despesa_terceiro_id_fk') THEN
    ALTER TABLE "restituicao_item" ADD CONSTRAINT "restituicao_item_despesa_terceiro_id_despesa_terceiro_id_fk" FOREIGN KEY ("despesa_terceiro_id") REFERENCES "public"."despesa_terceiro"("id") ON DELETE cascade ON UPDATE no action;
  END IF;
END $$;

-- Índices de consulta e travas de duplicidade (§16 / RNF de performance).
CREATE UNIQUE INDEX IF NOT EXISTS "acerto_idem_uq"
  ON "acerto" ("tenant_id", "idempotency_key")
  WHERE "idempotency_key" IS NOT NULL;--> statement-breakpoint

CREATE UNIQUE INDEX IF NOT EXISTS "compensacao_idem_uq"
  ON "compensacao" ("tenant_id", "idempotency_key")
  WHERE "idempotency_key" IS NOT NULL;--> statement-breakpoint

-- Uma despesa não pode ser abatida duas vezes pelo MESMO acerto.
CREATE UNIQUE INDEX IF NOT EXISTS "acerto_item_uq"
  ON "acerto_item" ("acerto_id", "despesa_id");--> statement-breakpoint

-- Um PED de origem não pode ser abatido duas vezes pela MESMA restituição.
CREATE UNIQUE INDEX IF NOT EXISTS "restituicao_item_uq"
  ON "restituicao_item" ("restituicao_id", "despesa_terceiro_id");--> statement-breakpoint

CREATE INDEX IF NOT EXISTS "acerto_item_despesa_idx" ON "acerto_item" ("despesa_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "restituicao_item_origem_idx" ON "restituicao_item" ("despesa_terceiro_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "acerto_periodo_idx" ON "acerto" ("tenant_id", "data_pagamento");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "rateio_obra_projeto_idx" ON "rateio_obra" ("tenant_id", "project_id");
