"use server";

import { and, eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { db, schema } from "@/lib/db";
import { getTenantContext } from "@/lib/context";
import { can } from "@/lib/permissions";
import { logAudit } from "@/lib/audit";
import { diffAudit, houveMudanca } from "@/lib/audit-diff";
import { recusaDoCartao, somenteUltimos4 } from "@/lib/calc/cartao-ciclo";

/**
 * Cadastro de cartões de crédito (Prompt U, seção 1). Esta tela NÃO lança
 * despesa: a compra é lançada em /despesas com a forma "Cartão de crédito".
 * Guarda só os quatro últimos dígitos; mais que isso é recusado (teste 17).
 */

export type ResultadoCartao = { ok: true; id: string } | { ok: false; error: string };

const s = (fd: FormData, k: string) => ((fd.get(k) as string | null) ?? "").trim();
const num = (fd: FormData, k: string): number | null => {
  const v = s(fd, k).replace(",", ".");
  if (v === "") return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : NaN;
};

interface ValoresDoCartao {
  apelido: string;
  bandeira: string | null;
  ultimos4: string | null;
  titular: string | null;
  limite: string | null;
  diaFechamento: number;
  diaVencimento: number;
  bankAccountId: string | null;
  taxaRotativo: string | null;
}
type CamposLidos = { error: string; valores?: undefined } | { error?: undefined; valores: ValoresDoCartao };

async function lerCampos(fd: FormData, tenantId: string): Promise<CamposLidos> {
  const u4 = somenteUltimos4(s(fd, "ultimos4"));
  if (!u4.ok) return { error: u4.error };
  const limite = num(fd, "limite");
  const taxa = num(fd, "taxaRotativo");
  if (limite != null && Number.isNaN(limite)) return { error: "Limite inválido." };
  if (taxa != null && Number.isNaN(taxa)) return { error: "Taxa do rotativo inválida." };
  const campos = {
    apelido: s(fd, "apelido"),
    diaFechamento: Number(s(fd, "diaFechamento")),
    diaVencimento: Number(s(fd, "diaVencimento")),
    limite,
    taxaRotativo: taxa,
  };
  const recusa = recusaDoCartao(campos);
  if (recusa) return { error: recusa };
  // A conta que debita precisa ser do tenant.
  const bankAccountId = s(fd, "bankAccountId") || null;
  if (bankAccountId) {
    const [c] = await db.select({ id: schema.bankAccounts.id }).from(schema.bankAccounts).where(and(eq(schema.bankAccounts.id, bankAccountId), eq(schema.bankAccounts.tenantId, tenantId)));
    if (!c) return { error: "Conta bancária não encontrada." };
  }
  return {
    valores: {
      apelido: campos.apelido,
      bandeira: s(fd, "bandeira") || null,
      ultimos4: u4.ultimos4,
      titular: s(fd, "titular") || null,
      limite: limite == null ? null : String(limite),
      diaFechamento: campos.diaFechamento,
      diaVencimento: campos.diaVencimento,
      bankAccountId,
      taxaRotativo: taxa == null ? null : String(taxa),
    },
  };
}

export async function addCartao(formData: FormData): Promise<ResultadoCartao> {
  const ctx = await getTenantContext();
  if (!ctx || !can(ctx.perms, "cartoes", "criar")) return { ok: false, error: "Sem permissão para cadastrar cartões." };
  const lido = await lerCampos(formData, ctx.tenant.id);
  if (lido.error !== undefined) return { ok: false, error: lido.error };
  const [row] = await db.insert(schema.cartoesCredito).values({ tenantId: ctx.tenant.id, ...lido.valores }).returning();
  await logAudit({
    tenantId: ctx.tenant.id,
    userId: ctx.userId ?? null,
    action: "cartao.create",
    entity: "cartao_credito",
    entityId: row.id,
    meta: { apelido: row.apelido, bandeira: row.bandeira, ultimos4: row.ultimos4, diaFechamento: row.diaFechamento, diaVencimento: row.diaVencimento, comTaxa: row.taxaRotativo != null },
  });
  revalidatePath("/cartoes");
  return { ok: true, id: row.id };
}

export async function updateCartao(formData: FormData): Promise<ResultadoCartao> {
  const ctx = await getTenantContext();
  if (!ctx || !can(ctx.perms, "cartoes", "editar")) return { ok: false, error: "Sem permissão para editar cartões." };
  const id = s(formData, "id");
  const [atual] = await db.select().from(schema.cartoesCredito).where(and(eq(schema.cartoesCredito.id, id), eq(schema.cartoesCredito.tenantId, ctx.tenant.id)));
  if (!atual) return { ok: false, error: "Cartão não encontrado." };
  const lido = await lerCampos(formData, ctx.tenant.id);
  if (lido.error !== undefined) return { ok: false, error: lido.error };
  const [row] = await db.update(schema.cartoesCredito).set(lido.valores).where(eq(schema.cartoesCredito.id, id)).returning();
  const changes = diffAudit(atual as unknown as Record<string, unknown>, lido.valores as unknown as Record<string, unknown>);
  if (houveMudanca(changes)) {
    await logAudit({ tenantId: ctx.tenant.id, userId: ctx.userId ?? null, action: "cartao.update", entity: "cartao_credito", entityId: id, meta: { apelido: row.apelido, changes } });
  }
  revalidatePath("/cartoes");
  return { ok: true, id };
}

/** 1.4 — inativar em vez de excluir. Reativar é o caminho de volta. */
export async function setCartaoAtivo(id: string, ativo: boolean): Promise<ResultadoCartao> {
  const ctx = await getTenantContext();
  if (!ctx || !can(ctx.perms, "cartoes", "editar")) return { ok: false, error: "Sem permissão para editar cartões." };
  const [row] = await db
    .update(schema.cartoesCredito)
    .set({ ativo })
    .where(and(eq(schema.cartoesCredito.id, id), eq(schema.cartoesCredito.tenantId, ctx.tenant.id)))
    .returning();
  if (!row) return { ok: false, error: "Cartão não encontrado." };
  await logAudit({ tenantId: ctx.tenant.id, userId: ctx.userId ?? null, action: ativo ? "cartao.reativar" : "cartao.inativar", entity: "cartao_credito", entityId: id, meta: { apelido: row.apelido } });
  revalidatePath("/cartoes");
  return { ok: true, id };
}
