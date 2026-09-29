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
  // Exclusão física (as movimentações caem em cascata): o log guarda o que
  // existia, porque o registro deixa de existir (AK 1.1).
  const [item] = await db
    .select()
    .from(schema.stockItems)
    .where(and(eq(schema.stockItems.id, id), eq(schema.stockItems.tenantId, ctx.tenant.id)))
    .limit(1);
  const movs = item
    ? await db
        .select({ tipo: schema.stockMovements.tipo, quantidade: schema.stockMovements.quantidade })
        .from(schema.stockMovements)
        .where(and(eq(schema.stockMovements.itemId, id), eq(schema.stockMovements.tenantId, ctx.tenant.id)))
    : [];
  await db
    .delete(schema.stockItems)
    .where(and(eq(schema.stockItems.id, id), eq(schema.stockItems.tenantId, ctx.tenant.id)));
  if (item) {
    const saldo = movs.reduce(
      (acc, m) => acc + (m.tipo === "saida" ? -1 : 1) * Number(m.quantidade ?? 0),
      0,
    );
    await logAudit({
      tenantId: ctx.tenant.id,
      userId: ctx.userId,
      action: "estoque.item.delete",
      entity: "stock_item",
      entityId: id,
      meta: {
        nome: item.nome,
        sku: item.sku,
        unidade: item.unidade,
        categoria: item.categoria,
        custoUnit: item.custoUnit,
        saldo,
        movimentacoesExcluidas: movs.length,
      },
    });
  }
  revalidatePath("/estoque");
}
