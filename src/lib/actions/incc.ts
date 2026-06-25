"use server";

import { and, eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { db, schema } from "@/lib/db";
import { recalcIncc } from "@/lib/calc";

/**
 * Persiste a tabela INCC de um projeto: recebe as variações mensais, recalcula
 * o acumulado encadeado e atualiza cada linha. Ver docs/SPEC.md §6.
 */
export async function saveIncc(
  projectId: string,
  monthly: { mes: string; mo: number }[],
) {
  const recalced = recalcIncc(monthly.map((r) => ({ m: r.mes, mo: r.mo, ac: 0 })));

  await db.transaction(async (tx) => {
    for (const r of recalced) {
      await tx
        .update(schema.inccRates)
        .set({ monthly: r.mo.toString(), accumulated: r.ac.toString() })
        .where(
          and(
            eq(schema.inccRates.projectId, projectId),
            eq(schema.inccRates.mes, r.m),
          ),
        );
    }
  });

  revalidatePath("/parametros");
}
