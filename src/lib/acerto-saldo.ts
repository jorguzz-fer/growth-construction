import { and, eq, inArray, sql } from "drizzle-orm";
import { db, schema } from "@/lib/db";
import { principalDoPagamento } from "@/lib/pagamento-regras";
import { saldoRealDaDespesa, type ComposicaoDoSaldo } from "@/lib/acerto-regras";

type Exec = typeof db | Parameters<Parameters<typeof db.transaction>[0]>[0];

export interface SaldoReal extends ComposicaoDoSaldo {
  saldo: number;
}

/**
 * Saldo real de cada despesa (Prompt I, §17): valor − abatimentos de acertos
 * ativos − principal dos pagamentos. Uma lógica só, usada pela tela (lista de
 * PEDs abatíveis) e pelo servidor (dentro da transação, com as despesas
 * travadas). Só leitura.
 */
export async function saldosReaisDasDespesas(
  exec: Exec,
  tenantId: string,
  despesas: readonly { id: string; valor: string | number }[],
): Promise<Map<string, SaldoReal>> {
  const out = new Map<string, SaldoReal>();
  if (despesas.length === 0) return out;
  const ids = despesas.map((d) => d.id);
  const [abatimentos, pagamentos] = await Promise.all([
    exec
      .select({ despesaId: schema.acertoItens.despesaId, total: sql<string>`coalesce(sum(${schema.acertoItens.valorAbatido}), 0)` })
      .from(schema.acertoItens)
      .innerJoin(schema.acertos, eq(schema.acertoItens.acertoId, schema.acertos.id))
      .where(and(eq(schema.acertoItens.tenantId, tenantId), inArray(schema.acertoItens.despesaId, ids), eq(schema.acertos.estornado, false)))
      .groupBy(schema.acertoItens.despesaId),
    exec
      .select({
        despesaId: schema.pagamentos.despesaId,
        valorTotalPago: schema.pagamentos.valorTotalPago,
        desconto: schema.pagamentos.desconto,
        multa: schema.pagamentos.multa,
        juros: schema.pagamentos.juros,
        outrosAcrescimos: schema.pagamentos.outrosAcrescimos,
      })
      .from(schema.pagamentos)
      .where(and(eq(schema.pagamentos.tenantId, tenantId), inArray(schema.pagamentos.despesaId, ids))),
  ]);
  const abatido = new Map(abatimentos.map((a) => [a.despesaId, Number(a.total)]));
  const pago = new Map<string, number>();
  for (const p of pagamentos) {
    if (!p.despesaId) continue;
    const principal = principalDoPagamento({
      valorTotalPago: Number(p.valorTotalPago),
      desconto: Number(p.desconto),
      multa: Number(p.multa),
      juros: Number(p.juros),
      outrosAcrescimos: Number(p.outrosAcrescimos),
    });
    pago.set(p.despesaId, (pago.get(p.despesaId) ?? 0) + principal);
  }
  for (const d of despesas) {
    const c = { valor: Number(d.valor), abatidoAtivo: abatido.get(d.id) ?? 0, principalPago: pago.get(d.id) ?? 0 };
    out.set(d.id, { ...c, saldo: saldoRealDaDespesa(c) });
  }
  return out;
}
