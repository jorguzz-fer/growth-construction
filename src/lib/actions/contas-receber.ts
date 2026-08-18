"use server";

import { and, eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { db, schema } from "@/lib/db";
import { getActiveContext } from "@/lib/context";
import { can } from "@/lib/permissions";
import { logAudit } from "@/lib/audit";
import {
  CAT_BAIXA_RECEBER,
  aposEstorno,
  baixaCabe,
  origemDaBaixa,
  podeBaixar,
  saldoAReceber,
  statusAposBaixa,
} from "@/lib/calc/baixa-receber";

/** Valor monetário BR/US em texto → string numérica ("1.000,50"→"1000.5"). */
function normValor(v: string | null | undefined): string {
  const s = (v ?? "").trim();
  if (!s) return "0";
  let t = s.replace(/[R$\s]/g, "");
  t = /,\d{1,2}$/.test(t) ? t.replace(/\./g, "").replace(",", ".") : t.replace(/,/g, "");
  const n = Number(t);
  return Number.isFinite(n) ? String(n) : "0";
}
const clean = (v: string | null | undefined) => {
  const s = (v ?? "").trim();
  return s ? s : null;
};

/**
 * Cria uma conta a receber. Exige vínculo com um projeto. Se o tipo for
 * "Outras Receitas", exige uma descrição que identifique a origem/natureza.
 * Pode nascer vinculada a um item do extrato (origemCashEntryId — item 6).
 */
export async function createContaReceber(formData: FormData) {
  const ctx = await getActiveContext();
  if (!ctx || !can(ctx.perms, "contasreceber", "criar")) {
    throw new Error("Sem permissão para criar contas a receber.");
  }
  const projectId = (formData.get("projectId") as string) || "";
  if (!projectId || !ctx.projects.some((p) => p.id === projectId)) {
    throw new Error("Selecione um projeto para a conta a receber.");
  }
  const tipo = (formData.get("tipo") as string) || "Outros";
  const descricao = clean(formData.get("descricao") as string);
  if (tipo === "Outras Receitas" && !descricao) {
    throw new Error('Para "Outras Receitas", informe uma descrição da origem/natureza da receita.');
  }
  // Trava contra receita de valor ZERO (receita fantasma nos relatórios).
  const valorCR = Number(normValor(formData.get("valor") as string));
  if (!Number.isFinite(valorCR) || valorCR === 0) {
    throw new Error("Informe um valor maior que zero para a conta a receber.");
  }
  const [row] = await db
    .insert(schema.contasReceber)
    .values({
      tenantId: ctx.tenant.id,
      projectId,
      unitCode: clean(formData.get("unitCode") as string),
      clienteId: clean(formData.get("clienteId") as string),
      descricao,
      tipo,
      valor: normValor(formData.get("valor") as string),
      vencimento: clean(formData.get("vencimento") as string),
      status: "A receber",
      bancoId: clean(formData.get("bancoId") as string),
      origemCashEntryId: clean(formData.get("origemCashEntryId") as string),
      createdBy: ctx.userEmail || ctx.userId || null,
    })
    .returning();
  await logAudit({
    tenantId: ctx.tenant.id,
    userId: ctx.userId,
    action: "contaReceber.create",
    entity: "conta_receber",
    entityId: row.id,
    meta: { projectId, tipo, valor: row.valor },
  });
  revalidatePath("/contasreceber");
}

/** Atualiza uma conta a receber (consulta/edição — item 5). */
export async function updateContaReceber(formData: FormData) {
  const ctx = await getActiveContext();
  if (!ctx || !can(ctx.perms, "contasreceber", "editar")) {
    throw new Error("Sem permissão para editar contas a receber.");
  }
  const id = (formData.get("id") as string) || "";
  if (!id) return;
  const tipo = (formData.get("tipo") as string) || "Outros";
  const descricao = clean(formData.get("descricao") as string);
  if (tipo === "Outras Receitas" && !descricao) {
    throw new Error('Para "Outras Receitas", informe uma descrição da origem/natureza da receita.');
  }
  const projectId = (formData.get("projectId") as string) || "";
  if (projectId && !ctx.projects.some((p) => p.id === projectId)) {
    throw new Error("Projeto inválido.");
  }
  const set: Partial<typeof schema.contasReceber.$inferInsert> = {
    tipo,
    descricao,
    valor: normValor(formData.get("valor") as string),
    vencimento: clean(formData.get("vencimento") as string),
    unitCode: clean(formData.get("unitCode") as string),
    clienteId: clean(formData.get("clienteId") as string),
    bancoId: clean(formData.get("bancoId") as string),
    dataRecebimento: clean(formData.get("dataRecebimento") as string),
    valorRecebido: normValor(formData.get("valorRecebido") as string),
    status: (formData.get("status") as string) || "A receber",
  };
  if (projectId) set.projectId = projectId;
  await db
    .update(schema.contasReceber)
    .set(set)
    .where(and(eq(schema.contasReceber.id, id), eq(schema.contasReceber.tenantId, ctx.tenant.id)));
  await logAudit({
    tenantId: ctx.tenant.id,
    userId: ctx.userId,
    action: "contaReceber.update",
    entity: "conta_receber",
    entityId: id,
    meta: { changes: set },
  });
  revalidatePath("/contasreceber");
}

/** Cancelamento lógico (preserva histórico e a rastreabilidade). */
export async function cancelarContaReceber(formData: FormData) {
  const ctx = await getActiveContext();
  if (!ctx || !can(ctx.perms, "contasreceber", "excluir")) {
    throw new Error("Sem permissão.");
  }
  const id = (formData.get("id") as string) || "";
  if (!id) return;
  await db
    .update(schema.contasReceber)
    .set({ cancelado: true, status: "Cancelada" })
    .where(and(eq(schema.contasReceber.id, id), eq(schema.contasReceber.tenantId, ctx.tenant.id)));
  await logAudit({
    tenantId: ctx.tenant.id,
    userId: ctx.userId,
    action: "contaReceber.cancel",
    entity: "conta_receber",
    entityId: id,
  });
  revalidatePath("/contasreceber");
}

// ─────────────────────────── Baixa / confirmação ───────────────────────────

/**
 * Confirma o recebimento (dá baixa) de uma conta a receber.
 *
 * O QUE ISSO É, CONTABILMENTE: um evento de CAIXA, e só. A baixa tira o valor de
 * "a receber" e o põe no banco. Nenhuma linha de receita é criada aqui (RG-01):
 * a DRE apura receita por competência, a partir do plano de pagamento da venda,
 * no mês do vencimento — nunca pela data em que o dinheiro caiu na conta.
 *
 * Efeitos:
 *  1. cria a ENTRADA no Controle de Caixa (valor positivo, na data informada),
 *     já marcada como conciliada e vinculada à conta — é ela que aparece no
 *     Fluxo de Caixa Realizado;
 *  2. acumula o valor recebido na conta e recalcula o status;
 *  3. registra em auditoria quem baixou, quando e quanto.
 *
 * Devolve `{ ok, error }` em vez de lançar: em produção o Next.js esconde a
 * mensagem de erro lançado por Server Action, e o usuário precisa ler o motivo.
 */
export async function baixarContaReceber(input: {
  contaId: string;
  valor: number;
  data: string; // "MM/DD/YYYY"
  bancoId?: string | null;
  obs?: string | null;
}): Promise<{ ok: boolean; error?: string; status?: string; saldo?: number }> {
  const ctx = await getActiveContext();
  if (!ctx || !can(ctx.perms, "contasreceber", "editar")) {
    return { ok: false, error: "Sem permissão para dar baixa em contas a receber." };
  }
  if (ctx.version.locked) {
    return { ok: false, error: "Versão congelada — não é possível registrar recebimentos." };
  }
  if (!input.contaId) return { ok: false, error: "Conta a receber não informada." };

  const [cr] = await db
    .select()
    .from(schema.contasReceber)
    .where(
      and(
        eq(schema.contasReceber.id, input.contaId),
        eq(schema.contasReceber.tenantId, ctx.tenant.id),
      ),
    )
    .limit(1);
  if (!cr) return { ok: false, error: "Conta a receber não encontrada." };

  const valorConta = Number(cr.valor);
  const jaRecebido = Number(cr.valorRecebido);
  const permitido = podeBaixar(valorConta, jaRecebido, cr.cancelado);
  if (!permitido.ok) return { ok: false, error: permitido.motivo };

  const valor = Number(input.valor);
  if (!baixaCabe(valorConta, jaRecebido, valor)) {
    const saldo = saldoAReceber(valorConta, jaRecebido);
    return {
      ok: false,
      error:
        valor > 0
          ? `Valor acima do saldo em aberto (saldo: ${saldo.toFixed(2)}). Ajuste o valor ou edite a conta.`
          : "Informe um valor maior que zero para a baixa.",
    };
  }
  const data = clean(input.data);
  if (!data) return { ok: false, error: "Informe a data do recebimento." };

  const bancoId = clean(input.bancoId);
  const novoRecebido = Math.round((jaRecebido + valor) * 100) / 100;
  const status = statusAposBaixa(valorConta, novoRecebido);
  const agora = new Date().toISOString();
  const obs = clean(input.obs);

  // 1) Entrada REAL no Controle de Caixa. `cat` marca a origem: é o que permite
  //    estornar esta baixa aqui sem nunca tocar num movimento vindo do extrato.
  const [mov] = await db
    .insert(schema.cashEntries)
    .values({
      versionId: ctx.version.id,
      tenantId: ctx.tenant.id,
      bankAccountId: bancoId,
      data,
      descricao:
        obs ??
        `Recebimento: ${cr.descricao ?? cr.unitCode ?? cr.tipo}`,
      valor: String(Math.abs(valor)),
      cat: CAT_BAIXA_RECEBER,
      unitCode: cr.unitCode,
      rec: true,
      conciliadoContaReceberId: cr.id,
      conciliadoPor: ctx.userEmail || ctx.userId || null,
      conciliadoEm: agora,
    })
    .returning();

  // 2) Acumula na conta e recalcula o status.
  await db
    .update(schema.contasReceber)
    .set({
      valorRecebido: String(novoRecebido),
      status,
      dataRecebimento: data,
      bancoId: bancoId ?? cr.bancoId,
    })
    .where(eq(schema.contasReceber.id, cr.id));

  await logAudit({
    tenantId: ctx.tenant.id,
    userId: ctx.userId,
    action: "contaReceber.baixa",
    entity: "conta_receber",
    entityId: cr.id,
    meta: {
      cashEntryId: mov.id,
      valor,
      data,
      bancoId,
      statusAnterior: cr.status,
      status,
      valorRecebidoAnterior: jaRecebido,
      valorRecebido: novoRecebido,
    },
  });
  revalidatePath("/contasreceber");
  revalidatePath("/caixa");
  revalidatePath("/fluxocaixa");
  revalidatePath("/dre");
  return { ok: true, status, saldo: saldoAReceber(valorConta, novoRecebido) };
}

/**
 * Estorna uma baixa MANUAL feita nesta tela: remove a entrada de caixa que ela
 * criou e devolve a conta ao estado anterior.
 *
 * Só alcança movimentos criados pela própria baixa (`cat = "recebimento"`).
 * Movimento vindo do extrato bancário é fato do banco: existe independentemente
 * desta conta e é desfeito na tela do Caixa Diário, com "Desfazer conciliação".
 * Antes de remover, a linha inteira do movimento vai para a auditoria — o
 * lançamento é reconstituível a partir do log.
 */
export async function estornarBaixaContaReceber(input: {
  contaId: string;
  cashEntryId: string;
}): Promise<{ ok: boolean; error?: string }> {
  const ctx = await getActiveContext();
  if (!ctx || !can(ctx.perms, "contasreceber", "editar")) {
    return { ok: false, error: "Sem permissão para estornar recebimentos." };
  }
  if (ctx.version.locked) {
    return { ok: false, error: "Versão congelada — não é possível estornar recebimentos." };
  }
  const [mov] = await db
    .select()
    .from(schema.cashEntries)
    .where(
      and(
        eq(schema.cashEntries.id, input.cashEntryId),
        eq(schema.cashEntries.tenantId, ctx.tenant.id),
      ),
    )
    .limit(1);
  if (!mov) return { ok: false, error: "Movimento de caixa não encontrado." };
  if (mov.conciliadoContaReceberId !== input.contaId) {
    return { ok: false, error: "Este movimento não pertence a esta conta a receber." };
  }
  if (origemDaBaixa(mov.cat) !== "manual") {
    return {
      ok: false,
      error:
        "Este recebimento veio do extrato bancário. Desfaça no Caixa Diário, em “Desfazer conciliação”.",
    };
  }
  const [cr] = await db
    .select()
    .from(schema.contasReceber)
    .where(
      and(
        eq(schema.contasReceber.id, input.contaId),
        eq(schema.contasReceber.tenantId, ctx.tenant.id),
      ),
    )
    .limit(1);
  if (!cr) return { ok: false, error: "Conta a receber não encontrada." };

  const estorno = aposEstorno(Number(cr.valor), Number(cr.valorRecebido), Number(mov.valor));

  await logAudit({
    tenantId: ctx.tenant.id,
    userId: ctx.userId,
    action: "contaReceber.baixa.estorno",
    entity: "conta_receber",
    entityId: cr.id,
    // Linha inteira do movimento removido: o lançamento é reconstituível daqui.
    meta: {
      movimentoRemovido: {
        id: mov.id,
        versionId: mov.versionId,
        bankAccountId: mov.bankAccountId,
        data: mov.data,
        descricao: mov.descricao,
        valor: mov.valor,
        cat: mov.cat,
        unitCode: mov.unitCode,
        conciliadoPor: mov.conciliadoPor,
        conciliadoEm: mov.conciliadoEm,
      },
      statusAnterior: cr.status,
      status: estorno.status,
      valorRecebidoAnterior: Number(cr.valorRecebido),
      valorRecebido: estorno.valorRecebido,
    },
  });

  await db.delete(schema.cashEntries).where(eq(schema.cashEntries.id, mov.id));
  await db
    .update(schema.contasReceber)
    .set({
      valorRecebido: String(estorno.valorRecebido),
      status: estorno.status,
      dataRecebimento: estorno.valorRecebido <= 0 ? null : cr.dataRecebimento,
    })
    .where(eq(schema.contasReceber.id, cr.id));

  revalidatePath("/contasreceber");
  revalidatePath("/caixa");
  revalidatePath("/fluxocaixa");
  revalidatePath("/dre");
  return { ok: true };
}
