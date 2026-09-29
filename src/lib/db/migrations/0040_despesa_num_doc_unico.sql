-- 0040 — Número de despesa (PED) único por empresa (Prompt AF, Parte 1).
--
-- ADITIVA E REVERSÍVEL. Cria só um índice; nenhum `num_doc` é lido para ser
-- alterado, renumerado ou normalizado — número emitido é documento emitido.
--
-- O índice é (tenant_id, num_doc): a numeração é por empresa, então o mesmo
-- texto em duas empresas continua permitido. É PARCIAL — despesa sem número
-- (nulo ou vazio) é situação legítima, e um índice cheio bloquearia a segunda.
--
-- GUARDA DE BOOT. As migrações rodam na subida do contêiner: se o índice fosse
-- criado sobre uma duplicata, o CREATE falharia e o app não subiria. Em
-- 29/09/2026 o diagnóstico de produção (docs/V2-BLOCO0-BLOQUEIOS.md §5.2)
-- mostrou ZERO duplicatas, então o índice é criado. Se, até o deploy, alguma
-- duplicata tiver surgido, o bloco abaixo NÃO cria o índice e só avisa (a
-- decisão sobre a duplicata é humana, item a item — nunca por script). A trava
-- da tela de Numeração (Parte 2) segue impedindo duplicatas novas, e o índice
-- entra numa migração seguinte com esta mesma guarda.
DO $$
BEGIN
  IF EXISTS (
    SELECT 1
      FROM despesa
     WHERE num_doc IS NOT NULL AND num_doc <> ''
     GROUP BY tenant_id, num_doc
    HAVING count(*) > 1
  ) THEN
    RAISE WARNING 'despesa_tenant_num_doc_uq NÃO criado: há num_doc repetido na mesma empresa. Rode docs/sql/v2-bloco0-diagnostico.sql (BAF-1) e decida item a item.';
  ELSE
    CREATE UNIQUE INDEX IF NOT EXISTS "despesa_tenant_num_doc_uq"
      ON "despesa" ("tenant_id", "num_doc")
      WHERE "num_doc" IS NOT NULL AND "num_doc" <> '';
  END IF;
END $$;
