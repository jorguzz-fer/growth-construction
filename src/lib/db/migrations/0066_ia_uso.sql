-- 0066 — Consumo da IA (Prompt AM, Parte 5).
--
-- ADITIVA E REVERSÍVEL. Uma tabela nova; nenhuma tabela existente é tocada.
-- Cada chamada ao modelo grava QUANTO custou (tokens, modelo, quem, quando),
-- nunca O QUÊ: não há coluna para pergunta, documento ou resposta (decisão de
-- 01/10/2026: "o conteúdo do prompt nunca entra em log nem em auditoria").
CREATE TABLE IF NOT EXISTS "ia_uso" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "tenant_id" uuid NOT NULL REFERENCES "tenant"("id") ON DELETE CASCADE,
  "user_id" text REFERENCES "user"("id") ON DELETE SET NULL,
  "operacao" text NOT NULL,
  "modelo" text,
  "fallback" boolean DEFAULT false NOT NULL,
  "entrada" integer DEFAULT 0 NOT NULL,
  "saida" integer DEFAULT 0 NOT NULL,
  "cache_criacao" integer DEFAULT 0 NOT NULL,
  "cache_lida" integer DEFAULT 0 NOT NULL,
  "erro" boolean DEFAULT false NOT NULL,
  "created_at" timestamp DEFAULT now() NOT NULL
);--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "ia_uso_tenant_quando_idx" ON "ia_uso" ("tenant_id", "created_at");
