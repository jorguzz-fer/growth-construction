import { cache } from "react";
import { eq } from "drizzle-orm";
import { db, schema } from "@/lib/db";
import { chavesLigadasDe, type ChaveId } from "@/lib/chaves";

/**
 * Chaves ligadas da empresa (B4). Uma consulta por requisição (`cache`).
 * Sem linha = desligada.
 */
export const chavesLigadas = cache(async (tenantId: string): Promise<Set<ChaveId>> => {
  const linhas = await db
    .select({ chave: schema.tenantFlags.chave, ligada: schema.tenantFlags.ligada })
    .from(schema.tenantFlags)
    .where(eq(schema.tenantFlags.tenantId, tenantId));
  return chavesLigadasDe(linhas);
});

export async function chaveLigada(tenantId: string, chave: ChaveId): Promise<boolean> {
  return (await chavesLigadas(tenantId)).has(chave);
}
