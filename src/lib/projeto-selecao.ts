/**
 * Seleção de projeto por tela (Prompt A, 10, 12 e 22). Puro — serve ao
 * servidor e ao navegador.
 *
 * A obra escolhida mora na URL da própria tela (`?proj=`). Não há projeto
 * "ativo" global, e ausência de escolha NÃO vira o primeiro projeto: a tela
 * pede a escolha (ou, com a memória por aba de B-A2, recupera a última dela).
 */

/**
 * Nome do parâmetro na URL. `proj` é o que o app já usa (Despesas, Unidades,
 * Fluxo de Caixa, Dashboard, Projetos…); `project`, o do texto do prompt, é
 * aceito como sinônimo na leitura (seção 22).
 */
export const PARAM_PROJETO = "proj";
export const PARAM_PROJETO_ALIAS = "project";
/** Valor da opção "Todos os projetos / filiais" nas telas multiprojeto. */
export const TODOS_OS_PROJETOS = "all";

interface ProjetoOrdenavel {
  id: string;
  name: string;
  kind: string;
}

/** Primeiro número do nome ("OBRA 28 - Ed. X" → 28), ou null. */
function codigoDaObra(nome: string): number | null {
  const m = nome.match(/\d+/);
  return m ? Number(m[0]) : null;
}

const alfabetica = (a: string, b: string) =>
  a.localeCompare(b, "pt-BR", { sensitivity: "base", numeric: true });

/**
 * Ordem estável dos seletores (seção 10): obras primeiro, pelo número do nome
 * e depois alfabética; escritórios/filiais em grupo próprio, no fim, em ordem
 * alfabética. Empate final pelo id, para a ordem nunca oscilar. Não altera a
 * lista recebida.
 */
export function ordenarProjetos<T extends ProjetoOrdenavel>(projetos: readonly T[]): T[] {
  return [...projetos].sort((a, b) => {
    const grupoA = a.kind === "office" ? 1 : 0;
    const grupoB = b.kind === "office" ? 1 : 0;
    if (grupoA !== grupoB) return grupoA - grupoB;
    if (grupoA === 0) {
      const ca = codigoDaObra(a.name);
      const cb = codigoDaObra(b.name);
      if (ca !== null && cb !== null && ca !== cb) return ca - cb;
      // Obra com número antes de obra sem número.
      if ((ca === null) !== (cb === null)) return ca === null ? 1 : -1;
    }
    return alfabetica(a.name, b.name) || (a.id < b.id ? -1 : a.id > b.id ? 1 : 0);
  });
}

export type SelecaoDeProjeto<T> =
  | { tipo: "projeto"; projeto: T }
  | { tipo: "todos" }
  | { tipo: "nenhum" };

/**
 * Lê a escolha da URL. `projetos` precisa ser a lista JÁ filtrada pelo tenant
 * da sessão: é ela que garante que um id de outra empresa não seja aceito.
 *
 * Sem escolha, ou com id desconhecido, o resultado é "nenhum" — nunca o
 * primeiro projeto (seção 12). "todos" só vale onde a tela oferece a opção.
 */
export function lerSelecaoDeProjeto<T extends { id: string }>(
  projetos: readonly T[],
  params: Record<string, string | string[] | undefined>,
  opcoes: { permiteTodos?: boolean } = {},
): SelecaoDeProjeto<T> {
  const bruto = params[PARAM_PROJETO] ?? params[PARAM_PROJETO_ALIAS];
  const valor = Array.isArray(bruto) ? bruto[0] : bruto;
  if (!valor) return { tipo: "nenhum" };
  if (valor === TODOS_OS_PROJETOS) {
    return opcoes.permiteTodos ? { tipo: "todos" } : { tipo: "nenhum" };
  }
  const projeto = projetos.find((p) => p.id === valor);
  return projeto ? { tipo: "projeto", projeto } : { tipo: "nenhum" };
}
