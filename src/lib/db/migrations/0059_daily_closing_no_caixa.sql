-- 0059 — Fechar o dia passa a ser ação no cartão do Caixa (Prompt L, Parte 9).
--
-- ADITIVA E REVERSÍVEL. Nenhuma linha é alterada ou apagada.
--  - "saldo_em_conta": o saldo do extrato ao fim do dia, gravado junto com o
--    conciliado ("saldo_final") — a divergência (9.4) é a diferença dos dois,
--    calculada no servidor, nunca digitada.
--  - "ajustes": os ajustes do dia (Parte 4), para a identidade
--    inicial + entradas − saídas + ajustes = final continuar fechando.
--  - "naturezas": a divergência classificada nas quatro naturezas (1.3).
--  - "reaberto_em" / "reaberto_por" / "motivo_reabertura": reabrir é operação
--    própria (9.5), com auditoria; a linha fica, marcada.
--  - Índice ÚNICO parcial em (tenant_id, dia) para fechamentos ativos (9.5).
--    Só é criado se NÃO houver dia com mais de um fechamento ativo; havendo,
--    a migração avisa e segue — nenhuma linha é apagada, a decisão é humana.
ALTER TABLE "daily_closing" ADD COLUMN IF NOT EXISTS "saldo_em_conta" numeric(15, 2);--> statement-breakpoint
ALTER TABLE "daily_closing" ADD COLUMN IF NOT EXISTS "ajustes" numeric(15, 2) NOT NULL DEFAULT 0;--> statement-breakpoint
ALTER TABLE "daily_closing" ADD COLUMN IF NOT EXISTS "naturezas" jsonb;--> statement-breakpoint
ALTER TABLE "daily_closing" ADD COLUMN IF NOT EXISTS "reaberto_em" timestamp;--> statement-breakpoint
ALTER TABLE "daily_closing" ADD COLUMN IF NOT EXISTS "reaberto_por" text;--> statement-breakpoint
ALTER TABLE "daily_closing" ADD COLUMN IF NOT EXISTS "motivo_reabertura" text;--> statement-breakpoint
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM "daily_closing"
    WHERE "reaberto_em" IS NULL
    GROUP BY "tenant_id", "dia"
    HAVING count(*) > 1
  ) THEN
    RAISE NOTICE '0059: daily_closing tem dia com mais de um fechamento ativo; o índice único NÃO foi criado (Prompt L, 9.5). Decisão humana.';
  ELSE
    CREATE UNIQUE INDEX IF NOT EXISTS "daily_closing_tenant_dia_aberto_uq"
      ON "daily_closing" ("tenant_id", "dia")
      WHERE "reaberto_em" IS NULL;
  END IF;
END $$;
