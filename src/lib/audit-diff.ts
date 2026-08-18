/**
 * Diff campo a campo para a trilha de auditoria — RG-09.
 *
 * A regra exige que toda alteração em documento com efeito contábil registre
 * `usuario`, `timestamp`, `campo`, `valor_anterior` e `valor_novo`. Usuário e
 * timestamp já são colunas de `audit_log`; o que faltava era o par
 * anterior/novo POR CAMPO — sem ele, o log diz que alguém editou uma despesa,
 * mas não o que mudou, que é justamente o que a conferência precisa.
 *
 * O diff vai dentro de `meta` (JSONB) em vez de virar colunas novas: uma
 * alteração mexe em vários campos de uma vez, e uma linha de log por campo
 * multiplicaria o volume do log sem ganho de leitura. Além disso não exige
 * migração numa tabela em produção.
 *
 * Módulo puro e sem dependência de banco, para poder ser testado direto.
 */

/** Uma alteração de campo: valor anterior e valor novo. */
export interface MudancaCampo {
  de: unknown;
  para: unknown;
}

export type DiffAuditoria = Record<string, MudancaCampo>;

/**
 * Normaliza um valor para comparação.
 *
 * `undefined`, `null` e string vazia representam a mesma coisa no banco
 * (coluna nula) e não podem ser reportados como alteração. Datas viram ISO e
 * valores numéricos em `numeric` chegam como string do Postgres ("100.00"),
 * então comparar `"100.00"` com `100` daria falso positivo — ambos viram
 * número quando a string é numérica.
 */
function normalizar(v: unknown): unknown {
  if (v === undefined || v === null || v === "") return null;
  if (v instanceof Date) return v.toISOString();
  if (typeof v === "string") {
    const t = v.trim();
    if (t === "") return null;
    // "100.00" e 100 são o mesmo valor gravado — não é alteração.
    if (/^-?\d+(\.\d+)?$/.test(t)) return Number(t);
    return t;
  }
  return v;
}

/** Dois valores representam a mesma coisa gravada? */
export function mesmoValor(a: unknown, b: unknown): boolean {
  const na = normalizar(a);
  const nb = normalizar(b);
  if (na === nb) return true;
  if (typeof na === "object" && typeof nb === "object" && na && nb) {
    return JSON.stringify(na) === JSON.stringify(nb);
  }
  return false;
}

/**
 * Compara o registro ANTES com o patch que está sendo aplicado e devolve só os
 * campos que realmente mudaram.
 *
 * Percorre as chaves do PATCH, não as do registro: um `set` parcial não deve
 * reportar como alterados os campos que ele nem toca. Devolve `{}` quando nada
 * mudou de fato — o chamador pode usar isso para não gravar log vazio.
 */
export function diffAudit(
  antes: Record<string, unknown> | null | undefined,
  patch: Record<string, unknown>,
): DiffAuditoria {
  const out: DiffAuditoria = {};
  const base = antes ?? {};
  for (const campo of Object.keys(patch)) {
    const de = base[campo];
    const para = patch[campo];
    if (mesmoValor(de, para)) continue;
    out[campo] = { de: normalizar(de), para: normalizar(para) };
  }
  return out;
}

/** Houve alteração real? */
export function houveMudanca(diff: DiffAuditoria): boolean {
  return Object.keys(diff).length > 0;
}
