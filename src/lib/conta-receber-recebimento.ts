import "server-only";
import { and, eq } from "drizzle-orm";
import { db, schema } from "@/lib/db";
import { logAudit } from "@/lib/audit";
import { estadoDaConta, motivoDeRecusaDoRecebimento, TOLERANCIA_CENTAVOS, type NovoRecebimento } from "@/lib/conta-receber-estado";

/**
 * Baixa e conciliação de conta a receber — a parte que grava, compartilhada
 * pela tela de Contas a Receber (`registrarRecebimento`) e pelo Caixa
 * (`conciliarContaReceber`, `pairMovimento`). Uma regra só (Prompt K, BK-1):
 * uma linha em `conta_receber_recebimento` por recebimento, com valor próprio;
 * o estado da conta é recalculado a partir das linhas ativas e gravado como
 * cache em `status`/`valor_recebido`/`data_recebimento`.
 */

export interface Quem {
  tenantId: string;
  userId: string | null;
  userEmail: string | null;
}

export type Resultado = { ok: true; id: string } | { ok: false; error: string };

type Tx = Parameters<Parameters<typeof db.transaction>[0]>[0];

const round2 = (v: number) => Math.round(v * 100) / 100;

/** Recalcula e grava o cache do estado da conta a partir dos recebimentos ativos. */
export async function recalcularConta(tx: Tx, tenantId: string, contaId: string): Promise<ReturnType<typeof estadoDaConta>> {
  const [conta] = await tx
    .select({ valor: schema.contasReceber.valor, cancelado: schema.contasReceber.cancelado })
    .from(schema.contasReceber)
    .where(and(eq(schema.contasReceber.id, contaId), eq(schema.contasReceber.tenantId, tenantId)))
    .limit(1);
  if (!conta) throw new Error("Conta a receber não encontrada.");
  const linhas = await tx
    .select()
    .from(schema.contaReceberRecebimentos)
    .where(and(eq(schema.contaReceberRecebimentos.contaReceberId, contaId), eq(schema.contaReceberRecebimentos.tenantId, tenantId)));
  const estado = estadoDaConta({
    valor: Number(conta.valor),
    cancelado: conta.cancelado,
    recebimentos: linhas.map((l) => ({ id: l.id, valor: Number(l.valor), data: l.data, cashEntryId: l.cashEntryId, estornado: l.estornado })),
  });
  const ativos = linhas.filter((l) => !l.estornado);
  const ultimaData = ativos.map((l) => l.data).filter((d): d is string => !!d).sort((a, b) => (a.slice(6) + a.slice(0, 5)).localeCompare(b.slice(6) + b.slice(0, 5))).at(-1) ?? null;
  await tx
    .update(schema.contasReceber)
    .set({ valorRecebido: String(estado.recebido), status: estado.statusGravado, dataRecebimento: ultimaData })
    .where(and(eq(schema.contasReceber.id, contaId), eq(schema.contasReceber.tenantId, tenantId)));
  return estado;
}

/** Quanto a linha do extrato ainda tem livre para vínculos (4.2). */
export async function disponivelNoMovimento(tx: Tx, tenantId: string, cashEntryId: string): Promise<{ valor: number; disponivel: number; mov: typeof schema.cashEntries.$inferSelect } | null> {
  const [mov] = await tx
    .select()
    .from(schema.cashEntries)
    .where(and(eq(schema.cashEntries.id, cashEntryId), eq(schema.cashEntries.tenantId, tenantId)))
    .limit(1);
  if (!mov) return null;
  const vinculos = await tx
    .select({ valor: schema.contaReceberRecebimentos.valor })
    .from(schema.contaReceberRecebimentos)
    .where(and(eq(schema.contaReceberRecebimentos.cashEntryId, cashEntryId), eq(schema.contaReceberRecebimentos.tenantId, tenantId), eq(schema.contaReceberRecebimentos.estornado, false)));
  const usado = vinculos.reduce((a, v) => a + Number(v.valor), 0);
  const valor = Number(mov.valor);
  return { valor, disponivel: round2(valor - usado), mov };
}

/**
 * Grava um recebimento (baixa manual ou conciliação) dentro de uma transação,
 * com a conta travada. Devolve o id da linha ou a recusa legível.
 */
export async function gravarRecebimento(
  quem: Quem,
  input: NovoRecebimento & { contaReceberId: string; idempotencyKey?: string | null },
): Promise<Resultado> {
  if (input.idempotencyKey) {
    const [repetido] = await db
      .select({ id: schema.contaReceberRecebimentos.id })
      .from(schema.contaReceberRecebimentos)
      .where(and(eq(schema.contaReceberRecebimentos.tenantId, quem.tenantId), eq(schema.contaReceberRecebimentos.idempotencyKey, input.idempotencyKey)))
      .limit(1);
    if (repetido) return { ok: true, id: repetido.id };
  }
  try {
    return await db.transaction(async (tx) => {
      const [conta] = await tx
        .select()
        .from(schema.contasReceber)
        .where(and(eq(schema.contasReceber.id, input.contaReceberId), eq(schema.contasReceber.tenantId, quem.tenantId)))
        .for("update");
      if (!conta) return { ok: false as const, error: "Conta a receber não encontrada." };
      if (conta.cancelado) return { ok: false as const, error: "Conta a receber cancelada." };
      const antes = await recalcularConta(tx, quem.tenantId, conta.id);
      let disponivel: number | null = null;
      let mov: typeof schema.cashEntries.$inferSelect | null = null;
      if (input.cashEntryId) {
        const d = await disponivelNoMovimento(tx, quem.tenantId, input.cashEntryId);
        if (!d) return { ok: false as const, error: "Linha do extrato não encontrada nesta empresa." };
        if (d.valor <= 0) return { ok: false as const, error: "Só uma entrada do extrato concilia um recebimento." };
        if (d.mov.conciliadoDespesaId) return { ok: false as const, error: "Esta linha do extrato já está conciliada com uma despesa." };
        disponivel = d.disponivel;
        mov = d.mov;
      }
      const motivo = motivoDeRecusaDoRecebimento(input, { saldo: antes.saldo, disponivelNoMovimento: disponivel });
      if (motivo) return { ok: false as const, error: motivo };
      const [linha] = await tx
        .insert(schema.contaReceberRecebimentos)
        .values({
          tenantId: quem.tenantId,
          contaReceberId: conta.id,
          valor: String(round2(input.valor)),
          data: input.data,
          forma: input.forma,
          cashEntryId: input.cashEntryId,
          justificativa: (input.justificativa ?? "").trim() || null,
          idempotencyKey: input.idempotencyKey ?? null,
          createdBy: quem.userEmail || quem.userId || null,
        })
        .returning({ id: schema.contaReceberRecebimentos.id });
      const depois = await recalcularConta(tx, quem.tenantId, conta.id);
      if (mov) {
        // 4.5 — os campos antigos do vínculo 1:1 continuam gravados (descontinuados, nunca removidos).
        await tx
          .update(schema.cashEntries)
          .set({
            rec: true,
            conciliadoContaReceberId: mov.conciliadoContaReceberId ?? conta.id,
            conciliadoPor: quem.userEmail || quem.userId || null,
            conciliadoEm: new Date().toISOString(),
          })
          .where(and(eq(schema.cashEntries.id, mov.id), eq(schema.cashEntries.tenantId, quem.tenantId)));
        if (!conta.bancoId && mov.bankAccountId) {
          await tx.update(schema.contasReceber).set({ bancoId: mov.bankAccountId }).where(eq(schema.contasReceber.id, conta.id));
        }
      }
      await logAudit(
        {
          tenantId: quem.tenantId,
          userId: quem.userId,
          action: mov ? "contaReceber.conciliar" : "contaReceber.baixa",
          entity: "conta_receber",
          entityId: conta.id,
          meta: {
            recebimentoId: linha.id,
            valor: round2(input.valor),
            data: input.data,
            forma: input.forma,
            justificativa: (input.justificativa ?? "").trim() || null,
            cashEntryId: input.cashEntryId,
            estado: depois.estado,
            saldo: depois.saldo,
            residuo: depois.residuo || undefined,
          },
        },
        tx,
      );
      return { ok: true as const, id: linha.id };
    });
  } catch (e) {
    console.error("[contasreceber] falha ao gravar recebimento:", e);
    return { ok: false, error: e instanceof Error ? e.message : "Falha ao registrar o recebimento." };
  }
}

/** 4.3 — desfazer é estorno lógico, com quem, quando e por quê. Nunca exclusão. */
export async function estornarRecebimentoDb(quem: Quem, recebimentoId: string, motivo: string): Promise<Resultado> {
  if (!motivo.trim()) return { ok: false, error: "Informe o motivo do estorno." };
  try {
    return await db.transaction(async (tx) => {
      const [linha] = await tx
        .select()
        .from(schema.contaReceberRecebimentos)
        .where(and(eq(schema.contaReceberRecebimentos.id, recebimentoId), eq(schema.contaReceberRecebimentos.tenantId, quem.tenantId)))
        .for("update");
      if (!linha) return { ok: false as const, error: "Recebimento não encontrado." };
      if (linha.estornado) return { ok: false as const, error: "Este recebimento já foi estornado." };
      await tx
        .update(schema.contaReceberRecebimentos)
        .set({ estornado: true, estornadoEm: new Date().toISOString(), estornadoPor: quem.userEmail || quem.userId || null, motivoEstorno: motivo.trim() })
        .where(eq(schema.contaReceberRecebimentos.id, linha.id));
      const depois = await recalcularConta(tx, quem.tenantId, linha.contaReceberId);
      if (linha.cashEntryId) {
        // O movimento volta a "não conciliado" só quando nenhum vínculo ativo sobrar nele.
        const d = await disponivelNoMovimento(tx, quem.tenantId, linha.cashEntryId);
        if (d && Math.abs(d.disponivel - d.valor) < TOLERANCIA_CENTAVOS) {
          await tx
            .update(schema.cashEntries)
            .set({ rec: false, conciliadoContaReceberId: null, conciliadoPor: null, conciliadoEm: null })
            .where(and(eq(schema.cashEntries.id, linha.cashEntryId), eq(schema.cashEntries.tenantId, quem.tenantId)));
        }
      }
      await logAudit(
        {
          tenantId: quem.tenantId,
          userId: quem.userId,
          action: "contaReceber.estornoRecebimento",
          entity: "conta_receber",
          entityId: linha.contaReceberId,
          meta: { recebimentoId: linha.id, valor: Number(linha.valor), forma: linha.forma, cashEntryId: linha.cashEntryId, motivo: motivo.trim(), estado: depois.estado },
        },
        tx,
      );
      return { ok: true as const, id: linha.id };
    });
  } catch (e) {
    console.error("[contasreceber] falha ao estornar recebimento:", e);
    return { ok: false, error: e instanceof Error ? e.message : "Falha ao estornar." };
  }
}
