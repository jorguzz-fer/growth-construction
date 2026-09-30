import { and, eq, gt, sql } from "drizzle-orm";
import { db, schema } from "@/lib/db";
import type { VinculosDaDespesa } from "@/lib/despesa-regras";

type Exec = typeof db | Parameters<Parameters<typeof db.transaction>[0]>[0];

/**
 * Conta os vínculos financeiros de uma despesa (Prompt I, 11.6 e §12). Usado
 * pela edição — e, na PR seguinte, pela exclusão. Só leitura.
 */
export async function vinculosDaDespesa(exec: Exec, tenantId: string, despesaId: string): Promise<VinculosDaDespesa> {
  const n = async (q: Promise<{ n: number }[]>) => (await q)[0]?.n ?? 0;
  const count = sql<number>`count(*)::int`;
  const [parcelas, parcelasPagas, pagamentos, acertos, restituicoes, caixaConciliado, terceiros, documentosFiscais, anexos] = await Promise.all([
    n(exec.select({ n: count }).from(schema.despesaParcelas).where(and(eq(schema.despesaParcelas.tenantId, tenantId), eq(schema.despesaParcelas.despesaId, despesaId)))),
    n(
      exec
        .select({ n: count })
        .from(schema.despesaParcelas)
        .where(and(eq(schema.despesaParcelas.tenantId, tenantId), eq(schema.despesaParcelas.despesaId, despesaId), gt(schema.despesaParcelas.valorPago, "0"))),
    ),
    n(exec.select({ n: count }).from(schema.pagamentos).where(and(eq(schema.pagamentos.tenantId, tenantId), eq(schema.pagamentos.despesaId, despesaId)))),
    n(exec.select({ n: count }).from(schema.acertoItens).where(and(eq(schema.acertoItens.tenantId, tenantId), eq(schema.acertoItens.despesaId, despesaId)))),
    n(
      exec
        .select({ n: count })
        .from(schema.restituicaoItens)
        .innerJoin(schema.despesaTerceiros, eq(schema.restituicaoItens.despesaTerceiroId, schema.despesaTerceiros.id))
        .innerJoin(schema.restituicoes, eq(schema.restituicaoItens.restituicaoId, schema.restituicoes.id))
        .where(
          and(
            eq(schema.restituicaoItens.tenantId, tenantId),
            eq(schema.despesaTerceiros.despesaId, despesaId),
            eq(schema.restituicoes.cancelada, false),
          ),
        ),
    ),
    n(exec.select({ n: count }).from(schema.cashEntries).where(and(eq(schema.cashEntries.tenantId, tenantId), eq(schema.cashEntries.conciliadoDespesaId, despesaId)))),
    n(exec.select({ n: count }).from(schema.despesaTerceiros).where(and(eq(schema.despesaTerceiros.tenantId, tenantId), eq(schema.despesaTerceiros.despesaId, despesaId)))),
    n(exec.select({ n: count }).from(schema.documentosFiscais).where(and(eq(schema.documentosFiscais.tenantId, tenantId), eq(schema.documentosFiscais.despesaId, despesaId)))),
    n(exec.select({ n: count }).from(schema.documents).where(and(eq(schema.documents.tenantId, tenantId), eq(schema.documents.despesaId, despesaId)))),
  ]);
  return { parcelas, parcelasPagas, pagamentos, acertos, restituicoes, caixaConciliado, terceiros, documentosFiscais, anexos };
}
