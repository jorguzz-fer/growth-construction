-- ROLLBACK da 0055 (ver docs/ROLLBACK.md).
--
-- Remove o registro dos pagamentos de fatura e o vínculo com a despesa de
-- juros. As saídas de caixa ("cash_entry"), os "pagamento" por parcela e as
-- despesas de juros FICAM — só perdem o vínculo. Exporte antes:
--   \copy (SELECT * FROM fatura_pagamento) TO 'fatura_pagamento.csv' CSV HEADER

ALTER TABLE "fatura_cartao" DROP COLUMN IF EXISTS "juros_despesa_id";
DROP TABLE IF EXISTS "fatura_pagamento";

-- A linha da 0055 precisa sair do journal do drizzle para que a migração seja
-- reaplicada no próximo boot.
DELETE FROM drizzle.__drizzle_migrations
 WHERE hash IN (
   SELECT hash FROM drizzle.__drizzle_migrations ORDER BY created_at DESC LIMIT 1
 );
