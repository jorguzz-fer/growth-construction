-- 0039 — Baixa (confirmação de recebimento) na tela de Contas a Receber.
--
-- ADITIVA, REVERSÍVEL E SEM ESCRITA DE DADOS. Não cria coluna, não altera
-- registro, não reclassifica nada: acrescenta apenas DOIS ÍNDICES de leitura.
-- Toda a funcionalidade se apoia em colunas que já existiam desde a 0030
-- (`cash_entry.conciliado_conta_receber_id`) — nenhum lançamento, valor,
-- status ou saldo histórico é tocado.
--
-- Por quê: a tela de Contas a Receber passou a mostrar, por conta, os
-- movimentos de caixa que a baixaram. Sem índice, isso vira um seq scan em
-- `cash_entry` a cada abertura da tela — a tabela cresce a cada extrato
-- importado.

-- Movimentos de caixa vinculados a uma conta a receber (só as linhas
-- conciliadas entram no índice — o extrato ainda não conciliado fica de fora).
CREATE INDEX IF NOT EXISTS "cash_entry_conta_receber_idx"
  ON "cash_entry" ("tenant_id", "conciliado_conta_receber_id")
  WHERE "conciliado_conta_receber_id" IS NOT NULL;--> statement-breakpoint

-- Listagem da própria tela: contas não canceladas do tenant, por vencimento.
CREATE INDEX IF NOT EXISTS "conta_receber_tenant_venc_idx"
  ON "conta_receber" ("tenant_id", "vencimento")
  WHERE "cancelado" = false;
