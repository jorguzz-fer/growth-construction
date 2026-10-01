"use server";

import { and, asc, desc, eq, ilike, ne, sql } from "drizzle-orm";
import { chaveLigada } from "@/lib/chaves-tenant";
import { montarContaCorrente, type ContaCorrenteTerceiro } from "@/lib/calc/conta-corrente";
import { chaveDataBR } from "@/lib/db/ordem-data";
import { revalidatePath } from "next/cache";
import { db, schema } from "@/lib/db";
import { getProjectContext, getTenantContext, getWorkingVersion } from "@/lib/context";
import { can } from "@/lib/permissions";
import { logAudit } from "@/lib/audit";
import { reserveDespesaNumber } from "@/lib/db/numbering";
import { statusRestituicao } from "@/lib/calc";
import { restituicaoCabe, sufixoNumericoDoPed } from "@/lib/calc/restituicao";
import { validarCategoriaDespesa } from "@/lib/calc/natureza-dre";
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
  const ctx = await getTenantContext();
  if (!ctx || !can(ctx.perms, "restituicoes", "ver")) return [];
  const q = termo.trim();
  if (q.length < 2) return [];
  const numero = sufixoNumericoDoPed(q);

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
        // Prompt T, 5 — só no PED, nunca na observação (lá "100" casava com
        // valores e com rateios escritos à mão). "70", "000070" e "PED-000070"
        // são a mesma busca: compara o sufixo numérico.
        numero != null
          ? sql`(regexp_match(${schema.despesas.numDoc}, '(\\d+)\\s*$'))[1]::bigint = ${numero}`
          : ilike(schema.despesas.numDoc, `%${q}%`),
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
  const ctx = await getTenantContext();
  if (!ctx || !can(ctx.perms, "restituicoes", "criar")) {
    return { ok: false, error: "Sem permissão para registrar despesas pagas por terceiros." };
  }
  // Obra da tela (Prompt A): a despesa nova vai para a versão de trabalho dela
  // — a mesma regra que valia para a obra do cookie.
  const version = await getWorkingVersion(ctx.tenant.id, formData.get("projectId"));
  if (!version) return { ok: false, error: "Escolha o projeto." };
  if (version.locked) return { ok: false, error: "Versão congelada." };

  const s = (k: string) => {
    const v = formData.get(k);
    return typeof v === "string" && v.trim() !== "" ? v.trim() : null;
  };
  const despesaId = s("despesaId");
  const idem = s("idempotencyKey");
  const pagadorTerceiroId = s("pagadorTerceiroId");
  // Empresa responsável escolhida no formulário: só obra desta empresa
  // (Prompt A, 38). Antes era gravada sem conferir.
  const empresaResponsavelId = s("empresaResponsavelId");
  if (empresaResponsavelId && !(await getProjectContext(ctx.tenant.id, empresaResponsavelId))) {
    return { ok: false, error: "Empresa responsável inválida." };
  }
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
        // Obrigação com terceiro é fato realizado: só PED da versão Atual, não
        // congelada (Prompt I, 11.7 e §20).
        const [vd] = await tx
          .select({ kind: schema.versions.kind, locked: schema.versions.locked })
          .from(schema.versions)
          .where(eq(schema.versions.id, d.versionId))
          .limit(1);
        if (vd?.kind !== "atual") throw new Error("O PED não está na versão Atual — obrigação só sobre o realizado.");
        if (vd.locked) throw new Error("Versão congelada — o PED não pode receber obrigação.");

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
        if (jaTem) return { obrigacaoId: jaTem.id, jaExistia: true, despesaId: d.id, statusAnterior: d.status };

        // §20 — o fornecedor JÁ foi pago (pelo terceiro): a despesa não pode
        // seguir "a pagar ao fornecedor" e, ao mesmo tempo, "a restituir ao
        // terceiro" pelo mesmo valor. Marca pago por terceiro E status "Pago"
        // (como no modo despesa nova). Valor, competência, vencimento,
        // categoria, fornecedor e PED ficam exatamente como o usuário lançou;
        // `pagoPorTerceiro` impede a despesa de contar como saída de caixa.
        if (!d.pagoPorTerceiro || d.status !== "Pago") {
          await tx
            .update(schema.despesas)
            .set({ pagoPorTerceiro: true, status: "Pago" })
            .where(eq(schema.despesas.id, d.id));
        }
        despesaAlvo = d;
        valorObrigacao = String(d.valor);
      } else {
        // ── Modo despesa nova ─────────────────────────────────────────────
        // Item 4.6 / RG-01 — a despesa criada aqui é despesa como qualquer
        // outra: não pode nascer classificada em conta de natureza credora.
        const erroCat = validarCategoriaDespesa(formData.get("categoriaDre") as string);
        if (erroCat) throw new Error(erroCat);
        const valor = (formData.get("valor") as string) || "0";
        if (!Number.isFinite(Number(valor)) || Number(valor) <= 0) {
          throw new Error("Informe um valor maior que zero para a despesa paga por terceiro.");
        }
        const numDoc = await reserveDespesaNumber(ctx.tenant.id);
        const [nova] = await tx
          .insert(schema.despesas)
          .values({
            versionId: version.id,
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
          // Sem escolha no formulário, a obra da tela (antes: a do cookie).
          empresaResponsavelId: empresaResponsavelId ?? version.projectId,
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

      return { obrigacaoId: dt.id, jaExistia: false, despesaId: despesaAlvo.id, statusAnterior: despesaId ? despesaAlvo.status : null };
    });

    if (!resultado.jaExistia) {
      await logAudit({
        tenantId: ctx.tenant.id,
        userId: ctx.userId,
        action: "despesaTerceiro.create",
        entity: "despesa_terceiro",
        entityId: resultado.obrigacaoId,
        meta: { despesaId: resultado.despesaId, vinculadoPorPed: !!despesaId, statusAnterior: resultado.statusAnterior ?? null },
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

type Exec = typeof db | Parameters<Parameters<typeof db.transaction>[0]>[0];

/** §21 — a versão (e o lock) da despesa restituída, dentro da empresa. */
async function versaoDaDespesa(exec: Exec, tenantId: string, despesaId: string) {
  const [v] = await exec
    .select({ id: schema.versions.id, locked: schema.versions.locked, projectId: schema.versions.projectId })
    .from(schema.despesas)
    .innerJoin(schema.versions, eq(schema.despesas.versionId, schema.versions.id))
    .where(and(eq(schema.despesas.id, despesaId), eq(schema.despesas.tenantId, tenantId)))
    .limit(1);
  return v ?? null;
}

export interface PreviaSaidaPorObra {
  projectId: string;
  projectName: string;
  obrigacoes: number;
  saldo: number;
}

/**
 * Prévia da chave `restituicao_segue_despesa` (§21): as obrigações pendentes
 * agrupadas pela obra da DESPESA — é nela que as próximas saídas cairão com a
 * chave ligada. Só leitura.
 */
export async function getPreviaSaidaPorObra(tenantId: string): Promise<PreviaSaidaPorObra[]> {
  const rows = await db
    .select({
      projectId: schema.projects.id,
      projectName: schema.projects.name,
      valorTotal: schema.despesaTerceiros.valorTotal,
      valorRestituido: schema.despesaTerceiros.valorRestituido,
    })
    .from(schema.despesaTerceiros)
    .innerJoin(schema.despesas, eq(schema.despesaTerceiros.despesaId, schema.despesas.id))
    .innerJoin(schema.versions, eq(schema.despesas.versionId, schema.versions.id))
    .innerJoin(schema.projects, eq(schema.versions.projectId, schema.projects.id))
    .where(and(eq(schema.despesaTerceiros.tenantId, tenantId), ne(schema.despesaTerceiros.status, "Cancelado")));
  const porObra = new Map<string, PreviaSaidaPorObra>();
  for (const r of rows) {
    const saldo = Math.round((Number(r.valorTotal) - Number(r.valorRestituido)) * 100) / 100;
    if (saldo <= 0.004) continue;
    const p = porObra.get(r.projectId) ?? { projectId: r.projectId, projectName: r.projectName, obrigacoes: 0, saldo: 0 };
    p.obrigacoes += 1;
    p.saldo = Math.round((p.saldo + saldo) * 100) / 100;
    porObra.set(r.projectId, p);
  }
  return [...porObra.values()].sort((a, b) => b.saldo - a.saldo);
}

/** §22 — o item do extrato existe e é desta empresa? */
async function cashEntryDoTenant(tenantId: string, cashEntryId: string): Promise<boolean> {
  const [c] = await db
    .select({ id: schema.cashEntries.id })
    .from(schema.cashEntries)
    .where(and(eq(schema.cashEntries.id, cashEntryId), eq(schema.cashEntries.tenantId, tenantId)))
    .limit(1);
  return !!c;
}

export interface RestituicaoInput {
  despesaTerceiroId: string;
  /** obra da tela (Prompt A): a saída de caixa vai para a versão de trabalho dela. */
  projectId: string;
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
  const ctx = await getTenantContext();
  if (!ctx || !can(ctx.perms, "restituicoes", "editar")) {
    return { ok: false, error: "Sem permissão para registrar restituições." };
  }
  // Obra da tela (Prompt A): a saída de caixa nova vai para a versão de
  // trabalho dela. Só é exigida quando há saída a criar (sem item do extrato).
  // §21 (B11, opção 2) — com a chave ligada, a saída de caixa segue a despesa
  // restituída; desligada, cai na obra da tela, como sempre.
  const segueDespesa = await chaveLigada(ctx.tenant.id, "restituicao_segue_despesa");
  const versaoCaixa = input.cashEntryId || segueDespesa
    ? null
    : await getWorkingVersion(ctx.tenant.id, input.projectId);
  if (!input.cashEntryId && !segueDespesa && !versaoCaixa) return { ok: false, error: "Escolha o projeto." };
  if (versaoCaixa?.locked) return { ok: false, error: "Versão congelada — restituição bloqueada." };
  // §22 — id de extrato vindo do navegador só vale se for desta empresa.
  if (input.cashEntryId && !(await cashEntryDoTenant(ctx.tenant.id, input.cashEntryId))) {
    return { ok: false, error: "Lançamento do extrato não encontrado." };
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
      const versaoDaSaida = input.cashEntryId
        ? null
        : segueDespesa
          ? await versaoDaDespesa(tx, ctx.tenant.id, dt.despesaId)
          : versaoCaixa;
      if (!input.cashEntryId && !versaoDaSaida) throw new Error("Versão da despesa não encontrada.");
      if (versaoDaSaida?.locked) throw new Error("Versão congelada — restituição bloqueada.");

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
          .where(and(eq(schema.restituicoes.tenantId, ctx.tenant.id), eq(schema.restituicoes.cashEntryId, input.cashEntryId)))
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
          .where(and(eq(schema.cashEntries.id, input.cashEntryId), eq(schema.cashEntries.tenantId, ctx.tenant.id)));
      } else {
        await tx.insert(schema.cashEntries).values({
          versionId: versaoDaSaida!.id,
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
        caixaSegueDespesa: segueDespesa,
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

/**
 * Cancela uma restituição: estorna o valor e a saída de caixa (compensação).
 * `projectId` é a obra da tela (Prompt A): o estorno de caixa vai para a
 * versão de trabalho dela, como antes ia para a da obra do cookie.
 */
export type ResultadoCancelamento = { ok: true } | { ok: false; error: string };

/**
 * Cancela uma restituição (Prompt I, §24): a linha FICA, marcada como
 * cancelada, com quem, quando e por quê; o saldo da obrigação volta; e o
 * caixa recebe a contrapartida (estorno) — ou, se a saída veio do extrato,
 * só a conciliação é desfeita. Tudo numa transação. Antes era DELETE físico.
 */
export async function cancelarRestituicao(
  restituicaoId: string,
  projectId: string,
  motivo?: string,
): Promise<ResultadoCancelamento> {
  const ctx = await getTenantContext();
  if (!ctx || !can(ctx.perms, "restituicoes", "excluir")) {
    return { ok: false, error: "Sem permissão para cancelar restituições." };
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
  if (!rest) return { ok: false, error: "Restituição não encontrada." };
  if (rest.cancelada) return { ok: false, error: "Esta restituição já está cancelada." };
  const [dt] = await db
    .select()
    .from(schema.despesaTerceiros)
    .where(and(eq(schema.despesaTerceiros.id, rest.despesaTerceiroId), eq(schema.despesaTerceiros.tenantId, ctx.tenant.id)))
    .limit(1);
  if (!dt) return { ok: false, error: "Obrigação não encontrada." };
  // §21 (B11) — o estorno cai onde a saída cairia hoje: na obra da despesa com
  // a chave ligada; na obra da tela, desligada.
  const segueDespesa = await chaveLigada(ctx.tenant.id, "restituicao_segue_despesa");
  const versaoCaixa = rest.cashEntryId
    ? null
    : segueDespesa
      ? await versaoDaDespesa(db, ctx.tenant.id, dt.despesaId)
      : await getWorkingVersion(ctx.tenant.id, projectId);
  if (!rest.cashEntryId && !versaoCaixa) return { ok: false, error: segueDespesa ? "Versão da despesa não encontrada." : "Escolha o projeto." };
  if (versaoCaixa?.locked) return { ok: false, error: "Versão congelada — estorno bloqueado." };

  const valor = Number(rest.valor);
  const hoje = new Date();
  const canceladaEm = `${String(hoje.getMonth() + 1).padStart(2, "0")}/${String(hoje.getDate()).padStart(2, "0")}/${hoje.getFullYear()}`;
  // Estorno em UMA transação: o saldo da obrigação, a marcação da restituição e
  // a compensação de caixa não podem ficar meio aplicados.
  let devolucoes: { id: string; valor: number }[] = [];
  await db.transaction(async (tx) => {
    // §23 — restituição em lote: desfaz cada abatimento na SUA obrigação, pelo
    // que `restituicao_item` gravou (100 = A 30 + B 70 devolve 30 a A e 70 a
    // B). Só a avulsa, sem itens, devolve o valor inteiro à obrigação âncora.
    const itens = await tx
      .select({ despesaTerceiroId: schema.restituicaoItens.despesaTerceiroId, valor: schema.restituicaoItens.valorAbatido })
      .from(schema.restituicaoItens)
      .where(and(eq(schema.restituicaoItens.tenantId, ctx.tenant.id), eq(schema.restituicaoItens.restituicaoId, rest.id)));
    devolucoes = itens.length > 0 ? itens.map((i) => ({ id: i.despesaTerceiroId, valor: Number(i.valor) })) : [{ id: dt.id, valor }];
    for (const dev of devolucoes) {
      const [o] = await tx
        .select()
        .from(schema.despesaTerceiros)
        .where(and(eq(schema.despesaTerceiros.id, dev.id), eq(schema.despesaTerceiros.tenantId, ctx.tenant.id)))
        .for("update");
      if (!o) throw new Error("Obrigação abatida não encontrada.");
      const restituido = Math.max(0, Math.round((Number(o.valorRestituido) - dev.valor) * 100) / 100);
      await tx
        .update(schema.despesaTerceiros)
        .set({
          valorRestituido: String(restituido),
          status: statusRestituicao(Number(o.valorTotal), restituido),
        })
        .where(eq(schema.despesaTerceiros.id, o.id));
    }
    await tx
      .update(schema.restituicoes)
      .set({
        cancelada: true,
        canceladaEm,
        canceladaPor: ctx.userEmail || ctx.userId || null,
        motivoCancelamento: motivo?.trim() || null,
      })
      .where(eq(schema.restituicoes.id, rest.id));

    if (rest.cashEntryId) {
      // A saída veio do extrato: desfaz apenas a conciliação. Lançar um estorno
      // aqui inventaria uma entrada que nunca aconteceu no banco.
      await tx
        .update(schema.cashEntries)
        .set({ rec: false })
        .where(and(eq(schema.cashEntries.id, rest.cashEntryId), eq(schema.cashEntries.tenantId, ctx.tenant.id)));
    } else {
      // Saída criada por nós — compensa com uma entrada de estorno.
      await tx.insert(schema.cashEntries).values({
        versionId: versaoCaixa!.id,
        tenantId: ctx.tenant.id,
        bankAccountId: rest.bankAccountId,
        data: rest.dataRestituicao,
        descricao: "Estorno de restituição",
        valor: String(valor),
        cat: "ajuste",
        rec: true,
      });
    }
    await logAudit(
      {
        tenantId: ctx.tenant.id,
        userId: ctx.userId,
        action: "restituicao.cancel",
        entity: "restituicao",
        entityId: rest.id,
        meta: { despesaTerceiroId: dt.id, valor, motivo: motivo?.trim() || null, dataRestituicao: rest.dataRestituicao, itens: devolucoes.length },
      },
      tx,
    );
  });
  revalidatePath("/restituicoes");
  revalidatePath("/contaspagar");
  revalidatePath("/caixa");
  revalidatePath("/fluxocaixa");
  return { ok: true };
}

export interface DespesaTerceiroView {
  id: string;
  numDoc: string | null;
  pagador: string | null;
  projectId: string;
  projectName: string;
  valorTotal: number;
  valorRestituido: number;
  saldoPendente: number;
  dataPagamentoOriginal: string | null;
  dataPrevistaRestituicao: string | null;
  status: string;
}

/**
 * Lista as obrigações (paga por terceiro) da EMPRESA, com pagador e obra
 * (Prompt T, 6): a dívida com um terceiro é da empresa e não some porque o
 * usuário trocou de obra — o mesmo escopo da conta corrente. O filtro por obra
 * é da tela. `versionId` (opcional) mantém a leitura antiga por versão para
 * quem ainda a usar.
 */
export async function getDespesaTerceiros(
  tenantId: string,
  versionId?: string | null,
): Promise<DespesaTerceiroView[]> {
  const rows = await db
    .select({
      dt: schema.despesaTerceiros,
      numDoc: schema.despesas.numDoc,
      pagador: schema.stakeholders.nome,
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
        versionId ? eq(schema.despesas.versionId, versionId) : undefined,
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
      projectId: r.projectId,
      projectName: r.projectName,
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

export type { ContaCorrenteTerceiro, MovimentoTerceiro } from "@/lib/calc/conta-corrente";

/**
 * Conta corrente completa de cada terceiro/sócio do tenant (§13, §26).
 *
 * Escopo TENANT, não versão: a dívida com um sócio é da empresa e não some
 * porque o usuário trocou o projeto na tela. UMA lógica de movimentos
 * (`montarContaCorrente`): desembolso, restituição, estorno, recebimento pelo
 * terceiro, repasse e compensação. O saldo daqui bate com
 * `valorTotal − valorRestituido` das obrigações, que já inclui compensações.
 * Obrigações canceladas ficam de fora; nada é apagado.
 */
export async function getContaCorrenteTerceiros(
  tenantId: string,
): Promise<ContaCorrenteTerceiro[]> {
  const [obrigacoes, restituicoes, recebimentos, repasses, compensacoes] = await Promise.all([
    db
      .select({
        dt: schema.despesaTerceiros,
        numDoc: schema.despesas.numDoc,
        pagadorId: schema.stakeholders.id,
        pagador: schema.stakeholders.nome,
      })
      .from(schema.despesaTerceiros)
      .innerJoin(schema.despesas, eq(schema.despesaTerceiros.despesaId, schema.despesas.id))
      .leftJoin(schema.stakeholders, eq(schema.despesaTerceiros.pagadorTerceiroId, schema.stakeholders.id))
      .where(eq(schema.despesaTerceiros.tenantId, tenantId)),
    db.select().from(schema.restituicoes).where(eq(schema.restituicoes.tenantId, tenantId)),
    db
      .select({ r: schema.recebimentosTerceiros, recebedor: schema.stakeholders.nome })
      .from(schema.recebimentosTerceiros)
      .leftJoin(schema.stakeholders, eq(schema.recebimentosTerceiros.recebedorTerceiroId, schema.stakeholders.id))
      .where(eq(schema.recebimentosTerceiros.tenantId, tenantId)),
    db.select().from(schema.repasses).where(eq(schema.repasses.tenantId, tenantId)),
    db.select().from(schema.compensacoes).where(eq(schema.compensacoes.tenantId, tenantId)),
  ]);
  return montarContaCorrente({
    obrigacoes: obrigacoes.map((o) => ({
      id: o.dt.id,
      pagadorId: o.pagadorId ?? null,
      pagador: o.pagador,
      valorTotal: Number(o.dt.valorTotal),
      data: o.dt.dataPagamentoOriginal,
      numDoc: o.numDoc,
      cancelada: o.dt.status === "Cancelado",
    })),
    restituicoes: restituicoes.map((r) => ({
      id: r.id,
      despesaTerceiroId: r.despesaTerceiroId,
      valor: Number(r.valor),
      data: r.dataRestituicao,
      cancelada: r.cancelada,
      canceladaEm: r.canceladaEm,
      conciliada: !!r.cashEntryId,
    })),
    recebimentos: recebimentos.map((x) => ({
      id: x.r.id,
      recebedorId: x.r.recebedorTerceiroId,
      recebedor: x.recebedor,
      valorTotal: Number(x.r.valorTotal),
      data: x.r.dataRecebimento,
      cancelado: x.r.status === "Cancelado",
    })),
    repasses: repasses.map((p) => ({ id: p.id, recebimentoId: p.recebimentoTerceiroId, valor: Number(p.valor), data: p.dataRepasse })),
    compensacoes: compensacoes.map((k) => ({ id: k.id, terceiroId: k.terceiroId, valor: Number(k.valor), data: k.data, numDoc: k.numDoc })),
  });
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
    .orderBy(asc(chaveDataBR(schema.despesaTerceiros.dataPrevistaRestituicao)), asc(schema.despesaTerceiros.id));
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
