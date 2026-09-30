import { sql, type SQL } from "drizzle-orm";
import type { AnyPgColumn } from "drizzle-orm/pg-core";

/**
 * Ordenação cronológica de datas gravadas como TEXTO (Prompt I, §25 e §37).
 *
 * As colunas de negócio são `text` em "MM/DD/YYYY" e "MM/YYYY". `ORDER BY` direto
 * sobre elas é lexicográfico: "12/31/2025" vem depois de "01/01/2026". Estas
 * chaves reescrevem a data como "YYYYMMDD" / "YYYYMM" dentro do SQL, e mandam
 * valor nulo ou fora do formato para o FIM (NULL, que o ASC põe por último).
 * Só leitura: nenhum dado gravado muda.
 */

/** "MM/DD/YYYY" → "YYYYMMDD" em SQL; nula ou inválida → NULL (vai para o fim). */
export function chaveDataBR(col: AnyPgColumn): SQL<string | null> {
  return sql<string | null>`case when ${col} ~ '^\\d{1,2}/\\d{1,2}/\\d{4}$' then split_part(${col}, '/', 3) || lpad(split_part(${col}, '/', 1), 2, '0') || lpad(split_part(${col}, '/', 2), 2, '0') end`;
}

/** "MM/YYYY" → "YYYYMM" em SQL; nula ou inválida → NULL (vai para o fim). */
export function chaveCompetencia(col: AnyPgColumn): SQL<string | null> {
  return sql<string | null>`case when ${col} ~ '^\\d{1,2}/\\d{4}$' then split_part(${col}, '/', 2) || lpad(split_part(${col}, '/', 1), 2, '0') end`;
}
