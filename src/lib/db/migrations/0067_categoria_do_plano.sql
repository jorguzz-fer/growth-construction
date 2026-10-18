-- 0067 — Categoria da DRE no Plano de Contas (Prompt DP, Fase 3).
--
-- ADITIVA E REVERSÍVEL. Uma coluna nova, que aceita vazio, em chart_account.
-- Vazia = o padrão de boa prática que o sistema calcula (src/lib/
-- categoria-do-plano.ts); nenhum valor é gravado nas contas existentes e
-- nenhuma despesa é tocada. Quem usa a categoria da conta nas despesas é a
-- chave "despesa_categoria_do_plano", que nasce desligada.
ALTER TABLE "chart_account" ADD COLUMN IF NOT EXISTS "dre_category" "dre_category";
