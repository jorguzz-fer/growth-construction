ALTER TABLE "membership" ADD COLUMN "permissions" jsonb;--> statement-breakpoint
ALTER TABLE "tenant" ADD COLUMN "logo_key" text;--> statement-breakpoint
ALTER TABLE "user" ADD COLUMN "password_hash" text;--> statement-breakpoint
ALTER TABLE "user" ADD COLUMN "mfa_secret" text;--> statement-breakpoint
ALTER TABLE "user" ADD COLUMN "mfa_enabled" boolean DEFAULT false NOT NULL;