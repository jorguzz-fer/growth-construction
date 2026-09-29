-- ROLLBACK da 0041 (ver docs/ROLLBACK.md).
--
-- Remove APENAS as duas colunas de controle de senha. Senhas, usuários e
-- vínculos não são tocados: some só a marca de "senha provisória" e o instante
-- da última troca (sessões voltam a valer até expirar, como antes).

ALTER TABLE "user" DROP COLUMN IF EXISTS "password_changed_at";
ALTER TABLE "user" DROP COLUMN IF EXISTS "must_change_password";

-- A linha da 0041 precisa sair do journal do drizzle para que a migração seja
-- reaplicada no próximo boot.
DELETE FROM drizzle.__drizzle_migrations
 WHERE hash IN (
   SELECT hash FROM drizzle.__drizzle_migrations ORDER BY created_at DESC LIMIT 1
 );
