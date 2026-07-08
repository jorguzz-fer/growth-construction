import { and, eq, sql } from "drizzle-orm";
import { db, schema } from "@/lib/db";

/** Maior sufixo numérico já usado em `despesa.numDoc` (semente da sequência). */
async function maxExistingDespesaNumber(tenantId: string): Promise<number> {
  const rows = await db
    .select({ n: schema.despesas.numDoc })
    .from(schema.despesas)
    .where(eq(schema.despesas.tenantId, tenantId));
  let max = 0;
  for (const r of rows) {
    const m = r.n?.match(/(\d+)\s*$/);
    if (m) max = Math.max(max, parseInt(m[1], 10));
  }
  return max;
}

/**
 * Reserva o próximo número da sequência de Despesas de forma ATÔMICA no banco.
 * A linha da sequência é criada (semeada pelo maior número existente) na
 * primeira vez; a reserva usa `UPDATE ... RETURNING` (statement único) dentro
 * de uma transação, então dois lançamentos simultâneos recebem números
 * distintos — nunca duplicados, nunca reutilizando números excluídos.
 */
export async function reserveDespesaNumber(tenantId: string): Promise<string> {
  return db.transaction(async (tx) => {
    const [seq] = await tx
      .select()
      .from(schema.numberSequences)
      .where(
        and(
          eq(schema.numberSequences.tenantId, tenantId),
          eq(schema.numberSequences.entity, "despesa"),
        ),
      )
      .limit(1);

    if (!seq) {
      const start = (await maxExistingDespesaNumber(tenantId)) + 1;
      await tx
        .insert(schema.numberSequences)
        .values({ tenantId, entity: "despesa", nextNumber: start })
        .onConflictDoNothing();
    }

    const [updated] = await tx
      .update(schema.numberSequences)
      .set({
        nextNumber: sql`${schema.numberSequences.nextNumber} + 1`,
        updatedAt: new Date(),
      })
      .where(
        and(
          eq(schema.numberSequences.tenantId, tenantId),
          eq(schema.numberSequences.entity, "despesa"),
        ),
      )
      .returning();

    const used = updated.nextNumber - 1;
    const num = String(used).padStart(updated.digits, "0");
    return updated.usePrefix && updated.prefix ? `${updated.prefix}-${num}` : num;
  });
}

/** Formata um preview do próximo número sem reservar (para a tela de config). */
export function previewNumber(
  prefix: string,
  usePrefix: boolean,
  digits: number,
  next: number,
): string {
  const num = String(next).padStart(digits, "0");
  return usePrefix && prefix ? `${prefix}-${num}` : num;
}
