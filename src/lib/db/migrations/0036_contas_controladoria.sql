-- 0036 — Contas contábeis exigidas pelas regras RG-03, RG-04 e RG-07.
--
-- ADITIVA. Apenas INSERT, com ON CONFLICT DO NOTHING. Não altera nem apaga
-- nenhuma conta existente, não renomeia grupo, não reclassifica lançamento
-- algum. Um tenant que já tenha essas contas fica exatamente como está.
--
-- Por que uma migração e não só a constante: `PLANO_CONTAS` só é lida no
-- provisionamento de tenant novo. Os tenants JÁ EXISTENTES não receberiam as
-- contas, e as telas de restituição/repasse/acerto ficariam sem onde classificar.
--
-- As quatro contas entram no grupo "Financeiro / Contábil", que já existe — não
-- se cria plano de contas novo; os planos atuais servem a todos os projetos.
--
--   F.6  juros e multas de mora ....... despesa financeira do período (RG-07)
--   F.7  descontos obtidos ............ receita financeira do período (RG-07)
--   F.8  terceiros a restituir ........ passivo (RG-03)
--   F.9  valores a receber de terceiros ativo   (RG-04)

INSERT INTO chart_account (tenant_id, code, name, group_code, group_name, kind, natureza, ativo)
SELECT t.id, v.code, v.name, 'F', 'Financeiro / Contábil', 'complementar', v.natureza, true
  FROM tenant t
 CROSS JOIN (VALUES
   ('F.6', 'Despesas financeiras — juros e multas de mora', 'despesa'),
   ('F.7', 'Receitas financeiras — descontos obtidos',      'receita'),
   ('F.8', 'Terceiros a restituir (passivo)',               'despesa'),
   ('F.9', 'Valores a receber de terceiros (ativo)',        'receita')
 ) AS v(code, name, natureza)
 ON CONFLICT ON CONSTRAINT chart_account_tenant_code_uq DO NOTHING;
