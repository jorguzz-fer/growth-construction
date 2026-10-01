"use server";

import { and, eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { db, schema } from "@/lib/db";
import { getTenantContext } from "@/lib/context";
import { can } from "@/lib/permissions";
import { logAudit } from "@/lib/audit";
import { isR2Configured, putObject } from "@/lib/storage/r2";
import { LIMITE_UPLOAD_BYTES, LIMITE_UPLOAD_MB } from "@/lib/clientes-regras";
import { podeTocarMedicao, TELA_LANCAMENTO } from "@/lib/medicao-regras";
import { proximaVersao, tipoDeDocValido } from "@/lib/medicao-docs-regras";

/**
 * Documentos da medição (Prompt V, seção 5): laudo, relatório fotográfico,
 * PLS, ART/RRT. Reusa `document` com `medicao_id` (0064). Versão por TIPO
 * dentro da medição (5.4). Remover desfaz o vínculo, não apaga o arquivo
 * (5.5). Quem só vê as próprias só anexa nas próprias (0.5.5).
 */
export type ResultadoDocMedicao = { ok: true; id?: string; versao?: number } | { ok: false; error: string };

const SEM_SESSAO = "Sessão expirada. Entre de novo.";

async function medicaoDoUsuario(id: string) {
  const ctx = await getTenantContext();
  if (!ctx) return { ok: false as const, error: SEM_SESSAO };
  if (!can(ctx.perms, TELA_LANCAMENTO, "editar")) return { ok: false as const, error: "Sem permissão para anexar documentos à medição." };
  const [row] = await db
    .select({ m: schema.medicoes, projectId: schema.versions.projectId })
    .from(schema.medicoes)
    .innerJoin(schema.versions, eq(schema.medicoes.versionId, schema.versions.id))
    .where(and(eq(schema.medicoes.id, id), eq(schema.medicoes.tenantId, ctx.tenant.id), eq(schema.versions.tenantId, ctx.tenant.id)))
    .limit(1);
  if (!row || !ctx.projects.some((p) => p.id === row.projectId)) return { ok: false as const, error: "Medição não encontrada." };
  if (!podeTocarMedicao(row.m, { userId: ctx.userId, role: ctx.role })) return { ok: false as const, error: "Esta medição foi lançada por outro usuário: só o autor (ou quem vê todas) pode anexar documentos." };
  return { ok: true as const, ctx, medicao: row.m, projectId: row.projectId };
}

export async function uploadMedicaoDoc(formData: FormData): Promise<ResultadoDocMedicao> {
  const medicaoId = ((formData.get("medicaoId") as string) || "").trim();
  if (!medicaoId) return { ok: false, error: "Medição não informada." };
  const r = await medicaoDoUsuario(medicaoId);
  if (!r.ok) return r;
  const { ctx, medicao, projectId } = r;
  if (!isR2Configured()) return { ok: false, error: "Storage (R2) não configurado — defina as variáveis R2_*." };
  const tipo = ((formData.get("tipo") as string) || "").trim();
  if (!tipoDeDocValido(tipo)) return { ok: false, error: "Escolha o tipo do documento (laudo, relatório fotográfico, PLS, ART/RRT ou outros)." };
  const file = formData.get("file");
  if (!(file instanceof File) || file.size === 0) return { ok: false, error: "Selecione um arquivo." };
  // Limite unificado (PADRAO-VISUAL / Prompt M, 6.9.4).
  if (file.size > LIMITE_UPLOAD_BYTES) return { ok: false, error: `Arquivo deve ter até ${LIMITE_UPLOAD_MB} MB.` };

  // 5.4 — versão por tipo, nesta medição.
  const existentes = await db
    .select({ tipo: schema.documents.tipo, versao: schema.documents.versao })
    .from(schema.documents)
    .where(and(eq(schema.documents.tenantId, ctx.tenant.id), eq(schema.documents.medicaoId, medicao.id)));
  const versao = proximaVersao(existentes, tipo);

  const safe = file.name.replace(/[^\w.\-]+/g, "_");
  const key = `tenants/${ctx.tenant.id}/medicao/${medicao.id}/${Date.now()}_${safe}`;
  try {
    await putObject(key, new Uint8Array(await file.arrayBuffer()), file.type || "application/octet-stream");
  } catch (e) {
    console.error("[medicao] falha ao enviar o arquivo:", e);
    return { ok: false, error: e instanceof Error ? e.message : "Falha ao enviar o arquivo." };
  }
  const [doc] = await db
    .insert(schema.documents)
    .values({ tenantId: ctx.tenant.id, medicaoId: medicao.id, projectId, storageKey: key, filename: file.name, contentType: file.type || null, size: file.size, tipo, versao, uploadedBy: ctx.userEmail || ctx.userId || null })
    .returning({ id: schema.documents.id });
  await logAudit({
    tenantId: ctx.tenant.id,
    userId: ctx.userId,
    action: "medicao.doc.upload",
    entity: "medicao",
    entityId: medicao.id,
    meta: { documentId: doc.id, filename: file.name, tipo, versao, storageKey: key, competencia: medicao.competencia, grupoCode: medicao.grupoCode },
  });
  revalidatePath("/medicaolanc");
  revalidatePath("/medicao");
  return { ok: true, id: doc.id, versao };
}

/** 5.5 — desfaz o vínculo documento → medição. O registro e o arquivo ficam; a auditoria guarda nome e chave. */
export async function unlinkMedicaoDoc(documentId: string): Promise<ResultadoDocMedicao> {
  const ctx = await getTenantContext();
  if (!ctx) return { ok: false, error: SEM_SESSAO };
  const [doc] = await db
    .select({ id: schema.documents.id, medicaoId: schema.documents.medicaoId, filename: schema.documents.filename, storageKey: schema.documents.storageKey, tipo: schema.documents.tipo, versao: schema.documents.versao })
    .from(schema.documents)
    .where(and(eq(schema.documents.id, documentId), eq(schema.documents.tenantId, ctx.tenant.id)))
    .limit(1);
  if (!doc || !doc.medicaoId) return { ok: false, error: "Documento não encontrado nesta medição." };
  const r = await medicaoDoUsuario(doc.medicaoId);
  if (!r.ok) return r;
  await db.update(schema.documents).set({ medicaoId: null }).where(and(eq(schema.documents.id, doc.id), eq(schema.documents.tenantId, ctx.tenant.id)));
  await logAudit({
    tenantId: ctx.tenant.id,
    userId: ctx.userId,
    action: "medicao.doc.unlink",
    entity: "medicao",
    entityId: doc.medicaoId,
    meta: { documentId: doc.id, filename: doc.filename, storageKey: doc.storageKey, tipo: doc.tipo, versao: doc.versao },
  });
  revalidatePath("/medicaolanc");
  revalidatePath("/medicao");
  return { ok: true, id: doc.id };
}
