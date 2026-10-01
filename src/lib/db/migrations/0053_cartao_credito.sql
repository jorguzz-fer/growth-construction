-- 0053 — Cartões de crédito: cadastro (Prompt U, seção 1).
--
-- ADITIVA E REVERSÍVEL. Tabela nova; nenhuma linha de despesa, parcela,
-- pagamento ou caixa muda. "bank_account" não serve: não tem bandeira, ciclo,
-- limite nem a conta que debita a fatura. Guarda APENAS os quatro últimos
-- dígitos ("ultimos4"); não existe coluna para o número completo.
-- "taxa_rotativo" é opcional (BU-3): sem taxa, a tela não projeta juro.
CREATE TABLE IF NOT EXISTS "cartao_credito" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "tenant_id" uuid NOT NULL REFERENCES "tenant"("id") ON DELETE CASCADE,
  "apelido" text NOT NULL,
  "bandeira" text,
  "ultimos4" text,
  "titular" text,
  "limite" numeric(15, 2),
  "dia_fechamento" integer NOT NULL,
  "dia_vencimento" integer NOT NULL,
  "bank_account_id" uuid REFERENCES "bank_account"("id") ON DELETE SET NULL,
  "taxa_rotativo" numeric(8, 4),
  "ativo" boolean NOT NULL DEFAULT true,
  "created_at" timestamp NOT NULL DEFAULT now()
);--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "cartao_credito_tenant_idx" ON "cartao_credito" ("tenant_id");
