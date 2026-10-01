import { and, eq, inArray } from "drizzle-orm";
import { db, schema } from "@/lib/db";
import { logAudit } from "@/lib/audit";
import { saldosReaisDasDespesas } from "@/lib/acerto-saldo";
import { conciliacaoConcluida, estadoDaDespesa, recusaDosVinculos, type ItemDeVinculo } from "@/lib/conciliacao-regras";
import { somaDosVinculosPorMovimento, conciliadoPorDespesa } from "@/lib/conciliacao-vinculos";

/**
 * Núcleo da conciliação com valor (Prompt L, Parte 2), compartilhado pela
 * action da tela, pelo toggle com contraparte e pela importação. Tudo numa
 * transação, com o movimento e as despesas travadas (`FOR UPDATE`).
 *
 * Cada vínculo gera um registro em `pagamento` (é o que o saldo real da
 * despesa lê, §15) — sem saída de caixa nova: o movimento do extrato JÁ É a
 * saída. O status da despesa é DERIVADO (2.5 / BL-3). O movimento só fica
 * `rec` quando os vínculos somam o valor dele (3.1).
 */

export interface Quem {
  tenantId: string;
  userId: string | null;
  userEmail: string | null;
}

export type ResultadoVinculo = { ok: true; vinculoIds: string[]; concluida: boolean; soma: number } | { ok: false; error: string };

type Tx = Parameters<Parameters<typeof db.transaction>[0]>[0];

/** Recalcula e grava o status derivado da despesa (2.5) a partir dos pagamentos e dos vínculos ativos. */
export async function regravarStatusDerivado(tx: Tx, tenantId: string, despesaId: string, dataCaixa: string | null): Promise<ReturnType<typeof estadoDaDespesa>> {
  const [d] = await tx.select().from(schema.despesas).where(and(eq(schema.despesas.id, despesaId), eq(schema.despesas.tenantId, tenantId)));
  const saldos = await saldosReaisDasDespesas(tx, tenantId, [{ id: d.id, valor: d.valor }]);
  const conciliado = (await conciliadoPorDespesa(tx, tenantId, [d.id])).get(d.id) ?? 0;
  const est = estadoDaDespesa({ valor: Number(d.valor), cancelado: d.cancelado, principalPago: saldos.get(d.id)?.principalPago ?? 0, conciliado });
  await tx
    .update(schema.despesas)
    .set({ status: est.statusGravado, dataCaixa: est.statusGravado === "A pagar" ? null : (dataCaixa ?? d.dataCaixa) })
    .where(eq(schema.despesas.id, d.id));
  return est;
}

export async function gravarVinculos(quem: Quem, input: { cashEntryId: string; itens: ItemDeVinculo[]; origem?: "manual" | "importacao" | "assistente" }): Promise<ResultadoVinculo> {
  try {
    return await db.transaction(async (tx) => {
      const [mov] = await tx
        .select()
        .from(schema.cashEntries)
        .where(and(eq(schema.cashEntries.id, input.cashEntryId), eq(schema.cashEntries.tenantId, quem.tenantId)))
        .for("update");
      if (!mov) return { ok: false as const, error: "Movimento não encontrado." };
      const valorMov = Number(mov.valor);
      if (!(valorMov < 0)) return { ok: false as const, error: "Só uma saída do extrato concilia despesas." };
      if (mov.conciliadoContaReceberId) return { ok: false as const, error: "Este movimento já está conciliado com uma conta a receber." };
      if (mov.cat === "ajuste") return { ok: false as const, error: "Ajuste de caixa não se concilia com despesa." };
      const jaVinculado = (await somaDosVinculosPorMovimento(tx, quem.tenantId, [mov.id])).get(mov.id) ?? 0;
      if (mov.rec && jaVinculado <= 0 && !mov.conciliadoDespesaId) {
        // BL-2 — marcado como conciliado sem lastro: vincular dá o lastro, não duplica nada.
      } else if (mov.rec && conciliacaoConcluida(valorMov, jaVinculado)) {
        return { ok: false as const, error: "Este movimento já está inteiramente conciliado. Desfaça a conciliação antes de vincular outra despesa." };
      }
      const recusa = recusaDosVinculos(valorMov, jaVinculado, input.itens);
      if (recusa) return { ok: false as const, error: recusa };

      const ids = input.itens.map((i) => i.despesaId);
      const despesas = await tx
        .select()
        .from(schema.despesas)
        .where(and(eq(schema.despesas.tenantId, quem.tenantId), inArray(schema.despesas.id, ids)))
        .for("update");
      if (despesas.length !== ids.length) return { ok: false as const, error: "Despesa não encontrada nesta empresa." };
      const saldos = await saldosReaisDasDespesas(tx, quem.tenantId, despesas.map((d) => ({ id: d.id, valor: d.valor })));
      for (const d of despesas) {
        if (d.cancelado) return { ok: false as const, error: `A despesa ${d.numDoc ?? ""} está cancelada.` };
        const item = input.itens.find((i) => i.despesaId === d.id)!;
        const saldo = saldos.get(d.id)?.saldo ?? Number(d.valor);
        if (item.valor > saldo + 0.01) {
          return { ok: false as const, error: `O vínculo de ${item.valor.toLocaleString("pt-BR", { style: "currency", currency: "BRL" })} excede o saldo da despesa ${d.numDoc ?? ""} (${saldo.toLocaleString("pt-BR", { style: "currency", currency: "BRL" })}). Para uma diferença com causa (multa, juro, tarifa), lance a despesa própria e vincule-a também.` };
        }
      }

      const vinculoIds: string[] = [];
      const criadoPor = quem.userEmail || quem.userId || null;
      for (const d of despesas) {
        const item = input.itens.find((i) => i.despesaId === d.id)!;
        const [pag] = await tx
          .insert(schema.pagamentos)
          .values({
            tenantId: quem.tenantId,
            parcelaId: null,
            despesaId: d.id,
            valorOriginal: d.valor,
            valorTotalPago: String(item.valor),
            dataPagamento: mov.data ?? "",
            bankAccountId: mov.bankAccountId,
            obs: `Conciliação do extrato${mov.descricao ? " · " + mov.descricao : ""}`,
            usuarioId: quem.userId,
          })
          .returning({ id: schema.pagamentos.id });
        const [v] = await tx
          .insert(schema.conciliacoesDespesa)
          .values({ tenantId: quem.tenantId, cashEntryId: mov.id, despesaId: d.id, pagamentoId: pag.id, valor: String(item.valor), origem: input.origem ?? "manual", criadoPor })
          .returning({ id: schema.conciliacoesDespesa.id });
        vinculoIds.push(v.id);
        if (!d.bancoId && mov.bankAccountId) await tx.update(schema.despesas).set({ bancoId: mov.bankAccountId }).where(eq(schema.despesas.id, d.id));
        await regravarStatusDerivado(tx, quem.tenantId, d.id, mov.data);
      }
      const soma = Math.round((jaVinculado + input.itens.reduce((a, i) => a + i.valor, 0)) * 100) / 100;
      const concluida = conciliacaoConcluida(valorMov, soma);
      // 2.8 — as quatro colunas antigas continuam gravadas: a primeira despesa vinculada.
      await tx
        .update(schema.cashEntries)
        .set({ rec: concluida, conciliadoDespesaId: mov.conciliadoDespesaId ?? despesas[0].id, conciliadoPor: criadoPor, conciliadoEm: new Date().toISOString() })
        .where(eq(schema.cashEntries.id, mov.id));
      await logAudit(
        {
          tenantId: quem.tenantId,
          userId: quem.userId,
          action: "conciliacao.create",
          entity: "cash_entry",
          entityId: mov.id,
          meta: { data: mov.data, valor: valorMov, itens: input.itens.map((i) => ({ despesaId: i.despesaId, numDoc: despesas.find((d) => d.id === i.despesaId)?.numDoc ?? null, valor: i.valor })), somaAntes: jaVinculado, somaDepois: soma, concluida, origem: input.origem ?? "manual" },
        },
        tx,
      );
      return { ok: true as const, vinculoIds, concluida, soma };
    });
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "Falha ao conciliar." };
  }
}

/**
 * 5 — desfazer: estorno lógico dos vínculos do movimento (quem, quando, por
 * quê), remoção dos pagamentos que eles geraram, status derivado recalculado
 * e o movimento liberado. O movimento do extrato é PRESERVADO (5.3). O
 * caminho antigo (só as quatro colunas, sem vínculo) continua como era.
 */
export async function desfazerVinculosDoMovimento(quem: Quem, cashEntryId: string, motivo: string | null): Promise<{ ok: true; desfeitos: number } | { ok: false; error: string }> {
  try {
    return await db.transaction(async (tx) => {
      const [mov] = await tx
        .select()
        .from(schema.cashEntries)
        .where(and(eq(schema.cashEntries.id, cashEntryId), eq(schema.cashEntries.tenantId, quem.tenantId)))
        .for("update");
      if (!mov) return { ok: false as const, error: "Movimento não encontrado." };
      const ativos = await tx
        .select()
        .from(schema.conciliacoesDespesa)
        .where(and(eq(schema.conciliacoesDespesa.tenantId, quem.tenantId), eq(schema.conciliacoesDespesa.cashEntryId, mov.id), eq(schema.conciliacoesDespesa.desfeito, false)))
        .for("update");
      const agora = new Date().toISOString();
      const quemFez = quem.userEmail || quem.userId || null;
      const pagamentosRemovidos: { despesaId: string; valor: number }[] = [];
      for (const v of ativos) {
        await tx.update(schema.conciliacoesDespesa).set({ desfeito: true, desfeitoEm: agora, desfeitoPor: quemFez, motivoDesfazer: motivo?.trim() || null }).where(eq(schema.conciliacoesDespesa.id, v.id));
        if (v.pagamentoId) {
          await tx.delete(schema.pagamentos).where(and(eq(schema.pagamentos.id, v.pagamentoId), eq(schema.pagamentos.tenantId, quem.tenantId)));
          pagamentosRemovidos.push({ despesaId: v.despesaId, valor: Number(v.valor) });
        }
        await regravarStatusDerivado(tx, quem.tenantId, v.despesaId, null);
      }
      if (ativos.length === 0 && mov.conciliadoDespesaId) {
        // Caminho antigo (sem vínculo com valor): a despesa volta para "A pagar", como antes.
        await tx.update(schema.despesas).set({ status: "A pagar", dataCaixa: null }).where(and(eq(schema.despesas.id, mov.conciliadoDespesaId), eq(schema.despesas.tenantId, quem.tenantId)));
      }
      await tx
        .update(schema.cashEntries)
        .set({ rec: false, conciliadoDespesaId: null, conciliadoPor: null, conciliadoEm: null })
        .where(eq(schema.cashEntries.id, mov.id));
      await logAudit(
        {
          tenantId: quem.tenantId,
          userId: quem.userId,
          action: "conciliacao.undo",
          entity: "cash_entry",
          entityId: mov.id,
          meta: { data: mov.data, valor: Number(mov.valor), despesaId: mov.conciliadoDespesaId, vinculosDesfeitos: ativos.map((v) => ({ id: v.id, despesaId: v.despesaId, valor: Number(v.valor) })), pagamentosRemovidos, motivo: motivo?.trim() || null },
        },
        tx,
      );
      return { ok: true as const, desfeitos: ativos.length };
    });
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "Falha ao desfazer a conciliação." };
  }
}
