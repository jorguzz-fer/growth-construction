"use server";

import { and, eq, sql } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { db, schema } from "@/lib/db";
import { getTenantContext } from "@/lib/context";
import { getAtualVersion } from "@/lib/queries";
import { can } from "@/lib/permissions";
import { logAudit } from "@/lib/audit";
import { emptyPlan } from "@/lib/calc/plan";
import type { PaymentPlan, UnitStatus } from "@/lib/calc/types";
import { statusLiberaUnidade } from "@/lib/clientes-regras";
import {
  codigoNormalizado,
  patchDeAtualizacao,
  prepararImportacao,
  type LinhaIgnorada,
  type LinhaImportacao,
} from "@/lib/unidade-importacao";
import {
  bloqueiosDeExclusaoUnidade,
  confirmacaoDeUnidadeConfere,
  unidadeVendida,
  type VinculosDaUnidade,
} from "@/lib/unidade-regras";

export interface SaveUnitInput {
  id?: string;
  /** projeto ao qual a unidade/venda pertence (grava na versão Atual dele). */
  projectId?: string;
  /** item comercializável: unidade individual ou condomínio inteiro. */
  itemType?: "unidade" | "condominio";
  code: string;
  bloco?: string;
  tipo?: string;
  m2?: number;
  andar?: number;
  valor: number;
  status: UnitStatus;
  mesVenda?: string;
  plan: PaymentPlan;
  /** De onde veio o preenchimento — fica na auditoria (Prompt J, 6.3). */
  origem?: "formulario" | "assistente";
}

/** Resultado legível das actions de unidade (Prompt J, 5.1). */
export type ResultadoUnidade = { ok: true; id: string; code: string } | { ok: false; error: string };

/**
 * Cria ou edita a unidade na versão Atual do projeto escolhido. Devolve
 * `{ ok, error }` em vez de lançar: em produção a mensagem lançada vira um
 * digest genérico e o usuário não sabe por que não gravou (Prompt J, 5.1).
 * Quem navega é a tela, com o resultado em mãos.
 */
export async function saveUnit(input: SaveUnitInput): Promise<ResultadoUnidade> {
  const ctx = await getTenantContext();
  if (!ctx || !can(ctx.perms, "unidades", input.id ? "editar" : "criar")) {
    return { ok: false, error: "Sem permissão para editar unidades." };
  }
  // Sem "projeto ativo" (Prompt A): a venda vai para a versão Atual do projeto
  // escolhido — obrigatório. Antes, sem projeto, caía na obra do cookie; na
  // edição, isso MOVIA a unidade para aquela obra.
  const projectId = input.projectId || "";
  if (!projectId) return { ok: false, error: "Escolha o projeto da unidade." };
  // getAtualVersion filtra o tenant: projeto de outra empresa não tem versão.
  const version = await getAtualVersion(ctx.tenant.id, projectId);
  if (!version) return { ok: false, error: "Projeto sem versão Atual." };
  if (version.locked) return { ok: false, error: "Versão congelada — edição bloqueada." };
  const valor = Number(input.valor ?? 0);
  if (!Number.isFinite(valor) || valor < 0) return { ok: false, error: "Valor (VGV) inválido." };
  const origem = input.origem === "assistente" ? "assistente" : "formulario";

  const values = {
    versionId: version.id,
    tenantId: ctx.tenant.id,
    itemType: input.itemType === "condominio" ? ("condominio" as const) : ("unidade" as const),
    code: input.code.trim() || "SEM CÓDIGO",
    bloco: input.bloco || null,
    tipo: input.tipo || null,
    m2: input.m2 != null ? String(input.m2) : null,
    andar: input.andar ?? null,
    valor: String(valor),
    status: input.status,
    mesVenda: input.mesVenda || null,
    paymentPlan: input.plan,
    updatedAt: new Date(),
  };

  let id: string;
  if (input.id) {
    const [row] = await db
      .update(schema.units)
      .set(values)
      .where(
        and(
          eq(schema.units.id, input.id),
          eq(schema.units.tenantId, ctx.tenant.id),
        ),
      )
      .returning({ id: schema.units.id });
    // Antes, id de outra empresa (ou inexistente) "salvava" sem tocar em nada.
    if (!row) return { ok: false, error: "Unidade não encontrada." };
    id = row.id;
    await logAudit({
      tenantId: ctx.tenant.id,
      userId: ctx.userId,
      action: "unit.update",
      entity: "unit",
      entityId: id,
      meta: { code: values.code, status: values.status, origem },
    });
  } else {
    const [row] = await db.insert(schema.units).values(values).returning({ id: schema.units.id });
    id = row.id;
    await logAudit({
      tenantId: ctx.tenant.id,
      userId: ctx.userId,
      action: "unit.create",
      entity: "unit",
      entityId: id,
      meta: { code: values.code, status: values.status, origem },
    });
  }

  revalidatePath("/unidades");
  return { ok: true, id, code: values.code };
}

export type ImportUnitRow = LinhaImportacao;

export interface RelatorioImportacaoUnidades {
  inseridas: number;
  atualizadas: number;
  ignoradas: LinhaIgnorada[];
}

export type ResultadoImportacaoUnidades = ({ ok: true } & RelatorioImportacaoUnidades) | { ok: false; error: string };

const CAMPOS_ATUALIZAVEIS = ["bloco", "tipo", "m2", "andar", "valor", "status"] as const;

/**
 * Importa unidades em lote (ex.: de uma planilha XLSX). Devolve `{ ok, error }`
 * (Prompt J, 5.1); a mensagem chega inteira à tela.
 *
 * 4.1 — decide por (versão, código): código que já existe é **atualizado**,
 * nunca inserido de novo. 4.2 — a atualização só toca bloco, tipo, m², andar,
 * valor e status, e só o que veio preenchido; **nunca o plano de pagamento**
 * (a inserção grava `emptyPlan()`; a atualização não passa perto dele), nem a
 * data da venda, nem o tipo de cadastro. 4.4 — relata inseridas, atualizadas
 * e ignoradas com motivo. Tudo numa transação, com as unidades da versão
 * travadas: duas importações ao mesmo tempo não se atropelam.
 */
export async function importUnits(
  rows: ImportUnitRow[],
  projectId?: string,
): Promise<ResultadoImportacaoUnidades> {
  const ctx = await getTenantContext();
  if (!ctx || !can(ctx.perms, "unidades", "criar")) {
    return { ok: false, error: "Sem permissão para importar unidades." };
  }
  if (!projectId) return { ok: false, error: "Escolha o projeto das unidades." };
  const version = await getAtualVersion(ctx.tenant.id, projectId);
  if (!version) return { ok: false, error: "Projeto sem versão Atual." };
  // 11.10 — a trava vale também pela planilha, não só pela tela.
  if (version.locked) return { ok: false, error: "Versão congelada — importação bloqueada." };
  const { validas, ignoradas } = prepararImportacao(rows);
  if (validas.length === 0) return { ok: true, inseridas: 0, atualizadas: 0, ignoradas };

  const inseridas: string[] = [];
  const atualizadas: { code: string; antes: Record<string, unknown>; depois: Record<string, unknown> }[] = [];
  try {
    await db.transaction(async (tx) => {
      const existentes = await tx
        .select()
        .from(schema.units)
        .where(and(eq(schema.units.tenantId, ctx.tenant.id), eq(schema.units.versionId, version.id)))
        .for("update");
      const porCodigo = new Map(existentes.map((u) => [codigoNormalizado(u.code), u]));
      for (const r of validas) {
        const atual = porCodigo.get(r.code);
        if (atual) {
          const depois = patchDeAtualizacao(r);
          const antes: Record<string, unknown> = {};
          for (const k of CAMPOS_ATUALIZAVEIS) if (k in depois) antes[k] = atual[k];
          if (Object.keys(depois).length > 0) {
            await tx
              .update(schema.units)
              .set({ ...depois, updatedAt: new Date() })
              .where(and(eq(schema.units.id, atual.id), eq(schema.units.tenantId, ctx.tenant.id)));
          }
          atualizadas.push({ code: atual.code, antes, depois });
        } else {
          await tx
            .insert(schema.units)
            .values({
              versionId: version.id,
              tenantId: ctx.tenant.id,
              code: r.code,
              bloco: r.bloco?.trim() || null,
              tipo: r.tipo?.trim() || null,
              m2: r.m2 != null ? String(r.m2) : null,
              andar: r.andar ?? null,
              valor: String(r.valor ?? 0),
              status: r.status ?? "Disponivel",
              paymentPlan: emptyPlan(),
            });
          inseridas.push(r.code);
        }
      }
      await logAudit(
        {
          tenantId: ctx.tenant.id,
          userId: ctx.userId,
          action: "unit.import",
          entity: "unit",
          meta: { projectId, versionId: version.id, inseridas, atualizadas, ignoradas },
        },
        tx,
      );
    });
  } catch (e) {
    // Índice único (0046): outra importação inseriu o mesmo código no meio.
    if (codigoDoErroPg(e) === "23505") {
      return { ok: false, error: "Um código já foi cadastrado nesta versão por outra importação. Recarregue a lista e tente de novo." };
    }
    throw e;
  }
  revalidatePath("/unidades");
  return { ok: true, inseridas: inseridas.length, atualizadas: atualizadas.length, ignoradas };
}

/** SQLSTATE do erro do Postgres, esteja ele solto ou embrulhado pelo drizzle (`cause`). */
function codigoDoErroPg(e: unknown): string | undefined {
  const direto = (e as { code?: string } | null)?.code;
  if (typeof direto === "string") return direto;
  return (e as { cause?: { code?: string } } | null)?.cause?.code;
}

export type ResultadoExclusaoUnidade = { ok: true } | { ok: false; error: string };

/**
 * Exclui uma unidade (§12): exige o código digitado, recusa com cliente de
 * contrato ativo, venda, contas a receber, documentos ou permutas, e em
 * versão congelada. A auditoria guarda código, valor, status e obra —
 * antes, só o id.
 */
export async function deleteUnit(id: string, confirmacao?: string): Promise<ResultadoExclusaoUnidade> {
  const ctx = await getTenantContext();
  if (!ctx || !can(ctx.perms, "unidades", "excluir")) {
    return { ok: false, error: "Sem permissão para excluir unidades." };
  }
  const [alvo] = await db
    .select({ u: schema.units, locked: schema.versions.locked, projectId: schema.versions.projectId })
    .from(schema.units)
    .innerJoin(schema.versions, eq(schema.units.versionId, schema.versions.id))
    .where(and(eq(schema.units.id, id), eq(schema.units.tenantId, ctx.tenant.id), eq(schema.versions.tenantId, ctx.tenant.id)))
    .limit(1);
  if (!alvo) return { ok: false, error: "Unidade não encontrada." };
  const u = alvo.u;
  if (alvo.locked) return { ok: false, error: "Versão congelada — exclusão bloqueada." };
  if (!confirmacaoDeUnidadeConfere(confirmacao, u.code)) {
    return { ok: false, error: `Para excluir, digite o código da unidade (${u.code}).` };
  }
  const bloqueios = bloqueiosDeExclusaoUnidade(await vinculosDaUnidade(ctx.tenant.id, u, alvo.projectId));
  if (bloqueios.length) return { ok: false, error: `Não é possível excluir: ${bloqueios.join("; ")}.` };

  await db
    .delete(schema.units)
    .where(
      and(eq(schema.units.id, id), eq(schema.units.tenantId, ctx.tenant.id)),
    );
  await logAudit({
    tenantId: ctx.tenant.id,
    userId: ctx.userId,
    action: "unit.delete",
    entity: "unit",
    entityId: id,
    // 5.2 — o plano de pagamento removido fica na auditoria: é o que se perde.
    meta: { code: u.code, valor: u.valor, status: u.status, projectId: alvo.projectId, versionId: u.versionId, paymentPlan: u.paymentPlan ?? null },
  });
  revalidatePath("/unidades");
  return { ok: true };
}

/** Vínculos que impedem apagar a unidade (§12). Só leitura. */
async function vinculosDaUnidade(
  tenantId: string,
  u: { code: string; status: string; mesVenda: string | null; versionId: string },
  projectId: string,
): Promise<VinculosDaUnidade> {
  const n = async (q: Promise<{ n: number }[]>) => (await q)[0]?.n ?? 0;
  const count = sql<number>`count(*)::int`;
  const clientes = await db
    .select({ nome: schema.clientes.nomeCompleto, status: schema.clientes.statusContrato })
    .from(schema.clientes)
    .where(and(eq(schema.clientes.tenantId, tenantId), eq(schema.clientes.unitCode, u.code)));
  const comContrato = clientes.find((c) => !statusLiberaUnidade(c.status));
  const [contasReceber, documentos, permutas] = await Promise.all([
    n(
      db
        .select({ n: count })
        .from(schema.contasReceber)
        .where(and(eq(schema.contasReceber.tenantId, tenantId), eq(schema.contasReceber.projectId, projectId), eq(schema.contasReceber.unitCode, u.code), eq(schema.contasReceber.cancelado, false))),
    ),
    n(db.select({ n: count }).from(schema.documents).where(and(eq(schema.documents.tenantId, tenantId), eq(schema.documents.unitCode, u.code)))),
    n(db.select({ n: count }).from(schema.permutas).where(and(eq(schema.permutas.tenantId, tenantId), eq(schema.permutas.versionId, u.versionId), eq(schema.permutas.unitCode, u.code)))),
  ]);
  return { clienteComContrato: comContrato?.nome ?? null, vendida: unidadeVendida(u), contasReceber, documentos, permutas };
}
