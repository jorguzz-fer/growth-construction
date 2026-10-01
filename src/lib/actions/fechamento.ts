"use server";

import { and, eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { db, schema } from "@/lib/db";
import { getTenantContext } from "@/lib/context";
import { can } from "@/lib/permissions";
import { logAudit } from "@/lib/audit";
import { hojeISO } from "@/lib/despesa-status";
import { cadeiaDaEmpresa } from "@/lib/cadeia-da-empresa";
import { recusaDoFechamento, resumoParaFechar } from "@/lib/calc/cadeia-caixa";

type Resultado = { ok: true; id: string } | { ok: false; error: string };
const ISO = /^\d{4}-\d{2}-\d{2}$/;
const brDe = (iso: string) => `${iso.slice(5, 7)}/${iso.slice(8, 10)}/${iso.slice(0, 4)}`;
const violouUnico = (e: unknown) => {
  const x = e as { code?: string; cause?: { code?: string } };
  return x?.code === "23505" || x?.cause?.code === "23505" || /daily_closing_tenant_dia_aberto_uq/.test(String(e));
};

/**
 * Prompt L, Parte 9 — fechar o dia é ação no cartão da cadeia. TUDO é
 * calculado no servidor pela mesma cadeia que a tela mostra (9.2): saldo
 * inicial = conciliado inicial do dia (que é o final gravado do anterior
 * quando ele está fechado), divergência = em conta − conciliado (9.4),
 * classificada nas naturezas. Fechar duas vezes é impedido aqui e no banco
 * (9.5). Fechar NÃO trava lançamento (9.6): é registro. `carry_over` não é
 * mais gravado (9.7). O fechamento é sempre do tenant inteiro (9.9) e a
 * auditoria aponta o id da linha.
 */
export async function fecharDia(input: { dia: string; obs?: string | null }): Promise<Resultado> {
  const ctx = await getTenantContext();
  if (!ctx || !can(ctx.perms, "fechamento", "criar")) {
    return { ok: false, error: "Fechar o dia exige a permissão \"Fechar o dia (no Caixa): criar\", que o seu usuário não tem." };
  }
  const dia = (input.dia ?? "").trim();
  if (!ISO.test(dia)) return { ok: false, error: "Dia inválido." };
  const hoje = hojeISO();
  const diasPassados = Math.round((Date.parse(hoje) - Date.parse(dia)) / 86_400_000);
  if (diasPassados < 0) return { ok: false, error: "Não se fecha dia futuro: o banco ainda não registrou nada nele." };
  const { cadeia } = await cadeiaDaEmpresa(ctx.tenant.id, { hojeISO: hoje, diasPassados: Math.min(diasPassados, 3660), diasFuturos: 0 });
  const d = cadeia.dias.find((x) => x.dia === dia);
  const recusa = recusaDoFechamento(d, hoje);
  if (recusa || !d) return { ok: false, error: recusa ?? "Dia fora da cadeia calculada." };
  const r = resumoParaFechar(d);

  const [me] = ctx.userId
    ? await db.select({ name: schema.users.name, email: schema.users.email }).from(schema.users).where(eq(schema.users.id, ctx.userId)).limit(1)
    : [];
  const responsavelNome = me?.name || me?.email || ctx.userEmail || "—";

  let id: string;
  try {
    const [closing] = await db
      .insert(schema.dailyClosings)
      .values({
        tenantId: ctx.tenant.id,
        projectId: null,
        dia: brDe(dia),
        saldoInicial: String(r.saldoInicial),
        totalEntradas: String(r.entradas),
        totalSaidas: String(r.saidas),
        ajustes: String(r.ajustes),
        saldoFinal: String(r.saldoFinal),
        saldoEmConta: r.saldoEmConta == null ? null : String(r.saldoEmConta),
        divergencias: String(r.divergencia),
        naturezas: r.naturezas,
        responsavelId: ctx.userId,
        responsavelNome,
        obs: (input.obs ?? "").trim() || null,
      })
      .returning({ id: schema.dailyClosings.id });
    id = closing.id;
  } catch (e) {
    if (violouUnico(e)) return { ok: false, error: "Este dia acabou de ser fechado por outra pessoa. Recarregue a tela." };
    throw e;
  }
  await logAudit({
    tenantId: ctx.tenant.id,
    userId: ctx.userId,
    action: "caixa.fechamento",
    entity: "daily_closing",
    entityId: id,
    meta: { ...r, dia: brDe(dia), diaISO: dia, autor: ctx.userEmail ?? ctx.userId ?? null },
  });
  revalidatePath("/caixa");
  revalidatePath("/balancodia");
  return { ok: true, id };
}

/** 9.5 — reabrir um dia fechado: operação própria, com motivo e auditoria. A linha fica, marcada. */
export async function reabrirDia(input: { id: string; motivo: string }): Promise<Resultado> {
  const ctx = await getTenantContext();
  if (!ctx || !can(ctx.perms, "conciliacao", "excluir")) {
    return { ok: false, error: "Reabrir o dia exige a permissão \"Conciliação — ajustar e desfazer: excluir\", que o seu usuário não tem." };
  }
  const motivo = (input.motivo ?? "").trim();
  if (!motivo) return { ok: false, error: "Informe o motivo da reabertura — ele fica na auditoria e no Balanço do Dia." };
  const [row] = await db.select().from(schema.dailyClosings).where(and(eq(schema.dailyClosings.id, input.id), eq(schema.dailyClosings.tenantId, ctx.tenant.id))).limit(1);
  if (!row) return { ok: false, error: "Fechamento não encontrado." };
  if (row.reabertoEm) return { ok: false, error: "Este fechamento já foi reaberto." };
  const por = ctx.userEmail ?? ctx.userId ?? null;
  await db.update(schema.dailyClosings).set({ reabertoEm: new Date(), reabertoPor: por, motivoReabertura: motivo }).where(eq(schema.dailyClosings.id, row.id));
  await logAudit({
    tenantId: ctx.tenant.id,
    userId: ctx.userId,
    action: "caixa.reabertura",
    entity: "daily_closing",
    entityId: row.id,
    meta: { dia: row.dia, motivo, saldoFinalGravado: row.saldoFinal, divergenciaGravada: row.divergencias, autor: por },
  });
  revalidatePath("/caixa");
  revalidatePath("/balancodia");
  return { ok: true, id: row.id };
}
