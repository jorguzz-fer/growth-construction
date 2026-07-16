ALTER TABLE "project" ADD COLUMN "custo_construcao" numeric(15, 2);--> statement-breakpoint
ALTER TABLE "project" ADD COLUMN "custo_terreno" numeric(15, 2);--> statement-breakpoint
ALTER TABLE "project" ADD COLUMN "valor_construcao" numeric(15, 2);--> statement-breakpoint
ALTER TABLE "project" ADD COLUMN "valor_terreno" numeric(15, 2);--> statement-breakpoint
ALTER TABLE "project" ADD COLUMN "forma_pagamento_terreno" text;--> statement-breakpoint
ALTER TABLE "project" ADD COLUMN "proprietario_terreno" text;--> statement-breakpoint
ALTER TABLE "project" ADD COLUMN "terreno_fora_caixa" boolean DEFAULT true NOT NULL;