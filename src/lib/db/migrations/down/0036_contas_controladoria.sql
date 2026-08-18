-- ROLLBACK da 0036 (ver docs/ROLLBACK.md).
--
-- ATENÇÃO — este é o único rollback do pacote que apaga LINHAS, e por isso ele
-- é deliberadamente conservador: só remove as quatro contas que a 0036 criou,
-- e SOMENTE quando nenhum lançamento as utiliza. Uma conta já usada por alguma
-- despesa permanece, porque removê-la deixaria o lançamento órfão de
-- classificação.
--
-- Nenhuma despesa, parcela, restituição ou documento é tocado.
--
-- Se alguma conta não puder ser removida por estar em uso, isso é o resultado
-- esperado, não uma falha: confira com
--   SELECT code, name FROM chart_account WHERE code IN ('F.6','F.7','F.8','F.9');

DELETE FROM chart_account ca
 WHERE ca.code IN ('F.6', 'F.7', 'F.8', 'F.9')
   AND ca.group_code = 'F'
   AND NOT EXISTS (
     SELECT 1 FROM despesa d
      WHERE d.conta_cef = ca.code
        AND d.tenant_id = ca.tenant_id
   )
   AND NOT EXISTS (
     SELECT 1 FROM budget_line bl
      WHERE bl.row_key = ca.code
        AND bl.tenant_id = ca.tenant_id
   );

-- A linha da 0036 precisa sair do journal do drizzle para que a migração seja
-- reaplicada no próximo boot.
DELETE FROM drizzle.__drizzle_migrations
 WHERE hash IN (
   SELECT hash FROM drizzle.__drizzle_migrations ORDER BY created_at DESC LIMIT 1
 );
