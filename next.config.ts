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
  // `unpdf` (leitura de texto de PDF do extrato) carrega o pdf.js por import
  // dinâmico aninhado. Com `output: "standalone"`, o tracer do Next às vezes não
  // copia esses arquivos para o bundle, e a leitura do PDF falha em produção
  // (Coolify) mesmo funcionando em dev. Marcá-lo como externo faz o Next
  // resolvê-lo de node_modules em runtime (nft copia o pacote inteiro).
  serverExternalPackages: ["unpdf"],
  // Rolling Forecast foi descontinuado: URLs antigas /rolling redirecionam
  // para /forecast (o enforcement de permissão da rota-destino continua valendo).
  async redirects() {
    return [
      { source: "/rolling", destination: "/forecast", permanent: true },
      // Prompt AL (BAL-3): telas removidas viram redirecionamento com aviso de
      // uma linha na tela de destino (src/lib/telas-removidas.ts; o teste de
      // lá confere que esta lista bate). 307, não 308: o navegador não grava.
      { source: "/contabilidade", destination: "/usuarios?de=contabilidade", permanent: false },
      { source: "/contabilidade/:path*", destination: "/usuarios?de=contabilidade", permanent: false },
      { source: "/diagnostico/planos-recebiveis", destination: "/unidades?de=planos-recebiveis", permanent: false },
      { source: "/diagnostico/planos-recebiveis/:path*", destination: "/unidades?de=planos-recebiveis", permanent: false },
      // Prompt AN, Parte 5: a Conferência mudou de endereço para ter id próprio
      // em SCREENS. Filtros na URL antiga seguem junto (query preservada).
      { source: "/diagnostico/categorias-invertidas", destination: "/conferencia", permanent: false },
    ];
  },
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
