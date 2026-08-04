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

  // Trava contra despesa de terceiro com valor ZERO.
  if (!Number.isFinite(Number(valor)) || Number(valor) === 0) {
    throw new Error("Informe um valor maior que zero para a despesa paga por terceiro.");
  }
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
  // A restituição não pode exceder o que ainda se deve ao terceiro: além de
  // gerar uma saída de caixa indevida, deixaria o saldo devido negativo (hoje
  // só mascarado pelo clamp na exibição). Tolerância de 1 centavo para
  // arredondamento.
  if (valor === 0) throw new Error("Informe um valor maior que zero.");
  const saldoDevido = Number(dt.valorTotal) - Number(dt.valorRestituido);
  if (valor > saldoDevido + 0.01) {
    throw new Error(
      `Valor acima do saldo devido (${saldoDevido.toLocaleString("pt-BR", {
        style: "currency",
        currency: "BRL",
      })}). Ajuste o valor da restituição.`,
    );
  }
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

export interface SaldoTerceiroView {
  pagadorId: string | null;
  pagador: string;
  obrigacoes: number;
  valorTotal: number;
  valorRestituido: number;
  saldoDevido: number;
}

/**
 * Extrato CONSOLIDADO por terceiro/sócio: quanto a empresa deve a cada um,
 * quanto já foi restituído e o saldo remanescente.
 *
 * Até aqui só existia a visão por obrigação individual (uma linha por despesa),
 * sem nenhum lugar que respondesse "quanto ainda devo ao sócio X". Este saldo
 * NÃO é saldo bancário disponível da empresa — é obrigação com terceiros.
 */
export async function getSaldosPorTerceiro(
  tenantId: string,
  versionId: string,
): Promise<SaldoTerceiroView[]> {
  const rows = await db
    .select({
      dt: schema.despesaTerceiros,
      pagadorId: schema.stakeholders.id,
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
    );

  const porPagador = new Map<string, SaldoTerceiroView>();
  for (const r of rows) {
    if (r.dt.status === "Cancelado") continue;
    const chave = r.pagadorId ?? "—";
    const atual =
      porPagador.get(chave) ??
      ({
        pagadorId: r.pagadorId ?? null,
        pagador: r.pagador ?? "Não identificado",
        obrigacoes: 0,
        valorTotal: 0,
        valorRestituido: 0,
        saldoDevido: 0,
      } satisfies SaldoTerceiroView);
    atual.obrigacoes += 1;
    atual.valorTotal += Number(r.dt.valorTotal);
    atual.valorRestituido += Number(r.dt.valorRestituido);
    atual.saldoDevido = Math.max(0, atual.valorTotal - atual.valorRestituido);
    porPagador.set(chave, atual);
  }
  return [...porPagador.values()].sort((a, b) => b.saldoDevido - a.saldoDevido);
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
