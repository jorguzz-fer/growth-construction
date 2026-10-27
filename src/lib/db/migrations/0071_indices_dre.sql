-- 0071 — Índices das consultas da DRE e do Fluxo (desempenho, 27/10/2026).
-- Antes, cada leitura de despesas/pagamentos de uma versão varria a tabela
-- inteira (de todas as empresas) e descartava o resto.
--
-- ADITIVA E REVERSÍVEL: só cria índices. Nenhuma linha é lida, alterada ou
-- removida; os números de nenhuma tela mudam.
CREATE INDEX IF NOT EXISTS "despesa_version_idx" ON "despesa" ("version_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "pagamento_despesa_idx" ON "pagamento" ("despesa_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "conta_receber_project_idx" ON "conta_receber" ("project_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "permuta_version_idx" ON "permuta" ("version_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "reembolso_version_idx" ON "reembolso" ("version_id");
