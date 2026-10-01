-- 0062 — Projetos (Prompt B, seção 17): CEP da obra.
--
-- ADITIVA E REVERSÍVEL. Uma coluna anulável em "project"; nenhum valor
-- existente é tocado. O bloco "Localização" da tela de Projetos lista CEP ao
-- lado de endereço, município, UF e coordenadas — a coluna não existia.
ALTER TABLE "project" ADD COLUMN IF NOT EXISTS "cep" text;
