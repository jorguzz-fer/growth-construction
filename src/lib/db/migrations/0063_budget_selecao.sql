-- 0063 — Orçamentos (Prompt D, BD-6): seleção de linhas da grade por versão e bloco.
--
-- ADITIVA E REVERSÍVEL. Tabela nova; nenhuma linha de budget_account ou
-- budget_line é tocada. Sem registro para (versão, bloco) a grade continua
-- mostrando os grupos padrão do Plano de Contas, exatamente como hoje —
-- ausência de seleção significa "padrão", nunca "nenhuma linha".
CREATE TABLE IF NOT EXISTS "budget_selecao" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "tenant_id" uuid NOT NULL REFERENCES "tenant"("id") ON DELETE CASCADE,
  "version_id" uuid NOT NULL REFERENCES "version"("id") ON DELETE CASCADE,
  "kind" text NOT NULL,
  "row_key" text NOT NULL,
  "ordem" integer NOT NULL DEFAULT 0,
  "created_at" timestamp DEFAULT now() NOT NULL,
  CONSTRAINT "budget_selecao_uq" UNIQUE ("version_id", "kind", "row_key")
);--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "budget_selecao_version_idx" ON "budget_selecao" ("version_id", "kind");
