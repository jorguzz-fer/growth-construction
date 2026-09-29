import type { OpcoesPermissao } from "@/lib/permissions";

/**
 * Chave por tenant do padrão novo do `membro` (Prompt AJ, 1.4).
 *
 * O app ainda não tem o mecanismo de chave por tenant que o pacote V2 pede
 * (V2-BLOQUEIOS B4). Até ele existir, a chave é a variável de ambiente
 * `MEMBRO_PADRAO_RESTRITO`: lista de ids de tenant separados por vírgula, ou
 * `*` para todos. **Ausente = desligada = comportamento de antes.** Não toca
 * banco, e desligar é tirar o id da lista e reiniciar.
 *
 * Só serve de padrão para a Parte 1. As Partes 2 e 3 valem sem chave.
 */
export function membroRestritoNoTenant(tenantId: string): boolean {
  const raw = (process.env.MEMBRO_PADRAO_RESTRITO ?? "").trim();
  if (!raw) return false;
  if (raw === "*") return true;
  return raw
    .split(",")
    .map((x) => x.trim())
    .filter(Boolean)
    .includes(tenantId);
}

export function opcoesDoTenant(tenantId: string): OpcoesPermissao {
  return { membroRestrito: membroRestritoNoTenant(tenantId) };
}
