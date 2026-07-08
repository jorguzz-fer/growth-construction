CREATE TABLE "budget_line" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"version_id" uuid NOT NULL,
	"kind" text NOT NULL,
	"row_key" text NOT NULL,
	"dre_category" text,
	"mes" text NOT NULL,
	"valor" numeric(15, 2) DEFAULT '0' NOT NULL,
	CONSTRAINT "budget_line_uq" UNIQUE("version_id","kind","row_key","mes")
);
--> statement-breakpoint
ALTER TABLE "budget_line" ADD CONSTRAINT "budget_line_tenant_id_tenant_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenant"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "budget_line" ADD CONSTRAINT "budget_line_version_id_version_id_fk" FOREIGN KEY ("version_id") REFERENCES "public"."version"("id") ON DELETE cascade ON UPDATE no action;