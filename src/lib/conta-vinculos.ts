import { eq, sql } from "drizzle-orm";
import { db, schema } from "@/lib/db";
import type { VinculosDaConta } from "@/lib/contas-regras";

/**
 * Prompt X, BX-2 / 5.4 — quantos registros apontam para uma conta corrente,
 * nas DEZ tabelas com FK para `bank_account` (as oito do prompt mais
 * `cartao_credito` e `fatura_pagamento`, do Prompt U). Só leitura.
 */
export async function vinculosDaConta(contaId: string): Promise<VinculosDaConta> {
  const n = sql<number>`count(*)::int`;
  const c = async (q: Promise<{ n: number }[]>) => (await q)[0]?.n ?? 0;
  const [despesas, parcelas, pagamentos, restituicoes, acertos, repasses, caixa, contasReceber, cartoes, pagamentosDeFatura] = await Promise.all([
    c(db.select({ n }).from(schema.despesas).where(eq(schema.despesas.bancoId, contaId))),
    c(db.select({ n }).from(schema.despesaParcelas).where(eq(schema.despesaParcelas.bankAccountId, contaId))),
    c(db.select({ n }).from(schema.pagamentos).where(eq(schema.pagamentos.bankAccountId, contaId))),
    c(db.select({ n }).from(schema.restituicoes).where(eq(schema.restituicoes.bankAccountId, contaId))),
    c(db.select({ n }).from(schema.acertos).where(eq(schema.acertos.bankAccountId, contaId))),
    c(db.select({ n }).from(schema.repasses).where(eq(schema.repasses.bankAccountId, contaId))),
    c(db.select({ n }).from(schema.cashEntries).where(eq(schema.cashEntries.bankAccountId, contaId))),
    c(db.select({ n }).from(schema.contasReceber).where(eq(schema.contasReceber.bancoId, contaId))),
    c(db.select({ n }).from(schema.cartoesCredito).where(eq(schema.cartoesCredito.bankAccountId, contaId))),
    c(db.select({ n }).from(schema.faturaPagamentos).where(eq(schema.faturaPagamentos.bankAccountId, contaId))),
  ]);
  return { despesas, parcelas, pagamentos, restituicoes, acertos, repasses, caixa, contasReceber, cartoes, pagamentosDeFatura };
}
