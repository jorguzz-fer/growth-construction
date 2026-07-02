import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Imagem Docker mínima para deploy no Coolify (ver docs/STACK.md §4)
  output: "standalone",
  reactStrictMode: true,
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
