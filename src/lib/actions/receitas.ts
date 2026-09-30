"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { db, schema } from "@/lib/db";
import { getProjectVersions, getTenantContext } from "@/lib/context";
import { can } from "@/lib/permissions";
import { excelSerial } from "@/lib/utils";
import { logAudit } from "@/lib/audit";

/**
 * Obra informada pelo formulário e a versão de trabalho dela (Prompt A): a
 * mesma regra que valia para a obra do cookie (Atual → padrão → mais antiga).
 * Só obra da empresa; sem ela, a gravação é recusada.
 */
async function obraDoFormulario(tenantId: string, formData: FormData) {
  const projectId = formData.get("projectId");
  const r =
    typeof projectId === "string" && projectId
      ? await getProjectVersions(tenantId, projectId)
      : null;
  if (!r || !r.trabalho) throw new Error("Escolha o projeto.");
  // Versão congelada bloqueia também aqui (decisão de 30/09/2026): a mesma
  // regra de todo lançamento. Antes, Liberações e Permuta passavam pela trava.
  if (r.trabalho.locked) throw new Error("Versão congelada — lançamentos bloqueados.");
  return { project: r.project, version: r.trabalho };
}

export async function addReembolso(formData: FormData) {
  const ctx = await getTenantContext();
  if (!ctx || !can(ctx.perms, "reembolso", "criar")) return;
  const { project, version } = await obraDoFormulario(ctx.tenant.id, formData);
  const data = (formData.get("data") as string) || null;
  const [lib] = await db.insert(schema.reembolsos).values({
    versionId: version.id,
    tenantId: ctx.tenant.id,
    data,
    origem: (formData.get("origem") as string) || null,
    valor: (formData.get("valor") as string) || "0",
    // "%" saiu da tela (BO-2, 30/09/2026): um único uso em produção. A coluna
    // fica no banco; o que já foi gravado não muda.
    pct: null,
    obs: (formData.get("obs") as string) || null,
    // SERIAL = INT(Data): calculado automaticamente a partir da data real.
    serial: excelSerial(data),
    status: "Recebido",
  }).returning();
  // AK Parte 1 — sem transação aqui (1.3).
  await logAudit({
    tenantId: ctx.tenant.id,
    userId: ctx.userId,
    action: "reembolso.create",
    entity: "reembolso",
    entityId: lib.id,
    meta: { projeto: project.name, versao: version.label, valor: lib.valor, data: lib.data },
  });
  revalidatePath("/reembolso");
  redirect(`/reembolso?proj=${project.id}`);
}

export async function addPermuta(formData: FormData) {
  const ctx = await getTenantContext();
  if (!ctx || !can(ctx.perms, "permuta", "criar")) return;
  const { project, version } = await obraDoFormulario(ctx.tenant.id, formData);
  const [perm] = await db.insert(schema.permutas).values({
    versionId: version.id,
    tenantId: ctx.tenant.id,
    unitCode: (formData.get("unitCode") as string) || null,
    cliente: (formData.get("cliente") as string) || null,
    dataRecebimento: (formData.get("dataRecebimento") as string) || null,
    tipo: (formData.get("tipo") as string) || null,
    descricao: (formData.get("descricao") as string) || null,
    estimado: (formData.get("estimado") as string) || "0",
    status: (formData.get("status") as string) || "Disponivel",
    dataVenda: (formData.get("dataVenda") as string) || null,
    valorVenda: (formData.get("valorVenda") as string) || "0",
    tipoPermuta: (formData.get("tipoPermuta") as string) || null,
    formaVenda: (formData.get("formaVenda") as string) || null,
    parcelas: formData.get("parcelas") ? Number(formData.get("parcelas")) : null,
    periodicidade: (formData.get("periodicidade") as string) || null,
    dataPrimParcela: (formData.get("dataPrimParcela") as string) || null,
    obs: (formData.get("obs") as string) || null,
  }).returning();
  // AK Parte 1 — sem transação aqui (1.3).
  await logAudit({
    tenantId: ctx.tenant.id,
    userId: ctx.userId,
    action: "permuta.create",
    entity: "permuta",
    entityId: perm.id,
    meta: {
      projeto: project.name,
      versao: version.label,
      unidade: perm.unitCode,
      tipo: perm.tipo,
      estimado: perm.estimado,
    },
  });
  revalidatePath("/permuta");
  revalidatePath("/fluxocaixa");
  revalidatePath("/dre");
  revalidatePath("/caixa");
  redirect(`/permuta?proj=${project.id}`);
}
