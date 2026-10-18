/**
 * Telas que saíram do sistema e viraram redirecionamento (Prompt AL, BAL-3).
 * Módulo PURO.
 *
 * Quem tem a URL antiga no favorito cai na tela que assumiu a função, com um
 * aviso de uma linha dizendo o que mudou. O redirecionamento em si mora em
 * `next.config.ts` (antes de qualquer página): a rota antiga não existe mais
 * como página, então não há tela sem id de permissão (AL 1.4).
 */
export const TELAS_REMOVIDAS = {
  contabilidade: {
    rotaAntiga: "/contabilidade",
    destino: "/usuarios",
    aviso:
      "A tela Acesso Contabilidade saiu. Convide o contador aqui, com o papel “contador”; o que ele vê se ajusta em Gestão de Acessos.",
  },
  // Prompt AP: a Configuração da Versão saiu. Cada versão é construída na
  // própria tela; a trava e a planilha da Atual moram na tela Projetos.
  versao: {
    rotaAntiga: "/versao",
    destino: "/projeto",
    aviso:
      "A tela Configuração da Versão saiu. Escolha o projeto aqui: a trava das versões e a planilha da versão Atual (modelo, exportação e importação) ficam no cartão “Versões do projeto”.",
  },
  // Prompt AN, Parte 6: a carência saiu (detectava a operação normal); a data
  // impossível virou aviso no cadastro do plano de pagamento da unidade.
  "planos-recebiveis": {
    rotaAntiga: "/diagnostico/planos-recebiveis",
    destino: "/unidades",
    aviso:
      "A Conferência de planos saiu. O dia de vencimento que não existe em algum mês (o 31 em fevereiro) agora é avisado no plano de pagamento da unidade, ao preencher o 1º vencimento.",
  },
  // Prompt AB2 (Fase 3, BAB-1): o Consolidado saiu. A receita da obra por
  // fonte está na Projeção de Receitas (comparando versões); pergunta livre,
  // na Cris. A Projeção usa `?de=` para data, então o aviso vai em `?saiu=`.
  consolidado: {
    rotaAntiga: "/consolidado",
    destino: "/projecao",
    parametro: "saiu",
    aviso:
      "A tela Consolidado saiu. A receita da obra por fonte está aqui: escolha duas ou três versões para ver os totais por fonte. Para outra pergunta, abra a Cris.",
  },
  // Prompt AB2: o Balanço do Dia saiu; o histórico dos dias fechados mora no
  // Caixa (Prompt L2). O Caixa também usa `?de=` para data.
  balancodia: {
    rotaAntiga: "/balancodia",
    destino: "/caixa",
    parametro: "saiu",
    aviso:
      "A tela Balanço do Dia saiu. Os dias fechados ficam aqui no Caixa, em “Dias fechados”, com o mesmo filtro, impressão e exportação.",
  },
} as const;

export type TelaRemovida = keyof typeof TELAS_REMOVIDAS;

/** Aviso para o parâmetro `?de=` (ou `?saiu=`) do redirecionamento; null se não houver. */
export function avisoDeTelaRemovida(de: string | string[] | undefined | null): string | null {
  const id = Array.isArray(de) ? de[0] : de;
  if (!id || !Object.prototype.hasOwnProperty.call(TELAS_REMOVIDAS, id)) return null;
  return TELAS_REMOVIDAS[id as TelaRemovida].aviso;
}

/** Regras de redirecionamento no formato de `next.config.ts` (307, reversível). */
export function redirecionamentosDeTelasRemovidas() {
  return Object.entries(TELAS_REMOVIDAS).flatMap(([id, t]) => {
    const param = "parametro" in t ? t.parametro : "de";
    return [
      { source: t.rotaAntiga, destination: `${t.destino}?${param}=${id}`, permanent: false },
      { source: `${t.rotaAntiga}/:path*`, destination: `${t.destino}?${param}=${id}`, permanent: false },
    ];
  });
}
