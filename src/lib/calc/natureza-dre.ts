/**
 * Natureza contábil das categorias da DRE — RG-01 e a trava do item 1.3.
 *
 * A DRE do Growth tem nove categorias numa lista única (`CATEGORIAS_DRE`), sem
 * distinguir o que é conta CREDORA (receita) do que é DEVEDORA (custo, despesa,
 * saída patrimonial). Essa lista alimenta o `<Select>` de despesa, e como
 * "Receita" é o primeiro item, toda despesa nova nascia classificada como
 * receita — inflando receita e resultado ao mesmo tempo.
 *
 * Este módulo é a fonte única dessa classificação. Ele existe separado da
 * constante porque a regra é contábil, precisa de teste e é consumida tanto
 * pela interface (filtrar o dropdown) quanto pelo servidor (recusar a
 * gravação). Validar só no cliente não protege nada: a Server Action é
 * chamável direto.
 */
import { CATEGORIAS_DRE, type CategoriaDRE } from "./constants";

export type NaturezaDRE = "credora" | "devedora";

/**
 * Categorias de natureza CREDORA — entram no resultado como receita.
 *
 * Hoje só "Receita". Fica como conjunto (e não como comparação direta) porque
 * o pacote de controladoria acrescenta "Receitas Financeiras" (RG-07, descontos
 * obtidos), e o resto do código não deve precisar mudar quando isso acontecer.
 */
const CREDORAS = new Set<string>(["Receita"]);

/**
 * Natureza de uma categoria da DRE.
 *
 * O default é DEVEDORA de propósito: uma categoria desconhecida (vinda de dado
 * histórico ou de uma versão futura da lista) é tratada como despesa, que é o
 * lado seguro — classificar errado como receita é o erro que este módulo
 * existe para impedir.
 */
export function naturezaCategoriaDre(categoria: string | null | undefined): NaturezaDRE {
  if (!categoria) return "devedora";
  return CREDORAS.has(categoria.trim()) ? "credora" : "devedora";
}

/** Categoria válida para um lançamento de DESPESA? (RG-01, item 1.3) */
export function categoriaValidaParaDespesa(categoria: string | null | undefined): boolean {
  return naturezaCategoriaDre(categoria) === "devedora";
}

/**
 * Categorias que podem aparecer no dropdown de uma despesa: só as devedoras.
 * A ordem original da lista é preservada — a tela não deve reordenar o que o
 * usuário já conhece de cor.
 */
export function categoriasDeDespesa(
  categorias: readonly string[] = CATEGORIAS_DRE,
): string[] {
  return categorias.filter((c) => categoriaValidaParaDespesa(c));
}

/** Mensagem única de recusa, usada pelas duas telas que lançam despesa. */
export const ERRO_CATEGORIA_CREDORA =
  "Categoria de receita não é válida para lançamento de despesa.";

/**
 * Valida a categoria escolhida num lançamento de despesa.
 *
 * Devolve a mensagem de erro ou `null`. Categoria vazia é recusada aqui porque
 * o formulário passou a abrir em "Selecione…" — sem isso, deixar o campo em
 * branco gravaria despesa sem classificação na DRE.
 */
export function validarCategoriaDespesa(
  categoria: string | null | undefined,
): string | null {
  if (!categoria || !categoria.trim()) return "Selecione a categoria DRE da despesa.";
  if (!categoriaValidaParaDespesa(categoria)) return ERRO_CATEGORIA_CREDORA;
  return null;
}

/** Type guard: a string é uma das categorias conhecidas da DRE? */
export function ehCategoriaDre(v: string | null | undefined): v is CategoriaDRE {
  return !!v && (CATEGORIAS_DRE as readonly string[]).includes(v);
}
