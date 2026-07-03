import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Imagem Docker mínima para deploy no Coolify (ver docs/STACK.md §4)
  output: "standalone",
  reactStrictMode: true,
  // O `next build` roda lint + type-check em processo. Dentro do container de
  // deploy (memória limitada), o type-check com dependências de tipos grandes
  // (ex.: @anthropic-ai/sdk) estoura a RAM e o processo é morto (exit 255,
  // sem erro de tipo — só o build interrompido). Lint e tipos já são validados
  // no CI/localmente (`npm run typecheck` + `eslint` + `vitest`) antes de todo
  // push, então desligamos essa etapa no build de produção para o container
  // não morrer por OOM. Ver docs/STACK.md §4.
  eslint: { ignoreDuringBuilds: true },
  typescript: { ignoreBuildErrors: true },
  experimental: {
    // Uploads (logo da empresa até 2 MB, documentos de despesas até 10 MB)
    // passam pela Server Action como FormData. O limite padrão do body de
    // Server Actions é 1 MB, o que rejeitava esses arquivos antes mesmo da
    // action rodar — deixando o upload de logo/documento "sem funcionar".
    serverActions: {
      bodySizeLimit: "12mb",
    },
  },
};

export default nextConfig;
