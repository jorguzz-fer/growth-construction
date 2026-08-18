"use server";

import { and, eq, inArray, ne } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { db, schema } from "@/lib/db";
import { getActiveContext } from "@/lib/context";
import { can } from "@/lib/permissions";
import { logAudit } from "@/lib/audit";
import { reserveDespesaNumber } from "@/lib/db/numbering";
import {
  abaterFifo,
  abaterManual,
  acertoFecha,
  calcularDiferenca,
  calcularRateio,
  validarRateio,
  type LinhaRateio,
} from "@/lib/calc/acerto";
import { CONTAS_CONTROLADORIA } from "@/lib/calc/constants";
import type { CategoriaDRE } from "@/lib/calc/constants";
import { getAtualVersion } from "@/lib/queries";

/**
 * ACERTO CONTÁBIL — Módulo 5.
 *
 * Resolve os dois casos que o sistema não suportava:
 *   (a) um pagamento único quitando várias despesas, de várias obras;
 *   (b) a diferença entre o somatório das despesas e o valor transferido.
 *
 * Invariantes (RG-07 e RG-08):
 *   - a saída de caixa é UMA, no valor efetivamente transferido;
 *   - soma dos abatimentos + diferença financeira == valor transferido;
 *   - a diferença vai para despesa/receita FINANCEIRA do período, jamais
 *     rateada no custo das obras.
 */

export interface DespesaAbativel {
  id: string;
  numDoc: string | null;
  projectId: string;
  projectName: string;
  fornecedorId: string | null;
  fornecedorNome: string | null;
  competencia: string | null;
  vencimento: string | null;
  valor: number;
  /** quanto ainda falta pagar (valor − já abatido por outros acertos). */
  saldo: number;
  status: string | null;
}

/**
 * Despesas em aberto que podem ser vinculadas a um acerto.
 *
 * Traz de TODAS as obras do tenant de propósito (item 5.1): o pagamento único
 * que motiva este módulo cruza obras. Já descontado o que outros acertos
 * abateram, para o mesmo PED não ser pago duas vezes.
 */
export async function getDespesasAbativeis(
  favorecidoId?: string | null,
): Promise<DespesaAbativel[]> {
  const ctx = await getActiveContext();
  if (!ctx || !can(ctx.perms, "despesas", "ver")) return [];

  const rows = await db
    .select({
      d: schema.despesas,
      projectId: schema.projects.id,
      projectName: schema.projects.name,
      fornecedorNome: schema.stakeholders.nome,
    })
    .from(schema.despesas)
    .innerJoin(schema.versions, eq(schema.despesas.versionId, schema.versions.id))
    .innerJoin(schema.projects, eq(schema.versions.projectId, schema.projects.id))
    .leftJoin(schema.stakeholders, eq(schema.despesas.fornecedorId, schema.stakeholders.id))
    .where(
      and(
        eq(schema.despesas.tenantId, ctx.tenant.id),
        eq(schema.despesas.cancelado, false),
        ne(schema.despesas.status, "Pago"),
      ),
    );

  const ids = rows.map((r) => r.d.id);
  const abatidos = new Map<string, number>();
  if (ids.length > 0) {
    const itens = await db
      .select({
        despesaId: schema.acertoItens.despesaId,
        valor: schema.acertoItens.valorAbatido,
        estornado: schema.acertos.estornado,
      })
      .from(schema.acertoItens)
      .innerJoin(schema.acertos, eq(schema.acertoItens.acertoId, schema.acertos.id))
      .where(inArray(schema.acertoItens.despesaId, ids));
    for (const i of itens) {
      // Acerto estornado não conta: as despesas dele foram reabertas.
      if (i.estornado) continue;
      abatidos.set(i.despesaId, (abatidos.get(i.despesaId) ?? 0) + Number(i.valor));
    }
  }

  return rows
    .filter((r) => !favorecidoId || r.d.fornecedorId === favorecidoId)
    .map((r) => {
      const saldo =
        Math.round((Number(r.d.valor) - (abatidos.get(r.d.id) ?? 0)) * 100) / 100;
      return {
        id: r.d.id,
        numDoc: r.d.numDoc,
        projectId: r.projectId,
        projectName: r.projectName,
        fornecedorId: r.d.fornecedorId,
        fornecedorNome: r.fornecedorNome,
        competencia: r.d.competencia,
        vencimento: r.d.vencimento,
        valor: Number(r.d.valor),
        saldo,
        status: r.d.status,
      };
    })
    .filter((r) => r.saldo > 0.004);
}

export interface AcertoInput {
  dataPagamento: string;
  bankAccountId?: string | null;
  valorTransferido: number;
  formaPagamento?: string | null;
  favorecidoId?: string | null;
  obs?: string | null;
  /** despesas a abater: `{id, valor}` com valor editável (abatimento parcial). */
  itens: { despesaId: string; valor: number }[];
  /** categoria da diferença; sem ela, usa o default financeiro (RG-07). */
  categoriaDiferenca?: string | null;
  idempotencyKey?: string | null;
}

export interface AcertoResult {
  ok: boolean;
  error?: string;
  acertoId?: string;
  numDoc?: string;
  jaExistia?: boolean;
}

/**
 * Conclui um acerto contábil (itens 5.1, 5.2 e 5.4).
 *
 * Tudo numa transação: ou o acerto inteiro existe, ou nada dele existe. Um
 * acerto meio aplicado deixaria despesas quitadas sem a saída de caixa
 * correspondente.
 */
export async function concluirAcerto(input: AcertoInput): Promise<AcertoResult> {
  const ctx = await getActiveContext();
  // Item 6 dos RNF: acerto é operação de nível financeiro.
  if (!ctx || !can(ctx.perms, "despesas", "editar") || !can(ctx.perms, "caixa", "criar")) {
    return { ok: false, error: "Sem permissão para concluir acertos contábeis." };
  }
  const idem = input.idempotencyKey?.trim() || null;
  if (idem) {
    const [existente] = await db
      .select({ id: schema.acertos.id, numDoc: schema.acertos.numDoc })
      .from(schema.acertos)
      .where(
        and(eq(schema.acertos.tenantId, ctx.tenant.id), eq(schema.acertos.idempotencyKey, idem)),
      )
      .limit(1);
    if (existente)
      return {
        ok: true,
        acertoId: existente.id,
        numDoc: existente.numDoc ?? undefined,
        jaExistia: true,
      };
  }

  const valorTransferido = Math.abs(input.valorTransferido);
  if (!(valorTransferido > 0)) {
    return { ok: false, error: "Informe o valor transferido." };
  }
  if (input.itens.length === 0) {
    return { ok: false, error: "Vincule ao menos uma despesa ao acerto." };
  }

  try {
    const out = await db.transaction(async (tx) => {
      const ids = input.itens.map((i) => i.despesaId);
      const despesas = await tx
        .select()
        .from(schema.despesas)
        .where(
          and(eq(schema.despesas.tenantId, ctx.tenant.id), inArray(schema.despesas.id, ids)),
        );
      if (despesas.length !== ids.length) {
        throw new Error("Alguma despesa vinculada não foi encontrada.");
      }
      const porId = new Map(despesas.map((d) => [d.id, d]));

      // O valor abatido nunca excede o valor da despesa.
      const abatimentos = abaterManual(
        input.itens.map((i) => ({ id: i.despesaId, valor: i.valor })),
        despesas.map((d) => ({
          id: d.id,
          competencia: d.competencia,
          numDoc: d.numDoc,
          saldo: Number(d.valor),
        })),
      );
      const totalVinculado = abatimentos.totalAbatido;
      const diferenca = calcularDiferenca(valorTransferido, totalVinculado);
      if (!acertoFecha(valorTransferido, totalVinculado, diferenca)) {
        throw new Error(
          "O acerto não fecha: a soma dos abatimentos mais a diferença precisa ser igual ao valor transferido.",
        );
      }

      const numDoc = await reserveDespesaNumber(ctx.tenant.id);
      const [acerto] = await tx
        .insert(schema.acertos)
        .values({
          tenantId: ctx.tenant.id,
          numDoc,
          dataPagamento: input.dataPagamento || null,
          bankAccountId: input.bankAccountId || null,
          valorTransferido: String(valorTransferido),
          formaPagamento: input.formaPagamento || null,
          favorecidoId: input.favorecidoId || null,
          diferencaValor: String(diferenca.valor),
          diferencaTipo: diferenca.tipo,
          obs: input.obs || null,
          idempotencyKey: idem,
          usuarioId: ctx.userId,
        })
        .returning();

      // Cada despesa vinculada vira "Pago", guardando o status anterior para
      // que o estorno saiba ao que voltar (item 5.4).
      for (const a of abatimentos.abatimentos) {
        const d = porId.get(a.id)!;
        await tx.insert(schema.acertoItens).values({
          tenantId: ctx.tenant.id,
          acertoId: acerto.id,
          despesaId: a.id,
          valorAbatido: String(a.valorAbatido),
          statusAnterior: d.status,
        });
        if (a.quitado) {
          await tx
            .update(schema.despesas)
            .set({ status: "Pago", dataCaixa: input.dataPagamento || null })
            .where(eq(schema.despesas.id, a.id));
        } else {
          await tx
            .update(schema.despesas)
            .set({ status: "Parcialmente paga" })
            .where(eq(schema.despesas.id, a.id));
        }
      }

      // RG-07 — a diferença é despesa/receita FINANCEIRA do período, na
      // competência da DATA DO PAGAMENTO, e não é rateada no custo de obra
      // nenhuma. Vira uma despesa própria, com PED próprio, para aparecer na
      // DRE na linha certa.
      let diferencaDespesaId: string | null = null;
      if (diferenca.tipo !== "NENHUMA") {
        const projetoDaDiferenca = porId.get(abatimentos.abatimentos[0].id)!;
        const [versaoDif] = await tx
          .select({ id: schema.versions.id })
          .from(schema.versions)
          .where(eq(schema.versions.id, projetoDaDiferenca.versionId))
          .limit(1);
        const compet = (input.dataPagamento || "").split("/");
        const competencia =
          compet.length === 3 ? `${compet[0]}/${compet[2]}` : projetoDaDiferenca.competencia;
        const numDif = await reserveDespesaNumber(ctx.tenant.id);
        const [despDif] = await tx
          .insert(schema.despesas)
          .values({
            versionId: versaoDif.id,
            tenantId: ctx.tenant.id,
            numDoc: numDif,
            fornecedorId: input.favorecidoId || null,
            contaCef:
              diferenca.tipo === "JUROS"
                ? CONTAS_CONTROLADORIA.jurosMora
                : CONTAS_CONTROLADORIA.descontosObtidos,
            // Sempre "Despesas Financeiras": mesmo o desconto obtido entra como
            // valor NEGATIVO nesta categoria, para não abrir uma categoria de
            // receita num lançamento de despesa (RG-01).
            categoriaDre: (input.categoriaDiferenca as CategoriaDRE) ?? "Despesas Financeiras",
            competencia,
            vencimento: input.dataPagamento || null,
            dataCaixa: input.dataPagamento || null,
            valor:
              diferenca.tipo === "JUROS"
                ? String(diferenca.valor)
                : String(-diferenca.valor),
            status: "Pago",
            obs:
              diferenca.tipo === "JUROS"
                ? `Juros e multas — acerto ${numDoc}`
                : `Desconto obtido — acerto ${numDoc}`,
          })
          .returning();
        diferencaDespesaId = despDif.id;
      }

      // RG-08 — UMA saída de caixa, no valor efetivamente transferido.
      const [cash] = await tx
        .insert(schema.cashEntries)
        .values({
          versionId: porId.get(abatimentos.abatimentos[0].id)!.versionId,
          tenantId: ctx.tenant.id,
          bankAccountId: input.bankAccountId || null,
          data: input.dataPagamento || null,
          descricao: `Acerto ${numDoc}`,
          valor: String(-valorTransferido),
          cat: "acerto",
          rec: true,
        })
        .returning();

      await tx
        .update(schema.acertos)
        .set({ diferencaDespesaId, cashEntryId: cash.id })
        .where(eq(schema.acertos.id, acerto.id));

      return { acertoId: acerto.id, numDoc, diferenca, totalVinculado };
    });

    await logAudit({
      tenantId: ctx.tenant.id,
      userId: ctx.userId,
      action: "acerto.create",
      entity: "acerto",
      entityId: out.acertoId,
      meta: {
        numDoc: out.numDoc,
        valorTransferido,
        totalVinculado: out.totalVinculado,
        diferenca: out.diferenca,
        despesas: input.itens.length,
      },
    });
    revalidatePath("/acerto");
    revalidatePath("/contaspagar");
    revalidatePath("/caixa");
    revalidatePath("/fluxocaixa");
    revalidatePath("/dre");
    return { ok: true, acertoId: out.acertoId, numDoc: out.numDoc };
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Falha ao concluir o acerto.";
    if (idem && /duplicate key|acerto_idem_uq/i.test(msg)) {
      const [existente] = await db
        .select({ id: schema.acertos.id, numDoc: schema.acertos.numDoc })
        .from(schema.acertos)
        .where(
          and(eq(schema.acertos.tenantId, ctx.tenant.id), eq(schema.acertos.idempotencyKey, idem)),
        )
        .limit(1);
      if (existente)
        return {
          ok: true,
          acertoId: existente.id,
          numDoc: existente.numDoc ?? undefined,
          jaExistia: true,
        };
    }
    return { ok: false, error: msg };
  }
}

/**
 * Estorna um acerto (item 5.4).
 *
 * Reabre TODAS as despesas vinculadas ao status que tinham antes, reverte a
 * saída de caixa e cancela a despesa de diferença financeira. O acerto não é
 * apagado — fica marcado como estornado, preservando a trilha (RG-09).
 */
export async function estornarAcerto(acertoId: string, motivo: string) {
  const ctx = await getActiveContext();
  if (!ctx || !can(ctx.perms, "despesas", "excluir")) {
    throw new Error("Sem permissão para estornar acertos.");
  }
  const [acerto] = await db
    .select()
    .from(schema.acertos)
    .where(and(eq(schema.acertos.id, acertoId), eq(schema.acertos.tenantId, ctx.tenant.id)))
    .limit(1);
  if (!acerto) throw new Error("Acerto não encontrado.");
  if (acerto.estornado) throw new Error("Este acerto já foi estornado.");

  await db.transaction(async (tx) => {
    const itens = await tx
      .select()
      .from(schema.acertoItens)
      .where(eq(schema.acertoItens.acertoId, acertoId));

    // Cada despesa volta ao status ANTERIOR ao acerto — não a um status
    // arbitrário. Por isso `statusAnterior` é gravado na conclusão.
    for (const i of itens) {
      await tx
        .update(schema.despesas)
        .set({ status: i.statusAnterior ?? "A pagar", dataCaixa: null })
        .where(eq(schema.despesas.id, i.despesaId));
    }

    // A diferença financeira é cancelada logicamente, não apagada (RG-09).
    if (acerto.diferencaDespesaId) {
      await tx
        .update(schema.despesas)
        .set({
          cancelado: true,
          canceladoPor: ctx.userEmail || ctx.userId || null,
          motivoCancelamento: `Estorno do acerto ${acerto.numDoc ?? ""}: ${motivo}`.trim(),
        })
        .where(eq(schema.despesas.id, acerto.diferencaDespesaId));
    }

    // Estorno da saída de caixa: entrada compensatória, preservando o
    // lançamento original.
    if (acerto.cashEntryId) {
      const [orig] = await tx
        .select()
        .from(schema.cashEntries)
        .where(eq(schema.cashEntries.id, acerto.cashEntryId))
        .limit(1);
      if (orig) {
        await tx.insert(schema.cashEntries).values({
          versionId: orig.versionId,
          tenantId: ctx.tenant.id,
          bankAccountId: orig.bankAccountId,
          data: orig.data,
          descricao: `Estorno do acerto ${acerto.numDoc ?? ""}`.trim(),
          valor: String(Math.abs(Number(orig.valor))),
          cat: "ajuste",
          rec: true,
        });
      }
    }

    await tx
      .update(schema.acertos)
      .set({
        estornado: true,
        estornadoEm: new Date().toISOString().slice(0, 10),
        estornadoPor: ctx.userEmail || ctx.userId || null,
        obs: `${acerto.obs ?? ""}\nEstornado: ${motivo}`.trim(),
      })
      .where(eq(schema.acertos.id, acertoId));
  });

  await logAudit({
    tenantId: ctx.tenant.id,
    userId: ctx.userId,
    action: "acerto.estorno",
    entity: "acerto",
    entityId: acertoId,
    meta: { numDoc: acerto.numDoc, motivo },
  });
  revalidatePath("/acerto");
  revalidatePath("/contaspagar");
  revalidatePath("/caixa");
  revalidatePath("/dre");
}

export interface RateioInput {
  prestadorId: string | null;
  valorTotal: number;
  dataPagamento: string;
  bankAccountId?: string | null;
  competencia?: string | null;
  categoriaDre?: string | null;
  contaCef?: string | null;
  baseRateio?: string | null;
  descricao?: string | null;
  linhas: LinhaRateio[];
  idempotencyKey?: string | null;
}

/**
 * Rateio de mão de obra entre obras — item 5.3.
 *
 * "Um PIX, várias obras, um comprovante": gera **um PED por obra** (custo
 * correto por centro de custo) e **uma única saída de caixa**. A memória de
 * cálculo fica gravada e é o documento que sustenta o custo por obra perante a
 * contabilidade e eventual fiscalização.
 */
export async function ratearEntreObras(
  input: RateioInput,
): Promise<AcertoResult> {
  const ctx = await getActiveContext();
  if (!ctx || !can(ctx.perms, "despesas", "criar") || !can(ctx.perms, "caixa", "criar")) {
    return { ok: false, error: "Sem permissão para ratear pagamentos entre obras." };
  }
  const valorTotal = Math.abs(input.valorTotal);
  const rateio = calcularRateio(valorTotal, input.linhas);
  // CA-27 — rateio que não fecha é BLOQUEADO: ele determina o custo por centro
  // de custo, e um erro aqui contamina o resultado de cada obra.
  const erro = validarRateio(valorTotal, rateio);
  if (erro) return { ok: false, error: erro };

  const idem = input.idempotencyKey?.trim() || null;
  if (idem) {
    const [existente] = await db
      .select({ id: schema.acertos.id, numDoc: schema.acertos.numDoc })
      .from(schema.acertos)
      .where(
        and(eq(schema.acertos.tenantId, ctx.tenant.id), eq(schema.acertos.idempotencyKey, idem)),
      )
      .limit(1);
    if (existente)
      return {
        ok: true,
        acertoId: existente.id,
        numDoc: existente.numDoc ?? undefined,
        jaExistia: true,
      };
  }

  try {
    const out = await db.transaction(async (tx) => {
      const numDoc = await reserveDespesaNumber(ctx.tenant.id);
      const [acerto] = await tx
        .insert(schema.acertos)
        .values({
          tenantId: ctx.tenant.id,
          numDoc,
          dataPagamento: input.dataPagamento || null,
          bankAccountId: input.bankAccountId || null,
          valorTransferido: String(valorTotal),
          favorecidoId: input.prestadorId || null,
          diferencaValor: "0",
          diferencaTipo: "NENHUMA",
          obs: input.descricao || null,
          idempotencyKey: idem,
          usuarioId: ctx.userId,
        })
        .returning();

      let versaoPrimeira: string | null = null;
      for (const linha of rateio) {
        const versao = await getAtualVersion(ctx.tenant.id, linha.projectId);
        if (!versao) {
          throw new Error(
            "Uma das obras do rateio não tem versão Atual — crie-a antes de ratear.",
          );
        }
        versaoPrimeira ??= versao.id;
        const numObra = await reserveDespesaNumber(ctx.tenant.id);
        const [desp] = await tx
          .insert(schema.despesas)
          .values({
            versionId: versao.id,
            tenantId: ctx.tenant.id,
            numDoc: numObra,
            fornecedorId: input.prestadorId || null,
            contaCef: input.contaCef || null,
            categoriaDre: (input.categoriaDre as CategoriaDRE) ?? "Custo Variável",
            competencia: input.competencia || null,
            vencimento: input.dataPagamento || null,
            dataCaixa: input.dataPagamento || null,
            valor: String(linha.valor),
            status: "Pago",
            obs: `${input.descricao ?? "Rateio de mão de obra"} — acerto ${numDoc}`,
            // A saída de caixa é do ACERTO, uma só. Marcar aqui evitaria que a
            // despesa gerasse uma segunda saída no fluxo.
            pagoPorTerceiro: false,
          })
          .returning();

        await tx.insert(schema.rateiosObra).values({
          tenantId: ctx.tenant.id,
          acertoId: acerto.id,
          projectId: linha.projectId,
          despesaId: desp.id,
          valor: String(linha.valor),
          percentual: String(linha.percentual),
          baseRateio: input.baseRateio || null,
          memoriaCalculo: {
            valorTotalPago: valorTotal,
            criterio: input.baseRateio ?? "percentual informado",
            percentual: linha.percentual,
            valorDaObra: linha.valor,
            acerto: numDoc,
            calculadoEm: input.dataPagamento,
          },
        });

        await tx.insert(schema.acertoItens).values({
          tenantId: ctx.tenant.id,
          acertoId: acerto.id,
          despesaId: desp.id,
          valorAbatido: String(linha.valor),
          statusAnterior: "A pagar",
        });
      }

      // RG-08 — uma saída de caixa só, no valor total pago.
      const [cash] = await tx
        .insert(schema.cashEntries)
        .values({
          versionId: versaoPrimeira!,
          tenantId: ctx.tenant.id,
          bankAccountId: input.bankAccountId || null,
          data: input.dataPagamento || null,
          descricao: `Rateio entre obras — acerto ${numDoc}`,
          valor: String(-valorTotal),
          cat: "acerto",
          rec: true,
        })
        .returning();
      await tx
        .update(schema.acertos)
        .set({ cashEntryId: cash.id })
        .where(eq(schema.acertos.id, acerto.id));

      return { acertoId: acerto.id, numDoc };
    });

    await logAudit({
      tenantId: ctx.tenant.id,
      userId: ctx.userId,
      action: "acerto.rateio",
      entity: "acerto",
      entityId: out.acertoId,
      meta: { numDoc: out.numDoc, valorTotal, obras: rateio.length, rateio },
    });
    revalidatePath("/acerto");
    revalidatePath("/despesas");
    revalidatePath("/caixa");
    revalidatePath("/dre");
    return { ok: true, acertoId: out.acertoId, numDoc: out.numDoc };
  } catch (e) {
    return {
      ok: false,
      error: e instanceof Error ? e.message : "Falha ao ratear o pagamento.",
    };
  }
}

export interface AcertoResumo {
  id: string;
  numDoc: string | null;
  dataPagamento: string | null;
  favorecido: string | null;
  valorTransferido: number;
  totalVinculado: number;
  diferencaValor: number;
  diferencaTipo: string;
  qtdDespesas: number;
  obras: string[];
  estornado: boolean;
}

/**
 * Relatório "Acertos do período" (item 5.5) — o pacote entregue à contabilidade.
 */
export async function getAcertos(tenantId: string): Promise<AcertoResumo[]> {
  const acertos = await db
    .select({
      a: schema.acertos,
      favorecido: schema.stakeholders.nome,
    })
    .from(schema.acertos)
    .leftJoin(schema.stakeholders, eq(schema.acertos.favorecidoId, schema.stakeholders.id))
    .where(eq(schema.acertos.tenantId, tenantId));
  if (acertos.length === 0) return [];

  const itens = await db
    .select({
      acertoId: schema.acertoItens.acertoId,
      valor: schema.acertoItens.valorAbatido,
      projectName: schema.projects.name,
    })
    .from(schema.acertoItens)
    .innerJoin(schema.despesas, eq(schema.acertoItens.despesaId, schema.despesas.id))
    .innerJoin(schema.versions, eq(schema.despesas.versionId, schema.versions.id))
    .innerJoin(schema.projects, eq(schema.versions.projectId, schema.projects.id))
    .where(eq(schema.acertoItens.tenantId, tenantId));

  const porAcerto = new Map<string, { total: number; qtd: number; obras: Set<string> }>();
  for (const i of itens) {
    let e = porAcerto.get(i.acertoId);
    if (!e) {
      e = { total: 0, qtd: 0, obras: new Set() };
      porAcerto.set(i.acertoId, e);
    }
    e.total += Number(i.valor);
    e.qtd += 1;
    e.obras.add(i.projectName);
  }

  return acertos
    .map(({ a, favorecido }) => {
      const agg = porAcerto.get(a.id);
      return {
        id: a.id,
        numDoc: a.numDoc,
        dataPagamento: a.dataPagamento,
        favorecido,
        valorTransferido: Number(a.valorTransferido),
        totalVinculado: Math.round((agg?.total ?? 0) * 100) / 100,
        diferencaValor: Number(a.diferencaValor),
        diferencaTipo: a.diferencaTipo,
        qtdDespesas: agg?.qtd ?? 0,
        obras: [...(agg?.obras ?? [])].sort(),
        estornado: a.estornado,
      };
    })
    .sort((x, y) => (y.dataPagamento ?? "").localeCompare(x.dataPagamento ?? ""));
}

/** Preview do abatimento FIFO, para a tela mostrar antes de confirmar. */
export async function previewAbatimentoFifo(
  valor: number,
  favorecidoId?: string | null,
) {
  const despesas = await getDespesasAbativeis(favorecidoId);
  return {
    despesas,
    resultado: abaterFifo(
      valor,
      despesas.map((d) => ({
        id: d.id,
        competencia: d.competencia,
        numDoc: d.numDoc,
        saldo: d.saldo,
      })),
    ),
  };
}
