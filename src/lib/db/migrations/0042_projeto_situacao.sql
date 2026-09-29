-- 0042 — Situação do projeto: Ativo / Finalizado (Prompt A, seções 2 e 23–27).
--
-- ADITIVA E REVERSÍVEL. Cria a coluna `project.situacao`, ANULÁVEL e SEM
-- default: nenhuma linha existente é escrita. Projeto ainda não classificado
-- aparece como "—" — classificar uma obra como ativa ou finalizada é ato
-- humano, não suposição do deploy (bloqueio menor da seção 2, recomendação do
-- próprio prompt).
--
-- `project.status` (Planejamento / Em andamento) NÃO é tocado: continua com o
-- mesmo significado e os mesmos valores.
--
-- "Ativo" aqui é classificação cadastral. Não é projeto selecionado, nem
-- contexto, nem filtro automático: nenhuma consulta existente passa a filtrar
-- por ela (seção 29).
ALTER TABLE "project" ADD COLUMN IF NOT EXISTS "situacao" text;--> statement-breakpoint
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'project_situacao_ck'
  ) THEN
    ALTER TABLE "project"
      ADD CONSTRAINT "project_situacao_ck"
      CHECK ("situacao" IS NULL OR "situacao" IN ('Ativo', 'Finalizado'));
  END IF;
END $$;
