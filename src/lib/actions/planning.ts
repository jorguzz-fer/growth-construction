"use server";

import { and, eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { db, schema } from "@/lib/db";
import { getActiveContext } from "@/lib/context";
import { can } from "@/lib/permissions";
import { logAudit } from "@/lib/audit";
import { monthValue } from "@/lib/planning";

export interface PlanningAccountInput {
  rowKey: string;
  dreCategory: string | null;
  total: number;
  months: { mes: string; pct: number }[];
}

/** Screen id de permissão conforme o tipo da versão. */
function screenOf(kind: string): "budget" | "forecast" | null {
  return kind === "budget" ? "budget" : kind === "forecast" ? "forecast" : null;
}

/**
 * Grava um bloco (receitas OU despesas) de uma versão de Budget/Forecast no
 * modelo total + %. Substitui (delete + insert transacional) as contas e os
 * percentuais mensais daquele tipo, na versão informada. O valor mensal é
 * derivado: valor = total × pct / 100. NÃO toca no bloco oposto nem em outras
 * versões — preserva o isolamento entre versões/projetos.
 */
export async function saveBudgetPlanning(
  versionId: string,
  bloco: "receita" | "despesa",
  accounts: PlanningAccountInput[],
) {
  const ctx = await getActiveContext();
  if (!ctx) throw new Error("Sessão inválida.");

  const [version] = await db
    .select()
    .from(schema.versions)
    .where(and(eq(schema.versions.id, versionId), eq(schema.versions.tenantId, ctx.tenant.id)))
    .limit(1);
  if (!version) throw new Error("Versão não encontrada.");
  const screen = screenOf(version.kind);
  if (!screen || !can(ctx.perms, screen, "editar")) {
    throw new Error("Sem permissão para editar esta versão.");
  }
  if (version.locked) throw new Error("Versão congelada — edição bloqueada.");
  if (version.kind !== "budget" && version.kind !== "forecast") {
    throw new Error("Só é possível planejar versões de Budget ou Forecast.");
  }

  // Validação: sem percentuais negativos; soma por conta não pode ultrapassar 100%.
  for (const a of accounts) {
    let soma = 0;
    for (const m of a.months) {
      const p = Number(m.pct) || 0;
      if (p < 0) throw new Error(`Percentual negativo em "${a.rowKey}".`);
      soma += p;
    }
    if (soma > 100.01) {
      throw new Error(
        `A distribuição mensal de "${a.rowKey}" não pode ultrapassar 100% do total.`,
      );
    }
  }

  await db.transaction(async (tx) => {
    await tx
      .delete(schema.budgetAccounts)
      .where(
        and(
          eq(schema.budgetAccounts.versionId, versionId),
          eq(schema.budgetAccounts.kind, bloco),
        ),
      );
    await tx
      .delete(schema.budgetLines)
      .where(
        and(eq(schema.budgetLines.versionId, versionId), eq(schema.budgetLines.kind, bloco)),
      );

    const accVals = accounts
      .filter((a) => Number(a.total) !== 0 || a.months.some((m) => (Number(m.pct) || 0) !== 0))
      .map((a) => ({
        tenantId: ctx.tenant.id,
        versionId,
        kind: bloco,
        rowKey: a.rowKey,
        dreCategory: a.dreCategory,
        total: String(Number(a.total) || 0),
      }));
    if (accVals.length > 0) await tx.insert(schema.budgetAccounts).values(accVals);

    const lineVals: (typeof schema.budgetLines.$inferInsert)[] = [];
    for (const a of accounts) {
      const total = Number(a.total) || 0;
      for (const m of a.months) {
        const pct = Number(m.pct) || 0;
        if (pct === 0) continue;
        lineVals.push({
          tenantId: ctx.tenant.id,
          versionId,
          kind: bloco,
          rowKey: a.rowKey,
          dreCategory: a.dreCategory,
          mes: m.mes,
          valor: String(monthValue(total, pct)),
          pct: String(pct),
        });
      }
    }
    if (lineVals.length > 0) await tx.insert(schema.budgetLines).values(lineVals);
  });

  await logAudit({
    tenantId: ctx.tenant.id,
    userId: ctx.userId,
    action: "budget.planning.save",
    entity: "version",
    entityId: versionId,
    meta: { bloco, contas: accounts.length },
  });
  revalidatePath("/budget");
  revalidatePath("/forecast");
  revalidatePath("/dre");
  revalidatePath("/fluxocaixa");
}

/** Atualiza o status do workflow da versão (Rascunho/Concluído/Aprovado). */
export async function setVersionStatus(versionId: string, status: string) {
  const ctx = await getActiveContext();
  if (!ctx) throw new Error("Sessão inválida.");
  const allowed = ["Rascunho", "Concluído", "Aprovado"];
  if (!allowed.includes(status)) throw new Error("Status inválido.");
  const [version] = await db
    .select()
    .from(schema.versions)
    .where(and(eq(schema.versions.id, versionId), eq(schema.versions.tenantId, ctx.tenant.id)))
    .limit(1);
  if (!version) return;
  const screen = screenOf(version.kind);
  if (!screen || !can(ctx.perms, screen, "editar")) {
    throw new Error("Sem permissão.");
  }
  await db
    .update(schema.versions)
    .set({ status })
    .where(eq(schema.versions.id, versionId));
  await logAudit({
    tenantId: ctx.tenant.id,
    userId: ctx.userId,
    action: "version.status",
    entity: "version",
    entityId: versionId,
    meta: { status },
  });
  revalidatePath("/budget");
  revalidatePath("/forecast");
}
