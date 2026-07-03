"use server";

import { and, eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { db, schema } from "@/lib/db";
import { getActiveContext } from "@/lib/context";
import { can } from "@/lib/permissions";
import { logAudit } from "@/lib/audit";

type Kind = "cef" | "complementar";

function normKind(v: unknown): Kind {
  return v === "complementar" ? "complementar" : "cef";
}

async function codeExists(tenantId: string, code: string): Promise<boolean> {
  const [row] = await db
    .select({ id: schema.chartAccounts.id })
    .from(schema.chartAccounts)
    .where(
      and(
        eq(schema.chartAccounts.tenantId, tenantId),
        eq(schema.chartAccounts.code, code),
      ),
    )
    .limit(1);
  return Boolean(row);
}

/** Cria um novo grupo do plano de contas com o seu primeiro subitem. */
export async function addChartGroup(input: {
  kind: string;
  groupCode: string;
  groupName: string;
  code: string;
  name: string;
}) {
  const ctx = await getActiveContext();
  if (!ctx || !can(ctx.perms, "planocontas", "criar")) {
    throw new Error("Sem permissão para criar grupos.");
  }
  const kind = normKind(input.kind);
  const groupCode = input.groupCode.trim();
  const groupName = input.groupName.trim();
  const code = input.code.trim();
  const name = input.name.trim();
  if (!groupCode || !groupName || !code || !name) {
    throw new Error("Informe o grupo e o primeiro subitem.");
  }
  if (await codeExists(ctx.tenant.id, code)) {
    throw new Error(`O código "${code}" já existe.`);
  }
  await db.insert(schema.chartAccounts).values({
    tenantId: ctx.tenant.id,
    code,
    name,
    groupCode,
    groupName,
    kind,
  });
  await logAudit({
    tenantId: ctx.tenant.id,
    userId: ctx.userId,
    action: "chart.group.create",
    entity: "chart_account",
    meta: { groupCode, groupName, kind },
  });
  revalidatePath("/planocontas");
}

/** Adiciona um subitem a um grupo existente. */
export async function addChartItem(input: {
  kind: string;
  groupCode: string;
  groupName: string;
  code: string;
  name: string;
}) {
  const ctx = await getActiveContext();
  if (!ctx || !can(ctx.perms, "planocontas", "criar")) {
    throw new Error("Sem permissão para criar subitens.");
  }
  const kind = normKind(input.kind);
  const code = input.code.trim();
  const name = input.name.trim();
  if (!code || !name) throw new Error("Informe o código e o nome do subitem.");
  if (await codeExists(ctx.tenant.id, code)) {
    throw new Error(`O código "${code}" já existe.`);
  }
  await db.insert(schema.chartAccounts).values({
    tenantId: ctx.tenant.id,
    code,
    name,
    groupCode: input.groupCode.trim(),
    groupName: input.groupName.trim(),
    kind,
  });
  await logAudit({
    tenantId: ctx.tenant.id,
    userId: ctx.userId,
    action: "chart.item.create",
    entity: "chart_account",
    meta: { code, name },
  });
  revalidatePath("/planocontas");
}

/** Edita o código/nome de um subitem. */
export async function updateChartItem(
  id: string,
  patch: { code?: string; name?: string },
) {
  const ctx = await getActiveContext();
  if (!ctx || !can(ctx.perms, "planocontas", "editar")) return;
  const [current] = await db
    .select()
    .from(schema.chartAccounts)
    .where(
      and(
        eq(schema.chartAccounts.id, id),
        eq(schema.chartAccounts.tenantId, ctx.tenant.id),
      ),
    )
    .limit(1);
  if (!current) return;
  const set: { code?: string; name?: string } = {};
  if (patch.code && patch.code.trim() && patch.code.trim() !== current.code) {
    if (await codeExists(ctx.tenant.id, patch.code.trim())) {
      throw new Error(`O código "${patch.code.trim()}" já existe.`);
    }
    set.code = patch.code.trim();
  }
  if (patch.name && patch.name.trim()) set.name = patch.name.trim();
  if (Object.keys(set).length === 0) return;
  await db
    .update(schema.chartAccounts)
    .set(set)
    .where(eq(schema.chartAccounts.id, id));
  await logAudit({
    tenantId: ctx.tenant.id,
    userId: ctx.userId,
    action: "chart.item.update",
    entity: "chart_account",
    entityId: id,
    meta: set,
  });
  revalidatePath("/planocontas");
}

/** Exclui um subitem. */
export async function deleteChartItem(id: string) {
  const ctx = await getActiveContext();
  if (!ctx || !can(ctx.perms, "planocontas", "excluir")) return;
  await db
    .delete(schema.chartAccounts)
    .where(
      and(
        eq(schema.chartAccounts.id, id),
        eq(schema.chartAccounts.tenantId, ctx.tenant.id),
      ),
    );
  await logAudit({
    tenantId: ctx.tenant.id,
    userId: ctx.userId,
    action: "chart.item.delete",
    entity: "chart_account",
    entityId: id,
  });
  revalidatePath("/planocontas");
}

/** Renomeia (nome e/ou código) um grupo inteiro — aplica a todos os subitens. */
export async function renameChartGroup(input: {
  kind: string;
  groupCode: string;
  groupName?: string;
  newGroupCode?: string;
}) {
  const ctx = await getActiveContext();
  if (!ctx || !can(ctx.perms, "planocontas", "editar")) return;
  const kind = normKind(input.kind);
  const set: { groupName?: string; groupCode?: string } = {};
  if (input.groupName && input.groupName.trim()) set.groupName = input.groupName.trim();
  if (input.newGroupCode && input.newGroupCode.trim()) set.groupCode = input.newGroupCode.trim();
  if (Object.keys(set).length === 0) return;
  await db
    .update(schema.chartAccounts)
    .set(set)
    .where(
      and(
        eq(schema.chartAccounts.tenantId, ctx.tenant.id),
        eq(schema.chartAccounts.kind, kind),
        eq(schema.chartAccounts.groupCode, input.groupCode),
      ),
    );
  await logAudit({
    tenantId: ctx.tenant.id,
    userId: ctx.userId,
    action: "chart.group.update",
    entity: "chart_account",
    meta: { kind, groupCode: input.groupCode, ...set },
  });
  revalidatePath("/planocontas");
}

/** Exclui um grupo inteiro (todos os seus subitens). */
export async function deleteChartGroup(input: { kind: string; groupCode: string }) {
  const ctx = await getActiveContext();
  if (!ctx || !can(ctx.perms, "planocontas", "excluir")) return;
  const kind = normKind(input.kind);
  await db
    .delete(schema.chartAccounts)
    .where(
      and(
        eq(schema.chartAccounts.tenantId, ctx.tenant.id),
        eq(schema.chartAccounts.kind, kind),
        eq(schema.chartAccounts.groupCode, input.groupCode),
      ),
    );
  await logAudit({
    tenantId: ctx.tenant.id,
    userId: ctx.userId,
    action: "chart.group.delete",
    entity: "chart_account",
    meta: { kind, groupCode: input.groupCode },
  });
  revalidatePath("/planocontas");
}
