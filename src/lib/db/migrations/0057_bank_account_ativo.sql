-- 0057 — Contas correntes: inativar em vez de excluir (Prompt X, 3.2 e 5.4).
--
-- ADITIVA E REVERSÍVEL. Uma coluna em "bank_account", padrão true: toda
-- conta existente continua ativa e nenhum saldo muda. Conta inativa fica no
-- cadastro (o histórico continua apontando para um nome, não para nulo) e
-- sai do saldo total.
ALTER TABLE "bank_account" ADD COLUMN IF NOT EXISTS "ativo" boolean NOT NULL DEFAULT true;
