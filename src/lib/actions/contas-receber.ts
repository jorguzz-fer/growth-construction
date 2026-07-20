"use server";

import { and, eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { db, schema } from "@/lib/db";
import { getActiveContext } from "@/lib/context";
import { can } from "@/lib/permissions";
import { logAudit } from "@/lib/audit";

/** Valor monetário BR/US em texto → string numérica ("1.000,50"→"1000.5"). */
function normValor(v: string | null | undefined): string {
  const s = (v ?? "").trim();
  if (!s) return "0";
  let t = s.replace(/[R$\s]/g, "");
  t = /,\d{1,2}$/.test(t) ? t.replace(/\./g, "").replace(",", ".") : t.replace(/,/g, "");
  const n = Number(t);
  return Number.isFinite(n) ? String(n) : "0";
}
const clean = (v: string | null | undefined) => {
  const s = (v ?? "").trim();
  return s ? s : null;
};

/**
 * Cria uma conta a receber. Exige vínculo com um projeto. Se o tipo for
 * "Outras Receitas", exige uma descrição que identifique a origem/natureza.
 * Pode nascer vinculada a um item do extrato (origemCashEntryId — item 6).
 */
export async function createContaReceber(formData: FormData) {
  const ctx = await getActiveContext();
  if (!ctx || !can(ctx.perms, "contasreceber", "criar")) {
    throw new Error("Sem permissão para criar contas a receber.");
  }
  const projectId = (formData.get("projectId") as string) || "";
  if (!projectId || !ctx.projects.some((p) => p.id === projectId)) {
    throw new Error("Selecione um projeto para a conta a receber.");
  }
  const tipo = (formData.get("tipo") as string) || "Outros";
  const descricao = clean(formData.get("descricao") as string);
  if (tipo === "Outras Receitas" && !descricao) {
    throw new Error('Para "Outras Receitas", informe uma descrição da origem/natureza da receita.');
  }
  const [row] = await db
    .insert(schema.contasReceber)
    .values({
      tenantId: ctx.tenant.id,
      projectId,
      unitCode: clean(formData.get("unitCode") as string),
      clienteId: clean(formData.get("clienteId") as string),
      descricao,
      tipo,
      valor: normValor(formData.get("valor") as string),
      vencimento: clean(formData.get("vencimento") as string),
      status: "A receber",
      bancoId: clean(formData.get("bancoId") as string),
      origemCashEntryId: clean(formData.get("origemCashEntryId") as string),
      createdBy: ctx.userEmail || ctx.userId || null,
    })
    .returning();
  await logAudit({
    tenantId: ctx.tenant.id,
    userId: ctx.userId,
    action: "contaReceber.create",
    entity: "conta_receber",
    entityId: row.id,
    meta: { projectId, tipo, valor: row.valor },
  });
  revalidatePath("/contasreceber");
}

/** Atualiza uma conta a receber (consulta/edição — item 5). */
export async function updateContaReceber(formData: FormData) {
  const ctx = await getActiveContext();
  if (!ctx || !can(ctx.perms, "contasreceber", "editar")) {
    throw new Error("Sem permissão para editar contas a receber.");
  }
  const id = (formData.get("id") as string) || "";
  if (!id) return;
  const tipo = (formData.get("tipo") as string) || "Outros";
  const descricao = clean(formData.get("descricao") as string);
  if (tipo === "Outras Receitas" && !descricao) {
    throw new Error('Para "Outras Receitas", informe uma descrição da origem/natureza da receita.');
  }
  const projectId = (formData.get("projectId") as string) || "";
  if (projectId && !ctx.projects.some((p) => p.id === projectId)) {
    throw new Error("Projeto inválido.");
  }
  const set: Partial<typeof schema.contasReceber.$inferInsert> = {
    tipo,
    descricao,
    valor: normValor(formData.get("valor") as string),
    vencimento: clean(formData.get("vencimento") as string),
    unitCode: clean(formData.get("unitCode") as string),
    clienteId: clean(formData.get("clienteId") as string),
    bancoId: clean(formData.get("bancoId") as string),
    dataRecebimento: clean(formData.get("dataRecebimento") as string),
    valorRecebido: normValor(formData.get("valorRecebido") as string),
    status: (formData.get("status") as string) || "A receber",
  };
  if (projectId) set.projectId = projectId;
  await db
    .update(schema.contasReceber)
    .set(set)
    .where(and(eq(schema.contasReceber.id, id), eq(schema.contasReceber.tenantId, ctx.tenant.id)));
  await logAudit({
    tenantId: ctx.tenant.id,
    userId: ctx.userId,
    action: "contaReceber.update",
    entity: "conta_receber",
    entityId: id,
    meta: { changes: set },
  });
  revalidatePath("/contasreceber");
}

/** Cancelamento lógico (preserva histórico e a rastreabilidade). */
export async function cancelarContaReceber(formData: FormData) {
  const ctx = await getActiveContext();
  if (!ctx || !can(ctx.perms, "contasreceber", "excluir")) {
    throw new Error("Sem permissão.");
  }
  const id = (formData.get("id") as string) || "";
  if (!id) return;
  await db
    .update(schema.contasReceber)
    .set({ cancelado: true, status: "Cancelada" })
    .where(and(eq(schema.contasReceber.id, id), eq(schema.contasReceber.tenantId, ctx.tenant.id)));
  await logAudit({
    tenantId: ctx.tenant.id,
    userId: ctx.userId,
    action: "contaReceber.cancel",
    entity: "conta_receber",
    entityId: id,
  });
  revalidatePath("/contasreceber");
}
