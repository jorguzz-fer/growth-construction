"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { db, schema } from "@/lib/db";
import { getProjectVersions, getTenantContext } from "@/lib/context";
import { can } from "@/lib/permissions";
import { excelSerial } from "@/lib/utils";
import { logAudit } from "@/lib/audit";
import { lerValorDoAtivo, motivoDeRecusaDoAtivo } from "@/lib/permuta-regras";

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

export type ResultadoPermuta = { ok: true; id: string } | { ok: false; error: string };

const texto = (v: FormDataEntryValue | null) => (typeof v === "string" ? v.trim() : "") || null;

/**
 * Cadastra um ativo recebido em permuta (Prompt P, 3.1/3.2). Devolve
 * `{ ok, error }` com mensagem legível — sem permissão, sem obra, versão
 * congelada e cadastro incompleto são erros que a tela mostra, nunca um
 * `return` mudo nem um digest de produção. Nenhum campo vira "0" por omissão.
 */
export async function addPermuta(formData: FormData): Promise<ResultadoPermuta> {
  const ctx = await getTenantContext();
  if (!ctx) return { ok: false, error: "Sessão expirada. Entre de novo." };
  if (!can(ctx.perms, "permuta", "criar")) return { ok: false, error: "Sem permissão para cadastrar ativos de permuta." };
  let obra: Awaited<ReturnType<typeof obraDoFormulario>>;
  try {
    obra = await obraDoFormulario(ctx.tenant.id, formData);
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "Escolha o projeto." };
  }
  const { project, version } = obra;
  const campos = {
    unitCode: texto(formData.get("unitCode")),
    cliente: texto(formData.get("cliente")),
    dataRecebimento: texto(formData.get("dataRecebimento")),
    tipo: texto(formData.get("tipo")),
    descricao: texto(formData.get("descricao")),
    estimado: texto(formData.get("estimado")),
    status: texto(formData.get("status")) ?? "Disponivel",
    dataVenda: texto(formData.get("dataVenda")),
    valorVenda: texto(formData.get("valorVenda")),
    tipoPermuta: texto(formData.get("tipoPermuta")),
    formaVenda: texto(formData.get("formaVenda")),
    parcelas: texto(formData.get("parcelas")),
    periodicidade: texto(formData.get("periodicidade")),
    dataPrimParcela: texto(formData.get("dataPrimParcela")),
    obs: texto(formData.get("obs")),
  };
  const motivo = motivoDeRecusaDoAtivo(campos);
  if (motivo) return { ok: false, error: motivo };
  const estimado = lerValorDoAtivo(campos.estimado);
  const valorVenda = campos.valorVenda ? lerValorDoAtivo(campos.valorVenda) : 0;
  const [perm] = await db.insert(schema.permutas).values({
    versionId: version.id,
    tenantId: ctx.tenant.id,
    unitCode: campos.unitCode,
    cliente: campos.cliente,
    dataRecebimento: campos.dataRecebimento,
    tipo: campos.tipo,
    descricao: campos.descricao,
    estimado: estimado.toFixed(2),
    status: campos.status,
    dataVenda: campos.dataVenda,
    valorVenda: valorVenda.toFixed(2),
    tipoPermuta: campos.tipoPermuta,
    formaVenda: campos.formaVenda,
    parcelas: campos.parcelas ? Number(campos.parcelas) : null,
    periodicidade: campos.periodicidade,
    dataPrimParcela: campos.dataPrimParcela,
    obs: campos.obs,
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
  return { ok: true, id: perm.id };
}
