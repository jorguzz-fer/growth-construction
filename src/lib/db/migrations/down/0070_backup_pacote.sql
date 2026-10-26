-- ROLLBACK da 0070 (ver docs/ROLLBACK.md).
--
-- A tabela só registra os pacotes gerados. Os ZIPs ficam no R2 em
-- backups/<tenant>/<id>/ e NÃO são apagados por este rollback.

DROP TABLE IF EXISTS "backup_pacote";

-- A linha da 0070 precisa sair do journal do drizzle para que a migração seja
-- reaplicada no próximo boot.
DELETE FROM drizzle.__drizzle_migrations
 WHERE hash IN (
   SELECT hash FROM drizzle.__drizzle_migrations ORDER BY created_at DESC LIMIT 1
 );
