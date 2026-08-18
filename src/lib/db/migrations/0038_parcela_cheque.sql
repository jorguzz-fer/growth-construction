-- 0038 — Cheque POR PARCELA (item 2.5 do pacote de Controladoria).
--
-- ADITIVA E REVERSÍVEL. Só acrescenta quatro colunas NULÁVEIS em
-- `despesa_parcela`. Não apaga, não altera e não reclassifica nenhum registro:
-- as parcelas existentes continuam exatamente como estão, com as colunas novas
-- em branco. Todas as instruções usam IF NOT EXISTS para poderem ser
-- reaplicadas após um rollback (as migrações rodam no boot do contêiner).
--
-- Por quê: os dados do cheque viviam no CABEÇALHO da despesa — um cheque para a
-- compra inteira. Talão real tem numeração salteada e cada parcela costuma ser
-- um cheque diferente, com emitente e "bom para" próprios.

ALTER TABLE "despesa_parcela" ADD COLUMN IF NOT EXISTS "numero_cheque" text;--> statement-breakpoint
ALTER TABLE "despesa_parcela" ADD COLUMN IF NOT EXISTS "emitente_cheque" text;--> statement-breakpoint
ALTER TABLE "despesa_parcela" ADD COLUMN IF NOT EXISTS "data_emissao_cheque" text;--> statement-breakpoint
ALTER TABLE "despesa_parcela" ADD COLUMN IF NOT EXISTS "data_bom_para" text;--> statement-breakpoint

-- Conferência de cheque repetido na mesma conta (item 2.5). É ÍNDICE de busca,
-- não constraint: talões de contas distintas podem repetir numeração, então a
-- duplicidade gera alerta na tela, nunca bloqueio.
CREATE INDEX IF NOT EXISTS "despesa_parcela_cheque_idx"
  ON "despesa_parcela" ("tenant_id", "bank_account_id", "numero_cheque")
  WHERE "numero_cheque" IS NOT NULL;
