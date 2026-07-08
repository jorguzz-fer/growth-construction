"use server";

import { and, asc, desc, eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { db, schema } from "@/lib/db";
import { getActiveContext } from "@/lib/context";
import { can } from "@/lib/permissions";
import { logAudit } from "@/lib/audit";
import { reserveDespesaNumber } from "@/lib/db/numbering";
import { statusRestituicao } from "@/lib/calc";
import type { CategoriaDRE } from "@/lib/calc/constants";

/**
 * Cria uma "despesa paga por terceiro com restituição posterior" (Fase 4):
 * reconhece a DESPESA na DRE (competência/categoria) e registra a OBRIGAÇÃO da
 * empresa com quem desembolsou — SEM saída de caixa da empresa neste momento.
 */
export async function criarDespesaTerceiro(formData: FormData) {
  const ctx = await getActiveContext();
  if (!ctx || !can(ctx.perms, "restituicoes", "criar")) {
    throw new Error("Sem permissão para registrar despesas pagas por terceiros.");
  }
  if (ctx.version.locked) throw new Error("Versão congelada.");
  const s = (k: string) => (formData.get(k) as string) || null;
  const valor = (formData.get("valor") as string) || "0";

  const numDoc = await reserveDespesaNumber(ctx.tenant.id);
  const [desp] = await db
    .insert(schema.despesas)
    .values({
      versionId: ctx.version.id,
      tenantId: ctx.tenant.id,
      numDoc,
      fornecedorId: s("fornecedorId"),
      contaCef: s("contaCef"),
      categoriaDre: (formData.get("categoriaDre") as CategoriaDRE) || null,
      competencia: s("competencia"),
      vencimento: s("dataPagamentoOriginal"),
      valor,
      status: "Pago",
      obs: s("obs"),
      pagoPorTerceiro: true,
    })
    .returning();

  const [dt] = await db
    .insert(schema.despesaTerceiros)
    .values({
      tenantId: ctx.tenant.id,
      despesaId: desp.id,
      pagadorTerceiroId: s("pagadorTerceiroId"),
      empresaResponsavelId: s("empresaResponsavelId") || ctx.project.id,
      valorTotal: valor,
      dataPagamentoOriginal: s("dataPagamentoOriginal"),
      dataPrevistaRestituicao: s("dataPrevistaRestituicao"),
      status: "Aguardando restituição",
      obs: s("obs"),
    })
    .returning();

  await logAudit({
    tenantId: ctx.tenant.id,
    userId: ctx.userId,
    action: "despesaTerceiro.create",
    entity: "despesa_terceiro",
    entityId: dt.id,
    meta: { despesaId: desp.id, valor },
  });
  revalidatePath("/restituicoes");
  revalidatePath("/dre");
}

export interface RestituicaoInput {
  despesaTerceiroId: string;
  valor: number;
  dataRestituicao: string;
  bankAccountId?: string | null;
  comprovante?: string;
  obs?: string;
}

/**
 * Registra uma restituição (parcial ou integral): gera a SAÍDA de caixa da
 * empresa na data efetiva, liquida a obrigação — SEM criar nova despesa na DRE.
 */
export async function registrarRestituicao(input: RestituicaoInput) {
  const ctx = await getActiveContext();
  if (!ctx || !can(ctx.perms, "restituicoes", "editar")) {
    throw new Error("Sem permissão para registrar restituições.");
  }
  const [dt] = await db
    .select()
    .from(schema.despesaTerceiros)
    .where(
      and(
        eq(schema.despesaTerceiros.id, input.despesaTerceiroId),
        eq(schema.despesaTerceiros.tenantId, ctx.tenant.id),
      ),
    )
    .limit(1);
  if (!dt) throw new Error("Obrigação não encontrada.");
  if (dt.status === "Cancelado") throw new Error("Obrigação cancelada.");

  const valor = Math.abs(input.valor);
  const [rest] = await db
    .insert(schema.restituicoes)
    .values({
      tenantId: ctx.tenant.id,
      despesaTerceiroId: dt.id,
      valor: String(valor),
      dataRestituicao: input.dataRestituicao || null,
      bankAccountId: input.bankAccountId || null,
      comprovante: input.comprovante || null,
      obs: input.obs || null,
      usuarioId: ctx.userId,
    })
    .returning();

  const restituido = Number(dt.valorRestituido) + valor;
  await db
    .update(schema.despesaTerceiros)
    .set({
      valorRestituido: String(restituido),
      status: statusRestituicao(Number(dt.valorTotal), restituido),
    })
    .where(eq(schema.despesaTerceiros.id, dt.id));

  // Saída REAL de caixa — só agora o dinheiro sai da empresa.
  await db.insert(schema.cashEntries).values({
    versionId: ctx.version.id,
    tenantId: ctx.tenant.id,
    bankAccountId: input.bankAccountId || null,
    data: input.dataRestituicao || null,
    descricao: "Restituição a terceiro",
    valor: String(-valor),
    cat: "restituicao",
    rec: true,
  });

  await logAudit({
    tenantId: ctx.tenant.id,
    userId: ctx.userId,
    action: "restituicao.create",
    entity: "restituicao",
    entityId: rest.id,
    meta: { despesaTerceiroId: dt.id, valor },
  });
  revalidatePath("/restituicoes");
  revalidatePath("/caixa");
  revalidatePath("/fluxocaixa");
}

/** Cancela uma restituição: estorna o valor e a saída de caixa (compensação). */
export async function cancelarRestituicao(restituicaoId: string) {
  const ctx = await getActiveContext();
  if (!ctx || !can(ctx.perms, "restituicoes", "excluir")) {
    throw new Error("Sem permissão para cancelar restituições.");
  }
  const [rest] = await db
    .select()
    .from(schema.restituicoes)
    .where(
      and(
        eq(schema.restituicoes.id, restituicaoId),
        eq(schema.restituicoes.tenantId, ctx.tenant.id),
      ),
    )
    .limit(1);
  if (!rest) throw new Error("Restituição não encontrada.");

  const [dt] = await db
    .select()
    .from(schema.despesaTerceiros)
    .where(eq(schema.despesaTerceiros.id, rest.despesaTerceiroId))
    .limit(1);
  if (!dt) throw new Error("Obrigação não encontrada.");

  const valor = Number(rest.valor);
  const restituido = Math.max(0, Number(dt.valorRestituido) - valor);
  await db
    .update(schema.despesaTerceiros)
    .set({
      valorRestituido: String(restituido),
      status: statusRestituicao(Number(dt.valorTotal), restituido),
    })
    .where(eq(schema.despesaTerceiros.id, dt.id));
  await db.delete(schema.restituicoes).where(eq(schema.restituicoes.id, rest.id));

  // Compensa a saída de caixa (entrada de estorno).
  await db.insert(schema.cashEntries).values({
    versionId: ctx.version.id,
    tenantId: ctx.tenant.id,
    bankAccountId: rest.bankAccountId,
    data: rest.dataRestituicao,
    descricao: "Estorno de restituição",
    valor: String(valor),
    cat: "ajuste",
    rec: true,
  });

  await logAudit({
    tenantId: ctx.tenant.id,
    userId: ctx.userId,
    action: "restituicao.cancel",
    entity: "restituicao",
    entityId: rest.id,
    meta: { despesaTerceiroId: dt.id, valor },
  });
  revalidatePath("/restituicoes");
  revalidatePath("/caixa");
}

export interface DespesaTerceiroView {
  id: string;
  numDoc: string | null;
  pagador: string | null;
  valorTotal: number;
  valorRestituido: number;
  saldoPendente: number;
  dataPagamentoOriginal: string | null;
  dataPrevistaRestituicao: string | null;
  status: string;
}

/** Lista as obrigações (paga por terceiro) da versão ativa, com pagador. */
export async function getDespesaTerceiros(
  tenantId: string,
  versionId: string,
): Promise<DespesaTerceiroView[]> {
  const rows = await db
    .select({
      dt: schema.despesaTerceiros,
      numDoc: schema.despesas.numDoc,
      pagador: schema.stakeholders.nome,
    })
    .from(schema.despesaTerceiros)
    .innerJoin(schema.despesas, eq(schema.despesaTerceiros.despesaId, schema.despesas.id))
    .leftJoin(
      schema.stakeholders,
      eq(schema.despesaTerceiros.pagadorTerceiroId, schema.stakeholders.id),
    )
    .where(
      and(
        eq(schema.despesaTerceiros.tenantId, tenantId),
        eq(schema.despesas.versionId, versionId),
      ),
    )
    .orderBy(desc(schema.despesaTerceiros.createdAt));
  return rows.map((r) => {
    const total = Number(r.dt.valorTotal);
    const rest = Number(r.dt.valorRestituido);
    return {
      id: r.dt.id,
      numDoc: r.numDoc,
      pagador: r.pagador,
      valorTotal: total,
      valorRestituido: rest,
      saldoPendente: Math.max(0, total - rest),
      dataPagamentoOriginal: r.dt.dataPagamentoOriginal,
      dataPrevistaRestituicao: r.dt.dataPrevistaRestituicao,
      status: r.dt.status,
    };
  });
}

/** Saldo pendente de restituições por mês previsto (para o fluxo de caixa). */
export async function getRestituicoesPendentesByVersion(
  versionId: string,
): Promise<{ despesaIds: string[]; saidasPrevistas: Record<string, number> }> {
  const rows = await db
    .select({ dt: schema.despesaTerceiros, despesaId: schema.despesas.id })
    .from(schema.despesaTerceiros)
    .innerJoin(schema.despesas, eq(schema.despesaTerceiros.despesaId, schema.despesas.id))
    .where(eq(schema.despesas.versionId, versionId))
    .orderBy(asc(schema.despesaTerceiros.dataPrevistaRestituicao));
  const saidas: Record<string, number> = {};
  const despesaIds: string[] = [];
  for (const r of rows) {
    despesaIds.push(r.despesaId);
    if (r.dt.status === "Cancelado") continue;
    const saldo = Number(r.dt.valorTotal) - Number(r.dt.valorRestituido);
    const p = (r.dt.dataPrevistaRestituicao ?? "").split("/");
    const mm = p.length === 3 ? `${p[0]}/${p[2]}` : null;
    if (mm && saldo > 0) saidas[mm] = (saidas[mm] || 0) + saldo;
  }
  return { despesaIds, saidasPrevistas: saidas };
}
