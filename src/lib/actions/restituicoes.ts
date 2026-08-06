"use server";

import { and, asc, desc, eq, ilike, ne, or, sql } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { db, schema } from "@/lib/db";
import { getActiveContext } from "@/lib/context";
import { can } from "@/lib/permissions";
import { logAudit } from "@/lib/audit";
import { reserveDespesaNumber } from "@/lib/db/numbering";
import { statusRestituicao } from "@/lib/calc";
import { restituicaoCabe } from "@/lib/calc/restituicao";
import type { CategoriaDRE } from "@/lib/calc/constants";

/**
 * Busca uma despesa já lançada pelo número PED (§9).
 *
 * A busca é por NÚMERO, mas o vínculo devolvido é o **ID interno** da despesa —
 * é ele que amarra a obrigação ao lançamento original. O PED é apenas o rótulo
 * que o usuário conhece; nunca é alterado por este fluxo.
 */
export interface DespesaPorPed {
  id: string;
  numDoc: string | null;
  valor: number;
  competencia: string | null;
  vencimento: string | null;
  categoriaDre: string | null;
  contaCef: string | null;
  fornecedorId: string | null;
  fornecedorNome: string | null;
  projectId: string;
  projectName: string;
  status: string | null;
  cancelado: boolean;
  pagoPorTerceiro: boolean;
  /** Obrigação já existente para esta despesa (não se cria uma segunda). */
  obrigacaoId: string | null;
  obrigacaoStatus: string | null;
}

export async function buscarDespesasPorPed(termo: string): Promise<DespesaPorPed[]> {
  const ctx = await getActiveContext();
  if (!ctx || !can(ctx.perms, "restituicoes", "ver")) return [];
  const q = termo.trim();
  if (q.length < 2) return [];

  const rows = await db
    .select({
      d: schema.despesas,
      fornecedorNome: schema.stakeholders.nome,
      projectId: schema.projects.id,
      projectName: schema.projects.name,
      dtId: schema.despesaTerceiros.id,
      dtStatus: schema.despesaTerceiros.status,
    })
    .from(schema.despesas)
    .innerJoin(schema.versions, eq(schema.despesas.versionId, schema.versions.id))
    .innerJoin(schema.projects, eq(schema.versions.projectId, schema.projects.id))
    .leftJoin(schema.stakeholders, eq(schema.despesas.fornecedorId, schema.stakeholders.id))
    .leftJoin(
      schema.despesaTerceiros,
      and(
        eq(schema.despesaTerceiros.despesaId, schema.despesas.id),
        ne(schema.despesaTerceiros.status, "Cancelado"),
      ),
    )
    .where(
      and(
        eq(schema.despesas.tenantId, ctx.tenant.id),
        or(
          ilike(schema.despesas.numDoc, `%${q}%`),
          // Permite colar só o número ("70") ou o PED completo ("PED-000070").
          ilike(schema.despesas.obs, `%${q}%`),
        ),
      ),
    )
    .orderBy(desc(schema.despesas.createdAt))
    .limit(20);

  return rows.map((r) => ({
    id: r.d.id,
    numDoc: r.d.numDoc,
    valor: Number(r.d.valor),
    competencia: r.d.competencia,
    vencimento: r.d.vencimento,
    categoriaDre: r.d.categoriaDre,
    contaCef: r.d.contaCef,
    fornecedorId: r.d.fornecedorId,
    fornecedorNome: r.fornecedorNome,
    projectId: r.projectId,
    projectName: r.projectName,
    status: r.d.status,
    cancelado: r.d.cancelado,
    pagoPorTerceiro: r.d.pagoPorTerceiro,
    obrigacaoId: r.dtId,
    obrigacaoStatus: r.dtStatus,
  }));
}

export interface CriarObrigacaoResult {
  ok: boolean;
  error?: string;
  /** Obrigação criada OU a que já existia para o mesmo fato. */
  obrigacaoId?: string;
  /** true quando a obrigação já existia — a tela deve abri-la, não duplicar. */
  jaExistia?: boolean;
}

/**
 * Cria a OBRIGAÇÃO com quem desembolsou o dinheiro (§6–§11).
 *
 * Os quatro fatos ficam separados:
 *   1. a despesa existe (competência própria, 1× na DRE);
 *   2. um terceiro pagou o fornecedor (não houve saída de caixa da empresa);
 *   3. nasce uma obrigação da empresa com esse terceiro;
 *   4. a restituição — quando ocorrer — é a saída de caixa, em data própria.
 *
 * Dois modos:
 *   - `despesaId` informado → vincula-se a uma despesa JÁ LANÇADA (localizada
 *     pelo PED). O lançamento original NÃO é sobrescrito: valor, competência,
 *     vencimento, categoria, fornecedor e número PED permanecem como estão. A
 *     única marcação é `pagoPorTerceiro = true`, que impede a despesa de contar
 *     como saída de caixa na competência (ela já foi paga por outra pessoa).
 *   - sem `despesaId` → cria a despesa e a obrigação juntas, como antes.
 *
 * Tudo dentro de UMA transação (§16): ou existem despesa + obrigação, ou não
 * existe nenhuma das duas. `idempotencyKey` bloqueia o mesmo fato reenviado.
 */
export async function criarDespesaTerceiro(
  formData: FormData,
): Promise<CriarObrigacaoResult> {
  const ctx = await getActiveContext();
  if (!ctx || !can(ctx.perms, "restituicoes", "criar")) {
    return { ok: false, error: "Sem permissão para registrar despesas pagas por terceiros." };
  }
  if (ctx.version.locked) return { ok: false, error: "Versão congelada." };

  const s = (k: string) => {
    const v = formData.get(k);
    return typeof v === "string" && v.trim() !== "" ? v.trim() : null;
  };
  const despesaId = s("despesaId");
  const idem = s("idempotencyKey");
  const pagadorTerceiroId = s("pagadorTerceiroId");
  const dataPagamentoOriginal = s("dataPagamentoOriginal");
  const dataPrevistaRestituicao = s("dataPrevistaRestituicao");
  const obs = s("obs");

  // Reenvio do MESMO fato (duplo clique, refresh, resubmit): devolve a
  // obrigação já criada em vez de criar outra.
  if (idem) {
    const [existente] = await db
      .select({ id: schema.despesaTerceiros.id })
      .from(schema.despesaTerceiros)
      .where(
        and(
          eq(schema.despesaTerceiros.tenantId, ctx.tenant.id),
          eq(schema.despesaTerceiros.idempotencyKey, idem),
        ),
      )
      .limit(1);
    if (existente) return { ok: true, obrigacaoId: existente.id, jaExistia: true };
  }

  try {
    const resultado = await db.transaction(async (tx) => {
      let despesaAlvo: typeof schema.despesas.$inferSelect;
      let valorObrigacao: string;

      if (despesaId) {
        // ── Modo vínculo por PED ──────────────────────────────────────────
        const [d] = await tx
          .select()
          .from(schema.despesas)
          .where(
            and(
              eq(schema.despesas.id, despesaId),
              eq(schema.despesas.tenantId, ctx.tenant.id),
            ),
          )
          .limit(1);
        // PED inexistente ou de outro tenant: bloqueia, não cria nada.
        if (!d) throw new Error("PED não encontrado. Confira o número informado.");
        if (d.cancelado)
          throw new Error(
            `O lançamento ${d.numDoc ?? ""} está cancelado e não pode receber uma obrigação de restituição.`.trim(),
          );
        if (Number(d.valor) <= 0)
          throw new Error("O lançamento tem valor zero — incompatível com uma restituição.");

        // Uma obrigação ATIVA por despesa (§16). Se já existe, devolve a
        // existente para a tela abri-la, em vez de criar a segunda.
        const [jaTem] = await tx
          .select({ id: schema.despesaTerceiros.id })
          .from(schema.despesaTerceiros)
          .where(
            and(
              eq(schema.despesaTerceiros.despesaId, d.id),
              ne(schema.despesaTerceiros.status, "Cancelado"),
            ),
          )
          .limit(1);
        if (jaTem) return { obrigacaoId: jaTem.id, jaExistia: true, despesaId: d.id };

        // Só a marcação de "pago por terceiro" muda no lançamento original.
        // Valor, competência, vencimento, categoria, fornecedor e PED ficam
        // exatamente como o usuário lançou.
        if (!d.pagoPorTerceiro) {
          await tx
            .update(schema.despesas)
            .set({ pagoPorTerceiro: true })
            .where(eq(schema.despesas.id, d.id));
        }
        despesaAlvo = d;
        valorObrigacao = String(d.valor);
      } else {
        // ── Modo despesa nova ─────────────────────────────────────────────
        const valor = (formData.get("valor") as string) || "0";
        if (!Number.isFinite(Number(valor)) || Number(valor) <= 0) {
          throw new Error("Informe um valor maior que zero para a despesa paga por terceiro.");
        }
        const numDoc = await reserveDespesaNumber(ctx.tenant.id);
        const [nova] = await tx
          .insert(schema.despesas)
          .values({
            versionId: ctx.version.id,
            tenantId: ctx.tenant.id,
            numDoc,
            fornecedorId: s("fornecedorId"),
            contaCef: s("contaCef"),
            categoriaDre: (formData.get("categoriaDre") as CategoriaDRE) || null,
            competencia: s("competencia"),
            vencimento: dataPagamentoOriginal,
            valor,
            status: "Pago",
            obs,
            pagoPorTerceiro: true,
          })
          .returning();
        despesaAlvo = nova;
        valorObrigacao = valor;
      }

      const [dt] = await tx
        .insert(schema.despesaTerceiros)
        .values({
          tenantId: ctx.tenant.id,
          despesaId: despesaAlvo.id,
          pagadorTerceiroId,
          empresaResponsavelId: s("empresaResponsavelId") || ctx.project.id,
          valorTotal: valorObrigacao,
          // A data da restituição NÃO altera a competência da despesa: são
          // fatos distintos e a DRE continua reconhecendo pela competência
          // original do lançamento.
          dataPagamentoOriginal: dataPagamentoOriginal ?? despesaAlvo.vencimento,
          dataPrevistaRestituicao,
          status: "Aguardando restituição",
          obs,
          idempotencyKey: idem,
        })
        .returning();

      return { obrigacaoId: dt.id, jaExistia: false, despesaId: despesaAlvo.id };
    });

    if (!resultado.jaExistia) {
      await logAudit({
        tenantId: ctx.tenant.id,
        userId: ctx.userId,
        action: "despesaTerceiro.create",
        entity: "despesa_terceiro",
        entityId: resultado.obrigacaoId,
        meta: { despesaId: resultado.despesaId, vinculadoPorPed: !!despesaId },
      });
    }
    revalidatePath("/restituicoes");
    revalidatePath("/contaspagar");
    revalidatePath("/dre");
    return {
      ok: true,
      obrigacaoId: resultado.obrigacaoId,
      jaExistia: resultado.jaExistia,
    };
  } catch (e) {
    // Colisão no índice de idempotência = o mesmo fato chegou duas vezes em
    // paralelo. Não é erro para o usuário: devolve a obrigação que venceu.
    const msg = e instanceof Error ? e.message : "Falha ao registrar a obrigação.";
    if (idem && /idempotency|duplicate key|despesa_terceiro_idem_uq/i.test(msg)) {
      const [existente] = await db
        .select({ id: schema.despesaTerceiros.id })
        .from(schema.despesaTerceiros)
        .where(
          and(
            eq(schema.despesaTerceiros.tenantId, ctx.tenant.id),
            eq(schema.despesaTerceiros.idempotencyKey, idem),
          ),
        )
        .limit(1);
      if (existente) return { ok: true, obrigacaoId: existente.id, jaExistia: true };
    }
    if (/despesa_terceiro_despesa_ativa_uq/i.test(msg)) {
      return { ok: false, error: "Este lançamento já possui uma obrigação de restituição ativa." };
    }
    return { ok: false, error: msg };
  }
}

export interface RestituicaoInput {
  despesaTerceiroId: string;
  valor: number;
  dataRestituicao: string;
  bankAccountId?: string | null;
  comprovante?: string;
  obs?: string;
  /** Trava de reenvio (§16). Gerada pelo formulário, uma por tentativa real. */
  idempotencyKey?: string | null;
  /**
   * Item do extrato que pagou esta restituição (§14). Quando informado, a
   * restituição É a conciliação daquele lançamento: não se cria saída de caixa
   * nova (o extrato já a contém) nem nova despesa.
   */
  cashEntryId?: string | null;
}

export interface RestituicaoResult {
  ok: boolean;
  error?: string;
  restituicaoId?: string;
  jaExistia?: boolean;
}

/**
 * Registra uma restituição, parcial ou integral (§10, §12).
 *
 * O que ela faz: gera a SAÍDA de caixa da empresa na data efetiva e abate o
 * saldo devido ao terceiro.
 *
 * O que ela deliberadamente NÃO faz:
 *   - não cria despesa nova (a despesa já foi reconhecida na competência dela);
 *   - não altera a competência, o valor, o vencimento nem o status da despesa
 *     original — a data da restituição é um fato separado;
 *   - não duplica a saída de caixa quando o pagamento vem de um item do extrato
 *     já lançado (`cashEntryId`): nesse caso só vincula.
 *
 * Tudo em UMA transação e com chave de idempotência: duplo clique, reenvio de
 * formulário ou refresh não geram duas restituições.
 */
export async function registrarRestituicao(
  input: RestituicaoInput,
): Promise<RestituicaoResult> {
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

  try {
    const restId = await db.transaction(async (tx) => {
      // SELECT ... FOR UPDATE: duas restituições simultâneas sobre a mesma
      // obrigação são serializadas, então a segunda enxerga o saldo já abatido
      // pela primeira e é recusada se não couber.
      const [dt] = await tx
        .select()
        .from(schema.despesaTerceiros)
        .where(
          and(
            eq(schema.despesaTerceiros.id, input.despesaTerceiroId),
            eq(schema.despesaTerceiros.tenantId, ctx.tenant.id),
          ),
        )
        .for("update")
        .limit(1);
      if (!dt) throw new Error("Obrigação não encontrada.");
      if (dt.status === "Cancelado") throw new Error("Obrigação cancelada.");

      const valor = Math.abs(input.valor);
      if (!(valor > 0)) throw new Error("Informe um valor maior que zero.");
      const saldo = Number(dt.valorTotal) - Number(dt.valorRestituido);
      if (!restituicaoCabe(Number(dt.valorTotal), Number(dt.valorRestituido), valor)) {
        throw new Error(
          `Valor acima do saldo devido (${saldo.toLocaleString("pt-BR", {
            style: "currency",
            currency: "BRL",
          })}). Ajuste o valor da restituição.`,
        );
      }

      // §14 — item do extrato já usado por outra restituição não pode ser
      // reaproveitado: geraria uma segunda baixa para o mesmo dinheiro.
      if (input.cashEntryId) {
        const [usado] = await tx
          .select({ id: schema.restituicoes.id })
          .from(schema.restituicoes)
          .where(eq(schema.restituicoes.cashEntryId, input.cashEntryId))
          .limit(1);
        if (usado)
          throw new Error("Este lançamento do extrato já foi vinculado a outra restituição.");
      }

      const [rest] = await tx
        .insert(schema.restituicoes)
        .values({
          tenantId: ctx.tenant.id,
          despesaTerceiroId: dt.id,
          valor: String(valor),
          dataRestituicao: input.dataRestituicao || null,
          bankAccountId: input.bankAccountId || null,
          comprovante: input.comprovante || null,
          obs: input.obs || null,
          cashEntryId: input.cashEntryId || null,
          idempotencyKey: idem,
          usuarioId: ctx.userId,
        })
        .returning();

      const restituido = Number(dt.valorRestituido) + valor;
      await tx
        .update(schema.despesaTerceiros)
        .set({
          valorRestituido: String(restituido),
          status: statusRestituicao(Number(dt.valorTotal), restituido),
        })
        .where(eq(schema.despesaTerceiros.id, dt.id));

      if (input.cashEntryId) {
        // A saída já existe no extrato — só é marcada como conciliada. Criar um
        // cash_entry aqui duplicaria a saída de caixa (§16).
        await tx
          .update(schema.cashEntries)
          .set({ rec: true, cat: "restituicao" })
          .where(eq(schema.cashEntries.id, input.cashEntryId));
      } else {
        await tx.insert(schema.cashEntries).values({
          versionId: ctx.version.id,
          tenantId: ctx.tenant.id,
          bankAccountId: input.bankAccountId || null,
          data: input.dataRestituicao || null,
          descricao: "Restituição a terceiro",
          valor: String(-valor),
          cat: "restituicao",
          rec: true,
        });
      }
      return rest.id;
    });

    await logAudit({
      tenantId: ctx.tenant.id,
      userId: ctx.userId,
      action: "restituicao.create",
      entity: "restituicao",
      entityId: restId,
      meta: {
        despesaTerceiroId: input.despesaTerceiroId,
        valor: Math.abs(input.valor),
        cashEntryId: input.cashEntryId ?? null,
      },
    });
    revalidatePath("/restituicoes");
    revalidatePath("/contaspagar");
    revalidatePath("/caixa");
    revalidatePath("/fluxocaixa");
    return { ok: true, restituicaoId: restId };
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Falha ao registrar restituição.";
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
  // Estorno em UMA transação: o saldo da obrigação, a remoção da restituição e
  // a compensação de caixa não podem ficar meio aplicados.
  await db.transaction(async (tx) => {
    const restituido = Math.max(0, Number(dt.valorRestituido) - valor);
    await tx
      .update(schema.despesaTerceiros)
      .set({
        valorRestituido: String(restituido),
        status: statusRestituicao(Number(dt.valorTotal), restituido),
      })
      .where(eq(schema.despesaTerceiros.id, dt.id));
    await tx.delete(schema.restituicoes).where(eq(schema.restituicoes.id, rest.id));

    if (rest.cashEntryId) {
      // A saída veio do extrato: desfaz apenas a conciliação. Lançar um estorno
      // aqui inventaria uma entrada que nunca aconteceu no banco.
      await tx
        .update(schema.cashEntries)
        .set({ rec: false })
        .where(eq(schema.cashEntries.id, rest.cashEntryId));
    } else {
      // Saída criada por nós — compensa com uma entrada de estorno.
      await tx.insert(schema.cashEntries).values({
        versionId: ctx.version.id,
        tenantId: ctx.tenant.id,
        bankAccountId: rest.bankAccountId,
        data: rest.dataRestituicao,
        descricao: "Estorno de restituição",
        valor: String(valor),
        cat: "ajuste",
        rec: true,
      });
    }
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

/**
 * Obrigações com terceiros em aberto, no formato das linhas de Contas a Pagar
 * (§11).
 *
 * Uma obrigação NÃO é uma despesa nova: a despesa já foi reconhecida na
 * competência dela e aparece em Contas a Pagar como "Pago" (quem pagou foi o
 * terceiro). O que continua em aberto é a dívida da empresa COM o terceiro —
 * é isso que estas linhas representam, com o saldo ainda devido.
 *
 * Query própria, deliberadamente separada de `getContasPagar`: aquela alimenta
 * também Dashboard, Fechamento e a conciliação do extrato, cujo comportamento
 * não deve mudar.
 */
export interface ObrigacaoContaPagarRow {
  id: string;
  obrigacaoId: string;
  numDoc: string | null;
  terceiro: string | null;
  descricao: string;
  valorSaldo: number;
  dataPrevista: string | null;
  competencia: string | null;
  status: string;
  projectId: string;
  projectName: string;
}

export async function getObrigacoesTerceiroPendentes(
  tenantId: string,
): Promise<ObrigacaoContaPagarRow[]> {
  const rows = await db
    .select({
      dt: schema.despesaTerceiros,
      numDoc: schema.despesas.numDoc,
      competencia: schema.despesas.competencia,
      terceiro: schema.stakeholders.nome,
      projectId: schema.projects.id,
      projectName: schema.projects.name,
    })
    .from(schema.despesaTerceiros)
    .innerJoin(schema.despesas, eq(schema.despesaTerceiros.despesaId, schema.despesas.id))
    .innerJoin(schema.versions, eq(schema.despesas.versionId, schema.versions.id))
    .innerJoin(schema.projects, eq(schema.versions.projectId, schema.projects.id))
    .leftJoin(
      schema.stakeholders,
      eq(schema.despesaTerceiros.pagadorTerceiroId, schema.stakeholders.id),
    )
    .where(
      and(
        eq(schema.despesaTerceiros.tenantId, tenantId),
        ne(schema.despesaTerceiros.status, "Cancelado"),
      ),
    );

  return rows
    .map((r) => ({
      id: `obr:${r.dt.id}`,
      obrigacaoId: r.dt.id,
      numDoc: r.numDoc,
      terceiro: r.terceiro,
      descricao: `Restituir a ${r.terceiro ?? "terceiro"} — ref. ${r.numDoc ?? "lançamento"}`,
      valorSaldo:
        Math.round((Number(r.dt.valorTotal) - Number(r.dt.valorRestituido)) * 100) / 100,
      dataPrevista: r.dt.dataPrevistaRestituicao,
      competencia: r.competencia,
      status: r.dt.status,
      projectId: r.projectId,
      projectName: r.projectName,
    }))
    .filter((r) => r.valorSaldo > 0.004);
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
 * Conta corrente de um terceiro (§13): todos os movimentos que formam o saldo.
 *
 * `desembolso` = o terceiro pagou um fornecedor pela empresa (aumenta a dívida).
 * `restituicao` = a empresa devolveu dinheiro a ele (diminui a dívida).
 *
 * Saldo devido = total desembolsado − total restituído.
 */
export interface MovimentoTerceiro {
  id: string;
  tipo: "desembolso" | "restituicao";
  data: string | null;
  descricao: string;
  numDoc: string | null;
  valor: number;
  /** Saldo devido acumulado APÓS este movimento. */
  saldoAcumulado: number;
}

export interface ContaCorrenteTerceiro {
  pagadorId: string | null;
  pagador: string;
  totalDesembolsado: number;
  totalRestituido: number;
  saldoDevido: number;
  movimentos: MovimentoTerceiro[];
}

/** "MM/DD/YYYY" → número comparável; sem data vai para o fim da ordenação. */
function ordData(d: string | null): number {
  const p = (d ?? "").split("/");
  if (p.length !== 3) return Number.MAX_SAFE_INTEGER;
  const n = Number(p[2]) * 10000 + Number(p[0]) * 100 + Number(p[1]);
  return Number.isFinite(n) ? n : Number.MAX_SAFE_INTEGER;
}

/**
 * Conta corrente completa de cada terceiro/sócio do tenant (§13).
 *
 * Escopo TENANT, não versão: a dívida com um sócio é da empresa e não some
 * porque o usuário trocou o projeto ativo na tela. Obrigações canceladas ficam
 * de fora do saldo, mas nada é apagado — o cancelamento é lógico.
 */
export async function getContaCorrenteTerceiros(
  tenantId: string,
): Promise<ContaCorrenteTerceiro[]> {
  const obrigacoes = await db
    .select({
      dt: schema.despesaTerceiros,
      numDoc: schema.despesas.numDoc,
      pagadorId: schema.stakeholders.id,
      pagador: schema.stakeholders.nome,
    })
    .from(schema.despesaTerceiros)
    .innerJoin(schema.despesas, eq(schema.despesaTerceiros.despesaId, schema.despesas.id))
    .leftJoin(
      schema.stakeholders,
      eq(schema.despesaTerceiros.pagadorTerceiroId, schema.stakeholders.id),
    )
    .where(eq(schema.despesaTerceiros.tenantId, tenantId));

  const ativas = obrigacoes.filter((o) => o.dt.status !== "Cancelado");
  const idsAtivas = ativas.map((o) => o.dt.id);
  const rests = idsAtivas.length
    ? await db
        .select()
        .from(schema.restituicoes)
        .where(
          and(
            eq(schema.restituicoes.tenantId, tenantId),
            sql`${schema.restituicoes.despesaTerceiroId} IN ${idsAtivas}`,
          ),
        )
    : [];
  const obrigacaoPorId = new Map(ativas.map((o) => [o.dt.id, o]));

  const contas = new Map<string, ContaCorrenteTerceiro>();
  const chaveDe = (id: string | null) => id ?? "—";
  const abrir = (id: string | null, nome: string | null): ContaCorrenteTerceiro => {
    const k = chaveDe(id);
    let c = contas.get(k);
    if (!c) {
      c = {
        pagadorId: id,
        pagador: nome ?? "Não identificado",
        totalDesembolsado: 0,
        totalRestituido: 0,
        saldoDevido: 0,
        movimentos: [],
      };
      contas.set(k, c);
    }
    return c;
  };

  for (const o of ativas) {
    const c = abrir(o.pagadorId ?? null, o.pagador);
    c.totalDesembolsado += Number(o.dt.valorTotal);
    c.movimentos.push({
      id: o.dt.id,
      tipo: "desembolso",
      data: o.dt.dataPagamentoOriginal,
      descricao: "Pagamento a fornecedor pela empresa",
      numDoc: o.numDoc,
      valor: Number(o.dt.valorTotal),
      saldoAcumulado: 0,
    });
  }
  for (const r of rests) {
    const o = obrigacaoPorId.get(r.despesaTerceiroId);
    if (!o) continue;
    const c = abrir(o.pagadorId ?? null, o.pagador);
    c.totalRestituido += Number(r.valor);
    c.movimentos.push({
      id: r.id,
      tipo: "restituicao",
      data: r.dataRestituicao,
      descricao: r.cashEntryId ? "Restituição (conciliada no extrato)" : "Restituição",
      numDoc: o.numDoc,
      valor: Number(r.valor),
      saldoAcumulado: 0,
    });
  }

  for (const c of contas.values()) {
    c.movimentos.sort((a, b) => ordData(a.data) - ordData(b.data) || a.id.localeCompare(b.id));
    let acc = 0;
    for (const m of c.movimentos) {
      acc += m.tipo === "desembolso" ? m.valor : -m.valor;
      m.saldoAcumulado = Math.round(acc * 100) / 100;
    }
    c.totalDesembolsado = Math.round(c.totalDesembolsado * 100) / 100;
    c.totalRestituido = Math.round(c.totalRestituido * 100) / 100;
    c.saldoDevido = Math.round((c.totalDesembolsado - c.totalRestituido) * 100) / 100;
  }
  return [...contas.values()].sort((a, b) => b.saldoDevido - a.saldoDevido);
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
