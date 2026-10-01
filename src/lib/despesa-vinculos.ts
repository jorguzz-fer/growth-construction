import { and, eq, gt, inArray, isNotNull, sql } from "drizzle-orm";
import { db, schema } from "@/lib/db";
import type { MovimentoConciliado, VinculosDaDespesa } from "@/lib/despesa-regras";

type Exec = typeof db | Parameters<Parameters<typeof db.transaction>[0]>[0];

/**
 * Conta os vínculos financeiros de uma despesa (Prompt I, 11.6 e §12). Usado
 * pela edição — e, na PR seguinte, pela exclusão. Só leitura.
 */
export async function vinculosDaDespesa(exec: Exec, tenantId: string, despesaId: string): Promise<VinculosDaDespesa> {
  const n = async (q: Promise<{ n: number }[]>) => (await q)[0]?.n ?? 0;
  const count = sql<number>`count(*)::int`;
  const [parcelas, parcelasPagas, pagamentos, acertos, restituicoes, caixaConciliado, terceiros, documentosFiscais, anexos, cartao] = await Promise.all([
    n(exec.select({ n: count }).from(schema.despesaParcelas).where(and(eq(schema.despesaParcelas.tenantId, tenantId), eq(schema.despesaParcelas.despesaId, despesaId)))),
    n(
      exec
        .select({ n: count })
        .from(schema.despesaParcelas)
        .where(and(eq(schema.despesaParcelas.tenantId, tenantId), eq(schema.despesaParcelas.despesaId, despesaId), gt(schema.despesaParcelas.valorPago, "0"))),
    ),
    n(exec.select({ n: count }).from(schema.pagamentos).where(and(eq(schema.pagamentos.tenantId, tenantId), eq(schema.pagamentos.despesaId, despesaId)))),
    n(exec.select({ n: count }).from(schema.acertoItens).where(and(eq(schema.acertoItens.tenantId, tenantId), eq(schema.acertoItens.despesaId, despesaId)))),
    // Restituições ativas que tocam esta despesa: as em lote pelos itens, e as
    // avulsas (sem item) pela obrigação âncora (Prompt I, §23).
    n(
      exec
        .select({ n: count })
        .from(schema.restituicoes)
        .innerJoin(schema.despesaTerceiros, eq(schema.restituicoes.despesaTerceiroId, schema.despesaTerceiros.id))
        .where(
          and(
            eq(schema.restituicoes.tenantId, tenantId),
            eq(schema.restituicoes.cancelada, false),
            sql`(
              (${schema.despesaTerceiros.despesaId} = ${despesaId}
                and not exists (select 1 from ${schema.restituicaoItens} ri where ri.restituicao_id = ${schema.restituicoes.id}))
              or exists (
                select 1 from ${schema.restituicaoItens} ri
                join ${schema.despesaTerceiros} dt2 on dt2.id = ri.despesa_terceiro_id
                where ri.restituicao_id = ${schema.restituicoes.id} and dt2.despesa_id = ${despesaId}
              )
            )`,
          ),
        ),
    ),
    n(exec.select({ n: count }).from(schema.cashEntries).where(and(eq(schema.cashEntries.tenantId, tenantId), eq(schema.cashEntries.conciliadoDespesaId, despesaId)))),
    n(exec.select({ n: count }).from(schema.despesaTerceiros).where(and(eq(schema.despesaTerceiros.tenantId, tenantId), eq(schema.despesaTerceiros.despesaId, despesaId)))),
    n(exec.select({ n: count }).from(schema.documentosFiscais).where(and(eq(schema.documentosFiscais.tenantId, tenantId), eq(schema.documentosFiscais.despesaId, despesaId)))),
    n(exec.select({ n: count }).from(schema.documents).where(and(eq(schema.documents.tenantId, tenantId), eq(schema.documents.despesaId, despesaId)))),
    // Prompt U — compra no cartão (parcelas vinculadas à fatura).
    n(exec.select({ n: count }).from(schema.despesas).where(and(eq(schema.despesas.tenantId, tenantId), eq(schema.despesas.id, despesaId), isNotNull(schema.despesas.cartaoId)))),
  ]);
  return { parcelas, parcelasPagas, pagamentos, acertos, restituicoes, caixaConciliado, terceiros, documentosFiscais, anexos, cartao };
}

/**
 * Prompt S, 2.2 / 2.4 — o inventário do que a exclusão levaria junto (ou do
 * que a impede): os vínculos, o total já saído do caixa pelos pagamentos, os
 * acertos (pelo PED) e a obrigação com terceiro. Só leitura; serve à tela
 * (antes de confirmar) e à auditoria (depois de apagar).
 */
export interface InventarioDaDespesa extends VinculosDaDespesa {
  totalPago: number;
  acertosNumDoc: string[];
}

export async function inventarioDaDespesa(exec: Exec, tenantId: string, despesaId: string): Promise<InventarioDaDespesa> {
  const vinculos = await vinculosDaDespesa(exec, tenantId, despesaId);
  const [pago] = await exec
    .select({ total: sql<string>`coalesce(sum(${schema.pagamentos.valorTotalPago}), 0)` })
    .from(schema.pagamentos)
    .where(and(eq(schema.pagamentos.tenantId, tenantId), eq(schema.pagamentos.despesaId, despesaId)));
  const itens = vinculos.acertos
    ? await exec
        .select({ acertoId: schema.acertoItens.acertoId })
        .from(schema.acertoItens)
        .where(and(eq(schema.acertoItens.tenantId, tenantId), eq(schema.acertoItens.despesaId, despesaId)))
    : [];
  const ids = [...new Set(itens.map((i) => i.acertoId).filter((x): x is string => !!x))];
  const acertos = ids.length
    ? await exec.select({ numDoc: schema.acertos.numDoc }).from(schema.acertos).where(inArray(schema.acertos.id, ids))
    : [];
  return { ...vinculos, totalPago: Number(pago?.total ?? 0), acertosNumDoc: acertos.map((a) => a.numDoc ?? "(sem número)") };
}

/** Prompt S, 1.2 — os movimentos do extrato conciliados com a despesa. Só leitura. */
export async function movimentosConciliados(exec: Exec, tenantId: string, despesaId: string): Promise<MovimentoConciliado[]> {
  const rows = await exec
    .select({ data: schema.cashEntries.data, valor: schema.cashEntries.valor, descricao: schema.cashEntries.descricao })
    .from(schema.cashEntries)
    .where(and(eq(schema.cashEntries.tenantId, tenantId), eq(schema.cashEntries.conciliadoDespesaId, despesaId)));
  return rows.map((r) => ({ data: r.data, valor: Number(r.valor), descricao: r.descricao }));
}
