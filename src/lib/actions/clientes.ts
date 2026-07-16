"use server";

import { and, desc, eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { db, schema } from "@/lib/db";
import { getActiveContext } from "@/lib/context";
import { can } from "@/lib/permissions";
import { logAudit } from "@/lib/audit";
import { isR2Configured, putObject } from "@/lib/storage/r2";

const s = (fd: FormData, k: string) => {
  const v = (fd.get(k) as string) ?? "";
  return v.trim() ? v.trim() : null;
};
const num = (fd: FormData, k: string) => {
  const v = s(fd, k);
  if (v == null) return null;
  const n = Number(v.replace(/\./g, "").replace(",", "."));
  return Number.isFinite(n) ? String(n) : null;
};
const int = (fd: FormData, k: string) => {
  const v = s(fd, k);
  if (v == null) return null;
  const n = parseInt(v, 10);
  return Number.isFinite(n) ? n : null;
};

function readCliente(fd: FormData) {
  return {
    unitCode: s(fd, "unitCode"),
    statusContrato: s(fd, "statusContrato"),
    nomeCompleto: s(fd, "nomeCompleto") ?? "Sem nome",
    cpfCnpj: s(fd, "cpfCnpj"),
    nascimento: s(fd, "nascimento"),
    nacionalidade: s(fd, "nacionalidade"),
    estadoCivil: s(fd, "estadoCivil"),
    endereco: s(fd, "endereco"),
    cidadeEstado: s(fd, "cidadeEstado"),
    cep: s(fd, "cep"),
    emailPrincipal: s(fd, "emailPrincipal"),
    emailSecundario: s(fd, "emailSecundario"),
    celular: s(fd, "celular"),
    telefone: s(fd, "telefone"),
    bancoFinanc: s(fd, "bancoFinanc"),
    rendaBruta: num(fd, "rendaBruta"),
    rendaLiquida: num(fd, "rendaLiquida"),
    comprometimento: s(fd, "comprometimento"),
    possuiFgts: s(fd, "possuiFgts"),
    saldoFgts: num(fd, "saldoFgts"),
    scoreCredito: int(fd, "scoreCredito"),
    restricoes: s(fd, "restricoes"),
    morarOuInvestir: s(fd, "morarOuInvestir"),
    ramoAtividade: s(fd, "ramoAtividade"),
    cargoFuncao: s(fd, "cargoFuncao"),
    areaAtuacao: s(fd, "areaAtuacao"),
    empresa: s(fd, "empresa"),
    regimeTrabalho: s(fd, "regimeTrabalho"),
    localTrabalho: s(fd, "localTrabalho"),
    tempoEmpresa: s(fd, "tempoEmpresa"),
    possuiImovel: s(fd, "possuiImovel"),
    motivacaoCompra: s(fd, "motivacaoCompra"),
    comoConheceu: s(fd, "comoConheceu"),
    indicadoPor: s(fd, "indicadoPor"),
    interesse: int(fd, "interesse"),
    obsEstrategicas: s(fd, "obsEstrategicas"),
  };
}

/** Status de contrato que liberam a unidade (não bloqueiam novo vínculo). */
const STATUS_LIBERA = ["Distratado", "Distrato", "Cancelado", "Cancelada"];

/**
 * Impede vincular uma unidade já vinculada a OUTRO cliente com contrato ativo
 * (uma unidade vendida não pode ser vendida de novo). Retorna o nome do cliente
 * conflitante, ou null se disponível.
 */
async function unidadeEmConflito(
  tenantId: string,
  unitCode: string | null,
  exceptId?: string,
): Promise<string | null> {
  if (!unitCode) return null;
  const rows = await db
    .select({
      id: schema.clientes.id,
      nome: schema.clientes.nomeCompleto,
      status: schema.clientes.statusContrato,
    })
    .from(schema.clientes)
    .where(and(eq(schema.clientes.tenantId, tenantId), eq(schema.clientes.unitCode, unitCode)));
  const conflito = rows.find(
    (r) => r.id !== exceptId && !STATUS_LIBERA.includes((r.status ?? "").trim()),
  );
  return conflito?.nome ?? null;
}

export async function addCliente(formData: FormData) {
  const ctx = await getActiveContext();
  if (!ctx || !can(ctx.perms, "clientes", "criar")) {
    throw new Error("Sem permissão para cadastrar clientes.");
  }
  const dados = readCliente(formData);
  const conflito = await unidadeEmConflito(ctx.tenant.id, dados.unitCode);
  if (conflito) {
    throw new Error(
      `A unidade ${dados.unitCode} já está vinculada ao cliente "${conflito}". Distrate o contrato atual antes de revincular.`,
    );
  }
  const [row] = await db
    .insert(schema.clientes)
    .values({ tenantId: ctx.tenant.id, ...dados })
    .returning();
  await logAudit({
    tenantId: ctx.tenant.id,
    userId: ctx.userId,
    action: "cliente.create",
    entity: "cliente",
    entityId: row.id,
    meta: { nome: row.nomeCompleto, unitCode: row.unitCode },
  });
  revalidatePath("/clientes");
  redirect("/clientes");
}

export async function updateCliente(formData: FormData) {
  const ctx = await getActiveContext();
  if (!ctx || !can(ctx.perms, "clientes", "editar")) {
    throw new Error("Sem permissão para editar clientes.");
  }
  const id = formData.get("id") as string;
  if (!id) return;
  const [antes] = await db
    .select()
    .from(schema.clientes)
    .where(and(eq(schema.clientes.id, id), eq(schema.clientes.tenantId, ctx.tenant.id)))
    .limit(1);
  const novo = readCliente(formData);
  const conflito = await unidadeEmConflito(ctx.tenant.id, novo.unitCode, id);
  if (conflito) {
    throw new Error(
      `A unidade ${novo.unitCode} já está vinculada ao cliente "${conflito}". Distrate o contrato atual antes de revincular.`,
    );
  }
  await db
    .update(schema.clientes)
    .set(novo)
    .where(and(eq(schema.clientes.id, id), eq(schema.clientes.tenantId, ctx.tenant.id)));
  // Auditoria campo a campo: valor anterior × novo.
  const changes: Record<string, { de: unknown; para: unknown }> = {};
  if (antes) {
    for (const k of Object.keys(novo)) {
      const de = (antes as Record<string, unknown>)[k];
      const para = (novo as Record<string, unknown>)[k];
      if (String(de ?? "") !== String(para ?? "")) changes[k] = { de: de ?? null, para: para ?? null };
    }
  }
  await logAudit({
    tenantId: ctx.tenant.id,
    userId: ctx.userId,
    action: "cliente.update",
    entity: "cliente",
    entityId: id,
    meta: { changes },
  });
  revalidatePath("/clientes");
  redirect("/clientes");
}

export async function deleteCliente(formData: FormData) {
  const ctx = await getActiveContext();
  if (!ctx || !can(ctx.perms, "clientes", "excluir")) return;
  const id = formData.get("id") as string;
  if (!id) return;
  await db
    .delete(schema.clientes)
    .where(and(eq(schema.clientes.id, id), eq(schema.clientes.tenantId, ctx.tenant.id)));
  await logAudit({
    tenantId: ctx.tenant.id,
    userId: ctx.userId,
    action: "cliente.delete",
    entity: "cliente",
    entityId: id,
  });
  revalidatePath("/clientes");
  redirect("/clientes");
}

/**
 * Anexa um documento de venda/contrato a um cliente (e, opcionalmente, à
 * unidade/projeto). Ao substituir um documento do mesmo tipo, a versão anterior
 * é preservada (histórico) e a nova recebe versao = maior + 1.
 */
export async function uploadClienteDoc(formData: FormData) {
  const ctx = await getActiveContext();
  if (!ctx || !can(ctx.perms, "clientes", "editar")) {
    throw new Error("Sem permissão para anexar documentos.");
  }
  if (!isR2Configured()) {
    throw new Error("Storage (R2) não configurado — defina as variáveis R2_*.");
  }
  const clienteId = (formData.get("clienteId") as string) || "";
  if (!clienteId) throw new Error("Cliente inválido.");
  const [cli] = await db
    .select({ id: schema.clientes.id, unitCode: schema.clientes.unitCode })
    .from(schema.clientes)
    .where(and(eq(schema.clientes.id, clienteId), eq(schema.clientes.tenantId, ctx.tenant.id)))
    .limit(1);
  if (!cli) throw new Error("Cliente não encontrado.");

  const file = formData.get("file") as File | null;
  if (!file || file.size === 0) throw new Error("Selecione um arquivo.");
  if (file.size > 15 * 1024 * 1024) throw new Error("Arquivo deve ter até 15 MB.");
  const tipo = ((formData.get("tipo") as string) || "").trim() || null;

  // Versão: maior versão existente do mesmo cliente + tipo, + 1 (histórico).
  const anteriores = await db
    .select({ versao: schema.documents.versao })
    .from(schema.documents)
    .where(and(eq(schema.documents.clienteId, clienteId), eq(schema.documents.tenantId, ctx.tenant.id)))
    .orderBy(desc(schema.documents.versao))
    .limit(1);
  const versao = (anteriores[0]?.versao ?? 0) + 1;

  const safe = file.name.replace(/[^\w.\-]+/g, "_");
  const key = `tenants/${ctx.tenant.id}/vendas/${Date.now()}_${safe}`;
  await putObject(key, new Uint8Array(await file.arrayBuffer()), file.type || "application/octet-stream");

  await db.insert(schema.documents).values({
    tenantId: ctx.tenant.id,
    clienteId,
    unitCode: (formData.get("unitCode") as string) || cli.unitCode || null,
    projectId: (formData.get("projectId") as string) || null,
    storageKey: key,
    filename: file.name,
    contentType: file.type || null,
    size: file.size,
    tipo,
    versao,
    uploadedBy: ctx.userEmail || ctx.userId || null,
  });
  await logAudit({
    tenantId: ctx.tenant.id,
    userId: ctx.userId,
    action: "cliente.doc.upload",
    entity: "document",
    entityId: clienteId,
    meta: { filename: file.name, tipo, versao },
  });
  revalidatePath(`/clientes/${clienteId}`);
}
