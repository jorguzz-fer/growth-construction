-- 0041 — Senha provisória e encerramento de sessão (Prompt AI, Parte 1).
--
-- ADITIVA E REVERSÍVEL. Só acrescenta duas colunas em "user":
--  - must_change_password: a senha foi definida por OUTRA pessoa (convite com
--    senha inicial ou redefinição pelo admin) e o dono precisa trocá-la antes
--    de usar o sistema. Default false: ninguém que já existe é afetado.
--  - password_changed_at: instante da última troca/redefinição. Sessões
--    abertas ANTES desse instante deixam de valer. Nula para todos hoje:
--    nenhuma sessão existente é derrubada pelo deploy.
-- Nenhum registro é alterado.
ALTER TABLE "user" ADD COLUMN IF NOT EXISTS "must_change_password" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "user" ADD COLUMN IF NOT EXISTS "password_changed_at" timestamp;
