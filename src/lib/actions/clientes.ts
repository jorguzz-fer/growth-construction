"use server";

import { and, eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { db, schema } from "@/lib/db";
import { getActiveContext } from "@/lib/context";
import { can } from "@/lib/permissions";
import { logAudit } from "@/lib/audit";

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

export async function addCliente(formData: FormData) {
  const ctx = await getActiveContext();
  if (!ctx || !can(ctx.perms, "clientes", "criar")) {
    throw new Error("Sem permissão para cadastrar clientes.");
  }
  const [row] = await db
    .insert(schema.clientes)
    .values({ tenantId: ctx.tenant.id, ...readCliente(formData) })
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
  await db
    .update(schema.clientes)
    .set(readCliente(formData))
    .where(and(eq(schema.clientes.id, id), eq(schema.clientes.tenantId, ctx.tenant.id)));
  await logAudit({
    tenantId: ctx.tenant.id,
    userId: ctx.userId,
    action: "cliente.update",
    entity: "cliente",
    entityId: id,
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
