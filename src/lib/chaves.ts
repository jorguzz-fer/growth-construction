/**
 * Catálogo das chaves de mudança por empresa (V2-BLOQUEIOS B4; regra 3.3 do
 * pacote V2). Puro, sem banco.
 *
 * Regra: mudança que altera número de relatório ou acesso em produção entra
 * atrás de uma chave DESLIGADA. Com ela desligada, o sistema devolve
 * exatamente o de hoje. Liga-se por empresa, depois de ver a prévia.
 *
 * Toda chave nova entra AQUI, com o que ela muda e onde está a prévia. Chave
 * gravada no banco que não está no catálogo é ignorada (vale desligada).
 */
export interface Chave {
  id: string;
  titulo: string;
  /** O que muda quando liga, em uma ou duas frases. */
  efeito: string;
  /** De onde vem a regra (prompt e seção). */
  origem: string;
  /** Tela onde está a prévia do efeito, conferida antes de ligar. */
  previa: { href: string; rotulo: string };
}

export const CHAVES = [
  {
    id: "membro_padrao_restrito",
    titulo: "Padrão novo do papel “membro”",
    efeito:
      "O membro passa a alcançar só as telas de lançamento e receita. Telas personalizadas na Gestão de Acessos continuam como estão.",
    origem: "Prompt AJ, Parte 1 (1.4)",
    previa: { href: "/acessos", rotulo: "Gestão de Acessos — quem perde o quê" },
  },
  {
    id: "contas_pagar_so_atual",
    titulo: "Contas a Pagar só com a versão Atual",
    efeito:
      "Despesas gravadas em Orçamento, Previsão ou versão copiada deixam de contar como obrigação — em Contas a Pagar, no Dashboard, no Fechamento e na conciliação do extrato. Nada é apagado: elas continuam nas versões delas.",
    origem: "Prompt I, §10",
    previa: { href: "/contaspagar#previa", rotulo: "Contas a Pagar — as linhas de planejamento que deixam de aparecer" },
  },
] as const satisfies readonly Chave[];

export type ChaveId = (typeof CHAVES)[number]["id"];

export function ehChave(id: unknown): id is ChaveId {
  return typeof id === "string" && CHAVES.some((c) => c.id === id);
}

/** Estado vindo do banco → só as chaves do catálogo que estão ligadas. */
export function chavesLigadasDe(linhas: readonly { chave: string; ligada: boolean }[]): Set<ChaveId> {
  const out = new Set<ChaveId>();
  for (const l of linhas) if (l.ligada && ehChave(l.chave)) out.add(l.chave);
  return out;
}
