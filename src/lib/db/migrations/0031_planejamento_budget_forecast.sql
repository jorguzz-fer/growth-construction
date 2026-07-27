CREATE TABLE "budget_account" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"version_id" uuid NOT NULL,
	"kind" text NOT NULL,
	"row_key" text NOT NULL,
	"dre_category" text,
	"total" numeric(15, 2) DEFAULT '0' NOT NULL,
	CONSTRAINT "budget_account_uq" UNIQUE("version_id","kind","row_key")
);
--> statement-breakpoint
ALTER TABLE "budget_line" ADD COLUMN "pct" numeric(7, 4);--> statement-breakpoint
ALTER TABLE "chart_account" ADD COLUMN "natureza" text DEFAULT 'despesa' NOT NULL;--> statement-breakpoint
ALTER TABLE "chart_account" ADD COLUMN "ativo" boolean DEFAULT true NOT NULL;--> statement-breakpoint
ALTER TABLE "project" ADD COLUMN "mes_inicial" text;--> statement-breakpoint
ALTER TABLE "project" ADD COLUMN "mes_final" text;--> statement-breakpoint
ALTER TABLE "version" ADD COLUMN "status" text DEFAULT 'Rascunho' NOT NULL;--> statement-breakpoint
ALTER TABLE "version" ADD COLUMN "source_version_id" uuid;--> statement-breakpoint
ALTER TABLE "budget_account" ADD CONSTRAINT "budget_account_tenant_id_tenant_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenant"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "budget_account" ADD CONSTRAINT "budget_account_version_id_version_id_fk" FOREIGN KEY ("version_id") REFERENCES "public"."version"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "version" ADD CONSTRAINT "version_source_version_id_version_id_fk" FOREIGN KEY ("source_version_id") REFERENCES "public"."version"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
-- Backfill do modelo total + %: cria o total por conta a partir dos valores
-- mensais já lançados e deriva o percentual de cada mês. Preserva todos os
-- dados existentes (o valor mensal continua o mesmo; ganha pct e total).
INSERT INTO "budget_account" ("tenant_id","version_id","kind","row_key","dre_category","total")
SELECT "tenant_id","version_id","kind","row_key", MAX("dre_category"), SUM("valor")
FROM "budget_line"
GROUP BY "tenant_id","version_id","kind","row_key";--> statement-breakpoint
UPDATE "budget_line" bl
SET "pct" = CASE WHEN ba."total" <> 0 THEN ROUND(bl."valor" / ba."total" * 100, 4) ELSE 0 END
FROM "budget_account" ba
WHERE ba."version_id" = bl."version_id" AND ba."kind" = bl."kind" AND ba."row_key" = bl."row_key";