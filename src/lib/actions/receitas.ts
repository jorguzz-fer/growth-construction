"use server";

import { revalidatePath } from "next/cache";
import { db, schema } from "@/lib/db";
import { getActiveContext } from "@/lib/context";

export async function addReembolso(formData: FormData) {
  const ctx = await getActiveContext();
  if (!ctx) return;
  await db.insert(schema.reembolsos).values({
    versionId: ctx.version.id,
    tenantId: ctx.tenant.id,
    data: (formData.get("data") as string) || null,
    origem: (formData.get("origem") as string) || null,
    valor: (formData.get("valor") as string) || "0",
    pct: (formData.get("pct") as string) || null,
    obs: (formData.get("obs") as string) || null,
    serial: Math.floor(10000 + Math.random() * 89999),
    status: "received",
  });
  revalidatePath("/reembolso");
}

export async function addPermuta(formData: FormData) {
  const ctx = await getActiveContext();
  if (!ctx) return;
  await db.insert(schema.permutas).values({
    versionId: ctx.version.id,
    tenantId: ctx.tenant.id,
    unitCode: (formData.get("unitCode") as string) || null,
    cliente: (formData.get("cliente") as string) || null,
    tipo: (formData.get("tipo") as string) || null,
    descricao: (formData.get("descricao") as string) || null,
    estimado: (formData.get("estimado") as string) || "0",
    status: (formData.get("status") as string) || "Disponivel",
    dataVenda: (formData.get("dataVenda") as string) || null,
    valorVenda: (formData.get("valorVenda") as string) || "0",
  });
  revalidatePath("/permuta");
}
