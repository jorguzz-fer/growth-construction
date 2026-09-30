-- 0046 — Código de unidade único por versão (Prompt J, 4.1 / BJ-2).
--
-- ADITIVA E REVERSÍVEL. Só cria um índice; nenhuma linha de "unit" muda.
--
-- Se houver unidades repetidas (mesmo code na mesma version_id), esta migração
-- REPORTA a lista e PARA — nunca apaga nem escolhe qual fica. O diagnóstico
-- (docs/sql/v2-prompt-j-diagnostico.sql, consulta 2) veio vazio em 30/09/2026;
-- rodar de novo antes do deploy. Resolvidas as repetições à mão, basta subir de
-- novo: o índice é criado e a migração fica marcada como aplicada.
DO $$
DECLARE repetidas text;
BEGIN
  SELECT string_agg(version_id::text || ' · "' || code || '" × ' || n, '; ' ORDER BY version_id, code)
    INTO repetidas
    FROM (SELECT version_id, code, count(*) AS n FROM "unit" GROUP BY 1, 2 HAVING count(*) > 1) d;
  IF repetidas IS NOT NULL THEN
    RAISE EXCEPTION '[0046] unidades com o mesmo código na mesma versão — nada foi apagado; resolva à mão e suba de novo: %', repetidas;
  END IF;
  CREATE UNIQUE INDEX IF NOT EXISTS "unit_version_code_uq" ON "unit" ("version_id", "code");
END $$;
