"use server";

import { and, asc, eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { db, schema } from "@/lib/db";
import { getActiveContext } from "@/lib/context";
import { can } from "@/lib/permissions";
import { logAudit } from "@/lib/audit";
import { composePagamento } from "@/lib/calc";

export interface RegistrarPagamentoInput {
  parcelaId: string;
  valorOriginal: number;
  desconto?: number;
  multa?: number;
  juros?: number;
  outrosAcrescimos?: number;
  dataPagamento: string; // "MM/DD/YYYY"
  bankAccountId?: string | null;
  obs?: string;
}

/**
 * Registra o pagamento de uma parcela (Fase 3), com desconto/multa/juros.
 * - Cria o registro de pagamento com a composição completa.
 * - Atualiza a parcela (valor pago acumulado, encargos, status).
 * - Lança a saída REAL no Controle de Caixa (valor total pago, na data real).
 * Os encargos são reconhecidos separadamente na DRE (Despesas Financeiras).
 */
export async function registrarPagamento(input: RegistrarPagamentoInput) {
  const ctx = await getActiveContext();
  if (!ctx || !can(ctx.perms, "despesas", "editar")) {
    throw new Error("Sem permissão para registrar pagamentos.");
  }
  if (ctx.version.locked) throw new Error("Versão congelada.");

  // Carrega a parcela e a despesa (valida escopo tenant/versão).
  const [parc] = await db
    .select({ p: schema.despesaParcelas, versionId: schema.despesas.versionId })
    .from(schema.despesaParcelas)
    .innerJoin(schema.despesas, eq(schema.despesaParcelas.despesaId, schema.despesas.id))
    .where(
      and(
        eq(schema.despesaParcelas.id, input.parcelaId),
        eq(schema.despesaParcelas.tenantId, ctx.tenant.id),
      ),
    )
    .limit(1);
  if (!parc || parc.versionId !== ctx.version.id) {
    throw new Error("Parcela não encontrada nesta versão.");
  }

  const { valorTotalPago } = composePagamento(input);
  const desconto = input.desconto || 0;
  const multa = input.multa || 0;
  const juros = input.juros || 0;
  const outros = input.outrosAcrescimos || 0;

  const [pag] = await db
    .insert(schema.pagamentos)
    .values({
      tenantId: ctx.tenant.id,
      parcelaId: parc.p.id,
      despesaId: parc.p.despesaId,
      valorOriginal: String(input.valorOriginal),
      desconto: String(desconto),
      multa: String(multa),
      juros: String(juros),
      outrosAcrescimos: String(outros),
      valorTotalPago: String(valorTotalPago),
      dataPagamento: input.dataPagamento || null,
      bankAccountId: input.bankAccountId || null,
      obs: input.obs || null,
      usuarioId: ctx.userId,
    })
    .returning();

  // Atualiza a parcela: acumula pago/encargos e recalcula o status.
  const novoPago = Number(parc.p.valorPago) + valorTotalPago;
  const original = Number(parc.p.valorOriginal);
  const status = novoPago + 0.01 >= original ? "Pago" : "Pago parcialmente";
  await db
    .update(schema.despesaParcelas)
    .set({
      valorPago: String(novoPago),
      multa: String(Number(parc.p.multa) + multa),
      juros: String(Number(parc.p.juros) + juros),
      desconto: String(Number(parc.p.desconto) + desconto),
      outrosAcrescimos: String(Number(parc.p.outrosAcrescimos) + outros),
      dataPagamento: input.dataPagamento || parc.p.dataPagamento,
      status,
    })
    .where(eq(schema.despesaParcelas.id, parc.p.id));

  // Saída REAL no Controle de Caixa (valor efetivamente pago, na data real).
  await db.insert(schema.cashEntries).values({
    versionId: ctx.version.id,
    tenantId: ctx.tenant.id,
    bankAccountId: input.bankAccountId || null,
    data: input.dataPagamento || null,
    descricao: `Pagamento parcela #${parc.p.numeroParcela}`,
    valor: String(-Math.abs(valorTotalPago)),
    cat: "despesa",
    rec: true,
  });

  await logAudit({
    tenantId: ctx.tenant.id,
    userId: ctx.userId,
    action: "pagamento.create",
    entity: "pagamento",
    entityId: pag.id,
    meta: { parcelaId: parc.p.id, valorTotalPago, multa, juros, desconto, outros },
  });
  revalidatePath("/despesas");
  revalidatePath("/caixa");
  revalidatePath("/fluxocaixa");
  revalidatePath("/dre");
}

/** Encargos financeiros (multa+juros+outros−desconto) por mês de pagamento. */
export async function getEncargosByVersion(
  versionId: string,
): Promise<Record<string, number>> {
  const rows = await db
    .select({
      data: schema.pagamentos.dataPagamento,
      multa: schema.pagamentos.multa,
      juros: schema.pagamentos.juros,
      outros: schema.pagamentos.outrosAcrescimos,
      desconto: schema.pagamentos.desconto,
    })
    .from(schema.pagamentos)
    .innerJoin(schema.despesas, eq(schema.pagamentos.despesaId, schema.despesas.id))
    .where(eq(schema.despesas.versionId, versionId))
    .orderBy(asc(schema.pagamentos.dataPagamento));
  const out: Record<string, number> = {};
  for (const r of rows) {
    const enc = Number(r.multa) + Number(r.juros) + Number(r.outros) - Number(r.desconto);
    const p = (r.data ?? "").split("/");
    const mm = p.length === 3 ? `${p[0]}/${p[2]}` : null;
    if (mm) out[mm] = (out[mm] || 0) + enc;
  }
  return out;
}
