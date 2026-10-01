"use server";

import { and, eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { db, schema } from "@/lib/db";
import { getTenantContext } from "@/lib/context";
import { can } from "@/lib/permissions";
import { logAudit } from "@/lib/audit";
import { diffAudit, houveMudanca } from "@/lib/audit-diff";
import { avisoDeCadastro, bloqueiosDeExclusaoDaConta, recusaDaConta, TIPOS_DE_CONTA, type TipoDeConta, type VinculosDaConta } from "@/lib/contas-regras";
import { vinculosDaConta } from "@/lib/conta-vinculos";

/**
 * Cadastro das contas bancárias que compõem o saldo de caixa da empresa
 * (Prompt X). Saldo com sócios e terceiros fica em Ressarcimentos. O saldo
 * pode ser lançado manualmente ou vir do extrato subido no Caixa; o Open
 * Finance (Prompt L) usa o mesmo campo quando conectado.
 *
 * Todas as actions devolvem `{ ok, error }` (5.3). Saldo é número de caixa:
 * toda alteração registra valor anterior e novo (4.3). Excluir verifica as
 * dez tabelas com FK e recusa dizendo qual vínculo impede (5.4); o caminho
 * com histórico é inativar (3.2).
 */

export type ResultadoConta = { ok: true; id: string; aviso?: string | null } | { ok: false; error: string };

const s = (fd: FormData, k: string) => ((fd.get(k) as string | null) ?? "").trim();
const tipoDe = (v: string): TipoDeConta => ((TIPOS_DE_CONTA as readonly string[]).includes(v) ? (v as TipoDeConta) : "Construtora");
const PAGINAS = ["/contas", "/caixa", "/fechamento", "/fluxocaixa"];

export async function addConta(formData: FormData): Promise<ResultadoConta> {
  const ctx = await getTenantContext();
  if (!ctx || !can(ctx.perms, "contas", "criar")) return { ok: false, error: "Sem permissão para cadastrar contas." };
  const banco = s(formData, "banco");
  const saldoTexto = s(formData, "saldo") || "0";
  const recusa = recusaDaConta({ banco, saldo: saldoTexto });
  if (recusa) return { ok: false, error: recusa };
  const ag = s(formData, "ag") || null;
  const cc = s(formData, "cc") || null;
  const [row] = await db
    .insert(schema.bankAccounts)
    .values({
      tenantId: ctx.tenant.id,
      banco,
      ag,
      op: s(formData, "op") || null,
      cc,
      tipo: tipoDe(s(formData, "tipo")),
      saldo: String(Number(saldoTexto.replace(",", "."))),
      saldoSource: s(formData, "saldoSource") === "auto" ? "auto" : "manual",
      openFinanceId: s(formData, "openFinanceId") || null,
    })
    .returning();
  const aviso = avisoDeCadastro({ ag, cc });
  await logAudit({
    tenantId: ctx.tenant.id,
    userId: ctx.userId,
    action: "conta.create",
    entity: "bank_account",
    entityId: row.id,
    meta: { banco: row.banco, ag: row.ag, cc: row.cc, tipo: row.tipo, saldo: row.saldo, saldoSource: row.saldoSource, aviso },
  });
  for (const p of PAGINAS) revalidatePath(p);
  return { ok: true, id: row.id, aviso };
}

export async function updateConta(
  id: string,
  patch: { banco?: string; ag?: string; op?: string; cc?: string; tipo?: string; saldo?: string; saldoSource?: string; openFinanceId?: string },
): Promise<ResultadoConta> {
  const ctx = await getTenantContext();
  if (!ctx || !can(ctx.perms, "contas", "editar")) return { ok: false, error: "Sem permissão para editar contas." };
  const [atual] = await db.select().from(schema.bankAccounts).where(and(eq(schema.bankAccounts.id, id), eq(schema.bankAccounts.tenantId, ctx.tenant.id)));
  if (!atual) return { ok: false, error: "Conta não encontrada." };
  const set: Partial<typeof schema.bankAccounts.$inferInsert> = {};
  if (patch.banco !== undefined) {
    if (!patch.banco.trim()) return { ok: false, error: "Informe o banco." };
    set.banco = patch.banco.trim();
  }
  if (patch.ag !== undefined) set.ag = patch.ag.trim() || null;
  if (patch.op !== undefined) set.op = patch.op.trim() || null;
  if (patch.cc !== undefined) set.cc = patch.cc.trim() || null;
  if (patch.tipo !== undefined) set.tipo = tipoDe(patch.tipo);
  if (patch.saldo !== undefined) {
    // 5.2 — negativo é aceito (conta no vermelho); texto e vazio, não.
    const recusa = recusaDaConta({ banco: atual.banco, saldo: patch.saldo });
    if (recusa) return { ok: false, error: recusa };
    set.saldo = String(Number(patch.saldo.trim().replace(",", ".")));
    set.lastSync = new Date();
  }
  if (patch.saldoSource === "auto" || patch.saldoSource === "manual") set.saldoSource = patch.saldoSource;
  if (patch.openFinanceId !== undefined) set.openFinanceId = patch.openFinanceId.trim() || null;
  if (Object.keys(set).length === 0) return { ok: true, id };
  const { lastSync: _ls, ...comparavel } = set;
  void _ls;
  const changes = diffAudit(atual as unknown as Record<string, unknown>, comparavel as Record<string, unknown>);
  await db.update(schema.bankAccounts).set(set).where(and(eq(schema.bankAccounts.id, id), eq(schema.bankAccounts.tenantId, ctx.tenant.id)));
  // 4.3 — saldo é número de caixa: anterior e novo ficam no log, campo a campo.
  if (houveMudanca(changes)) {
    await logAudit({ tenantId: ctx.tenant.id, userId: ctx.userId, action: "conta.update", entity: "bank_account", entityId: id, meta: { banco: atual.banco, changes } });
  }
  for (const p of PAGINAS) revalidatePath(p);
  return { ok: true, id, aviso: avisoDeCadastro({ ag: set.ag ?? atual.ag, cc: set.cc ?? atual.cc }) };
}

/** 3.2 — inativar preserva o registro (o histórico continua apontando para um nome) e tira do total. */
export async function setContaAtiva(id: string, ativo: boolean): Promise<ResultadoConta> {
  const ctx = await getTenantContext();
  if (!ctx || !can(ctx.perms, "contas", "editar")) return { ok: false, error: "Sem permissão para editar contas." };
  const [row] = await db
    .update(schema.bankAccounts)
    .set({ ativo })
    .where(and(eq(schema.bankAccounts.id, id), eq(schema.bankAccounts.tenantId, ctx.tenant.id)))
    .returning();
  if (!row) return { ok: false, error: "Conta não encontrada." };
  await logAudit({ tenantId: ctx.tenant.id, userId: ctx.userId, action: ativo ? "conta.reativar" : "conta.inativar", entity: "bank_account", entityId: id, meta: { banco: row.banco, cc: row.cc, saldo: row.saldo } });
  for (const p of PAGINAS) revalidatePath(p);
  return { ok: true, id };
}

/** BX-2 / 5.4 — o que impede a exclusão, para a tela mostrar antes. Só leitura. */
export async function inventarioDaConta(id: string): Promise<{ ok: true; vinculos: VinculosDaConta; bloqueios: string[] } | { ok: false; error: string }> {
  const ctx = await getTenantContext();
  if (!ctx || !can(ctx.perms, "contas", "ver")) return { ok: false, error: "Sem permissão." };
  const [row] = await db.select({ id: schema.bankAccounts.id }).from(schema.bankAccounts).where(and(eq(schema.bankAccounts.id, id), eq(schema.bankAccounts.tenantId, ctx.tenant.id)));
  if (!row) return { ok: false, error: "Conta não encontrada." };
  const vinculos = await vinculosDaConta(id);
  return { ok: true, vinculos, bloqueios: bloqueiosDeExclusaoDaConta(vinculos) };
}

/**
 * 5.4 — excluir só conta SEM nenhum vínculo nas dez tabelas. Com vínculo, a
 * recusa diz qual; o caminho é inativar. Antes, as FKs zeravam em silêncio e
 * o registro dependente perdia a informação de por onde o dinheiro passou.
 */
export async function deleteConta(id: string): Promise<ResultadoConta> {
  const ctx = await getTenantContext();
  if (!ctx || !can(ctx.perms, "contas", "excluir")) return { ok: false, error: "Sem permissão para excluir contas." };
  const [row] = await db.select().from(schema.bankAccounts).where(and(eq(schema.bankAccounts.id, id), eq(schema.bankAccounts.tenantId, ctx.tenant.id)));
  if (!row) return { ok: false, error: "Conta não encontrada." };
  const vinculos = await vinculosDaConta(id);
  const bloqueios = bloqueiosDeExclusaoDaConta(vinculos);
  if (bloqueios.length > 0) {
    return { ok: false, error: `A conta "${row.banco}${row.cc ? " · " + row.cc : ""}" tem ${bloqueios.join(", ")} vinculado(s): não pode ser excluída. Inative-a — o registro fica e sai do saldo total.` };
  }
  await db.delete(schema.bankAccounts).where(eq(schema.bankAccounts.id, id));
  await logAudit({ tenantId: ctx.tenant.id, userId: ctx.userId, action: "conta.delete", entity: "bank_account", entityId: id, meta: { banco: row.banco, ag: row.ag, cc: row.cc, tipo: row.tipo, saldo: row.saldo, vinculos } });
  for (const p of PAGINAS) revalidatePath(p);
  return { ok: true, id };
}
