"use server";

import { and, eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { db, schema } from "@/lib/db";
import { getTenantContext } from "@/lib/context";
import { can } from "@/lib/permissions";
import { logAudit } from "@/lib/audit";
import { isR2Configured, putObject } from "@/lib/storage/r2";
import { LIMITE_UPLOAD_BYTES, LIMITE_UPLOAD_MB } from "@/lib/clientes-regras";
import {
  ehStatusEditavel,
  lerValor,
  motivoDeRecusa,
  valorRecebidoValido,
  type StatusDeContaReceber,
} from "@/lib/conta-receber-regras";

/** Resultado legível (Prompt K, CR-09): em produção, erro lançado vira digest sem texto. */
export type ResultadoContaReceber = { ok: true; id: string } | { ok: false; error: string };

const clean = (v: FormDataEntryValue | null | undefined) => {
  const s = typeof v === "string" ? v.trim() : "";
  return s ? s : null;
};
const falha = (error: string): ResultadoContaReceber => ({ ok: false, error });

/**
 * Cria uma conta a receber. Exige obra (validada contra a empresa), tipo da
 * lista, valor maior que zero e, para "Outras Receitas", a descrição.
 * Pode nascer vinculada a um item do extrato (origemCashEntryId).
 */
export async function createContaReceber(formData: FormData): Promise<ResultadoContaReceber> {
  const ctx = await getTenantContext();
  if (!ctx || !can(ctx.perms, "contasreceber", "criar")) return falha("Sem permissão para criar contas a receber.");
  const projectId = clean(formData.get("projectId")) ?? "";
  if (!projectId || !ctx.projects.some((p) => p.id === projectId)) return falha("Selecione um projeto para a conta a receber.");
  const tipo = clean(formData.get("tipo")) ?? "Outros";
  const descricao = clean(formData.get("descricao"));
  const valor = lerValor(formData.get("valor") as string);
  const motivo = motivoDeRecusa({ tipo, descricao, valor });
  if (motivo) return falha(motivo);
  const [row] = await db
    .insert(schema.contasReceber)
    .values({
      tenantId: ctx.tenant.id,
      projectId,
      unitCode: clean(formData.get("unitCode")),
      clienteId: clean(formData.get("clienteId")),
      descricao,
      tipo,
      valor: String(valor),
      vencimento: clean(formData.get("vencimento")),
      status: "A receber",
      bancoId: clean(formData.get("bancoId")),
      origemCashEntryId: clean(formData.get("origemCashEntryId")),
      createdBy: ctx.userEmail || ctx.userId || null,
    })
    .returning({ id: schema.contasReceber.id, valor: schema.contasReceber.valor });
  await logAudit({
    tenantId: ctx.tenant.id,
    userId: ctx.userId,
    action: "contaReceber.create",
    entity: "conta_receber",
    entityId: row.id,
    meta: { projectId, tipo, valor: row.valor },
  });
  revalidatePath("/contasreceber");
  return { ok: true, id: row.id };
}

/**
 * Edita uma conta a receber. Mesmas regras da criação para tipo, descrição e
 * valor (CR-04: antes a edição não validava nada); status só da lista; valor
 * recebido entre zero e o valor da conta.
 */
export async function updateContaReceber(formData: FormData): Promise<ResultadoContaReceber> {
  const ctx = await getTenantContext();
  if (!ctx || !can(ctx.perms, "contasreceber", "editar")) return falha("Sem permissão para editar contas a receber.");
  const id = clean(formData.get("id")) ?? "";
  if (!id) return falha("Conta não informada.");
  const tipo = clean(formData.get("tipo")) ?? "Outros";
  const descricao = clean(formData.get("descricao"));
  const valor = lerValor(formData.get("valor") as string);
  const motivo = motivoDeRecusa({ tipo, descricao, valor });
  if (motivo) return falha(motivo);
  const projectId = clean(formData.get("projectId")) ?? "";
  if (projectId && !ctx.projects.some((p) => p.id === projectId)) return falha("Projeto inválido.");
  const statusBruto = clean(formData.get("status")) ?? "A receber";
  if (!ehStatusEditavel(statusBruto)) return falha("Status inválido.");
  const status: StatusDeContaReceber = statusBruto;
  const recebidoTexto = formData.get("valorRecebido") as string | null;
  const valorRecebido = recebidoTexto && recebidoTexto.trim() ? lerValor(recebidoTexto) : 0;
  if (!valorRecebidoValido(valorRecebido, valor)) return falha("Valor recebido deve ficar entre zero e o valor da conta.");

  const set: Partial<typeof schema.contasReceber.$inferInsert> = {
    tipo,
    descricao,
    valor: String(valor),
    vencimento: clean(formData.get("vencimento")),
    unitCode: clean(formData.get("unitCode")),
    clienteId: clean(formData.get("clienteId")),
    bancoId: clean(formData.get("bancoId")),
    dataRecebimento: clean(formData.get("dataRecebimento")),
    valorRecebido: String(valorRecebido),
    status,
  };
  if (projectId) set.projectId = projectId;
  const [row] = await db
    .update(schema.contasReceber)
    .set(set)
    .where(and(eq(schema.contasReceber.id, id), eq(schema.contasReceber.tenantId, ctx.tenant.id), eq(schema.contasReceber.cancelado, false)))
    .returning({ id: schema.contasReceber.id });
  if (!row) return falha("Conta não encontrada ou já cancelada.");
  await logAudit({
    tenantId: ctx.tenant.id,
    userId: ctx.userId,
    action: "contaReceber.update",
    entity: "conta_receber",
    entityId: id,
    meta: { changes: set },
  });
  revalidatePath("/contasreceber");
  return { ok: true, id };
}

/** Cancelamento lógico (preserva histórico e a rastreabilidade). */
export async function cancelarContaReceber(formData: FormData): Promise<ResultadoContaReceber> {
  const ctx = await getTenantContext();
  if (!ctx || !can(ctx.perms, "contasreceber", "excluir")) return falha("Sem permissão para cancelar contas a receber.");
  const id = clean(formData.get("id")) ?? "";
  if (!id) return falha("Conta não informada.");
  const [row] = await db
    .update(schema.contasReceber)
    .set({ cancelado: true, status: "Cancelada" })
    .where(and(eq(schema.contasReceber.id, id), eq(schema.contasReceber.tenantId, ctx.tenant.id), eq(schema.contasReceber.cancelado, false)))
    .returning({ id: schema.contasReceber.id, valor: schema.contasReceber.valor });
  if (!row) return falha("Conta não encontrada ou já cancelada.");
  await logAudit({
    tenantId: ctx.tenant.id,
    userId: ctx.userId,
    action: "contaReceber.cancel",
    entity: "conta_receber",
    entityId: id,
    meta: { valor: row.valor },
  });
  revalidatePath("/contasreceber");
  return { ok: true, id };
}

// ── Documentos anexados (Prompt K, seção 6) ──────────────────────────────

export type ResultadoAnexo = { ok: true; added: number } | { ok: false; error: string };

/**
 * Anexa boleto, comprovante ou contrato a uma conta a receber — o mesmo
 * fluxo e o mesmo armazenamento (R2) dos anexos da despesa (6.2). Vários
 * arquivos por vez; nunca substitui nem remove os já existentes. A conta
 * precisa existir NESTA empresa; anexar é permitido em qualquer estado.
 */
export async function addContaReceberDocs(formData: FormData): Promise<ResultadoAnexo> {
  const ctx = await getTenantContext();
  if (!ctx || !can(ctx.perms, "contasreceber", "editar")) return { ok: false, error: "Sem permissão para anexar documentos." };
  if (!isR2Configured()) return { ok: false, error: "Storage (R2) não configurado — defina as variáveis R2_*." };
  const contaId = clean(formData.get("contaReceberId")) ?? "";
  if (!contaId) return { ok: false, error: "Conta não informada." };
  const [conta] = await db
    .select({ id: schema.contasReceber.id, projectId: schema.contasReceber.projectId })
    .from(schema.contasReceber)
    .where(and(eq(schema.contasReceber.id, contaId), eq(schema.contasReceber.tenantId, ctx.tenant.id)))
    .limit(1);
  if (!conta) return { ok: false, error: "Conta a receber não encontrada." };
  const files = formData.getAll("file").filter((f): f is File => f instanceof File && f.size > 0);
  if (files.length === 0) return { ok: false, error: "Selecione ao menos um arquivo." };
  for (const f of files) {
    if (f.size > LIMITE_UPLOAD_BYTES) return { ok: false, error: `"${f.name}" excede ${LIMITE_UPLOAD_MB} MB.` };
  }
  const tipo = clean(formData.get("tipo"));
  try {
    for (const file of files) {
      const safe = file.name.replace(/[^\w.\-]+/g, "_");
      const key = `tenants/${ctx.tenant.id}/docs/${Date.now()}_${Math.random().toString(36).slice(2, 8)}_${safe}`;
      await putObject(key, new Uint8Array(await file.arrayBuffer()), file.type || "application/octet-stream");
      await db.insert(schema.documents).values({
        tenantId: ctx.tenant.id,
        contaReceberId: conta.id,
        projectId: conta.projectId,
        storageKey: key,
        filename: file.name,
        contentType: file.type || null,
        size: file.size,
        tipo,
        uploadedBy: ctx.userEmail || ctx.userId || null,
      });
    }
  } catch (e) {
    console.error("[contasreceber] falha ao anexar documentos:", e);
    return { ok: false, error: e instanceof Error ? e.message : "Falha ao enviar os arquivos." };
  }
  await logAudit({
    tenantId: ctx.tenant.id,
    userId: ctx.userId,
    action: "document.upload",
    entity: "conta_receber",
    entityId: conta.id,
    meta: { arquivos: files.map((f) => f.name), qtd: files.length, tipo },
  });
  revalidatePath("/contasreceber");
  return { ok: true, added: files.length };
}

/**
 * Desvincula UM anexo da conta a receber. Só a linha de `document` sai; o
 * objeto NÃO é apagado do R2 (6.3 — limpeza de órfãos é tarefa própria), e a
 * auditoria guarda nome do arquivo e chave para o arquivo continuar
 * recuperável.
 */
export async function deleteContaReceberDoc(documentId: string): Promise<ResultadoContaReceber> {
  const ctx = await getTenantContext();
  if (!ctx || !can(ctx.perms, "contasreceber", "editar")) return falha("Sem permissão para remover anexos.");
  const [doc] = await db
    .select()
    .from(schema.documents)
    .where(and(eq(schema.documents.id, documentId), eq(schema.documents.tenantId, ctx.tenant.id)))
    .limit(1);
  if (!doc || !doc.contaReceberId) return falha("Anexo não encontrado.");
  await db.delete(schema.documents).where(and(eq(schema.documents.id, doc.id), eq(schema.documents.tenantId, ctx.tenant.id)));
  await logAudit({
    tenantId: ctx.tenant.id,
    userId: ctx.userId,
    action: "document.unlink",
    entity: "conta_receber",
    entityId: doc.contaReceberId,
    meta: { documentId: doc.id, filename: doc.filename, storageKey: doc.storageKey, tipo: doc.tipo },
  });
  revalidatePath("/contasreceber");
  return { ok: true, id: doc.id };
}
