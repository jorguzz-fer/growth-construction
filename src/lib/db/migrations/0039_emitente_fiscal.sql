-- 0039 — Cadastro fiscal do EMITENTE e da obra (preparação da emissão de NF).
--
-- ADITIVA E REVERSÍVEL. Só acrescenta colunas NULÁVEIS em `tenant` e `project`.
-- Nenhum registro é apagado, alterado ou reclassificado: tenants e projetos
-- existentes continuam exatamente como estão, com as colunas novas em branco.
-- Todas as instruções usam IF NOT EXISTS para poderem ser reaplicadas após um
-- rollback (as migrações rodam no boot do contêiner).
--
-- Por quê: até aqui o app só REGISTRAVA nota fiscal recebida de fornecedor
-- (`documento_fiscal`, filha de `despesa`). Para EMITIR é preciso conhecer o
-- prestador — CNPJ, inscrição municipal, regime, item da lista de serviço e
-- endereço com código IBGE. Ver docs/EMISSAO-NF.md.
--
-- O token do provedor de emissão NÃO entra aqui de propósito: credencial vai em
-- variável de ambiente, não em coluna lida por toda query de tenant.

-- ── Identificação fiscal do emitente ─────────────────────────────────────
ALTER TABLE "tenant" ADD COLUMN IF NOT EXISTS "nome_fantasia" text;--> statement-breakpoint
ALTER TABLE "tenant" ADD COLUMN IF NOT EXISTS "cnpj" text;--> statement-breakpoint
ALTER TABLE "tenant" ADD COLUMN IF NOT EXISTS "inscricao_municipal" text;--> statement-breakpoint
ALTER TABLE "tenant" ADD COLUMN IF NOT EXISTS "inscricao_estadual" text;--> statement-breakpoint
ALTER TABLE "tenant" ADD COLUMN IF NOT EXISTS "regime_tributario" text;--> statement-breakpoint
ALTER TABLE "tenant" ADD COLUMN IF NOT EXISTS "regime_especial" text;--> statement-breakpoint
ALTER TABLE "tenant" ADD COLUMN IF NOT EXISTS "item_lista_servico" text;--> statement-breakpoint
ALTER TABLE "tenant" ADD COLUMN IF NOT EXISTS "codigo_tributario_municipio" text;--> statement-breakpoint
ALTER TABLE "tenant" ADD COLUMN IF NOT EXISTS "cnae" text;--> statement-breakpoint
ALTER TABLE "tenant" ADD COLUMN IF NOT EXISTS "aliquota_iss" numeric(8, 4);--> statement-breakpoint

-- ── Endereço do prestador ────────────────────────────────────────────────
ALTER TABLE "tenant" ADD COLUMN IF NOT EXISTS "logradouro" text;--> statement-breakpoint
ALTER TABLE "tenant" ADD COLUMN IF NOT EXISTS "numero_endereco" text;--> statement-breakpoint
ALTER TABLE "tenant" ADD COLUMN IF NOT EXISTS "complemento" text;--> statement-breakpoint
ALTER TABLE "tenant" ADD COLUMN IF NOT EXISTS "bairro" text;--> statement-breakpoint
ALTER TABLE "tenant" ADD COLUMN IF NOT EXISTS "codigo_municipio" text;--> statement-breakpoint
ALTER TABLE "tenant" ADD COLUMN IF NOT EXISTS "municipio" text;--> statement-breakpoint
ALTER TABLE "tenant" ADD COLUMN IF NOT EXISTS "uf" text;--> statement-breakpoint
ALTER TABLE "tenant" ADD COLUMN IF NOT EXISTS "cep" text;--> statement-breakpoint
ALTER TABLE "tenant" ADD COLUMN IF NOT EXISTS "telefone" text;--> statement-breakpoint
ALTER TABLE "tenant" ADD COLUMN IF NOT EXISTS "email_fiscal" text;--> statement-breakpoint

-- Ambiente de emissão. Nasce em "homologacao" para TODO tenant existente: nota
-- de teste não tem validade fiscal, e o padrão inverso emitiria nota real por
-- acidente na primeira tentativa de integração.
ALTER TABLE "tenant"
  ADD COLUMN IF NOT EXISTS "fiscal_ambiente" text NOT NULL DEFAULT 'homologacao';--> statement-breakpoint

-- ── Dados fiscais da obra ────────────────────────────────────────────────
-- Na construção civil o ISS é devido no município da obra (LC 116/2003, art.
-- 3º, III), que nem sempre é o da sede — por isso o município de incidência
-- fica no projeto.
ALTER TABLE "project" ADD COLUMN IF NOT EXISTS "codigo_municipio_obra" text;--> statement-breakpoint
ALTER TABLE "project" ADD COLUMN IF NOT EXISTS "municipio_obra" text;--> statement-breakpoint
ALTER TABLE "project" ADD COLUMN IF NOT EXISTS "uf_obra" text;--> statement-breakpoint
ALTER TABLE "project" ADD COLUMN IF NOT EXISTS "codigo_obra" text;--> statement-breakpoint
ALTER TABLE "project" ADD COLUMN IF NOT EXISTS "art" text;
