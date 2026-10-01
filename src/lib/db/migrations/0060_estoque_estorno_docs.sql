-- 0060 — Estoque (Prompt Y): item inativável, estorno por lançamento inverso e
-- documentos do movimento.
--
-- ADITIVA E REVERSÍVEL. A tela tem zero registros em produção; as tabelas
-- referenciadas (despesa, permuta, project, document) não são tocadas.
--  - "stock_item.ativo": item com movimento não é apagado — é inativado (5.2).
--  - "stock_movement.estorno_de_id": o estorno é um lançamento inverso que
--    aponta o original; o original fica (2.6).
--  - "document.stock_movement_id": nota, romaneio, foto e requisição do
--    movimento (4-A.2), ON DELETE SET NULL.
ALTER TABLE "stock_item" ADD COLUMN IF NOT EXISTS "ativo" boolean NOT NULL DEFAULT true;--> statement-breakpoint
ALTER TABLE "stock_movement" ADD COLUMN IF NOT EXISTS "estorno_de_id" uuid REFERENCES "stock_movement"("id") ON DELETE SET NULL;--> statement-breakpoint
ALTER TABLE "document" ADD COLUMN IF NOT EXISTS "stock_movement_id" uuid REFERENCES "stock_movement"("id") ON DELETE SET NULL;--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "stock_movement_estorno_idx" ON "stock_movement" ("estorno_de_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "document_stock_movement_idx" ON "document" ("stock_movement_id");
