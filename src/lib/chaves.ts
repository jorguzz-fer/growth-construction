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
  {
    id: "restituicao_segue_despesa",
    titulo: "Saída da restituição segue a despesa",
    efeito:
      "A saída de caixa de uma restituição avulsa (e o estorno dela) cai na obra da despesa restituída; a entrada de um repasse cai na obra do recebimento. Antes, caíam na obra aberta na tela. Só daqui em diante: nada já lançado muda. O lote continua na obra da tela até a decisão B11.",
    origem: "Prompt I, §21 (decisão B11, opção 2)",
    previa: { href: "/restituicoes#previa", rotulo: "Restituições — em que obra cairão as próximas saídas" },
  },
  {
    id: "rascunho_fora_dos_relatorios",
    titulo: "Orçamento em Rascunho não entra em relatório",
    efeito:
      "Versões de Orçamento e Previsão Atualizada que não estejam Aprovadas deixam de alimentar DRE, Fluxo de Caixa, Dashboard, Consolidado, Projeção, Resumo, Medição e Contabilidade. A versão Atual (movimento real) nunca é filtrada. Nada é apagado: o rascunho continua nas telas de edição.",
    origem: "Prompt H, seções 1 e 5",
    previa: { href: "/chaves#previa-rascunho", rotulo: "Lista de conferência — o que sairia dos relatórios" },
  },
  {
    id: "dre_definicao_nova",
    titulo: "DRE pela definição nova",
    efeito:
      "Na DRE (e no card Orçado x Realizado de Projetos): despesa classificada como “Receita” deixa de somar na receita e passa a ser listada à parte; multa, juros e outros encargos entram na competência da despesa que os gerou, não no mês do pagamento; na Empresa toda, projeto sem o cenário escolhido fica fora da coluna (antes entrava com o Realizado); o período personalizado com limite aberto passa a usar o eixo do projeto. Nada é gravado nem reclassificado.",
    origem: "Prompt AC, Partes 2, 3.1, 1.3 e 10",
    previa: { href: "/chaves#previa-dre", rotulo: "Prévia — resultado de hoje × definição nova, por projeto e competência" },
  },
  {
    id: "fluxo_definicao_nova",
    titulo: "Fluxo de Caixa pela definição nova",
    efeito:
      "No Fluxo de Caixa: o realizado vem sempre da versão Atual (antes, da primeira versão marcada); a permuta deixa de somar nas colunas de Orçamento e Previsão; projeto sem Atual mostra a ausência em vez de usar outra versão; o saldo acumulado de uma obra parte do caixa dela (não das contas da empresa) e corre pelo realizado nos meses fechados. Nada é gravado.",
    origem: "Prompt AD, Partes 1, 2 e BAD-1 (8.1)",
    previa: { href: "/chaves#previa-fluxo", rotulo: "Prévia — saldo e acumulado de hoje × definição nova, por obra" },
  },
  {
    id: "dashboard_definicao_nova",
    titulo: "Dashboard pela definição nova",
    efeito:
      "No Dashboard: \"Entradas de caixa\" soma só a versão Atual (antes, todas as versões da obra); \"Executado\" é dividido por UM Orçamento, o mais recente que não é cópia (antes, a soma de todos); a margem usa a mesma janela de competências na receita e nos custos; o VGV vem da Atual em toda coluna; \"A receber\" do planejamento mostra o negativo; sem medição, liberação e saldo de financiamento mostram \"—\" em vez do valor do cadastro; e os painéis de status passam a seguir o período. Nada é gravado.",
    origem: "Prompt AA, 4-B.1, 4-B.2, 4-B.3, 4.5, 4.2, 3.1 e 2.3.2 (10.2)",
    previa: { href: "/chaves#previa-dashboard", rotulo: "Prévia — cada cartão hoje × definição nova, por obra" },
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
