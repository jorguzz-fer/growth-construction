"use server";

import { and, eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { db, schema } from "@/lib/db";
import { getActiveContext } from "@/lib/context";
import { can } from "@/lib/permissions";
import { logAudit } from "@/lib/audit";

const num = (v: FormDataEntryValue | null): number => {
  const n = Number(String(v ?? "").replace(",", "."));
  return Number.isFinite(n) ? n : 0;
};
const str = (v: FormDataEntryValue | null): string | null => {
  const s = String(v ?? "").trim();
  return s ? s : null;
};

/** Cadastra um item de estoque. */
export async function addStockItem(formData: FormData) {
  const ctx = await getActiveContext();
  if (!ctx || !can(ctx.perms, "estoque", "criar")) throw new Error("Sem permissão.");
  const nome = str(formData.get("nome"));
  if (!nome) throw new Error("Informe o nome do item.");
  await db.insert(schema.stockItems).values({
    tenantId: ctx.tenant.id,
    sku: str(formData.get("sku")),
    nome,
    unidade: str(formData.get("unidade")) || "un",
    categoria: str(formData.get("categoria")),
    custoUnit: String(num(formData.get("custoUnit"))),
    minimo: String(num(formData.get("minimo"))),
    obs: str(formData.get("obs")),
  });
  await logAudit({
    tenantId: ctx.tenant.id,
    userId: ctx.userId,
    action: "estoque.item.create",
    entity: "stock_item",
    meta: { nome },
  });
  revalidatePath("/estoque");
}

/** Registra uma movimentação de estoque (entrada ou saída). */
export async function addStockMovement(formData: FormData) {
  const ctx = await getActiveContext();
  if (!ctx || !can(ctx.perms, "estoque", "criar")) throw new Error("Sem permissão.");
  const itemId = str(formData.get("itemId"));
  if (!itemId) throw new Error("Selecione o item.");
  const tipo = String(formData.get("tipo") ?? "entrada") === "saida" ? "saida" : "entrada";
  const quantidade = num(formData.get("quantidade"));
  if (quantidade <= 0) throw new Error("Quantidade deve ser maior que zero.");

  // Vínculos: só fazem sentido em entrada por compra (despesa) ou permuta.
  const despesaId = tipo === "entrada" ? str(formData.get("despesaId")) : null;
  const permutaId = tipo === "entrada" ? str(formData.get("permutaId")) : null;
  const responsavel = str(formData.get("responsavel")) || ctx.userEmail || null;

  await db.insert(schema.stockMovements).values({
    tenantId: ctx.tenant.id,
    itemId,
    projectId: str(formData.get("projectId")),
    tipo,
    origem: str(formData.get("origem")),
    quantidade: String(quantidade),
    custoUnit: String(num(formData.get("custoUnit"))),
    data: str(formData.get("data")),
    doc: str(formData.get("doc")),
    despesaId,
    permutaId,
    responsavel,
    obs: str(formData.get("obs")),
  });
  await logAudit({
    tenantId: ctx.tenant.id,
    userId: ctx.userId,
    action: "estoque.mov.create",
    entity: "stock_movement",
    entityId: itemId,
    meta: { tipo, quantidade, origem: str(formData.get("origem")) },
  });
  revalidatePath("/estoque");
}

/** Exclui um item de estoque (e suas movimentações em cascata). */
export async function deleteStockItem(id: string) {
  const ctx = await getActiveContext();
  if (!ctx || !can(ctx.perms, "estoque", "excluir")) return;
  await db
    .delete(schema.stockItems)
    .where(and(eq(schema.stockItems.id, id), eq(schema.stockItems.tenantId, ctx.tenant.id)));
  revalidatePath("/estoque");
}
