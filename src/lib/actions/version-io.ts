"use server";

import { and, eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { db, schema } from "@/lib/db";
import { getActiveContext } from "@/lib/context";
import { can } from "@/lib/permissions";
import { logAudit } from "@/lib/audit";
import { parseWorkbook } from "@/lib/xlsx/growth-template";

export interface ImportResult {
  units: number;
  reembolsos: number;
  permutas: number;
  despesas: number;
  incc: number;
}

/**
 * Importa uma planilha (formato Growth Tools) para a VERSÃO ATIVA, substituindo
 * os dados de cada categoria que vier preenchida na planilha (unidades,
 * reembolsos, permutas, despesas). O INCC é de projeto e é atualizado por mês.
 * Categorias com aba vazia são preservadas.
 */
export async function importVersionData(formData: FormData): Promise<ImportResult> {
  const ctx = await getActiveContext();
  if (!ctx || !can(ctx.perms, "versao", "editar")) {
    throw new Error("Sem permissão para importar dados.");
  }
  if (ctx.version.locked) {
    throw new Error("Versão congelada — descongele para importar.");
  }
  const file = formData.get("file") as File | null;
  if (!file || file.size === 0) throw new Error("Selecione uma planilha.");

  const parsed = parseWorkbook(await file.arrayBuffer());
  const vId = ctx.version.id;
  const tId = ctx.tenant.id;
  const result: ImportResult = { units: 0, reembolsos: 0, permutas: 0, despesas: 0, incc: 0 };

  await db.transaction(async (tx) => {
    if (parsed.units.length) {
      await tx.delete(schema.units).where(eq(schema.units.versionId, vId));
      await tx.insert(schema.units).values(
        parsed.units.map((u) => ({
          versionId: vId, tenantId: tId, code: u.code, bloco: u.bloco || null,
          tipo: u.tipo || null, m2: u.m2 != null ? String(u.m2) : null,
          andar: u.andar, valor: String(u.valor), status: u.status,
          mesVenda: u.mesVenda || null, paymentPlan: u.plan,
        })),
      );
      result.units = parsed.units.length;
    }

    if (parsed.reembolsos.length) {
      await tx.delete(schema.reembolsos).where(eq(schema.reembolsos.versionId, vId));
      await tx.insert(schema.reembolsos).values(
        parsed.reembolsos.map((r) => ({
          versionId: vId, tenantId: tId, data: r.data || null, origem: r.origem || null,
          valor: String(r.valor), pct: r.pct || null, obs: r.obs || null,
          serial: r.serial, status: "received",
        })),
      );
      result.reembolsos = parsed.reembolsos.length;
    }

    if (parsed.permutas.length) {
      await tx.delete(schema.permutas).where(eq(schema.permutas.versionId, vId));
      await tx.insert(schema.permutas).values(
        parsed.permutas.map((p) => ({
          versionId: vId, tenantId: tId, unitCode: p.unitCode || null, cliente: p.cliente || null,
          dataRecebimento: p.dataRecebimento || null, tipo: p.tipo || null, descricao: p.descricao || null,
          estimado: String(p.estimado), status: p.status || null, dataVenda: p.dataVenda || null,
          valorVenda: String(p.valorVenda), tipoPermuta: p.tipoPermuta || null, obs: p.obs || null,
        })),
      );
      result.permutas = parsed.permutas.length;
    }

    if (parsed.despesas.length) {
      await tx.delete(schema.despesas).where(eq(schema.despesas.versionId, vId));
      await tx.insert(schema.despesas).values(
        parsed.despesas.map((d) => ({
          versionId: vId, tenantId: tId, contaCef: d.contaCef, categoriaDre: "Custo Variável" as const,
          competencia: d.competencia, vencimento: d.vencimento, valor: String(d.valor), status: "A pagar",
        })),
      );
      result.despesas = parsed.despesas.length;
    }

    // INCC (por projeto): atualiza mês a mês.
    for (const r of parsed.incc) {
      await tx
        .update(schema.inccRates)
        .set({ monthly: String(r.monthly), accumulated: String(r.accumulated) })
        .where(and(eq(schema.inccRates.projectId, ctx.project.id), eq(schema.inccRates.mes, r.mes)));
    }
    result.incc = parsed.incc.length;
  });

  await logAudit({
    tenantId: tId, userId: ctx.userId, action: "version.import",
    entity: "version", entityId: vId, meta: result,
  });
  revalidatePath("/", "layout");
  return result;
}
