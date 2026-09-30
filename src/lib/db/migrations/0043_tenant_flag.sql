-- 0043 — Chave de mudança por empresa (V2-BLOQUEIOS B4; regra 3.3 do pacote V2).
--
-- ADITIVA E REVERSÍVEL. Cria a tabela `tenant_flag`, vazia: nenhuma linha
-- existente é escrita e nenhuma chave nasce ligada. Sem linha para a empresa,
-- a chave está DESLIGADA e o sistema se comporta exatamente como antes.
CREATE TABLE IF NOT EXISTS "tenant_flag" (
  "tenant_id" uuid NOT NULL REFERENCES "tenant"("id") ON DELETE CASCADE,
  "chave" text NOT NULL,
  "ligada" boolean NOT NULL DEFAULT false,
  "alterada_por" text,
  "alterada_em" timestamp NOT NULL DEFAULT now(),
  CONSTRAINT "tenant_flag_tenant_id_chave_pk" PRIMARY KEY ("tenant_id", "chave")
);
