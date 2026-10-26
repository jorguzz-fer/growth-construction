-- 0070 — Pacote completo de backup (Prompt AO, Parte 4.3). A geração passa a
-- ser em segundo plano: esta tabela guarda o pedido, o progresso e onde o ZIP
-- ficou no R2. É o "registro de que um pacote foi gerado" (10.2) — nenhuma
-- tabela de negócio é tocada.
--
-- ADITIVA E REVERSÍVEL. Uma tabela nova.
CREATE TABLE IF NOT EXISTS "backup_pacote" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "tenant_id" uuid NOT NULL REFERENCES "tenant"("id") ON DELETE CASCADE,
  "semestre" text NOT NULL,
  "status" text DEFAULT 'gerando' NOT NULL,
  "etapa" text,
  "feitas" integer DEFAULT 0 NOT NULL,
  "total" integer DEFAULT 0 NOT NULL,
  "storage_key" text,
  "arquivo" text,
  "bytes" bigint,
  "resumo" jsonb,
  "erro" text,
  "created_by" text REFERENCES "user"("id") ON DELETE SET NULL,
  "created_at" timestamp DEFAULT now() NOT NULL,
  "atualizado_em" timestamp DEFAULT now() NOT NULL,
  "concluido_em" timestamp
);--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "backup_pacote_tenant_idx" ON "backup_pacote" ("tenant_id", "created_at");
