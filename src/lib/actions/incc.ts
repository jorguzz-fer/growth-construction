"use server";

import { and, eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { db, schema } from "@/lib/db";
import { getActiveContext } from "@/lib/context";
import { can } from "@/lib/permissions";
import { logAudit } from "@/lib/audit";
import { getInccRows } from "@/lib/queries";
import { recalcIncc, projectIncc, type InccRow } from "@/lib/calc";

const ordOf = (mes: string): number => {
  const [m, y] = mes.split("/").map(Number);
  return y * 12 + (m - 1);
};

/** Persiste (monthly, accumulated, projected) de cada linha em transação. */
async function persistIncc(projectId: string, rows: InccRow[]) {
  await db.transaction(async (tx) => {
    for (const r of rows) {
      await tx
        .update(schema.inccRates)
        .set({
          monthly: r.mo.toString(),
          accumulated: r.ac.toString(),
          projected: !!r.projected,
        })
        .where(
          and(
            eq(schema.inccRates.projectId, projectId),
            eq(schema.inccRates.mes, r.m),
          ),
        );
    }
  });
}

/**
 * Persiste a tabela INCC de um projeto: recebe as variações mensais, recalcula
 * o acumulado encadeado e atualiza cada linha. Ver docs/SPEC.md §6.
 */
export async function saveIncc(
  projectId: string,
  monthly: { mes: string; mo: number }[],
) {
  const ctx = await getActiveContext();
  if (!ctx || !can(ctx.perms, "parametros", "editar")) return;
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

/**
 * Edita manualmente o índice de UM mês (item 1). O mês passa a ser oficial
 * (projected = false) e, em seguida, os meses ainda projetados são recalculados
 * pela média móvel (item 2) e o acumulado é reencadeado.
 */
export async function updateInccMonth(
  projectId: string,
  mes: string,
  mo: number,
) {
  const ctx = await getActiveContext();
  if (!ctx || !can(ctx.perms, "parametros", "editar")) return;
  if (!ctx.projects.some((p) => p.id === projectId)) return;

  const rows = await getInccRows(projectId);
  const next = rows.map((r) =>
    r.m === mes
      ? { ...r, mo: Number.isFinite(mo) ? mo : 0, projected: false }
      : r,
  );
  const projected = projectIncc(next);
  await persistIncc(projectId, projected);

  await logAudit({
    tenantId: ctx.tenant.id,
    userId: ctx.userId,
    action: "incc.update",
    entity: "incc_rate",
    meta: { projectId, mes, mo },
  });
  revalidatePath("/parametros");
}

/**
 * Marca como projetados todos os meses estritamente futuros (após o mês
 * corrente) e os preenche pela média móvel de 12 meses (item 2). Meses
 * históricos/correntes permanecem oficiais e inalterados.
 */
export async function projectFutureIncc(projectId: string) {
  const ctx = await getActiveContext();
  if (!ctx || !can(ctx.perms, "parametros", "editar")) return;
  if (!ctx.projects.some((p) => p.id === projectId)) return;

  const now = new Date();
  const curOrd = now.getFullYear() * 12 + now.getMonth();

  const rows = await getInccRows(projectId);
  const flagged = rows.map((r) => ({
    ...r,
    projected: ordOf(r.m) > curOrd,
  }));
  const projected = projectIncc(flagged);
  await persistIncc(projectId, projected);

  await logAudit({
    tenantId: ctx.tenant.id,
    userId: ctx.userId,
    action: "incc.project",
    entity: "incc_rate",
    meta: { projectId },
  });
  revalidatePath("/parametros");
}
