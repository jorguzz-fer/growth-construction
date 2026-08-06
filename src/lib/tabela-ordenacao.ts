/**
 * Ordenação de tabela no estilo planilha (Excel) — §5.
 *
 * ESCOPO DELIBERADAMENTE RESTRITO: este módulo existe para ser compartilhado
 * APENAS entre as telas **Contas a Pagar** e **Contas a Receber**. A sessão
 * "Despesas / Lançamentos" tem ordenação própria (`despesas-ordering.ts`, por
 * `created_at DESC`) que é uma regra de negócio de conferência de lançamento e
 * NÃO deve ser substituída por ordenação interativa. Não importe este módulo
 * lá.
 *
 * Regras implementadas:
 *  - 1º clique no cabeçalho → crescente; 2º clique → decrescente; 3º → volta ao
 *    padrão da tela (sem ordenação manual).
 *  - texto → alfabético (pt-BR, ignora acento/caixa); data → cronológico;
 *    valor → numérico.
 *  - vazios/nulos sempre por último, em qualquer direção.
 *  - empate resolvido por um identificador estável (ID) → ordem determinística.
 *  - a linha inteira se move junto; nada é gravado no banco.
 */

/** Tipo do dado da coluna — define como os valores são comparados. */
export type TipoColuna = "texto" | "data" | "valor";

export type Direcao = "asc" | "desc";

export interface EstadoOrdenacao {
  coluna: string;
  direcao: Direcao;
}

/**
 * Converte uma data interna "MM/DD/YYYY" em um número comparável (YYYYMMDD).
 * Retorna `null` para vazio/inválido — o chamador trata como "sem valor".
 */
export function dataOrdenavel(d: string | null | undefined): number | null {
  if (!d) return null;
  const p = String(d).split("/");
  if (p.length !== 3) return null;
  const mm = Number(p[0]);
  const dd = Number(p[1]);
  const yyyy = Number(p[2]);
  if (!Number.isFinite(mm) || !Number.isFinite(dd) || !Number.isFinite(yyyy)) return null;
  return yyyy * 10000 + mm * 100 + dd;
}

/** Diacríticos combinantes — removidos para que "Ávila" ordene junto de "Avila". */
const DIACRITICOS = new RegExp("[\\u0300-\\u036f]", "g");

/** Normaliza texto para comparação alfabética: sem acento, sem caixa, sem borda. */
export function textoOrdenavel(v: unknown): string | null {
  if (v == null) return null;
  const s = String(v).trim();
  if (s === "") return null;
  return s.normalize("NFD").replace(DIACRITICOS, "").toLocaleLowerCase("pt-BR");
}

/** Número comparável; `null` quando não há valor (não confundir com zero). */
export function valorOrdenavel(v: unknown): number | null {
  if (v == null || v === "") return null;
  const n = typeof v === "number" ? v : Number(v);
  return Number.isFinite(n) ? n : null;
}

/** Chave de comparação de um valor bruto conforme o tipo da coluna. */
export function chaveOrdenacao(
  bruto: unknown,
  tipo: TipoColuna,
): string | number | null {
  if (tipo === "data") return dataOrdenavel(bruto as string | null);
  if (tipo === "valor") return valorOrdenavel(bruto);
  return textoOrdenavel(bruto);
}

/**
 * Próximo estado ao clicar num cabeçalho.
 *
 * coluna nova → "asc"; mesma coluna em "asc" → "desc"; mesma coluna em "desc"
 * → `null` (volta à ordenação padrão da tela, sem perder os filtros).
 */
export function proximoEstado(
  atual: EstadoOrdenacao | null,
  coluna: string,
): EstadoOrdenacao | null {
  if (!atual || atual.coluna !== coluna) return { coluna, direcao: "asc" };
  if (atual.direcao === "asc") return { coluna, direcao: "desc" };
  return null;
}

/** Indicador visual do cabeçalho: ▲ crescente, ▼ decrescente, vazio se inativo. */
export function setaOrdenacao(
  estado: EstadoOrdenacao | null,
  coluna: string,
): "▲" | "▼" | "" {
  if (!estado || estado.coluna !== coluna) return "";
  return estado.direcao === "asc" ? "▲" : "▼";
}

export interface ColunaOrdenavel<T> {
  /** chave estável da coluna (usada no estado e no indicador). */
  key: string;
  tipo: TipoColuna;
  /** extrai o valor bruto da linha. */
  get: (row: T) => unknown;
}

/**
 * Ordena uma cópia de `rows` conforme `estado`.
 *
 * Sem estado, devolve `rows` intacto — a tela mantém a ordenação padrão dela.
 * `id` é o desempate estável (evita que linhas com a mesma chave "pulem" entre
 * renders). O desempate é SEMPRE crescente por ID, mesmo em ordem decrescente:
 * o critério secundário não deve inverter junto com o primário.
 */
export function ordenarTabela<T>(
  rows: readonly T[],
  colunas: readonly ColunaOrdenavel<T>[],
  estado: EstadoOrdenacao | null,
  id: (row: T) => string,
): T[] {
  if (!estado) return [...rows];
  const col = colunas.find((c) => c.key === estado.coluna);
  if (!col) return [...rows];

  const sinal = estado.direcao === "asc" ? 1 : -1;
  return [...rows].sort((a, b) => {
    const ka = chaveOrdenacao(col.get(a), col.tipo);
    const kb = chaveOrdenacao(col.get(b), col.tipo);

    // Vazios sempre no fim, independente da direção.
    if (ka === null && kb === null) return id(a).localeCompare(id(b));
    if (ka === null) return 1;
    if (kb === null) return -1;

    let cmp: number;
    if (typeof ka === "number" && typeof kb === "number") {
      cmp = ka - kb;
    } else {
      cmp = String(ka).localeCompare(String(kb), "pt-BR", { numeric: true });
    }
    if (cmp !== 0) return cmp * sinal;
    return id(a).localeCompare(id(b));
  });
}
