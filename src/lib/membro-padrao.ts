import type { OpcoesPermissao } from "@/lib/permissions";
import { chaveLigada } from "@/lib/chaves-tenant";

/**
 * Chave por tenant do padrão novo do `membro` (Prompt AJ, 1.4).
 *
 * Liga de dois jeitos, e basta um:
 *  - a chave `membro_padrao_restrito` na tela Chaves de mudança (B4);
 *  - a variável de ambiente `MEMBRO_PADRAO_RESTRITO`, que veio antes do
 *    mecanismo: lista de ids de tenant separados por vírgula, ou `*` para
 *    todos. Continua valendo para não mudar nada no deploy.
 * **Nenhum dos dois = desligada = comportamento de antes.**
 *
 * Só serve de padrão para a Parte 1. As Partes 2 e 3 valem sem chave.
 */
export function membroRestritoPorAmbiente(tenantId: string): boolean {
  const raw = (process.env.MEMBRO_PADRAO_RESTRITO ?? "").trim();
  if (!raw) return false;
  if (raw === "*") return true;
  return raw
    .split(",")
    .map((x) => x.trim())
    .filter(Boolean)
    .includes(tenantId);
}

export async function membroRestritoNoTenant(tenantId: string): Promise<boolean> {
  return membroRestritoPorAmbiente(tenantId) || (await chaveLigada(tenantId, "membro_padrao_restrito"));
}

export async function opcoesDoTenant(tenantId: string): Promise<OpcoesPermissao> {
  return { membroRestrito: await membroRestritoNoTenant(tenantId) };
}
