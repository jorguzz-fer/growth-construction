-- 0058 — Conciliação com VALOR por vínculo, lado da despesa (Prompt L, Parte 2).
--
-- ADITIVA E REVERSÍVEL. Tabela de ligação N:N com valor, no mesmo formato que
-- "conta_receber_recebimento" (Prompt K) usa do lado do recebível: um
-- movimento do extrato liga-se a várias despesas e uma despesa recebe vários
-- movimentos. As quatro colunas antigas de "cash_entry"
-- (conciliado_despesa_id / conta_receber / por / em) são PRESERVADAS e
-- continuam gravadas; nenhum vínculo existente é convertido (2.8).
-- "pagamento_id" aponta o registro de pagamento que o vínculo gerou (é o que
-- o saldo real da despesa lê, §15); desfazer é estorno lógico.
CREATE TABLE IF NOT EXISTS "conciliacao_despesa" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "tenant_id" uuid NOT NULL REFERENCES "tenant"("id") ON DELETE CASCADE,
  "cash_entry_id" uuid NOT NULL REFERENCES "cash_entry"("id") ON DELETE CASCADE,
  "despesa_id" uuid NOT NULL REFERENCES "despesa"("id") ON DELETE CASCADE,
  "pagamento_id" uuid REFERENCES "pagamento"("id") ON DELETE SET NULL,
  "valor" numeric(15, 2) NOT NULL,
  "origem" text NOT NULL DEFAULT 'manual',
  "criado_por" text,
  "criado_em" timestamp NOT NULL DEFAULT now(),
  "desfeito" boolean NOT NULL DEFAULT false,
  "desfeito_em" text,
  "desfeito_por" text,
  "motivo_desfazer" text
);--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "conc_desp_cash_idx" ON "conciliacao_despesa" ("cash_entry_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "conc_desp_despesa_idx" ON "conciliacao_despesa" ("despesa_id");
