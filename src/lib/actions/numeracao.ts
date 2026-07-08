"use server";

import { and, eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { db, schema } from "@/lib/db";
import { getActiveContext } from "@/lib/context";
import { can } from "@/lib/permissions";
import { logAudit } from "@/lib/audit";
import { reserveDespesaNumber } from "@/lib/db/numbering";

export type SequenceConfig = {
  prefix: string;
  usePrefix: boolean;
  digits: number;
  nextNumber: number;
  active: boolean;
};

/** Lê (garantindo a existência) a configuração de numeração de Despesas. */
export async function getDespesaSequence(
  tenantId: string,
): Promise<SequenceConfig> {
  const [seq] = await db
    .select()
    .from(schema.numberSequences)
    .where(
      and(
        eq(schema.numberSequences.tenantId, tenantId),
        eq(schema.numberSequences.entity, "despesa"),
      ),
    )
    .limit(1);
  if (seq) {
    return {
      prefix: seq.prefix,
      usePrefix: seq.usePrefix,
      digits: seq.digits,
      nextNumber: seq.nextNumber,
      active: seq.active,
    };
  }
  // Ainda não inicializada: semeia a partir do maior número existente sem consumir.
  const rows = await db
    .select({ n: schema.despesas.numDoc })
    .from(schema.despesas)
    .where(eq(schema.despesas.tenantId, tenantId));
  let max = 0;
  for (const r of rows) {
    const m = r.n?.match(/(\d+)\s*$/);
    if (m) max = Math.max(max, parseInt(m[1], 10));
  }
  return { prefix: "PED", usePrefix: true, digits: 6, nextNumber: max + 1, active: true };
}

/** Atualiza a configuração da sequência (somente quem pode editar a tela). */
export async function updateDespesaSequence(patch: SequenceConfig) {
  const ctx = await getActiveContext();
  if (!ctx || !can(ctx.perms, "numeracao", "editar")) {
    throw new Error("Sem permissão para configurar a numeração.");
  }
  const prefix = (patch.prefix || "").trim().slice(0, 12);
  const digits = Math.min(12, Math.max(1, Math.trunc(patch.digits) || 6));
  const nextNumber = Math.max(1, Math.trunc(patch.nextNumber) || 1);
  const before = await getDespesaSequence(ctx.tenant.id);

  await db
    .insert(schema.numberSequences)
    .values({
      tenantId: ctx.tenant.id,
      entity: "despesa",
      prefix,
      usePrefix: !!patch.usePrefix,
      digits,
      nextNumber,
      active: !!patch.active,
      updatedAt: new Date(),
    })
    .onConflictDoUpdate({
      target: [schema.numberSequences.tenantId, schema.numberSequences.entity],
      set: {
        prefix,
        usePrefix: !!patch.usePrefix,
        digits,
        nextNumber,
        active: !!patch.active,
        updatedAt: new Date(),
      },
    });

  await logAudit({
    tenantId: ctx.tenant.id,
    userId: ctx.userId,
    action: "numeracao.update",
    entity: "number_sequence",
    meta: { before, after: { prefix, usePrefix: !!patch.usePrefix, digits, nextNumber, active: !!patch.active } },
  });
  revalidatePath("/numeracao");
  revalidatePath("/despesas");
}

/** Reserva (consome) o próximo número — usado por outras actions. */
export { reserveDespesaNumber };
