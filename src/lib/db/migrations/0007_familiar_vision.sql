ALTER TABLE "bank_account" ADD COLUMN "saldo" numeric(15, 2) DEFAULT '0' NOT NULL;--> statement-breakpoint
ALTER TABLE "bank_account" ADD COLUMN "saldo_source" text DEFAULT 'manual' NOT NULL;