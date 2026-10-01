"use server";

import { and, eq, inArray, isNull, sql } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { db, schema } from "@/lib/db";
import { getTenantContext } from "@/lib/context";
import { can } from "@/lib/permissions";
import { logAudit } from "@/lib/audit";
import { hojeISO } from "@/lib/despesa-status";
import { ymd } from "@/lib/utils";
import { assinaturaDoItem } from "@/lib/calc/conferencia-cartao";
import { cicloAberto } from "@/lib/calc/cartao-ciclo";
import { estadoDaFatura } from "@/lib/calc/fatura";
import { getFaturasCartao } from "@/lib/queries";

/**
 * Extrato do cartão e estorno (Prompt U, seções 5 e 6).
 * A importação grava SÓ o registro do extrato (5.4) — nunca despesa — e não
 * duplica o mesmo arquivo (5.3, `import_hash`). O estorno é lançamento
 * próprio (6.2): a compra não é apagada nem editada; o crédito reduz a
 * fatura e é aplicado no pagamento. Crédito do extrato que já foi antecipado
 * é reconhecido como par, sem segundo estorno (6.3).
 */

export interface ItemImportado {
  data: string;
  descricao: string;
  valor: number;
}

export type ResultadoImportacao = { ok: true; inseridos: number; ignorados: number; vinculados: number } | { ok: false; error: string };

export async function importarExtratoCartao(input: { cartaoId: string; itens: ItemImportado[] }): Promise<ResultadoImportacao> {
  const ctx = await getTenantContext();
  if (!ctx || !can(ctx.perms, "cartoes", "editar")) return { ok: false, error: "Sem permissão para subir extrato de cartão." };
  const [cartao] = await db.select().from(schema.cartoesCredito).where(and(eq(schema.cartoesCredito.id, input.cartaoId), eq(schema.cartoesCredito.tenantId, ctx.tenant.id)));
  if (!cartao) return { ok: false, error: "Cartão não encontrado." };
  const validos = input.itens.filter((i) => Number.isFinite(i.valor) && i.valor !== 0 && ymd(i.data));
  if (validos.length === 0) return { ok: false, error: "Nenhum lançamento com data e valor foi reconhecido." };
  const existentes = await db.select({ h: schema.extratoCartao.importHash }).from(schema.extratoCartao).where(and(eq(schema.extratoCartao.tenantId, ctx.tenant.id), eq(schema.extratoCartao.cartaoId, cartao.id)));
  const ja = new Set(existentes.map((e) => e.h).filter((h): h is string => !!h));
  const novos: { importHash: string; data: string; descricao: string; valor: number }[] = [];
  let ignorados = 0;
  for (const i of validos) {
    const h = assinaturaDoItem(cartao.id, i.data, i.valor, i.descricao);
    if (ja.has(h)) {
      ignorados++;
      continue;
    }
    ja.add(h);
    novos.push({ importHash: h, data: i.data, descricao: i.descricao.trim() || "—", valor: Math.round(i.valor * 100) / 100 });
  }
  let vinculados = 0;
  if (novos.length > 0) {
    await db.transaction(async (tx) => {
      const inseridos = await tx
        .insert(schema.extratoCartao)
        .values(novos.map((n) => ({ tenantId: ctx.tenant.id, cartaoId: cartao.id, importHash: n.importHash, data: n.data, descricao: n.descricao, valor: String(n.valor) })))
        .onConflictDoNothing()
        .returning();
      // 6.3 — crédito que já foi antecipado: reconhece e vincula, sem segundo estorno.
      const creditos = inseridos.filter((i) => Number(i.valor) < 0);
      if (creditos.length > 0) {
        const antecipados = await tx
          .select()
          .from(schema.estornosCartao)
          .where(and(eq(schema.estornosCartao.tenantId, ctx.tenant.id), eq(schema.estornosCartao.cartaoId, cartao.id), eq(schema.estornosCartao.origem, "antecipado"), isNull(schema.estornosCartao.extratoItemId)))
          .for("update");
        const livres = [...antecipados];
        for (const c of creditos) {
          const idx = livres.findIndex((e) => Math.abs(Number(e.valor) - Math.abs(Number(c.valor))) <= 0.005);
          if (idx < 0) continue;
          const [e] = livres.splice(idx, 1);
          await tx.update(schema.estornosCartao).set({ extratoItemId: c.id }).where(eq(schema.estornosCartao.id, e.id));
          vinculados++;
        }
      }
      await logAudit({ tenantId: ctx.tenant.id, userId: ctx.userId, action: "cartao.extrato.importar", entity: "cartao_credito", entityId: cartao.id, meta: { inseridos: inseridos.length, ignorados, vinculados } }, tx);
    });
  }
  revalidatePath("/cartoes");
  return { ok: true, inseridos: novos.length, ignorados, vinculados };
}

export interface EstornoInput {
  cartaoId: string;
  /** a compra original (despesa no cartão). */
  despesaId: string;
  valor: number;
  /** "MM/DD/YYYY" */
  data: string;
  /** item do extrato (crédito) quando o estorno nasce dele. */
  extratoItemId?: string | null;
  obs?: string | null;
}

export type ResultadoEstorno = { ok: true; estornoId: string; faturaFechamento: string } | { ok: false; error: string };

/**
 * 6.1/6.2 — registra um estorno: antecipado (o usuário já sabe da devolução)
 * ou a partir do crédito do extrato. O crédito cai na fatura da compra, se
 * ela ainda não foi paga; senão, na fatura do ciclo aberto. A compra não é
 * apagada nem editada (teste 15).
 */
export async function registrarEstorno(input: EstornoInput): Promise<ResultadoEstorno> {
  const ctx = await getTenantContext();
  if (!ctx || !can(ctx.perms, "cartoes", "editar")) return { ok: false, error: "Sem permissão para registrar estorno." };
  const valor = Math.round(Math.abs(input.valor) * 100) / 100;
  if (!(valor > 0)) return { ok: false, error: "Informe o valor do estorno." };
  if (!input.data || !ymd(input.data)) return { ok: false, error: "Informe a data do estorno." };
  const [cartao] = await db.select().from(schema.cartoesCredito).where(and(eq(schema.cartoesCredito.id, input.cartaoId), eq(schema.cartoesCredito.tenantId, ctx.tenant.id)));
  if (!cartao) return { ok: false, error: "Cartão não encontrado." };
  const [compra] = await db.select().from(schema.despesas).where(and(eq(schema.despesas.id, input.despesaId), eq(schema.despesas.tenantId, ctx.tenant.id), eq(schema.despesas.cartaoId, cartao.id)));
  if (!compra) return { ok: false, error: "Compra não encontrada neste cartão." };
  if (compra.cancelado) return { ok: false, error: "Compra cancelada." };
  const [{ jaEstornado }] = await db.select({ jaEstornado: sql<string>`coalesce(sum(${schema.estornosCartao.valor}), 0)` }).from(schema.estornosCartao).where(eq(schema.estornosCartao.despesaId, compra.id));
  if (valor + Number(jaEstornado) > Number(compra.valor) + 0.005) return { ok: false, error: `O estorno excede o valor da compra (${Number(compra.valor).toLocaleString("pt-BR", { style: "currency", currency: "BRL" })}, já estornados ${Number(jaEstornado).toLocaleString("pt-BR", { style: "currency", currency: "BRL" })}).` };
  if (input.extratoItemId) {
    const [item] = await db.select().from(schema.extratoCartao).where(and(eq(schema.extratoCartao.id, input.extratoItemId), eq(schema.extratoCartao.cartaoId, cartao.id)));
    if (!item || Number(item.valor) >= 0) return { ok: false, error: "Item do extrato não é um crédito deste cartão." };
    const [usado] = await db.select({ id: schema.estornosCartao.id }).from(schema.estornosCartao).where(eq(schema.estornosCartao.extratoItemId, item.id));
    if (usado) return { ok: false, error: "Este crédito do extrato já tem estorno vinculado (6.3)." };
  }
  // Em que fatura cai o crédito: a da compra, se ainda não paga; senão a do ciclo aberto.
  const hoje = hojeISO();
  const faturas = await getFaturasCartao(ctx.tenant.id, cartao.id);
  const [parcela] = await db.select({ faturaId: schema.despesaParcelas.faturaId }).from(schema.despesaParcelas).where(eq(schema.despesaParcelas.despesaId, compra.id)).orderBy(schema.despesaParcelas.numeroParcela).limit(1);
  const daCompra = faturas.find((f) => f.id === parcela?.faturaId);
  let faturaId: string;
  let fechamento: string;
  if (daCompra && estadoDaFatura(daCompra, hoje) !== "paga") {
    faturaId = daCompra.id;
    fechamento = daCompra.fechamento;
  } else {
    const ciclo = cicloAberto(hoje, cartao);
    if (!ciclo) return { ok: false, error: "Não foi possível determinar a fatura do ciclo." };
    await db.insert(schema.faturasCartao).values({ tenantId: ctx.tenant.id, cartaoId: cartao.id, fechamento: ciclo.fechamento, vencimento: ciclo.vencimento }).onConflictDoNothing();
    const [f] = await db.select().from(schema.faturasCartao).where(and(eq(schema.faturasCartao.cartaoId, cartao.id), eq(schema.faturasCartao.fechamento, ciclo.fechamento)));
    faturaId = f.id;
    fechamento = f.fechamento;
  }
  const origem = input.extratoItemId ? "extrato" : "antecipado";
  const [e] = await db
    .insert(schema.estornosCartao)
    .values({ tenantId: ctx.tenant.id, cartaoId: cartao.id, despesaId: compra.id, faturaId, valor: String(valor), data: input.data, origem, extratoItemId: input.extratoItemId || null, obs: input.obs || null, usuarioId: ctx.userId })
    .returning();
  await logAudit({ tenantId: ctx.tenant.id, userId: ctx.userId, action: "cartao.estorno", entity: "despesa", entityId: compra.id, meta: { estornoId: e.id, cartaoId: cartao.id, numDoc: compra.numDoc, valor, data: input.data, origem, faturaFechamento: fechamento } });
  for (const p of ["/cartoes", "/contaspagar"]) revalidatePath(p);
  return { ok: true, estornoId: e.id, faturaFechamento: fechamento };
}

/** 6.3 — vincula um crédito do extrato a um estorno antecipado existente (quando o automático não casou). */
export async function vincularCreditoAoEstorno(estornoId: string, extratoItemId: string): Promise<{ ok: true } | { ok: false; error: string }> {
  const ctx = await getTenantContext();
  if (!ctx || !can(ctx.perms, "cartoes", "editar")) return { ok: false, error: "Sem permissão." };
  const [e] = await db.select().from(schema.estornosCartao).where(and(eq(schema.estornosCartao.id, estornoId), eq(schema.estornosCartao.tenantId, ctx.tenant.id)));
  if (!e) return { ok: false, error: "Estorno não encontrado." };
  if (e.extratoItemId) return { ok: false, error: "Este estorno já está vinculado a um crédito do extrato." };
  const [item] = await db.select().from(schema.extratoCartao).where(and(eq(schema.extratoCartao.id, extratoItemId), eq(schema.extratoCartao.cartaoId, e.cartaoId)));
  if (!item || Number(item.valor) >= 0) return { ok: false, error: "Item do extrato não é um crédito deste cartão." };
  const [usado] = await db.select({ id: schema.estornosCartao.id }).from(schema.estornosCartao).where(inArray(schema.estornosCartao.extratoItemId, [item.id]));
  if (usado) return { ok: false, error: "Este crédito já tem estorno vinculado." };
  await db.update(schema.estornosCartao).set({ extratoItemId: item.id }).where(eq(schema.estornosCartao.id, e.id));
  await logAudit({ tenantId: ctx.tenant.id, userId: ctx.userId, action: "cartao.estorno.vincular", entity: "despesa", entityId: e.despesaId ?? e.id, meta: { estornoId: e.id, extratoItemId: item.id } });
  revalidatePath("/cartoes");
  return { ok: true };
}
