"use server";

import { and, eq, ne } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { db, schema } from "@/lib/db";
import { getActiveContext } from "@/lib/context";
import { can } from "@/lib/permissions";
import { logAudit } from "@/lib/audit";
import { reserveDespesaNumber } from "@/lib/db/numbering";
import { abaterFifo, abaterManual, calcularAging } from "@/lib/calc/acerto";
import { statusRestituicao } from "@/lib/calc";
import { valorCompensavel } from "@/lib/calc/recebimento-terceiro";

/**
 * Restituição em LOTE e encontro de contas — itens 4.1, 4.2 e 4.5.
 *
 * O cliente não restitui item a item: ele fecha o combo (paga a fatura inteira
 * do cartão pessoal, por exemplo) e é ressarcido em um único valor. A
 * restituição precisa então ser DISTRIBUÍDA entre os PEDs em aberto daquele
 * terceiro, quitando os mais antigos primeiro (FIFO) e deixando o último
 * parcialmente abatido.
 *
 * A restituição ganha PED próprio: é o documento que vai para a contabilidade
 * como comprovação da saída de caixa. Os PEDs de origem permanecem como custo
 * da obra pago por terceiro, sem saída de caixa própria.
 */

export interface ObrigacaoEmAberto {
  id: string;
  numDoc: string | null;
  competencia: string | null;
  projectName: string | null;
  valorTotal: number;
  valorRestituido: number;
  saldo: number;
  dataPagamentoOriginal: string | null;
  dataPrevistaRestituicao: string | null;
  diasEmAberto: number;
}

/** Dias entre uma data interna e hoje (nunca negativo). */
function diasDesde(base: string | null): number {
  const p = (base ?? "").split("/");
  if (p.length !== 3) return 0;
  const d = Date.UTC(Number(p[2]), Number(p[0]) - 1, Number(p[1]));
  if (!Number.isFinite(d)) return 0;
  const hoje = new Date();
  const h = Date.UTC(hoje.getUTCFullYear(), hoje.getUTCMonth(), hoje.getUTCDate());
  return Math.max(0, Math.round((h - d) / 86_400_000));
}

/** Extrato consolidado de um terceiro, com aging (item 4.1). */
export async function getExtratoTerceiro(terceiroId: string) {
  const ctx = await getActiveContext();
  if (!ctx || !can(ctx.perms, "restituicoes", "ver")) {
    return { obrigacoes: [], totalDevido: 0, totalRestituido: 0, saldo: 0, aging: null };
  }
  const rows = await db
    .select({
      dt: schema.despesaTerceiros,
      numDoc: schema.despesas.numDoc,
      competencia: schema.despesas.competencia,
      projectName: schema.projects.name,
    })
    .from(schema.despesaTerceiros)
    .innerJoin(schema.despesas, eq(schema.despesaTerceiros.despesaId, schema.despesas.id))
    .innerJoin(schema.versions, eq(schema.despesas.versionId, schema.versions.id))
    .innerJoin(schema.projects, eq(schema.versions.projectId, schema.projects.id))
    .where(
      and(
        eq(schema.despesaTerceiros.tenantId, ctx.tenant.id),
        eq(schema.despesaTerceiros.pagadorTerceiroId, terceiroId),
        ne(schema.despesaTerceiros.status, "Cancelado"),
      ),
    );

  const obrigacoes: ObrigacaoEmAberto[] = rows.map((r) => ({
    id: r.dt.id,
    numDoc: r.numDoc,
    competencia: r.competencia,
    projectName: r.projectName,
    valorTotal: Number(r.dt.valorTotal),
    valorRestituido: Number(r.dt.valorRestituido),
    saldo: Math.round((Number(r.dt.valorTotal) - Number(r.dt.valorRestituido)) * 100) / 100,
    dataPagamentoOriginal: r.dt.dataPagamentoOriginal,
    dataPrevistaRestituicao: r.dt.dataPrevistaRestituicao,
    diasEmAberto: diasDesde(r.dt.dataPagamentoOriginal),
  }));

  const totalDevido = obrigacoes.reduce((a, o) => a + o.valorTotal, 0);
  const totalRestituido = obrigacoes.reduce((a, o) => a + o.valorRestituido, 0);
  return {
    obrigacoes: obrigacoes.filter((o) => o.saldo > 0.004),
    totalDevido: Math.round(totalDevido * 100) / 100,
    totalRestituido: Math.round(totalRestituido * 100) / 100,
    saldo: Math.round((totalDevido - totalRestituido) * 100) / 100,
    aging: calcularAging(obrigacoes),
  };
}

/**
 * PREVIEW do que será abatido — exigido antes de confirmar (item 4.1).
 *
 * Nada é gravado aqui. A tela lista exatamente quais PEDs serão abatidos e em
 * que valor, para o usuário conferir antes de assumir a operação.
 */
export async function previewRestituicaoLote(
  terceiroId: string,
  valor: number,
  manuais?: { id: string; valor: number }[],
) {
  const extrato = await getExtratoTerceiro(terceiroId);
  const itens = extrato.obrigacoes.map((o) => ({
    id: o.id,
    competencia: o.competencia,
    numDoc: o.numDoc,
    saldo: o.saldo,
  }));
  const resultado =
    manuais && manuais.length > 0 ? abaterManual(manuais, itens) : abaterFifo(valor, itens);
  const porId = new Map(extrato.obrigacoes.map((o) => [o.id, o]));
  return {
    ...extrato,
    linhas: resultado.abatimentos.map((a) => ({
      ...a,
      numDoc: porId.get(a.id)?.numDoc ?? null,
      competencia: porId.get(a.id)?.competencia ?? null,
      projectName: porId.get(a.id)?.projectName ?? null,
    })),
    totalAbatido: resultado.totalAbatido,
    sobra: resultado.sobra,
  };
}

export interface RestituicaoLoteInput {
  terceiroId: string;
  valor: number;
  dataRestituicao: string;
  bankAccountId?: string | null;
  comprovante?: string | null;
  obs?: string | null;
  /** seleção manual dos PEDs; vazio = FIFO por competência. */
  manuais?: { id: string; valor: number }[];
  idempotencyKey?: string | null;
}

export interface RestituicaoLoteResult {
  ok: boolean;
  error?: string;
  restituicaoId?: string;
  numDoc?: string;
  abatidos?: number;
  jaExistia?: boolean;
}

/**
 * Confirma a restituição em lote (itens 4.1 e 4.2).
 *
 * Uma transação: a saída de caixa, o documento próprio, os vínculos com os PEDs
 * de origem e a atualização de cada saldo acontecem juntos ou não acontecem.
 *
 * NÃO cria despesa nova (RG-03): as despesas já foram reconhecidas nas
 * competências delas. O que acontece aqui é a saída do dinheiro.
 */
export async function confirmarRestituicaoLote(
  input: RestituicaoLoteInput,
): Promise<RestituicaoLoteResult> {
  const ctx = await getActiveContext();
  if (!ctx || !can(ctx.perms, "restituicoes", "editar")) {
    return { ok: false, error: "Sem permissão para registrar restituições." };
  }
  const idem = input.idempotencyKey?.trim() || null;
  if (idem) {
    const [existente] = await db
      .select({ id: schema.restituicoes.id })
      .from(schema.restituicoes)
      .where(
        and(
          eq(schema.restituicoes.tenantId, ctx.tenant.id),
          eq(schema.restituicoes.idempotencyKey, idem),
        ),
      )
      .limit(1);
    if (existente) return { ok: true, restituicaoId: existente.id, jaExistia: true };
  }

  const valor = Math.abs(input.valor);
  if (!(valor > 0)) return { ok: false, error: "Informe um valor maior que zero." };

  try {
    const out = await db.transaction(async (tx) => {
      // Bloqueia as obrigações do terceiro: duas restituições simultâneas não
      // podem abater o mesmo saldo duas vezes.
      const obrigacoes = await tx
        .select()
        .from(schema.despesaTerceiros)
        .where(
          and(
            eq(schema.despesaTerceiros.tenantId, ctx.tenant.id),
            eq(schema.despesaTerceiros.pagadorTerceiroId, input.terceiroId),
            ne(schema.despesaTerceiros.status, "Cancelado"),
          ),
        )
        .for("update");

      const despesaIds = obrigacoes.map((o) => o.despesaId);
      const docs =
        despesaIds.length > 0
          ? await tx
              .select({ id: schema.despesas.id, numDoc: schema.despesas.numDoc, competencia: schema.despesas.competencia })
              .from(schema.despesas)
              .where(eq(schema.despesas.tenantId, ctx.tenant.id))
          : [];
      const docById = new Map(docs.map((d) => [d.id, d]));

      const itens = obrigacoes
        .map((o) => ({
          id: o.id,
          competencia: docById.get(o.despesaId)?.competencia ?? null,
          numDoc: docById.get(o.despesaId)?.numDoc ?? null,
          saldo:
            Math.round((Number(o.valorTotal) - Number(o.valorRestituido)) * 100) / 100,
        }))
        .filter((i) => i.saldo > 0.004);

      const resultado =
        input.manuais && input.manuais.length > 0
          ? abaterManual(input.manuais, itens)
          : abaterFifo(valor, itens);

      if (resultado.abatimentos.length === 0) {
        throw new Error("Não há saldo em aberto para abater com este terceiro.");
      }
      if (resultado.sobra > 0.004) {
        throw new Error(
          `O valor informado excede o saldo devido em ${resultado.sobra.toLocaleString(
            "pt-BR",
            { style: "currency", currency: "BRL" },
          )}. Ajuste o valor da restituição.`,
        );
      }

      // Documento próprio da restituição (item 4.2) — é o que vai à
      // contabilidade como comprovação da saída de caixa.
      const numDoc = await reserveDespesaNumber(ctx.tenant.id);

      // A restituição é ancorada na PRIMEIRA obrigação abatida (a tabela exige
      // um vínculo); os demais PEDs entram por `restituicao_item`.
      const [rest] = await tx
        .insert(schema.restituicoes)
        .values({
          tenantId: ctx.tenant.id,
          despesaTerceiroId: resultado.abatimentos[0].id,
          valor: String(resultado.totalAbatido),
          dataRestituicao: input.dataRestituicao || null,
          bankAccountId: input.bankAccountId || null,
          comprovante: input.comprovante || null,
          obs: `${input.obs ?? ""}${input.obs ? " · " : ""}Restituição em lote ${numDoc}`,
          idempotencyKey: idem,
          usuarioId: ctx.userId,
        })
        .returning();

      for (const a of resultado.abatimentos) {
        await tx.insert(schema.restituicaoItens).values({
          tenantId: ctx.tenant.id,
          restituicaoId: rest.id,
          despesaTerceiroId: a.id,
          valorAbatido: String(a.valorAbatido),
        });
        const o = obrigacoes.find((x) => x.id === a.id)!;
        const restituido = Number(o.valorRestituido) + a.valorAbatido;
        await tx
          .update(schema.despesaTerceiros)
          .set({
            valorRestituido: String(restituido),
            status: statusRestituicao(Number(o.valorTotal), restituido),
          })
          .where(eq(schema.despesaTerceiros.id, a.id));
      }

      // RG-08 — UMA saída de caixa, no valor total restituído.
      await tx.insert(schema.cashEntries).values({
        versionId: ctx.version.id,
        tenantId: ctx.tenant.id,
        bankAccountId: input.bankAccountId || null,
        data: input.dataRestituicao || null,
        descricao: `Restituição a terceiro ${numDoc}`,
        valor: String(-resultado.totalAbatido),
        cat: "restituicao",
        rec: true,
      });

      return { restId: rest.id, numDoc, abatidos: resultado.abatimentos.length, total: resultado.totalAbatido };
    });

    await logAudit({
      tenantId: ctx.tenant.id,
      userId: ctx.userId,
      action: "restituicao.lote",
      entity: "restituicao",
      entityId: out.restId,
      meta: {
        numDoc: out.numDoc,
        terceiroId: input.terceiroId,
        valor: out.total,
        pedsAbatidos: out.abatidos,
        criterio: input.manuais?.length ? "manual" : "FIFO",
      },
    });
    revalidatePath("/restituicoes");
    revalidatePath("/contaspagar");
    revalidatePath("/caixa");
    revalidatePath("/fluxocaixa");
    return {
      ok: true,
      restituicaoId: out.restId,
      numDoc: out.numDoc,
      abatidos: out.abatidos,
    };
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Falha ao registrar a restituição.";
    if (idem && /duplicate key|restituicao_idem_uq/i.test(msg)) {
      const [existente] = await db
        .select({ id: schema.restituicoes.id })
        .from(schema.restituicoes)
        .where(
          and(
            eq(schema.restituicoes.tenantId, ctx.tenant.id),
            eq(schema.restituicoes.idempotencyKey, idem),
          ),
        )
        .limit(1);
      if (existente) return { ok: true, restituicaoId: existente.id, jaExistia: true };
    }
    return { ok: false, error: msg };
  }
}

export interface CompensacaoResult {
  ok: boolean;
  error?: string;
  compensacaoId?: string;
  numDoc?: string;
  valor?: number;
}

/**
 * Encontro de contas com um terceiro — RG-05 / item 4.5.
 *
 * Quando o mesmo terceiro tem, ao mesmo tempo, saldo a restituir (a empresa
 * deve a ele) e saldo a repassar (ele deve à empresa), os dois podem ser
 * compensados.
 *
 * A compensação **não transita pela DRE** e **não move o caixa**: é baixa
 * simultânea de um passivo e de um ativo. Os saldos BRUTOS do momento ficam
 * gravados no documento, para a conferência ver o que existia antes de compensar.
 */
export async function compensarSaldos(input: {
  terceiroId: string;
  data: string;
  obs?: string | null;
  idempotencyKey?: string | null;
}): Promise<CompensacaoResult> {
  const ctx = await getActiveContext();
  if (!ctx || !can(ctx.perms, "restituicoes", "editar")) {
    return { ok: false, error: "Sem permissão para compensar saldos." };
  }
  const idem = input.idempotencyKey?.trim() || null;
  if (idem) {
    const [existente] = await db
      .select({ id: schema.compensacoes.id, numDoc: schema.compensacoes.numDoc })
      .from(schema.compensacoes)
      .where(
        and(
          eq(schema.compensacoes.tenantId, ctx.tenant.id),
          eq(schema.compensacoes.idempotencyKey, idem),
        ),
      )
      .limit(1);
    if (existente)
      return { ok: true, compensacaoId: existente.id, numDoc: existente.numDoc ?? undefined };
  }

  try {
    const out = await db.transaction(async (tx) => {
      const obrigacoes = await tx
        .select()
        .from(schema.despesaTerceiros)
        .where(
          and(
            eq(schema.despesaTerceiros.tenantId, ctx.tenant.id),
            eq(schema.despesaTerceiros.pagadorTerceiroId, input.terceiroId),
            ne(schema.despesaTerceiros.status, "Cancelado"),
          ),
        )
        .for("update");
      const recebimentos = await tx
        .select()
        .from(schema.recebimentosTerceiros)
        .where(
          and(
            eq(schema.recebimentosTerceiros.tenantId, ctx.tenant.id),
            eq(schema.recebimentosTerceiros.recebedorTerceiroId, input.terceiroId),
            ne(schema.recebimentosTerceiros.status, "Cancelado"),
          ),
        )
        .for("update");

      const saldoARestituir =
        Math.round(
          obrigacoes.reduce(
            (a, o) => a + Number(o.valorTotal) - Number(o.valorRestituido),
            0,
          ) * 100,
        ) / 100;
      const saldoARepassar =
        Math.round(
          recebimentos.reduce(
            (a, r) => a + Number(r.valorTotal) - Number(r.valorRepassado),
            0,
          ) * 100,
        ) / 100;

      const valor = valorCompensavel({ saldoARestituir, saldoARepassar });
      if (valor <= 0) {
        throw new Error(
          "Não há o que compensar: é preciso haver saldo nos DOIS lados (a restituir e a repassar).",
        );
      }

      const numDoc = await reserveDespesaNumber(ctx.tenant.id);
      const [comp] = await tx
        .insert(schema.compensacoes)
        .values({
          tenantId: ctx.tenant.id,
          numDoc,
          terceiroId: input.terceiroId,
          valor: String(valor),
          data: input.data || null,
          saldoRestituirAntes: String(saldoARestituir),
          saldoRepassarAntes: String(saldoARepassar),
          obs: input.obs || null,
          idempotencyKey: idem,
          usuarioId: ctx.userId,
        })
        .returning();

      // Abate os dois lados pelo mesmo valor, do mais antigo para o mais novo.
      let restante = valor;
      for (const o of obrigacoes) {
        if (restante <= 0.004) break;
        const saldo = Number(o.valorTotal) - Number(o.valorRestituido);
        if (saldo <= 0.004) continue;
        const abate = Math.min(saldo, restante);
        restante = Math.round((restante - abate) * 100) / 100;
        const novo = Number(o.valorRestituido) + abate;
        await tx
          .update(schema.despesaTerceiros)
          .set({
            valorRestituido: String(novo),
            status: statusRestituicao(Number(o.valorTotal), novo),
            obs: `${o.obs ?? ""}${o.obs ? " · " : ""}Compensado em ${numDoc}`,
          })
          .where(eq(schema.despesaTerceiros.id, o.id));
      }
      restante = valor;
      for (const r of recebimentos) {
        if (restante <= 0.004) break;
        const saldo = Number(r.valorTotal) - Number(r.valorRepassado);
        if (saldo <= 0.004) continue;
        const abate = Math.min(saldo, restante);
        restante = Math.round((restante - abate) * 100) / 100;
        const novo = Number(r.valorRepassado) + abate;
        await tx
          .update(schema.recebimentosTerceiros)
          .set({
            valorRepassado: String(novo),
            status:
              novo + 0.01 >= Number(r.valorTotal)
                ? "Repassado"
                : "Parcialmente repassado",
            obs: `${r.obs ?? ""}${r.obs ? " · " : ""}Compensado em ${numDoc}`,
          })
          .where(eq(schema.recebimentosTerceiros.id, r.id));
      }

      // Nenhum lançamento de caixa: compensar não move dinheiro.
      return { id: comp.id, numDoc, valor, saldoARestituir, saldoARepassar };
    });

    await logAudit({
      tenantId: ctx.tenant.id,
      userId: ctx.userId,
      action: "compensacao.create",
      entity: "compensacao",
      entityId: out.id,
      meta: {
        numDoc: out.numDoc,
        valor: out.valor,
        saldoRestituirAntes: out.saldoARestituir,
        saldoRepassarAntes: out.saldoARepassar,
        // Explícito no log: RG-05 — compensação não transita pela DRE.
        impactoDre: 0,
        impactoCaixa: 0,
      },
    });
    revalidatePath("/restituicoes");
    return { ok: true, compensacaoId: out.id, numDoc: out.numDoc, valor: out.valor };
  } catch (e) {
    return {
      ok: false,
      error: e instanceof Error ? e.message : "Falha ao compensar os saldos.",
    };
  }
}
