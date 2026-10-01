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
  // Prompt AN, Parte 6: a carência saiu (detectava a operação normal); a data
  // impossível virou aviso no cadastro do plano de pagamento da unidade.
  "planos-recebiveis": {
    rotaAntiga: "/diagnostico/planos-recebiveis",
    destino: "/unidades",
    aviso:
      "A Conferência de planos saiu. O dia de vencimento que não existe em algum mês (o 31 em fevereiro) agora é avisado no plano de pagamento da unidade, ao preencher o 1º vencimento.",
  },
} as const;

export type TelaRemovida = keyof typeof TELAS_REMOVIDAS;

/** Aviso para o parâmetro `?de=` do redirecionamento; null se não houver. */
export function avisoDeTelaRemovida(de: string | string[] | undefined | null): string | null {
  const id = Array.isArray(de) ? de[0] : de;
  if (!id || !Object.prototype.hasOwnProperty.call(TELAS_REMOVIDAS, id)) return null;
  return TELAS_REMOVIDAS[id as TelaRemovida].aviso;
}

/** Regras de redirecionamento no formato de `next.config.ts` (307, reversível). */
export function redirecionamentosDeTelasRemovidas() {
  return Object.entries(TELAS_REMOVIDAS).flatMap(([id, t]) => [
    { source: t.rotaAntiga, destination: `${t.destino}?de=${id}`, permanent: false },
    { source: `${t.rotaAntiga}/:path*`, destination: `${t.destino}?de=${id}`, permanent: false },
  ]);
}
