/**
 * Trava de versão (Prompt AP, BAP-2 · opção 2). Módulo PURO.
 *
 * `version.locked` bloqueia lançamentos e edições da versão inteira (despesas,
 * unidades, caixa, planejamento, medição). Só a tela `/versao` escrevia a
 * coluna; ela sai, e a trava muda de lugar: botão na barra de Orçamentos e de
 * Previsão e na lista de versões da tela Projetos. Permissão própria:
 * `versaotrava` (editar).
 */
export const TELA_TRAVA = "versaotrava" as const;

export const ROTULO_KIND: Record<string, string> = {
  atual: "Atual",
  budget: "Orçamento",
  forecast: "Previsão",
  custom: "Cópia",
};

export function textoDaTrava(locked: boolean): { selo: string; botao: string } {
  return locked ? { selo: "travada", botao: "Destravar" } : { selo: "não travada", botao: "Travar" };
}

/** Confirmação: diz o que muda para quem lança, antes de mudar. */
export function confirmacaoDaTrava(rotulo: string, travar: boolean): string {
  return travar
    ? `Travar a versão "${rotulo}"? Enquanto travada, ninguém lança, edita, exclui ou paga nada nela — despesas, unidades, caixa, planejamento e medição recusam com "Versão congelada".`
    : `Destravar a versão "${rotulo}"? Os lançamentos e as edições voltam a ser aceitos nela.`;
}
