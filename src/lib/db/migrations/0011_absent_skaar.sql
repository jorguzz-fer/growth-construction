ALTER TYPE "public"."unit_status" ADD VALUE 'Permutado';--> statement-breakpoint
ALTER TABLE "permuta" ADD COLUMN "forma_venda" text;--> statement-breakpoint
ALTER TABLE "permuta" ADD COLUMN "parcelas" integer;--> statement-breakpoint
ALTER TABLE "permuta" ADD COLUMN "periodicidade" text;--> statement-breakpoint
ALTER TABLE "permuta" ADD COLUMN "data_prim_parcela" text;