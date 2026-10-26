-- 0069 — Emissor de NFS-e (Prompt AG, seção 1). Nota de SERVIÇO emitida pela
-- empresa — não confundir com `documento_fiscal`, que é nota RECEBIDA.
--
-- ADITIVA E REVERSÍVEL. Duas tabelas novas; nenhuma tabela existente é tocada.
-- Decisões de 26/10/2026: estreia com serviço avulso, que pode APONTAR para a
-- conta a receber já lançada (BAG-1, opção b); a nota NÃO
-- cria receita, conta a receber nem lançamento (BAG-2); um CNPJ só (BAG-3);
-- nota de homologação fica marcada e fora de relatório (BAG-4).
CREATE TABLE IF NOT EXISTS "nota_servico" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "tenant_id" uuid NOT NULL REFERENCES "tenant"("id") ON DELETE CASCADE,
  "project_id" uuid NOT NULL REFERENCES "project"("id"),
  "version_id" uuid NOT NULL REFERENCES "version"("id"),
  "status" text DEFAULT 'rascunho' NOT NULL,
  "ambiente" text DEFAULT 'homologacao' NOT NULL,
  "tentativa" integer DEFAULT 0 NOT NULL,
  "ref" text,
  "numero" text,
  "numero_rps" text,
  "serie_rps" text,
  "codigo_verificacao" text,
  "mensagem_retorno" text,
  "url_danfse" text,
  "url_espelho" text,
  "caminho_xml" text,
  "pdf_key" text,
  "xml_key" text,
  "competencia" text,
  "discriminacao" text DEFAULT '' NOT NULL,
  "item_lista_servico" text,
  "codigo_tributario_municipio" text,
  "codigo_municipio_prestacao" text,
  "valor_servicos" numeric(15, 2) DEFAULT 0 NOT NULL,
  "valor_deducoes" numeric(15, 2) DEFAULT 0 NOT NULL,
  "desconto_incondicionado" numeric(15, 2) DEFAULT 0 NOT NULL,
  "desconto_condicionado" numeric(15, 2) DEFAULT 0 NOT NULL,
  "aliquota_iss" numeric(8, 4) DEFAULT 0 NOT NULL,
  "iss_retido" boolean DEFAULT false NOT NULL,
  "retencoes" jsonb,
  "outras_retencoes" numeric(15, 2) DEFAULT 0 NOT NULL,
  "base_calculo" numeric(15, 2),
  "valor_iss" numeric(15, 2),
  "total_retencoes" numeric(15, 2),
  "valor_liquido" numeric(15, 2),
  "tomador_cpf_cnpj" text,
  "tomador_nome" text,
  "tomador_inscricao_municipal" text,
  "tomador_email" text,
  "tomador_telefone" text,
  "tomador_logradouro" text,
  "tomador_numero" text,
  "tomador_complemento" text,
  "tomador_bairro" text,
  "tomador_codigo_municipio" text,
  "tomador_uf" text,
  "tomador_cep" text,
  "origem_tipo" text DEFAULT 'avulso' NOT NULL,
  "conta_receber_id" uuid REFERENCES "conta_receber"("id") ON DELETE SET NULL,
  "created_by" text REFERENCES "user"("id") ON DELETE SET NULL,
  "created_at" timestamp DEFAULT now() NOT NULL,
  "enviada_em" timestamp,
  "autorizada_em" timestamp,
  "cancelada_em" timestamp,
  "cancelada_por" text REFERENCES "user"("id") ON DELETE SET NULL,
  "motivo_cancelamento" text
);--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "nota_servico_tenant_ref_uq" ON "nota_servico" ("tenant_id", "ref");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "nota_servico_tenant_idx" ON "nota_servico" ("tenant_id", "created_at");--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "nota_servico_evento" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "tenant_id" uuid NOT NULL REFERENCES "tenant"("id") ON DELETE CASCADE,
  "nota_id" uuid NOT NULL REFERENCES "nota_servico"("id") ON DELETE CASCADE,
  "tipo" text NOT NULL,
  "ref" text,
  "status" text,
  "mensagem" text,
  "bruto" jsonb,
  "created_by" text REFERENCES "user"("id") ON DELETE SET NULL,
  "created_at" timestamp DEFAULT now() NOT NULL
);--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "nota_servico_evento_nota_idx" ON "nota_servico_evento" ("nota_id", "created_at");
