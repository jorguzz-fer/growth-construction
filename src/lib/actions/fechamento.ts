"use server";

import { eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { db, schema } from "@/lib/db";
import { getActiveContext } from "@/lib/context";
import { can } from "@/lib/permissions";
import { logAudit } from "@/lib/audit";

export interface PendenteInput {
  tipo: "pagar" | "receber";
  refId: string;
  descricao: string;
  valor: number;
  vencimento: string | null;
}

export interface CloseDiaInput {
  /** dia do fechamento, "MM/DD/YYYY". */
  dia: string;
  projectId?: string | null;
  saldoInicial: number;
  totalEntradas: number;
  totalSaidas: number;
  divergencias: number;
  obs?: string;
  /** contas a pagar/receber ainda pendentes → transferidas para o dia seguinte. */
  pendentes: PendenteInput[];
}

/** Próximo dia de uma data "MM/DD/YYYY". */
function nextDayBR(dia: string): string {
  const p = dia.split("/");
  if (p.length !== 3) return dia;
  const d = new Date(Number(p[2]), Number(p[0]) - 1, Number(p[1]) + 1);
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  const dd = String(d.getDate()).padStart(2, "0");
  return `${mm}/${dd}/${d.getFullYear()}`;
}

/**
 * Registra o fechamento operacional de um dia (Balanço do Dia) e transfere as
 * pendências (contas a pagar/receber não liquidadas) para o dia seguinte,
 * mantendo histórico de auditoria.
 */
export async function closeDia(input: CloseDiaInput): Promise<void> {
  const ctx = await getActiveContext();
  if (!ctx || !can(ctx.perms, "fechamento", "criar")) {
    throw new Error("Sem permissão para fechar o caixa.");
  }
  const saldoFinal =
    Number(input.saldoInicial) + Number(input.totalEntradas) - Number(input.totalSaidas);

  const [me] = ctx.userId
    ? await db
        .select({ name: schema.users.name, email: schema.users.email })
        .from(schema.users)
        .where(eq(schema.users.id, ctx.userId))
        .limit(1)
    : [];
  const responsavelNome = me?.name || me?.email || ctx.userEmail || "—";
  const toDia = nextDayBR(input.dia);

  await db.transaction(async (tx) => {
    const [closing] = await tx
      .insert(schema.dailyClosings)
      .values({
        tenantId: ctx.tenant.id,
        projectId: input.projectId ?? null,
        dia: input.dia,
        saldoInicial: String(input.saldoInicial),
        totalEntradas: String(input.totalEntradas),
        totalSaidas: String(input.totalSaidas),
        saldoFinal: String(saldoFinal),
        divergencias: String(input.divergencias),
        responsavelId: ctx.userId,
        responsavelNome,
        obs: input.obs || null,
      })
      .returning();

    if (input.pendentes.length) {
      await tx.insert(schema.carryOvers).values(
        input.pendentes.map((p) => ({
          tenantId: ctx.tenant.id,
          closingId: closing.id,
          tipo: p.tipo,
          refId: p.refId,
          descricao: p.descricao,
          valor: String(p.valor),
          vencimento: p.vencimento,
          fromDia: input.dia,
          toDia,
        })),
      );
    }
  });

  await logAudit({
    tenantId: ctx.tenant.id,
    userId: ctx.userId,
    action: "caixa.fechamento",
    entity: "daily_closing",
    entityId: input.dia,
    meta: {
      dia: input.dia,
      saldoFinal,
      pendentes: input.pendentes.length,
      transferidasPara: toDia,
    },
  });

  revalidatePath("/fechamento");
  revalidatePath("/balancodia");
}
