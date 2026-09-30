"use server";

import { and, eq, inArray, sql } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { db, schema } from "@/lib/db";
import { getTenantContext } from "@/lib/context";
import { can } from "@/lib/permissions";
import { logAudit } from "@/lib/audit";

type Kind = "cef" | "complementar";
type Natureza = "receita" | "despesa";

function normKind(v: unknown): Kind {
  return v === "complementar" ? "complementar" : "cef";
}
function normNatureza(v: unknown): Natureza {
  return v === "receita" ? "receita" : "despesa";
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
  natureza?: string;
}) {
  const ctx = await getTenantContext();
  if (!ctx || !can(ctx.perms, "planocontas", "criar")) {
    throw new Error("Sem permissão para criar grupos.");
  }
  const kind = normKind(input.kind);
  const natureza = normNatureza(input.natureza);
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
    natureza,
  });
  await logAudit({
    tenantId: ctx.tenant.id,
    userId: ctx.userId,
    action: "chart.group.create",
    entity: "chart_account",
    meta: { groupCode, groupName, kind, natureza },
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
  natureza?: string;
}) {
  const ctx = await getTenantContext();
  if (!ctx || !can(ctx.perms, "planocontas", "criar")) {
    throw new Error("Sem permissão para criar subitens.");
  }
  const kind = normKind(input.kind);
  const natureza = normNatureza(input.natureza);
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
    natureza,
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
  patch: { code?: string; name?: string; natureza?: string },
) {
  const ctx = await getTenantContext();
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
  const set: { code?: string; name?: string; natureza?: Natureza } = {};
  if (patch.code && patch.code.trim() && patch.code.trim() !== current.code) {
    if (await codeExists(ctx.tenant.id, patch.code.trim())) {
      throw new Error(`O código "${patch.code.trim()}" já existe.`);
    }
    set.code = patch.code.trim();
  }
  if (patch.name && patch.name.trim()) set.name = patch.name.trim();
  if (patch.natureza !== undefined) set.natureza = normNatureza(patch.natureza);
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

/** Ativa/inativa um subitem (exclusão lógica: some de novos lançamentos, fica no histórico). */
export async function setChartAccountAtivo(id: string, ativo: boolean) {
  const ctx = await getTenantContext();
  if (!ctx || !can(ctx.perms, "planocontas", "editar")) return;
  await db
    .update(schema.chartAccounts)
    .set({ ativo })
    .where(
      and(
        eq(schema.chartAccounts.id, id),
        eq(schema.chartAccounts.tenantId, ctx.tenant.id),
      ),
    );
  await logAudit({
    tenantId: ctx.tenant.id,
    userId: ctx.userId,
    action: ativo ? "chart.item.activate" : "chart.item.deactivate",
    entity: "chart_account",
    entityId: id,
  });
  revalidatePath("/planocontas");
}

type Resultado = { ok: true } | { ok: false; error: string };

/**
 * Quantas linhas de Orçamento/Previsão apontam para estes códigos (§12).
 * `budget_account.row_key` e `budget_line.row_key` são texto, sem chave
 * estrangeira: apagar a conta deixaria os valores órfãos ("legado").
 */
async function referenciasNoPlanejamento(tenantId: string, codigos: string[]): Promise<number> {
  if (codigos.length === 0) return 0;
  const [[a], [l]] = await Promise.all([
    db
      .select({ n: sql<number>`count(*)::int` })
      .from(schema.budgetAccounts)
      .where(and(eq(schema.budgetAccounts.tenantId, tenantId), inArray(schema.budgetAccounts.rowKey, codigos))),
    db
      .select({ n: sql<number>`count(*)::int` })
      .from(schema.budgetLines)
      .where(and(eq(schema.budgetLines.tenantId, tenantId), inArray(schema.budgetLines.rowKey, codigos))),
  ]);
  return (a?.n ?? 0) + (l?.n ?? 0);
}

/**
 * Exclui um subitem (§12): só se nenhum Orçamento ou Previsão usa o código.
 * Com uso, o caminho é "Inativar" — a conta some de novos lançamentos e os
 * valores já gravados continuam ligados a ela.
 */
export async function deleteChartItem(id: string): Promise<Resultado> {
  const ctx = await getTenantContext();
  if (!ctx || !can(ctx.perms, "planocontas", "excluir")) {
    return { ok: false, error: "Sem permissão para excluir contas." };
  }
  const [item] = await db
    .select()
    .from(schema.chartAccounts)
    .where(and(eq(schema.chartAccounts.id, id), eq(schema.chartAccounts.tenantId, ctx.tenant.id)))
    .limit(1);
  if (!item) return { ok: false, error: "Conta não encontrada." };
  const refs = await referenciasNoPlanejamento(ctx.tenant.id, [item.code]);
  if (refs > 0) {
    return {
      ok: false,
      error: `A conta ${item.code} tem ${refs} lançamento(s) de Orçamento/Previsão. Use "Inativar": ela some de novos lançamentos e os valores ficam.`,
    };
  }
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
    meta: { kind: item.kind, code: item.code, name: item.name, groupCode: item.groupCode },
  });
  revalidatePath("/planocontas");
  return { ok: true };
}

/** Renomeia (nome e/ou código) um grupo inteiro — aplica a todos os subitens. */
export async function renameChartGroup(input: {
  kind: string;
  groupCode: string;
  groupName?: string;
  newGroupCode?: string;
}) {
  const ctx = await getTenantContext();
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

/**
 * Exclui um grupo inteiro (§12): só se nenhum Orçamento ou Previsão usa o
 * grupo ou alguma conta dele. Com uso, inativa-se conta a conta.
 */
export async function deleteChartGroup(input: { kind: string; groupCode: string }): Promise<Resultado> {
  const ctx = await getTenantContext();
  if (!ctx || !can(ctx.perms, "planocontas", "excluir")) {
    return { ok: false, error: "Sem permissão para excluir grupos." };
  }
  const kind = normKind(input.kind);
  const contas = await db
    .select({ code: schema.chartAccounts.code })
    .from(schema.chartAccounts)
    .where(
      and(
        eq(schema.chartAccounts.tenantId, ctx.tenant.id),
        eq(schema.chartAccounts.kind, kind),
        eq(schema.chartAccounts.groupCode, input.groupCode),
      ),
    );
  const refs = await referenciasNoPlanejamento(ctx.tenant.id, [input.groupCode, ...contas.map((c) => c.code)]);
  if (refs > 0) {
    return {
      ok: false,
      error: `O grupo ${input.groupCode} tem ${refs} lançamento(s) de Orçamento/Previsão. Inative as contas em vez de excluir o grupo.`,
    };
  }
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
    meta: { kind, groupCode: input.groupCode, contas: contas.map((c) => c.code) },
  });
  revalidatePath("/planocontas");
  return { ok: true };
}
