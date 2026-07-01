ALTER TABLE "despesa" ADD COLUMN "num_doc" text;--> statement-breakpoint
ALTER TABLE "version" ADD COLUMN "locked" boolean DEFAULT false NOT NULL;