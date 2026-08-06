-- 0034 — Despesa paga por terceiro: idempotência (§16) e conciliação da
-- restituição com o extrato (§14).
--
-- ADITIVA E REVERSÍVEL. Só cria colunas NULÁVEIS e índices. Não apaga, não
-- reclassifica, não altera valor, competência, vencimento, status ou número PED
-- de nenhum registro existente. Todas as instruções usam IF NOT EXISTS para
-- poderem ser reaplicadas após um rollback (ver migrations/down/0034_*.sql).

ALTER TABLE "despesa_terceiro" ADD COLUMN IF NOT EXISTS "idempotency_key" text;--> statement-breakpoint
ALTER TABLE "restituicao" ADD COLUMN IF NOT EXISTS "cash_entry_id" uuid;--> statement-breakpoint
ALTER TABLE "restituicao" ADD COLUMN IF NOT EXISTS "idempotency_key" text;--> statement-breakpoint

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'restituicao_cash_entry_id_cash_entry_id_fk'
  ) THEN
    ALTER TABLE "restituicao"
      ADD CONSTRAINT "restituicao_cash_entry_id_cash_entry_id_fk"
      FOREIGN KEY ("cash_entry_id") REFERENCES "public"."cash_entry"("id")
      ON DELETE set null ON UPDATE no action;
  END IF;
END $$;--> statement-breakpoint

-- Idempotência: o MESMO fato reenviado (duplo clique, refresh, resubmit) colide
-- aqui em vez de gerar um segundo registro. Índices PARCIAIS: registros
-- anteriores têm a chave nula e não são afetados nem exigidos.
CREATE UNIQUE INDEX IF NOT EXISTS "despesa_terceiro_idem_uq"
  ON "despesa_terceiro" ("tenant_id", "idempotency_key")
  WHERE "idempotency_key" IS NOT NULL;--> statement-breakpoint

CREATE UNIQUE INDEX IF NOT EXISTS "restituicao_idem_uq"
  ON "restituicao" ("tenant_id", "idempotency_key")
  WHERE "idempotency_key" IS NOT NULL;--> statement-breakpoint

-- Uma despesa não pode ter DUAS obrigações ativas (§16: "duas obrigações para o
-- mesmo fato"). O índice só é criado se os dados atuais já o satisfizerem —
-- duplicatas históricas NÃO são apagadas nem alteradas; se existirem, a trava
-- fica apenas na camada de aplicação e o caso é registrado para conferência
-- manual. Isso evita que a migration falhe no boot do contêiner.
DO $$
DECLARE dup_count integer;
BEGIN
  IF EXISTS (SELECT 1 FROM pg_class WHERE relname = 'despesa_terceiro_despesa_ativa_uq') THEN
    RETURN;
  END IF;
  SELECT count(*) INTO dup_count FROM (
    SELECT despesa_id FROM despesa_terceiro
    WHERE status <> 'Cancelado'
    GROUP BY despesa_id HAVING count(*) > 1
  ) d;
  IF dup_count = 0 THEN
    CREATE UNIQUE INDEX "despesa_terceiro_despesa_ativa_uq"
      ON "despesa_terceiro" ("despesa_id")
      WHERE status <> 'Cancelado';
  ELSE
    RAISE NOTICE 'despesa_terceiro: % despesa(s) com mais de uma obrigacao ativa. Indice unico NAO criado; nenhum registro foi alterado. Conferir manualmente.', dup_count;
  END IF;
END $$;
