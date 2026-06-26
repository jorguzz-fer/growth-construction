"use server";

import { revalidatePath } from "next/cache";
import { db, schema } from "@/lib/db";
import { getActiveContext } from "@/lib/context";
import type { CategoriaDRE } from "@/lib/calc/constants";

export async function addStakeholder(formData: FormData) {
  const ctx = await getActiveContext();
  if (!ctx) return;
  const papeis = formData.getAll("papeis").map(String).filter(Boolean);
  await db.insert(schema.stakeholders).values({
    tenantId: ctx.tenant.id,
    nome: (formData.get("nome") as string) || "Sem nome",
    tipo: (formData.get("tipo") as "PJ" | "PF") || "PJ",
    doc: (formData.get("doc") as string) || null,
    papeis,
    email: (formData.get("email") as string) || null,
    tel: (formData.get("tel") as string) || null,
  });
  revalidatePath("/fornecedores");
}

export async function addBankAccount(formData: FormData) {
  const ctx = await getActiveContext();
  if (!ctx) return;
  await db.insert(schema.bankAccounts).values({
    tenantId: ctx.tenant.id,
    banco: (formData.get("banco") as string) || "Banco",
    ag: (formData.get("ag") as string) || null,
    op: (formData.get("op") as string) || null,
    cc: (formData.get("cc") as string) || null,
    tipo:
      (formData.get("tipo") as "Imobiliária" | "Construtora") || "Construtora",
  });
  revalidatePath("/fornecedores");
}

export async function addDespesa(formData: FormData) {
  const ctx = await getActiveContext();
  if (!ctx) return;
  await db.insert(schema.despesas).values({
    versionId: ctx.version.id,
    tenantId: ctx.tenant.id,
    fornecedorId: (formData.get("fornecedorId") as string) || null,
    bancoId: (formData.get("bancoId") as string) || null,
    contaCef: (formData.get("contaCef") as string) || null,
    categoriaDre: (formData.get("categoriaDre") as CategoriaDRE) || null,
    competencia: (formData.get("competencia") as string) || null,
    vencimento: (formData.get("vencimento") as string) || null,
    valor: (formData.get("valor") as string) || "0",
    status: (formData.get("status") as string) || "A pagar",
  });
  revalidatePath("/despesas");
}
